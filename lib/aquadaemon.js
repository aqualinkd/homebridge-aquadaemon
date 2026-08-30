

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

  this.lastDurationSet = {};
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

Aquadaemon.prototype.updateDeviceStatus = function(accessory, value, callback, statustype = Constants.statusStatus) {

  const platform = accessory.platform;

  if (platform && platform.mqtt) {
    
    // DOSER SPECIAL LOGIC ---
    if (platform.connectedServerType == Constants.serverType.AQUACHEMD && accessory.mappedType === Constants.AdDeviceType.DOSER) {
      this.handleDoserStatusUpdate(accessory, value, statustype);

    //STANDARD SWITCHES & SENSORS ---
    } else if ((accessory.mappedType === Constants.AdDeviceType.SWITCH || accessory.mappedType === Constants.AdDeviceType.BINARY_SENSOR ||
                accessory.mappedType === Constants.AdDeviceType.DIMMER || accessory.mappedType === Constants.AdDeviceType.VARIABLE_SPEED_PUMP) 
                && statustype == Constants.statusStatus) {
      platform.mqtt.send(accessory.id + "/set", value ? "1" : "0");
      
    // DIMMER PERCENTAGE ---
    } else if (accessory.mappedType === Constants.AdDeviceType.DIMMER && statustype == Constants.adActionDimmerPercent) {
      platform.mqtt.send(accessory.id + "/brightness/set", value.toString());
      
    // VARIABLE SPEED PUMP FAN ---
    } else if ( accessory.mappedType === Constants.AdDeviceType.VARIABLE_SPEED_PUMP && statustype == Constants.adActionVSPpercent) {
      platform.mqtt.send(accessory.id + "/Speed/set", value.toString());
      
    // CLIMATE CONTROLLERS (HEATER/CHILLER/SWG) ---
    } else if (accessory.mappedType === Constants.AdDeviceType.HEATER_THERMOSTAT || accessory.mappedType === Constants.AdDeviceType.SWG_CONTROLLER || accessory.mappedType === Constants.AdDeviceType.FREEZE_PROTECT || accessory.mappedType === Constants.AdDeviceType.CHILLER_THERMOSTAT) {
      if (statustype === Constants.adActionThermoTargetState) {
        platform.mqtt.send(accessory.id + "/set", (value > 0) ? "1" : "0");
      } else if (statustype === Constants.adActionThermoSetpoint) {
        platform.mqtt.send(accessory.id + "/setpoint/set", value.toString());
      }
    }
    
    if (typeof callback !== 'undefined' && callback !== false) callback(true);
    return;
  }
};

// This should be used if a doser is set to VALVE or SWITCH, since there is specific setstate logic
Aquadaemon.prototype.handleDoserStatusUpdate = function(accessory, value, statustype) {
  const platform = accessory.platform;
  const now = Date.now();
  const storageKey = accessory.id;

  // Failsafe configuration check
  if (!this.lastDurationSet) {
    this.lastDurationSet = {};
  }

  // Intercept Duration Set ---
  if (statustype === Constants.adActionTimerDuration) {
    this.lastDurationSet[storageKey] = {
      timestamp: now,
      value: value
    };

    // If active, fire off both configurations immediately
    if (accessory.state === 1) {
      platform.mqtt.send(accessory.id + "/timer/default/set", value.toString());
      platform.mqtt.send(accessory.id + "/timer/set", value.toString());
    } else {
      platform.mqtt.send(accessory.id + "/timer/default/set", value.toString());
    }

  // Intercept Status (On/Off toggle) ---
  } else if (statustype === Constants.statusStatus) {
    const lastSet = this.lastDurationSet[storageKey];

    // Home kit you need to set the runtime then the on command, we need BOTH together to fire off the timer, so evaluate last time /timer/default/set was called.
    // Evaluate 10-second (10000ms) fallback window logic
    if (value && lastSet && (now - lastSet.timestamp <= 10000)) {
      platform.mqtt.send(accessory.id + "/timer/set", lastSet.value.toString());
      delete this.lastDurationSet[storageKey]; // Wipe cache memory loop
    } else {
      const curState = accessory.state;
      platform.mqtt.send(accessory.id + "/set", value ? "1" : "0");
      // If it was on and we turned it off, we need to reset to enable.
      if (curState == 1 && value == 0) {
        platform.mqtt.send(accessory.id + "/set", "2");
      }
    }

  // Manual Direct Target Run Commands ---
  } else if (statustype === Constants.adActionTimerRemainingDuration) {
    platform.mqtt.send(accessory.id + "/timer/set", value.toString());
  }
};











