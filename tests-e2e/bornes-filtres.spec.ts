import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirReglagesBornes } from './volets';

/* FILTRES DES BORNES — ce qui compte n'est pas ce que l'interface affiche,
   c'est CE QUI PART DANS LA REQUÊTE. Le portail plafonne à 100
   enregistrements : un filtre appliqué localement trierait un ensemble déjà
   tronqué et montrerait trois bornes CCS là où la zone en compte cinquante.
   Ces parcours lisent donc l'URL réellement émise. */

const IRVE = '**/public.opendatasoft.com/**';

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

/** Capture les URL IRVE émises, et répond une collection vide pour ne pas
 *  dépendre du portail — ni le marteler depuis la CI. */
async function espionnerIrve(page: import('@playwright/test').Page): Promise<string[]> {
  const vues: string[] = [];
  await page.route(IRVE, (route) => {
    /* L'ESPION LAISSE PASSER LES FACETTES. Playwright donne la priorité au
       calque enregistré EN DERNIER : ce motif large recouvrait sans le vouloir
       la route des facettes de réseaux, qui recevait alors une réponse
       d'enregistrements et rendait une liste vide. Le laisser dépendre de
       l'ordre d'écriture des tests aurait été une bombe à retardement. */
    const url = route.request().url();
    if (url.includes('/facets')) return route.fallback();
    /* ET IL LAISSE PASSER L'EXPORT DE L'INDEX NATIONAL, pour la même raison :
       lui répondre une collection d'enregistrements rendrait un index vide,
       donc une liste de réseaux vide, sans qu'aucune assertion ne dise
       pourquoi. */
    if (url.includes('/exports/json')) return route.fallback();
    vues.push(decodeURIComponent(url));
    return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ total_count: 0, results: [] }) });
  });
  return vues;
}

async function ouvrirBornes(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  /* LES POI NE SE CHARGENT QU'AU ZOOM 12 — frugalité assumée depuis la PR #9.
     Sans ce saut, aucune requête ne part et le parcours mesurerait le vide. */
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [2.3522, 48.8566], zoom: 13 });
  });
  await ouvrirReglagesBornes(page);
  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
}

test('les filtres ne paraissent qu’une fois la couche des bornes active', async ({ page }) => {
  await espionnerIrve(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirReglagesBornes(page);

  const filtres = page.locator('.poi-filtres');
  await expect(filtres, 'des réglages sans objet encombrent').toBeHidden();

  await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
  await expect(filtres).toBeVisible();
  await expect(page.getByLabel('Puissance minimale des bornes')).toBeVisible();
  for (const nom of ['CCS Combo', 'Type 2', 'CHAdeMO', 'Prise domestique']) {
    await expect(page.getByRole('checkbox', { name: nom })).toBeVisible();
  }
});

test('la puissance choisie PART DANS LA REQUÊTE, elle ne trie pas l’acquis', async ({ page }) => {
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);

  await page.getByLabel('Puissance minimale des bornes').selectOption('150');
  await expect.poll(() => vues.some((u) => u.includes('puissance_nominale >= 150')),
    { message: 'la puissance n’est pas partie au service' }).toBe(true);
});

test('les connecteurs partent en OU — un véhicule accepte l’un OU l’autre', async ({ page }) => {
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);

  await page.getByRole('checkbox', { name: 'CCS Combo' }).check();
  await page.getByRole('checkbox', { name: 'CHAdeMO' }).check();

  await expect.poll(() => vues.some((u) =>
    u.includes('prise_type_combo_ccs = "1"') && u.includes('prise_type_chademo = "1"')
    && u.includes('OR')), { message: 'les connecteurs ne sont pas partis en OU' }).toBe(true);
});

test('le nom de station tapé PART DANS LA REQUÊTE, en suggest()', async ({ page }) => {
  /* « Distinguer les IZIVIA FAST sur des McDonald's de celles de la rue »
     (Armelin, 27/08/2026). Au-delà du zoom 12, le portail plafonne à 100
     enregistrements : un tri local mentirait, le filtre part donc au
     service — suggest() est sa recherche plein-texte, vérifiée par appel
     réel (36 lignes pour « Donald », zéro pour un like). */
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);

  await page.getByLabel('Chercher un réseau ou un nom de station').fill('Mc Donald');
  await expect.poll(() => vues.some((u) => u.includes('suggest(nom_station,"Mc Donald")')),
    { message: 'le nom n’est pas parti au service' }).toBe(true);
});

test('sans filtre, aucune clause parasite ne part', async ({ page }) => {
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);

  await expect.poll(() => vues.length).toBeGreaterThan(0);
  const premiere = vues.find((u) => u.includes('mobilityref-france-irve'));
  expect(premiere, 'aucune requête IRVE émise').toBeTruthy();
  expect(premiere).toContain('in_bbox(point_geo');
  expect(premiere, 'une clause vide fausse la requête').not.toContain(' AND ');
});

/* LES ÉCLAIRS DE PUISSANCE — un à trois selon le palier. Les icônes sont
   DESSINÉES au démarrage sur un canevas : aucun binaire au dépôt, mais aussi
   aucune garantie qu'elles existent si le contexte 2D échoue. On vérifie donc
   qu'elles sont bien enregistrées, et que chaque borne porte le bon palier. */
test('les quatre pastilles de puissance sont dessinées et posées', async ({ page }) => {
  await espionnerIrve(page);
  await ouvrirBornes(page);

  const images = await page.evaluate(() => {
    const c = (window as unknown as { __carte: { hasImage(n: string): boolean } }).__carte;
    return ['borne-1', 'borne-2', 'borne-3', 'borne-inconnue'].map((n) => c.hasImage(n));
  });
  expect(images, 'une pastille manquante laisserait des bornes invisibles').toEqual(
    [true, true, true, true]);
});

test('chaque borne porte le palier de SA puissance, frontières comprises', async ({ page }) => {
  // Fixture au format réel, calibrée sur les BORNES des intervalles : 50 kW
  // est « lent », 150 « rapide », 151 « très rapide ». C'est là que se logent
  // les erreurs d'un cran, invisibles à l'œil sur une carte.
  await page.route(IRVE, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ total_count: 4, results: [
      { point_geo: { lon: 2.35, lat: 48.856 }, nom_station: 'Lente', puissance_nominale: 50 },
      { point_geo: { lon: 2.352, lat: 48.857 }, nom_station: 'Rapide', puissance_nominale: 150 },
      { point_geo: { lon: 2.354, lat: 48.858 }, nom_station: 'Très rapide', puissance_nominale: 151 },
      { point_geo: { lon: 2.356, lat: 48.859 }, nom_station: 'Inconnue' },
    ] }),
  }));
  await ouvrirBornes(page);

  /* ON ATTEND QUE LA SOURCE PORTE LES QUATRE BORNES avant de juger. La couche
     se remplit de façon asynchrone : lire `getData()` trop tôt rendait parfois
     un jeu partiel, et le parcours rougissait pour une raison qui n'avait rien
     à voir avec les paliers. Une CI plus lente le révélait, pas la machine de
     développement. */
  const lire = async (): Promise<unknown[][]> => page.evaluate(async () => {
    const c = (window as unknown as {
      __carte: { getSource(id: string): { getData(): unknown } | undefined };
    }).__carte;
    const d = await c.getSource('poi-bornes')?.getData() as GeoJSON.FeatureCollection | undefined;
    return (d?.features ?? []).map((f) => [f.properties?.['nom'], f.properties?.['icone']]);
  });
  await expect.poll(async () => (await lire()).length,
    { message: 'la couche n’a jamais porté les quatre bornes' }).toBe(4);
  const paliers = await lire();

  expect(paliers).toEqual([
    ['Lente', 'borne-1'],
    ['Rapide', 'borne-2'],
    ['Très rapide', 'borne-3'],
    ['Inconnue', 'borne-inconnue'],
  ]);
});

/* LE FILTRE PAR RÉSEAU — DEUXIÈME ÂGE.
 *
 * CE QUI A CHANGÉ, ET POURQUOI. La liste venait de la FACETTE du portail,
 * bornée à l'emprise : elle ne proposait donc que ce que la vue montrait déjà,
 * et son contenu changeait à chaque déplacement de carte. Armelin, le
 * 25/08/2026 : « le filtre réseau devrait fonctionner quel que soit le niveau
 * de zoom ». Elle se calcule désormais sur l'INDEX NATIONAL, en mémoire, sans
 * le moindre appel — et le compte affiché est celui de la France entière.
 *
 * Ces parcours vérifient les deux propriétés qui en découlent : la liste est
 * nationale, et elle ne bouge pas quand la carte bouge. */

/** L'export agrégé simulé — la source de la liste des réseaux. */
async function simulerIndexNational(
  page: import('@playwright/test').Page,
  stations: { nom: string; reseau: string; lon: number; lat: number; p?: number }[],
): Promise<number> {
  let appels = 0;
  await page.route('**/mobilityref-france-irve-220/exports/json**', (route) => {
    appels += 1;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(stations.map((st, i) => ({
        id_station_itinerance: `FRTEST${i}`,
        nom_station: st.nom,
        nom_enseigne: st.reseau,
        nom_operateur: st.reseau,
        condition_acces: 'Accès libre',
        prise_type_combo_ccs: '1',
        prise_type_chademo: '0',
        prise_type_2: '0',
        p: st.p ?? 150,
        pdc: 4,
        lon: st.lon,
        lat: st.lat,
      }))),
    });
  });
  // Un compteur par référence, pour que l'appelant lise la valeur à jour.
  return appels;
}

const RESEAUX_ESSAI = [
  { nom: 'Bump 1', reseau: 'Bump', lon: 2.35, lat: 48.85 },
  { nom: 'Bump 2', reseau: 'Bump', lon: 2.36, lat: 48.86 },
  { nom: 'Belib 1', reseau: "Belib'", lon: 2.34, lat: 48.84 },
  { nom: 'Belib 2', reseau: "Belib'", lon: 2.33, lat: 48.83 },
  { nom: 'Belib 3', reseau: "Belib'", lon: 2.32, lat: 48.82 },
  // Loin de Paris : elle DOIT quand même paraître dans la liste.
  { nom: 'Alpine', reseau: 'ACCOR Hotels', lon: 6.9, lat: 43.6 },
];

test('les réseaux proposés sont NATIONAUX, du plus fourni au moins', async ({ page }) => {
  await simulerIndexNational(page, RESEAUX_ESSAI);
  await espionnerIrve(page);
  await ouvrirBornes(page);

  const cases_ = page.locator('.poi-reseau');
  await expect(cases_).toHaveCount(3, { timeout: 15_000 });
  await expect(page.locator('.poi-reseaux')).toContainText("Belib' (3)");
  // Du plus fourni au moins fourni : l'usager cherche d'abord les grands.
  const valeurs = await cases_.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(valeurs).toEqual(["Belib'", 'Bump', 'ACCOR Hotels']);

  /* LA PREUVE DU CHANGEMENT : « ACCOR Hotels » est à Antibes, la carte est sur
     Paris. L'ancienne facette, bornée à l'emprise, ne l'aurait jamais proposée. */
  await expect(page.locator('.poi-reseaux'),
    'un réseau hors de la vue doit rester proposable').toContainText('ACCOR Hotels');
});

test('la liste des réseaux ne bouge PAS quand la carte bouge', async ({ page }) => {
  await simulerIndexNational(page, RESEAUX_ESSAI);
  await espionnerIrve(page);
  await ouvrirBornes(page);
  await expect(page.locator('.poi-reseau')).toHaveCount(3, { timeout: 15_000 });

  // Sept cents kilomètres plus loin : la liste doit être la même.
  await page.evaluate(() => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [5.37, 43.29], zoom: 13 });
  });
  await page.waitForTimeout(1200);
  await expect(page.locator('.poi-reseau'),
    'la liste s’est remise à suivre la vue').toHaveCount(3);
  await expect(page.locator('.poi-reseaux')).toContainText("Belib' (3)");
});

test('cocher un réseau le fait partir DANS LA REQUÊTE', async ({ page }) => {
  /* AU ZOOM 12 ET AU-DELÀ, les bornes viennent toujours du portail par
     emprise : le filtre doit donc partir AU SERVICE, et non trier localement
     un ensemble déjà tronqué à cent enregistrements. */
  await simulerIndexNational(page, [
    { nom: 'Belib 1', reseau: "Belib'", lon: 2.34, lat: 48.84 },
  ]);
  const vues = await espionnerIrve(page);
  await ouvrirBornes(page);
  await expect(page.locator('.poi-reseau')).toHaveCount(1, { timeout: 15_000 });

  await page.locator('.poi-reseau').check();
  /* SUR `nom_operateur` DEPUIS LE 26/08. La liste groupe par exploitant — voir
     la mesure dans lib/index-bornes.ts — et la clause envoyée au portail doit
     interroger LE MÊME CHAMP : les deux se répondent, ou le filtre ment. */
  await expect.poll(() => vues.some((u) => u.includes('nom_operateur =') && u.includes('Belib')),
    { message: 'le réseau n’est pas parti au service' }).toBe(true);
});

test('un index en panne n’emporte PAS les bornes', async ({ page }) => {
  /* L'index n'est qu'un confort de filtrage tant qu'on est au-dessus du zoom
     12 : son échec ne doit pas priver l'usager de la couche elle-même. C'est
     le même contrat que la facette d'autrefois. */
  await page.route('**/mobilityref-france-irve-220/exports/json**',
    (route) => route.fulfill({ status: 500, body: 'panne' }));
  await espionnerIrve(page);
  await ouvrirBornes(page);

  // La couche est demandée, ses réglages sont là, et rien n'a explosé.
  await expect(page.locator('.poi-filtres')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.poi-reseau')).toHaveCount(0);
  await expect(page.locator('.poi-etat')).toContainText('Bornes électriques', { timeout: 15_000 });
});

/* ========================================================================
   BORNES-4 (01/09) — le mystère ZUNDER, et la puce du filtre POI.
   ======================================================================== */

/** L'export de l'index national répond vide : ces parcours ne dépendent pas
 *  du portail, et la CI ne le martèle pas. Enregistré AVANT l'espion, dont
 *  le `fallback()` retombe ici. */
async function taireIndexNational(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/exports/json**', (route) => route.fulfill({
    contentType: 'application/json',
    /* UNE station, pas zéro : un index vide déclenche le message « revenu
       vide » qui remplace TOUTE la ligne d'état — y compris la phrase des
       filtres que ces parcours mesurent. */
    body: JSON.stringify([{
      id_station_itinerance: 'FRZUNE1', nom_station: 'ZUNDER Paris',
      nom_enseigne: 'ZUNDER', nom_operateur: 'ZUNDER',
      condition_acces: 'Accès libre', prise_type_combo_ccs: 'true',
      p: 150, pdc: 4, lon: 2.35, lat: 48.85,
    }]),
  }));
}

test('la puce « Bornes de recharge » du filtre POI actionne LA couche du volet — pas une seconde', async ({ page }) => {
  /* BORNES-4. Armelin : « une nouvelle suggestion de POI dans les filtres
     du haut à gauche de la carte, les bornes de recharge ». La puce vit
     dans le filtre POI mais la couche reste celle du volet « Recharge et
     services » : cocher ici coche là-bas, et inversement. */
  await taireIndexNational(page);
  await espionnerIrve(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();
  const puce = page.getByRole('button', { name: 'Bornes de recharge' });
  await expect(puce).toBeVisible();
  await puce.click();
  await expect(puce).toHaveAttribute('aria-pressed', 'true');

  // La MÊME couche : la case du volet des services est cochée.
  await ouvrirReglagesBornes(page);
  const case_ = page.getByRole('checkbox', { name: 'Bornes électriques' });
  await expect(case_).toBeChecked();

  // Et l'inverse : décocher au volet éteint la puce.
  await case_.uncheck();
  /* ON REVIENT AUX LIEUX POUR LA REGARDER (ERGO-7, 02/09) : les réglages sont
     une page à part depuis qu'Armelin a demandé « une fenêtre dédiée », et la
     puce vit sur l'autre. Elle a changé d'état pendant qu'on ne la voyait
     pas — c'est justement ce qu'on vérifie. */
  await page.getByRole('button', { name: 'Revenir aux lieux à afficher' }).click();
  await expect(puce).toHaveAttribute('aria-pressed', 'false');
});

test('un filtre RESTAURÉ se dit — badge sur le volet, phrase d’état, retrait en un geste', async ({ page }) => {
  /* LE MYSTÈRE ZUNDER REJOUÉ : la mémoire porte un réseau coché lors d'une
     visite précédente. Sans BORNES-4, la carte se filtrait EN SILENCE —
     « aucune borne n'est visible [...] à l'exception du réseau ZUNDER »,
     conclu comme une panne. Désormais : un badge sur le volet, la phrase
     d'état, et « Tout afficher » qui retire ET réécrit la mémoire. */
  await taireIndexNational(page);
  await espionnerIrve(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await page.evaluate(async () => {
    await new Promise<void>((resoudre, rejeter) => {
      const d = indexedDB.open('infonovice-maps', 2);
      d.onupgradeneeded = () => {
        for (const m of ['preferences', 'favoris']) {
          if (!d.result.objectStoreNames.contains(m)) d.result.createObjectStore(m);
        }
      };
      d.onsuccess = () => {
        const tx = d.result.transaction('preferences', 'readwrite');
        tx.objectStore('preferences').put(['bornes'], 'poi');
        tx.objectStore('preferences').put({ reseaux: ['ZUNDER'] }, 'poi-filtres-bornes');
        tx.oncomplete = () => resoudre();
        tx.onerror = () => rejeter(tx.error);
      };
      d.onerror = () => rejeter(d.error);
    });
  });
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  /* LE RAPPEL SE VOIT SANS RIEN DÉPLIER (BORNES-5, 01/09). BORNES-4 l'avait
     posé dans le volet et sur la puce du panneau : deux surfaces REPLIÉES.
     Armelin a donc revu le même défaut le lendemain — « je n'ai toujours que
     les bornes ZUNDER » — sans jamais croiser l'avertissement. Ce parcours
     mesure donc le signal AVANT d'ouvrir quoi que ce soit.
     CE SIGNAL A CHANGÉ DE FORME (BORNES-8, 01/09) : c'était un rectangle posé
     à côté de la carte, et il en faisait trop — « il apparaît aussi bien en
     mode carte qu'en mode navigation et ne part jamais. En mode navigation,
     le cartouche se fait même écraser par le panneau de direction ». Une
     alerte qui ne part jamais cesse d'alerter. Reste un POINT sur
     l'entonnoir : assez pour qu'on ouvre, trop peu pour qu'on subisse. */
  const entonnoir = page.locator('.poi-bulle');
  await expect(entonnoir, 'le point doit se voir sans déplier')
    .toHaveClass(/poi-bulle-filtree/, { timeout: 10_000 });

  await page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();
  const rappel = page.locator('.poi-rappel-bornes');
  await expect(rappel).toBeVisible();
  await expect(rappel).toContainText('réseau ZUNDER');

  const badge = page.locator('.poi-famille-filtres');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText('filtres actifs');
  await expect(page.locator('.poi-famille-bornes'))
    .toHaveAttribute('title', 'Filtres actifs : réseau ZUNDER');

  // Dans le volet, la phrase d'état le dit en clair…
  await ouvrirReglagesBornes(page);
  await expect(page.locator('.poi-etat')).toContainText('Filtres bornes : réseau ZUNDER');

  // …ET LE RETRAIT TIENT EN UN GESTE — le bouton dit ce qu'il retire.
  const effacer = page.locator('.poi-filtres-effacer');
  await expect(effacer).toContainText('réseau ZUNDER');
  await effacer.click();
  await expect(badge).toBeHidden();
  await expect(rappel, 'le rappel doit disparaître avec le filtre').toBeHidden();
  await expect(entonnoir, 'et le point avec lui').not.toHaveClass(/poi-bulle-filtree/);
  /* L'ÉCRITURE EST ASYNCHRONE : recharger sans l'attendre coupe la
     transaction IndexedDB en vol, et le parcours mesurerait un hasard. On
     attend que la mémoire dise VRAIMENT « plus de réseau écarté » —
     c'est précisément le contrat de « Tout afficher ». */
  await expect.poll(async () => page.evaluate(async () =>
    new Promise((res) => {
      const d = indexedDB.open('infonovice-maps', 2);
      d.onsuccess = () => {
        const g = d.result.transaction('preferences').objectStore('preferences')
          .get('poi-filtres-bornes');
        g.onsuccess = () => { res(JSON.stringify(g.result ?? null)); };
        g.onerror = () => { res('erreur'); };
      };
      d.onerror = () => { res('erreur'); };
    })),
  { message: 'la mémoire garde encore le filtre retiré' })
    .not.toContain('ZUNDER');

  // ET LA MÉMOIRE EST CORRIGÉE : au rechargement, plus aucun filtre ne
  // ressuscite — c'était exactement le mécanisme du mystère.
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirReglagesBornes(page);
  await expect(page.getByRole('checkbox', { name: 'Bornes électriques' })).toBeChecked();
  await page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();
  await expect(page.locator('.poi-famille-filtres')).toBeHidden();
});

test('UN POINT SUR L’ENTONNOIR ANNONCE LE FILTRE, ET LE PANNEAU LE RETIRE', async ({ page }) => {
  /* BORNES-5 (01/09). Dire à quelqu'un que sa carte est filtrée en le
     renvoyant chercher le réglage dans un volet, c'est lui désigner la porte
     sans lui donner la clé. Le bouton du rappel retire tout, sur place —
     depuis le panneau des filtres, où BORNES-8 l'a rangé. */
  await taireIndexNational(page);
  await espionnerIrve(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async () => {
    await new Promise<void>((resoudre, rejeter) => {
      const d = indexedDB.open('infonovice-maps', 2);
      d.onupgradeneeded = () => {
        for (const m of ['preferences', 'favoris']) {
          if (!d.result.objectStoreNames.contains(m)) d.result.createObjectStore(m);
        }
      };
      d.onsuccess = () => {
        const tx = d.result.transaction('preferences', 'readwrite');
        tx.objectStore('preferences').put(['bornes'], 'poi');
        tx.objectStore('preferences').put({ reseaux: ['ZUNDER'] }, 'poi-filtres-bornes');
        tx.oncomplete = () => resoudre();
        tx.onerror = () => rejeter(tx.error);
      };
      d.onerror = () => rejeter(d.error);
    });
  });
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('.poi-bulle'), 'le point annonce le filtre')
    .toHaveClass(/poi-bulle-filtree/, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();
  const rappel = page.locator('.poi-rappel-bornes');
  await expect(rappel).toBeVisible();
  await rappel.getByRole('button', { name: 'Tout afficher' }).click();
  await expect(rappel).toBeHidden();

  /* ET LA MÉMOIRE EST CORRIGÉE : sans cela, le filtre ressusciterait à la
     prochaine visite — le mécanisme même du mystère. */
  await expect.poll(async () => page.evaluate(async () =>
    new Promise((res) => {
      const d = indexedDB.open('infonovice-maps', 2);
      d.onsuccess = () => {
        const g = d.result.transaction('preferences').objectStore('preferences')
          .get('poi-filtres-bornes');
        g.onsuccess = () => { res(JSON.stringify(g.result ?? null)); };
        g.onerror = () => { res('erreur'); };
      };
      d.onerror = () => { res('erreur'); };
    })),
  { message: 'la mémoire garde encore le filtre retiré' })
    .not.toContain('ZUNDER');
});

test('LE BOUTON « Tout afficher » SE LIT EN THÈME SOMBRE', async ({ page }) => {
  /* BORNES-8 (01/09). Armelin, sur mobile : « le texte est affiché en noir
     sur fond noir, du coup je ne vois pas ce qui est écrit ». `color:
     inherit` sur un <button> ne suffit pas : sans `color-scheme`, Chrome
     peint les contrôles avec SA palette claire pendant que le volet reste
     sombre. On mesure donc le CONTRASTE réel, pas la présence d'une règle. */
  await taireIndexNational(page);
  await espionnerIrve(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await ouvrirBornes(page);
  await page.getByLabel('Puissance minimale des bornes').selectOption('150');

  const mesure = await page.evaluate(() => {
    const b = document.querySelector('.poi-filtres-effacer') as HTMLElement;
    const s = getComputedStyle(b);
    /* LE FOND EFFECTIF : celui du bouton s'il est peint, sinon celui de son
       premier ancêtre qui l'est. Un `transparent` comparé à lui-même donnerait
       un contraste de 1 et ferait passer le défaut. */
    let fond = s.backgroundColor;
    let n: HTMLElement | null = b;
    while (n && (fond === 'rgba(0, 0, 0, 0)' || fond === 'transparent')) {
      n = n.parentElement;
      fond = n ? getComputedStyle(n).backgroundColor : 'rgb(255, 255, 255)';
    }
    return { texte: s.color, fond };
  });

  const lum = (couleur: string): number => {
    const [r, v, b] = (/(\d+),\s*(\d+),\s*(\d+)/.exec(couleur) ?? ['', '0', '0', '0'])
      .slice(1).map((x) => Number(x) / 255);
    const c = [r!, v!, b!].map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const a = lum(mesure.texte); const b = lum(mesure.fond);
  const contraste = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  /* LE CRITÈRE AA DU PROJET : 4,5:1 pour un texte courant. Noir sur noir vaut
     1 — c'est ce que mesurait son téléphone. */
  expect(contraste, `contraste insuffisant : ${mesure.texte} sur ${mesure.fond}`)
    .toBeGreaterThan(4.5);
});

test('CHERCHER « McDonald » NE DIT PLUS « aucun réseau »', async ({ page }) => {
  /* BORNES-7 (01/09). Armelin, pour la QUATRIÈME fois : « si je tape
     McDonald la recherche n'affiche aucun résultat […] ça fait plusieurs fois
     que je fais la remarque et ça n'est jamais corrigé ». Il avait raison, et
     la mesure du 01/09 dit pourquoi : la CARTE trouvait (4 177 stations
     « McDonald » en France, 91 autour de chez lui), mais la LISTE répondait
     « Aucun réseau ne correspond » — elle ne groupe que les EXPLOITANTS, et
     « McDonald's » est une ENSEIGNE écrite par SITE (443 écritures
     distinctes : « McDonald's - Thoiry »…). Il n'y a donc rien à cocher, et
     c'est le message qu'on corrige, pas la liste. */
  await taireIndexNational(page);
  await espionnerIrve(page);
  await ouvrirBornes(page);

  await page.getByLabel('Chercher un réseau ou un nom de station').fill('McDonald');
  const liste = page.locator('.poi-reseaux');
  await expect(liste).toContainText('n’est pas un exploitant', { timeout: 10_000 });
  await expect(liste, 'ne plus faire croire à une absence')
    .not.toContainText('Aucun réseau ne correspond');
  await expect(liste).toContainText('station, enseigne ou exploitant');
});

test('ET IL DIT QUE LE NOM S’AJOUTE AUX AUTRES FILTRES', async ({ page }) => {
  /* SON ÉCRAN PORTAIT « 5 réseaux cochés · 150 kW et plus · prises CCS
     Combo » : le nom s'ajoute à tout cela, et l'intersection était vide.
     Sans le dire, la carte paraît en panne. */
  await taireIndexNational(page);
  await espionnerIrve(page);
  await ouvrirBornes(page);
  await page.getByLabel('Puissance minimale des bornes').selectOption('150');

  await page.getByLabel('Chercher un réseau ou un nom de station').fill('McDonald');
  const cumul = page.locator('.poi-filtre-cumul');
  await expect(cumul).toBeVisible({ timeout: 10_000 });
  await expect(cumul).toContainText('150 kW et plus');
  await expect(cumul).toContainText('TOUT à la fois');
});

test('RESEAU-2 : taper un nom rend la LISTE des stations — et le choix y vole', async ({ page }) => {
  /* ARMELIN, quatrième signalement : « on voit en exemple écrit McDonald et
     si je tape McDonald, il ne se passe absolument rien ». Reproduit : la
     carte se filtrait, mais au zoom France la couche n'existe pas — rien ne
     changeait à l'écran. La recherche rend désormais quelque chose qu'on
     peut TOUCHER. */
  await espionnerIrve(page);
  await simulerIndexNational(page, [
    { nom: 'IZIVIA chez McDonald’s Ormesson', reseau: 'Izivia', lon: 2.54, lat: 48.79 },
    { nom: 'IZIVIA chez McDonald’s Lyon Sud', reseau: 'Izivia', lon: 4.82, lat: 45.7 },
    { nom: 'Fastned Paris Nord', reseau: 'Fastned', lon: 2.36, lat: 48.92 },
  ]);
  await ouvrirBornes(page);

  await page.locator('.poi-reseau-recherche').fill('McDonald');
  const stations = page.locator('.poi-station');
  await expect(stations).toHaveCount(2, { timeout: 10_000 });
  /* Le compte se dit, et l'ordre est LA DISTANCE : Ormesson (proche de la
     vue parisienne du parcours) avant Lyon. */
  await expect(page.locator('.poi-stations-titre')).toContainText('2 stations');
  await expect(stations.nth(0)).toContainText('Ormesson');
  await expect(stations.nth(1)).toContainText('Lyon Sud');
  await expect(stations.nth(0).locator('.poi-station-distance')).toContainText('km');

  /* Le choix VOLE vers la station : le centre de la carte la rejoint. */
  await stations.nth(0).click();
  await expect.poll(() => page.evaluate(() => {
    const c = (window as unknown as { __carte: { getCenter(): { lng: number; lat: number } } }).__carte;
    return Math.abs(c.getCenter().lng - 2.54) < 0.01 && Math.abs(c.getCenter().lat - 48.79) < 0.01;
  }), { timeout: 10_000 }).toBe(true);

  /* Et un nom inconnu ne rend PAS de liste fantôme. */
  await page.locator('.poi-reseau-recherche').fill('Zorglub');
  await expect(page.locator('.poi-stations')).toBeHidden();
});
