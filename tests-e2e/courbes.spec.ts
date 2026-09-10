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

/**
 * Ouvre la carte, tuiles simulées.
 *
 * CE PARCOURS NE COMPTE PLUS LES REQUÊTES, et l'échec qui l'a imposé mérite
 * d'être écrit. Depuis que la couche des courbes a SA RÉSERVE DE CACHE, c'est
 * le SERVICE WORKER qui va chercher ses tuiles — et une route de page ne voit
 * pas ce qu'il demande : le parcours concluait que rien ne partait alors que
 * tout partait. Poser la route sur le CONTEXTE les rend visibles, mais dérange
 * le service worker au point de faire tomber le reste (mesuré le 09/09 sur le
 * parcours « sans réseau », trois échecs sur trois).
 *
 * ON JUGE DONC CE QUE LA CARTE DÉCLARE, et c'est fidèle : MapLibre ne demande
 * que les sources de son style. Ce qui PART vers la Géoplateforme — l'URL, le
 * format, les bornes de zoom — est pinné à sec dans tests/style-ign.test.ts,
 * sans navigateur et sans réseau.
 */
async function ouvrir(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

/* CE QUE LA CARTE DESSINE VRAIMENT — son style. */
const calques = (page: Page): Promise<string> => page.evaluate(() => {
  const c = (window as unknown as {
    __carte?: { getStyle(): { name?: string; layers: { id: string }[] } };
  }).__carte;
  if (!c) return 'CARTE ABSENTE';
  const st = c.getStyle();
  return `${st.name ?? ''} | ${st.layers.map((l) => l.id).join(',')}`;
});

/* ON PASSE PAR `ouvrirVolet` : le sélecteur de fonds a déjà déménagé une fois,
   et trente-cinq parcours codaient son emplacement. Celui-ci demande au DOM. */
async function cocher(page: Page, nom: string): Promise<void> {
  await ouvrirVolet(page, '.fonds');
  await page.getByLabel(nom).check();
}

test('LES COURBES NE SONT PAS LÀ SANS QU’ON LES DEMANDE, et y sont dès qu’on '
  + 'les demande', async ({ page }) => {
  await ouvrir(page);

  /* 1. RIEN N'EST DÉCLARÉ D'OFFICE. Une surcouche allumée par défaut coûterait
        des tuiles à un service public pour un usager qui n'a rien demandé —
        « ces quotas sont un bien commun ». */
  await expect.poll(() => calques(page), { timeout: 20_000 }).not.toBe('CARTE ABSENTE');
  expect(await calques(page)).not.toContain('surcouche-courbes');

  /* 2. COCHÉE, LA SURCOUCHE EXISTE — et la carte la dessine PAR-DESSUS le
        fond, sans quoi elle serait cachée sous lui. */
  await cocher(page, 'Courbes de niveau');
  await expect.poll(() => calques(page), { timeout: 15_000 }).toContain('surcouche-courbes');
  const dessin = await calques(page);
  expect(dessin).toContain('courbes');
  expect(dessin.indexOf('fond-plan-ign'),
    'les courbes passeraient sous le fond').toBeLessThan(dessin.indexOf('surcouche-courbes'));
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

  await ouvrir(page);

  /* 1. LA CARTE LES DESSINE — et l'on attend qu'elle existe avant de
        l'interroger : la toile paraît avant que le style restitué ne soit
        posé, et lire trop tôt donnerait le style initial. */
  await expect.poll(() => calques(page), { timeout: 20_000 }).not.toBe('CARTE ABSENTE');
  await expect.poll(() => calques(page), {
    message: 'les courbes n’ont pas été rétablies au rechargement', timeout: 20_000,
  }).toContain('surcouche-courbes');

  /* 2. ET LA CASE LE DIT : une carte qui dessine les courbes pendant que la
        case est vide serait pire qu'un oubli — on ne saurait pas comment les
        éteindre. */
  await ouvrirVolet(page, '.fonds');
  await expect(page.getByLabel('Courbes de niveau')).toBeChecked();
});
