// Les transports en commun en direct (PR #16) vivent dans leur propre
// fichier : la spec d'accueil dépassait déjà de loin les 500 lignes que le
// projet s'impose, et cette fonctionnalité se relit très bien seule.
import { test, expect } from '@playwright/test';
import { simulerTuiles } from './tuiles-simulees';

test.beforeEach(async ({ page }) => { await simulerTuiles(page); });

/* ---- LE FLUX GTFS-RT EST SIMULÉ ----
   Comme les tuiles et pour la même raison : la CI ne doit
   ni dépendre de transport.data.gouv.fr, ni le solliciter à chaque poussée.
   Ce que la suite prouve reste réel — quelles requêtes partent, quand elles
   NE partent pas, et ce qui finit en pixels sur la carte. La disponibilité
   des flux, elle, est prouvée par appels réels dans docs/apis.md. */

const varint = (n: number): number[] => {
  const o: number[] = [];
  let v = n;
  do { const c = v % 128; v = Math.floor(v / 128); o.push(v > 0 ? c | 0x80 : c); } while (v > 0);
  return o;
};
const cle = (numero: number, type: number): number[] => varint(numero * 8 + type);
const blocPb = (numero: number, contenu: number[]): number[] =>
  [...cle(numero, 2), ...varint(contenu.length), ...contenu];
const textePb = (numero: number, s: string): number[] =>
  blocPb(numero, [...new TextEncoder().encode(s)]);
const flottantPb = (numero: number, v: number): number[] => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, v, true);
  return [...cle(numero, 5), ...b];
};

interface Faux {
  id: string; lon: number; lat: number; ligne: string; nom: string;
  vitesse?: number; ageS?: number;
}

/** Fabrique un FeedMessage GTFS-RT « positions de véhicules ». */
function fluxSimule(vehicules: Faux[], horodateS = Math.floor(Date.now() / 1000)): Buffer {
  const octets: number[] = [
    ...blocPb(1, [...textePb(1, '2.0'), ...cle(3, 0), ...varint(horodateS)]),
  ];
  for (const v of vehicules) {
    const position = blocPb(2, [
      ...flottantPb(1, v.lat), ...flottantPb(2, v.lon),
      ...(v.vitesse === undefined ? [] : flottantPb(5, v.vitesse)),
    ]);
    const corps = [
      ...blocPb(1, textePb(5, v.ligne)),
      ...position,
      ...cle(5, 0), ...varint(horodateS - (v.ageS ?? 5)),
      ...blocPb(8, textePb(2, v.nom)),
    ];
    octets.push(...blocPb(2, [...textePb(1, v.id), ...blocPb(4, corps)]));
  }
  return Buffer.from(octets);
}

const DIJON: [number, number] = [5.0415, 47.3220];

const nbPeints = (page: import('@playwright/test').Page): Promise<number> => page.evaluate(
  () => (window as unknown as { __carte: { queryRenderedFeatures(o: object): unknown[] } })
    .__carte.queryRenderedFeatures({ layers: ['transports-vehicules'] }).length,
);
const allerA = (page: import('@playwright/test').Page, lon: number, lat: number, zoom: number) =>
  page.evaluate(([x, y, z]) => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [x, y], zoom: z });
  }, [lon, lat, zoom]);

test('TRANSPORTS : rien sans la case, du direct avec, et un frein aux appels', async ({ page }) => {
  const appels: string[] = [];
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => {
    appels.push(route.request().url());
    return route.fulfill({
      contentType: 'application/x-protobuf',
      body: fluxSimule([
        { id: 'v1', lon: 5.0415, lat: 47.3220, ligne: 'T1', nom: 'Gare', vitesse: 8.3 },
        { id: 'v2', lon: 5.0450, lat: 47.3250, ligne: 'B3', nom: 'Toison d’Or' },
        // Périmé d'une heure : le décodeur le lit, la fraîcheur l'écarte.
        { id: 'v3', lon: 5.0380, lat: 47.3190, ligne: 'X9', nom: 'Dépôt', ageS: 3600 },
      ]),
    });
  });

  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 12);

  // RIEN tant que la case n'est pas cochée : la couche ne s'invite pas.
  await page.locator('.transports summary').click();
  await expect(page.locator('.transports-case')).not.toBeChecked();
  expect(appels, 'la couche a interrogé un service public sans qu’on le lui demande')
    .toEqual([]);

  await page.locator('.transports-case').check();
  await expect(page.locator('.transports-etat'))
    .toContainText('véhicules en circulation', { timeout: 10_000 });
  expect(appels).toHaveLength(1);
  expect(appels[0]).toContain('divia-dijon');

  /* LES PIXELS, pas seulement l'état : `queryRenderedFeatures` interroge ce
     que MapLibre a RÉELLEMENT peint. Deux véhicules, pas trois — le troisième
     date d'une heure et n'a rien à faire sur une carte du direct. */
  await expect.poll(() => nbPeints(page), { timeout: 10_000 }).toBe(2);

  // LE FREIN : un déplacement dans la même agglomération ne redemande rien.
  await allerA(page, 5.0480, 47.3260, 12);
  await page.waitForTimeout(1500);
  expect(appels, 'un simple déplacement a relancé un appel').toHaveLength(1);

  // LE ZOOM ARRIÈRE se tait, et le DIT — sans rien demander de plus.
  await allerA(page, 2.4, 46.6, 6);
  await expect(page.locator('.transports-etat')).toContainText('Approchez', { timeout: 10_000 });
  expect(await nbPeints(page)).toBe(0);
  expect(appels).toHaveLength(1);
});

test('TRANSPORTS : le clic dit la ligne, la vitesse et la fraîcheur', async ({ page }) => {
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => route.fulfill({
    contentType: 'application/x-protobuf',
    body: fluxSimule([
      { id: 'v1', lon: 5.0415, lat: 47.3220, ligne: 'T1', nom: 'Gare', vitesse: 8.3 },
    ]),
  }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 14);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  await expect.poll(() => nbPeints(page), { timeout: 10_000 }).toBe(1);

  // On clique le véhicule à sa position projetée — pas au centre de l'écran.
  const point = await page.evaluate(([lon, lat]) => (window as unknown as {
    __carte: { project(c: [number, number]): { x: number; y: number } };
  }).__carte.project([lon, lat]), DIJON);
  const cadre = (await page.locator('#carte canvas.maplibregl-canvas').boundingBox())!;
  await page.mouse.click(cadre.x + point.x, cadre.y + point.y);

  const popup = page.locator('.transports-popup');
  await expect(popup).toBeVisible({ timeout: 10_000 });
  await expect(popup).toContainText('Ligne T1');
  await expect(popup).toContainText('Gare');
  // Pas de vitesse chiffree : l'unite publiee est indechiffrable chez trois
  // reseaux sur neuf. Zero, lui, se lit pareil dans toutes les unites.
  await expect(popup).not.toContainText('km/h');
  await expect(popup).toContainText('à l’instant');
});


/* ---- LE FREIN, ET LES TROIS CHEMINS QUI LE CONTOURNAIENT ----
   Chacun de ces parcours reproduit un défaut mesuré en revue adverse le
   22/08/2026, avec ses chiffres. Ils comptent les requêtes RÉELLEMENT émises
   vers le proxy public : c'est la seule mesure qui compte pour la règle
   « ces quotas sont un bien commun ». */

test('TRANSPORTS : hésiter sur la case ne rouvre pas le robinet', async ({ page }) => {
  /* MESURÉ AVANT CORRECTIF : 10 cycles décoche/recoche = 33 requêtes au lieu
     de 3. `#eteindre()` remettait `#serviIds` à vide, ce qui désarmait le
     frein alors même que le dernier appel datait d'une seconde. */
  const appels: string[] = [];
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => {
    appels.push(route.request().url());
    return route.fulfill({
      contentType: 'application/x-protobuf',
      body: fluxSimule([{ id: 'v1', lon: 5.0415, lat: 47.3220, ligne: 'T1', nom: 'Gare' }]),
    });
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 12);
  await page.locator('.transports summary').click();
  const case_ = page.locator('.transports-case');
  await case_.check();
  await expect(page.locator('.transports-etat')).toContainText('véhicule', { timeout: 10_000 });
  const premiere = appels.length;
  expect(premiere).toBe(1);

  for (let i = 0; i < 10; i += 1) {
    await case_.uncheck();
    await case_.check();
  }
  await page.waitForTimeout(1500);
  expect(appels.length, 'chaque hésitation a relancé un appel').toBe(premiere);
});

test('TRANSPORTS : zoomer pour se repérer ne rouvre pas le robinet', async ({ page }) => {
  /* MESURÉ AVANT CORRECTIF : 6 allers-retours zoom 11 → 9 → 11 = 21 requêtes
     au lieu de 3. Passer sous le zoom minimal appelait `#vider()`, qui
     effaçait la mémoire du frein avec l'affichage. */
  const appels: string[] = [];
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => {
    appels.push(route.request().url());
    return route.fulfill({
      contentType: 'application/x-protobuf',
      body: fluxSimule([{ id: 'v1', lon: 5.0415, lat: 47.3220, ligne: 'T1', nom: 'Gare' }]),
    });
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 12);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  await expect(page.locator('.transports-etat')).toContainText('véhicule', { timeout: 10_000 });
  expect(appels).toHaveLength(1);

  /* Chaque cran est SUIVI D'UNE PAUSE plus longue que l'anti-rebond de
     500 ms : sans elle, les deux zooms se fondent en un seul chargement et le
     test ne traverse jamais `#vider()` — c'est-à-dire jamais le défaut qu'il
     prétend garder (vérifié par mutation : il restait vert). */
  for (let i = 0; i < 6; i += 1) {
    await allerA(page, DIJON[0], DIJON[1], 8);
    await page.waitForTimeout(700);
    await allerA(page, DIJON[0], DIJON[1], 12);
    await page.waitForTimeout(700);
  }
  expect(appels.length, 'un aller-retour de zoom a relancé un appel').toBe(1);
});

test('TRANSPORTS : un service en panne est MOINS sollicité, pas plus', async ({ page }) => {
  /* MESURÉ AVANT CORRECTIF : tous les flux en 500, cinq micro-déplacements =
     36 requêtes au lieu de 6, quand le même parcours sur un service sain en
     coûtait 3. Le frein ne s'armait que si un réseau avait répondu : le
     service DÉJÀ tombé était donc martelé douze fois plus. */
  const appels: string[] = [];
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => {
    appels.push(route.request().url());
    return route.fulfill({ status: 500, body: 'en maintenance' });
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 12);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  await expect(page.locator('.transports-etat'))
    .toContainText('indisponible', { timeout: 15_000 });
  // Une salve = un essai + une reprise, parce que les 5xx se rejouent.
  const salve = appels.length;
  expect(salve).toBeLessThanOrEqual(2);

  for (let i = 0; i < 5; i += 1) {
    await allerA(page, DIJON[0] + 0.001 * i, DIJON[1], 12);
    await page.waitForTimeout(900);
  }
  expect(appels.length, 'le service en panne a été redemandé').toBe(salve);
});

test('TRANSPORTS : un 404 ne se déguise pas en « aucun véhicule »', async ({ page }) => {
  /* Le volet annonçait « Aucun véhicule en circulation en ce moment » après
     un simple 404 : l'usager en concluait que les bus ne roulaient pas. */
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) =>
    route.fulfill({ status: 404, body: 'ressource inconnue' }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 12);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  const etat = page.locator('.transports-etat');
  await expect(etat).toContainText('indisponible', { timeout: 15_000 });
  await expect(etat).not.toContainText('Aucun véhicule');
});

test('TRANSPORTS : le compte distingue la vue du réseau entier', async ({ page }) => {
  /* Le volet annonçait « 200 véhicules » quand un seul était à l'écran : le
     nombre était celui de tout le flux, sans un mot pour le dire. */
  const loin: Faux[] = [];
  for (let i = 0; i < 30; i += 1) {
    loin.push({ id: `l${i}`, lon: 5.0415 + 0.02 * (i + 1), lat: 47.3220, ligne: 'B1', nom: 'Loin' });
  }
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => route.fulfill({
    contentType: 'application/x-protobuf',
    body: fluxSimule([
      { id: 'ici', lon: 5.0415, lat: 47.3220, ligne: 'T1', nom: 'Gare' },
      ...loin,
    ]),
  }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 16);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  const etat = page.locator('.transports-etat');
  await expect(etat).toContainText('dans la vue', { timeout: 10_000 });
  await expect(etat).toContainText('sur le réseau');
});

test('TRANSPORTS : une horloge en avance ne fait pas disparaître le réseau', async ({ page }) => {
  /* Relevé le 22/08 : l'en-tête d'Atoumod avançait de 63 s, celui du SETRAM
     de 85 s. Avec une tolérance d'une minute, le volet annonçait « Aucun
     véhicule en circulation — Divia » alors que les bus roulaient. */
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => route.fulfill({
    contentType: 'application/x-protobuf',
    body: fluxSimule(
      [{ id: 'v1', lon: 5.0415, lat: 47.3220, ligne: 'T1', nom: 'Gare', ageS: -90 }],
      Math.floor(Date.now() / 1000) + 90,
    ),
  }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 12);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  await expect(page.locator('.transports-etat'))
    .toContainText('1 véhicule en circulation', { timeout: 10_000 });
  await expect.poll(() => nbPeints(page), { timeout: 10_000 }).toBe(1);
});

test('TRANSPORTS : un véhicule publié deux fois n’est dessiné qu’une', async ({ page }) => {
  /* MESURÉ SUR LE RÉSEAU RÉEL : 17 bus normands apparaissaient à la fois dans
     l'agrégat Atoumod et dans Transurbain, Semo Bus ou Deep Mob — même
     identifiant, mêmes coordonnées, deux pastilles, compteur doublé. */
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => route.fulfill({
    contentType: 'application/x-protobuf',
    body: fluxSimule([
      { id: 'partage', lon: 1.1500, lat: 49.0250, ligne: 'T1', nom: 'Évreux' },
      // Bien à l'écart, pour ne pas se retrouver sous la même pastille.
      { id: `propre-${route.request().url().slice(-8)}`, lon: 1.2100, lat: 49.0500, ligne: 'B2', nom: 'Local' },
    ]),
  }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, 1.1500, 49.0250, 12);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  await expect(page.locator('.transports-etat')).toContainText('véhicule', { timeout: 10_000 });

  // On compte les pastilles RÉELLEMENT peintes à la position partagée : deux
  // cercles empilés y répondraient tous les deux.
  await expect.poll(() => nbPeints(page), { timeout: 10_000 }).toBeGreaterThan(0);
  const empiles = await page.evaluate(() => (window as unknown as {
    __carte: { queryRenderedFeatures(o: object): { geometry: GeoJSON.Point }[] };
  }).__carte.queryRenderedFeatures({ layers: ['transports-vehicules'] })
    .filter((f) => Math.abs(f.geometry.coordinates[0]! - 1.15) < 1e-4
      && Math.abs(f.geometry.coordinates[1]! - 49.025) < 1e-4).length);
  expect(empiles, 'le véhicule partagé est dessiné plusieurs fois').toBe(1);
});
