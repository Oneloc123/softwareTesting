import { defineConfig } from '@playwright/test';

export default defineConfig({
    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ],

    use: {
        baseURL: process.env.BASE_URL ?? 'https://hr.demo.horilla.com',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },

    projects: [
        // Tạo .auth/admin.json cho Hiếu
        { name: 'setup', testDir: './hieu', testMatch: /auth\.setup\.ts/ },

        {
            name: 'hieu',
            testDir: './hieu',
            testMatch: /.*\.spec\.ts/,
            dependencies: ['setup'],
            use: { storageState: '.auth/admin.json' },
        },

        // Hòa và Lộc tự login trong test, KHÔNG dùng storageState
        { name: 'hoa', testDir: './hoa', testMatch: /.*\.js/ },
        { name: 'loc', testDir: './loc', testMatch: /.*\.js/ },

        // Nam
        { name: 'nam', testDir: './nam/tests' },
    ],
});