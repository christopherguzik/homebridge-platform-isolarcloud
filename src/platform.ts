import {
  API,
  HAP,
  PlatformAccessory,
  PlatformConfig,
  Logger,
  Service,
  Characteristic
} from "homebridge";

const PluginName: string = require('../package.json').name;
const PlatformName = 'ISolarCloud';

let hap: HAP;

export = (api: API) => {
  hap = api.hap;
  api.registerPlatform(PluginName, PlatformName, PlatformISolarCloud);
};

import { ISolarCloudAPI, ISolarCloudPowerStationsAPI } from './isolarcloudapi';

// HomeKit's light sensor cannot be 0 (minimum is 0.0001)
const MIN_LEVEL = 0.0001;

// Eve app custom "Power Meter" service + "Consumption" (Watts) characteristic
const EVE_SERVICE_UUID = 'E863F007-079E-48FF-8F27-9C2605A29F52';
const EVE_WATTS_UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
const EVE_SUBTYPE = 'eve-power';

// Extra tiles, created only when a field path is set in config "fields"
const EXTRA_TILES: { key: string; label: string }[] = [
  { key: 'house', label: 'House Usage' },
  { key: 'gridImport', label: 'Grid Import' },
  { key: 'gridExport', label: 'Grid Export' },
  { key: 'battery', label: 'Battery' },
];

interface Tile {
  sensor: Service;
  eveWatts?: Characteristic;
}

class PlatformISolarCloud {
  private readonly server: string = "";
  private readonly email: string = "";
  private readonly password: string = "";
  private readonly fields: { [key: string]: string } = {};
  private readonly logRaw: boolean = false;
  private readonly eve: boolean = false;
  private readonly pollSeconds: number = 60;
  private accessories: { [uuid: string]: PlatformAccessory } = {};

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    if (!config || !config["email"] || !config["password"]) {
      this.log.error("Platform config incorrect or missing. Check the config.json file.");
      return;
    }

    this.server = config["server"];
    this.email = config["email"];
    this.password = config["password"];
    this.fields = config["fields"] || {};
    this.logRaw = !!config["logRaw"];
    this.eve = !!config["eveCharacteristics"];
    this.pollSeconds = Math.max(30, Number(config["pollSeconds"]) || 60);

    this.log.info('Starting PlatformISolarCloud using homebridge API', api.version);
    this.api.on("didFinishLaunching", () => this.loadPowerStations());
  }


  loadPowerStations() {
    const iSolarCloudAPI = new ISolarCloudAPI(this.log, this.server, this.email, this.password);

    iSolarCloudAPI.getPowerStations()
      .then((powerStations: ISolarCloudPowerStationsAPI[]) => {
        powerStations.forEach(powerStation => this.setupPowerStation(powerStation));
      })
      .catch(error => this.log.error('Power stations error: ' + error.message));
  }


  setupPowerStation(powerStation: ISolarCloudPowerStationsAPI) {
    const tiles: { [key: string]: Tile } = {};

    // Solar tile keeps the ORIGINAL uuid so existing installs keep their tile
    tiles['solar'] = this.getOrCreateTile(hap.uuid.generate(powerStation.id), powerStation.name);

    EXTRA_TILES.forEach(tile => {
      if (this.fields[tile.key]) {
        const name = powerStation.name + ' ' + tile.label;
        tiles[tile.key] = this.getOrCreateTile(hap.uuid.generate(powerStation.id + '-' + tile.key), name);
      }
    });

    // One shared poll updates every tile (one login + one API call per cycle)
    let pollInProgress = false;
    const poll = async () => {
      if (pollInProgress) return;
      pollInProgress = true;
      try {
        const values = await powerStation.getEnergyFlow(this.fields, this.logRaw);
        Object.keys(tiles).forEach(key => {
          const watts = values[key];
          if (watts === undefined) {
            const source = key === 'solar' ? 'curr_power' : `fields.${key}`;
            this.log.warn(`No value found for "${key}" at "${source}" (enable logRaw to inspect the data)`);
            return;
          }
          this.log.debug(`${powerStation.name} ${key} = ${watts} W`);
          tiles[key].sensor
            .getCharacteristic(hap.Characteristic.CurrentAmbientLightLevel)
            .updateValue(Math.max(Math.abs(watts), MIN_LEVEL));
          tiles[key].eveWatts?.updateValue(Math.abs(watts));
        });
      } catch (error) {
        this.log.error('Energy poll error: ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        pollInProgress = false;
      }
    };

    poll();
    setInterval(poll, this.pollSeconds * 1000);
  }


  getOrCreateTile(uuid: string, name: string): Tile {
    let accessory = this.accessories[uuid];

    if (!accessory) {
      this.log.info('Creating new accessory', name);
      accessory = new this.api.platformAccessory(name, uuid);
      this.api.registerPlatformAccessories(PluginName, PlatformName, [accessory]);
      this.accessories[uuid] = accessory;
    }

    accessory.getService(hap.Service.AccessoryInformation)!
      .setCharacteristic(hap.Characteristic.Name, name)
      .setCharacteristic(hap.Characteristic.Manufacturer, "iSolarCloud")
      .setCharacteristic(hap.Characteristic.SerialNumber, uuid.substring(0, 8))
      .setCharacteristic(hap.Characteristic.Model, "Power Station")
      .setCharacteristic(hap.Characteristic.FirmwareRevision, "1.0");

    let sensor = accessory.getService(hap.Service.LightSensor);
    if (!sensor) {
      sensor = accessory.addService(hap.Service.LightSensor, name);
    }

    // Allow the full range (1 W up to 100 kW+) and the 0 case
    sensor.getCharacteristic(hap.Characteristic.CurrentAmbientLightLevel)
      .setProps({ minValue: MIN_LEVEL, maxValue: 100000000 })
      .updateValue(MIN_LEVEL);

    const tile: Tile = { sensor };
    if (this.eve) {
      tile.eveWatts = this.getOrCreateEveWatts(accessory, name);
    }
    return tile;
  }


  // Adds Eve's custom Power Meter service so the Eve app shows real Watts
  getOrCreateEveWatts(accessory: PlatformAccessory, name: string): Characteristic {
    let service = accessory.getServiceById(EVE_SERVICE_UUID, EVE_SUBTYPE);
    if (!service) {
      service = new hap.Service(name + ' Power', EVE_SERVICE_UUID, EVE_SUBTYPE);
      accessory.addService(service);
    }

    let watts = service.getCharacteristic(EVE_WATTS_UUID);
    if (!watts) {
      watts = new hap.Characteristic('Consumption', EVE_WATTS_UUID, {
        format: hap.Formats.FLOAT,
        unit: 'W',
        minValue: 0,
        maxValue: 100000000,
        minStep: 0.1,
        perms: [hap.Perms.PAIRED_READ, hap.Perms.NOTIFY],
      });
      service.addCharacteristic(watts);
    }
    return watts;
  }


  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Remembered accessory, configuring handlers', accessory.displayName);
    this.accessories[accessory.UUID] = accessory;
  }
}
