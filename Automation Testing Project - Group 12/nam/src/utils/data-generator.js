"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.meetingData = exports.assetData = exports.candidateData = void 0;
exports.testToken = testToken;
exports.uniqueText = uniqueText;
exports.localDate = localDate;
exports.meetingDate = meetingDate;
const node_crypto_1 = require("node:crypto");
const env_config_js_1 = require("../config/env.config.js");
const candidate_data_json_1 = __importDefault(require("../../test-data/candidate-data.json"));
const asset_data_json_1 = __importDefault(require("../../test-data/asset-data.json"));
const meeting_data_json_1 = __importDefault(require("../../test-data/meeting-data.json"));
function testToken(info) {
    return `${(process.env.RUN_ID || 'local').replace(/[^a-z0-9]/gi, '').slice(-10)}${info.retry}${(0, node_crypto_1.randomBytes)(3).toString('hex')}`;
}
function uniqueText(prefix, token, length) {
    const text = `${prefix} ${token}`;
    if (length !== undefined && text.length > length)
        throw new Error('Unique marker exceeds requested length');
    return length === undefined ? text : text.padEnd(length, 'A');
}
function localDate(offsetDays = 0) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: env_config_js_1.env.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = (type) => parts.find(p => p.type === type).value;
    const date = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
}
function meetingDate(offsetDays = 1, hour = 10) {
    return `${localDate(offsetDays)}T${String(hour).padStart(2, '0')}:00`;
}
const candidateData = (token, overrides = {}) => ({
    name: uniqueText('CK Candidate', token), email: `ck.${token}@example.com`,
    recruitment: candidate_data_json_1.default.recruitment, ...overrides,
});
exports.candidateData = candidateData;
const assetData = (token, overrides = {}) => ({
    name: uniqueText('CK Asset', token), serial: `CK-${token}`.slice(0, 30), purchaseDate: localDate(),
    cost: asset_data_json_1.default.cost, category: asset_data_json_1.default.category, status: asset_data_json_1.default.status, ...overrides,
});
exports.assetData = assetData;
const meetingData = (token, overrides = {}) => ({
    title: uniqueText('CK Meeting', token), date: meetingDate(),
    employees: [meeting_data_json_1.default.employee], managers: [meeting_data_json_1.default.manager], ...overrides,
});
exports.meetingData = meetingData;
