var mqtt = require('mqtt');

module.exports = {
  Mqtt: Mqtt
}

function Mqtt(aPlatform, host, port, channel, credentials) {
  this.platform = aPlatform; // Bound to this specific instance
  this.client = null;        // Instance specific client
  this.serviceMode = false;  // Instance specific state

  this.config = {host: host, port: port, credentials: credentials, channel: channel};
  if (typeof this.config.credentials === 'undefined' || typeof this.config.credentials.username === 'undefined' || this.config.credentials.username.length == 0) {
    this.config.credentials = false;
  }
  this.connect();
}

Mqtt.prototype.connect = function() {
  var self = this; // Use this to reference the class instance inside callbacks

  var connectOptions = {
    host: self.config.host,
    port: self.config.port
  };

  if (self.config.credentials) {
    connectOptions.username = self.config.credentials.username;
    connectOptions.password = self.config.credentials.password;
  }

  self.platform.forceLog("Connecting MQTT broker to " + self.config.host + ":" + self.config.port + " with topic " + self.config.channel);

  self.client = mqtt.connect(connectOptions);

  self.client.on('connect', function() {
    self.platform.forceLog("Successfully connected to MQTT broker.");
    self.client.subscribe(self.config.channel + "/#");
  });

  self.client.on('close', function(error) {
    self.client.end(true, function() {
      self.error("Retrying in 5 seconds...");
      setTimeout(function() {
        self.platform.forceLog("Retrying connection to MQTT broker...");
        self.connect();
      }, 5000);
    });
  });

  self.client.on('error', function(error) {
    self.platform.forceLog.error("ERROR connecting to MQTT broker.");
    self.client.end(true, function() {
      self.error(error);
    });
  });

  self.client.on('message', function (topic, buffer) {
      if (topic.substring(topic.lastIndexOf("/")+1) == "Service_Mode") {
        if (parseInt(buffer.toString()) != 0) {
          self.platform.forceLog.error("Pool is in service mode, commands will be ignored!");
          self.serviceMode = true;
        } else if (self.serviceMode == true) {
          self.platform.forceLog("Pool is not in service mode");
          self.serviceMode = false;
        }
        return;
      } 
      if (topic.substring(topic.lastIndexOf("/")+1) == "Alive") {
        if (parseInt(buffer.toString()) != 1) {
          self.platform.forceLog.error(self.platform.connectedServerType+" is offline!");
        } else {
          self.platform.forceLog(self.platform.connectedServerType+" is online");
        }
        return;
      }
      if (topic.substring(topic.lastIndexOf("/")+1) == "set" || 
          topic.substring(topic.lastIndexOf("/")+1) == "Alive" || 
          //topic.substring(topic.lastIndexOf("/")+1) == "duration" ||
          //topic.substring(topic.lastIndexOf("/")+1) == "default" ||
          //topic.substring(topic.lastIndexOf("/")+1) == "timer" ||
          topic.substring(topic.lastIndexOf("/")+1) == "Display_Message" ||
          topic.substring(topic.lastIndexOf("/")+1) == "Battery") {
        return;
      }
      
      self.platform.log("Received MQTT Message "+topic.toString() + " value "+buffer.toString());
      
      self.platform.accessories.forEach(function(accessory) {
        accessory.handleMQTTMessage(topic.substring(self.config.channel.length+1), buffer.toString(), function(characteristic, value) {
          if (typeof value !== 'undefined' && typeof characteristic !== 'undefined') {
            characteristic.setValue(value, null, "Aquadaemon-MQTT");
          }
        });
      });
  });
}

/*
Mqtt.prototype.send = function(topic, message) {
  if (this.client) {
    this.platform.log("MQTT send topic:'"+this.config.channel+"/"+topic+"' message:''"+message+"'");
    this.client.publish(this.config.channel+"/"+topic, message);
  } else {
    this.platform.forceLog.error("MQTT client not connected, cannot send message to topic '"+this.config.channel+"/"+topic+"'");
  }
}
*/

Mqtt.prototype.send = function(topic, message) {
  if (this.client) {
    this.platform.log("MQTT send topic:'"+this.config.channel+"/"+topic+"' message:'"+message+"'");
    
    this.client.publish(this.config.channel+"/"+topic, message, function(err) {
      if (err) {
        this.platform.forceLog.error("MQTT publish error: " + err);
      }
    }.bind(this));
  } else {
    this.platform.forceLog.error("MQTT client not connected, cannot send message to topic '"+this.config.channel+"/"+topic+"'");
  }
}


Mqtt.prototype.error = function(error) {
  var logMessage = "Could not connect to MQTT broker! (" + this.config.host + ":" + this.config.port + ")\n";

  if (this.config.credentials !== false) {
    logMessage += "Note: You're using a username and password to connect. Please verify your username and password too.\n";
  }

  if (error) {
    logMessage += error;
  }

  this.platform.forceLog.error(logMessage);
};