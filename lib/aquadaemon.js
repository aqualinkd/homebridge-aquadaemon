

// We do not need node-fetch, if you remove this it will default to NodeJS internal fetch.
// BUT node-fetch Gives way more meaningful errors than moment, so leaving it in.
var fetch = require("node-fetch"); 

// We need to set ipv4 first, latest node is ipv6 first. 
// can to this be resetting dns or custom http.agent
// const dns = require('node:dns');
// Use http ageng over above.
const http = require('node:http');


//var fetch = require("node-fetch"); 
//const http = require('node:http');
var Constants = require('./constants.js');
var Utils = require('./utils.js').Utils;

module.exports = {
  Aquadaemon : Aquadaemon
}

//var httpAgent = false;
//function Aquadaemon() {}

function Aquadaemon(platform) {
  this.platform = platform;
  // Each instance gets its own agent, bound to the platform
  this.httpAgent = new http.Agent({ family: 4 });
}

/*
Aquadaemon.initialize = function(platform, useSSL, requestHeaders) {
  this.platform = platform;
  this.displayedVersion = false;
  httpAgent = new http.Agent({ family: 4 });
};
*/

//Aquadaemon.devices = async function(baseURL, callback, error) {
Aquadaemon.prototype.getDevices = async function(baseURL, callback, error) {
  if (this.httpAgent === false) {
    this.platform.log.error("No http agent");
    return
  };
  var url = baseURL + "/api/homebridge";
  //var url = baseURL + "/api/devices";
  var res;

  try {
    this.platform.log("HTTP Request to "+url);
    res = await fetch(url, {agent: this.httpAgent} );
  } catch (err) {
    if (typeof error !== 'undefined' && error !== false) error("Error connecting to AquaDaemon service", err);
    else this.platform.forceLog.error("Error connecting to AquaDaemon service : "+ err);
    return;
  }

  if (!res.ok) {
    if (typeof error !== 'undefined' && error !== false) error("Error returned from AquaDaemon service", res);
    else this.platform.forceLog.error(`Error returned from AquaDaemon service: ${res.statusText}`);
    return;
  } else {
    try {
      const json = await res.json();
      var devices = [];  
      var version = "0.0.0";
      var server = Constants.serverType.UNKNOWN

      if (json.hasOwnProperty("aqualinkd_version")) {
        version = json.aqualinkd_version;
        server = Constants.serverType.AQUALINKD;
      } else if (json.hasOwnProperty("AquachemD")) {
        version = json.AquachemD; // Grab version from new payload
        server = Constants.serverType.AQUACHEMD;
      }

      this.platform.setConnectedServer(server, version);

      if (!this.displayedVersion && version !== "0.0.0") {
          this.platform.forceLog.info("Connected to "+server+" server version " + version);
          this.displayedVersion = true;
      }

      if (json.devices === undefined) {
        if (typeof callback !== 'undefined' && callback !== false) callback(devices);
        return;
      }

      // Safely handle both Array (AquadaemonD) and Object (AquachemD) layouts
      var rawDevices = [];
      if (Array.isArray(json.devices)) {
          rawDevices = json.devices;
      } else if (typeof json.devices === 'object') {
          // Flatten dictionary keys into the device objects
          Object.keys(json.devices).forEach(key => {
              let dev = json.devices[key];
              dev.id = key; // Ensure ID matches key
              rawDevices.push(dev);
          });
      }

      for (var i = 0; i < rawDevices.length; i++) {
        var device = rawDevices[i];
        if (device.name != "NONE" && device.label != "NONE" && device.id != "") {
          
          // Apply ingestion adapter
          var mappedType = Utils.normalizeDevice(device.id, device);
          if (mappedType !== null) {
              device.mappedType = mappedType; // Inject enum
              device.hkType = Utils.adDevice2hkSDevice(mappedType);
              if (server === Constants.serverType.AQUALINKD) {
                //this.platform.forceLog("BEFORE ID="+device.id+" mapped type="+device.mappedType);
                Utils.normalizeID(device); // Replace _f from ID's in AqualinkD old format for sensors not using temperature anymore.
                //this.platform.forceLog("AFTER ID="+device.id+" mapped type="+device.mappedType);
              } else if (server === Constants.serverType.AQUACHEMD) {
                device.name = device.label;
              }
              
              devices.push(device);
          }
        }
      }

      if (typeof callback !== 'undefined' && callback !== false) {
        callback(devices, version);
      }
    } catch (err) {
      if (typeof error !== 'undefined' && error !== false) error("Error understanding result from AquaDaemon service", err);
      else this.platform.forceLog.error("Error understanding result from AquaDaemon service", err);
      return;
    }
  }
}

//Aquadaemon.updateDeviceStatus = function(accessory, value, callback, statustype = Constants.statusStatus) {
Aquadaemon.prototype.updateDeviceStatus = function(accessory, value, callback, statustype = Constants.statusStatus) {
  if (accessory.platform.mqtt) {
    if (accessory.platform.connectedServerType == Constants.serverType.AQUACHEMD) {
      // AquachemD has an extra element in the set topic /device/state/set
      if (accessory.mappedType === Constants.AdDeviceType.SWITCH) {
        accessory.platform.mqtt.send(accessory.id + "/state/set", value ? "1" : "0");
      } else {
        
      }
      return;
    }
    if ( (accessory.mappedType === Constants.AdDeviceType.SWITCH || accessory.mappedType === Constants.AdDeviceType.BINARY_SENSOR ||
          accessory.mappedType === Constants.AdDeviceType.VSP_FAN || accessory.mappedType === Constants.AdDeviceType.DIMMER) && statustype == Constants.statusStatus) {
      accessory.platform.mqtt.send(accessory.id + "/set", value ? "1" : "0");
    } else if (accessory.mappedType === Constants.AdDeviceType.DIMMER && statustype == Constants.adActionDimmerPercent) {
      accessory.platform.mqtt.send(accessory.id + "/brightness/set", value.toString());
    } else if (accessory.mappedType === Constants.AdDeviceType.VSP_FAN && statustype == Constants.adActionVSPpercent) {
      accessory.platform.mqtt.send(accessory.id + "/Speed/set", value.toString());
    } else if (accessory.mappedType === Constants.AdDeviceType.HEATER_THERMOSTAT || accessory.mappedType === Constants.AdDeviceType.SWG_CONTROLLER || accessory.mappedType === Constants.AdDeviceType.FREEZE_PROTECT || accessory.mappedType === Constants.AdDeviceType.CHILLER_THERMOSTAT) {
      if (statustype === Constants.adActionThermoTargetState) {
        accessory.platform.mqtt.send(accessory.id + "/set", (value > 0) ? "1" : "0");
      } else if (statustype === Constants.adActionThermoSetpoint) {
        accessory.platform.mqtt.send(accessory.id + "/setpoint/set", value.toString());
      }
    }
    if (typeof callback !== 'undefined' && callback !== false) callback(true);
    return;
  }
};








