import { test, expect, type Request } from '@playwright/test';
import { ouvrirVolet } from './volets';
import { retour } from './planificateur';

/* LE BANC PARIS→LYON EN VF8 PLUS — T3, recDF5ZaSt7nXSM0I (11/09/2026).
 *
 * CE QUE CE PARCOURS MESURE, PAS CE QU'IL DÉMONTRE. Dix calculs de suite du
 * même trajet, plan de recharge automatique inclus (PR #84 : il se déclenche
 * au calcul dès qu'un véhicule électrique est renseigné). Chaque exécution
 * chronomètre du clic sur la suggestion d'arrivée — le geste qui déclenche
 * `#calculer()`, il n'existe pas de bouton « Calculer » séparé, voir
 * panneau-itineraire.ts — jusqu'à ce que le résumé (`.iti-resultat`) affiche
 * son état final : avec arrêts, sans arrêt nécessaire, ou hors recharge.
 *
 * CONTRE LES VRAIES API, DÉLIBÉRÉMENT (mission du 11/09, correction du chef) :
 * aucune tuile simulée, aucune route Playwright interceptée. Les quatre
 * familles de trajet (`itinéraire` Géoplateforme, `altimétrie` Géoplateforme,
 * `météo` Open-Meteo, `IRVE` l'index national des bornes rapides) sont
 * chronométrées par leurs événements réseau réels (`page.on('request'` /
 * `'requestfinished')`), catégorisées par IP... par URL. L'IRVE ne se
 * télécharge qu'UNE fois (cache IndexedDB, 30 jours, voir lib/index-bornes.ts)
 * : la première exécution paie ~700 Ko, les neuf suivantes le lisent en
 * local — c'est un résultat de la mesure, pas un artefact à corriger ici
 * (« ne corrige rien dans ce cycle »).
 *
 * PAS DANS LA CI PAR DÉFAUT. `test.skip` conditionné à la variable
 * d'environnement `MESURE=1` : exécuter avec
 *   `MESURE=1 npx playwright test tests-e2e/mesure-paris-lyon.spec.ts`
 * (après `npm run build && npm run preview` dans un autre terminal, ou en
 * laissant le `webServer` de playwright.config.ts s'en charger).
 */

test.skip(process.env['MESURE'] !== '1',
  'Banc de mesure réel (réseau IGN/Open-Meteo/IRVE) : réservé à MESURE=1, jamais à la CI.');
// Dix appels réseau réels, IRVE compris au premier tour : largement plus que
// les 30 s par défaut de playwright.config.ts.
test.setTimeout(6 * 60_000);

const DEPART_REQUETE = 'Paris 15e';
const DEPART_ATTENDU = /Paris 15e Arrondissement/;
const ARRIVEE_REQUETE = 'Place Charles Béraudier';
const ARRIVEE_ATTENDUE = /Place Charles B.raudier/;

type Categorie = 'itineraire' | 'altimetrie' | 'meteo' | 'irve';

function categoriser(url: string): Categorie | null {
  if (url.includes('data.geopf.fr/navigation/itineraire')) return 'itineraire';
  if (url.includes('data.geopf.fr/altimetrie')) return 'altimetrie';
  if (url.includes('api.open-meteo.com')) return 'meteo';
  if (url.includes('public.opendatasoft.com')) return 'irve';
  return null;
}

interface AppelReseau {
  iteration: number;
  categorie: Categorie;
  debutMs: number;
  finMs: number;
  dureeMs: number;
}

interface MesureIteration {
  iteration: number;
  totalMs: number;
  resultatTexte: string;
  itineraireMs: number;
  /** Le plus lent des appels du bloc parallèle (altimétrie, météo×2, IRVE si présent). */
  blocParalleleMs: number;
  /** L'écart mesuré entre la fin de l'itinéraire et le début du bloc parallèle —
      le débounce fixe de 1200 ms posé par `#minuteurPlanAuto`, plus l'attente
      (courte) de la lecture du véhicule en IndexedDB. */
  attenteMs: number;
  irveTelecharge: boolean;
  irveMs: number | null;
  meteoMs: number[];
  calculLocalMs: number;
}

test('Paris 15e → Lyon Part-Dieu, VF8 Plus, 80 % : dix calculs réels, plan de recharge inclus', async ({ page }) => {
  const appels: AppelReseau[] = [];
  const debutsRequetes = new Map<Request, number>();
  let iterationCourante = 0;

  page.on('request', (req) => {
    if (categoriser(req.url())) debutsRequetes.set(req, Date.now());
  });
  page.on('requestfinished', (req) => {
    const categorie = categoriser(req.url());
    const debut = debutsRequetes.get(req);
    if (!categorie || debut === undefined) return;
    debutsRequetes.delete(req);
    const fin = Date.now();
    appels.push({ iteration: iterationCourante, categorie, debutMs: debut, finMs: fin, dureeMs: fin - debut });
  });

  await test.step('Véhicule : VinFast VF8 Plus, 80 % de batterie', async () => {
    await page.goto('/');
    await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
    await ouvrirVolet(page, '.vehicule');
    // « VF 8 Plus » ne matcherait pas : la recherche compare la CHAÎNE ENTIÈRE
    // au libellé réduit, et « (Plus) » porte une parenthèse — chercher la
    // marque ouvre tout le groupe VinFast, d'où l'on choisit le bon bouton.
    await page.locator('.veh-recherche').fill('VinFast');
    await page.getByRole('button', { name: 'Choisir VinFast VF 8 (Plus)' }).click();
    await expect(page.getByLabel('Batterie', { exact: true })).toHaveValue('87.7');
    await page.getByLabel('Charge (SOC)').fill('80');
    // ON ATTEND L'ÉCRITURE EN INDEXEDDB (asynchrone), pas le DOM : c'est elle
    // que `#lireVehicule` du planificateur lit avant de déclencher le plan.
    await expect.poll(() => page.evaluate(() => new Promise((ok) => {
      const d = indexedDB.open('infonovice-maps');
      d.onsuccess = () => {
        try {
          const r = d.result.transaction('preferences', 'readonly')
            .objectStore('preferences').get('vehicule');
          r.onsuccess = () => {
            const m = (r.result ?? {}) as {
              vehicule?: { soc?: number; capaciteNominale?: number;
                consommations?: { autoroute?: number } };
            };
            ok({
              soc: m.vehicule?.soc ?? null,
              capacite: m.vehicule?.capaciteNominale ?? null,
              autorouteOk: (m.vehicule?.consommations?.autoroute ?? 0) > 0,
            });
          };
          r.onerror = () => ok('illisible');
        } catch { ok('magasin absent'); }
      };
      d.onerror = () => ok('base illisible');
    })), { timeout: 10_000 }).toEqual({ soc: 80, capacite: 87.7, autorouteOk: true });
  });

  await retour(page);

  const mesures: MesureIteration[] = [];

  for (let i = 1; i <= 10; i += 1) {
    iterationCourante = i;
    await test.step(`Calcul n°${i}`, async () => {
      // DÉPART — « Paris 15e » : la Base Adresse Nationale rend
      // « Paris 15e Arrondissement » en premier résultat (vérifié par appel
      // réel le 11/09/2026, score 0,87).
      const champDepart = page.locator('[data-role="depart"] input');
      await champDepart.fill(DEPART_REQUETE);
      await page.locator('[data-role="depart"] [role="option"]').first().click();
      await expect(champDepart).toHaveValue(DEPART_ATTENDU, { timeout: 10_000 });

      // ARRIVÉE — « Place Charles Béraudier » : l'adresse du parvis de la
      // gare de Lyon Part-Dieu (vérifié par appel réel, score 0,97). LE CLIC
      // SUR LA SUGGESTION EST LE POINT DE DÉPART DU CHRONOMÈTRE : c'est lui
      // qui déclenche `void this.#calculer()`, l'équivalent du bouton
      // « Calculer » qui n'existe pas dans cette interface.
      const champArrivee = page.locator('[data-role="arrivee"] input');
      await champArrivee.fill(ARRIVEE_REQUETE);
      const optionArrivee = page.locator('[data-role="arrivee"] [role="option"]').first();
      await expect(optionArrivee).toBeVisible({ timeout: 10_000 });

      const t0 = Date.now();
      await optionArrivee.click();

      // LA FIN DU CALCUL SE RECONNAÎT À SON TEXTE — EN DEUX TEMPS, ET C'EST
      // IMPORTANT. `#majResume` écrit, en trois passages successifs :
      //   1. « Calcul de l'itinéraire… » — synchrone, dès le clic ;
      //   2. une fois la route connue, IMMÉDIATEMENT, « … de route, hors
      //      recharge » — SANS ellipse, alors que `this.#planEnCours` porte
      //      encore sa valeur d'avant (false) : CE N'EST PAS LE RÉSULTAT
      //      FINAL, seulement l'absence momentanée de plan ;
      //   3. 1200 ms plus tard (`#minuteurPlanAuto`), le vrai plan démarre :
      //      « … calcul des arrêts de recharge… », avec ellipse.
      // Guetter la seule absence d'ellipse conclurait donc le calcul environ
      // 1200 ms trop tôt, sur un texte qui ressemble au résultat final sans
      // l'être — et guetter n'importe quelle ellipse retomberait sur l'étape
      // 1, instantanée. On attend donc la phrase PRÉCISE de l'étape 3, puis
      // sa disparition (le résultat final — arrêts, aucun arrêt nécessaire,
      // ou un vrai refus une fois le plan réellement tenté).
      const resultat = page.locator('.iti-resultat');
      await expect(resultat).toBeVisible({ timeout: 60_000 });
      await expect(resultat).toContainText('calcul des arrêts de recharge', { timeout: 15_000 });
      await expect.poll(async () => {
        if (!(await resultat.isVisible())) return null;
        const texte = await resultat.textContent();
        return texte && !texte.includes('…') ? texte : null;
      }, { timeout: 60_000, message: 'le résumé n’est jamais sorti de « … »' }).not.toBeNull();
      const t1 = Date.now();

      // Vérifié APRÈS le chronométrage : ça ne coûte rien à la mesure, et ça
      // garantit que chaque tour a bien calculé LE MÊME trajet.
      await expect(champArrivee).toHaveValue(ARRIVEE_ATTENDUE);

      const resultatTexte = (await resultat.textContent()) ?? '';
      const totalMs = t1 - t0;

      const appelsIteration = appels.filter((a) => a.iteration === i);
      const itineraire = appelsIteration.find((a) => a.categorie === 'itineraire');
      const meteoMs = appelsIteration.filter((a) => a.categorie === 'meteo').map((a) => a.dureeMs);
      const altimetrie = appelsIteration.find((a) => a.categorie === 'altimetrie');
      const irve = appelsIteration.find((a) => a.categorie === 'irve');

      const itineraireMs = itineraire?.dureeMs ?? 0;
      const finItineraire = itineraire?.finMs ?? t0;
      const blocDebuts = appelsIteration
        .filter((a) => a.categorie !== 'itineraire')
        .map((a) => a.debutMs);
      const blocDebut = blocDebuts.length > 0 ? Math.min(...blocDebuts) : finItineraire;
      const blocFins = appelsIteration
        .filter((a) => a.categorie !== 'itineraire')
        .map((a) => a.finMs);
      const blocFin = blocFins.length > 0 ? Math.max(...blocFins) : blocDebut;
      const blocParalleleMs = blocFin - blocDebut;
      const attenteMs = Math.max(0, blocDebut - finItineraire);
      const calculLocalMs = Math.max(0, totalMs - itineraireMs - attenteMs - blocParalleleMs);

      mesures.push({
        iteration: i,
        totalMs,
        resultatTexte,
        itineraireMs,
        blocParalleleMs,
        attenteMs,
        irveTelecharge: irve !== undefined,
        irveMs: irve?.dureeMs ?? null,
        meteoMs,
        calculLocalMs,
      });

      test.info().annotations.push({
        type: `mesure-${i}`,
        description: `${totalMs} ms — itinéraire ${itineraireMs} ms, attente ${attenteMs} ms,`
          + ` bloc parallèle ${blocParalleleMs} ms (altimétrie ${altimetrie?.dureeMs ?? '—'} ms,`
          + ` météo ${meteoMs.join('/')} ms, IRVE ${irve?.dureeMs ?? 'cache'} ms),`
          + ` local ${calculLocalMs} ms — « ${resultatTexte} »`,
      });
    });

    if (i < 10) {
      await page.locator('.iti-effacer').click();
      await expect(page.locator('[data-role="depart"] input')).toHaveValue('');
    }
  }

  // ---- Le rapport chiffré, dans la sortie du test (et repris dans
  // docs/mesure-paris-lyon.md par la mission). ----
  const tries = [...mesures].sort((a, b) => a.totalMs - b.totalMs);
  const total = tries.map((m) => m.totalMs);
  const min = total[0]!;
  const mediane = (total[4]! + total[5]!) / 2;
  // p95 sur 10 valeurs, rang au plus proche (méthode « nearest-rank ») :
  // ceil(0.95 × 10) = 10 — c'est le maximum.
  const p95 = total[9]!;

  const tableau = mesures.map((m) => (
    `${m.iteration}. ${m.totalMs} ms — itinéraire ${m.itineraireMs} ms, attente ${m.attenteMs} ms,`
    + ` bloc parallèle ${m.blocParalleleMs} ms, local ${m.calculLocalMs} ms,`
    + ` IRVE ${m.irveTelecharge ? `téléchargé (${m.irveMs} ms)` : 'cache'}`
  )).join('\n');

  test.info().annotations.push({
    type: 'resultat-final',
    description: `min ${min} ms · médiane ${mediane} ms · p95 ${p95} ms\n${tableau}`,
  });

  // eslint-disable-next-line no-console
  console.log(
    '\n=== MESURE PARIS→LYON VF8 PLUS (T3) ===\n'
    + `min ${min} ms · médiane ${mediane} ms · p95 ${p95} ms\n${tableau}\n`,
  );

  // LE BANC PROUVE QU'IL A TOURNÉ, PAS UN SEUIL DE PERFORMANCE : cette tâche
  // mesure, elle ne corrige rien (mission du 11/09). L'assertion garde
  // seulement le parcours honnête : dix calculs aboutis, un plan de recharge
  // réellement tenté à chaque fois (VF8 Plus en voiture électrique).
  expect(mesures).toHaveLength(10);
  for (const m of mesures) {
    expect(m.resultatTexte, `itération ${m.iteration}`).not.toContain('…');
    expect(m.itineraireMs, `itération ${m.iteration} : pas de réponse itinéraire IGN captée`)
      .toBeGreaterThan(0);
  }
});
