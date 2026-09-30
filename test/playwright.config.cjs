const { defineConfig } = require('@playwright/test');
const path = require('node:path');
const os = require('node:os');
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'demo.spec.cjs',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4198', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node server.js', cwd: path.resolve(__dirname, '..'),
    url: 'http://127.0.0.1:4198/demo/', reuseExistingServer: false,
    env: { PORT: '4198', TEST_BUDDY_DATA_DIR: path.join(os.tmpdir(), 'test-buddy-browser-' + process.pid) }
  }
});
