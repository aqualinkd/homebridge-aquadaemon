var inherits = require('util').inherits;
var Constants = require('./constants.js');

// Internal lookup table for custom overrides
var _customMappings = {};

module.exports = {
    Utils: Utils
}

function Utils() {}

// Maps the lowercase config.schema.json values to the canonical Constants.serverType values.
// Case-insensitive so hand-edited config.json files aren't fragile.
Utils.normalizeServerType = function(value) {
  if (!value) return Constants.serverType.UNKNOWN;
  switch (String(value).toLowerCase()) {
    case 'aqualinkd':
      return Constants.serverType.AQUALINKD;
    case 'aquachemd':
      return Constants.serverType.AQUACHEMD;
    default:
      return Constants.serverType.UNKNOWN;
  }
}

// The Ingestion Adapter: Normalizes all versions into our internal Enums
// Should probably pass platform.serverType or platform.connectedServerType, make the logic switch on that for AqualinkD vs AquachemD
Utils.normalizeDevice = function(key, device) {
  let mappedType = null;
  
  // Detect if payload is AquachemD (uses standard sensor/binary_sensor layout)
  if (device.type === 'sensor' || device.type === 'binary_sensor' || device.type === 'level_sensor' || device.attributes?.includes('set_on')) {
    switch (device.type) {
      case 'switch':
        if (device.attributes?.includes('valve')) {
          mappedType = Constants.AdDeviceType.DOSER; break;
        } else {
          mappedType = Constants.AdDeviceType.SWITCH; break;
        }
      case 'binary_sensor':
        mappedType = Constants.AdDeviceType.BINARY_SENSOR; break;
      case 'level_sensor':
        mappedType = Constants.AdDeviceType.LEVEL_SENSOR; break;
      case 'sensor':
        if (key.startsWith('TEMP_')) mappedType = Constants.AdDeviceType.TEMPERATURE_SENSOR;
        else if (key.startsWith('PH_')) mappedType = Constants.AdDeviceType.PH_SENSOR;
        else if (key.startsWith('ORP_')) mappedType = Constants.AdDeviceType.ORP_SENSOR;
         //else if (key.startsWith('MQT_')) mappedType = Constants.AdDeviceType.SWG_CONTROLLER;
         //else if (key.startsWith('LUX_')) mappedType = Constants.AdDeviceType.LUX_SENSOR;
         //else if (key.startsWith('CO2_')) mappedType = Constants.AdDeviceType.CO2_SENSOR;
         //else if (key.startsWith('SYS_')) {
        else  {
          if (device.uom === "°C" || device.uom === "°F") {
            mappedType = Constants.AdDeviceType.TEMPERATURE_SENSOR;
          } else {
            mappedType = Constants.AdDeviceType.VALUE_SENSOR;
          }
        }
         //else mappedType = Constants.AdDeviceType.LUX_SENSOR; // Fallback
        break;
     }
  } else {
     // Detect if payload is Legacy AqualinkD
     switch (device.type) {
       case Constants.adDeviceSwitch:
       case Constants.adDeviceSwitchPrg:
        if (device.type_ext == Constants.adDeviceSwitchVSP) {
          mappedType = Constants.AdDeviceType.VARIABLE_SPEED_PUMP; break;
        } else if (device.type_ext == Constants.adDeviceSwitchPrg) {
          mappedType = Constants.AdDeviceType.LIGHT_PROGRAM; break;
        } else if (device.type_ext == Constants.adDeviceDimmer) {
          mappedType = Constants.AdDeviceType.DIMMER; break;
        }
        mappedType = Constants.AdDeviceType.SWITCH; break;
       case Constants.adDeviceDimmer:
         mappedType = Constants.AdDeviceType.DIMMER; break;
       case Constants.adDeviceTemperature:
         mappedType = Constants.AdDeviceType.TEMPERATURE_SENSOR; break;
       //case Constants.adDeviceLux:
       //  mappedType = Constants.AdDeviceType.LUX_SENSOR; break;
       case Constants.adDeviceCO2:
         mappedType = Constants.AdDeviceType.CO2_SENSOR; break;
       case Constants.adDeviceHeater:
         mappedType = Constants.AdDeviceType.HEATER_THERMOSTAT; break;
       case Constants.adDeviceChiller:
         mappedType = Constants.AdDeviceType.CHILLER_THERMOSTAT; break;
       case Constants.adDeviceFrzProtect:
         mappedType = Constants.AdDeviceType.FREEZE_PROTECT; break;
       case Constants.adDeviceSWGp:
         mappedType = Constants.AdDeviceType.SWG_CONTROLLER; break;
       case Constants.adDeviceValue:
         if (device.id.includes('pH')) mappedType = Constants.AdDeviceType.PH_SENSOR;
         else if (device.id.includes('ORP')) mappedType = Constants.AdDeviceType.ORP_SENSOR;
         else if (device.id.includes('SWG/PPM')) mappedType = Constants.AdDeviceType.PPM_SENSOR;
         else if (device.id.includes('SWG/Percent')) mappedType = Constants.AdDeviceType.SWG_CONTROLLER;
         else mappedType = Constants.AdDeviceType.VALUE_SENSOR;
         break;
     }
  }
  return mappedType;
}
// This Function is just for AqualinkD that sends _f on the ID's for use with Temperature sensors. Now moved to LUX.
Utils.normalizeID = function(device) {
  // Need to remove _f from ID's for ones that are no longer temp sensors.
    if (device.id.endsWith("_f")) {
      if ( device.mappedType == Constants.AdDeviceType.PPM_SENSOR ) {device.id = device.id.replace(/_f$/, '');}
      if ( device.mappedType == Constants.AdDeviceType.ORP_SENSOR ) {device.id = device.id.replace(/_f$/, '');}
      if ( device.mappedType == Constants.AdDeviceType.PH_SENSOR ) {device.id = device.id.replace(/_f$/, '');}
    }
}


Utils.addCustomadDevice2hkSDeviceMap = function(instanceId, adDevice, hkDevice) {
  if (instanceId !== undefined && adDevice !== undefined && hkDevice !== undefined) {
    if (!_customMappings[instanceId]) _customMappings[instanceId] = {};
    _customMappings[instanceId][adDevice] = hkDevice;
  }
}

/*****************************************************************************
 * This is the main mapping of sensors from Aquadaemon types to HomeKit types
 *****************************************************************************/

Utils.adDevice2hkSDevice = function(instanceId, adDevice) {
  var overrides = _customMappings[instanceId];
  if (overrides && overrides.hasOwnProperty(adDevice)) {
    return overrides[adDevice];
  }
  // ...unchanged fallback switch below...
}

Utils.adDevice2hkSDevice = function(instanceId, adDevice) {
  var overrides = _customMappings[instanceId];
  if (overrides && overrides.hasOwnProperty(adDevice)) {
    return overrides[adDevice];
  }
  // Fall back to standard defaults
  switch (adDevice) {
    case Constants.AdDeviceType.TEMPERATURE_SENSOR:
    case Constants.AdDeviceType.TEMPERATURE_VALUE_SENSOR:
      return Constants.hkDeviceType.TEMPERATURE_SENSOR;
    break;
    case Constants.AdDeviceType.SWITCH:
    case Constants.AdDeviceType.LIGHT_PROGRAM:
      return Constants.hkDeviceType.SWITCH;
    break;
    case Constants.AdDeviceType.CONTACT_SENSOR: // remove
    case Constants.AdDeviceType.BINARY_SENSOR:
      return Constants.hkDeviceType.CONTACT_SENSOR;
    break;
    case Constants.AdDeviceType.PH_SENSOR:
    case Constants.AdDeviceType.ORP_SENSOR:
    //case Constants.AdDeviceType.LUX_SENSOR: // remove
    case Constants.AdDeviceType.PPM_SENSOR:
    case Constants.AdDeviceType.LEVEL_SENSOR:
    case Constants.AdDeviceType.VALUE_SENSOR:
      return Constants.hkDeviceType.LUX_SENSOR;
    break;
    case Constants.AdDeviceType.HEATER_THERMOSTAT:
    case Constants.AdDeviceType.CHILLER_THERMOSTAT:
    case Constants.AdDeviceType.FREEZE_PROTECT:
    case Constants.AdDeviceType.SWG_CONTROLLER:
      return Constants.hkDeviceType.THERMOSTAT;
    break;
    break;
    case Constants.AdDeviceType.DIMMER:
      return Constants.hkDeviceType.DIMMER;
    break;
    case Constants.AdDeviceType.CO2_SENSOR:
      return Constants.hkDeviceType.CO2_SENSOR;
    break;
    case Constants.AdDeviceType.DOSER:
      return Constants.hkDeviceType.VALVE;
      //return Constants.hkDeviceType.SWITCH;
    case Constants.AdDeviceType.VARIABLE_SPEED_PUMP:
      return Constants.hkDeviceType.SWITCH;
      //return Constants.hkDeviceType.FAN;
    default:
      return "";
    break;
  }
}

Utils.adDevice2String = function(adDevice) {
  switch (adDevice) {
    case Constants.AdDeviceType.SWITCH:
      return 'Switch';
    case Constants.AdDeviceType.BINARY_SENSOR:
      return 'Binary Sensor';
    case Constants.AdDeviceType.CONTACT_SENSOR:
      return 'Contact Sensor';
    case Constants.AdDeviceType.LEVEL_SENSOR:
      return 'Level Sensor';
    //case Constants.AdDeviceType.SWITCH_PROGRAM:
    //  return 'Switch Program';
    case Constants.AdDeviceType.TEMPERATURE_SENSOR:
      return 'Temperature Sensor';
    case Constants.AdDeviceType.TEMPERATURE_VALUE_SENSOR:
      return 'Temperature Value Sensor';
    case Constants.AdDeviceType.VALUE_SENSOR:
      return 'Value Sensor';
    case Constants.AdDeviceType.PH_SENSOR:
      return 'Ph Sensor';
    case Constants.AdDeviceType.ORP_SENSOR:
      return 'Orp Sensor';
    case Constants.AdDeviceType.CO2_SENSOR:
      return 'Co2 Sensor';
    case Constants.AdDeviceType.PPM_SENSOR:
      return 'Ppm Sensor';
    case Constants.AdDeviceType.HEATER_THERMOSTAT:
      return 'Heater Thermostat';
    case Constants.AdDeviceType.CHILLER_THERMOSTAT:
      return 'Chiller Thermostat';
    case Constants.AdDeviceType.FREEZE_PROTECT:
      return 'Freeze Protect';
    case Constants.AdDeviceType.SWG_CONTROLLER:
      return 'Swg Controller';
    case Constants.AdDeviceType.VARIABLE_SPEED_PUMP:
      return 'Variable Speed Pump';
    case Constants.AdDeviceType.DIMMER:
      return 'Dimmer';
    case Constants.AdDeviceType.DOSER:
      return 'Doser';
    case Constants.AdDeviceType.LIGHT_PROGRAM:
      return 'Light Programmable';
    default:
      return 'Unknown';
  }
};


Utils.hkDevice2String = function(hkDevice) {
  switch (hkDevice) {
    case Constants.hkDeviceType.TEMPERATURE_SENSOR:
      return "Temperature Sensor";
    break;
    case Constants.hkDeviceType.SWITCH:
      return "Switch";
    break;
    case Constants.hkDeviceType.CONTACT_SENSOR:
      return "Contact Sensor";
    break;
    case Constants.hkDeviceType.LUX_SENSOR:
      return "Lux Sensor";
    break;
    case Constants.hkDeviceType.THERMOSTAT:
      return "Thermostat";
    break;
    case Constants.hkDeviceType.FAN:
      return "Fan";
    break;
    case Constants.hkDeviceType.DIMMER:
      return "Light Dimmer";
    break;
    case Constants.hkDeviceType.CO2_SENSOR:
      return "CO2 Sensor";
    break;
    case Constants.hkDeviceType.VALVE:
      return "Valve";
    break;
    case Constants.hkDeviceType.SPRINKLER:
      return "Sprinkler";
    break;
    default:
      return "Unknown - "+hkDevice;
    break;
  }
}

Utils.adDevice2hkString = function(instanceId, adDevice) {
  return Utils.hkDevice2String(Utils.adDevice2hkSDevice(instanceId, adDevice));
}
/*
Utils.adDevice2hkString = function(adDevice) {
  return Utils.hkDevice2String(Utils.adDevice2hkSDevice(adDevice));
}
*/
Utils.LogConnectionError = function(platform, message, err) {
  var errorMessage = "There was a problem connecting to AquaDaemon.";
  if (message) errorMessage = message;
  if (err && err.statusCode) errorMessage += " (HTTP Status code " + err.statusCode + ")\n" + err.body;
  else if (err && err.statusText) errorMessage += " : `" + err.statusText + "`";
  else if (err && err.message) errorMessage += " : `" + err.message+ "`";
  else if (err) errorMessage += "\n - " + err;
  platform.forceLog.error(errorMessage);
}

Utils.degFtoC = function(value) { return (value - 32) * 5 / 9; }
Utils.degCtoF = function(value) { return value * 9 / 5 + 32; }

Utils.parseAccessoryTargetValue = function(type, value)  {
  var val = parseFloat(value);
  switch(type) {
    case Constants.AdDeviceType.SWG_CONTROLLER:
    case Constants.adDeviceSWGp:
      if (val > Constants.adPercentTargetMax) val = Constants.adPercentTargetMax;
      else if (val < Constants.adPercentTargetMin) val = Constants.adPercentTargetMin;
      break;
    case Constants.AdDeviceType.FREEZE_PROTECT:
    case Constants.adDeviceFrzProtect:
      if (val > Constants.adFrzProtectTargetMax) val = Constants.adFrzProtectTargetMax;
      else if (val < Constants.adFrzProtectTargetMin) val = Constants.adFrzProtectTargetMin;
      break;
    case Constants.AdDeviceType.VARIABLE_SPEED_PUMP:
    case Constants.AdDeviceType.DIMMER:
    case Constants.adDeviceDimmer:
      if (val > Constants.adPercentMax) val = Constants.adPercentMax;
      else if (val < Constants.adPercentMin) val = Constants.adPercentMin;
      break;
    case Constants.AdDeviceType.DOSER:
      // NEED TO COME BACK AND SET THESE.
      //if (val > Constants.adPercentMax) val = Constants.adPercentMax;
      //else if (val < Constants.adPercentMin) val = Constants.adPercentMin;
      break;
    case Constants.AdDeviceType.HEATER_THERMOSTAT:
    case Constants.adDeviceTemperature:
    default:
      if (val > Constants.adHeaterTargetMax) val = Constants.adHeaterTargetMax;
      else if (val < Constants.adHeaterTargetMin) val = Constants.adHeaterTargetMin;
      break;
  }
  return val;
}

Utils.parseAccessoryValue = function(type, value)  {
  var val = parseFloat(value);
  switch(type) {
    case Constants.AdDeviceType.SWG_CONTROLLER:
    case Constants.adDeviceSWGp:
      if (val > Constants.adPercentTargetMax) val = Constants.adPercentTargetMax;
      else if (val < Constants.adPercentTargetMin) val = Constants.adPercentTargetMin;
      break;
    case Constants.AdDeviceType.PH_SENSOR:
    case Constants.AdDeviceType.ORP_SENSOR:
    case Constants.AdDeviceType.PPM_SENSOR:
    case Constants.AdDeviceType.CO2_SENSOR:
    case Constants.AdDeviceType.TEMPERATURE_VALUE_SENSOR:
    case Constants.AdDeviceType.VALUE_SENSOR:
    case Constants.adDeviceValue:
      if (val > Constants.adValueMax) val = Constants.adValueMax;
      else if (val < Constants.adValueMin) val = Constants.adValueMin;
      break;
    case Constants.AdDeviceType.VARIABLE_SPEED_PUMP:
    case Constants.AdDeviceType.DIMMER:
    case Constants.adDeviceDimmer:
      if (val > Constants.adPercentMax) val = Constants.adPercentMax;
      else if (val < Constants.adPercentMin) val = Constants.adPercentMin;
      break;
    case Constants.AdDeviceType.DOSER:
      // NEED TO COME BACK AND SET THESE.
      //if (val > Constants.adPercentMax) val = Constants.adPercentMax;
      //else if (val < Constants.adPercentMin) val = Constants.adPercentMin;
      break;
    case Constants.AdDeviceType.HEATER_THERMOSTAT:
    case Constants.adDeviceTemperature:
    case Constants.adDeviceHeater:
    case Constants.adDeviceChiller:
    default:
      if (val > Constants.adTempMax) val = Constants.adTempMax;
      else if (val < Constants.adTempMin) val = Constants.adTempMin;
      break;
  }
  return val;
}

Utils.parseAccessoryState = function(type, value)  {
  switch(value) {
    case -1: // UNKNOWN
      return 0;
    case Constants.AdDeviceState.ACD_OFF: 
      return 0;
    case Constants.AdDeviceState.ACD_ON: 
      return 1;
    case Constants.AdDeviceState.ACD_ENABLED:  
      return 0;
    case Constants.AdDeviceState.ACD_DISABLED:  // DISABLED
      return 0;
    case Constants.AdDeviceState.ACD_DELAY:  // DELAY
      return 0;
    default:
      return 0;
  }

}

var TRUTHY_VALUES = 'y yes true on enabled'.split(/\s/);
Utils.toBool =  function(value) {
    value = value.toString().trim().toLowerCase();
    if(!value.length) return false;
    else if(!isNaN(Number(value))) return value > 0;
    else return TRUTHY_VALUES.indexOf(value) >= 0;
}

Utils.VersionString2Int = function(ver) {
  vstr = ver.split('.', 3).map(function (n) { 
    var x = parseInt(n, 10); 
    if (x < 10 && x > 0) return "0" + x; 
    else if (x==0) return "00"; 
    else return +x; 
  });
  return parseInt(vstr.join(""), 10);
}