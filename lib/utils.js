var inherits = require('util').inherits;
var Constants = require('./constants.js');

module.exports = {
    Utils: Utils
}

function Utils() {}

// The Ingestion Adapter: Normalizes all versions into our internal Enums
Utils.normalizeDevice = function(key, device) {
  let mappedType = null;
  
  // Detect if payload is AquachemD (uses standard sensor/binary_sensor layout)
  if (device.type === 'sensor' || device.type === 'binary_sensor' || (device.attributes && device.attributes.includes('set_on'))) {
     switch (device.type) {
       case 'switch':
         mappedType = Constants.AdDeviceType.SWITCH; break;
       case 'binary_sensor':
         mappedType = Constants.AdDeviceType.BINARY_SENSOR; break;
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
            mappedType = Constants.AdDeviceType.LUX_SENSOR;
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
         mappedType = Constants.AdDeviceType.SWITCH; break;
       case Constants.adDeviceSwitchVSP:
         mappedType = Constants.AdDeviceType.VSP_FAN; break;
       case Constants.adDeviceDimmer:
         mappedType = Constants.AdDeviceType.DIMMER; break;
       case Constants.adDeviceTemperature:
         mappedType = Constants.AdDeviceType.TEMPERATURE_SENSOR; break;
       case Constants.adDeviceLux:
         mappedType = Constants.AdDeviceType.LUX_SENSOR; break;
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
         else mappedType = Constants.AdDeviceType.TEMPERATURE_SENSOR;
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

Utils.adDevice2hkSDevice = function(adDevice) {
  switch (adDevice) {
    case Constants.AdDeviceType.TEMPERATURE_SENSOR:
    case Constants.AdDeviceType.TEMPERATURE_VALUE_SENSOR:
      return Constants.hkDeviceType.TEMPERATURE_SENSOR;
    break;
    case Constants.AdDeviceType.SWITCH:
      return Constants.hkDeviceType.SWITCH;
    break;
    case Constants.AdDeviceType.CONTACT_SENSOR: // remove
    case Constants.AdDeviceType.BINARY_SENSOR:
      return Constants.hkDeviceType.CONTACT_SENSOR;
    break;
    case Constants.AdDeviceType.PH_SENSOR:
    case Constants.AdDeviceType.ORP_SENSOR:
    case Constants.AdDeviceType.LUX_SENSOR: // remove
    case Constants.AdDeviceType.PPM_SENSOR:
      return Constants.hkDeviceType.LUX_SENSOR;
    break;
    case Constants.AdDeviceType.HEATER_THERMOSTAT:
    case Constants.AdDeviceType.CHILLER_THERMOSTAT:
    case Constants.AdDeviceType.FREEZE_PROTECT:
    case Constants.AdDeviceType.SWG_CONTROLLER:
      return Constants.hkDeviceType.THERMOSTAT;
    break;
    case Constants.AdDeviceType.VSP_FAN:
      return Constants.hkDeviceType.FAN;
    break;
    case Constants.AdDeviceType.DIMMER:
      return Constants.hkDeviceType.DIMMER;
    break;
    case Constants.AdDeviceType.CO2_SENSOR:
      return Constants.hkDeviceType.CO2_SENSOR;
    break;
    default:
      return "";
    break;
  }
}

Utils.adDevice2hkString = function(adDevice) {
  switch (Utils.adDevice2hkSDevice(adDevice)) {
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
      return "Valve";
    break;
    default:
      return "Unknown - "+adDevice;
    break;
  }
}

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
    case Constants.AdDeviceType.VSP_FAN:
    case Constants.adDeviceSwitchVSP:
    case Constants.AdDeviceType.DIMMER:
    case Constants.adDeviceDimmer:
      if (val > Constants.adPercentMax) val = Constants.adPercentMax;
      else if (val < Constants.adPercentMin) val = Constants.adPercentMin;
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
    case Constants.adDeviceValue:
      if (val > Constants.adValueMax) val = Constants.adValueMax;
      else if (val < Constants.adValueMin) val = Constants.adValueMin;
      break;
    case Constants.AdDeviceType.VSP_FAN:
    case Constants.adDeviceSwitchVSP:
    case Constants.AdDeviceType.DIMMER:
    case Constants.adDeviceDimmer:
      if (val > Constants.adPercentMax) val = Constants.adPercentMax;
      else if (val < Constants.adPercentMin) val = Constants.adPercentMin;
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