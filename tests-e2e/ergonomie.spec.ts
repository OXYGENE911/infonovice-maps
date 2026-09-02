import { test, expect, type Locator, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirMenu } from './volets';

/* ERGONOMIE — ce que l'œil voit se prouve par des RECTANGLES, pas par des
   captures d'écran. Un panneau qui recouvre le bouton d'à côté, un menu posé
   sur « Me localiser », un pied de page sur l'attribution IGN : ce sont des
   intersections de boîtes englobantes, et une intersection se mesure. Le
   dépôt a déjà appris cette leçon une fois — le décalage des contrôles sous
   l'en-tête était un nombre magique jusqu'à ce qu'un `elementFromPoint` le
   corrige. */

test.beforeEach(async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
});

/* DEUX POINTS D'ENTRÉE, PAS SIX. À gauche ce qui concerne le TRAJET ; en haut
   à droite, derrière un menu, ce qui concerne les RÉGLAGES. Six pastilles de
   même poids ne hiérarchisaient rien et débordaient de l'écran.

   LA FRONTIÈRE A BOUGÉ LE 26/08/2026, sur le retour d'Armelin : « la recherche
   de point de charge devrait être dans le menu de gauche », et « jongler entre
   le menu de gauche et celui de droite nuit à l'ergonomie ». Le volet des
   bornes et services est donc passé à gauche — avec les stations-service et
   les parkings, qui sont comme elles des endroits où l'on s'arrête EN ROUTE.
   Chercher où recharger n'est pas régler l'affichage de la carte.

   Le menu de droite garde ce qui répond vraiment à « que voir sur la carte » :
   le fond, le trafic — et « mes lieux ». (Les transports en commun sont
   RETIRÉS depuis le 29/08/2026, décision d'Armelin après essai.) */
/* UN SEUL BOUTON, depuis le 27/08/2026. Armelin : « il y a trois boutons dans
   la page d'accueil "Itinéraire", "Recharge et services" et "Véhicule", qui
   pourraient tous être regroupés dans un unique bouton "Itinéraire" […] Un
   seul bouton est plus efficace à comprendre que trois boutons où il faudra se
   rappeler dans quel menu on peut trouver quelle option. » */
const RAIL = ['Itinéraire'] as const;
const RANGES_DANS_LE_MENU = ['.fonds', '.trafic', '.favoris'] as const;

const entree = (page: Page, nom: string): Locator =>
  page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: nom }).first();

interface Boite { x: number; y: number; width: number; height: number }

async function boite(l: Locator): Promise<Boite> {
  const b = await l.boundingBox();
  if (!b) throw new Error('élément sans boîte englobante — invisible ?');
  return b;
}

/** Une tolérance d'un pixel évite de compter deux bords jointifs comme défaut. */
function seChevauchent(a: Boite, b: Boite): boolean {
  const marge = 1;
  return a.x < b.x + b.width - marge && a.x + a.width - marge > b.x
    && a.y < b.y + b.height - marge && a.y + a.height - marge > b.y;
}

async function ouvrirLaCarte(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

test('le rail de gauche ne porte QUE le trajet', async ({ page }) => {
  await ouvrirLaCarte(page);

  /* SEULS LES VOLETS DE TÊTE COMPTENT. Le planificateur contient ses propres
     volets imbriqués (profil altimétrique, feuille de route, météo, trajet) :
     les compter donnait six entrées là où l'écran n'en montre que deux. */
  const rail = page.locator('.maplibregl-ctrl-top-left > div > * > details > summary');
  await expect(rail, 'un rail qui s’allonge redevient un fouillis').toHaveCount(RAIL.length);
  for (const nom of RAIL) await expect(entree(page, nom)).toBeVisible();
});

test('le menu range les couches, les lieux et l’affichage', async ({ page }) => {
  await ouvrirLaCarte(page);

  /* `> summary` ET NON ` summary` : ce qu'on défend est l'en-tête DU VOLET,
     pas n'importe quel `summary` qu'il contiendrait. Depuis FAVORIS-2 le volet
     des favoris en porte un second — le repli du formulaire « Nouvelle
     liste » — et un sélecteur descendant les prenait tous les deux. Un
     parcours doit nommer ce qu'il défend. */
  // Fermé, il ne montre rien : c'est tout l'intérêt.
  for (const volet of RANGES_DANS_LE_MENU) {
    await expect(page.locator(`${volet} > summary`),
      `« ${volet} » ne doit pas s’afficher menu fermé`).toBeHidden();
  }

  await ouvrirMenu(page);
  for (const volet of RANGES_DANS_LE_MENU) {
    await expect(page.locator(`.reglages-corps ${volet} > summary`),
      `« ${volet} » devrait être rangé dans le menu`).toBeVisible();
  }
});

test('LA RECHARGE EST UN FILTRE — elle vit avec les filtres', async ({ page }) => {
  /* CE TEST A CHANGÉ DE CAMP, ET C'EST ARMELIN QUI L'A RETOURNÉ (ERGO-3,
     02/09). Il défendait la recharge comme PAGE DU PLANIFICATEUR, contre deux
     retours en arrière : le va-et-vient entre les deux côtés de l'écran, puis
     la multiplication des boutons à gauche.
     UN TROISIÈME ARGUMENT A EMPORTÉ LA DÉCISION, venu d'un collègue
     d'Armelin : « il s'agit également d'un filtre de POI de type bornes de
     recharge et […] ça doit rester dans le menu des filtres par logique ».
     Armelin : « je suis assez d'accord avec lui ». Le va-et-vient ne
     réapparaît pas pour autant — l'entonnoir est SUR la carte, à côté de la
     puce qui allume ces mêmes bornes.
     CE QUE CE PARCOURS GARDE ENCORE : pas de bouton de plus à gauche, et
     rien qui reparte dans le menu de droite. */
  await ouvrirLaCarte(page);
  await expect(page.locator('.reglages-corps .poi'),
    'la recherche de bornes est retournée dans le menu de droite').toHaveCount(0);
  await expect(page.locator('.poi-hote-recharge .poi'),
    'la recherche de bornes n’est pas dans le filtre des POI').toHaveCount(1);
  await expect(page.locator('.iti-vers[data-vers="couches"]'),
    'le planificateur a gardé une entrée qui a déménagé').toHaveCount(0);
  await expect(page.locator('.vue-hote[data-vue="vehicule"] .vehicule')).toHaveCount(1);
});

test('le haut-droit ne porte QUE le menu', async ({ page }) => {
  /* Mêler « où je regarde » (zoom, boussole, localisation) et « ce que
     j'affiche » (couches, lieux, fond) dans une même colonne obligeait l'œil à
     trier. Les commandes de vue sont descendues en bas de la même colonne. */
  await ouvrirLaCarte(page);
  await expect(page.locator('.maplibregl-ctrl-top-right .maplibregl-ctrl'),
    'un coin qui se remplit redevient un fouillis').toHaveCount(1);
  await expect(page.locator('.maplibregl-ctrl-top-right .reglages')).toBeVisible();

  /* Et les commandes de vue sont bien en bas, atteignables. Le zoom n'y
     est plus depuis le 29/08 : sur un écran tactile, deux doigts le font
     mieux — et les boutons chevauchaient la barre du trajet. */
  await expect(page.getByRole('button', { name: 'Remettre le nord en haut' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Me localiser' })).toBeVisible();
});

test('le menu ouvert ne recouvre AUCUN contrôle de la carte', async ({ page }) => {
  /* LE DÉFAUT EXACT QU'UNE CAPTURE A RÉVÉLÉ : posé avant la géolocalisation
     dans la colonne, le panneau recouvrait « Me localiser » — une
     fonctionnalité rendue inatteignable par une décoration. */
  await ouvrirLaCarte(page);
  await ouvrirMenu(page);

  const panneau = await boite(page.locator('.reglages-corps'));
  /* LES BOUTONS DU MENU NE SONT PAS DES CONTRÔLES DE LA CARTE, et les compter
     comme tels rendait ce parcours faux dès que le menu gagnait un bouton :
     il « recouvrait » alors son propre contenu. Attrapé le 02/09 en ajoutant
     « Mettre à jour l'application » — mesuré, pas deviné : le bouton fautif
     était à l'intérieur du panneau, à quinze pixels de son bord. */
  const controles = page.locator(
    '.maplibregl-ctrl-top-right button, .maplibregl-ctrl-bottom-right button')
    .and(page.locator(':not(.reglages-corps *)'));
  const nombre = await controles.count();
  expect(nombre, 'aucun contrôle — la vérification serait vide').toBeGreaterThan(0);

  for (let i = 0; i < nombre; i++) {
    const bouton = controles.nth(i);
    if (!(await bouton.isVisible())) continue;
    const nom = (await bouton.getAttribute('aria-label')) ?? `bouton ${i}`;
    expect(seChevauchent(panneau, await boite(bouton)),
      `le menu recouvre « ${nom} »`).toBe(false);
  }
});

test('un panneau ouvert ne recouvre aucune autre entrée du rail', async ({ page }) => {
  await ouvrirLaCarte(page);

  for (const nom of RAIL) {
    await entree(page, nom).click();
    const panneau = page.locator('.maplibregl-ctrl-top-left details[open] > :not(summary)').first();
    await expect(panneau).toBeVisible();
    const boitePanneau = await boite(panneau);

    for (const autre of RAIL) {
      if (autre === nom) continue;
      const bouton = entree(page, autre);
      // Le bouton doit rester VISIBLE et CLIQUABLE, pas seulement présent.
      await expect(bouton, `« ${autre} » disparaît quand « ${nom} » est ouvert`).toBeVisible();
      expect(seChevauchent(boitePanneau, await boite(bouton)),
        `le panneau « ${nom} » recouvre le bouton « ${autre} »`).toBe(false);
    }

    await page.keyboard.press('Escape');
  }
});

test('Échap referme le panneau ouvert', async ({ page }) => {
  await ouvrirLaCarte(page);
  const ouvert = page.locator('.maplibregl-ctrl-top-left > div > * > details[open]');

  await entree(page, 'Itinéraire').click();
  await expect(ouvert).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(ouvert, 'Échap doit refermer — sans clavier, le menu est un piège').toHaveCount(0);
});

test('Échap referme aussi le menu des réglages', async ({ page }) => {
  await ouvrirLaCarte(page);
  await ouvrirMenu(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('details.reglages[open]')).toHaveCount(0);
});

test('UN CLIC DANS LE VIDE REFERME le planificateur', async ({ page }) => {
  /* CE PARCOURS A CHANGÉ DE SENS DEUX FOIS, et les deux motifs comptent.
     Le 27/08, il est passé de « le clic referme » à « le clic NE referme
     PAS » : le planificateur abritait les couches, il était devenu une
     SURFACE DE TRAVAIL — on coche « Bornes électriques », on inspecte une
     borne, on en coche une autre, et le refermer entre chaque geste était le
     défaut relevé la veille.
     LE 02/09, IL REPASSE DE L'AUTRE CÔTÉ, à la demande d'un collègue
     d'Armelin : « ce n'est pas pratique de cliquer sur le même bouton pour
     fermer le menu ouvert […] fermer une fenêtre ouverte en cliquant dans le
     vide sur la carte, ce qui laisserait deux moyens d'accès. »
     ET LE VA-ET-VIENT DE 2027 EST PRÉSERVÉ, parce que la règle porte sur LE
     VIDE : un clic sur une de nos couches ne referme rien. Le parcours
     suivant le garde. */
  await ouvrirLaCarte(page);

  await entree(page, 'Itinéraire').click();
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]')).toHaveCount(1);
  await page.mouse.click(640, 500);   // plein centre, loin des contrôles
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]'),
    'le clic dans le vide n’a pas refermé le planificateur').toHaveCount(0);

  // Et les deux autres chemins restent : Échap, et son propre bouton.
  await entree(page, 'Itinéraire').click();
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]')).toHaveCount(0);
});

test('ET LE MENU DES RÉGLAGES AUSSI', async ({ page }) => {
  /* Même renversement, même motif (ERGO-4, 02/09) : deux moyens de fermer
     valent mieux qu'un. Ce que le parcours défendait — le va-et-vient
     « j'active une couche, j'inspecte un point, j'en active une autre » — est
     préservé autrement : la règle ne joue que dans LE VIDE. */
  await ouvrirLaCarte(page);
  await ouvrirMenu(page);

  await page.mouse.click(640, 500);
  await expect(page.locator('details.reglages[open]'),
    'le clic dans le vide n’a pas refermé le menu').toHaveCount(0);
  await ouvrirMenu(page);

  // Il se ferme par Échap, par son bouton, ou en ouvrant le planificateur.
  await entree(page, 'Itinéraire').click();
  await expect(page.locator('details.reglages[open]'),
    'ouvrir le planificateur devrait refermer le menu').toHaveCount(0);
});

test('ouvrir le planificateur referme le menu des réglages, et l’inverse', async ({ page }) => {
  /* IL N'Y A PLUS QU'UN VOLET DANS LE RAIL : l'exclusion se joue désormais
     entre lui et le menu de droite. Deux surfaces de trois cents pixels
     ouvertes ensemble ne laisseraient presque plus de carte. */
  await ouvrirLaCarte(page);
  await entree(page, 'Itinéraire').click();
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]')).toHaveCount(1);

  await ouvrirMenu(page);
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]'),
    'deux surfaces ouvertes en même temps ne laissent plus de carte').toHaveCount(0);

  await entree(page, 'Itinéraire').click();
  await expect(page.locator('details.reglages[open]')).toHaveCount(0);
});

test('les liens légaux ne recouvrent plus rien — ils vivent dans la bulle du « i »', async ({ page }) => {
  /* CE PARCOURS A CHANGÉ DE NATURE le 30/08. Il défendait un pied de page
     posé sur la carte, qui se disputait le coin bas avec l'attribution IGN
     et les commandes de vue — trois occupants pour une bande. Armelin :
     « le cartouche À propos / Professionnels / Vie privée / Mentions
     légales est affiché un peu haut dans la fenêtre au lieu d'être tout en
     bas. Ce serait bien de le cacher dans le bouton "i" ». Les liens ont
     donc rejoint l'attribution : il n'y a plus de conflit à arbitrer, et ce
     qu'il faut défendre maintenant, c'est qu'ils restent ATTEIGNABLES. */
  await ouvrirLaCarte(page);

  // Le pied autonome s'efface dès que la carte est là — mais il reste dans
  // le HTML pour qui n'a pas JavaScript : les mentions légales ne sont pas
  // négociables.
  await expect(page.locator('.pied-carte')).toBeHidden();
  await expect(page.locator('.pied-carte a[href="/mentions-legales.html"]')).toHaveCount(1);

  // Et ils sont là, dans l'attribution, avec la source des données.
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  await expect(attribution).toBeVisible();
  await expect(attribution).toContainText('IGN');
  for (const lien of ['/a-propos.html', '/offre-flottes.html',
    '/vie-privee.html', '/mentions-legales.html']) {
    await expect(attribution.locator(`a[href="${lien}"]`),
      `le lien ${lien} a disparu de la bulle`).toHaveCount(1);
  }

  /* L'ATTRIBUTION NE RECOUVRE AUCUN CONTRÔLE DU BAS — c'est ce qui restait
     à défendre du parcours d'origine. */
  const boiteAttribution = await boite(attribution);
  const voisins = page.locator(
    '.maplibregl-ctrl-bottom-right .maplibregl-ctrl, .maplibregl-ctrl-bottom-left .maplibregl-ctrl');
  const nombre = await voisins.count();
  for (let i = 0; i < nombre; i++) {
    const voisin = voisins.nth(i);
    if (!(await voisin.isVisible())) continue;
    if (await voisin.evaluate((e) => e.classList.contains('maplibregl-ctrl-attrib'))) continue;
    expect(seChevauchent(boiteAttribution, await boite(voisin)),
      `l’attribution recouvre un contrôle du bas (n° ${i})`).toBe(false);
  }
});

test('l’attribution de MapLibre n’est PAS traitée comme un de nos volets', async ({ page }) => {
  /* MAPLIBRE REND SON ATTRIBUTION COMPACTE AVEC UN <details>. Une détection
     purement structurelle — « un <details> sans <details> ancêtre » —
     l'adoptait comme volet de tête. Deux conséquences, dont une grave :
     ouvrir un volet refermait l'attribution (une OBLIGATION de la
     Géoplateforme), et MapLibre l'ouvrant au chargement refermait le
     planificateur — un lien partagé n'affichait alors plus rien.

     La CI l'a attrapé, pas les essais locaux : le défaut dépend de l'ordre
     dans lequel MapLibre bascule son attribution. */
  await ouvrirLaCarte(page);

  const attribution = page.locator('details.maplibregl-ctrl-attrib');
  await expect(attribution, 'l’attribution devrait bien être un <details>').toHaveCount(1);

  // 1. Ouvrir un volet ne doit pas refermer l'attribution.
  await attribution.evaluate((d: HTMLDetailsElement) => { d.open = true; });
  await entree(page, 'Itinéraire').click();
  await expect(attribution, 'ouvrir un volet a refermé l’attribution IGN')
    .toHaveAttribute('open', '');

  // 2. Ouvrir l'attribution ne doit pas refermer notre volet.
  await attribution.evaluate((d: HTMLDetailsElement) => { d.open = false; });
  await attribution.evaluate((d: HTMLDetailsElement) => { d.open = true; });
  await expect(page.locator('.maplibregl-ctrl-top-left > div > * > details[open]'),
    'l’attribution a refermé le volet — un lien partagé n’afficherait plus rien')
    .toHaveCount(1);
});

/* LE SOCLE MOBILE DU MANDAT UX DU 28/08 — les captures d'Armelin en tests :
   l'en-tête mangeait un tiers de l'écran, le bouton Menu était coupé, les
   contrôles bas-droite se chevauchaient. Ici, tout se mesure en rectangles. */

test('à 320 px, le Menu est ENTIER, l’en-tête est bas, rien ne déborde', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  // Le bouton Menu, VISIBLE ET ENTIER — « enu » à l'écran a existé.
  const menu = page.locator('summary[aria-label="Menu : réglages, couches et lieux"]');
  await expect(menu).toBeVisible();
  const boiteMenu = (await menu.boundingBox())!;
  expect(boiteMenu.x + boiteMenu.width, 'le Menu dépasse à droite').toBeLessThanOrEqual(320);
  const entete = (await page.locator('.entete').boundingBox())!;
  expect(entete.x + entete.width, 'l’en-tête recouvre le Menu')
    .toBeLessThanOrEqual(boiteMenu.x + 1);

  // L'en-tête tient sur UNE rangée : moins de soixante pixels de haut.
  expect(entete.height, 'l’en-tête reprend deux rangées').toBeLessThan(60);

  // Aucun défilement horizontal : la page EST la carte.
  const debord = await page.evaluate(() =>
    document.documentElement.scrollWidth - window.innerWidth);
  expect(debord, 'la page déborde horizontalement').toBeLessThanOrEqual(0);
});

test('choisir une suggestion ne DÉCLENCHE PAS le bouton posé derrière', async ({ page }) => {
  /* LE TOUCHER FANTÔME, CHERCHÉ ET NON REPRODUIT. Le mandat du 28/08
     signale que « les suggestions et les éléments situés derrière peuvent
     recevoir le même toucher ». Vérifié : le preventDefault() du
     pointerdown de la sélection SUPPRIME déjà les événements souris de
     compatibilité (spec Pointer Events), click compris — un correctif
     supplémentaire a été écrit, SABOTÉ pour vérification, et le parcours
     passait dans les deux cas : il n'a donc pas été gardé. Ce parcours
     reste en GARDE-FOU : si la sélection changeait un jour de mécanisme,
     le fantôme réapparaîtrait ici. */
  await page.setViewportSize({ width: 360, height: 780 });
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ features: [
      { geometry: { coordinates: [4.8357, 45.764] },
        properties: { label: '36 Rue Sadi Carnot 69100 Lyon', type: 'housenumber',
          context: '69, Rhône', score: 0.9 } },
    ] }),
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await page.locator('.entete .recherche input').fill('36 rue sadi carnot');
  const option = page.locator('.entete .recherche [role="option"]').first();
  await expect(option).toBeVisible();

  /* LA SUGGESTION RECOUVRE LE BOUTON « Itinéraire » — c'est la condition du
     fantôme, on la VÉRIFIE avant de cliquer : un test qui tape à côté ne
     prouverait rien. */
  const boiteOption = (await option.boundingBox())!;
  const iti = page.locator('.maplibregl-ctrl-top-left summary').filter({ hasText: 'Itinéraire' });
  const boiteIti = (await iti.boundingBox())!;
  const recouvre = boiteOption.y < boiteIti.y + boiteIti.height
    && boiteOption.y + boiteOption.height > boiteIti.y;
  expect(recouvre, 'la suggestion ne recouvre pas le bouton : le test ne prouve rien').toBe(true);

  // Un VRAI toucher : down puis up, au centre de la suggestion.
  await page.mouse.click(boiteOption.x + boiteOption.width / 2,
    boiteOption.y + Math.min(boiteOption.height / 2, boiteIti.y + 5 - boiteOption.y));
  // La sélection a eu lieu…
  await expect(page.locator('.entete .recherche input')).toHaveValue(/Sadi Carnot/);
  // …et le planificateur, derrière, N'A PAS reçu le clic.
  await page.waitForTimeout(400);
  await expect(page.locator('.iti[open]'), 'le clic fantôme a ouvert le planificateur')
    .toHaveCount(0);
});

test('le bouton de contact des Professionnels se LIT — blanc sur bleu', async ({ page }) => {
  /* Armelin, le 28/08 : « le texte est peu ou pas visible ». La cause :
     `.page-corps a` écrasait la couleur de `.page-action` — bleu accent sur
     fond bleu. Le test lit la couleur CALCULÉE, celle que l'œil reçoit. */
  await page.goto('/offre-flottes.html');
  const lien = page.locator('a.page-action');
  await expect(lien).toBeVisible();
  const styles = await lien.evaluate((e) => {
    const s = getComputedStyle(e);
    return { couleur: s.color, fond: s.backgroundColor };
  });
  expect(styles.couleur, 'le texte doit trancher sur le fond bleu')
    .toBe('rgb(255, 255, 255)');
  expect(styles.fond).not.toBe(styles.couleur);
});

test('FENÊTRE FLOTTANTE : le volet ouvert se détache — borné à 680 px, l’ombre de fenêtre', async ({ page }) => {
  /* FEN-1, validée par Armelin le 29/08 : un volet haut comme l'écran
     redevient un tiroir, quel que soit son habillage. On mesure la hauteur
     ET l'habillage — rayon, ombre de fenêtre — au lieu de les croire.
     Le rayon est passé de 16 à 18 avec FEN-4 : toutes les surfaces
     flottantes portent le même, celui des cartouches et du copilote. */
  await page.setViewportSize({ width: 1280, height: 900 });
  await ouvrirLaCarte(page);
  await page.locator('.iti > summary').click();
  await page.locator('.iti-vers[data-vers="vehicule"]').click();
  const corps = page.locator('.iti-corps');
  const boite = (await corps.boundingBox())!;
  expect(boite.height, 'le volet reprend toute la hauteur d’écran').toBeLessThanOrEqual(682);
  // Le contenu plus long DÉFILE dedans : l'unique ascenseur, pas un tiroir.
  const deborde = await corps.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(deborde, 'la page véhicule devrait défiler dans la fenêtre').toBe(true);
  const style = await corps.evaluate((el) => {
    const c = getComputedStyle(el);
    return { rayon: c.borderRadius, ombre: c.boxShadow };
  });
  expect(style.rayon).toBe('18px');
  /* L'ombre est celle des fenêtres CENTRÉES depuis FEN-5 : posée au milieu
     de l'écran, une fenêtre flotte plus haut qu'un panneau adossé à un bord
     — son ombre porte plus loin, sans quoi elle paraît collée. */
  expect(style.ombre, 'l’ombre de fenêtre manque').toContain('70px');
});

test('MOB-1 : sur téléphone, rien ne se recouvre — échelle, barre du trajet, liens légaux', async ({ page, context }) => {
  /* Trois chevauchements relevés sur capture par Armelin le 30/08 : le rond
     de vitesse GPS sur l'échelle, la barre verticale sur « Recentrer », et
     le cartouche des liens légaux « affiché un peu haut » au lieu d'être
     rangé derrière le « i ». Tout se mesure en rectangles. */
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 770_000, duration: 29_880,
    }),
  }));
  /* D'ABORD LA CARTE NUE : les liens légaux vivent dans la bulle du « i »,
     repliée sur téléphone, et le pied de page autonome s'efface — deux fois
     les mêmes liens n'informent pas deux fois. (Le planificateur ouvert
     recouvre ce coin : on regarde donc avant de charger un trajet, comme
     l'usager qui consulte les mentions légales.) */
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.pied-carte')).toBeHidden();
  await expect(page.locator('.maplibregl-ctrl-attrib')).not.toHaveClass(/compact-show/);
  await page.locator('.maplibregl-ctrl-attrib-button').click();
  await expect(page.locator('.maplibregl-ctrl-attrib a[href="/a-propos.html"]')).toBeVisible();

  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await page.reload();
  await expect(page.locator('.iti-resultat')).toContainText('770 km', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('.bg-chiffres')).toBeVisible({ timeout: 15_000 });

  // LES TROIS CHIFFRES SUR UNE SEULE LIGNE — l'heure d'arrivée comprise.
  const lignes = await page.locator('.bg-chiffre').evaluateAll(
    (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().y))).size);
  expect(lignes, 'les chiffres s’enroulent sur deux lignes').toBe(1);
  await expect(page.locator('.bg-eta')).toContainText(':');

  // LE ROND DE VITESSE NE COUVRE PLUS L'ÉCHELLE.
  const echelle = (await page.locator('.maplibregl-ctrl-scale').boundingBox())!;
  const vitesse = await page.locator('.bg-vitesse').boundingBox();
  if (vitesse) {
    expect(vitesse.y + vitesse.height, 'le rond de vitesse couvre l’échelle')
      .toBeLessThanOrEqual(echelle.y + 1);
  }

  /* LA BARRE DU TRAJET LAISSE LA PLACE À « RECENTRER » — un geste sur la
     carte suspend la caméra et fait paraître le bouton. */
  /* LE GESTE EST UNE MOLETTE, pas un panBy : c'est l'événement d'ORIGINE
     qui distingue un geste d'usager de nos propres easeTo — la même
     mécanique que le parcours « un geste suspend la caméra ». */
  const cadre = (await page.locator('#carte canvas.maplibregl-canvas').boundingBox())!;
  await page.mouse.move(cadre.x + cadre.width / 2, cadre.y + 200);
  await page.mouse.wheel(0, 600);
  const recentrer = page.locator('.bg-recentrer');
  await expect(recentrer).toBeVisible({ timeout: 10_000 });
  const bouton = (await recentrer.boundingBox())!;
  const frise = (await page.locator('.bg-frise').boundingBox())!;
  expect(frise.y + frise.height, 'la barre du trajet recouvre « Recentrer »')
    .toBeLessThanOrEqual(bouton.y + 1);
});
