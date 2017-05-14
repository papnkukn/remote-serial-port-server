var udp = require('../lib/udp.js');

var config = {
  verbose: true,
  port: 3000,
  portname: "COM13",
  host: "127.0.0.1",
  broadcast: "127.0.0.1", //Broadcast must be the same as host for echo
  options: {
    baudRate: 115200
  }
};

udp(config);