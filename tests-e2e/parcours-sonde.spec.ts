import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { SCRIPT_OBSERVATEUR } from '../scripts/chrono-sonde.mjs';
// @ts-expect-error -- parcours-sonde.mjs n'a pas de .d.mts : la mission C34
// interdit d'en ajouter un pour ce déplacement (aucune infrastructure de
// types nouvelle), donc cette ligne reste non typée plutôt que de contourner
// l'interdit par un fichier de déclaration.
import { preparerVehicule, declencherCalcul } from '../scripts/parcours-sonde.mjs';

/* CE PARCOURS PROUVE QUE LE PARCOURS DE LA SONDE TRAVERSE ENCORE LE PRODUIT
 * DU JOUR (cycle C34) — pas qu'il est rapide. `preparerVehicule` et
 * `declencherCalcul`, importés de `scripts/parcours-sonde.mjs`, sont le code
 * que la campagne de mesure du critère n° 1 exécute réellement : si l'un de
 * leurs sélecteurs a dérivé depuis le 13/09, ce test rougit avant que la
 * campagne ne s'effondre un soir sur machine au repos.
 *
 * SEULE DIFFÉRENCE AVEC LA VRAIE CAMPAGNE : l'itinéraire IGN est ici SIMULÉ,
 * comme dans l'étalonnage de `sonde-chrono.spec.ts`. Ce test vérifie des
 * sélecteurs, pas un service réseau ; la campagne, elle, appelle l'IGN réel.
 * AUCUNE DURÉE ICI NE VAUT COMME MESURE — ce test tourne sous la charge d'un
 * poste de développement avec sessions d'agents actives, largement au-dessus
 * du plafond de 20 processus résidents.
 */

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);

  /* L'OBSERVATEUR AVANT LE PREMIER OCTET DE PAGE, comme le fait la sonde
     réelle : `declencherCalcul` appelle `window.__sonde.armer()` et
     échouerait sans ce montage. */
  await page.addInitScript(SCRIPT_OBSERVATEUR);

  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 390_000, duration: 10_800,
    }),
  }));

  await page.route('**/public.opendatasoft.com/**', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes('/exports/json')) {
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

test('le parcours de la sonde (préparation du véhicule puis déclenchement du calcul) mène au résultat', async ({ page }) => {
  // 120 s : playwright.config.ts plafonne à 30 s, et `preparerVehicule`
  // enchaîne six champs plus une attente de bilan avant que `declencherCalcul`
  // ne commence.
  test.setTimeout(120_000);

  await page.goto('/');
  await preparerVehicule(page);
  await declencherCalcul(page);

  await expect(page.locator('.iti-resultat')).toBeVisible();
});
