var os = require('os');

var config = {
  permissions: { }
};

//Verifies serial port name
function getPortName(name) {
  if (!name) {
    throw new Error("Serial port name is missing!");
  }
  
  //Windows
  if (os.platform() == "win32") {
    if (!/^COM\d+$/gi.test(name)) {
      throw new Error("Expected port to be named as 'COMx' on Windows!");
    }
    return name;
  }
  
  //Linux and Mac
  if (!/^[\w\d\-\._]+$/gi.test(name)) { //Do not allow slash in name
    throw new Error("Expected port to be named without '/dev/' on Unix system!");
  }
  return "/dev/" + name;
}

//Check if port is allowed for access
function isPortAllowed(port) {
  if (!port || typeof port != "string" || port.length == 0) {
    return false;
  }

  var allowed = config.permissions.allowedPorts;
  
  //Allow all if list not defined
  if (!allowed) {
    return true;
  }
  
  //Allow only specific
  for (var i = 0; i < allowed.length; i++) {
    if (allowed[i].toLowerCase() == port.toLowerCase()) {
      return true;
    }
  }
  
  return false;
}

//Simple event emitter
function addEventEmitter(obj) {
  if (!obj.events) {
    obj.events = { };
    obj.emit = function(event, data) {
      var callback = obj.events[event];
      if (callback) {
        callback(data);
      }
    };
    obj.on = function(event, callback) {
      obj.events[event] = callback;
    };
  }
}

//Console output if verbose mode
function verbose(message) {
  if (config.verbose) {
    console.log(message);
  }
}

module.exports = {
  setConfig: function (options) {
    config = options;
  },
  isPortAllowed: isPortAllowed,
  getPortName: getPortName,
  addEventEmitter: addEventEmitter,
  verbose: verbose
};