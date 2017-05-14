var os = require('os');
var fs = require('fs');
var path = require('path');
var SerialPort = require("serialport");

//Default configuration
var config = {
  spm: { }, //Serial port manager
  port: 5147,
  mode: "http", //HTTP server with WebSocket by default
  prefix: "/api/v1", //REST API route prefix, e.g. "/" for root or "/api/v1" etc.
  verbose: process.env.NODE_VERBOSE == "true" || process.env.NODE_VERBOSE == "1",
  permissions: {
    list: true,
    read: true,
    write: true,
    ui: true,
    ws: true
  }
};

//Command line interface
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
        process.exit(2);
      }
      break;
      
    case "--prefix":
      config.prefix = args[++i];
      break;
      
    case "--no-list":
      config.permissions.list = false;
      break;
      
    case "--no-read":
      config.permissions.read = false;
      break;
      
    case "--no-write":
      config.permissions.write = false;
      break;
      
    case "--no-ui":
      config.permissions.ui = false;
      break;
      
    case "--no-ws":
      config.permissions.ws = false;
      break;
      
    case "--allow-ports":
      var ports = args[++i];
      if (!ports) {
        console.error("Expected serial port names after --allow-ports");
        process.exit(2);
      }
      config.permissions.allowedPorts = ports.split(",");
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
      process.exit(2);
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
  console.log("  --port, -p [num]       Socket port number, default: 5147");
  console.log("  --prefix [path]        URL prefix: '/' for root or '/api/v1' etc.");
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

function startWebServer(config) {
  var express = require('express');
  var logger = require('morgan');
  var engine = require('ejs');
  var bodyParser = require('body-parser');
  
  //Initialize express
  var app = express();
  app.startup = new Date();
  app.uptime = function() {
    return Math.ceil(new Date().getTime() - app.startup.getTime());
  };

  //Set up the view engine
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');

  app.use(logger('dev'));

  //Register path /lib/RemoteSerialPort.js for web access
  var clientPath = path.join(__dirname, "node_modules", "remote-serial-port-client", "lib");
  if (fs.existsSync(clientPath)) {
    app.use("/lib", express.static(clientPath));
  }
  else {
    if (config.permissions.ui) {
      console.warn("Warning: Web interface not available!");
    }
    config.permissions.ui = false;
  }

  //Default index page
  app.get("/", function(req, res, next) {
    if (!config.permissions.ui) {
      return next(new Error("No web interface permissions!"));
    }
    res.render("index");
  });

  //API status and version
  app.get(config.prefix, function(req, res, next) {
    var pkg = require('./package.json');
    res.json({ name: pkg.name, version: pkg.version, uptime: app.uptime() });
  });

  //Register REST API
  var webserver = require('./lib/webserver.js');
  var subapp = webserver(config);
  app.use(config.prefix, subapp);

  //Catch 404 and forward to error handler
  app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  });

  //Error handler
  app.use(function(err, req, res, next) {
    if (config.verbose) {
      console.error(err);
    }
    
    //HTTP status code
    res.status(err.status || 500);
    
    if (!config.permissions.ui) {
      return res.end();
    }
    
    //HTML output
    res.render('error', {
      status: err.status,
      message: err.message,
      stack: err.stack
    });
  });
  
  //Start the HTTP server
  var server = app.listen(config.port, function() {
    console.log('HTTP on port ' + server.address().port);
  });

  //WebSocket
  if (config.permissions.ws) {
    try {
      var websocket = require('./lib/websocket.js');
      var wss = websocket(config).use(server);
      
      //Register receive event to forward data over web socket
      if (config.spm && typeof config.spm == "object") {
        config.spm.on("received", function(e) {
          var port = config.spm[e.port];
          if (!port || !port.websockets) {
            return;
          }
          var websockets = port.websockets;
          if (websockets && config.permissions.read) {
            for (var i = 0; i < websockets.length; i++) {
              var ws = websockets[i];
              ws.send(e.data);
            }
          }
        });
      }
    }
    catch (error) {
      console.warn("Warning: WebSocket not available!", error);
    }
  }
}

startWebServer(config);