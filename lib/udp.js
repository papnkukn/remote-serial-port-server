module.exports = function(config) {
  var dgram = require('dgram');
  var SerialPort = require("serialport");
  
  if (!config) {
    throw new Error("Missing config argument!");
  }
  
  if (!config.port || !(config.port > 0)) {
    throw new Error("Missing UDP port number!");
  }

  /*  
  if (!config.broadcast) {
    throw new Error("Missing UDP broadcast address!");
  }
  */
  
  if (!config.portname) {
    throw new Error("Missing serial port name!");
  }
  
  if (!config.options) {
    config.options = { };
  }
  
  //Helper functions
  var util = require("./util.js");
  var emitter = { };
  util.addEventEmitter(emitter);
  
  //Initialize serial port
  config.options.autoOpen = false;
  var sp = new SerialPort(config.portname, config.options);
  
  var clients = { };
  
  //Initialize UDP socket
  var server = dgram.createSocket('udp4');
  server.on('listening', function () {
    var address = server.address();
    console.log("UDP listening on " + address.address + ":" + address.port);
    
    //Open the serial port
    sp.open(function (err) {
      if (err) {
        if (config.verbose || config.cli) {
          console.error("Error opening serial port: ", err.message);
        }
        
        //Notify error event
        emitter.emit("error", { port: config.portname, error: err });
        
        //Exit if running from command line
        if (config.cli) {
          process.exit(1);
        }
      }
    });
    sp.on('open', function() {
      //autoOpen no longer required
      delete config.options.autoOpen;
    
      if (config.verbose) {
        console.log(config.portname + " open", config.options);
      }
      
      //Notify open event
      emitter.emit("open", { port: config.portname, options: config.options });
    });
    sp.on('data', function (data) {
      try {
        if (config.verbose) {
          console.log(config.portname + " on data received " + data.length + " bytes");
        }
        
        //Notify read event
        emitter.emit("read", { port: config.portname, data: data });
        
        //Broadcast serial port data to clients
        //server.send(data, 0, data.length, config.port, config.broadcast);
        var length = data.length;
        var keys = Object.keys(clients);
        for (var i = 0; i < keys.length; i++) {
          var client = clients[keys[i]];
          server.send(data, 0, data.length, client.port, client.address, function(error) {
            if (error) {
              if (config.verbose) {
                console.error("Socket data send error", error);
              }
            }
            if (config.verbose) {
              console.error("Socket sent " + length + " bytes");
            }
          });
        }
      }
      catch (err) {
        if (config.verbose) {
          console.error(config.portname + " error on data received", err.message);
        }
      }
    });
  });

  //Listen for data from connected clients
  server.on('message', function (message, remote) {
    if (config.verbose) {
      console.log(config.portname + " client " + remote.address + ":" + remote.port + " sent " + message.length + " bytes");
    }
    
    //Register the client
    if (!clients[remote.address + ":" + remote.port]) {
      clients[remote.address + ":" + remote.port] = remote;
    }
    
    //Notify write event
    emitter.emit("write", { port: config.portname, client: remote, data: message });
    
    //Forward socket data to serial port
    sp.write(message, function (err) {
      if (err) {
        if (config.verbose) {
          console.error(config.portname + " client " + remote.address + ":" + remote.port, "Error writing data:", err.message);
        }
        //if (config.cli) {
        //  process.exit(1);
        //}
      }
    });
  });
  
  //Start listening
  server.bind(config.port, config.host || "0.0.0.0");
  /*
  server.bind(config.port, function() {
    server.setBroadcast(true);
    server.setMulticastTTL(128);
    server.addMembership(config.broadcast); 
  });
  */
  
  //Public properties
  return {
    config: config,
    socket: server,
    serialport: sp,
    on: emitter.on
  };
};