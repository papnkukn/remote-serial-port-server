module.exports = function(config) {
  var express = require('express');
  var bodyParser = require('body-parser');
  var SerialPort = require("serialport");
  var semaphore = require("semaphore");
  
  if (!config) {
    //throw new Error("Argument is missing!");
    config = { };
  }
  
  if (!config.spm) {
    //Serial port manager
    config.spm = {
      /*
      "COMx": {
        serialport: { ... }, //SerialPort instance
        config: { ... }, //Baud, parity, etc.
        rxcapacity: 1024,
        rxbuffer: new Buffer(1024),
        rxindex: 0,
        websockets: [
          { ... } //WebSocket instance, a connected client
        ]
      }
      "/dev/ttyUSBx": { ... }
      */
    };
  }
  
  if (!config.permissions) {
    config.permissions = {
      list: true,
      read: true,
      write: true
    };
  }
  
  //Helper functions
  var util = require("./util.js");
  util.setConfig(config);
  util.addEventEmitter(config.spm);
  var getPortName = util.getPortName;
  var isPortAllowed = util.isPortAllowed;
  var verbose = util.verbose;
  
  var app = express();
  app.use(bodyParser.json());
  app.use(bodyParser.raw({ type: '*/*' }));
  
  //Extend app
  var spm = app.spm = config.spm;

  //List available serial ports
  app.get("/port", function(req, res, next) {
    if (!config.permissions.list) {
      return next(new Error("No serial port listing permissions!"));
    }
    
    SerialPort.list(function (err, ports) {
      if (err) return next(err);
      var list = [ ];
      ports.forEach(function(p) {
        if (!isPortAllowed(p.comName)) {
          return;
        }
      
        try {
          //Check if open
          var sp = new SerialPort(p.comName, { autoOpen: false });
          p.status = sp.isOpen() || spm[p.comName] ? "open" : "closed";
          
          //Get configuration if open
          var port = spm[p.comName];
          if (port && port.config) {
            p.config = port.config;
          }
        }
        catch (e) {
          p.error = e.message;
          verbose(p.comName + " " + e.message);
        }
        
        list.push(p);
      });
      res.json(list);
    });
  });

  //Get a specific port status
  app.get("/port/:name", function(req, res, next) {
    var name = getPortName(req.params.name);
    
    if (!isPortAllowed(name)) {
      return next(new Error("Access to serial port denied!"));
    }
    
    SerialPort.list(function (err, ports) {
      if (err) return next(err);
      var result = null;
      ports.forEach(function(p) {
        if (p.comName == name) {
          result = p;
          try {
            //Check if open
            var sp = new SerialPort(p.comName, { autoOpen: false });
            p.status = sp.isOpen() ? "open" : "closed";
            
            //Get configuration if open
            var port = spm[p.comName];
            if (port && port.config) {
              p.config = port.config;
            }
          }
          catch (e) {
            p.error = e.message;
            verbose(p.comName + " " + e.message);
          }
        }
      });
      if (!result) {
        return next(new Error("Serial port not found: " + name));
      }
      res.json(result);
    });
  });

  //Opens a serial port
  app.post("/port/:name/open", function(req, res, next) {
    try {
      var name = getPortName(req.params.name);
      if (!isPortAllowed(name)) {
        return next(new Error("Access to serial port denied!"));
      }
      
      var options = req.body || { };
      options.autoOpen = false;
      
      var sp = new SerialPort(name, options);
      sp.open(function (err) {
        if (err) return next(new Error("Error opening serial port: ", err.message));
      });
      sp.on('open', function() {
        var port = { };
        port.serialport = sp;
        port.config = options;
        port.rxcapacity = 65535;
        port.rxoverflow = false;
        port.rxbuffer = new Buffer(port.rxcapacity);
        port.rxindex = 0;
        port.sem_write = semaphore(1);
        port.sem_read = semaphore(1);
        spm[name] = port;
        verbose(name + " ready");
        res.json({ name: name, status: "open" });
      });
      sp.on('data', function (data) {
        try {
          var port = spm[name];
          
          //verbose(name + " incoming: " + data.toString('hex'));
          verbose(name + " incoming " + data.length + " bytes");
          
          port.sem_read.take(function() {
            //Append data to the rxbuffer
            var position = port.rxindex;
            var overflow = position >= port.rxcapacity;
            if (!overflow) {
              var available = port.rxcapacity - position;
              var length = data.length;
              overflow = length > available;
              verbose(name + " available: " + available + ", length: " + length + ", rxindex: " + port.rxindex);
              length = overflow ? available : length;
              data.copy(port.rxbuffer, position, 0, length);
              port.rxindex += length;
            }
            port.rxoverflow = overflow;
            
            port.sem_read.leave();
            
            //Send to all connected clients
            spm.emit("received", { port: name, data: data });
          });
        }
        catch (e) {
          verbose(name + " on data received: " + e.message);
        }
      });
    }
    catch (e) {
      next(e);
    }
  });

  //Closes the serial port
  app.post("/port/:name/close", function(req, res, next) {
    try {
      var name = getPortName(req.params.name);
      if (!isPortAllowed(name)) {
        return next(new Error("Access to serial port denied!"));
      }
      
      var port = spm[name];
      if (!port) {
        return next(new Error("Serial port is not open!"));
      }
      port.serialport.close(function (err) {
        if (err) return next(new Error("Error closing serial port: ", err.message));
        res.json({ name: name, status: "closed" });
      });
      delete spm[name];
    }
    catch (e) {
      next(e);
    }
  });

  //Writes data to a serial port
  app.post("/port/:name/write", function(req, res, next) {
    try {
      var name = getPortName(req.params.name);
      if (!isPortAllowed(name)) {
        return next(new Error("Access to serial port denied!"));
      }
      
      var port = spm[name];
      if (!port) {
        return next(new Error("Serial port is not open!"));
      }
      
      if (!config.permissions.write) {
        throw new Error("No write permissions!");
      }
      
      var buffer = req.body || new Buffer(0);
      var length = buffer.length;
      
      port.sem_write.take(function() {
        verbose(name + " write: " + req.body);
        port.serialport.write(buffer, function (err) {
          port.sem_write.leave();
          if (err) return next(new Error("Error writing data: ", err.message));
          res.json({ name: name, length: length });
        });
      });
    }
    catch (e) {
      next(e);
    }
  });

  //Reads data from a serial port
  app.get("/port/:name/read", function(req, res, next) {
    try {
      var name = getPortName(req.params.name);
      if (!isPortAllowed(name)) {
        return next(new Error("Access to serial port denied!"));
      }
      
      var port = spm[name];
      if (!port) {
        return next(new Error("Serial port is not open!"));
      }
      
      if (!config.permissions.read) {
        throw new Error("No read permissions!");
      }
      
      port.sem_read.take(function() {
        //Optional 'take' query string defined number of bytes to read
        var take = req.query.take || port.rxcapacity;
        if (take > port.rxindex) {
          take = port.rxindex;
        }
        
        //Send just the filled part of the rxbuffer
        var data = new Buffer(take);
        port.rxbuffer.copy(data, 0, 0, take);
        port.rxbuffer.fill(0x00); //Clear the buffer
        port.rxoverflow = false;
        port.rxindex = 0;
        
        port.sem_read.leave();
        
        //Detect content type: binary or ascii
        var contentType = "application/octet-stream";
        var accept = req.headers["accept"] || "";
        if (accept.indexOf("text/html") != -1 || accept.indexOf("text/plain") != -1) {
          contentType = "text/plain";
        }
        
        res.header("X-Read-Length", take); //Number of bytes read or returned
        res.header("X-Read-Available", port.rxindex);
        res.contentType(contentType);
        res.end(data);
      });
    }
    catch (e) {
      next(e);
    }
  });

  //Clears read buffer
  app.delete("/port/:name/read", function(req, res, next) {
    try {
      var name = getPortName(req.params.name);
      if (!isPortAllowed(name)) {
        return next(new Error("Access to serial port denied!"));
      }
      
      var port = spm[name];
      if (!port) {
        return next(new Error("Serial port is not open!"));
      }
      
      if (!config.permissions.read) {
        throw new Error("No read permissions!");
      }
      
      port.sem_read.take(function() {
        port.rxoverflow = false;
        port.rxbuffer.fill(0x00);
        port.rxindex = 0;
        port.sem_read.leave();
        res.end();
      });
    }
    catch (e) {
      next(e);
    }
  });

  //Gets a number of available bytes to read
  app.get("/port/:name/available", function(req, res, next) {
    try {
      var name = getPortName(req.params.name);
      if (!isPortAllowed(name)) {
        return next(new Error("Access to serial port denied!"));
      }
      
      var port = spm[name];
      if (!port) {
        return next(new Error("Serial port is not open!"));
      }
      
      if (!config.permissions.read) {
        throw new Error("No read permissions!");
      }
      
      port.sem_read.take(function() {
        var length = port.rxindex;
        var capacity = port.rxcapacity;
        var overflow = port.rxoverflow;
        port.sem_read.leave();
        res.json({ name: name, length: length, capacity: capacity, overflow: overflow });
      });
    }
    catch (e) {
      next(e);
    }
  });

  //Catch 404 and forward to error handler
  app.use(function(req, res, next) {
    var error = new Error('Not Found');
    error.status = 404;
    next(error);
  });

  //Error handler
  app.use(function(error, req, res, next) {
    verbose(error);
  
    //HTTP status code
    res.status(error.status || 500);

    //JSON output
    return res.json({ error: error.message });
  });

  return app;
}