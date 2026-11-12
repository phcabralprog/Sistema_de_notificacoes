const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './backend/test-ui',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node backend/src/server.js',
    url: 'http://127.0.0.1:3100/api/health',
    env: { PORT: '3100', HOST: '127.0.0.1' },
    reuseExistingServer: false,
    timeout: 15000,
  },
});
