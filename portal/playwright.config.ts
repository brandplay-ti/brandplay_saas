import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Reutiliza o dev server local; com PLAYWRIGHT_BASE_URL, testa um ambiente já
  // publicado e não sobe nada.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 8080',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  // Celular (plano mobile, MOB-19): os projetos mobile rodam só os testes
  // marcados com @mobile no título. Cada demanda que adapta uma tela marca o
  // fluxo dela; os demais specs continuam só no desktop até a tela mudar.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile-android',
      use: { ...devices['Pixel 7'] },
      grep: /@mobile/,
    },
    {
      name: 'mobile-ios',
      use: { ...devices['iPhone 13'] },
      grep: /@mobile/,
    },
  ],
});
