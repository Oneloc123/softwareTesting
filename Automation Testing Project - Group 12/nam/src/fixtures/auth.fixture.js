"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expect = exports.test = exports.TestData = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const test_1 = require("@playwright/test");
Object.defineProperty(exports, "expect", { enumerable: true, get: function () { return test_1.expect; } });
const candidates_page_js_1 = require("../pages/candidates.page.js");
const assets_page_js_1 = require("../pages/assets.page.js");
const performance_page_js_1 = require("../pages/performance.page.js");
const data_generator_js_1 = require("../utils/data-generator.js");
const env_config_js_1 = require("../config/env.config.js");
const owned_cleanup_js_1 = require("../utils/owned-cleanup.js");
class TestData {
    token;
    candidates;
    assets;
    meetings;
    info;
    resources = [];
    sequence = 0;
    constructor(token, candidates, assets, meetings, info) {
        this.token = token;
        this.candidates = candidates;
        this.assets = assets;
        this.meetings = meetings;
        this.info = info;
    }
    next() { return `${this.token}${++this.sequence}`; }
    record(resource) {
        this.resources.push(resource);
        this.persist();
    }
    persist() {
        node_fs_1.default.writeFileSync(this.info.outputPath('owned-resources.json'), JSON.stringify(this.resources, null, 2));
    }
    async candidate(overrides = {}) {
        const data = (0, data_generator_js_1.candidateData)(this.next(), overrides);
        if (!data.email.includes(this.token))
            throw new Error('Refusing to own a candidate without this test marker');
        this.record({ kind: 'candidate', value: data });
        data.id = await this.candidates.create(data);
        this.persist();
        return data;
    }
    async asset(overrides = {}) {
        const data = (0, data_generator_js_1.assetData)(this.next(), overrides);
        if (!data.serial.includes(this.token))
            throw new Error('Refusing to own an asset without this test marker');
        this.record({ kind: 'asset', value: data });
        data.id = await this.assets.create(data);
        this.persist();
        await (0, test_1.expect)(this.assets.row(data.serial).locator('td').nth(3), 'Fixture status must persist before filter assertions').toHaveText(data.status);
        return data;
    }
    async meeting(overrides = {}) {
        const data = (0, data_generator_js_1.meetingData)(this.next(), overrides);
        if (!data.title.includes(this.token))
            throw new Error('Refusing to own a meeting without this test marker');
        this.record({ kind: 'meeting', value: data });
        data.id = await this.meetings.create(data);
        this.persist();
        return data;
    }
    async allocation() {
        const data = await this.asset();
        data.allocated = true;
        this.persist();
        await this.assets.allocate(data);
        return data;
    }
    async returned(status = 'Healthy') {
        const data = await this.allocation();
        await this.assets.returnAsset(data, status);
        data.returned = true;
        this.persist();
        return data;
    }
    async cleanup() {
        this.persist();
        const errors = [];
        const retained = [];
        for (const entry of [...this.resources].reverse()) {
            try {
                if (entry.kind === 'candidate') {
                    if (!entry.value.email.includes(this.token))
                        throw new Error('Ownership check failed');
                    await (0, owned_cleanup_js_1.cleanupOwned)(this.candidates.page, 'candidate', entry.value, this.token);
                }
                else if (entry.kind === 'meeting') {
                    if (!entry.value.title.includes(this.token))
                        throw new Error('Ownership check failed');
                    await (0, owned_cleanup_js_1.cleanupOwned)(this.meetings.page, 'meeting', entry.value, this.token);
                }
                else {
                    if (!entry.value.serial.includes(this.token))
                        throw new Error('Ownership check failed');
                    if (entry.value.allocated) {
                        await this.assets.allocations();
                        await this.assets.searchAllocation(entry.value);
                        if (await this.assets.row(entry.value.serial).count()) {
                            if (await this.assets.row(entry.value.serial).getByRole('button', { name: 'Return', exact: true }).count())
                                await this.assets.returnAsset(entry.value);
                            await (0, test_1.expect)(this.assets.row(entry.value.serial), 'Teardown must leave no active allocation').toContainText('Returned');
                            entry.value.returned = true;
                            entry.value.retained = true;
                            retained.push(entry.value);
                            // Horilla refuses deleting assets with allocation history, even after Return.
                            // Preserve its audit record and report the exact owned IDs instead of forcing a delete.
                            continue;
                        }
                    }
                    await (0, owned_cleanup_js_1.cleanupOwned)(this.assets.page, 'asset', entry.value, this.token);
                }
            }
            catch (error) {
                errors.push(`${entry.kind} ${JSON.stringify(entry.value)}: ${String(error)}`);
            }
        }
        this.persist();
        if (retained.length) {
            const file = this.info.outputPath('retained-resources.json');
            node_fs_1.default.writeFileSync(file, JSON.stringify({ reason: 'Horilla retains assets used in allocation; all listed allocations were verified Returned.', resources: retained }, null, 2));
            await this.info.attach('retained-resources', { path: file, contentType: 'application/json' });
            this.info.annotations.push({ type: 'cleanup-retained', description: `${retained.length} owned asset(s) returned; allocation history retained by website policy. See attachment.` });
        }
        if (errors.length) {
            await this.info.attach('cleanup-failures', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
            this.info.annotations.push({ type: 'cleanup-failure', description: `${errors.length} owned resources need review; see attachment.` });
            if (this.info.status === this.info.expectedStatus)
                throw new Error(`Cleanup failed for ${errors.length} owned resource(s). See cleanup-failures attachment.`);
        }
    }
}
exports.TestData = TestData;
exports.test = test_1.test.extend({
    executionPolicy: [async ({}, use, info) => {
            test_1.test.skip(info.title.includes('@write') && !env_config_js_1.env.allowMutations, 'Blocked: ALLOW_MUTATIONS=false; this case needs owned disposable data.');
            info.annotations.push({ type: 'case-id', description: info.title.match(/(?:CAN|AST|MTG)-V2-\d{2}/)?.[0] });
            await use();
        }, { auto: true }],
    candidatesPage: async ({ page }, use) => { await use(new candidates_page_js_1.CandidatesPage(page)); },
    assetsPage: async ({ page }, use) => { await use(new assets_page_js_1.AssetsPage(page)); },
    meetingsPage: async ({ page }, use) => { await use(new performance_page_js_1.PerformancePage(page)); },
    token: async ({}, use, info) => { await use((0, data_generator_js_1.testToken)(info)); },
    data: [async ({ token, candidatesPage, assetsPage, meetingsPage, page }, use, info) => {
            const data = new TestData(token, candidatesPage, assetsPage, meetingsPage, info);
            try {
                await use(data);
            }
            finally {
                if (info.status !== info.expectedStatus && !page.isClosed()) {
                    await info.attach('failure-before-cleanup', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' }).catch(() => undefined);
                }
                await data.cleanup();
            }
        }, { timeout: 120_000 }],
});
