import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* LES COURBES DE NIVEAU (COURBES-1, 10/09/2026).
 *
 * TROISIÈME DES QUATRE EMPRUNTS à CoMaps et OsmAnd listés le 05/09, et le seul
 * qui restât à faire — une entrée de la roadmap les disait tous livrés, à
 * tort. L'étude en donnait la forme : « un calque WMTS de la Géoplateforme,
 * pas un nouveau moteur ».
 *
 * CE QUE LE SERVICE REND, mesuré le 10/09 sur une tuile de Chamonix : des
 * courbes brunes cotées sur fond TRANSPARENT (PNG RVBA), 44,7 Ko au zoom 13.
 * D'où une vraie surcouche, qui se pose sur le Plan comme sur le satellite.
 * Bornes relevées : 200 aux zooms 6, 13 et 18 ; 404 au zoom 19.
 *
 * CE PARCOURS JUGE CE QUI PART VERS LE SERVICE, pas une couleur de pixel : sur
 * un fond simulé, la seule preuve qu'une surcouche existe est la requête
 * qu'elle émet — et c'est aussi ce qui compte pour un service public.
 */

/** Ouvre la carte en notant toutes les tuiles demandées. */
async function ouvrir(page: Page): Promise<string[]> {
  const tuiles: string[] = [];
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/data.geopf.fr/wmts**', (route) => {
    tuiles.push(decodeURIComponent(route.request().url()));
    return route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
  });
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  return tuiles;
}

/* ON PASSE PAR `ouvrirVolet`, ET C'EST TOUT L'INTÉRÊT QU'IL EXISTE : le
   sélecteur de fonds a déjà déménagé une fois — posé sur la carte, puis rangé
   dans le menu. Trente-cinq parcours codaient son emplacement ; celui-ci
   demande au DOM. Ma première version le cherchait à la main, et échouait. */
async function cocher(page: Page, nom: string): Promise<void> {
  await ouvrirVolet(page, '.fonds');
  await page.getByLabel(nom).check();
}

/* CE QUE LA CARTE DESSINE VRAIMENT — son style, pas les requêtes.
   POURQUOI LES DEUX MESURES COEXISTENT : les tuiles disent ce qui PART vers le
   service public, et c'est ce qui compte pour les quotas ; le style dit ce qui
   se SUPERPOSE, et c'est ce qui compte pour l'usager. Une première version de
   ces parcours jugeait tout aux requêtes et se trompait — le navigateur sert
   du cache, et l'absence d'une requête ne prouve pas l'absence d'un calque. */
const calques = (page: Page): Promise<string> => page.evaluate(() => {
  const c = (window as unknown as {
    __carte?: { getStyle(): { name?: string; layers: { id: string }[] } };
  }).__carte;
  if (!c) return 'CARTE ABSENTE';
  const st = c.getStyle();
  return `${st.name ?? ''} | ${st.layers.map((l) => l.id).join(',')}`;
});

test('LES COURBES NE PARTENT PAS SANS QU’ON LES DEMANDE, et partent dès qu’on '
  + 'les demande', async ({ page }) => {
  const tuiles = await ouvrir(page);

  /* 1. RIEN N'EST DEMANDÉ D'OFFICE. Une surcouche allumée par défaut coûterait
        des tuiles à un service public pour un usager qui n'a rien demandé —
        « ces quotas sont un bien commun ». */
  await page.waitForTimeout(1500);
  expect(tuiles.filter((u) => u.includes('ELEVATION.CONTOUR.LINE')),
    'des courbes ont été demandées sans être cochées').toEqual([]);
  expect(tuiles.length, 'aucune tuile de fond : le parcours ne juge rien')
    .toBeGreaterThan(0);

  /* 2. COCHÉE, ELLE TIRE — et sur la bonne couche. */
  await cocher(page, 'Courbes de niveau');
  await expect.poll(() => tuiles.filter((u) => u.includes('ELEVATION.CONTOUR.LINE')).length,
    { timeout: 15_000 }).toBeGreaterThan(0);

  /* 3. ET ELLE TIRE DE LA GÉOPLATEFORME, EN PNG : le fond transparent est ce
        qui en fait une surcouche plutôt qu'un fond de plus. */
  const demandes = tuiles.filter((u) => u.includes('ELEVATION.CONTOUR.LINE'));
  for (const u of demandes) {
    expect(u).toMatch(/^https:\/\/data\.geopf\.fr\/wmts/);
    expect(u).toContain('FORMAT=image/png');
  }
});

test('LE CHOIX SURVIT AU RECHARGEMENT — une option qu’il faut recocher à chaque '
  + 'visite est une option qu’on n’utilise pas', async ({ page }) => {
  /* CE PARCOURS NE JUGE QUE LA RESTITUTION, et il pose donc la préférence
     LUI-MÊME plutôt que de la cocher à la main.
     POURQUOI : le chemin du menu vers le sélecteur de fonds a un historique
     d'instabilité documenté dans playwright.config.ts — « le sélecteur de
     fonds bascule en satellite a rougi trois fois ce jour, sur trois
     branches, toujours vert en local ». Y passer deux fois de plus pour
     éprouver une chose qu'il ne prouve pas ajouterait du bruit, pas de la
     garantie. Que le CLIC allume bien les courbes est déjà prouvé par le
     parcours précédent, et par les vraies tuiles qu'il fait partir.
     CE QUI RESTE, ET QUE SEUL UN NAVIGATEUR PEUT DIRE : la préférence
     traverse IndexedDB, revient au chargement, et la carte comme la case en
     tiennent compte. */
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await page.evaluate(async () => {
    const d = indexedDB.open('infonovice-maps');
    const db: IDBDatabase = await new Promise((ok, ko) => {
      d.onsuccess = () => ok(d.result); d.onerror = () => ko(d.error);
    });
    await new Promise<void>((ok, ko) => {
      const t = db.transaction('preferences', 'readwrite');
      t.objectStore('preferences').put({ fond: 'plan', cadastre: false, courbes: true }, 'fonds');
      t.oncomplete = () => ok(); t.onerror = () => ko(t.error);
    });
  });

  const tuiles = await ouvrir(page);

  /* 1. LA CARTE LES DESSINE — et l'on attend qu'elle existe avant de
        l'interroger : la toile paraît avant que le style restitué ne soit
        posé, et lire trop tôt donnerait le style initial. */
  await expect.poll(() => calques(page), { timeout: 20_000 }).not.toBe('CARTE ABSENTE');
  await expect.poll(() => calques(page), {
    message: 'les courbes n’ont pas été rétablies au rechargement', timeout: 20_000,
  }).toContain('surcouche-courbes');

  /* 2. ET ELLES PARTENT VRAIMENT : un calque déclaré qui ne demande aucune
        tuile ne dessinerait rien. */
  await expect.poll(() => tuiles.filter((u) => u.includes('ELEVATION.CONTOUR.LINE')).length,
    { timeout: 20_000 }).toBeGreaterThan(0);

  /* 3. ET LA CASE LE DIT : une carte qui dessine les courbes pendant que la
        case est vide serait pire qu'un oubli — on ne saurait pas comment les
        éteindre. */
  await ouvrirVolet(page, '.fonds');
  await expect(page.getByLabel('Courbes de niveau')).toBeChecked();
});
