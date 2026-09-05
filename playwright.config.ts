import { defineConfig } from '@playwright/test';

// Un seul navigateur en CI : Chromium suffit pour vérifier le rendu et le
// service worker. Firefox/WebKit s'ajouteront quand une différence réelle le
// justifiera — chaque navigateur double le temps de CI, gratuit mais partagé.
export default defineConfig({
  testDir: 'tests-e2e',
  timeout: 30_000,
  /* UN SEUL WORKER EN CI, ET C'EST DÉLIBÉRÉ. La suite compte désormais plus de
     quatre-vingts parcours, dont plusieurs reposent sur des minutages réels :
     un appui long de 500 ms, le remplissage asynchrone d'une couche, le seuil
     anti-rechargement. À deux workers sur un runner partagé, ces timers se
     font affamer et des parcours SANS RAPPORT rougissent — deux tests
     différents sont tombés sur deux exécutions successives, tous deux verts
     en local et dans les autres PR.
     Une porte de fusion qui rougit au hasard ne garde plus rien : on préfère
     quelques minutes de plus à un signal auquel on cesse de croire. En local,
     Playwright garde son parallélisme — d'où la propriété POSÉE PAR ÉTALEMENT
     plutôt qu'à `undefined` : le projet compile avec
     `exactOptionalPropertyTypes`, qui distingue « clé absente » de « clé
     valant undefined », et refuse la seconde. */
  ...(process.env.CI ? { workers: 1 } : {}),
  /* LA TRACE D'UN ÉCHEC SE GARDE SUR LA CI (05/09) : « le sélecteur de fonds
     bascule en satellite » a rougi trois fois ce jour, sur trois branches,
     toujours vert en local et au rerun — « waiting for element to be
     visible, enabled and stable » sans qu'on sache ce qui bougeait. Sans
     trace, on relance et on ne sait pas ; avec, on lit. Hors CI, rien ne
     change. */
  use: { baseURL: 'http://localhost:4173', ...(process.env.CI ? { trace: 'retain-on-failure' as const } : {}) },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
