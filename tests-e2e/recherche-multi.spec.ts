import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* LE JEU D'ESSAI D'ARMELIN, GARDÉ (RECHERCHE-8, 03/09).
 *
 * LE MANDAT, la nuit du 03/09 : « ton objectif pour cette nuit est de faire
 * fonctionner la recherche. Parcours toutes les API libres du gouvernement
 * s'il le faut […] je veux surtout pouvoir rechercher les mots clés suivants
 * en jeu de tests et je ne veux pas avoir à écrire les mots exacts dans la
 * barre de recherche mais avoir plus de souplesse même si les mots sont
 * incomplets. »
 *
 * CE FICHIER SIMULE LES SERVICES, et c'est délibéré : la CI ne doit ni
 * dépendre de cinq services publics, ni les solliciter à chaque poussée. Ce
 * qu'il garde, c'est le CÂBLAGE — que chaque source soit interrogée, que ses
 * réponses arrivent dans la liste, et que le classement mette devant ce qu'on
 * a écrit.
 *
 * QUE LES DOUZE REQUÊTES ABOUTISSENT VRAIMENT se mesure à part, contre les
 * vrais services : `npx vite-node scripts/essai-douze-requetes.ts`. Mesuré le
 * 03/09 : 12/12, toutes au premier rang. */

const IGN_TOUR = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [2.2942, 48.8583] },
  properties: { toponym: 'Tour Eiffel', city: ['Paris'], postcode: ['75007'] },
};

const ENTREPRISE_LEROY = {
  nom_complet: 'LEROY MERLIN FRANCE',
  matching_etablissements: [{
    longitude: '2.6429', latitude: '48.8345', enseigne: 'LEROY MERLIN',
    adresse: '2 BOULEVARD DU MANDINET 77185 LOGNES',
    libelle_commune: 'LOGNES', code_postal: '77185',
  }],
};

async function decor(page: Page, options: {
  poisIgn?: unknown[]; entreprises?: unknown[]; adresses?: unknown[];
} = {}): Promise<{ appels: string[] }> {
  const appels: string[] = [];
  const cors = { 'Access-Control-Allow-Origin': '*' };
  await simulerTuiles(page);
  await simulerCommunes(page);
  /* APRÈS `simulerTuiles` : les tuiles vivent aussi sur data.geopf.fr, et
     Playwright donne la main à la route posée EN DERNIER. */
  await page.route('**/data.geopf.fr/geocodage/**', (route) => {
    appels.push(`ign:${new URL(route.request().url()).searchParams.get('q') ?? ''}`);
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: options.poisIgn ?? [] }) });
  });
  await page.route('**/recherche-entreprises.api.gouv.fr/**', (route) => {
    const u = new URL(route.request().url());
    appels.push(`entreprises:${u.searchParams.get('q') ?? ''}`
      + (u.searchParams.get('code_postal') ? `@${u.searchParams.get('code_postal')}` : ''));
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ results: options.entreprises ?? [] }) });
  });
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const u = new URL(route.request().url());
    appels.push(`ban:${u.searchParams.get('q') ?? ''}`
      + (u.searchParams.get('type') ? `#${u.searchParams.get('type')}` : ''));
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ type: 'FeatureCollection', features: options.adresses ?? [] }) });
  });
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    appels.push(`overpass:${decodeURIComponent(route.request().url())}`);
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ elements: [] }) });
  });
  await page.route('**/data.education.gouv.fr/**', (route) => route.fulfill({
    headers: cors, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  return { appels };
}

const barre = (page: Page) => page.locator('recherche-adresse').first();
const options = (page: Page) => barre(page).locator('[role="option"] .libelle');

test('LES DEUX SOURCES NEUVES SONT INTERROGÉES à chaque recherche', async ({ page }) => {
  /* AVANT RECHERCHE-8, la recherche ne connaissait qu'OpenStreetMap et
     l'annuaire des écoles — et ne savait chercher qu'AUTOUR de la vue. */
  const { appels } = await decor(page, { poisIgn: [IGN_TOUR] });
  await barre(page).getByRole('combobox').fill('Tour Effeil');
  await expect(options(page).first()).toHaveText('Tour Eiffel', { timeout: 10_000 });
  expect(appels.some((a) => a.startsWith('ign:'))).toBe(true);
  expect(appels.some((a) => a.startsWith('entreprises:'))).toBe(true);
});

test('LA FAUTE DE FRAPPE EST RATTRAPÉE — « Tour Effeil » rend la Tour Eiffel', async ({ page }) => {
  /* C'est la requête qu'Armelin a écrite lui-même dans son jeu d'essai. Rien
     dans l'application ne corrige la faute : c'est l'index de la Géoplateforme
     qui la tolère, et c'est pour cela qu'il a été choisi. */
  await decor(page, { poisIgn: [IGN_TOUR] });
  await barre(page).getByRole('combobox').fill('Tour Effeil');
  await expect(options(page).first()).toHaveText('Tour Eiffel', { timeout: 10_000 });
});

test('UN COMMERCE PARAÎT AVEC SON ADRESSE POSTALE', async ({ page }) => {
  /* Armelin, la même nuit : « il n'y a aucune information sur l'adresse du
     lieu au format texte ». L'annuaire des entreprises la donne écrite, et
     c'est elle qui s'affiche sous le nom. */
  await decor(page, { entreprises: [ENTREPRISE_LEROY] });
  await barre(page).getByRole('combobox').fill('Leroy Merlin Lognes');
  await expect(options(page).first()).toHaveText('LEROY MERLIN', { timeout: 10_000 });
  await expect(barre(page).locator('[role="option"] .contexte').first())
    .toContainText('BOULEVARD DU MANDINET');
});

test('LA COMMUNE SITUE, ELLE NE NOMME PAS — un seul appel à Overpass', async ({ page }) => {
  /* DEUX RÈGLES EN UN PARCOURS.
     1. « Castorama Ormesson » : le magasin est déclaré au centre commercial
        Pincevent, à Chennevières — le mot « Ormesson » n'est nulle part dans
        sa fiche. On reconnaît donc la commune, et l'on cherche « Castorama »
        AUTOUR d'elle.
     2. « Ne JAMAIS marteler les API publiques » est une règle du projet.
        RECHERCHE-8 a failli faire DEUX appels à Overpass — un autour de la
        vue, un autour de la commune. Ce compteur l'a vu. */
  const { appels } = await decor(page, {
    adresses: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.5366, 48.7848] },
      properties: {
        label: 'Ormesson-sur-Marne', city: 'Ormesson-sur-Marne',
        type: 'municipality', postcode: '94490', score: 0.9,
      },
    }],
  });
  await barre(page).getByRole('combobox').fill('Castorama Ormesson');
  await expect(barre(page).locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });

  const versOverpass = appels.filter((a) => a.startsWith('overpass:'));
  expect(versOverpass, 'un seul appel à Overpass par recherche').toHaveLength(1);
  /* IL CHERCHE « Castorama » SEUL, autour de la commune reconnue : aucun objet
     d'OpenStreetMap ne s'appelle « Castorama Ormesson ». */
  expect(versOverpass[0]).toContain('"name"="Castorama"');
  expect(versOverpass[0]).not.toContain('Castorama Ormesson');
  expect(versOverpass[0]).toContain('48.78480,2.53660');
  // ET LA BAN A ÉTÉ INTERROGÉE SUR LES COMMUNES, pas sur les rues.
  expect(appels.some((a) => a.includes('#municipality'))).toBe(true);
});

test('DEUX COMMUNES HOMONYMES sont interrogées TOUTES LES DEUX', async ({ page }) => {
  /* LE DÉFAUT, VU EN PRODUCTION ET PAS EN TEST (RECHERCHE-8b, 03/09). Juste
     après la mise en ligne de la v1.57.0, « Castorama Ormesson » ne rendait
     aucun Castorama sur le site. Mon banc d'essai passait pourtant 12/12 —
     parce que je lui donnais les coordonnées d'Armelin. L'usager qui ouvre
     l'application regarde la France entière, et depuis ce centre-là c'est
     Ormesson (77167) qui gagne au « plus proche », alors que le magasin est
     près d'Ormesson-sur-Marne (94490).
     ON NE PARIE PLUS : les deux communes entrent dans la MÊME requête. */
  const { appels } = await decor(page, {
    adresses: [
      { type: 'Feature',
        geometry: { type: 'Point', coordinates: [2.6519, 48.2456] },
        properties: { label: 'Ormesson', city: 'Ormesson', type: 'municipality', postcode: '77167', score: 0.9 } },
      { type: 'Feature',
        geometry: { type: 'Point', coordinates: [2.5366, 48.7848] },
        properties: { label: 'Ormesson-sur-Marne', city: 'Ormesson-sur-Marne', type: 'municipality', postcode: '94490', score: 0.8 } },
    ],
  });
  await barre(page).getByRole('combobox').fill('Castorama Ormesson');
  await expect(barre(page).locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });

  const versOverpass = appels.filter((a) => a.startsWith('overpass:'));
  /* TOUJOURS UN SEUL APPEL — l'union ne coûte pas une requête de plus. */
  expect(versOverpass, 'un seul appel à Overpass').toHaveLength(1);
  expect(versOverpass[0], 'la commune du 77 doit être interrogée').toContain('48.24560,2.65190');
  expect(versOverpass[0], 'ET celle du 94 aussi').toContain('48.78480,2.53660');
});

test('ON PEUT CHERCHER UN LIEU QU’ON N’A PAS SOUS LES YEUX', async ({ page }) => {
  /* AVANT RECHERCHE-8, sans centre de carte, l'application répondait
     « Impossible de situer la recherche : déplacez la carte vers la zone qui
     vous intéresse ». Les deux sources neuves cherchent dans TOUTE la France —
     ce qui est tout de même l'usage ordinaire d'une barre de recherche. */
  await decor(page, { poisIgn: [IGN_TOUR] });
  await barre(page).getByRole('combobox').fill('Tour Effeil');
  await expect(options(page).first()).toHaveText('Tour Eiffel', { timeout: 10_000 });
  await expect(barre(page).locator('.recherche-note'))
    .not.toContainText('déplacez la carte');
});
