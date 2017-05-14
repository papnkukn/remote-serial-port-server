module.exports = function(config) {
  var url = require('url');
  var WebSocket = require('ws');
  var SerialPort = require("serialport");
  var semaphore = require("semaphore");
  
  if (!config) {
    config = { };
  }
  
  if (!config.spm) {
    //Serial port manager
    config.spm = { };
  }
  
  //Helper functions
  var util = require("./util.js");
  util.setConfig(config);
  util.addEventEmitter(config.spm);
  var getPortName = util.getPortName;
  var isPortAllowed = util.isPortAllowed;
  var verbose = util.verbose;
  var spm = config.spm;

  function use(server) {
    wss = new WebSocket.Server({ server });
    wss.on('connection', function connection(ws) {
      try {
        //Parse request URL
        var u = url.parse(ws.upgradeReq.url, true);
        //u.query.access_token
        //u.path = /api/v1/port/COM1
        verbose("WebSocket connected " + u.path);
        
        var match = /\/port\/([\w\d\-\._]+)(\/(\w+))?$/gi.exec(u.path);
        if (!match) {
          throw new Error("Expected /api/v1/port/:name/:line");
        }
        
        var line = match[3];
        if (line != "data" && line != "control") {
          throw new Error("Only 'data' and 'control' lines allowed!");
        }
        
        var name = getPortName(match[1]);
        if (!isPortAllowed(name)) {
          throw new Error("Access to serial port denied!");
        }
        
        var port = spm[name];
        if (!port) {
          port = { };
          port.serialport = new SerialPort(name, { autoOpen: false });
        }
        
        if (line == "data") {
          //Handle data from the client
          ws.on('message', function incoming(message) {
            try {
              if (!port || !port.serialport.isOpen()) {
                throw new Error("Serial port not open: " + name);
              }
              if (!config.permissions.write) {
                throw new Error("No write permissions!");
              }
              var buffer = new Buffer(message);
              var length = buffer.length;
              port.sem_write.take(function() {
                //config.spm.emit("write", buffer);
                port.serialport.write(buffer, function (err) {
                  port.sem_write.leave();
                  if (err) return verbose("Serial port write error: " + err.message);
                });
              });
            }
            catch (error) {
              verbose("WebSocket write error: " + error.message);
            }
          });
          
          //Add the connection for the port name
          if (!port.websockets) {
            port.websockets = [ ];
          }
          port.websockets.push(ws);
        }
        else if (line == "control") {
          //Handle data from the client
          ws.on('message', function incoming(message) {
            try {
              console.log(message);
              var buffer = new Buffer(message);
              var length = buffer.length;
              var req = JSON.parse(message);
              if (req.event == "open") {
                console.log("Open port " + port);
                //req.data;
                return;
              }
              throw new Error("Not implemented: " + req.event);
            }
            catch (error) {
              verbose("WebSocket write error: " + error.message);
            }
          });
          
          //Add the connection for the port name
          if (!port.wsc) {
            port.wsc = [ ];
          }
          port.wsc.push(ws);
        }
      }
      catch (error) {
        verbose("WebSocket error: " + error.message);
      }
    });
    
    return wss;
  }
  
  //Return object
  return {
    config: config,
    use: use
  };
}