module.exports = function(config) {
  net = require('net');
  var SerialPort = require("serialport");
  
  if (!config) {
    throw new Error("Missing config argument!");
  }
  
  if (!config.port || !(config.port > 0)) {
    throw new Error("Missing TCP port number!");
  }
  
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

  //Initialize TCP socket
  var clients = [ ];
  var server = net.createServer(function (socket) {
    //On client connected
    socket.name = socket.remoteAddress + ":" + socket.remotePort;
    if (config.verbose) {
      console.log(socket.name + " connected");
    }
    clients.push(socket);
    
    //Notify client connected event
    emitter.emit("client connected", { port: config.portname, client: socket });

    //Handle incoming messages from the client
    socket.on('data', function (data) {
      try {
        if (config.verbose) {
          console.log(config.portname + " client sent " + data.length + " bytes");
        }
      
        //Notify write event
        emitter.emit("write", { port: config.portname, client: socket, data: data });
        
        //Forward socket data to serial port
        sp.write(data, function (err) {
          if (err) {
            if (config.verbose) {
              console.error(config.portname + " client " + remote.address + ":" + remote.port, "Error writing data:", err.message);
            }
            //if (config.cli) {
            //  process.exit(1);
            //}
          }
        });
      }
      catch (error) {
        if (config.verbose) {
          console.error(error);
        }
      }
    });

    //Remove the client from the list when it leaves
    socket.on('end', function () {
      try {
        if (config.verbose) {
          console.log(socket.name + " disconnected");
        }
      
        //Notify client disconnected event
        emitter.emit("client disconnected", { port: config.portname, client: socket });
        
        clients.splice(clients.indexOf(socket), 1);
      }
      catch (error) {
        if (config.verbose) {
          console.error(error);
        }
      }
    });
  });
  server.listen(config.port);
  
  //Send a message to all clients
  function broadcast(message) {
    if (config.debug) {
      console.log("broadcast", message);
    }
    clients.forEach(function (client) {
      client.write(message);
    });
  }
  
  console.log("TCP listening on " + config.port);
  
  //Open the serial port
  sp.open(function (err) {
    if (err) {
      if (config.verbose) {
        console.error(new Error("Error opening serial port: ", err.message));
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
      broadcast(data);
    }
    catch (e) {
      if (config.verbose) {
        console.error(config.portname + " error on data received", e.message);
      }
    }
  });
  
  //Public properties
  return {
    config: config,
    socket: server,
    serialport: sp,
    on: emitter.on
  };
};