"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginPage = void 0;
const test_1 = require("@playwright/test");
const env_config_js_1 = require("../config/env.config.js");
const urls_js_1 = require("../constants/urls.js");
class LoginPage {
    page;
    constructor(page) {
        this.page = page;
    }
    async login() {
        await this.page.goto(urls_js_1.URLS.login, { waitUntil: 'domcontentloaded' });
        await this.page.getByLabel('Username', { exact: true }).fill(env_config_js_1.env.username);
        await this.page.getByLabel('Password', { exact: true }).fill(env_config_js_1.env.password);
        await this.page.getByRole('button', { name: 'Sign In', exact: true }).click();
        await (0, test_1.expect)(this.page).toHaveURL(/\/dashboard\//);
        await (0, test_1.expect)(this.page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    }
}
exports.LoginPage = LoginPage;
