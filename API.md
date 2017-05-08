# REST API for Serial Port over Ethernet

## Getting Started

Get API status
```
curl http://localhost:5147/api/v1
```

List available serial ports
```
curl http://localhost:5147/api/v1
```

## Authentication

No authentication mechanism integrated. Use nginx or Apache with .htpasswd as a proxy.

## Error Handling

Using standard HTTP status codes. Descriptive errors in JSON format as `{ "error": "Oops, something went wrong." }`

## Methods

### Test API connection

```
GET /api/v1
```

Response

Property                 | Type      | Description
------------------------ | --------- | ---------------------------------------------------------------------------------
version                  | string    | Major, minor and revision number, e.g. 0.2.0
uptime                   | number    | Number of milliseconds since the script started

Example
```
curl http://localhost:5147/api/v1
{"name":"remote-serial-port-server","version":"0.2.0","uptime":75675}
```

### List serial ports

```
GET /api/v1/port
```

Example output on Windows
```json
[
  {
    "comName": "COM1",
    "manufacturer": "(Standard port types)",
    "pnpId": "ACPI\\PNP0501\\1",
    "status":"closed"
  },
  {
    "comName": "COM3",
    "manufacturer": "FTDI",
    "pnpId": "FTDIBUS\\VID_0403+PID_6001+A904VXJUA\\0000",
    "vendorId": "0403",
    "productId": "6001",
    "status":"open"
  }
]
```

### Get a specific serial port status

```
GET /api/v1/port/:name
```

Parameters

Parameter      | Type      | Description
-------------- | --------- | -----------------------------------------------------
name           | string    | Serial port name, e.g. COM1 or ttyUSB0 (without /dev)

Example output on Windows
```json
{
  "comName": "COM3",
  "manufacturer": "FTDI",
  "pnpId": "FTDIBUS\\VID_0403+PID_6001+A904VXJUA\\0000",
  "vendorId": "0403",
  "productId": "6001",
  "status":"open",
  "config": {
    "baudRate": 9600,
    "dataBits": 8,
    "stopBits": 1,
    "parity": "none"
  }
}
```

### Open a serial port

```
POST /api/v1/port/:name/open
```

Parameters

Parameter      | Type      | Description
-------------- | --------- | -----------------------------------------------------
name           | string    | Serial port name, e.g. COM1 or ttyUSB0 (without /dev)

Example
```
curl -X POST http://localhost:5147/api/v1/port/COM1/open
{"name":"COM1","status":"open"}
```

### Close a serial port

```
POST /api/v1/port/:name/close
```

Parameters

Parameter      | Type      | Description
-------------- | --------- | -----------------------------------------------------
name           | string    | Serial port name, e.g. COM1 or ttyUSB0 (without /dev)

Example
```
curl -X POST http://localhost:5147/api/v1/port/COM1/close
{"name":"COM1","status":"closed"}
```

### Write data to serial port

```
POST /api/v1/port/:name/write
```

Parameters

Parameter      | Type      | Description
-------------- | --------- | -----------------------------------------------------
name           | string    | Serial port name, e.g. COM1 or ttyUSB0 (without /dev)

Example
```
curl -X POST -d "Hello World!" http://localhost:5147/api/v1/port/COM1/write
{"name":"COM1","length":12}
```

### Read from a serial port buffer

```
GET /api/v1/port/:name/read
```

Parameters

Parameter      | Type      | Description
-------------- | --------- | -----------------------------------------------------
name           | string    | Serial port name, e.g. COM1 or ttyUSB0 (without /dev)

Example
```
curl http://localhost:5147/api/v1/port/COM1/read
Hello from Arduino!
```

### Clear serial port receive buffer

```
DELETE /api/v1/port/:name/read
```

Parameters

Parameter      | Type      | Description
-------------- | --------- | -----------------------------------------------------
name           | string    | Serial port name, e.g. COM1 or ttyUSB0 (without /dev)

### Get the number of bytes waiting in the receive buffer

```
GET /api/v1/port/:name/available
```

Parameters

Parameter      | Type      | Description
-------------- | --------- | -----------------------------------------------------
name           | string    | Serial port name, e.g. COM1 or ttyUSB0 (without /dev)

Example
```
curl http://localhost:5147/api/v1/port/COM1/available
{"name":"COM1","length":875,"capacity":65535,"overflow":false}
```