module.exports = function(config) {
  var SerialPort = require("serialport");
  
  if (!config) {
    throw new Error("Missing config argument!");
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
      
      //Notify write event
      emitter.emit("write", { port: config.portname, data: data });
      
      //Echo the received data
      sp.write(data, function (err) {
        if (err) {
          if (config.verbose) {
            console.error("Error writing data:", err.message);
          }
        }
        if (config.verbose) {
          console.log(config.portname + " echo data sent " + data.length + " bytes");
        }
      });
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
    serialport: sp,
    on: emitter.on
  };
};