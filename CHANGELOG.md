# Changes

## 2.0.0

- [New] Optional House Usage, Grid Import, Grid Export and Battery tiles (mapped via `fields` config)
- [New] Homebridge settings UI (`config.schema.json`)
- [New] Optional Eve Watts characteristic (`eveCharacteristics`)
- [New] `logRaw` option to discover iSolarCloud field names
- [Change] Single shared poll (default 60s) updates all tiles in the background
- [Fix] 0 W no longer triggers HomeKit "illegal value" warnings
- [Fix] Clearer errors (HTTP status, login failure); removed redundant error handling
- [Change] Requires Node 18+ (uses built-in fetch)
- [Cleanup] Removed unused loginkey.pem

## 1.5.0

- [Fix] Added login to all api calls

## 1.4.0

- [Fix] Improved error handling and debugging

## 1.3.0

- [Fix] Addressed new encryption API issue

## 1.2.1

- [Fix] Added server parameter

## 1.1.3

- [Fix] Addressed issue with creating the accessory

## 1.1.0

- [Fix] Converted to TypeScript

## 1.0.5

- [Fix] Changed lowest lighting level to 1