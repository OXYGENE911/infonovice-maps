import { test, expect, type Page, type Request, type Response } from '@playwright/test';
import { ouvrirPlanificateur, allerA, retour } from './planificateur';
import { ouvrirVolet, ouvrirReglagesBornes } from './volets';

/* LE GARDE-FOU DU STAND — Mondial de l'Auto, 12-18/10/2026 (T2, rectlR6gVbiWQzUN4,
 * mission Ingénierie du 11/09/2026).
 *
 * Ce parcours rejoue les huit étapes du scénario écrit par Produit &
 * Architecture (`docs/demo-salon.md`, PR #304) DANS L'ORDRE, contre les API
 * RÉELLES — pas `simulerTuiles`, aucune route interceptée. Le but n'est pas
 * la déterminisme d'une suite CI ordinaire : c'est de savoir si LA DÉMO, telle
 * qu'elle sera jouée devant un visiteur avec un vrai réseau de salon, tient —
 * carte, itinéraire, plan de recharge, couloir hors ligne, mode avion. Un
 * bug ici n'est pas corrigé dans ce cycle (mandat du 11/09) : il est noté
 * dans le rapport, c'est le but du garde-fou.
 *
 * DEUX test(), PAS UN SEUL. `docs/demo-salon.md` le prescrit et le mesure :
 * l'étape 7 télécharge le couloir hors ligne À TRAVERS le service worker, ce
 * qui suppose de le laisser prendre la main sur la page ; l'étape 8 (hors
 * réseau) a besoin de la même chose, mais `tests-e2e/tuiles-simulees.ts`
 * (commentaire l. 68-82) mesure que poser une route de CONTEXTE pour les
 * tuiles — ce que fait `tuilesDuServiceWorker` — casse ensuite le parcours
 * hors réseau, trois échecs sur trois. Cette suite ne simule aucune tuile
 * (API réelles), donc n'appelle jamais `tuilesDuServiceWorker` — mais elle
 * garde la séparation en deux `test()` prescrite : l'étape 8 a son propre
 * préambule (véhicule + trajet + couloir déjà chargé), plutôt que de
 * prolonger le premier test après sept étapes déjà coûteuses en réseau réel.
 *
 * LE CHRONOMÈTRE (étape 3, calcul itinéraire + plan de recharge) évite les
 * quatre biais relevés par la revue Codex de la PR #305
 * (`handoffs/2026-09-11-0110-codex-mesure-pr305.md`, sur
 * `tests-e2e/mesure-paris-lyon.spec.ts`) :
 *   1. le chrono part du clic déjà actionnable (élément attendu visible AVANT
 *      `Date.now()`) et s'arrête sur un `page.waitForFunction` à sondage
 *      `raf` (une frame, pas le sondage à palier de `expect.poll`, qui peut
 *      ajouter jusqu'à une seconde non comptée pour ce qu'elle est) ;
 *   2. la fin du calcul n'est PAS détectée par le texte transitoire
 *      « calcul des arrêts de recharge… » (`#majResume`,
 *      panneau-itineraire.ts l. 3127 : ce texte peut apparaître et
 *      disparaître entre deux sondages, à cache chaud). Le signal retenu est
 *      la présence du plan réellement conclu — « % de batterie » n'apparaît
 *      dans `.iti-resultat` QUE quand `plan.faisable` est vrai (l. 3140,
 *      3150), jamais pendant les états transitoires (« hors recharge »,
 *      « calcul des arrêts de recharge… ») : c'est la même idée que
 *      « détecter par la présence des arrêts », appliquée au résumé déjà
 *      visible plutôt qu'à la page « Arrêts de recharge », qui n'est pas
 *      encore ouverte à cet instant du scénario ;
 *   3. un échec réseau IRVE ou météo PENDANT la fenêtre chronométrée fait
 *      échouer le test explicitement, plutôt que de laisser passer un
 *      résultat « hors recharge » de repli comme une mesure valide ;
 *   4. `requestfailed` est écouté au même titre que `requestfinished` : une
 *      requête échouée n'est jamais un simple silence dans le calcul.
 *
 * L'ÉTAPE 8 UTILISE `context.setOffline(true)` APRÈS chargement du couloir —
 * pas avant — sans quoi rien ne serait en cache à montrer hors ligne. La
 * recette (service worker actif, rechargement, coupure, événement `offline`)
 * reprend `tests-e2e/sans-reseau.spec.ts` l. 19-30.
 *
 * CE QUE CETTE SUITE NE FAIT PAS : elle ne corrige aucun bug rencontré
 * (hors périmètre de la tâche T2), et elle ne fige pas le nombre d'arrêts
 * en dur au-delà de ce que le premier passage vert a mesuré — voir le
 * rapport de la tâche pour la valeur retenue et sa source.
 */

const DEPART_SAISIE = '14 rue Linois Paris';
const DEPART_ATTENDU = /Linois/;
const ARRIVEE_SAISIE = '5 place Charles Beraudier Lyon';
const ARRIVEE_ATTENDUE = /Beraudier/i;
const FRAGMENT_TRAJET = '2.282604,48.848501;4.859273,45.760829;car';
/* LE RÉSUMÉ DIT « arrivée vers HH:MM », OU « arrivée vers demain HH:MM »
 * quand le calcul fait franchir minuit (C4, 12/09/2026, rectlR6gVbiWQzUN4).
 * `npm run e2e:demo` a rougi le 12/09 sur le trajet simulé tard le soir
 * (5 h 22 de route) : la ligne 203 (chrono ≤ 5 s) PASSAIT, c'est cette
 * assertion, sans rapport avec le temps de calcul, qui ignorait la forme
 * « demain » qu'ajoute `#majResume` (panneau-itineraire.ts) quand le jour
 * change. Les deux formes sont acceptées SANS relâcher la rigueur : l'heure
 * reste deux chiffres, les minutes aussi — voir `formaterHeureArrivee`
 * (lib/itineraire.ts) et son test unitaire du franchissement de minuit. */
const REGEX_RESUME_ITINERAIRE = /^\d+ km — .+ · arrivée vers (?:demain )?\d\d:\d\d/;

type Categorie = 'itineraire' | 'altimetrie' | 'meteo' | 'irve';

function categoriser(url: string): Categorie | null {
  if (url.includes('data.geopf.fr/navigation/itineraire')) return 'itineraire';
  if (url.includes('data.geopf.fr/altimetrie')) return 'altimetrie';
  if (url.includes('api.open-meteo.com')) return 'meteo';
  if (url.includes('public.opendatasoft.com')) return 'irve';
  return null;
}

/**
 * Étape 2 du scénario : le véhicule (VF 8 Plus, 80 %).
 *
 * Recherche par la marque (pas « VF 8 Plus ») : le libellé réduit porte une
 * parenthèse — « (Plus) » — que la recherche compare à la chaîne ENTIÈRE,
 * relevé par le banc T3 (`tests-e2e/mesure-paris-lyon.spec.ts`).
 */
async function etapeVehicule(page: Page): Promise<void> {
  await ouvrirVolet(page, '.vehicule');
  await page.locator('.veh-recherche').fill('VinFast');
  await page.getByRole('button', { name: 'Choisir VinFast VF 8 (Plus)' }).click();
  await expect(page.getByLabel('Batterie', { exact: true })).toHaveValue('87.7');
  await expect(page.getByLabel('Charge max', { exact: true })).toHaveValue('150');
  await expect(page.getByLabel('Nom du véhicule')).toHaveValue('VinFast VF 8 (Plus)');
  await expect(page.getByLabel('Choisir un modèle de véhicule')).toHaveValue('vinfast-vf8-plus');
  await page.getByLabel('Charge (SOC)').fill('80');
  await expect(page.locator('.veh-bilan-charge')).toContainText('80 % de charge');
  await expect(page.locator('.veh-bilan-charge')).toContainText('pas à pleine charge');
  // ON ATTEND L'ÉCRITURE EN INDEXEDDB (asynchrone, lue par le planificateur
  // avant de déclencher le plan de recharge) — pas seulement le DOM.
  await expect.poll(() => page.evaluate(() => new Promise((ok) => {
    const d = indexedDB.open('infonovice-maps');
    d.onsuccess = () => {
      try {
        const r = d.result.transaction('preferences', 'readonly')
          .objectStore('preferences').get('vehicule');
        r.onsuccess = () => {
          const m = (r.result ?? {}) as { vehicule?: { soc?: number } };
          ok(m.vehicule?.soc ?? null);
        };
        r.onerror = () => ok('illisible');
      } catch { ok('magasin absent'); }
    };
    d.onerror = () => ok('base illisible');
  })), { timeout: 10_000 }).toBe(80);
}

test.describe('DÉMO SALON — Paris 15e → Lyon Part-Dieu, VF 8 Plus (T2, rectlR6gVbiWQzUN4)', () => {
  // API réelles, réseau de salon simulé par un vrai réseau : on adapte les
  // délais plutôt que de prétendre à la stabilité d'une suite mockée. Un
  // échec ponctuel ne doit pas ternir la porte de fusion pour une panne
  // tierce passagère — voir le rapport pour la décision définitive.
  test.describe.configure({ retries: 1 });

  /* CETTE SUITE SE NOMME, ET C'EST UNE CORRECTION, PAS UN CONTOURNEMENT.
   *
   * MESURÉ le 13/09/2026 entre 01 h 39 et 01 h 47, depuis ce poste, même URL,
   * même `Referer: http://localhost:4173/`, mêmes coordonnées (l'arrêt de
   * recharge réel du trajet, 47.482415 / 4.351222), appels espacés de 3 s :
   *
   *   User-Agent « …HeadlessChrome/151… » (celui que Playwright pose par
   *   défaut)                                      → HTTP 403, 0 octet
   *   User-Agent « …Chrome/140… »                   → HTTP 200, 1 élément
   *   User-Agent « InfonoviceMaps-E2E/1.0 (+…) »    → HTTP 200, 1 élément
   *   Aucun User-Agent, Referer présent             → HTTP 200, 1 élément
   *
   * `overpass.openstreetmap.fr` refuse le jeton « HeadlessChrome », pas
   * l'automatisation : un client qui se NOMME est servi. L'étape 6 du
   * scénario (commodités autour du premier arrêt) échouait donc sur
   * `net::ERR_FAILED` — un 403 sans en-tête CORS — et la démo ne pouvait PAS
   * devenir verte, ni ici ni en CI, tant que le navigateur s'annonçait comme
   * un robot Chrome. Trace du 13/09 01 h 43 à l'appui.
   *
   * ON NE SE FAIT PAS PASSER POUR UN NAVIGATEUR HUMAIN — ce serait contourner
   * une protection délibérée d'un service public gratuit, et le CLAUDE.md du
   * projet range les quotas publics parmi les biens communs. On DIT qui on
   * est : le nom du projet, sa version, son URL. C'est ce que demande
   * l'étiquette des API publiques, et c'est accepté (mesure ci-dessus).
   *
   * PORTÉE : cette suite seulement. Les autres parcours simulent leur réseau
   * (`page.route`) et ne touchent jamais Overpass pour de vrai.
   *
   * CE QUE ÇA CHANGE POUR LE STAND : rien. La tablette du salon tourne dans un
   * vrai Chrome et envoie son propre User-Agent ; le produit n'est pas
   * modifié, seul le harnais de test se nomme. */
  test.use({
    userAgent: 'InfonoviceMaps-E2E/1.0 (+https://maps.infonovice.fr)',
  });

  test('DÉMO SALON — étapes 1 à 7', async ({ page }) => {
    test.setTimeout(5 * 60_000);

    // ---- Étape 1 — la carte s'ouvre (cible 10 s) ----
    await test.step('1. La carte s’ouvre, sans compte ni bandeau de consentement', async () => {
      await page.goto('/');
      await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.entete-note')).toContainText('Française et open source');
    });

    // ---- Étape 2 — le véhicule (cible 25 s) ----
    await test.step('2. Le véhicule : VF 8 Plus au catalogue, 80 % de charge', async () => {
      await etapeVehicule(page);
    });

    await retour(page);

    // ---- Étape 3 — Paris 15e → Lyon Part-Dieu, calcul chronométré (cible 25 s) ----
    let echecReseau: string | null = null;
    const surRequestFailed = (req: Request): void => {
      const cat = categoriser(req.url());
      if (cat === 'irve' || cat === 'meteo') {
        echecReseau ??= `requête ${cat} échouée (${req.failure()?.errorText ?? 'inconnue'}) : ${req.url()}`;
      }
    };
    const surResponse = (res: Response): void => {
      const cat = categoriser(res.url());
      if ((cat === 'irve' || cat === 'meteo') && !res.ok()) {
        echecReseau ??= `réponse ${cat} en échec (HTTP ${res.status()}) : ${res.url()}`;
      }
    };
    page.on('requestfailed', surRequestFailed);
    page.on('response', surResponse);

    await test.step('3. Paris 15e → Lyon Part-Dieu, calcul automatique (chronométré, ≤ 5 s)', async () => {
      const champDepart = page.locator('[data-role="depart"] input');
      await champDepart.fill(DEPART_SAISIE);
      await page.locator('[data-role="depart"] [role="option"]').first().click();
      await expect(champDepart).toHaveValue(DEPART_ATTENDU, { timeout: 10_000 });

      const champArrivee = page.locator('[data-role="arrivee"] input');
      await champArrivee.fill(ARRIVEE_SAISIE);
      const optionArrivee = page.locator('[data-role="arrivee"] [role="option"]').first();
      // L'ÉLÉMENT EST DÉJÀ VISIBLE (et donc actionnable) AVANT LE CHRONO : le
      // clic qui suit n'a quasiment plus d'attente d'actionnabilité à payer —
      // c'est précisément ce que la revue Codex reprochait au banc T3, qui
      // démarrait le chrono AVANT ce `toBeVisible`.
      await expect(optionArrivee).toBeVisible({ timeout: 10_000 });

      const t0 = Date.now();
      // C'EST CE CLIC QUI DÉCLENCHE `#calculer()` — il n'existe pas de
      // bouton « Calculer » séparé (panneau-itineraire.ts l. 934-942).
      await optionArrivee.click();

      const resultat = page.locator('.iti-resultat');
      // SIGNAL DE FIN NON TRANSITOIRE : « % de batterie » n'apparaît dans le
      // résumé que lorsque `plan.faisable` est vrai (#majResume,
      // panneau-itineraire.ts l. 3140 et 3150) — jamais pendant les états
      // intermédiaires. Sondage `raf` : une frame, pas le palier exponentiel
      // (jusqu'à 1 s) d'`expect.poll`.
      await page.waitForFunction(() => {
        const el = document.querySelector('.iti-resultat');
        return !!el && !(el as HTMLElement).hidden && /% de batterie/.test(el.textContent ?? '');
      }, null, { timeout: 30_000, polling: 'raf' });
      const dureeMs = Date.now() - t0;

      page.off('requestfailed', surRequestFailed);
      page.off('response', surResponse);
      expect(echecReseau, 'échec réseau IRVE ou météo pendant le calcul chronométré')
        .toBeNull();

      test.info().annotations.push({
        type: 'chrono-calcul-itineraire-plan-recharge',
        description: `${dureeMs} ms — « ${(await resultat.textContent()) ?? ''} »`,
      });
      // eslint-disable-next-line no-console
      console.log(`\n=== DÉMO SALON — calcul itinéraire + plan de recharge : ${dureeMs} ms ===\n`);

      expect(dureeMs, `le calcul a pris ${dureeMs} ms, au-delà des 5 s annoncées au stand`)
        .toBeLessThan(5_000);

      await expect(champArrivee).toHaveValue(ARRIVEE_ATTENDUE);
      await expect(resultat).toHaveText(REGEX_RESUME_ITINERAIRE);
      await expect.poll(() => page.evaluate(() => {
        const c = (window as unknown as {
          __carte?: { getSource: (id: string) => unknown };
        }).__carte;
        return !!c?.getSource?.('itineraire');
      })).toBe(true);
    });

    // ---- Étape 4 — l'itinérance, sans nommer de réseau (cible 20 s) ----
    /* CE QUE LA DÉCISION DU 13/09/2026 A CHANGÉ ICI, et pourquoi l'assertion
     * suit le scénario et non l'inverse.
     *
     * L'ancienne rédaction exigeait `toHaveCount(1)` sur une étiquette
     * « Ionity » puis sur une étiquette « IZIVIA ». Elle a tenu ce parcours
     * ROUGE trois cycles durant, et elle avait raison de rougir : la liste des
     * réseaux se calcule sur les bornes RÉELLEMENT trouvées le long du trajet
     * (`#voletReseaux`, panneau-itineraire.ts). Exiger un exploitant nommé,
     * c'est exiger que le fichier IRVE national place CE JOUR-LÀ des stations
     * de cet exploitant sur le couloir Paris–Lyon. Le produit n'a aucune prise
     * là-dessus ; l'assertion mesurait la donnée publique, pas le code.
     *
     * CE QU'ELLE GARANTIT DÉSORMAIS — rien de tout cela n'est trivial :
     *   1. le résumé du dépliant annonce N réseaux avec N ≥ 1 : la liste vient
     *      bien du trajet, elle n'est pas vide ;
     *   2. le corps porte EXACTEMENT `min(N, 15)` étiquettes — 15 est le
     *      plafond d'affichage de `#majListeReseaux` : résumé et contenu ne
     *      peuvent pas diverger sans que ce parcours rougisse ;
     *   3. chaque étiquette porte un compte NON NUL : pas de réseau fantôme,
     *      pas de « (0) » ;
     *   4. la case d'itinérance est décochée AVANT le geste et cochée après :
     *      un état déjà acquis ne prouverait rien ;
     *   5. le résumé des filtres réellement appliqués vaut EXACTEMENT
     *      « itinérance (badges) » — donc le filtre agit (une case cochée qui
     *      n'atteint pas `#filtres` laisserait la carte non filtrée) ET aucun
     *      réseau n'est coché, ce que la décision exige.
     *
     * CE QU'ELLE NE GARANTIT PLUS : qu'un exploitant NOMMÉ (Ionity, IZIVIA ou
     * un autre) soit présent sur le couloir. C'est assumé — ce fait appartient
     * à la donnée publique, pas au produit, et la veille hebdomadaire du
     * corridor est l'endroit où il se surveille. */
    await test.step('4. L’itinérance, sans nommer aucun réseau', async () => {
      await allerA(page, 'recharge');
      const corps = page.locator('.vue[data-vue="recharge"]');
      await corps.locator('.recharge-reseaux > summary').click();
      const reseauxCorps = corps.locator('.recharge-reseaux-corps');
      const resume = corps.locator('.recharge-reseaux > summary');
      await expect(resume).toContainText(/^Réseaux préférés — tous \(\d+ sur ce trajet\)$/);

      const annonces = Number(
        /\((\d+) sur ce trajet\)/.exec((await resume.textContent()) ?? '')?.[1] ?? '0');
      expect(annonces,
        'le dépliant annonce 0 réseau : la liste ne vient pas des bornes du trajet')
        .toBeGreaterThan(0);

      /* LE CORPS NE MONTRE QUE LES QUINZE PREMIERS — plus les réseaux cochés
         au-delà (`#majListeReseaux`, panneau-itineraire.ts : `trouves.slice(0,
         15)`). Paris → Lyon en croise plusieurs dizaines ; sans ce plafond la
         liste serait un mur. On n'en coche aucun, donc le compte attendu vaut
         exactement `min(N, 15)` — mesuré, pas supposé : le premier passage de
         ce parcours a relevé 55 annoncés pour 15 montrés. */
      const PLAFOND_LISTE = 15;
      const attendus = Math.min(annonces, PLAFOND_LISTE);
      const etiquettes = reseauxCorps.locator('label');
      await expect(etiquettes,
        `le résumé annonce ${annonces} réseaux, le corps devrait en montrer ${attendus}`)
        .toHaveCount(attendus);
      for (const texte of await etiquettes.allTextContents()) {
        expect(texte, `« ${texte.trim()} » ne porte pas de compte non nul`)
          .toMatch(/\([1-9]\d*\)\s*$/);
      }
      // ON NE COCHE AUCUN RÉSEAU — le dépliant est montré, pas utilisé.

      await ouvrirReglagesBornes(page);
      /* LA COUCHE DES BORNES D'ABORD : `.poi-filtres`, qui porte la case
         d'itinérance, est `hidden` tant que `#actives` ne contient pas
         « bornes » (`#majVisibiliteFiltres`, panneau-poi.ts). Recette de
         `tests-e2e/bornes-filtres.spec.ts` l. 42-52, et de `docs/demo-salon.md`
         étape 4. Sans effet si la couche est déjà active. */
      await page.getByRole('checkbox', { name: 'Bornes électriques' }).check();
      const itinerance = page.locator('.poi-itinerance');
      await expect(itinerance,
        'la case d’itinérance est déjà cochée : le geste de la démo ne prouverait rien')
        .not.toBeChecked();
      await itinerance.check();
      await expect(itinerance).toBeChecked();

      /* LE FILTRE AGIT, ET LUI SEUL. Le bouton de retrait est écrit par
         `resumerFiltresBornes` (lib, pure) à partir des filtres RÉELLEMENT
         appliqués — pas de l'état visuel des cases. Le texte exact vaut deux
         assertions : l'itinérance restreint, et rien d'autre ne restreint
         (un réseau coché y écrirait « réseau X » ou « N réseaux cochés »). */
      await expect(page.locator('.poi-filtres-effacer'))
        .toHaveText('Tout afficher — retirer : itinérance (badges)');

      await expect(page.locator('.poi-filtre-ligne:has(.poi-itinerance) + p'))
        .toContainText('La donnée publique ne dit pas quels badges précisément');
    });

    // ---- Étape 5 — le plan de recharge, et pourquoi (cible 20 s) ----
    await test.step('5. Le plan de recharge, et « Pourquoi ce plan ? »', async () => {
      await page.keyboard.press('Escape');
      await allerA(page, 'recharge');
      const corps = page.locator('.vue[data-vue="recharge"]');
      await expect(corps.locator('.recharge-resume'))
        .toHaveText(/^\d+ arrêts? · \d+ min de charge · arrivée à \d+ %$/, { timeout: 15_000 });

      const arrets = corps.locator('.recharge-liste > li');
      const nbArrets = await arrets.count();
      // LE NOMBRE D'ARRÊTS N'EST PAS ENCORE FIGÉ (scenario-demo.md, écart 2) :
      // le scénario annonce « 1 ou 2 » pour ce trajet. On le mesure ici et on
      // verrouille la fourchette officielle plutôt qu'un chiffre en dur — le
      // chiffre exact mesuré au premier passage vert est reporté dans le
      // rapport de la tâche T2, à charge pour Produit & Architecture de le
      // graver dans `docs/demo-salon.md`.
      expect([1, 2], `${nbArrets} arrêt(s) mesuré(s) pour Paris → Lyon en VF 8 Plus à 80 %`)
        .toContain(nbArrets);
      await expect(arrets.first().locator('.recharge-detail'))
        .toHaveText(/^\d+ km · arrivée \d+ % → départ \d+ % · \d+ min de charge · \d+ kW$/);

      await corps.locator('.recharge-pourquoi summary').click();
      await expect(corps.locator('.recharge-pourquoi')).toContainText('Pourquoi ce plan ?');
      await expect(corps.locator('.recharge-note-reserve'))
        .toContainText('Bornes de 50 kW et plus, depuis le fichier national IRVE.');
    });

    // ---- Étape 6 — commodités autour du premier arrêt (cible 15 s) ----
    await test.step('6. Ce qu’il y a autour de la borne', async () => {
      const corps = page.locator('.vue[data-vue="recharge"]');
      await corps.locator('button.recharge-commodites').first().click();
      const sortie = page.locator('.recharge-commodites-corps').first();
      await expect(sortie.locator('.com-puce').first()).toBeVisible({ timeout: 15_000 });
      await expect(sortie.locator('.com-distance').first()).toContainText(/\d+ m/);
      await expect(sortie).toContainText('OpenStreetMap');
    });

    // ---- Étape 7 — emporter la carte du trajet (cible 35 s, réseau réel) ----
    await test.step('7. Emporter la carte du trajet (couloir hors ligne)', async () => {
      // LE SERVICE WORKER DOIT TENIR LA PAGE avant de lancer le couloir —
      // c'est lui qui met les tuiles en cache pendant le téléchargement.
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 });
      await allerA(page, 'partage');

      const etat = page.locator('.iti-couloir-etat');
      await expect(etat).toContainText(/^\d+ tuiles, environ [\d,]+ Mo\.$/, { timeout: 15_000 });
      const annonce = (await etat.textContent()) ?? '';
      const attendues = Number(/^(\d+) tuiles/.exec(annonce)?.[1]);
      expect(attendues, 'le couloir Paris → Lyon devrait annoncer plusieurs centaines de tuiles')
        .toBeGreaterThan(100);

      const emporter = page.getByRole('button', { name: 'Emporter la carte du trajet' });
      await expect(emporter).toBeEnabled();
      await emporter.click();
      await expect(page.locator('.iti-couloir-jauge')).toBeVisible();

      // RÉSEAU RÉEL : le couloir Paris-Lyon compte plusieurs centaines de
      // tuiles WMTS IGN — ce téléchargement prend largement plus de temps
      // qu'avec des tuiles simulées, d'où le grand délai.
      await expect(etat).toContainText(`Couloir emporté : ${attendues} tuiles`, { timeout: 4 * 60_000 });
      await expect(etat).toContainText('quatorze jours');
      await expect(page.locator('.iti-couloir-jauge')).toBeHidden();
      await expect(emporter).toBeVisible();
    });
  });

  test('DÉMO SALON — étape 8, mode avion', async ({ page, context }) => {
    test.setTimeout(6 * 60_000);

    // PRÉAMBULE PROPRE À CE test() — voir l'en-tête du fichier : l'étape 8 ne
    // prolonge pas le test précédent, elle recharge son propre trajet et son
    // propre couloir, avant de couper le réseau pour de bon.
    await page.goto('/');
    await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
    await etapeVehicule(page);
    await retour(page);

    // LE CHEMIN RAPIDE POUR LE TRAJET (docs/demo-salon.md) : le fragment
    // `#iti=` n'est rejoué qu'au démarrage, d'où le `goto` explicite plutôt
    // qu'un `reload` qui pourrait relire une URL sans fragment.
    const urlTrajet = `/#iti=${FRAGMENT_TRAJET}`;
    await page.goto(urlTrajet);
    await page.reload();
    const resultat = page.locator('.iti-resultat');
    await page.waitForFunction(() => {
      const el = document.querySelector('.iti-resultat');
      return !!el && !(el as HTMLElement).hidden && /% de batterie/.test(el.textContent ?? '');
    }, null, { timeout: 30_000, polling: 'raf' });
    await expect(resultat).toHaveText(REGEX_RESUME_ITINERAIRE);

    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 });
    await allerA(page, 'partage');
    const etat = page.locator('.iti-couloir-etat');
    await expect(etat).toContainText(/^\d+ tuiles, environ [\d,]+ Mo\.$/, { timeout: 15_000 });
    const annonce = (await etat.textContent()) ?? '';
    const attendues = Number(/^(\d+) tuiles/.exec(annonce)?.[1]);
    await page.getByRole('button', { name: 'Emporter la carte du trajet' }).click();
    await expect(etat).toContainText(`Couloir emporté : ${attendues} tuiles`, { timeout: 4 * 60_000 });

    // ---- LA RECETTE DE tests-e2e/sans-reseau.spec.ts (l. 19-30) ----
    await page.waitForFunction(async () => {
      const r = await navigator.serviceWorker?.getRegistration?.();
      return !!r?.active;
    }, null, { timeout: 20_000 });
    await page.goto(urlTrajet);
    await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
    await context.setOffline(true);
    await page.evaluate(() => { window.dispatchEvent(new Event('offline')); });

    // ---- Étape 8 — mode avion (cible 20 s) ----
    await test.step('8. Mode avion : la carte tient, la recherche échoue proprement', async () => {
      await expect(page.locator('.hors-ligne strong')).toHaveText('Hors ligne.', { timeout: 15_000 });
      await expect(page.locator('.hors-ligne')).toContainText(
        'La carte déjà consultée et vos favoris restent accessibles.',
      );
      const lien = page.locator('.hors-ligne-lien');
      await expect(lien).toHaveText('Ce qui marche sans réseau');
      await expect(lien).toHaveAttribute('href', '/sans-reseau.html');

      // « LA CARTE TIENT » NE SE PROUVE PAS PAR LA SEULE VISIBILITÉ DU
      // CANEVAS (revue Codex de la PR #306) : un canevas vide reste
      // « visible » au sens du DOM. `areTilesLoaded()` de MapLibre dit si
      // les tuiles VISIBLES sont réellement peintes — depuis le cache du
      // service worker, puisque le réseau est coupé.
      const tuilesPeintes = (): Promise<boolean> => page.evaluate(() => {
        const c = (window as unknown as {
          __carte?: { areTilesLoaded?: () => boolean };
        }).__carte;
        return c?.areTilesLoaded?.() ?? false;
      });
      await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible();
      await expect.poll(tuilesPeintes, { timeout: 15_000 }).toBe(true);
      await page.mouse.move(400, 300);
      await page.mouse.down();
      await page.mouse.move(250, 220, { steps: 10 });
      await page.mouse.up();
      await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible();
      await expect.poll(tuilesPeintes, { timeout: 15_000 }).toBe(true);

      await ouvrirPlanificateur(page);
      await expect(page.locator('.iti-corps')).toBeVisible();
      const champ = page.locator('input[type="search"]:visible, .recherche input:visible').first();
      await champ.click();
      await page.locator('.recherche input:visible').first().fill('boulangerie');
      const erreur = page.locator('.recherche-erreur:visible');
      await expect(erreur).toContainText('hors réseau', { timeout: 15_000 });
      await expect(erreur).not.toContainText('Réessayez');
    });
  });
});
