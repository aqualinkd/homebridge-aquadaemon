// Example ~/.homebridge/config.json content:
//
// {
//   "bridge": {
//     "name": "Homebridge",
//     "username": "CC:21:3E:E4:DE:33",
//     "port": 51826,
//     "pin": "031-45-154"
//   },
//   "platforms": [{
//     "platform": "AquaDaemon",
//     "name": "AquaDaemon",
//     "instances": [
//       {
//         "name": "AqualinkD Pool",
//         "serverType": "aqualinkd",
//         "server": "aqualinkd.local",
//         "port": "80",
//         "mqtt": { "host": "127.0.0.1", "port": "1883", "topic": "aqualinkd" },
//         "VSP_as_Fan": false,
//         "no_delete_on_sync": false,
//         "excludedDevices": []
//       },
//       {
//         "name": "AquachemD Spa",
//         "serverType": "aquachemd",
//         "server": "aquachemd.local",
//         "port": "80",
//         "mqtt": { "host": "127.0.0.1", "port": "1883", "topic": "aquachemd" },
//         "user_device_deg_C": false,
//         "no_delete_on_sync": false,
//         "excludedDevices": []
//       }
//     ]
//   }],
//   "accessories": []
// }


//"use strict";

var pluginName = "homebridge-aquadaemon";
var platformName = "AquaDaemon";

var Aquadaemon = require('./lib/aquadaemon.js').Aquadaemon;
var Mqtt = require('./lib/mqtt.js').Mqtt;
var Utils = require('./lib/utils.js').Utils;
var Constants = require('./lib/constants.js');

const packageInfo = require('./package.json');

var AquaDaemonAccessory = require('./lib/aquadaemon_accessory.js');

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Types = homebridge.hapLegacyTypes;
  UUID = homebridge.hap.uuid;
  packageVersion = packageInfo.version;

  homebridge.registerPlatform(pluginName, "AquaDaemon", AquaDaemonPlatform, true);
};


// =========================================================
//  PLATFORM — Manager only. Spawns one Instance per config entry.
// =========================================================
function AquaDaemonPlatform(log, config, api) {
  this.log = log;
  this.config = config;
  this.api = api;

  // Master cache: Homebridge delivers ALL cached accessories here before
  // didFinishLaunching fires. Instances claim their own slice from it.
  this.cachedAccessories = [];

  if (!config || !config.instances || !Array.isArray(config.instances) || config.instances.length === 0) {
    log.error("[AquaDaemon] No instances configured. Add an 'instances' array to your config.");
    return;
  }

  log.info("[AquaDaemon] " + packageInfo.name + " v" + packageInfo.version + " — " + config.instances.length + " instance(s) configured.");

  if (this.api) {
    this.api.once("didFinishLaunching", function () {
      config.instances.forEach(function (instanceConfig) {
        if (!instanceConfig.name || !instanceConfig.server) {
          log.error("[AquaDaemon] Skipping instance — missing required 'name' or 'server' field.");
          return;
        }
        new AquaDaemonInstance(log, instanceConfig, api, this);
      }.bind(this));
    }.bind(this));
  }
}

// Homebridge calls this for every accessory restored from cache.
// We just collect them all here; each Instance filters out its own below.
AquaDaemonPlatform.prototype.configureAccessory = function (platformAccessory) {
  // Guard against corrupt cache entries up-front so instances never see them.
  if (!platformAccessory.context || !platformAccessory.context.device) {
    this.log.warn("[AquaDaemon] Removing cached accessory with missing context: " + (platformAccessory.displayName || "unknown"));
    try {
      this.api.unregisterPlatformAccessories(pluginName, platformName, [platformAccessory]);
    } catch (e) {
      this.log.error("[AquaDaemon] Could not unregister corrupt cached accessory: " + e);
    }
    return;
  }
  this.cachedAccessories.push(platformAccessory);
};


// =========================================================
//  INSTANCE — One per server. Fully isolated state.
// =========================================================
function AquaDaemonInstance(log, config, api, masterPlatform) {
  this.api = api;
  this.config = config;
  this.masterPlatform = masterPlatform;
  this.accessories = [];
  this.isSynchronizingAccessories = false;
  this.firstrun = true;
  this.mqttStarted = false;
  this.mqtt = false;

  this.instanceName = config.name || "AquaDaemon";
  this.connectedServerVersion = "0.0.0";
  this.connectedServerType = Constants.serverType.UNKNOWN;

  // Prefix every log line with the instance name so mixed output is readable.
  var prefix = "[" + this.instanceName + "] ";
  this.log = function () {
    var args = Array.prototype.slice.call(arguments);
    args[0] = prefix + args[0];
    log.debug.apply(log, args);
  };
  this.forceLog = function () {
    var args = Array.prototype.slice.call(arguments);
    args[0] = prefix + args[0];
    log.info.apply(log, args);
  };
  this.forceLog.info = this.forceLog;
  this.forceLog.error = function () {
    var args = Array.prototype.slice.call(arguments);
    args[0] = prefix + args[0];
    log.error.apply(log, args);
  };
  this.forceLog.warn = function () {
    var args = Array.prototype.slice.call(arguments);
    args[0] = prefix + args[0];
    log.warn.apply(log, args);
  };

  this.setConnectedServer = function (name, version) {
    this.connectedServerVersion = version;
    this.connectedServerType = name;
    this.log("Connected server set: " + name + " v" + version);
  };

  // The schema stores MQTT fields flat (mqtt_host, mqtt_port, etc.) to avoid the
  // Homebridge UI bug where nested objects with defaults cause phantom array entries.
  // Reassemble them into the mqtt sub-object the rest of the code expects.
  // Also supports the legacy nested mqtt:{} format for anyone editing JSON directly.
  if (!this.config.mqtt) {
    var hasFlatMqtt = config.mqtt_host || config.mqtt_port || config.mqtt_topic;
    if (hasFlatMqtt) {
      this.config.mqtt = {
        host:     config.mqtt_host     || '127.0.0.1',
        port:     config.mqtt_port     || '1883',
        topic:    config.mqtt_topic    || 'aquadaemon',
        username: config.mqtt_username || '',
        password: config.mqtt_password || ''
      };
    }
  }

  // Each instance has its own Aquadaemon HTTP client (owns its own http.Agent).
  this.aquadaemon = new Aquadaemon(this);

  // Parse server string — supports "user:pass@host" basic-auth syntax.
  this.authorizationToken = false;
  this.server = config.server;
  if (this.server.indexOf(":") > -1 && this.server.indexOf("@") > -1) {
    var tmparr = this.server.split("@");
    this.authorizationToken = Buffer.from(tmparr[0]).toString('base64');
    this.server = tmparr[1];
  }
  this.port = config.port || "80";
  this.apiBaseURL = "http://" + this.server + ":" + this.port;

  // Per-instance feature flags.
  this.isVSPasFanEnabled = false;
  this.isDimmerEnabled = false;
  this.isUserDeviceDegC = (config.user_device_deg_C === true);

  if (typeof config.no_delete_on_sync === 'undefined') {
    this.config.no_delete_on_sync = false;
  }

  // Claim only the cached accessories that belong to this instance.
  // Ownership is established by context.instanceName, which we stamp on
  // every accessory when we register it (see synchronizeAccessories below).
  this.accessories = masterPlatform.cachedAccessories.filter(function (acc) {
    return acc.context && acc.context.instanceName === this.instanceName;
  }.bind(this));

  this.forceLog("Starting — server: " + this.apiBaseURL + (config.serverType ? " (" + config.serverType + ")" : ""));
  this.forceLog("Claimed " + this.accessories.length + " cached accessories.");

  // Restore each claimed cached accessory into a live AquaDaemonAccessory wrapper.
  this.accessories = this.accessories.map(function (platformAccessory) {  
    var device = platformAccessory.context.device;
    var uuid = platformAccessory.context.uuid;
    //if (this.firstrun === true) {
      this.forceLog("Loading cached accessory: " + Utils.adDevice2hkString(device.mappedType) + " - " + (device.label || device.name));
    //} else {
    //  this.log("Loading cached accessory: " + device.name);
    //}
    return new AquaDaemonAccessory(this, platformAccessory, device.id, device, uuid);
  }.bind(this));

  // Begin the sync loop.
  var self = this;
  var syncDevices = function () {
    self.synchronizeAccessories();
    if (self.firstrun) {
      self.firstrun = false;
      setTimeout(syncDevices, 60000);   // Re-sync 1 min after initial load
    } else {
      setTimeout(syncDevices, 600000);  // Then every 10 minutes
    }
  };

  // Small delay so Homebridge finishes restoring cached accessories first.
  setTimeout(syncDevices, 2000);
}


AquaDaemonInstance.prototype.synchronizeAccessories = function () {
  if (this.isSynchronizingAccessories) return;

  this.log("Synchronizing accessories from " + this.apiBaseURL);
  this.isSynchronizingAccessories = true;

  var excludedDevices = Array.isArray(this.config.excludedDevices) ? this.config.excludedDevices : [];

  this.aquadaemon.getDevices(this.apiBaseURL,
    function (devices, aqVersion) {
      aqVersion = aqVersion || "0.0.0";
      var removedAccessories = [];
      var version = Utils.VersionString2Int(aqVersion);
      this.log("Server version: " + aqVersion + " (" + version + ")");

      for (var i = 0; i < devices.length; i++) {
        var device = devices[i];

        // AqualinkD-only: promote VSP switches to fan type when configured.
        if (this.config.serverType === 'aqualinkd' || !this.config.serverType) {
          if ((version >= 20500) && (this.config.VSP_as_Fan === true)) {
            if (device.type === Constants.adDeviceSwitch &&
                device.hasOwnProperty("type_ext") &&
                device.type_ext === Constants.adDeviceSwitchVSP) {
              device.type = Constants.adDeviceVSPfan;
              this.log("Promoting " + (device.label || device.name) + " to Fan (VSP)");
              this.isVSPasFanEnabled = true;
            }
          }

          // Promote dimmer switches.
          if (device.type === Constants.adDeviceSwitch &&
              device.hasOwnProperty("type_ext") &&
              device.type_ext === Constants.adDeviceDimmer) {
            device.type = Constants.adDeviceDimmer;
            this.log("Promoting " + (device.label || device.name) + " to Dimmer");
            this.isDimmerEnabled = true;
          }
        }

        var existingAccessory = this.accessories.find(function (a) {
          return a.id === device.id;
        });

        var incomingMappedType = Utils.normalizeDevice(device.id, device);
        var incomingHkType = Utils.adDevice2hkSDevice(incomingMappedType);

        // Skip excluded devices, removing from cache if previously registered.
        if (excludedDevices.indexOf(device.id) > -1) {
          if (existingAccessory) {
            this.log("Removing excluded device: " + existingAccessory.name);
            removedAccessories.push(existingAccessory);
            try {
              this.api.unregisterPlatformAccessories(pluginName, platformName, [existingAccessory.platformAccessory]);
            } catch (e) {
              this.forceLog.error("Could not unregister excluded accessory (" + existingAccessory.name + "): " + e);
            }
          } else {
            this.log("Ignoring excluded device: " + (device.label || device.name));
          }
          continue;
        }

        if (existingAccessory) {
          if (incomingMappedType !== existingAccessory.mappedType || incomingHkType !== existingAccessory.hkType) {
            // Type changed — remove and let it fall through to re-create below.
            this.forceLog("Type changed for " + existingAccessory.name + " — recreating.");
            removedAccessories.push(existingAccessory);
            try {
              this.api.unregisterPlatformAccessories(pluginName, platformName, [existingAccessory.platformAccessory]);
            } catch (e) {
              this.forceLog.error("Could not unregister changed accessory (" + existingAccessory.name + "): " + e);
            }
          } else {
            if (this.firstrun === true) {
              this.forceLog("Loading " + incomingMappedType.toLowerCase() + " — " +
                (device.label || device.name) + " as " + Utils.adDevice2hkString(incomingMappedType));
            } else {
              this.log("Loading " + incomingMappedType.toLowerCase() + " — " +
                (device.label || device.name) + " as " + Utils.adDevice2hkString(incomingMappedType));  
            }
              continue; // Already registered and unchanged.
          }
        }

        // Register a new accessory.
        // UUID is scoped to instanceName + device.id to avoid cross-instance collisions.
        var uuid = UUID.generate(this.instanceName + "_" + device.id);
        var accessory = new AquaDaemonAccessory(this, false, device.id, device, uuid);

        // Stamp instance ownership so configureAccessory can route correctly on next restart.
        accessory.platformAccessory.context = {
          device: device,
          uuid: uuid,
          instanceName: this.instanceName
        };

        this.accessories.push(accessory);
        this.forceLog("Registering: " + accessory.name + " | " + device.type + " | " + uuid);

        try {
          this.api.registerPlatformAccessories(pluginName, platformName, [accessory.platformAccessory]);
        } catch (e) {
          this.forceLog.error("Could not register accessory (" + accessory.name + "): " + e);
        }
      }

      // Remove accessories that no longer appear in the device list.
      if (this.config.no_delete_on_sync !== true) {
        for (var j = 0; j < this.accessories.length; j++) {
          var removedAccessory = this.accessories[j];
          var stillExists = devices.find(function (d) {
            return d.id === removedAccessory.id;
          });
          if (!stillExists) {
            var name = removedAccessory.name;
            removedAccessories.push(removedAccessory);
            this.forceLog("Un-registering stale accessory: " + name);
            try {
              this.api.unregisterPlatformAccessories(pluginName, platformName, [removedAccessory.platformAccessory]);
            } catch (e) {
              this.forceLog.error("Could not unregister stale accessory (" + name + "): " + e);
            }
          }
        }
      }

      // Prune the local accessories array.
      for (var k = 0; k < removedAccessories.length; k++) {
        var idx = this.accessories.indexOf(removedAccessories[k]);
        if (idx > -1) this.accessories.splice(idx, 1);
      }

      // Start MQTT once, after the first successful HTTP sync.
      if (this.config.mqtt && !this.mqttStarted) {
        this.forceLog("HTTP sync complete — starting MQTT connection.");
        setupMqttConnection(this);
        this.mqttStarted = true;
      }

      this.isSynchronizingAccessories = false;
    }.bind(this),
    function (response, err) {
      Utils.LogConnectionError(this, response, err);
      this.isSynchronizingAccessories = false;
    }.bind(this)
  );
};


// =========================================================
//  MQTT helper — scoped to one instance
// =========================================================
function setupMqttConnection(instance) {
  var mqttConfig = instance.config.mqtt;
  instance.mqtt = new Mqtt(
    instance,
    mqttConfig.host || '127.0.0.1',
    mqttConfig.port || 1883,
    mqttConfig.topic || 'aquadaemon',
    {
      username: mqttConfig.username || '',
      password: mqttConfig.password || ''
    }
  );
}