var os = require('os');
var fs = require('fs');
var path = require('path');
var express = require('express');
var logger = require('morgan');
var engine = require('ejs');
var bodyParser = require('body-parser');
var SerialPort = require("serialport");
var semaphore = require("semaphore");

//Serial port manager
var spm = {
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

//Permissions
var permissions = {
  list: true,
  read: true,
  write: true,
  ui: true,
  ws: true
};

//Command line interface
var config = { };
var args = process.argv.slice(2);
for (var i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--help":
      help();
      process.exit(0);
      break;
      
    case "--list":
      return listSerialPorts();
  
    case "-p":
    case "--port":
      config.port = parseInt(args[++i]);
      if (!(config.port > 0)) {
        console.error("Expected a numeric HTTP port number!");
        process.exit(3);
      }
      break;
      
    case "--no-list":
      permissions.list = false;
      break;
      
    case "--no-read":
      permissions.read = false;
      break;
      
    case "--no-write":
      permissions.write = false;
      break;
      
    case "--no-ui":
      permissions.ui = false;
      break;
      
    case "--no-ws":
      permissions.ws = false;
      break;
      
    case "--allow-ports":
      permissions.allowedPorts = args[++i].split(",");
      break;
      
    case "--verbose":
      config.verbose = true;
      break;
      
    case "--version":
      console.log(require('./package.json').version);
      process.exit(0);
      break;
      
    default:
      console.error("Unknown command line argument: " + args[i]);
      process.exit(1);
      break;
  }
}

//Prints help message
function help() {
  console.log("Usage:");
  console.log("  remote-serial-port-server [options]");
  console.log("");
  console.log("Options:");
  console.log("  --help                 Print this message");
  console.log("  --list                 Print serial ports and exit");
  console.log("  --port, -p [num]       HTTP and WebSocket port number, default: 5147");
  console.log("  --no-list              Disable serial port list");
  console.log("  --no-read              Disable read ops");
  console.log("  --no-write             Disable write ops");
  console.log("  --no-ui                Disable web interface");
  console.log("  --no-ws                Disable web socket");
  console.log("  --allow-ports [list]   Allow only specific ports");
  console.log("  --verbose              Enable detailed logging");
  console.log("  --version              Print version number");
  console.log("");
  console.log("Examples:");
  console.log("  remote-serial-port-server");
  console.log("  remote-serial-port-server --list");
  console.log("  remote-serial-port-server --no-read --no-write --no-ws --port 80");
  console.log("  remote-serial-port-server --allow-ports COM1,COM2,COM3");
}

//Prints serial ports
function listSerialPorts() {
  console.log("Serial ports:");
  SerialPort.list(function (err, ports) {
    if (err) {
      console.error(err);
      process.exit(2);
    }
    ports.forEach(function(port) {
      console.log("  " + port.comName);
    });
    process.exit(0);
  });
}

//Check if port is allowed for access
function isPortAllowed(port) {
  if (!permissions.allowedPorts) {
    return true; //Allow all
  }
  
  for (var i = 0; i < permissions.allowedPorts.length; i++) {
    if (permissions.allowedPorts[i].toLowerCase() == port.toLowerCase()) {
      return true;
    }
  }
  
  return false;
}

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

//Detailed console output
function verbose(message) {
  if (config.verbose || process.env.NODE_VERBOSE) {
    console.log(message);
  }
}

var app = express();
app.startup = new Date();
app.uptime = function() {
  return Math.ceil(new Date().getTime() - app.startup.getTime());
};

//Set up the view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.raw({
  //type: 'application/octet-stream'
  type: '*/*'
}));

//Register path /lib/RemoteSerialPort.js for web access
var clientPath = path.join(__dirname, "node_modules", "remote-serial-port-client", "lib");
if (fs.existsSync(clientPath)) {
  app.use("/lib", express.static(clientPath));
}
else {
  if (permissions.ui) {
    console.warn("Warning: Web interface not available!");
  }
  permissions.ui = false;
}

//Default index page
app.get("/", function(req, res, next) {
  if (!permissions.ui) {
    return next(new Error("No web interface permissions!"));
  }
  res.render("index");
});

//API status and version
app.get("/api/v1", function(req, res, next) {
  var pkg = require('./package.json');
  res.json({ name: pkg.name, version: pkg.version, uptime: app.uptime() });
});

//List available serial ports
app.get("/api/v1/port", function(req, res, next) {
  if (!permissions.list) {
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
app.get("/api/v1/port/:name", function(req, res, next) {
  var name = getPortName(req.params.name);
  
  if (!isPortAllowed(name)) {
    return next(new Error("Access to serial port denied!"));
  }
  
  SerialPort.list(function (err, ports) {
    if (err) return next(err);
    var result = { };
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
app.post("/api/v1/port/:name/open", function(req, res, next) {
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
          var websockets = port.websockets;
          if (websockets && permissions.read) {
            for (var i = 0; i < websockets.length; i++) {
              var ws = websockets[i];
              ws.send(data);
            }
          }
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
app.post("/api/v1/port/:name/close", function(req, res, next) {
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
app.post("/api/v1/port/:name/write", function(req, res, next) {
  try {
    var name = getPortName(req.params.name);
    if (!isPortAllowed(name)) {
      return next(new Error("Access to serial port denied!"));
    }
    
    var port = spm[name];
    if (!port) {
      return next(new Error("Serial port is not open!"));
    }
    
    if (!permissions.write) {
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
app.get("/api/v1/port/:name/read", function(req, res, next) {
  try {
    var name = getPortName(req.params.name);
    if (!isPortAllowed(name)) {
      return next(new Error("Access to serial port denied!"));
    }
    
    var port = spm[name];
    if (!port) {
      return next(new Error("Serial port is not open!"));
    }
    
    if (!permissions.read) {
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
app.delete("/api/v1/port/:name/read", function(req, res, next) {
  try {
    var name = getPortName(req.params.name);
    if (!isPortAllowed(name)) {
      return next(new Error("Access to serial port denied!"));
    }
    
    var port = spm[name];
    if (!port) {
      return next(new Error("Serial port is not open!"));
    }
    
    if (!permissions.read) {
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
app.get("/api/v1/port/:name/available", function(req, res, next) {
  try {
    var name = getPortName(req.params.name);
    if (!isPortAllowed(name)) {
      return next(new Error("Access to serial port denied!"));
    }
    
    var port = spm[name];
    if (!port) {
      return next(new Error("Serial port is not open!"));
    }
    
    if (!permissions.read) {
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
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

//Error handler
app.use(function(err, req, res, next) {
  verbose(err);
  
  //HTTP status code
  res.status(err.status || 500);

  //JSON output
  var accept = req.headers["accept"];
  if (accept && accept.indexOf("text/html") == -1) {
    if (accept.indexOf("application/json") >= 0) {
      return res.json({ error: err.message });
    }
  }
  
  if (!permissions.ui) {
    return res.end();
  }
  
  //HTML output
  res.render('error', {
    status: err.status,
    message: err.message,
    stack: err.stack
  });
});

var port = config.port || 5147;
var server = app.listen(port, function() {
  console.log('HTTP on port ' + server.address().port);
});

//WebSocket
if (permissions.ws) {
  try {
    var url = require('url');
    var WebSocket = require('ws');
    app.wss = new WebSocket.Server({ server });
    app.wss.on('connection', function connection(ws) {
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
              if (!permissions.write) {
                throw new Error("No write permissions!");
              }
              var buffer = new Buffer(message);
              var length = buffer.length;
              port.sem_write.take(function() {
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
  }
  catch (error) {
    console.warn("Warning: WebSocket not available!", error);
  }
}