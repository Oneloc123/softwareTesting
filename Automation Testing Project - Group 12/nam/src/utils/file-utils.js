"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testFile = testFile;
exports.saveDownload = saveDownload;
exports.assertSameFile = assertSameFile;
exports.excelText = excelText;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const test_1 = require("@playwright/test");
const fflate_1 = require("fflate");
const env_config_js_1 = require("../config/env.config.js");
function testFile(name) {
    const file = node_path_1.default.join(env_config_js_1.projectRoot, 'test-data/files/generated', name);
    if (!node_fs_1.default.existsSync(file))
        (0, node_child_process_1.execFileSync)(process.execPath, [node_path_1.default.join(env_config_js_1.projectRoot, 'scripts/prepare-test-files.cjs')]);
    return file;
}
async function saveDownload(download, info) {
    (0, test_1.expect)(await download.failure()).toBeNull();
    const name = node_path_1.default.basename(download.suggestedFilename());
    const target = info.outputPath(name || 'download.bin');
    await download.saveAs(target);
    const bytes = node_fs_1.default.readFileSync(target);
    (0, test_1.expect)(bytes.length).toBeGreaterThan(0);
    await info.attach('download', { path: target, contentType: 'application/octet-stream' });
    return bytes;
}
function assertSameFile(actual, expectedFile) {
    const hash = (b) => (0, node_crypto_1.createHash)('sha256').update(b).digest('hex');
    (0, test_1.expect)(hash(actual)).toBe(hash(node_fs_1.default.readFileSync(expectedFile)));
}
function excelText(bytes) {
    (0, test_1.expect)(bytes.subarray(0, 2).toString()).toBe('PK');
    const zip = (0, fflate_1.unzipSync)(bytes);
    (0, test_1.expect)(zip['[Content_Types].xml']).toBeDefined();
    return Object.entries(zip).filter(([name]) => /^xl\/(worksheets\/sheet\d+|sharedStrings)\.xml$/.test(name))
        .map(([, data]) => (0, fflate_1.strFromU8)(data).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
        .join(' ').replace(/\s+/g, ' ');
}
