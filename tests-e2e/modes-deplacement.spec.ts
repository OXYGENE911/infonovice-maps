import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { allerA, retour } from './planificateur';
import { ouvrirVolet } from './volets';

/* LES QUATRE FAÇONS DE PARTIR (MODE-1, 03/09).
 *
 * ARMELIN : « "Je roule en deux-roue" devrait plutôt se situer dans "Options
 * du trajet" à côté de "Voiture" et "À pieds", et il faudrait ajouter un
 * bouton "Moto" et un bouton "Vélo". »
 *
 * IL A RAISON SUR LE RANGEMENT. « Je roule en deux-roues » était une case à
 * cocher dans « Mon véhicule », un panneau qui parle de batterie, de
 * consommation et de masse. Ce n'est pas une propriété du véhicule qu'on
 * possède : c'est une réponse à « comment je pars aujourd'hui ».
 *
 * ET LE MOTEUR PUBLIC N'A TOUJOURS PAS DE PROFIL VÉLO. Remesuré le 03/09 sur
 * les trois ressources de la Géoplateforme, dans ses propres mots :
 * « Parameter 'profile' is invalid: value should be one of car,pedestrian ».
 * Le vélo suit donc le graphe PIÉTON, avec une durée refaite — et ces
 * parcours vérifient que l'application le DIT, plutôt que de laisser croire à
 * un moteur qu'elle n'a pas. */

const URLS_ITI: string[] = [];

/* LA VALEUR DERRIÈRE CHAQUE LIBELLÉ. Le radio est masqué (`opacity: 0`, 0×0
   pixel) comme tous ceux de ce panneau : c'est l'ÉTIQUETTE qu'on presse, et
   c'est elle que l'usager voit. Playwright refuse `check()` sur un élément
   invisible, et il a raison de le refuser. */
const VALEUR: Record<string, string> = {
  Voiture: 'voiture', Moto: 'moto', 'Vélo': 'velo', 'À pied': 'pied',
};

/* CE QUE LE STOCKAGE A VRAIMENT REÇU. L'écriture est LANCÉE SANS ÊTRE
   ATTENDUE, et c'est voulu : le calcul de l'itinéraire ne doit pas patienter
   derrière une base locale. Recharger dans la milliseconde qui suit le clic
   arriverait donc avant elle — ce parcours attend qu'elle ait atterri plutôt
   que de faire semblant qu'elle est instantanée. */
const modeGarde = (page: Page): Promise<unknown> => page.evaluate(() => new Promise((ok) => {
  const d = indexedDB.open('infonovice-maps');
  d.onsuccess = () => {
    try {
      const r = d.result.transaction('preferences', 'readonly')
        .objectStore('preferences').get('mode-deplacement');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok('lecture impossible');
    } catch { ok('magasin absent'); }
  };
  d.onerror = () => ok('base illisible');
}));

async function choisirMode(page: Page, libelle: string): Promise<void> {
  await page.locator(`.iti-profil:has(input[value="${VALEUR[libelle]}"])`).click();
  await expect(page.locator(`.iti-profil:has(input[value="${VALEUR[libelle]}"]) input`))
    .toBeChecked();
}

async function ouvrirOptions(page: Page): Promise<void> {
  URLS_ITI.length = 0;
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**/api-adresse.data.gouv.fr/search**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    const [libelle, lon, lat] = /lyon/i.test(q)
      ? ['Lyon', 4.8357, 45.764] : ['Paris', 2.3522, 48.8566];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      features: [{
        geometry: { coordinates: [lon, lat] },
        properties: { label: libelle, type: 'municipality', postcode: '', city: libelle },
      }],
    }) });
  });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    URLS_ITI.push(route.request().url());
    /* QUATRE KILOMÈTRES, UNE HEURE À PIED. Le chiffre est choisi pour que la
       différence saute aux yeux : le même trajet fait un quart d'heure à
       vélo. Un trajet de 500 km rendrait la vérification illisible. */
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 4_000, duration: 3_600,
    }) });
  });
  await page.goto('/');
  await page.locator('#carte canvas.maplibregl-canvas').waitFor({ timeout: 15_000 });
  await allerA(page, 'options');
}

async function calculerParisLyon(page: Page): Promise<void> {
  await retour(page);
  const champs = page.locator('.vue-accueil input[type="search"]');
  await champs.nth(0).fill('paris');
  await page.getByRole('option', { name: 'Paris' }).first().click();
  await champs.nth(1).fill('lyon');
  await page.getByRole('option', { name: 'Lyon' }).first().click();
}

test('LES QUATRE MODES SONT LÀ, dans « Options du trajet »', async ({ page }) => {
  await ouvrirOptions(page);
  const modes = page.locator('.iti-profils .iti-profil');
  await expect(modes).toHaveCount(4);
  for (const nom of ['Voiture', 'Moto', 'Vélo', 'À pied']) {
    await expect(page.locator('.iti-profils').getByText(nom, { exact: true })).toBeVisible();
  }
  // ON PART EN VOITURE par défaut — c'est le mode d'origine.
  await expect(page.locator(`.iti-profil:has(input[value="${VALEUR['Voiture']}"]) input`)).toBeChecked();
});

test('LES QUATRE BOUTONS TIENNENT DANS LE VOLET, texte compris', async ({ page }) => {
  /* CE PROJET MESURE DES RECTANGLES. Quatre boutons de front dans un volet de
     320 pixels laissaient trente pixels de texte après le picto : « Voiture »
     s'y coupait. Deux par deux, ils tiennent — et c'est ce qu'on vérifie,
     plutôt que de relire le CSS. */
  await ouvrirOptions(page);
  const faute = await page.evaluate(() => {
    const rangee = document.querySelector('.iti-profils');
    if (!rangee) return 'rangée introuvable';
    const r = rangee.getBoundingClientRect();
    for (const l of rangee.querySelectorAll<HTMLElement>('.iti-profil')) {
      const b = l.getBoundingClientRect();
      if (b.right > r.right + 1 || b.left < r.left - 1) return `${l.textContent} déborde`;
      const texte = l.querySelector('span');
      if (!texte) return 'libellé introuvable';
      /* LE TEXTE NE DOIT PAS ÊTRE ROGNÉ : `scrollWidth` dit ce qu'il lui
         faudrait, `clientWidth` ce qu'il a. */
      if (texte.scrollWidth > texte.clientWidth + 1) {
        return `« ${texte.textContent} » est coupé (${texte.scrollWidth} > ${texte.clientWidth})`;
      }
    }
    return '';
  });
  expect(faute, 'les modes doivent tenir dans leur rangée').toBe('');
});

test('« MOTO » DIT LE DÉCRET, et ce qu’il ne change PAS', async ({ page }) => {
  await ouvrirOptions(page);
  const note = page.locator('.iti-note-moto');
  // AVANT LE CHOIX, RIEN : une note permanente cesse d'être lue.
  await expect(note).toBeHidden();

  await choisirMode(page, 'Moto');
  await expect(note).toBeVisible();
  /* LA NOTE CITE LE TEXTE, pas une impression : une application qui parle
     d'une manœuvre routière doit dire d'où elle tient sa règle. */
  await expect(note).toContainText('décret n° 2025-33');
  await expect(note).toContainText('70 km/h');
  /* ET ELLE DIT CE QU'ELLE NE FAIT PAS. Sans cette phrase, choisir « Moto »
     laisserait croire à un itinéraire ou à une heure d'arrivée différents. */
  await expect(note).toContainText('ne change ni l’itinéraire ni l’heure');

  // LE MOTEUR RESTE CELUI DE LA ROUTE : il n'existe aucun profil moto.
  await calculerParisLyon(page);
  await expect(page.locator('.iti-resultat')).toContainText('km', { timeout: 10_000 });
  expect(URLS_ITI[URLS_ITI.length - 1]).toContain('profile=car');
});

test('« VÉLO » AVOUE LE GRAPHE PIÉTON, et refait la durée', async ({ page }) => {
  await ouvrirOptions(page);
  await choisirMode(page, 'Vélo');

  const note = page.locator('.iti-note-velo');
  await expect(note).toBeVisible();
  /* L'AVEU EST CHIFFRÉ ET DATÉ : « aucun moteur public français n'a de profil
     vélo » est une affirmation, et ce projet ne promet pas sans mesurer. */
  await expect(note).toContainText('car,pedestrian');
  await expect(note).toContainText('03/09/2026');
  await expect(note).toContainText('réseau piéton');
  // CE QUE LE TRACÉ IGNORE est dit, sans quoi l'usager le découvrirait dessus.
  await expect(note).toContainText('contresens cyclables');
  await expect(note).toContainText('escaliers');
  await expect(note).toContainText('15 km/h');

  await calculerParisLyon(page);
  /* QUATRE KILOMÈTRES, UNE HEURE RENDUE PAR LE MOTEUR PIÉTON. À vélo, c'est
     un quart d'heure : la distance vaut — c'est le même chemin — la durée
     non. Sans ce recalcul, l'application annoncerait une heure de vélo pour
     quatre kilomètres. */
  await expect(page.locator('.iti-resultat')).toContainText('16 min', { timeout: 10_000 });
  await expect(page.locator('.iti-resultat')).toContainText('4,0 km');
  // ET LE MOTEUR INTERROGÉ EST BIEN LE PIÉTON, faute d'en avoir un autre.
  expect(URLS_ITI[URLS_ITI.length - 1]).toContain('profile=pedestrian');
});

test('« À PIED » GARDE LA DURÉE DU MOTEUR — on ne pédale pas', async ({ page }) => {
  await ouvrirOptions(page);
  await choisirMode(page, 'À pied');
  await expect(page.locator('.iti-note-velo')).toBeHidden();
  await calculerParisLyon(page);
  await expect(page.locator('.iti-resultat')).toContainText('1 h', { timeout: 10_000 });
});

test('LE MODE SE GARDE d’une session à l’autre', async ({ page }) => {
  /* C'ÉTAIT UN FAIT DURABLE avant MODE-1 — une case dans « Mon véhicule » —
     et le déménagement ne doit pas le transformer en corvée quotidienne. */
  await ouvrirOptions(page);
  await choisirMode(page, 'Moto');
  await expect(page.locator('.iti-note-moto')).toBeVisible();
  await expect.poll(() => modeGarde(page), { timeout: 10_000 }).toBe('moto');

  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await allerA(page, 'options');
  await expect(page.locator(`.iti-profil:has(input[value="${VALEUR['Moto']}"]) input`)).toBeChecked({ timeout: 10_000 });
  await expect(page.locator('.iti-note-moto')).toBeVisible();
});

test('« MON VÉHICULE » N’A PLUS LA CASE — elle a déménagé', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirVolet(page, '.vehicule');
  /* LE PANNEAU PARLE DE BATTERIE, DE CONSOMMATION ET DE MASSE : la façon de
     partir n'y a plus sa place. La laisser aux deux endroits aurait été pire
     que de ne pas la déplacer — deux réglages pour une seule question. */
  await expect(page.getByRole('checkbox', { name: 'Je roule en deux-roues' }))
    .toHaveCount(0);
});

test('LE LIEN D’UN TRAJET À VÉLO NE SE ROUVRE PAS « À PIED »', async ({ page }) => {
  /* SANS LE MODE DANS LE LIEN, LE PARTAGE MENTIRAIT EN SILENCE : même tracé,
     durée quatre fois plus longue, et rien pour le signaler. */
  await ouvrirOptions(page);
  await choisirMode(page, 'Vélo');
  await calculerParisLyon(page);
  await expect(page.locator('.iti-resultat')).toContainText('16 min', { timeout: 10_000 });

  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;velo');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await allerA(page, 'options');
  await expect(page.locator(`.iti-profil:has(input[value="${VALEUR['Vélo']}"]) input`)).toBeChecked({ timeout: 10_000 });
  await expect(page.locator('.iti-note-velo')).toBeVisible();
});

test('UN LIEN DÉJÀ PARTAGÉ ROUVRE LE MÊME TRAJET', async ({ page }) => {
  /* LA PROMESSE QU'ON NE PEUT PAS ROMPRE : un lien envoyé par message la
     semaine dernière porte `car`, et doit rouvrir « Voiture ». */
  await ouvrirOptions(page);
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await allerA(page, 'options');
  await expect(page.locator(`.iti-profil:has(input[value="${VALEUR['Voiture']}"]) input`)).toBeChecked({ timeout: 10_000 });
});
