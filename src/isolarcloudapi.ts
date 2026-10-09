import { Logger } from "homebridge";
import { randomInt } from 'crypto';

import * as CryptoJS from 'crypto-js'
import NodeRSA from "node-rsa";

const PUBLIC_KEY = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCkecphb6vgsBx4LJknKKes-eyj7-RKQ3fikF5B67EObZ3t4moFZyMGuuJPiadYdaxvRqtxyblIlVM7omAasROtKRhtgKwwRxo2a6878qBhTgUVlsqugpI_7ZC9RmO2Rpmr8WzDeAapGANfHN5bVr7G7GYGwIrjvyxMrAVit_oM4wIDAQAB"
const APP_KEY = "B0455FBE7AA0328DB57B59AA729F05D8";
const ACCESS_KEY = "9grzgbmxdsp3arfmmgq347xjbza4ysps"


export function randomKey() {
    return "and" + 'q1w2e3r4t5y67'; //randomString(13);
}


export function encryptAES<T>(data: T, key: string): string {
    const d = CryptoJS.enc.Utf8.parse(JSON.stringify(data));
    const k = CryptoJS.enc.Utf8.parse(key);
    return CryptoJS.AES.encrypt(d, k, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
    })
        .ciphertext.toString()
        .toUpperCase();
}


export function decryptAES<T>(data: string, key: string): T {
    const d = CryptoJS.format.Hex.parse(data);
    const k = CryptoJS.enc.Utf8.parse(key);
    const dec = CryptoJS.AES.decrypt(d, k, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
    });
    return JSON.parse(CryptoJS.enc.Utf8.stringify(dec)) as T;
}


export function encryptRSA(value: string, publicKey: string): string {
    const key = new NodeRSA();
    key.setOptions({ encryptionScheme: "pkcs1" });
    key.importKey(publicKey, "pkcs8-public-pem");
    return key.encrypt(value, "base64");
}


export function generateRandomWord(length: number) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(randomInt(characters.length));
    }
    return result;
}


export async function login(endpoint: string, email: string, password: string): Promise<[string, string]> {

    const body =
    {
        "appkey": APP_KEY,
        "api_key_param": { 'timestamp': Date.now(), 'nonce': generateRandomWord(32) },
        "user_account": email,
        "user_password": password
    };

    const response: any = await api(endpoint + "/v1/userService/login", body, '');

    if (response['result_msg'] !== 'success') {
        throw new Error('iSolarCloud login failed: ' + response['result_msg']);
    }
    return [response['result_data']['token'], response['result_data']['user_id']];
}


export async function api(url: string, body: any, userid: string): Promise<any> {

    let randomKey = 'web' + generateRandomWord(13);

    let headers = new Headers();
    headers.append("content-type", "application/json;charset=UTF-8");
    headers.append("sys_code", "200");
    headers.append("x-access-key", ACCESS_KEY);
    headers.append("x-random-secret-key", encryptRSA(randomKey, PUBLIC_KEY));
    headers.append("x-limit-obj", encryptRSA(userid, PUBLIC_KEY));

    let encryptedBody = encryptAES(body, randomKey);

    let requestOptions = {
        method: "POST",
        headers: headers,
        body: encryptedBody
    };

    let response = await fetch(url, requestOptions);

    if (!response.ok) {
        throw new Error('iSolarCloud request failed: HTTP ' + response.status);
    }

    if (!response.body) {
        throw new Error('iSolarCloud returned an empty response');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let result = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
    }

    return decryptAES(result, randomKey);
}


// Reads a value from a dotted path like "curr_power" or "load.value".
// Handles plain numbers and {value, unit} objects. Returns watts.
function readWatts(data: any, path?: string): number | undefined {
    if (!path) return undefined;
    let v: any = path.split('.').reduce((o: any, k: string) => (o == null ? undefined : o[k]), data);
    if (v === undefined || v === null) return undefined;

    let num: number;
    let unit = 'W';
    if (typeof v === 'object') {
        num = parseFloat(v['value']);
        unit = v['unit'] || 'W';
    } else {
        num = parseFloat(v);
    }
    if (isNaN(num)) return undefined;

    if (unit === 'kW') num *= 1000;
    else if (unit === 'MW') num *= 1000000;
    return num;
}


export class ISolarCloudAPI {

    private readonly log: Logger;
    private readonly server: string;
    private readonly email: string;
    private readonly password: string;
    private endpoint: string;

    constructor(log: Logger, server: string, email: string, password: string) {
        this.log = log;
        this.server = server;
        this.email = email;
        this.password = password;
        this.server = server;
        switch (this.server) {
            case 'Australian':
                this.endpoint = 'https://augateway.isolarcloud.com'
                break;
            case 'European':
                this.endpoint = 'https://gateway.isolarcloud.eu'
                break;
            case 'Chinese':
                this.endpoint = 'https://gateway.isolarcloud.com'
                break;
            default:
                this.endpoint = 'https://gateway.isolarcloud.com.hk'
        }
    }


    async getPowerStations(): Promise<ISolarCloudPowerStationsAPI[]> {

        const [token, userid] = await login(this.endpoint, this.email, this.password);

        const body =
        {
            "appkey": APP_KEY,
            "api_key_param": { 'timestamp': Date.now(), 'nonce': generateRandomWord(32) },
            "user_id": userid,
            "valid_flag": "1,3",
            "lang": "_en_US",
            "token": token
        };

        const response: any = await api(this.endpoint + "/v1/powerStationService/getPsList", body, userid);

        this.log.debug('getPsList response = ' + JSON.stringify(response));

        if (response['result_msg'] !== 'success') {
            throw new Error('Could not get power stations: ' + response['result_msg']);
        }

        return response['result_data']['pageList'].map((item: any) =>
            new ISolarCloudPowerStationsAPI(this.log, this.endpoint, this.email, this.password,
                item['ps_id'].toString(), item['ps_name'], "Unknown", "Unknown", item['ps_status']));
    }

}


export class ISolarCloudPowerStationsAPI {
    private readonly endpoint: string;
    private readonly email: string;
    private readonly password: string;
    private readonly log: Logger;
    public readonly id: string;
    public readonly name: string;
    public readonly hardware_version: string;
    public readonly firmware_version: string;
    public readonly is_connected: boolean;


    constructor(log: Logger, endpoint: string, email: string, password: string, id: string, name: string, hardware_version: string, firmware_version: string, is_connected: boolean) {
        this.log = log;
        this.endpoint = endpoint;
        this.email = email;
        this.password = password;
        this.id = id;
        this.name = name;
        this.hardware_version = hardware_version;
        this.firmware_version = firmware_version;
        this.is_connected = is_connected;
    }

    async getEnergyFlow(fields: { [key: string]: string }, logRaw: boolean): Promise<{ [key: string]: number | undefined }> {

        const [token, userid] = await login(this.endpoint, this.email, this.password);

        const body =
        {
            "appkey": APP_KEY,
            "api_key_param": { 'timestamp': Date.now(), 'nonce': generateRandomWord(32) },
            "ps_id": this.id,
            "valid_flag": "1,3",
            "lang": "_en_US",
            "token": token
        };

        const response: any = await api(this.endpoint + "/v1/powerStationService/getPsDetail", body, userid);

        if (response['result_msg'] !== 'success') {
            throw new Error('Could not get power station detail: ' + response['result_msg']);
        }

        const data = response['result_data'];

        // Discovery aid: shows every field iSolarCloud returns. Remove personal details before sharing!
        if (logRaw) this.log.info('RAW getPsDetail result_data = ' + JSON.stringify(data));

        const result: { [key: string]: number | undefined } = {};
        result['solar'] = readWatts(data, fields['solar'] || 'curr_power');
        for (const key of Object.keys(fields)) {
            result[key] = readWatts(data, fields[key]);
        }
        return result;
    }

}
