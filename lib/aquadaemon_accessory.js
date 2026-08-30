const Constants = require('./constants.js');
const Mqtt = require('./mqtt.js').Mqtt;
const Utils = require('./utils.js').Utils;
//var Aquadaemon = require('./aquadaemon.js').Aquadaemon;

module.exports = AquadaemonAccessory;

function AquadaemonAccessory(platform, platformAccessory, id, device, uuid) {
  this.services = [];
  this.platform = platform;
  this.flash = false;

  // Set quickley, will be overwitted below.
  this.state = Utils.toBool(device.state || device.status);

  this.id = device.id;

  this.name = device.name || device.label; // Support AquachemD label
  //this.name = device.label || device.name; // Support AquachemD label
  //this.platform.forceLog("AquadaemonAccessory constructor - "+this.name);

  this.type = device.type;                 // Retain original type for legacy routing
  this.type_ext = device.type_ext ?? null; // Retain original AqualinkD extended type for legacy routing

  this.mappedType = device.mappedType || Utils.normalizeDevice(this.id, device);
  this.hkType = device.hkType || Utils.adDevice2hkSDevice(this.mappedType);

  this.fullState = (device.state || device.status);
  this.state = Utils.parseAccessoryState(this.mappedType, this.fullState);

  this.timerMaxDuration = 0;
  this.timerRemainingDuration = 0;
  this.timerDefaultDuration = 0;

  /*
  // Need to remove _f from ID's for ones that are no longer temp sensors.
  if (this.id.endsWith("_f")) {
    if ( this.mappedType == Constants.AdDeviceType.PPM_SENSOR ) {this.id = this.id.replace(/_f$/, '');}
    if ( this.mappedType == Constants.AdDeviceType.ORP_SENSOR ) {this.id = this.id.replace(/_f$/, '');}
    if ( this.mappedType == Constants.AdDeviceType.PH_SENSOR ) {this.id = this.id.replace(/_f$/, '');}
  }
  */

  this.sourceUOM = device.uom;


  this.setStateLastCalled = Date.now();
 
  // Below is the correct version of above
  if (this.hkType === Constants.hkDeviceType.FAN) {
    this.value = device.Pump_Speed || 0;
    if (isNaN(this.value) || this.value < 0) this.value = 0;
  } else if (this.hkType === Constants.hkDeviceType.DIMMER) {
    this.value = parseInt(device.Program_Name) || 0; 
    if (isNaN(this.value) || this.value < 0) this.value = 0;
  }

  if (typeof device.status !== 'undefined') this.status = Utils.toBool(device.status);
  if (typeof device.spvalue !== 'undefined') this.spvalue = Utils.parseAccessoryTargetValue(this.mappedType, device.spvalue);

  if (typeof device.timer_max_runtime !== 'undefined') this.timerMaxDuration = Utils.parseAccessoryTargetValue(this.mappedType, device.timer_max_runtime);
  if (typeof device.timer_duration !== 'undefined') this.timerRemainingDuration = Utils.parseAccessoryTargetValue(this.mappedType, device.timer_duration);
  if (typeof device.timer_default_runtime !== 'undefined') this.timerDefaultDuration = Utils.parseAccessoryTargetValue(this.mappedType, device.timer_default_runtime);
  

  this.uuid = uuid;
  this.platformAccessory = platformAccessory;
  if (!this.platformAccessory) {
    this.platformAccessory = new platform.api.platformAccessory(this.name, uuid);
  }
  this.platformAccessory.reachable = true;
  this.publishServices();
}

AquadaemonAccessory.prototype = {
  identify : function(callback) { callback(); },
  publishServices : function() {
    var services = this.getServices();
    for (var i = 0; i < services.length; i++) {
      var service = services[i];
      var existingService = this.platformAccessory.services.find(function(eService) { return eService.UUID == service.UUID; });
      if (!existingService) this.platformAccessory.addService(service, this.name);
    }
  },
  getService : function(name) {
    var service = false;
    try { service = this.platformAccessory.getService(name); } catch (e) { service = false; }
    if (!service) {
      var targetService = new name();
      service = this.platformAccessory.services.find(function(existingService) { return existingService.UUID == targetService.UUID; });
    }
    return service;
  },
  getCharacteristic : function(service, name) {
    var characteristic = false;
    try { characteristic = service.getCharacteristic(name); } catch (e) { characteristic = false; }
    if (!characteristic) {
      try {
        var targetCharacteristic = new name();
        characteristic = service.characteristics.find(function(existingCharacteristic) { return existingCharacteristic.UUID == targetCharacteristic.UUID; });
      } catch (e) { characteristic = false; }
    }
    return characteristic;
  },
  gracefullyAddCharacteristic : function(service, characteristicType) {
    var characteristic = this.getCharacteristic(service, characteristicType);
    if (characteristic) return characteristic;
    return service.addCharacteristic(new characteristicType());
  },
  setState : function(state, callback, context) {

    this.platform.log("setState: "+this.id+" state="+state+" context="+context);

    if (state > 0 && (this.mappedType === Constants.AdDeviceType.SWG_CONTROLLER || this.mappedType === Constants.AdDeviceType.FREEZE_PROTECT || this.mappedType === Constants.AdDeviceType.CHILLER_THERMOSTAT) )
      this.state = 1;
    else
      this.state = state;

    //if (this.id==="CS_4"){this.platform.log("Set state for "+this.id+" to "+this.state);}

    if (context && context == "Aquadaemon-MQTT") {
      callback(); return;
    } else {
      this.setStateLastCalled = Date.now();
    }
    this.platform.aquadaemon.updateDeviceStatus(this, this.state, function(success) { callback(); }.bind(this));
  },
  getState : function(callback) {
    if (this.state > 0 && (this.mappedType === Constants.AdDeviceType.SWG_CONTROLLER || this.mappedType === Constants.AdDeviceType.FREEZE_PROTECT || this.mappedType === Constants.AdDeviceType.CHILLER_THERMOSTAT) ) {
      callback(null, 2); // Return Cooling for blue icon
    } else if (this.mappedType === Constants.AdDeviceType.CONTACT_SENSOR || this.mappedType === Constants.AdDeviceType.BINARY_SENSOR) {
      let isClosed = (parseInt(this.state) === 1);
      let hkValue = isClosed ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
      if (this.id==="CS_4"){this.platform.log("Get state for " + this.id + " state is " + this.state + " returning HK value " + hkValue);}
      callback(null, hkValue);
     } else {
      callback(null, this.state);
    }
  },
  getTargetState : function(callback) {
    if (this.status > 0 && (this.mappedType === Constants.AdDeviceType.SWG_CONTROLLER || this.mappedType === Constants.AdDeviceType.FREEZE_PROTECT) )
      callback(null, 2);
    else
      callback(null, this.status);
  },
  setTargetState : function(value, callback, context) {
    if (value > 0 && (this.mappedType === Constants.AdDeviceType.HEATER_THERMOSTAT || this.mappedType === Constants.AdDeviceType.SWG_CONTROLLER || this.mappedType === Constants.AdDeviceType.FREEZE_PROTECT || this.mappedType === Constants.AdDeviceType.CHILLER_THERMOSTAT) )
      this.status = 1;
    else
      this.status = value;

    if (context && context == "Aquadaemon-MQTT") {
      callback(); return;
    }
    this.platform.aquadaemon.updateDeviceStatus(this, value, function(success) { callback(); }.bind(this), Constants.adActionThermoTargetState);
  },
  setValue : function(val, callback, context) {
    var action = Constants.adActionVSPpercent;
    if (this.mappedType === Constants.AdDeviceType.VARIABLE_SPEED_PUMP) {
      this.value = val;
      action = Constants.adActionVSPpercent;
    } else if (this.mappedType === Constants.AdDeviceType.DIMMER) {
      this.value = val;
      action = Constants.adActionDimmerPercent;
    } else {
      callback(); return;
    }
    if (context && context == "Aquadaemon-MQTT") { callback(); return; }

    const millis = Date.now() - this.setStateLastCalled;
    if ( val == 100 && (millis <= 3 || this.state == false) ) {
      callback(); return;
    }
    this.platform.aquadaemon.updateDeviceStatus(this, val, function(success) { callback(); }.bind(this), action);
  },
  getValue : function(callback) {
    callback(null, this.value);
  },
  setTemperature : function(value, callback, context) {
    this.value = value;
    if (context && context == "Aquadaemon-MQTT") { callback(); return; }
    callback();
  },

  setDuration : function(value, callback, context) {
    this.timerDefaultDuration = value;
    if (context && context == "Aquadaemon-MQTT") { callback(); return; }
    this.platform.aquadaemon.updateDeviceStatus(this, value, function(success) { callback(); }.bind(this), Constants.adActionTimerDuration);
  },
  getDuration : function(callback) {
    callback(null, this.timerDefaultDuration); return;
  },
  setRemainingDuration : function(value, callback, context) {
    this.timerRemainingDuration = value;
    if (context && context == "Aquadaemon-MQTT") { callback(); return; }
    this.platform.aquadaemon.updateDeviceStatus(this, value, function(success) { callback(); }.bind(this), Constants.adActionTimerRemainingDuration);
  },
  getRemainingDuration : function(callback) {
    callback(null, this.timerRemainingDuration); return;
  },

  // ==========================================
  // UNIFIED SENSOR GETTER FIX
  // Eliminates getTemperature, getAmbientLightLevel, getCarbonDioxideLevel
  // ==========================================
  getSensorValue : function(callback) {
    let val = this.value;
    if (typeof val === 'undefined' || val === null || isNaN(val)) val = 0;

    // Apply HAP minimum limits to prevent alerts
    if (this.mappedType === Constants.AdDeviceType.LUX_SENSOR && val < 0.0001) val = 0.0001;
    if (this.mappedType === Constants.AdDeviceType.TEMPERATURE_SENSOR && typeof this.value === 'undefined') {
       val = Utils.parseAccessoryValue(this.mappedType, 0);
    }
    if (typeof callback === "function") callback(null, val);
  },
  
  setTargetTemperature : function(value, callback, context) {
    this.spvalue = value;
    if (context && context == "Aquadaemon-MQTT") { callback(); return; }
    this.platform.aquadaemon.updateDeviceStatus(this, value, function(success) { callback(); }.bind(this), Constants.adActionThermoSetpoint);
  },
  getTargetTemperature : function(callback) {
    callback(null, this.spvalue); return;
  },

  getServices : function() {
    this.services = [];
    var informationService = this.getService(Service.AccessoryInformation);
    if (!informationService) informationService = new Service.AccessoryInformation();
    informationService.setCharacteristic(Characteristic.Manufacturer, "AquaDaemon")
        .setCharacteristic(Characteristic.Model, /*this.type*/ Utils.adDevice2String(this.mappedType) )
        .setCharacteristic(Characteristic.FirmwareRevision, packageVersion)
        .setCharacteristic(Characteristic.SerialNumber,  this.name + " ("+this.platform.instanceName+")");
    this.services.push(informationService);

    var service;
    //if (this.mappedType === Constants.AdDeviceType.SWITCH ) {
    if (this.hkType === Constants.hkDeviceType.SWITCH ) {
      service = this.getService(Service.Switch);
      if (!service) service = new Service.Switch(this.name);
      this.getCharacteristic(service, Characteristic.On).on('set', this.setState.bind(this)).on('get', this.getState.bind(this));
    //} else if (this.mappedType === Constants.AdDeviceType.BINARY_SENSOR || this.mappedType === Constants.AdDeviceType.CONTACT_SENSOR) {
    } else if (this.hkType === Constants.hkDeviceType.CONTACT_SENSOR ) {
      service = this.getService(Service.ContactSensor);
      if (!service) service = new Service.ContactSensor(this.name);
      this.getCharacteristic(service, Characteristic.ContactSensorState).on('get', this.getState.bind(this));
      //this.getCharacteristic(service, Characteristic.On).on('set', this.setState.bind(this)).on('get', this.getState.bind(this));
    //} else if (this.mappedType === Constants.AdDeviceType.DIMMER) {
    } else if (this.hkType === Constants.hkDeviceType.DIMMER ) {
      service = this.getService(Service.Lightbulb);
      if (!service) service = new Service.Lightbulb(this.name);
      this.getCharacteristic(service, Characteristic.On).on('set', this.setState.bind(this)).on('get', this.getState.bind(this)); 
      this.getCharacteristic(service, Characteristic.Brightness).setProps({ minValue: 0, maxValue: 100, minStep: 1 })
          .on('set', this.setValue.bind(this)).on('get', this.getValue.bind(this));
    } else if (this.hkType === Constants.hkDeviceType.FAN ) {
      service = this.getService(Service.Fan);
      if (!service) service = new Service.Fan(this.name);
      this.getCharacteristic(service, Characteristic.On).on('set', this.setState.bind(this)).on('get', this.getState.bind(this));
      this.getCharacteristic(service, Characteristic.RotationSpeed).setProps({ minValue: 0, maxValue: 100 })
          .on('set', this.setValue.bind(this)).on('get', this.getValue.bind(this));

    //} else if (this.mappedType === Constants.AdDeviceType.TEMPERATURE_SENSOR ) {
    } else if (this.hkType === Constants.hkDeviceType.TEMPERATURE_SENSOR ) {
      service = this.getService(Service.TemperatureSensor);
      if (!service) service = new Service.TemperatureSensor(this.name);
      this.getCharacteristic(service, Characteristic.CurrentTemperature).on('get', this.getSensorValue.bind(this)).on('set', this.setTemperature.bind(this));

    //} else if (this.mappedType === Constants.AdDeviceType.LUX_SENSOR || this.mappedType === Constants.AdDeviceType.PH_SENSOR || this.mappedType === Constants.AdDeviceType.ORP_SENSOR) {
    } else if (this.hkType === Constants.hkDeviceType.LUX_SENSOR ) {
      service = this.getService(Service.LightSensor);
      if (!service) service = new Service.LightSensor(this.name);
      if (this.mappedType === Constants.AdDeviceType.PH_SENSOR ) {
        // Use standard float value limits for chemistry readings (pH 0-14)
        this.getCharacteristic(service, Characteristic.CurrentAmbientLightLevel).setProps({ format: "float", minValue: Constants.adPhValueMin, maxValue: Constants.adPhValueMax });
      } else if (this.mappedType === Constants.AdDeviceType.ORP_SENSOR) {
        // Use standard float value limits for chemistry readings (ORP 0-1000)
        this.getCharacteristic(service, Characteristic.CurrentAmbientLightLevel).setProps({ format: "float", minValue: Constants.adORPValueMin, maxValue: Constants.adORPValueMax });
      } else if (this.mappedType === Constants.AdDeviceType.LEVEL_SENSOR) {
        // Use standard float value limits for chemistry readings (% 0-100)
        this.getCharacteristic(service, Characteristic.CurrentAmbientLightLevel).setProps({ format: "float", minValue: Constants.adPercentMin, maxValue: Constants.adPercentMax });
      
      } else {
        // Default limits for normal Lux sensors (e.g. 0.000 to 100000 lux)
        this.getCharacteristic(service, Characteristic.CurrentAmbientLightLevel).setProps({ minValue: 0.000, maxValue: 100000 });
      }
      this.getCharacteristic(service, Characteristic.CurrentAmbientLightLevel).on('get', this.getSensorValue.bind(this));

    //} else if (this.mappedType === Constants.AdDeviceType.CO2_SENSOR || this.mappedType === Constants.AdDeviceType.PPM_SENSOR) {
    } else if (this.hkType === Constants.hkDeviceType.CO2_SENSOR ) {  
      service = this.getService(Service.CarbonDioxideSensor);
      if (!service) service = new Service.CarbonDioxideSensor(this.name);
      // Hardcode 0 arrow func to block alerts, route level to unified getter
      this.getCharacteristic(service, Characteristic.CarbonDioxideDetected).on('get', (cb) => cb(null, 0));
      this.gracefullyAddCharacteristic(service, Characteristic.CarbonDioxideLevel).on('get', this.getSensorValue.bind(this));

    //} else if (this.mappedType === Constants.AdDeviceType.HEATER_THERMOSTAT || this.mappedType === Constants.AdDeviceType.SWG_CONTROLLER || this.mappedType === Constants.AdDeviceType.FREEZE_PROTECT || this.mappedType === Constants.AdDeviceType.CHILLER_THERMOSTAT) {
    } else if (this.hkType === Constants.hkDeviceType.THERMOSTAT ) {
      service = this.getService(Service.Thermostat);
      if (!service) service = new Service.Thermostat(this.name);

      var minValue = Constants.adHeaterTargetMin; 
      var maxValue = Constants.adHeaterTargetMax; 
      var validValues = [0, 1];

      // Cleanly separate configuration logic without complex nested string checks
      if (this.mappedType === Constants.AdDeviceType.SWG_CONTROLLER) {
         minValue = Constants.adPercentTargetMin; 
         maxValue = Constants.adPercentTargetMax; 
         validValues = [0,2]; 
      } else if (this.mappedType === Constants.AdDeviceType.FREEZE_PROTECT) {
         minValue = Constants.adFrzProtectTargetMin; 
         maxValue = Constants.adFrzProtectTargetMax; 
         validValues = [0,2]; 
      } else if (this.mappedType === Constants.AdDeviceType.CHILLER_THERMOSTAT) {
         validValues = [0,2]; 
      }

      this.getCharacteristic(service, Characteristic.TargetTemperature).setProps({ format: "float", minValue: minValue, maxValue: maxValue });
      this.getCharacteristic(service, Characteristic.TargetHeatingCoolingState).setProps({ validValues: validValues });
      this.getCharacteristic(service, Characteristic.CurrentTemperature).setProps({ format: "float", minValue: Constants.adTempMin, maxValue: Constants.adTempMax });

      this.getCharacteristic(service, Characteristic.CurrentHeatingCoolingState).on('get', this.getState.bind(this)).on('set', this.setState.bind(this));
      this.getCharacteristic(service, Characteristic.TargetHeatingCoolingState).on('get', this.getTargetState.bind(this)).on('set', this.setTargetState.bind(this));
      this.getCharacteristic(service, Characteristic.CurrentTemperature).on('get', this.getSensorValue.bind(this)).on('set', this.setTemperature.bind(this));
      this.getCharacteristic(service, Characteristic.TargetTemperature).on('get', this.getTargetTemperature.bind(this)).on('set', this.setTargetTemperature.bind(this));
    
    } else if (this.hkType === Constants.hkDeviceType.VALVE ) {
      service = this.getService(Service.Valve);
      if (!service) service = new Service.Valve(this.name);

      var minValue = Constants.adValveDurationMin; 
      var maxValue = this.timerMaxDuration > 0 ? this.timerMaxDuration : Constants.adValveDurationMax; 
      var minStep = 1; // Default fallback

      // Dynamic minStep calculation based on maxValue brackets (values in seconds)
      if (maxValue <= 300) {          // 5 minutes or less (e.g., your 30s or 60s acid doser)
        minStep = 5;                  // 5-second steps
      } else if (maxValue <= 1800) {   // 30 minutes or less (e.g., your 25 min chlorine doser)
        minStep = 60;                 // 1-minute steps
      } else if (maxValue <= 3600) {   // 1 hour or less (e.g., your 30 min water fill)
        minStep = 300;                // 5-minute steps
      } else {                         // Anything over 1 hour (up to 2+ hours)
        minStep = 600;                // 10-minute steps
      }

      // Safety check: Ensure minValue is a multiple of minStep to prevent HomeKit UI glitching
      //minValue = minStep
      // minValue needs to be 0, since default 0 runtime is valid being sent over MQTT.

      service.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.GENERIC_VALVE);
      this.getCharacteristic(service, Characteristic.SetDuration).setProps({minValue: minValue, maxValue: maxValue, minStep: minStep});
      this.getCharacteristic(service, Characteristic.RemainingDuration).setProps({minValue: 0, maxValue: maxValue, minStep: minStep});

      // this.getCharacteristic(service, Characteristic.On).on('set', this.setState.bind(this)).on('get', this.getState.bind(this));
      this.getCharacteristic(service, Characteristic.Active).on('set', this.setState.bind(this)).on('get', this.getState.bind(this));
      this.getCharacteristic(service, Characteristic.InUse).on('set', this.setState.bind(this)).on('get', this.getState.bind(this));
      //this.getCharacteristic(service, Characteristic.RemainingDuration).on('get', this.getRemainingDuration.bind(this)).on('set', this.setRemainingDuration.bind(this, service));
      this.getCharacteristic(service, Characteristic.RemainingDuration).on('set', this.setRemainingDuration.bind(this)).on('get', this.getRemainingDuration.bind(this));
      this.getCharacteristic(service, Characteristic.SetDuration).on('set', this.setDuration.bind(this)).on('get', this.getDuration.bind(this));
    
    } 

    if (service) this.services.push(service);
    return this.services;
  },

  handleMQTTMessage : function(topic, message, callback) {
    var value = parseInt(message);
    var service = false;
    var characteristic;

    // AquachemD uses topic ending with state.
    if (this.id+"/state" == topic) {
      this.platform.log("GOT state for "+this.id+" to "+value+" type="+this.mappedType+", hktype="+Utils.hkDevice2String(this.hkType));

      //if (this.mappedType === Constants.AdDeviceType.BINARY_SENSOR || this.mappedType === Constants.AdDeviceType.CONTACT_SENSOR) {
      if (this.hkType === Constants.hkDeviceType.CONTACT_SENSOR ) {
        service = this.getService(Service.ContactSensor); 
        characteristic = this.getCharacteristic(service, Characteristic.ContactSensorState);
        
        this.setState((value === 1)?1:0, function() {}, "Aquadaemon-MQTT");

        value = (value === 1) 
              ? Characteristic.ContactSensorState.CONTACT_DETECTED 
              : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
      } else if (this.mappedType === Constants.AdDeviceType.SWITCH) {
        //this.setFullState((value === 1)?1:0, function() {}, "Aquadaemon-MQTT");
        this.fullState = value;
        service = this.getService(Service.Switch);
        characteristic = this.getCharacteristic(service, Characteristic.On);
        value = Utils.parseAccessoryState(this.mappedType, value);
      } else if (this.mappedType === Constants.AdDeviceType.DOSER) {
        //this.setFullState((value === 1)?1:0, function() {}, "Aquadaemon-MQTT");
        this.fullState = value;
        service = this.getService(Service.Valve);
        characteristic = this.getCharacteristic(service, Characteristic.InUse);
        value = Utils.parseAccessoryState(this.mappedType, value);
      }
    }

    if (this.id == topic) {
      //if (this.mappedType === Constants.AdDeviceType.SWITCH) {
      if (this.hkType === Constants.hkDeviceType.SWITCH ) {
        service = this.getService(Service.Switch);
        characteristic = this.getCharacteristic(service, Characteristic.On);
      } else if (this.hkType === Constants.hkDeviceType.FAN ) {
        service = this.getService(Service.Fan);
        characteristic = this.getCharacteristic(service, Characteristic.On);
      //} else if (this.mappedType === Constants.AdDeviceType.DIMMER) {
      } else if (this.hkType === Constants.hkDeviceType.DIMMER ) {
        service = this.getService(Service.Lightbulb);
        characteristic = this.getCharacteristic(service, Characteristic.On);
      //} else if (this.mappedType === Constants.AdDeviceType.TEMPERATURE_SENSOR ) {
      } else if (this.hkType === Constants.hkDeviceType.TEMPERATURE_SENSOR ) {
        if (this.platform.isUserDeviceDegC === false && 
            this.mappedType === Constants.AdDeviceType.TEMPERATURE_SENSOR && 
            this.id.slice(-2) !== "_f" && 
            ( this.platform.connectedServerType === Constants.serverType.AQUACHEMD && this.sourceUOM !== "°C")) 
        {
          value = Utils.degFtoC(Utils.parseAccessoryValue(this.mappedType, message));
          this.platform.log("Converting temperature from F to C for "+this.name+" ("+value+" from "+Utils.parseAccessoryValue(this.mappedType, message)+")");
        } else {
          value = Utils.parseAccessoryValue(this.mappedType, message);
          this.platform.log("Temperature for "+this.name+" is ("+value+")");
        }
        service = this.getService(Service.TemperatureSensor);
        characteristic = this.getCharacteristic(service, Characteristic.CurrentTemperature);
        this.value = value;
      //} else if (this.mappedType === Constants.AdDeviceType.LUX_SENSOR || this.mappedType === Constants.AdDeviceType.PH_SENSOR || this.mappedType === Constants.AdDeviceType.ORP_SENSOR) {
      } else if (this.hkType === Constants.hkDeviceType.LUX_SENSOR ) {
        this.value = parseFloat(message);
        if (isNaN(this.value) || this.value < 0.0001) this.value = 0.0001;
        value = this.value;
        service = this.getService(Service.LightSensor);
        characteristic = this.getCharacteristic(service, Characteristic.CurrentAmbientLightLevel);
      //} else if (this.mappedType === Constants.AdDeviceType.CO2_SENSOR || this.mappedType === Constants.AdDeviceType.PPM_SENSOR) {
      } else if (this.hkType === Constants.hkDeviceType.CO2_SENSOR ) {
        this.value = parseFloat(message);
        if (isNaN(this.value)) this.value = 0;
        value = this.value;
        service = this.getService(Service.CarbonDioxideSensor);
        characteristic = this.getCharacteristic(service, Characteristic.CarbonDioxideLevel);
      //} else if (this.mappedType === Constants.AdDeviceType.HEATER_THERMOSTAT || this.mappedType === Constants.AdDeviceType.SWG_CONTROLLER || this.mappedType === Constants.AdDeviceType.FREEZE_PROTECT || this.mappedType === Constants.AdDeviceType.CHILLER_THERMOSTAT) {
      } else if (this.hkType === Constants.hkDeviceType.THERMOSTAT ) {
        service = this.getService(Service.Thermostat);
        characteristic = this.getCharacteristic(service, Characteristic.CurrentHeatingCoolingState);
      }
    }

    var pos = topic.lastIndexOf("/");
    var id_pos = topic.indexOf("/");

    //this.platform.forceLog("MQTT for "+this.name+", hktype="+Utils.hkDevice2String(this.hkType)+", Topic="+topic.substring(pos+1)+", value="+value );

    if (pos != -1 && topic.substring(pos+1) == "enabled") {
      if (this.id == topic.substring(0, pos)) {
        if (this.mappedType === Constants.AdDeviceType.FREEZE_PROTECT && value == 1) value = 2; // Fixes your validValues warning array error
        service = this.getService(Service.Thermostat);
        characteristic = this.getCharacteristic(service, Characteristic.TargetHeatingCoolingState);
      }
    } else if (pos != -1 && topic.substring(pos+1) == "setpoint") {
      if (this.id == topic.substring(0, pos)) {
        value = Utils.parseAccessoryTargetValue(this.mappedType, message);
        service = this.getService(Service.Thermostat);
        characteristic = this.getCharacteristic(service, Characteristic.TargetTemperature);
      }
    } else if (pos != -1 && topic.substring(pos+1) == "Speed" && this.hkType === Constants.hkDeviceType.FAN) {
      if (this.id == topic.substring(0, pos)) {
        value = Utils.parseAccessoryTargetValue(this.mappedType, message);
        service = this.getService(Service.Fan);
        characteristic = this.getCharacteristic(service, Characteristic.RotationSpeed);
      }
    } else if (pos != -1 && topic.substring(pos+1) == "brightness" && this.hkType === Constants.hkDeviceType.DIMMER) {
      if (this.id == topic.substring(0, pos)) {
        value = Utils.parseAccessoryTargetValue(this.mappedType, message);
        service = this.getService(Service.Lightbulb);
        characteristic = this.getCharacteristic(service, Characteristic.Brightness);
      }
    } else if (pos != -1 && topic.substring(pos+1) == "default" && this.hkType === Constants.hkDeviceType.VALVE) {
      if (this.id == topic.substring(0, id_pos)) {
        value = Utils.parseAccessoryTargetValue(this.mappedType, message);
        service = this.getService(Service.Valve);
        characteristic = this.getCharacteristic(service, Characteristic.SetDuration);
      }
    } else if (pos != -1 && topic.substring(pos+1) == "duration" && this.hkType === Constants.hkDeviceType.VALVE) {
      if (this.id == topic.substring(0, id_pos)) {
        value = Utils.parseAccessoryTargetValue(this.mappedType, message);
        service = this.getService(Service.Valve);
        characteristic = this.getCharacteristic(service, Characteristic.RemainingDuration);
      }
    } else if (pos != -1 && topic.substring(pos-6) == "timer/state" && this.hkType === Constants.hkDeviceType.VALVE) {
      if (this.id == topic.substring(0, id_pos)) {
        value = Utils.parseAccessoryState(this.mappedType, value);
        service = this.getService(Service.Valve);
        characteristic = this.getCharacteristic(service, Characteristic.InUse); // InUse is actual state, and was set above
      }
    // Hardcoded Legacy MQTT Topic Routes
    } else if (topic == "Temperature/Pool" && (this.id == "Pool_Heater" || this.id == "Chiller")) {
      service = this.getService(Service.Thermostat);
      value = Utils.parseAccessoryValue(this.mappedType, message);
      characteristic = this.getCharacteristic(service, Characteristic.CurrentTemperature);
    } else if (topic == "Temperature/Spa" && this.id == "Spa_Heater") {
      service = this.getService(Service.Thermostat);
      value = Utils.parseAccessoryValue(this.mappedType, message);
      characteristic = this.getCharacteristic(service, Characteristic.CurrentTemperature);
    } else if (topic == "Temperature/Air" && this.id == "Freeze_Protect") {
      service = this.getService(Service.Thermostat);
      value = Utils.parseAccessoryValue(this.mappedType, message);
      characteristic = this.getCharacteristic(service, Characteristic.CurrentTemperature);
    } else if (topic == "SWG/Percent_f" && this.id == "SWG") {
      service = this.getService(Service.Thermostat);
      value = Utils.parseAccessoryValue(this.mappedType, message);
      characteristic = this.getCharacteristic(service, Characteristic.CurrentTemperature);
    }

    if (service != false && characteristic != false) {
      callback(characteristic, value);
    }
  }
}