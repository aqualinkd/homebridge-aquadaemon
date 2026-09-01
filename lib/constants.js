global.Service;
global.Characteristic;
global.Types;
global.UUID;
global.packageVersion;

// The Internal HomeKit-Centric Enum Strategy
const AdDeviceType = {
  SWITCH: 'SWITCH',
  BINARY_SENSOR: 'BINARY_SENSOR', // Use contact sensor
  CONTACT_SENSOR: 'CONTACT_SENSOR',
  LEVEL_SENSOR: 'LEVEL_SENSOR',
  //SWITCH_PROGRAM: 'SWITCH_PROGRAM',
  TEMPERATURE_SENSOR: 'TEMPERATURE_SENSOR',
  TEMPERATURE_VALUE_SENSOR: 'TEMPERATURE_VALUE_SENSOR', // Sensor that's used as generic value so needs converting.
  
  VALUE_SENSOR: 'VALUE_SENSOR', // Generic Value Sensor, default map to LUX.
  //LUX_SENSOR: 'LUX_SENSOR',
  PH_SENSOR: 'PH_SENSOR',
  ORP_SENSOR: 'ORP_SENSOR',
  
  CO2_SENSOR: 'CO2_SENSOR',
  PPM_SENSOR: 'PPM_SENSOR',

  HEATER_THERMOSTAT: 'HEATER_THERMOSTAT',
  CHILLER_THERMOSTAT: 'CHILLER_THERMOSTAT',
  FREEZE_PROTECT: 'FREEZE_PROTECT',
  SWG_CONTROLLER: 'SWG_CONTROLLER',
  VARIABLE_SPEED_PUMP: 'VARIABLE_SPEED_PUMP',
  DIMMER: 'DIMMER',
  DOSER: 'DOSER',
  LIGHT_PROGRAM: 'LIGHT_PROGRAM'
};

const hkDeviceType = {
  SWITCH: 'SWITCH',
  CONTACT_SENSOR: 'CONTACT_SENSOR',
  TEMPERATURE_SENSOR: 'TEMPERATURE_SENSOR',
  THERMOSTAT: 'THERMOSTAT',
  LUX_SENSOR: 'LUX_SENSOR',
  CO2_SENSOR: 'CO2_SENSOR',
  FAN: 'FAN',
  DIMMER: 'DIMMER',
  VALVE: 'VALVE',  // Option for doser 
  SPRINKLER: 'SPRINKLER' // Not used at present
}

const AdDeviceState = {
  ACD_OFF:0,     
  ACD_ON: 1,      
  ACD_ENABLED: 2,
  ACD_DISABLED: 3, // Sensor caused button to be disabled.
  ACD_DELAY: 4
}

const serverType = {
  UNKNOWN:   'Unknown',
  AQUALINKD: 'AqualinkD',
  AQUACHEMD: 'AquachemD'
}

module.exports = {
  AdDeviceType: AdDeviceType, // Export the new enum
  hkDeviceType: hkDeviceType,
  serverType: serverType,
  AdDeviceState: AdDeviceState,

  adDeviceSwitch : "switch",
  adDeviceTemperature : "temperature", 
  adDeviceHeater : "setpoint_thermo",
  adDeviceSWGp : "setpoint_swg",
  adDeviceChiller : "setpoint_chiller",
  adDeviceValue : "value",  
  adDeviceFrzProtect : "setpoint_freeze",
  adDeviceSwitchPrg : "switch_program",
  adDeviceSwitchVSP : "switch_vsp",
  adDeviceDimmer : "light_dimmer",  
  adDeviceVSPfan : "vsp_fan",
  //adDeviceLux: "lux_sensor",
  //adDeviceCO2: "co2_sensor",    

  statusStatus: 0,
  adActionThermoTargetState: 1, 
  adActionThermoSetpoint: 2,
  adActionVSPpercent: 3,
  adActionDimmerPercent: 4,
  adActionTimerDuration: 5,
  adActionTimerRemainingDuration: 6,

  adTempMax : 100,
  adTempMin : -18, // -18 is 0
  adHeaterTargetMax : 40.8, // 40 is 104
  adHeaterTargetMin : 2,
  adPercentTargetMax : 38, // 38 is 100
  adPercentTargetMin : -18,
  adFrzProtectTargetMax : 6,
  adFrzProtectTargetMin : 1,
  adValveDurationMin : 0,
  adValveDurationMax : 3600,
  adValueMax : 4500,
  //adValueMin : -18,
  adValueMin : -30,
  adPercentMax : 100,
  adPercentMin : 0,
  adPhValueMin : 0,
  adPhValueMax : 10,
  adORPValueMin : 0,
  adORPValueMax : 1000,
  adNone: 256
}