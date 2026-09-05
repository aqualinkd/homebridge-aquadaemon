
# homebridge-aquadaemon

[![npm](https://img.shields.io/npm/v/homebridge-aquadaemon)](https://www.npmjs.com/package/homebridge-aquadaemon)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-aquadaemon)](https://www.npmjs.com/package/homebridge-aquadaemon)

A [Homebridge](https://homebridge.io) platform plugin that brings your pool onto Apple HomeKit via **AquaDaemon** — [AqualinkD](https://github.com/AqualinkD/aqualinkd) (Jandy/AquaLink pool controllers) and/or [AquachemD](https://github.com/AqualinkD/aquachemd) (water chemistry / dosing controllers).

Every devices, Pumps, lights, heaters, valves, SWG, sensors, and chemistry readings are automatically discovered from your AquaDaemon server and exposed as native HomeKit accessories — no manual accessory configuration required.

## Requirements

- Homebridge `^1.6.0` or `^2.0.0-beta.0`
- Node.js `>=20.19.0`
- A running instance of [AqualinkD](https://github.com/AqualinkD/aqualinkd) and/or [AquachemD](https://github.com/AqualinkD/aquachemd), reachable over HTTP
- An MQTT broker that your AquaDaemon server(s) publish to (for live/pushed accessory updates)

## Installation

### Via Homebridge UI (recommended)

1. Open Homebridge UI → **Plugins**
2. Search for **AquaDaemon**
3. Click **Install**
4. Configure via the **Settings** form (see [Configuration](#configuration) below)

### Manual installation

```bash
sudo npm install -g homebridge-aquadaemon
```

Then add a platform block to your Homebridge `config.json` (see below).

## Configuration

This plugin uses a **single platform entry** that can manage **multiple AquaDaemon server instances** — for example, an AqualinkD pool controller and an AquachemD dosing controller, or separate pool and spa servers, all from one Homebridge install. Configure this through the Homebridge UI form, or by hand:

```json
{
  "platforms": [
    {
      "platform": "AquaDaemon",
      "name": "AquaDaemon",
      "instances": [
        {
          "name": "Pool AqualinkD",
          "serverType": "aqualinkd",
          "server": "aqualinkd.local",
          "port": 80,
          "mqtt_host": "127.0.0.1",
          "mqtt_port": 1883,
          "mqtt_topic": "aqualinkd",
          "VSP_as_Fan": true
        },
        {
          "name": "Pool AquachemD",
          "serverType": "aquachemd",
          "server": "aquachemd.local",
          "port": 80,
          "mqtt_host": "127.0.0.1",
          "mqtt_port": 1883,
          "mqtt_topic": "aquachemd",
          "doser_as_switch": false
        }
      ]
    }
  ]
}
```

### Instance options

| Option | Applies to | Description |
|---|---|---|
| `name` | Both | Unique name for this server connection. Used to namespace its accessories — **do not change after initial setup**. |
| `serverType` | Both | `aqualinkd` or `aquachemd` — which daemon this instance connects to. |
| `server` | Both | Hostname or IP of the AquaDaemon server. |
| `port` | Both | HTTP port the daemon is listening on. |
| `mqtt_host` | Both | Hostname or IP of the MQTT broker. |
| `mqtt_port` | Both | MQTT broker port. |
| `mqtt_topic` | Both | Root MQTT topic this daemon publishes to. Must be unique per instance if instances share a broker. |
| `mqtt_username` / `mqtt_password` | Both | MQTT broker credentials, if required. |
| `VSP_as_Fan` | AqualinkD | Expose variable-speed pumps as HomeKit Fans (adjustable speed %) instead of a plain on/off switch. |
| `use_legacy_temp_sensors` | AqualinkD | Show chemistry readings (ORP/pH/salt PPM) as Temperature Sensors, matching pre-2.x plugin behavior. Only enable this if you have existing automations built around the old temperature-based readings — new setups should leave it off; these readings display as Light Sensors by default. |
| `doser_as_switch` | AquachemD | Expose a doser as a simple on/off Switch instead of a Valve. Switches are simpler; Valves let you set and see a countdown timer for how long the doser runs. |
| `no_delete_on_sync` | Both | When enabled, accessories that disappear from the server are left in HomeKit instead of being removed automatically (manual removal required). |
| `excludedDevices` | Both | List of device IDs to hide from HomeKit. Visit `http://<server>/api/devices` on your AquaDaemon server to find device IDs. |

## Device mapping

AquaDaemon devices are mapped to HomeKit accessory types automatically:

| AquaDaemon device | HomeKit accessory |
|---|---|
| Switch / relay | Switch |
| Variable speed pump | Fan (if `VSP_as_Fan` enabled) or Switch |
| Dimmer / light | Lightbulb |
| Binary / contact sensor | Contact Sensor |
| Temperature sensor | Temperature Sensor |
| ORP / pH / salt PPM / generic value sensor | Light Sensor (or Temperature Sensor if `use_legacy_temp_sensors` enabled) |
| CO2 sensor | Carbon Dioxide Sensor |
| Heater, chiller, freeze protection, SWG controller | Thermostat |
| Doser | Valve (or Switch if `doser_as_switch` enabled) |

## Getting device IDs for exclusion

Each AquaDaemon server exposes its full device list at:

```
http://<server>/api/devices
```

Use the `id` field of any device you want hidden from HomeKit in the `excludedDevices` list for that instance.

## Troubleshooting

- **An accessory is missing or in the wrong room after adding a new instance** — restart Homebridge after adding or renaming an instance so accessories can sync.
- **Values look wrong or a characteristic warning appears in the logs** — please open a [GitHub issue](https://github.com/aqualinkd/homebridge-aquadaemon/issues) with the relevant log lines; include your `serverType` and the device ID involved.
- **MQTT updates aren't arriving** — confirm `mqtt_host`/`mqtt_port` point at the same broker your AquaDaemon server is configured to publish to, and that `mqtt_topic` matches its configured root topic.

## Related projects

- [AqualinkD](https://github.com/AqualinkD/aqualinkd) — Jandy/AquaLink pool controller daemon
- [AquachemD](https://github.com/AqualinkD/aquachemd) — water chemistry / dosing controller daemon

## Support

Please report bugs and feature requests via [GitHub Issues](https://github.com/aqualinkd/homebridge-aquadaemon/issues).

## License

ISC © Shaun Feakes