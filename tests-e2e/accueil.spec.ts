import { test, expect } from '@playwright/test';

// Le strict minimum qui prouve que le BUILD SERVI marche : la page répond,
// porte son titre, son manifeste PWA et sa langue. Chaque PR suivante ajoute
// ses parcours ; celle-ci garantit que la chaîne build → preview → navigateur
// tient debout.
test('la page d’accueil se sert et se déclare correctement', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Infonovice Maps/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Infonovice Maps');
});

test('aucune requête ne part vers un domaine non souverain', async ({ page }) => {
  // La contrainte n° 3 du projet, vérifiée au navigateur : on liste ce qui
  // sort. Autorisés : la page elle-même (localhost) — c'est tout, tant que la
  // carte n'est pas branchée. La PR #2 étendra la liste aux domaines IGN.
  const externes: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== 'localhost') externes.push(u.hostname);
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(externes, `requêtes sorties : ${externes.join(', ')}`).toHaveLength(0);
});
