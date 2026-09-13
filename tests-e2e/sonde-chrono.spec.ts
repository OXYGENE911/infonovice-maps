import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import {
  SCRIPT_OBSERVATEUR, jugerCalcul, jugerPorte, type BrutSonde,
} from '../scripts/chrono-sonde.mjs';

/* LA SONDE MESURE-T-ELLE CE QU'ELLE ANNONCE ? (SONDE-VRAIE-1, 13/09/2026)
 *
 * La contre-mesure a établi que non : `--campagne` relevait `performance.now()`
 * après le chargement de la page et l'appelait mesure du calcul. Six chiffres
 * seraient sortis, et aucun n'aurait parlé du critère des 5 s.
 *
 * CE PARCOURS EST L'ÉTALONNAGE DE L'INSTRUMENT, pas une mesure du produit.
 * On RALENTIT le service d'itinéraire d'un retard CONNU, et l'on vérifie que
 * le chronomètre rend ce retard. « Une campagne dont tu connais la durée
 * attendue doit rendre ce que tu attends » (mission du 13/09, tâche 1a).
 *
 * POURQUOI ICI ET PAS EN LANÇANT LA SONDE. Sur le poste de développement, la
 * garde de charge refuse de mesurer — 37 processus résidents relevés le 13/09
 * pour un plafond de 20 — et le CEO a interdit toute campagne tant que la
 * question de la machine de mesure n'est pas tranchée. La CI, elle, tourne
 * déjà les parcours E2E : c'est le seul endroit où le chronomètre peut être
 * confronté au vrai produit. AUCUN CHIFFRE DE PERFORMANCE NE SORT D'ICI —
 * les bornes ci-dessous portent sur la fidélité de l'instrument, jamais sur la
 * rapidité du produit, et un runner lent ne les fera pas mentir.
 */

/** Le retard injecté dans le service d'itinéraire. On le CONNAÎT. */
const RETARD_ITINERAIRE_MS = 3_000;

const lireSonde = (page: Page): Promise<BrutSonde> => page.evaluate(
  () => (window as unknown as { __sonde: { lire(): BrutSonde } }).__sonde.lire(),
);

const armerSonde = (page: Page): Promise<void> => page.evaluate(
  () => { (window as unknown as { __sonde: { armer(): void } }).__sonde.armer(); },
);

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);

  /* L'OBSERVATEUR AVANT LE PREMIER OCTET DE PAGE : c'est ainsi que la sonde
     le pose, et l'étalonnage doit éprouver le montage réel, pas un montage
     d'essai plus commode. */
  await page.addInitScript(SCRIPT_OBSERVATEUR);

  /* LE RETARD CONNU. Le tracé et la distance s'accordent (390 km en ligne
     droite, 10 800 s) : la leçon de recharge.spec.ts, où une fixture annonçait
     465 km sur un tracé de 390 et faisait échouer le plan pour une raison qui
     n'existait que dans la fixture. */
  await page.route('**/data.geopf.fr/navigation/itineraire**', async (route) => {
    await new Promise((r) => { setTimeout(r, RETARD_ITINERAIRE_MS); });
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
        distance: 390_000, duration: 10_800,
      }),
    });
  });

  /* LE GÉOCODAGE EST SIMULÉ ET INSTANTANÉ — comme dans la sonde, et pour la
     même raison : sur la feuille de relevé mobile, le géocodage est DÉJÀ fini
     quand le chronomètre part. */
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    const estLyon = /lyon/i.test(q);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        features: [{
          geometry: { coordinates: estLyon ? [4.8357, 45.764] : [2.3522, 48.8566] },
          properties: {
            label: estLyon ? 'Lyon' : 'Paris', type: 'municipality',
            postcode: '', city: estLyon ? 'Lyon' : 'Paris',
          },
        }],
      }),
    });
  });

  /* L'INDEX NATIONAL DES BORNES, une station à mi-parcours : sans lui, pas de
     plan de recharge, donc pas de fin de chronomètre. */
  await page.route('**/public.opendatasoft.com/**', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes('/exports/json')) {
      /* DEUX STATIONS, À 150 ET 300 km DU DÉPART sur le tracé de la fixture.
         UNE SEULE, À 196 km, NE SUFFISAIT PAS : le produit répondait « aucune
         borne utilisable avant 196 km, où la réserve serait entamée » — un
         REFUS motivé, mesuré le 13/09. L'étalonnage doit finir sur un vrai
         plan de recharge, puisque c'est cette fin-là que le critère des 5 s
         désigne. On corrige la fixture, PAS la voiture : les 80 % au départ
         viennent de la feuille de relevé mobile, et deux chiffres comparables
         doivent décrire la même voiture. */
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id_station_itinerance: 'FRSONDE01',
            nom_station: 'Aire d’essai 150',
            nom_enseigne: 'Réseau d’essai', nom_operateur: 'Réseau d’essai',
            condition_acces: 'Accès libre',
            prise_type_combo_ccs: '1', prise_type_chademo: '0', prise_type_2: '0',
            p: 150, pdc: 8, lon: 3.308, lat: 47.666,
          },
          {
            id_station_itinerance: 'FRSONDE02',
            nom_station: 'Aire d’essai 300',
            nom_enseigne: 'Réseau d’essai', nom_operateur: 'Réseau d’essai',
            condition_acces: 'Accès libre',
            prise_type_combo_ccs: '1', prise_type_chademo: '0', prise_type_2: '0',
            p: 150, pdc: 8, lon: 4.262, lat: 46.478,
          },
        ]),
      });
    }
    return route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ total_count: 0, results: [] }),
    });
  });

  /* Conditions neutres : 20 °C, terrain plat — les facteurs valent 1 et le
     plan ne dépend pas de la météo du jour où la CI tourne. */
  await page.route('**/api.open-meteo.com/**', (route) => {
    const base = new Date();
    const heure = (h: number): string => {
      const d = new Date(base.getTime() + h * 3600 * 1000);
      const p = (n: number): string => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00`;
    };
    const heures = [-1, 0, 1, 2, 3, 4, 5];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      utc_offset_seconds: 0,
      hourly: {
        time: heures.map(heure),
        temperature_2m: heures.map(() => 20),
        precipitation: heures.map(() => 0),
        weather_code: heures.map(() => 0),
        wind_speed_10m: heures.map(() => 5),
      },
    }) });
  });
  await page.route('**/data.geopf.fr/altimetrie/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ elevations: [
      { lon: 2.3522, lat: 48.8566, z: 100, acc: 'Average value' },
      { lon: 3.6, lat: 47.3, z: 100, acc: 'Average value' },
      { lon: 4.8357, lat: 45.764, z: 100, acc: 'Average value' },
    ] }),
  }));
});

/** Le véhicule de la feuille de relevé mobile, saisi par le formulaire. */
async function saisirVehicule(page: Page): Promise<void> {
  await page.locator('.iti-vers[data-vers="vehicule"]').click();
  await page.getByLabel('Batterie', { exact: true }).fill('87.7');
  await page.getByLabel('Santé (SOCE)').fill('100');
  await page.getByLabel('Charge (SOC)').fill('80');
  await page.getByLabel('Charge max', { exact: true }).fill('150');
  await page.getByLabel('Sur autoroute').fill('280');
  await expect(page.locator('.veh-bilan-lignes')).toContainText('Sur autoroute');
  await page.locator('.vue-retour').click();
  await expect(page.locator('.vue-accueil')).toBeVisible();
}

test('le chunk du panneau d’itinéraire n’est demandé QU’APRÈS le chargement de la page', async ({ page }) => {
  /* LA MOITIÉ NAVIGATEUR DU DÉFAUT N° 3. L'autre moitié — « le contrôle mord
     sur ce fichier » — est éprouvée sans navigateur dans tests/sonde-bundle.test.ts.
     Ici on établit le FAIT qui rendait l'ancien contrôle vide : au moment où
     `page.goto(..., {waitUntil:'load'})` rend la main, ce chunk n'a pas encore
     été demandé. L'empreinter à cet instant, c'était ne pas l'empreinter. */
  const demandes: { url: string; a: number }[] = [];
  const depart = Date.now();
  page.on('request', (r) => {
    if (/\/assets\/.*\.js(\?|$)/.test(r.url())) demandes.push({ url: r.url(), a: Date.now() - depart });
  });

  await page.goto('/', { waitUntil: 'load' });
  const aLaFinDuChargement = demandes.map((d) => d.url).join(' ');
  expect(aLaFinDuChargement,
    'le chunk du panneau d’itinéraire serait déjà là : le défaut n° 3 n’existerait pas')
    .not.toContain('panneau-itineraire');

  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  await page.locator('.iti > summary').click();
  await expect(page.locator('.iti[open]')).toHaveCount(1);

  await expect.poll(() => demandes.map((d) => d.url).join(' '), { timeout: 20_000 })
    .toContain('panneau-itineraire');
  const chunk = demandes.find((d) => d.url.includes('panneau-itineraire'));
  console.error('[bundle] chunk du panneau d’itinéraire demandé à', chunk?.a,
    'ms après le début, soit APRÈS le chargement de la page.');
});

test('le chronomètre de la sonde rend le retard qu’on lui a injecté, pas le temps de chargement de la page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  const chargementPageMs = await page.evaluate(() => Math.round(performance.now()));

  await page.locator('.iti > summary').click();
  await saisirVehicule(page);

  const champs = page.locator('.iti input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');

  // LE CHRONOMÈTRE EST ARMÉ ICI, juste avant le geste qui lance le calcul.
  await armerSonde(page);
  await page.getByRole('option', { name: 'Lyon' }).first().click();

  await page.locator('.iti-vers[data-vers="recharge"]').click({ timeout: 30_000 });
  await page.waitForFunction(
    () => (window as unknown as { __sonde: { planPretA: number | null } }).__sonde.planPretA !== null,
    undefined, { timeout: 60_000 },
  );

  const brut = await lireSonde(page);
  const v = jugerCalcul(brut);

  /* CE QUE CE PARCOURS PROUVE, ASSERTION PAR ASSERTION. */

  // 1. Le chronomètre est parti d'un geste, pas du chargement de la page.
  expect(brut.departA, 'le clic de lancement n’a pas armé le chronomètre').not.toBeNull();
  expect(brut.departA as number,
    'le départ doit être POSTÉRIEUR au chargement de la page : c’est exactement'
    + ' la confusion qui a produit le défaut n° 1').toBeGreaterThan(chargementPageMs);

  // 2. Une durée est publiée, et elle contient le retard qu'on a injecté.
  expect(v.mesure, `aucune mesure : ${v.motif}`).toBe(true);
  /* LA FIN DU CHRONOMÈTRE EST BIEN LE PLAN DE RECHARGE — pas un refus, pas la
     ligne de résultat de l'itinéraire. C'est la définition de la feuille de
     relevé mobile, et l'étalonnage doit éprouver CETTE fin-là. */
  expect(v.naturePlan, 'le chronomètre doit s’arrêter sur un plan de recharge').toBe('plan');
  expect(v.dureeCalculMs as number,
    `le retard injecté est de ${RETARD_ITINERAIRE_MS} ms : un chronomètre qui rend`
    + ' moins ne chronomètre pas le calcul').toBeGreaterThanOrEqual(RETARD_ITINERAIRE_MS);

  // 3. LA DISCRIMINATION SE FAIT PAR LE RETARD INJECTÉ, PAS PAR UNE COMPARAISON
  //    AVEC LE CHARGEMENT DE PAGE. Une version précédente exigeait
  //    `dureeCalculMs > chargementPageMs` : la revue Codex du 13/09 a montré
  //    que ces deux durées sont INDÉPENDANTES — un runner qui met 6 s à peindre
  //    la carte aurait fait rougir un chronomètre pourtant exact, et un faux
  //    rouge est précisément ce qui pousse un futur agent à relâcher une
  //    assertion. L'assertion n° 2 discrimine déjà : le chargement d'une page
  //    ne contient pas le retard de 3 s injecté dans le service d'itinéraire.
  //    Le chiffre reste publié au journal, pour qu'on puisse les comparer à la
  //    lecture sans en faire une condition de passage.

  // 3 bis. LE CHIFFRE PUBLIÉ EST EXACTEMENT « plan lisible moins geste », et rien
  //    d'autre. C'est ce qui ferme le trou laissé par le retrait de la
  //    comparaison au chargement (revue Codex, 2e passage) : une régression qui
  //    publierait la durée de chargement sous le nom du critère passerait des
  //    bornes larges, mais pas cette égalité, qui recalcule la durée depuis les
  //    horodatages bruts de l'observateur.
  expect(v.dureeCalculMs,
    'la durée publiée doit être planLisibleA moins departA, et rien d’autre')
    .toBe(Math.round((brut.planLisibleA as number) - (brut.departA as number)));
  expect(v.dureeCalculInterneMs, 'le plan doit avoir été écrit').not.toBeNull();
  expect(v.dureeCalculMs as number,
    'le plan lisible ne peut pas précéder le plan écrit')
    .toBeGreaterThanOrEqual(v.dureeCalculInterneMs as number);

  // 4. Le jalon intermédiaire est nommé pour ce qu'il est, et il vient AVANT
  //    la fin du calcul : l'itinéraire n'est pas le plan de recharge.
  expect(v.dureeItineraireMs).not.toBeNull();
  expect(v.dureeItineraireMs as number).toBeLessThanOrEqual(v.dureeCalculMs as number);

  // 5. Et l'on sait ce que l'usager a eu sous les yeux pendant l'attente —
  //    c'est ce que la feuille de relevé mobile demande de noter.
  expect(brut.attentes.length, 'aucun état d’attente relevé').toBeGreaterThan(0);
  console.error('[étalonnage] corps recharge :',
    (await page.locator('.iti-recharge-corps').innerText()).replace(/\s+/g, ' ').slice(0, 400));
  console.error('[étalonnage] retard injecté', RETARD_ITINERAIRE_MS, 'ms ;',
    'chargement page', chargementPageMs, 'ms ;',
    'durée itinéraire', v.dureeItineraireMs, 'ms ;',
    'durée calcul', v.dureeCalculMs, 'ms ;',
    'nature', v.naturePlan, ';',
    'attentes', JSON.stringify(brut.attentes));
});

test('sans plan de recharge, la sonde ne publie AUCUNE durée — elle dit ce qu’elle a observé', async ({ page }) => {
  /* LE CAS QUI FAISAIT MENTIR L'ANCIENNE SONDE. Sans véhicule, le produit
     n'écrit pas de plan : il invite à renseigner la voiture. Un instrument qui
     rendrait ici un nombre rendrait la durée de sa propre patience. */
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  await page.locator('.iti > summary').click();

  const champs = page.locator('.iti input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  await armerSonde(page);
  await page.getByRole('option', { name: 'Lyon' }).first().click();

  await expect(page.locator('.iti-resultat')).toContainText('390 km', { timeout: 30_000 });
  await page.locator('.iti-vers[data-vers="recharge"]').click({ timeout: 30_000 });
  await expect(page.locator('.iti-recharge-corps'))
    .toContainText('Renseignez d’abord votre véhicule', { timeout: 30_000 });

  const v = jugerCalcul(await lireSonde(page));
  expect(v.mesure).toBe(false);
  expect(v.dureeCalculMs, 'une durée publiée ici serait bornée par notre patience').toBeNull();
  expect(v.motif).toMatch(/AUCUNE durée de calcul n’est publiée/);
  // Mais le jalon réellement atteint, lui, est publié : l'itinéraire a bien
  // été calculé, et ce nombre-là n'est pas borné par la fenêtre.
  expect(v.dureeItineraireMs).not.toBeNull();
});

test('la porte de sortie : quand elle paraît, ce que l’usager voit avant, et combien de temps elle tient', async ({ page }) => {
  /* DEUX QUESTIONS DANS UN SEUL PARCOURS, parce qu'elles se mesurent au même
     chronomètre :
       — TÂCHE 1b : quand la porte ne se referme pas, la sonde doit dire
         « toujours ouverte après N ms observées » et ne publier AUCUNE durée
         de vie. Ici, contre le VRAI produit, pas sur une fonction pure.
       — TÂCHE 2 : le délai AVANT l'apparition de la porte, et ce que l'usager
         a sous les yeux pendant ce temps-là. La mission dit : n'y touche pas,
         mesure-le. C'est ce que fait ce parcours ; le CEO tranchera.
     Le service d'itinéraire est arrêté 30 s, plus que le plafond dur de
     `calculerItineraire` (16 500 ms = 2 × 8 000 + 500) : les deux essais
     expirent, et l'on est exactement dans le cas où l'ancien code refermait la
     porte sur l'usager. */
  test.setTimeout(120_000);
  await page.unroute('**/data.geopf.fr/navigation/itineraire**');
  await page.route('**/data.geopf.fr/navigation/itineraire**', async (route) => {
    await new Promise((r) => { setTimeout(r, 30_000); });
    await route.abort('timedout');
  });

  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  await page.locator('.iti > summary').click();
  const champs = page.locator('.iti input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  await armerSonde(page);
  await page.getByRole('option', { name: 'Lyon' }).first().click();

  /* ON ATTEND QUE LA PORTE S'OUVRE, PUIS ON OBSERVE DIX SECONDES DE PLUS.
     Une version précédente attendait 30 s en tout : la revue Codex du 13/09 a
     montré qu'un runner lent pouvait n'observer que six secondes après
     l'ouverture, et faire rougir l'exigence des huit secondes alors que la
     porte serait restée ouverte indéfiniment. Une fenêtre qui confond
     « observation trop courte » et « défaut du produit » est un faux rouge, et
     un faux rouge finit par faire baisser une barre. La fenêtre part donc de
     l'OUVERTURE, pas du départ. */
  await page.waitForFunction(
    () => (window as unknown as { __sonde: { porteOuverteA: number | null } })
      .__sonde.porteOuverteA !== null,
    undefined, { timeout: 60_000 },
  );
  /* DEUX CONDITIONS, ET C'EST L'OBSERVATEUR LUI-MEME QUI LES CONSTATE (revue
     Codex, 2e passage). Attendre dix secondes cote Playwright ne garantit pas
     dix secondes RELEVEES : si le rendu de la page est interrompu, la boucle
     requestAnimationFrame ne tourne plus, toujoursOuverteApresMs reste petit,
     et l'exigence des huit secondes rougirait sans regression. On attend donc
     que l'observateur ait vu dix secondes s'ecouler depuis l'ouverture. Et
     l'on conserve AUSSI la fenetre totale de 30 s depuis le geste : la version
     precedente pouvait rendre la main vers 25 s et manquer une fermeture
     regressive survenant a 27 s. */
  await page.waitForFunction(
    () => {
      const w = (window as unknown as {
        __sonde: { porteOuverteA: number | null; dernierRegard: number; departA: number | null };
      }).__sonde;
      if (w.porteOuverteA === null || w.departA === null) return false;
      return w.dernierRegard - w.porteOuverteA >= 10_000
        && w.dernierRegard - w.departA >= 30_000;
    },
    undefined, { timeout: 120_000 },
  );
  const brut = await lireSonde(page);
  const p = jugerPorte(brut);

  expect(brut.departA, 'le chronomètre n’a pas été armé').not.toBeNull();
  expect(p.ouverte, `la porte ne s’est pas ouverte : ${p.motif}`).toBe(true);

  // LE DÉLAI D'APPARITION, MESURÉ — c'est le chiffre de la tâche 2.
  const delaiApparitionMs = Math.round((brut.porteOuverteA as number) - (brut.departA as number));
  expect(delaiApparitionMs,
    'la porte ne peut pas paraître avant le seuil d’abandon de 15 000 ms')
    .toBeGreaterThanOrEqual(15_000);

  // LA PORTE NE SE REFERME PAS — et la sonde ne publie AUCUNE durée de vie.
  expect(p.refermee, 'la porte s’est refermée : le correctif de la PR #318 aurait cédé').toBe(false);
  expect(p.dureeDeVieMs,
    'une « durée de vie » publiée ici serait celle de notre fenêtre d’observation').toBeNull();
  expect(p.toujoursOuverteApresMs as number,
    'exigence du CEO du 13/09 : le bouton reste utilisable AU MOINS 8 000 ms')
    .toBeGreaterThanOrEqual(8_000);

  /* LE FAIT DÉCOUVERT EN MESURANT, et qu'il ne faut pas taire : à 1280 × 720,
     le bouton « Réessayer » est PRÉSENT mais sous la ligne de flottaison du
     volet — il faut faire défiler pour le voir. La sonde le dit au lieu de
     conclure « pas de porte », et ce parcours l'enregistre au lieu de le
     corriger : le correctif de la porte est hors périmètre de cette passe. */
  console.error('[porte] atteignable sans défilement :', p.atteignableSansDefilement,
    '— rectangle du bouton :', JSON.stringify(await page.evaluate(() => {
      const b = document.querySelector('.iti-abandon-reessayer');
      const r = b?.getBoundingClientRect();
      return r ? {
        y: Math.round(r.y), hauteurFenetre: window.innerHeight,
        sousLaLigneDeFlottaison: r.y > window.innerHeight,
      } : null;
    })));

  console.error('[porte] délai d’apparition', delaiApparitionMs, 'ms ;',
    'toujours ouverte après', p.toujoursOuverteApresMs, 'ms observées ;',
    'durée de vie publiée :', p.dureeDeVieMs, ';',
    'ce que l’usager a vu :', JSON.stringify(brut.attentes.map(
      (x) => ({ a: x.a - Math.round(brut.departA as number), texte: x.texte }),
    )));
});
