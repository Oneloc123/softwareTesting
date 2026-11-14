"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const test_1 = require("@playwright/test");
const login_page_js_1 = require("../src/pages/login.page.js");
const env_config_js_1 = require("../src/config/env.config.js");
(0, test_1.test)('authenticate public Horilla demo account', async ({ page }) => {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(env_config_js_1.env.authFile), { recursive: true });
    await new login_page_js_1.LoginPage(page).login();
    await page.context().storageState({ path: env_config_js_1.env.authFile });
});
