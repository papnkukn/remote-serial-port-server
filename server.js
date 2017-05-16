var os = require('os');
var fs = require('fs');
var path = require('path');
var SerialPort = require("serialport");

//Default configuration
var config = {
  spm: { }, //Serial port manager
  cli: true, //Command line interface
  port: 5147,
  mode: "http", //HTTP server with WebSocket by default
  prefix: "/api/v1", //REST API route prefix, e.g. "/" for root or "/api/v1" etc.
  verbose: process.env.NODE_VERBOSE == "true" || process.env.NODE_VERBOSE == "1",
  debug: process.env.NODE_DEBUG == "true" || process.env.NODE_DEBUG == "1", //Even more details than verbose
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
      
    case "-m":
    case "--mode":
      config.mode = args[++i];
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
      
    case "--config":
      var ssp = args[++i];
      ssp = ssp.split(",");
      config.options = { };
      for (var s = 0; s < ssp.length; s++) {
        switch (s) {
          case 0:
            config.portname = ssp[s];
            break;
            
          case 1:
            config.options.baudRate = parseInt(ssp[s]);
            if (!(config.options.baudRate > 0)) {
              throw new Error("Error in --config argument: baud rate must be greater than 0");
            }
            break;
            
          case 2:
            //Example: 8N1 = 8 data bits, no parity, 1 stop bit
            var value = ssp[s];
            if (value.length != 3) {
              throw new Error("Error in --config argument: " + value);
            }
            
            //Parse data bits settings
            config.options.dataBits = parseInt(value[0]);
            if (!(5 <= config.options.dataBits && config.options.dataBits <= 8)) {
              throw new Error("Error in --config argument: data bits should be 5, 6, 7 or 8");
            }
            
            //Parse stop bits settings
            config.options.stopBits = parseInt(value[2]);
            if (config.options.stopBits != 1 && config.options.stopBits != 2) {
              throw new Error("Error in --config argument: stop bits should be 1 or 2");
            }
            
            //Parse parity settings
            var parity = { "N": "none", "E": "even", "O": "odd", "M": "mark", "S": "space" };
            config.options.parity = parity[value[1].toUpperCase()];
            if (!config.options.parity) {
              throw new Error("Error in --config argument: parity should be N - none, E - even, O - odd, M - mark or S - space");
            }
            break;
            
          default:
            throw new Error("Unknown --config argument: " + ssp[s]);
        }
      }
      break;
      
    case "--verbose":
      config.verbose = true;
      break;
      
    //Intentionally undocumented in help()
    case "--debug":
      config.debug = true;
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
  console.log("  --mode, -m [mode]      Server mode: http, tcp, udp, echo; default: http");
  console.log("  --prefix [path]        URL prefix: '/' for root or '/api/v1' etc.");
  console.log("  --no-list              Disable serial port list");
  console.log("  --no-read              Disable read ops");
  console.log("  --no-write             Disable write ops");
  console.log("  --no-ui                Disable web interface");
  console.log("  --no-ws                Disable web socket");
  console.log("  --allow-ports [list]   Allow only specific ports");
  console.log("  --config [port,baud,extra]");
  console.log("                         Socket serial port configuration, only for TCP and UDP");
  console.log("                         [extra] as data bits, parity and stop bits");
  console.log("                         Data bits 5, 6, 7 or 8 and stop bits 1 or 2");
  console.log("                         Parity: N-none, E-even, O-odd, M-mark or S-space");
  console.log("                         For example 8N1 = 8 data bits, N no parity, 1 stop bit");
  console.log("  --verbose              Enable detailed logging");
  console.log("  --version              Print version number");
  console.log("");
  console.log("Examples:");
  console.log("  remote-serial-port-server");
  console.log("  remote-serial-port-server --list");
  console.log("  remote-serial-port-server --allow-ports COM1,COM2,COM3");
  console.log("  remote-serial-port-server --no-read --no-write --no-ws --port 80");
  console.log("  remote-serial-port-server --mode tcp --config COM1,115200 --port 3000");
  console.log("  remote-serial-port-server --mode udp --config /dev/ttyUSB0,9600,8N1 -p 3000");
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

function startUdpSocket(config) {
  try {
    var listen = require('./lib/udp.js');
    config.host = "0.0.0.0";
    listen(config);
  }
  catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

function startTcpSocket(config) {
  try {
    var listen = require('./lib/tcp.js');
    listen(config);
  }
  catch (e) {
    console.error(e.message);
    process.exit(1);
  }
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

function startEcho(config) {
  try {
    var listen = require('./lib/echo.js');
    listen(config);
    setInterval(function() { }, Number.POSITIVE_INFINITY);
  }
  catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

switch (config.mode) {  
  case "udp":
    startUdpSocket(config);
    break;
    
  case "tcp":
    startTcpSocket(config);
    break;
    
  case "http":
    startWebServer(config);
    break;
    
  case "echo":
    startEcho(config);
    break;
    
  default:
    console.error("Unknown mode: " + config.mode);
    process.exit(2);
    break;
}