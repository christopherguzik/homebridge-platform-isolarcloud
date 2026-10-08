# homebridge-platform-isolarcloud

Homebridge plugin for **Sungrow iSolarCloud**. Shows your solar generation in HomeKit, plus house usage and grid import/export if your plant reports them.

> Forked from [MortJC/homebridge-platform-isolarcloud](https://github.com/MortJC/homebridge-platform-isolarcloud) (MIT). Original work by James Carvosso.

## How it appears in HomeKit

HomeKit has no native solar/energy accessory, so each value is a **light sensor** where **lux = watts** (4,200 lux = 4.2 kW). You can rename tiles and use them in automations (e.g. "when Grid Export is above 2000").

| Tile | Created when |
|---|---|
| Solar | Always |
| House Usage | `fields.house` is set |
| Grid Import | `fields.gridImport` is set |
| Grid Export | `fields.gridExport` is set |
| Solar to House | `fields.solarToHouse` is set |
| Solar to Grid | `fields.solarToGrid` is set |
| Grid to House | `fields.gridToHouse` is set |
| Battery | `fields.battery` is set |

Optionally, `eveCharacteristics` adds a real **Watts** reading for the **Eve** app. It is a live value only; there is no history graph.

## Installation

```
npm install -g @chris.guzik/homebridge-platform-isolarcloud
```

Requires Node 18+ and Homebridge 1.6+. Configure it in the Homebridge UI, or edit `config.json`.

## Configuration

```json
{
  "platform": "ISolarCloud",
  "name": "ISolarCloud",
  "server": "Australian",
  "email": "you@example.com",
  "password": "your-password",
  "pollSeconds": 60,
  "eveCharacteristics": false,
  "fields": {
    "house": "",
    "gridImport": "",
    "gridExport": "",
    "solarToHouse": "",
    "solarToGrid": "",
    "gridToHouse": ""
  }
}
```

| Option | Description |
|---|---|
| `server` | `Australian`, `European`, `Chinese` or `International` |
| `email`, `password` | Your iSolarCloud login |
| `pollSeconds` | Update interval, minimum 30 (default 60) |
| `eveCharacteristics` | Add Eve Watts characteristic |
| `logRaw` | Log all iSolarCloud fields (for setup) |
| `fields.*` | Field names for the extra tiles (see below) |

## Setting up House / Grid flow tiles

Field names depend on your plant, so you map them yourself once:

1. Set `"logRaw": true` and restart Homebridge.
2. Find the log line `RAW getPsDetail result_data = {...}`.
3. Find the fields holding live power for house usage, grid import/export, and (if provided) each direction of flow. Values can be plain numbers or `{ "value": ..., "unit": "kW" }`, and kW is converted to watts automatically. Nested fields use dots, e.g. `"load.value"`.
4. Put those names under the matching `fields` keys, set `logRaw` back to `false`, and restart. A tile is created only when its field path is configured.

`House Usage` is total home load. `Grid Import` and `Grid Export` are total grid flows; `Solar to House`, `Solar to Grid`, and `Grid to House` are optional directional measurements, and are created only if iSolarCloud reports those values. The plugin does not infer a flow from total production/consumption because battery charging, battery discharge, and meter placement can make that calculation inaccurate.

Check the log carefully before sharing it online, as it may contain names, addresses and plant IDs.

If no house or grid fields appear, your plant may not have a meter that reports them, or the data may be on a different iSolarCloud endpoint. Cumulative energy totals (for example, kWh/MWh values) are not live power readings and should not be mapped to these tiles. Please open an issue if you believe the live values are available but missing.

## Notes

- Zero values are shown as 0.0001 lux because HomeKit light sensors cannot be exactly 0.
- Export/import values are shown as positive numbers.
- This plugin uses the same unofficial web API as the iSolarCloud app and may break if Sungrow changes it.
- Not affiliated with Sungrow.

## Upgrading from 1.x

Your existing solar tile is kept. Node 18+ is now required.

## License

MIT. See [LICENSE](LICENSE).
