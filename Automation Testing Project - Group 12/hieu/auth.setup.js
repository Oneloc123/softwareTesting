"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const test_1 = require("@playwright/test");
// Đăng nhập 1 lần, lưu session cho toàn bộ test case.
(0, test_1.test)('login as Adam Admin', async ({ page }) => {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(node_path_1.default.resolve('.auth/admin.json')), { recursive: true });
    await page.goto(process.env.LOGIN_URL ?? '/login/');
    await page.locator('input[name="username"], #id_username, input[type="text"]').first()
        .fill(process.env.ADMIN_USER ?? 'admin');
    await page.locator('input[type="password"]').first()
        .fill(process.env.ADMIN_PASS ?? 'admin');
    await page.getByText('Sign In', { exact: false }).last().click();
    await (0, test_1.expect)(page).not.toHaveURL(/login/);
    await page.context().storageState({ path: '.auth/admin.json' });
});
