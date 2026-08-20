import { defineConfig } from '@playwright/test';

// Un seul navigateur en CI : Chromium suffit pour vérifier le rendu et le
// service worker. Firefox/WebKit s'ajouteront quand une différence réelle le
// justifiera — chaque navigateur double le temps de CI, gratuit mais partagé.
export default defineConfig({
  testDir: 'tests-e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
