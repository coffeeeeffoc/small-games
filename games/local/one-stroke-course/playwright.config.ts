import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:'*.browser.ts',workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:4171',channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome',viewport:{width:1280,height:800},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'pnpm dev',url:'http://127.0.0.1:4171',reuseExistingServer:!process.env.CI},reporter:[['list'],['json',{outputFile:'test-results/results.json'}]]});
