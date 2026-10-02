/**
 * Saisit un profil véhicule par l'INTERFACE, comme un usager.
 *
 * PAR LE FORMULAIRE, PAS PAR IndexedDB : deux versions du parcours E2E ont
 * poussé directement dans la base et couru contre l'écriture d'un profil vide
 * que l'application persiste au démarrage — « Renseignez d'abord votre
 * véhicule » une fois sur trois, en accusant le code au lieu du test.
 *
 * LES VALEURS SONT CELLES DE LA FEUILLE DE RELEVÉ MOBILE : VinFast VF 8 Plus,
 * 80 % au départ. Deux chiffres comparables doivent décrire la même voiture.
 */
export async function preparerVehicule(page) {
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 20_000 });
  await page.locator('.iti > summary').click();
  await page.locator('.iti-vers[data-vers="vehicule"]').click();
  await page.getByLabel('Batterie', { exact: true }).fill('87.7');
  await page.getByLabel('Santé (SOCE)').fill('100');
  await page.getByLabel('Charge (SOC)').fill('80');
  await page.getByLabel('Charge max', { exact: true }).fill('150');
  await page.getByLabel('Sur autoroute').fill('280');
  /* LE BILAN CONFIRME QUE LE PROFIL EST PRIS EN COMPTE avant de continuer :
     une précondition qu'on n'attend pas est une course qu'on parie. */
  await page.locator('.veh-bilan-lignes').filter({ hasText: 'Sur autoroute' })
    .waitFor({ timeout: 10_000 });
  await page.locator('.vue-retour').click();
  await page.locator('.vue-accueil').waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Ouvre le panneau d'itineraire et lance un calcul Paris -> Lyon.
 *
 * LES SELECTEURS VIENNENT DU SCENARIO E2E EXISTANT (tests-e2e/accueil.spec.ts),
 * pas d'une lecture approximative du source : la premiere version de cette
 * sonde visait `.iti-depart input` et `.iti-calculer`, qui n'existent nulle
 * part dans le panneau (revue Codex du 13/09, constat SERIEUX). Le panneau se
 * pilote par ses deux champs de recherche et leurs suggestions de geocodage,
 * et le calcul part TOUT SEUL des que les deux points sont poses : il n'y a pas
 * de bouton « Calculer » a cliquer.
 *
 * LE GEOCODAGE EST SIMULE, L'ITINERAIRE NON. On mesure la porte de sortie du
 * calcul d'itineraire ; faire dependre la mesure de la latence reelle de la BAN
 * ajouterait une variable qui n'a rien a voir avec ce qu'on chronometre — et
 * sur la feuille mobile, le geocodage est DEJA fini quand le chronometre part.
 */
export async function declencherCalcul(page) {
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => {
    const requete = new URL(route.request().url()).searchParams.get('q') ?? '';
    const estLyon = /lyon/i.test(requete);
    const libelle = estLyon ? 'Lyon' : 'Paris';
    const coords = estLyon ? [4.8357, 45.7640] : [2.3522, 48.8566];
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        features: [{
          geometry: { coordinates: coords },
          properties: {
            label: libelle, type: 'municipality', postcode: '', city: libelle,
          },
        }],
      }),
    });
  });

  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 20_000 });
  if (await page.locator('.iti[open]').count() === 0) {
    await page.locator('.iti > summary').click();
  }
  const champs = page.locator('.iti input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  /* LE CHRONOMÈTRE EST ARMÉ ICI, JUSTE AVANT LE GESTE QUI LANCE LE CALCUL —
     et pas plus tôt : armé avant le premier clic, il aurait daté le départ du
     choix de la ville de départ, qui ne lance rien. L'écoute est en phase de
     capture, donc l'horodatage précède le code de l'application. */
  await page.evaluate(() => window.__sonde.armer());
  await page.getByRole('option', { name: 'Lyon' }).first().click();
  /* LE CALCUL EST PARTI — on le verifie plutot que de le supposer : sans ce
     temoin, une sonde qui n'aurait rien declenche rendrait `ouverteA: null` et
     se lirait comme « la porte ne s'est jamais ouverte », ce qui est un tout
     autre constat. */
  await page.locator('.iti-resultat').waitFor({ state: 'visible', timeout: 10_000 });
}
