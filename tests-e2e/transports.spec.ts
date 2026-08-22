// Les transports en commun en direct (PR #16) vivent dans leur propre
// fichier : la spec d'accueil dépassait déjà de loin les 500 lignes que le
// projet s'impose, et cette fonctionnalité se relit très bien seule.
import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

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

test('TRANSPORTS : le doublon d’un agrégat est DIT, pas effacé', async ({ page }) => {
  /* AUCUNE CLÉ NE PERMET DE LE RETIRER SÛREMENT (mesuré : l'identifiant est
     celui de la COURSE chez certains producteurs — trois autocars la
     partagent —, l'étiquette est absente des 57 paires agrégat/membre, et
     l'écart de position croît avec la vitesse, jusqu'à 3,2 km relevés).
     On dessine donc tout, ET on prévient. */
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => route.fulfill({
    contentType: 'application/x-protobuf',
    body: fluxSimule([{ id: 'v1', lon: 1.078, lat: 49.922, ligne: 'T1', nom: 'Dieppe' }]),
  }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  // Dieppe : un seul réseau local, donc l'agrégat entre dans le plafond.
  await allerA(page, 1.0780, 49.9220, 12);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  const etat = page.locator('.transports-etat');
  await expect(etat).toContainText('véhicule', { timeout: 10_000 });
  await expect(etat).toContainText('peut apparaître deux fois');
});

test('TRANSPORTS : là où les réseaux locaux suffisent, aucun avertissement', async ({ page }) => {
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => route.fulfill({
    contentType: 'application/x-protobuf',
    body: fluxSimule([{ id: 'v1', lon: 5.0415, lat: 47.3220, ligne: 'T1', nom: 'Gare' }]),
  }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 12);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  const etat = page.locator('.transports-etat');
  await expect(etat).toContainText('véhicule', { timeout: 10_000 });
  await expect(etat).not.toContainText('peut apparaître deux fois');
});






/* ---- LE FREIN RETIENT L'APPEL, PAS L'AFFICHAGE ----
   Trois parcours nés de la SECONDE revue adverse : le frein, corrigé pour ne
   plus marteler les services publics, laissait la couche morte pendant trente
   secondes. Il borne les requêtes ; il n'a pas à priver l'usager de ce qu'il
   vient de voir. */

test('TRANSPORTS : décocher puis recocher réaffiche AUSSITÔT', async ({ page }) => {
  /* MESURÉ AVANT CORRECTIF : « FENÊTRE MORTE = 30 s » — case cochée, carte
     vide, résumé vide, pendant exactement une cadence. */
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
  await expect.poll(() => nbPeints(page), { timeout: 10_000 }).toBe(1);

  await case_.uncheck();
  await case_.check();
  // Aussitôt : la pastille revient et le volet parle, SANS nouvelle requête.
  await expect.poll(() => nbPeints(page), { timeout: 3_000 }).toBe(1);
  await expect(page.locator('.transports-etat')).toContainText('véhicule');
  expect(appels, 'le réaffichage a coûté une requête').toHaveLength(1);
});

test('TRANSPORTS : le volet ne reste JAMAIS muet, case cochée', async ({ page }) => {
  /* MESURÉ AVANT CORRECTIF : décocher puis recocher AVANT la première réponse
     laissait  à la chaîne vide pendant trente secondes —
     case cochée, aucune requête en vol, aucune pastille. Le frein interdit à
     juste titre de rappeler le service ; il n'autorise pas à se taire. */
  // Une route qui ne répond JAMAIS : la première salve reste en vol.
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', () => { /* silence */ });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 12);
  await page.locator('.transports summary').click();
  const case_ = page.locator('.transports-case');
  await case_.check();
  await expect(page.locator('.transports-etat')).toContainText('Chargement', { timeout: 5_000 });
  await case_.uncheck();
  await case_.check();
  /* CE QU'ON EXIGE : le volet reparle vite, et ne retombe pas muet. Un cadre
     vide fugace pendant la bascule n'est pas le defaut ; trente secondes de
     silence en sont un. */
  await expect.poll(async () => ((await page.locator('.transports-etat').textContent()) ?? '').trim(),
    { timeout: 5_000 }).not.toBe('');
  for (let i = 0; i < 3; i += 1) {
    await page.waitForTimeout(1_500);
    const texte = ((await page.locator('.transports-etat').textContent()) ?? '').trim();
    expect(texte, 'le volet est redevenu muet').not.toBe('');
  }
});
test('TRANSPORTS : revenir au zoom rétablit la carte et corrige le message', async ({ page }) => {
  /* MESURÉ AVANT CORRECTIF : de retour au zoom 12, le volet affichait encore
     « Approchez pour voir les véhicules » et la carte restait vide 29 s. */
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
  await expect.poll(() => nbPeints(page), { timeout: 10_000 }).toBe(1);

  await allerA(page, DIJON[0], DIJON[1], 8);
  await expect(page.locator('.transports-etat')).toContainText('Approchez', { timeout: 5_000 });
  await allerA(page, DIJON[0], DIJON[1], 12);
  await expect.poll(() => nbPeints(page), { timeout: 5_000 }).toBe(1);
  await expect(page.locator('.transports-etat')).toContainText('véhicule');
  await expect(page.locator('.transports-etat')).not.toContainText('Approchez');
  expect(appels, 'le retour au zoom a coûté une requête').toHaveLength(1);
});

test('TRANSPORTS : le compte « dans la vue » suit la carte', async ({ page }) => {
  /* Le compte était figé à l'instant du chargement : il annonçait « 1 véhicule
     dans la vue » alors que l'écran n'en montrait plus aucun. */
  const loin: Faux[] = [];
  for (let i = 0; i < 8; i += 1) {
    loin.push({ id: `l${i}`, lon: 5.0415 + 0.01 * (i + 1), lat: 47.3220, ligne: 'B1', nom: 'Loin' });
  }
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => route.fulfill({
    contentType: 'application/x-protobuf',
    body: fluxSimule([{ id: 'ici', lon: 5.0415, lat: 47.3220, ligne: 'T1', nom: 'Gare' }, ...loin]),
  }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 16);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  const etat = page.locator('.transports-etat');
  await expect(etat).toContainText('1 véhicule dans la vue', { timeout: 10_000 });

  // On s'éloigne de TOUS les véhicules : le compte doit suivre, sans un appel
  // de plus (le frein tient toujours, il ne retient que les requêtes).
  await allerA(page, 5.2000, 47.3220, 16);
  await expect(etat).toContainText('Aucun véhicule dans cette vue', { timeout: 10_000 });
  await expect(etat).toContainText('sur le réseau');
});

test('TRANSPORTS : « aucun véhicule » n’est dit que si TOUT a répondu', async ({ page }) => {
  /* Le volet affirmait une absence alors qu'un réseau n'avait pas répondu et
     que d'autres n'avaient jamais été interrogés. */
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => {
    if (route.request().url().includes('transurbain')) {
      return route.fulfill({ status: 404, body: 'inconnu' });
    }
    return route.fulfill({
      contentType: 'application/x-protobuf', body: fluxSimule([]),
    });
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, 1.1500, 49.0250, 13);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  const etat = page.locator('.transports-etat');
  await expect(etat).toContainText('qui ont répondu', { timeout: 15_000 });
  await expect(etat).not.toContainText('Aucun véhicule en circulation en ce moment');
});

test('TRANSPORTS : un flux entièrement périmé ne devient pas « aucun véhicule »', async ({ page }) => {
  /* Le résumé se contredisait : « Aucun véhicule en circulation (2 positions
     trop anciennes, écartées) ». Le producteur dit qu'il y a des bus. */
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) => route.fulfill({
    contentType: 'application/x-protobuf',
    body: fluxSimule([
      { id: 'v1', lon: 5.0415, lat: 47.3220, ligne: 'T1', nom: 'Gare', ageS: 4000 },
      { id: 'v2', lon: 5.0450, lat: 47.3250, ligne: 'T2', nom: 'Nord', ageS: 4000 },
    ]),
  }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, DIJON[0], DIJON[1], 12);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  const etat = page.locator('.transports-etat');
  await expect(etat).toContainText('Aucune position récente', { timeout: 10_000 });
  await expect(etat).toContainText('trop anciennes');
  await expect(etat).not.toContainText('Aucun véhicule en circulation');
});

test('TRANSPORTS : tous les réseaux muets sont NOMMÉS', async ({ page }) => {
  /* Le volet n'en citait qu'un, laissant croire que les autres allaient bien. */
  await page.route('**/proxy.transport.data.gouv.fr/resource/**', (route) =>
    route.fulfill({ status: 404, body: 'inconnu' }));
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, 1.1500, 49.0250, 13);
  await page.locator('.transports summary').click();
  await page.locator('.transports-case').check();
  const etat = page.locator('.transports-etat');
  await expect(etat).toContainText('Aucune réponse de', { timeout: 15_000 });
  const texte = (await etat.textContent()) ?? '';
  // Trois réseaux desservent Évreux : les trois doivent être cités.
  expect(texte.split(',').length, `un seul réseau nommé : ${texte}`).toBeGreaterThanOrEqual(3);
});

test('TRANSPORTS : en paysage, tous les volets restent atteignables', async ({ page }) => {
  /* L'ajout d'une sixième rangée poussait « Favoris » sous la barre d'échelle,
     qui interceptait le doigt en son centre (mesuré à 667×375). */
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  const captes = await page.evaluate(() => [
    ...document.querySelectorAll('#carte .maplibregl-ctrl-top-left summary'),
  ].map((el) => {
    const r = el.getBoundingClientRect();
    if (r.height === 0) return null;
    const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { nom: el.textContent?.trim().slice(0, 12) ?? '', bas: r.bottom, ok: el.contains(dessus) };
  }).filter(Boolean));
  expect(captes.length).toBeGreaterThanOrEqual(6);
  expect(captes.filter((c) => !c!.ok).map((c) => c!.nom),
    'un volet ne reçoit plus son propre clic').toEqual([]);
  expect(captes.filter((c) => c!.bas > 375).map((c) => c!.nom),
    'un volet sort de l’écran').toEqual([]);
});
