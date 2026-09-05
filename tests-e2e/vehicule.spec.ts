import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';
import { allerA, retour } from './planificateur';

/* PROFIL DU VÉHICULE ET RAYON D'ACTION — éprouvés avec un véhicule RÉEL, la
   VinFast VF8 d'Armelin et ses relevés du 25/08/2026. Une fiche constructeur
   aurait prouvé que le calcul tourne ; des relevés réels prouvent qu'il
   retrouve le terrain. */

const VF8 = { batterie: '87.7', soce: '94', soc: '100',
  ville: '400', route: '360', autoroute: '280' };


/* LA MÉTÉO EST SIMULÉE, ET C'EST NÉCESSAIRE DEPUIS RAYON-2 (02/09) : le
   cercle d'action tient compte de la température relevée dehors, et un
   parcours qui laisserait partir le vrai appel mesurerait la météo du jour —
   320 km en mai, 281 un matin frais. Vingt degrés : la référence du modèle,
   qui n'applique donc aucune correction et rend les chiffres lisibles. */
async function simulerMeteo(page: Page, celsius: number): Promise<void> {
  await page.route('**/api.open-meteo.com/**', (route) => {
    const base = new Date();
    const heure = (h: number): string => {
      const d = new Date(base.getTime() + h * 3600 * 1000);
      const p = (n: number): string => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
        + `T${p(d.getUTCHours())}:00`;
    };
    const heures = [-1, 0, 1, 2];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      utc_offset_seconds: 0,
      hourly: {
        time: heures.map(heure),
        temperature_2m: heures.map(() => celsius),
        precipitation: heures.map(() => 0),
        weather_code: heures.map(() => 0),
        wind_speed_10m: heures.map(() => 5),
      },
    }) });
  });
}

test.beforeEach(async ({ page, context }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  /* LA POSITION EST AUTORISÉE, PAS DEMANDÉE. Depuis le 27/08 les anneaux
     n'apparaissent qu'une fois le véhicule localisé — un rayon d'action
     centré sur le regard répondait faussement à la seule question qu'il pose.
     Les parcours doivent donc passer par « Me localiser », comme l'usager. */
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ longitude: 2.3522, latitude: 48.8566 });
});

/** Presse « Me localiser » et attend que le panneau ait reçu la position. */
async function seLocaliser(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Me localiser' }).click();
  await expect(page.locator('.veh-bilan-ancre'),
    'le panneau n’a jamais reçu la position')
    .toContainText('depuis votre position', { timeout: 20_000 });
}

async function ouvrirVehicule(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  /* LE VÉHICULE EST UNE PAGE DU PLANIFICATEUR depuis le 27/08/2026 : « un seul
     bouton est plus efficace à comprendre que trois boutons où il faudra se
     rappeler dans quel menu on peut trouver quelle option » (Armelin). */
  await ouvrirVolet(page, '.vehicule');
}

async function saisirVF8(page: Page): Promise<void> {
  await page.getByLabel('Nom du véhicule').fill('VinFast VF8');
  await page.getByLabel('Batterie').fill(VF8.batterie);
  await page.getByLabel('Santé (SOCE)').fill(VF8.soce);
  await page.getByLabel('Charge (SOC)').fill(VF8.soc);
  await page.getByLabel('En ville').fill(VF8.ville);
  await page.getByLabel('Sur route').fill(VF8.route);
  await page.getByLabel('Sur autoroute').fill(VF8.autoroute);
}

test('sans véhicule saisi, rien n’est promis', async ({ page }) => {
  await ouvrirVehicule(page);
  await expect(page.locator('.veh-bilan'),
    'inventer une « voiture moyenne » afficherait un rayon crédible et faux')
    .toContainText('Renseignez la batterie');
});

test('les relevés réels d’une VF8 redonnent ses autonomies', async ({ page }) => {
  await ouvrirVehicule(page);
  await saisirVF8(page);

  const bilan = page.locator('.veh-bilan-lignes');
  await expect(bilan).toContainText('En ville : 400 km');
  await expect(bilan).toContainText('Sur autoroute : 280 km');
});

test('l’usure de la batterie se dit en KILOMÈTRES, pas en pourcents', async ({ page }) => {
  await ouvrirVehicule(page);
  await saisirVF8(page);

  // « SOCE 94 % » ne dit rien à personne ; « 5,3 kWh perdus, soit 18 km » si.
  const usure = page.locator('.veh-bilan-usure');
  await expect(usure).toContainText('Usure de la batterie');
  await expect(usure).toContainText('kWh perdus');
  await expect(usure).toContainText(/\d+ km d’autoroute/);
});

test('la réserve est écrite sous le bilan, jamais sous-entendue', async ({ page }) => {
  await ouvrirVehicule(page);
  await saisirVF8(page);
  await expect(page.locator('.veh-bilan-reserve')).toContainText('ni le relief');
});

test('sans position, AUCUN anneau — un cercle centré ailleurs répondrait faux', async ({ page }) => {
  /* Armelin, le 26/08/2026 : « quand on coche la case sans avoir cliqué sur
     "me localiser", la carte affiche un cercle en plein milieu de la carte car
     elle ne sait pas où on est. Ce qui n'est pas logique. »
     Il a raison, et j'avais défendu l'inverse : je pensais qu'un anneau centré
     sur le regard, dûment annoncé, valait mieux que rien. C'est faux. Un rayon
     d'action répond à « jusqu'où puis-je aller » — question qui n'a de sens
     que depuis un endroit. Centré ailleurs, il ne répond pas à une AUTRE
     question : il répond à la même, faussement. */
  await ouvrirVehicule(page);
  await saisirVF8(page);
  await page.getByRole('checkbox', { name: 'Afficher mon rayon d’action' }).check();

  await expect(page.locator('.veh-bilan-ancre')).toContainText('Me localiser');
  await expect.poll(async () => page.evaluate(async () => {
    const carte = (window as unknown as {
      __carte: { getSource(id: string): { getData(): unknown } | undefined };
    }).__carte;
    const d = await carte.getSource('rayon-action')?.getData() as
      GeoJSON.FeatureCollection | undefined;
    return d?.features.length ?? 0;
  }), { message: 'un anneau a été dessiné sans savoir où' }).toBe(0);
});

test('les trois anneaux se dessinent, et le plus petit reste visible', async ({ page }) => {
  await simulerMeteo(page, 20);
  await ouvrirVehicule(page);
  await saisirVF8(page);
  await seLocaliser(page);
  await page.getByRole('checkbox', { name: 'Afficher mon rayon d’action' }).check();

  /* `getData()` est l'API PUBLIQUE de MapLibre 6 ; `_data` en était le champ
     privé, et un test qui s'appuie sur un champ privé casse à la première
     montée de version — celle de ce matin l'aurait fait. */
  const anneaux = await page.evaluate(async () => {
    const carte = (window as unknown as {
      __carte: { getSource(id: string): { getData(): unknown } | undefined };
    }).__carte;
    const d = await carte.getSource('rayon-action')?.getData() as
      GeoJSON.FeatureCollection | undefined;
    return (d?.features ?? []).map((f) => ({
      cle: f.properties?.['cle'] as string,
      rayon: f.properties?.['rayonKm'] as number,
      sommets: (f.geometry as GeoJSON.Polygon).coordinates[0]?.length ?? 0,
    }));
  });

  expect(anneaux, 'trois régimes, trois anneaux').toHaveLength(3);
  // Du plus grand au plus petit : sinon le petit disparaît sous le grand.
  expect(anneaux.map((a) => a.cle)).toEqual(['ville', 'route', 'autoroute']);
  expect(anneaux[0]!.rayon).toBeGreaterThan(anneaux[2]!.rayon);
  /* LES RAYONS SONT RÉDUITS DEUX FOIS, ET CHAQUE FOIS POUR UNE RAISON MESURÉE.
     DU DÉTOUR ROUTIER (RAYON-1, 02/09) : une autonomie se dépense sur des
     ROUTES, un cercle se mesure à VOL D'OISEAU — la route fait 1,19 fois le
     vol d'oiseau en médiane sur huit trajets français, et l'on retient 1,25.
     ET DE LA RÉSERVE (RAYON-2, 02/09) : le cercle supposait qu'on roule
     jusqu'à zéro pour cent, quand le planificateur refuse déjà de descendre
     sous 10 %. Deux moitiés de l'application disaient deux choses de la même
     voiture.
     400 km d'autonomie → 400 × 0,9 ÷ 1,25 = 288 km de cercle.
     280 km d'autonomie → 280 × 0,9 ÷ 1,25 = 202 km. */
  expect(anneaux[0]!.rayon).toBe(288);
  expect(anneaux[2]!.rayon).toBe(202);
  for (const a of anneaux) expect(a.sommets, 'un anneau fermé').toBeGreaterThan(90);
});

test('décocher efface les anneaux — la carte redevient nue', async ({ page }) => {
  await ouvrirVehicule(page);
  await saisirVF8(page);
  await seLocaliser(page);
  const bascule = page.getByRole('checkbox', { name: 'Afficher mon rayon d’action' });
  await bascule.check();
  /* ON ATTEND QUE LES ANNEAUX SOIENT LÀ AVANT DE LES EFFACER. Décocher avant
     que la pose soit finie faisait courir deux `setData` : le test vérifiait
     alors la disparition de quelque chose qui n'était jamais apparu, et
     rougissait une fois sur quatre. Une précondition qu'on n'attend pas est
     une course qu'on parie. */
  await expect.poll(async () => page.evaluate(async () => {
    const carte = (window as unknown as {
      __carte: { getSource(id: string): { getData(): unknown } | undefined };
    }).__carte;
    const d = await carte.getSource('rayon-action')?.getData() as
      GeoJSON.FeatureCollection | undefined;
    return d?.features.length ?? -1;
  }), { message: 'les anneaux ne sont jamais apparus' }).toBe(3);

  await bascule.uncheck();

  /* ON ATTEND que la source se vide : `setData` est asynchrone, et lire trop
     tôt rendait l'ancien jeu — un parcours rouge pour une raison qui n'avait
     rien à voir avec le décochage. */
  await expect.poll(async () => page.evaluate(async () => {
    const carte = (window as unknown as {
      __carte: { getSource(id: string): { getData(): unknown } | undefined };
    }).__carte;
    const d = await carte.getSource('rayon-action')?.getData() as
      GeoJSON.FeatureCollection | undefined;
    return d?.features.length ?? -1;
  }), { message: 'les anneaux n’ont jamais disparu' }).toBe(0);
});

test('le profil survit au rechargement — sans compte, sans serveur', async ({ page }) => {
  await ouvrirVehicule(page);
  await saisirVF8(page);
  await expect(page.locator('.veh-bilan-lignes')).toContainText('400 km');

  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  /* LE VÉHICULE EST UNE PAGE DU PLANIFICATEUR depuis le 27/08/2026 : « un seul
     bouton est plus efficace à comprendre que trois boutons où il faudra se
     rappeler dans quel menu on peut trouver quelle option » (Armelin). */
  await ouvrirVolet(page, '.vehicule');
  await expect(page.getByLabel('Batterie')).toHaveValue(VF8.batterie);
  await expect(page.locator('.veh-bilan-lignes')).toContainText('En ville : 400 km');
});


/* LE CATALOGUE DE VÉHICULES — « ABRP dispose d'une base de données des
   véhicules » (Armelin, 25/08/2026). Saisir cinq chiffres avant de pouvoir se
   servir du planificateur est un péage à l'entrée : beaucoup ne le
   franchissent pas, et ceux qui le franchissent y mettent des approximations. */

test('choisir un modèle remplit le formulaire, et le bilan suit', async ({ page }) => {
  await ouvrirVehicule(page);

  // Rien n'est prétendu tant que rien n'est choisi.
  await expect(page.getByLabel('Batterie', { exact: true })).toHaveValue('');

  await page.locator('.veh-marques-boite > summary').click();
  await page.locator('.veh-marque', { hasText: 'VinFast' }).locator('summary').click();
  await page.getByRole('button', { name: 'Choisir VinFast VF 8 (Eco)' }).click();

  await expect(page.getByLabel('Batterie', { exact: true })).toHaveValue('82.4');
  await expect(page.getByLabel('Charge max', { exact: true })).toHaveValue('150');
  await expect(page.getByLabel('Nom du véhicule')).toHaveValue('VinFast VF 8 (Eco)');
  /* GROUPÉ PAR MARQUE : sous « VinFast » on lit « VF 8 (Eco) », et non
     « VinFast VF 8 (Eco) » — répéter la marque sous elle-même serait du bruit.
     Le NOM enregistré, lui, la garde : il vit hors de tout groupe. */
  await expect(page.getByRole('button', { name: 'Choisir VinFast VF 8 (Eco)' }))
    .toHaveText('VF 8 (Eco)');
  /* LE <select> RESTE SOUS LA PEAU : masqué à l'œil, il porte le nom
     accessible et l'état choisi pour un lecteur d'écran. Le perdre en
     habillant la liste serait une régression invisible. */
  await expect(page.locator('.veh-catalogue optgroup[label="VinFast"]')).toHaveCount(1);
  await expect(page.getByLabel('Choisir un modèle de véhicule'))
    .toHaveValue('vinfast-vf8');
  /* LA SANTÉ REVIENT À 100 % : le catalogue décrit une voiture neuve, et
     garder la dégradation d'un véhicule précédent l'appliquerait à un modèle
     qui n'a rien à voir. */
  await expect(page.getByLabel('Santé (SOCE)')).toHaveValue('100');

  // Et le bilan se recalcule tout seul : l'application lit son état, pas le DOM.
  await expect(page.locator('.veh-bilan-lignes')).toContainText('Sur autoroute');
});

test('les valeurs du catalogue restent MODIFIABLES — il propose, il ne verrouille pas', async ({ page }) => {
  await ouvrirVehicule(page);
  await page.locator('.veh-recherche').fill('spring');
  await page.getByRole('button', { name: /^Choisir Dacia Spring/ }).first().click();
  await expect(page.getByLabel('Batterie', { exact: true })).toHaveValue('26.8');

  // L'usager corrige : c'est SA voiture, pas la fiche du constructeur.
  await page.getByLabel('Sur autoroute').fill('150');
  await page.getByLabel('Charge (SOC)').fill('100');
  await expect(page.locator('.veh-bilan-lignes')).toContainText('150 km');
});

test('LE CATALOGUE PROPOSE 5 % SOUS LE WLTP DÉCLINÉ, et le DIT (MARGE-1)', async ({ page }) => {
  /* Armelin, rapportant ses testeurs : « l'algorithme reste encore 5 % plus
     optimiste que ce qu'ils constatent en réel […] par rapport aux
     caractéristiques constructeurs chargées par défaut. Ils préfèrent tous
     avoir un navigateur GPS pessimiste de 5 % qu'optimiste de 5 %. »
     La marge s'applique À LA PROPOSITION — l'endroit exact qu'ils nomment —
     jamais aux relevés que l'usager saisit lui-même : punir de 5 % celui qui
     a mesuré serait punir l'exactitude (le parcours des relevés VF8, plus
     haut, vérifie que 400 km saisis restent 400 km affichés). */
  await ouvrirVehicule(page);
  await page.locator('.veh-recherche').fill('spring');
  await page.getByRole('button', { name: /^Choisir Dacia Spring/ }).first().click();

  // La Spring 2021 annonce 230 km WLTP : autoroute = 230 × 0,63 ÷ 1,05 = 138.
  const autoroute = page.getByLabel('Sur autoroute');
  const propose = Number(await autoroute.inputValue());
  expect(propose, 'la proposition doit porter la marge').toBeLessThan(145);
  expect(propose).toBeGreaterThan(125);

  // ET LA FICHE LE DIT : un chiffre corrigé en silence redevient inexpliqué.
  await expect(page.locator('.veh-catalogue-detail'))
    .toContainText('5 % de prudence');
});

test('le catalogue annonce d’où viennent ses chiffres', async ({ page }) => {
  /* Un formulaire pré-rempli sans provenance se lit comme une mesure. Le WLTP
     est un cycle de laboratoire, optimiste sur autoroute : le dire est la
     condition pour que l'usager pense à le corriger. */
  await ouvrirVehicule(page);
  await expect(page.locator('.veh-note-catalogue')).toContainText('WLTP');
  await expect(page.locator('.veh-note-catalogue')).toContainText('vos propres relevés');
});

test('MÉMOIRE : masse et bridages thermiques survivent au rechargement', async ({ page }) => {
  /* Armelin, le 30/08 : « dans les paramètres du véhicule, les informations
     de la masse, de charge sous 0° ou par temps de canicule ne sont pas
     mémorisées et je dois les saisir à chaque fois ». Elles ÉTAIENT écrites
     — l'enregistrement porte le véhicule entier — mais la relecture
     reconstruisait l'objet champ par champ et en oubliait trois. */
  await ouvrirVehicule(page);
  await page.getByLabel('Batterie', { exact: true }).fill('87.7');
  await page.getByLabel('Masse').fill('2150');
  await page.getByLabel('Charge max sous 0 °C').fill('30');
  await page.getByLabel('Charge max en canicule').fill('60');
  // L'écriture est asynchrone : on attend qu'elle ait eu lieu.
  await expect(page.getByLabel('Masse')).toHaveValue('2150');

  await page.reload();
  await ouvrirVehicule(page);
  await expect(page.getByLabel('Masse'), 'la masse a été oubliée').toHaveValue('2150');
  await expect(page.getByLabel('Charge max sous 0 °C'),
    'le bridage par grand froid a été oublié').toHaveValue('30');
  await expect(page.getByLabel('Charge max en canicule'),
    'le bridage en canicule a été oublié').toHaveValue('60');
});

/* CAT-1 — Armelin, le 30/08 : « le choix des véhicules est trop long à
   scroller quand il y a trop de véhicules électriques dans la liste. Il
   faudrait les replier par marque […] on clique sur une marque pour déplier
   et voir les modèles existants, et ajouter une barre de recherche pour
   aller plus vite. » */

test('le catalogue s’ouvre REPLIÉ : on voit les marques, pas cent trente modèles', async ({ page }) => {
  await ouvrirVehicule(page);
  /* LA BOÎTE EST FERMÉE À L'OUVERTURE : trente-deux marques dépliées
     repoussaient le choix du repère hors de vue, ce que FEN-6 interdit. La
     RECHERCHE, elle, reste visible — c'est le chemin rapide. */
  await expect(page.locator('.veh-marques-boite')).not.toHaveAttribute('open', '');
  await expect(page.locator('.veh-recherche')).toBeVisible();

  await page.locator('.veh-marques-boite > summary').click();
  const marques = page.locator('.veh-marque');
  expect(await marques.count()).toBeGreaterThan(20);
  // Aucune dépliée : c'est tout l'objet de la demande.
  await expect(page.locator('.veh-marque[open]')).toHaveCount(0);
  /* Les modèles SONT dans le document — c'est ce qui permet au lecteur
     d'écran de tout parcourir — mais aucun n'est à l'écran. */
  await expect(page.locator('.veh-modele').first()).toBeHidden();

  // On déplie SA marque, et elle seule.
  await page.locator('.veh-marque', { hasText: 'Renault' }).locator('summary').click();
  await expect(page.locator('.veh-marque[open]')).toHaveCount(1);
  expect(await page.locator('.veh-marque[open] .veh-modele').count()).toBeGreaterThan(0);
});

test('CHERCHER OUVRE LA BOÎTE : on ne tape pas dans le vide', async ({ page }) => {
  await ouvrirVehicule(page);
  await page.locator('.veh-recherche').fill('t');
  await expect(page.locator('.veh-marques-boite')).toHaveAttribute('open', '');
  /* Effacer ne la REFERME pas : refermer sous les doigts de qui vide son
     champ pour recommencer se prendrait pour une panne. */
  await page.locator('.veh-recherche').fill('');
  await expect(page.locator('.veh-marques-boite')).toHaveAttribute('open', '');
});

test('la recherche trouve une MARQUE, et la rend entière', async ({ page }) => {
  await ouvrirVehicule(page);
  await page.locator('.veh-recherche').fill('tesla');
  await expect(page.locator('.veh-marque')).toHaveCount(1);
  /* DÉPLIÉE D'OFFICE : avoir cherché une marque, c'est avoir demandé à voir
     ses modèles. Un second clic pour ouvrir l'unique résultat serait un geste
     de trop. */
  await expect(page.locator('.veh-marque[open]')).toHaveCount(1);
});

test('la recherche trouve un MODÈLE, sans se soucier des accents', async ({ page }) => {
  await ouvrirVehicule(page);
  await page.locator('.veh-recherche').fill('ZOE');
  await expect(page.locator('.veh-marque')).toHaveCount(1);
  await expect(page.locator('.veh-modele')).toHaveCount(1);
  await expect(page.locator('.veh-modele')).toContainText('Zoe');
  // Et le modèle choisi se voit, une fois choisi.
  await page.locator('.veh-modele').click();
  await expect(page.locator('.veh-modele')).toHaveAttribute('aria-pressed', 'true');
});

test('une recherche sans résultat le DIT, et laisse la saisie à la main', async ({ page }) => {
  await ouvrirVehicule(page);
  await page.locator('.veh-recherche').fill('zzzz');
  await expect(page.locator('.veh-marque')).toHaveCount(0);
  await expect(page.locator('.veh-marques')).toContainText('Aucune marque ni modèle');
  // Le formulaire, lui, reste ouvert : le catalogue propose, il ne barre pas.
  await expect(page.getByLabel('Batterie', { exact: true })).toBeEditable();
});

test('LE RAYON DIT À QUELLE CHARGE IL RÉPOND', async ({ page }) => {
  /* LE DÉFAUT DU 31/08. Armelin : « l'autonomie du rayon d'action affiché ne
     correspond pas à l'autonomie configurée dans les paramètres du
     véhicule. » Il saisissait 480 km en ville et lisait 384.
     LE CHIFFRE ÉTAIT JUSTE : 480 × 80 % de charge. Mais il paraissait sous
     un titre « autonomie constatée à PLEINE CHARGE », sans que rien ne dise
     qu'on répondait à la charge COURANTE. Un chiffre juste qu'on ne peut pas
     expliquer ne se distingue pas d'un chiffre faux — il fait douter du
     reste. */
  await ouvrirVehicule(page);
  await page.getByLabel('Batterie').fill('87.7');
  await page.getByLabel('Santé (SOCE)').fill('100');
  await page.getByLabel('Charge (SOC)').fill('80');
  await page.getByLabel('En ville').fill('480');

  const lignes = page.locator('.veh-bilan-lignes');
  await expect(lignes).toContainText('384 km');
  // LA PHRASE QUI MANQUAIT, et qui vient AVANT les chiffres.
  await expect(page.locator('.veh-bilan-charge'))
    .toContainText('80 % de charge');
  await expect(page.locator('.veh-bilan-charge'))
    .toContainText('pas à pleine charge');
  // ET LE RAPPROCHEMENT AVEC LA SAISIE, à portée de survol.
  await expect(page.locator('.veh-bilan-ligne').first())
    .toHaveAttribute('title', /480 km à pleine charge/);
});

test('à pleine charge, il ne s’excuse de rien', async ({ page }) => {
  /* La précision ne doit pas devenir un bavardage : à 100 %, il n'y a rien à
     expliquer, et une phrase de plus serait du bruit. */
  await ouvrirVehicule(page);
  await page.getByLabel('Batterie').fill('87.7');
  await page.getByLabel('Santé (SOCE)').fill('100');
  await page.getByLabel('Charge (SOC)').fill('100');
  await page.getByLabel('En ville').fill('480');
  await expect(page.locator('.veh-bilan-lignes')).toContainText('480 km');
  await expect(page.locator('.veh-bilan-charge')).toContainText('à pleine charge');
  await expect(page.locator('.veh-bilan-charge')).not.toContainText('pas à pleine');
});

/* LE MODE DEUX-ROUES A DÉMÉNAGÉ (MODE-1, 03/09).
 *
 * Armelin : « "Je roule en deux-roue" devrait plutôt se situer dans "Options
 * du trajet" à côté de "Voiture" et "À pieds" ». La case a donc quitté ce
 * panneau, et avec elle le parcours qui la cochait : ce qu'il vérifiait — la
 * note qui cite le décret, le choix qui se garde, ce que le mode ne change
 * pas — vit désormais dans `modes-deplacement.spec.ts`, au bon endroit.
 *
 * CE QUI RESTE PROPRE À CE FICHIER, ET QUI NE POUVAIT PAS DÉMÉNAGER : que le
 * réglage déjà pris ne soit pas perdu. Déplacer un bouton en effaçant en
 * silence ce que l'usager avait coché serait la pire façon de le déplacer. */

test('L’ANCIEN RÉGLAGE « deux-roues » REVIENT en bouton « Moto »', async ({ page }) => {
  await ouvrirVehicule(page);

  /* ON ÉCRIT LA FORME D'AVANT, telle que MOTO-1 la rangeait : la clé
     `vehicule`, et `moto: true` dedans. C'est ce qu'ont dans leur navigateur
     les usagers qui avaient coché la case. */
  await page.evaluate(() => new Promise<void>((ok) => {
    const d = indexedDB.open('infonovice-maps');
    d.onsuccess = () => {
      const tx = d.result.transaction('preferences', 'readwrite');
      tx.objectStore('preferences').put({ vehicule: { moto: true } }, 'vehicule');
      tx.oncomplete = () => ok();
      tx.onerror = () => ok();
    };
    d.onerror = () => ok();
  }));

  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await allerA(page, 'options');
  /* LE BOUTON « Moto » EST PRIS, sans que rien n'ait été recoché à la main —
     et la note du décret paraît avec lui. */
  await expect(page.locator('.iti-profil:has(input[value="moto"]) input'))
    .toBeChecked({ timeout: 10_000 });
  await expect(page.locator('.iti-note-moto')).toBeVisible();
});

/* LE CERCLE TIENT COMPTE DU FROID (RAYON-2, 02/09).
 *
 * Armelin : « le rayon d'action trop optimiste par défaut ». Le cercle
 * ignorait la température alors que l'application connaît la météo — en
 * janvier, il promettait les kilomètres d'un mois de mai. Le modèle chiffre le
 * froid à environ +1,2 % de consommation par degré sous 20 °C. */

test('PAR GRAND FROID, LES ANNEAUX RÉTRÉCISSENT — et le disent', async ({ page }) => {
  await simulerMeteo(page, -5);
  await ouvrirVehicule(page);
  await saisirVF8(page);
  await seLocaliser(page);
  await page.getByRole('checkbox', { name: 'Afficher mon rayon d’action' }).check();

  const rayonVille = async (): Promise<number> => page.evaluate(async () => {
    const carte = (window as unknown as {
      __carte: { getSource(id: string): { getData(): unknown } | undefined };
    }).__carte;
    const d = await carte.getSource('rayon-action')?.getData() as
      GeoJSON.FeatureCollection | undefined;
    const f = (d?.features ?? []).find((x) => x.properties?.['cle'] === 'ville');
    return (f?.properties?.['rayonKm'] as number) ?? 0;
  });

  /* À −5 °C, vingt-cinq degrés sous la référence : le modèle ajoute 30 % de
     consommation, et les 288 km de mai tombent sous 230. */
  await expect.poll(rayonVille, { timeout: 10_000 }).toBeGreaterThan(0);
  const froid = await rayonVille();
  expect(froid, `rayon par −5 °C : ${froid} km`).toBeLessThan(230);
  expect(froid).toBeGreaterThan(200);

  /* ET LA NOTE LE DIT : un chiffre juste et inexpliqué se lit comme une
     incohérence — c'est le reproche d'Armelin du 31/08 sur un autre chiffre. */
  const note = page.locator('.veh-anneaux-reserve');
  await expect(note).toContainText('10 % de batterie en réserve');
  await expect(note).toContainText('−5 °C');
});

test('THERMIQUE OU HYBRIDE : les champs électriques se retirent, le choix se garde, et aucun arrêt de recharge n’est planifié', async ({ page }) => {
  /* MOTORISATION-1 (05/09). Des amis d'Armelin : « le site est trop axé
     véhicule électrique, les arrêts recharge automatiques sont discriminants
     pour les thermiques ». Le contrat : un choix en tête du panneau, la
     batterie et le catalogue qui s'effacent, la page « Arrêts de recharge »
     qui DIT pourquoi elle ne planifie rien, et pas de batterie à l'arrivée
     dans la barre du suivi. */
  await ouvrirVehicule(page);
  await expect(page.getByRole('radio', { name: 'Électrique' })).toBeChecked();
  await expect(page.getByLabel('Batterie')).toBeVisible();

  await page.getByRole('radio', { name: 'Thermique', exact: true }).check();
  await expect(page.getByLabel('Batterie')).toBeHidden();
  await expect(page.getByLabel('Chercher un véhicule')).toBeHidden();
  await expect(page.locator('.veh-thermique-note')).toBeVisible();
  await expect(page.locator('.veh-thermique-note')).toContainText('les pleins remplacent les arrêts de recharge');
  // Le repère de navigation et le nom, eux, restent : ils ne sont pas électriques.
  await expect(page.getByLabel('Nom du véhicule')).toBeVisible();
  // LE CARBURANT (THERMIQUE-2) : réservoir, consommation, jauge — et l'autonomie se dit.
  await expect(page.locator('.veh-bilan')).toContainText('Renseignez le réservoir');
  await page.locator('.veh-carburant-choix').selectOption('gazole');
  await page.getByLabel('Réservoir').fill('50');
  await page.getByLabel('Consommation').fill('6.5');
  await page.getByLabel('Jauge au départ').fill('50');
  await expect(page.locator('.veh-bilan-carburant')).toContainText('~385 km');

  // LE CHOIX SE GARDE (IndexedDB), comme tout le profil.
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrirVolet(page, '.vehicule');
  await expect(page.getByRole('radio', { name: 'Thermique', exact: true })).toBeChecked();
  await expect(page.getByLabel('Batterie')).toBeHidden();
  await expect(page.getByLabel('Réservoir')).toHaveValue('50');

  // UN PARIS–LYON : la page « Arrêts de recharge » planifie les PLEINS, la barre du suivi se tait.
  const TRACE: [number, number][] = [[2.3522, 48.8566], [4.8357, 45.7640]];
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    if (/resource=bdtopo-pgr/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: '{"portions":[]}' });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: TRACE }, distance: 391_000, duration: 21_600,
    }) });
  });
  /* LA LIGNE DROITE PARIS–LYON FAIT 391 KM À VOL D'OISEAU : le tracé simulé
     est un segment, et l'avancement se mesure LE LONG DU TRACÉ — la distance
     annoncée doit donc être la même, sans quoi les fenêtres du plan et les
     stations ne parlent pas des mêmes kilomètres (payé une fois). Six heures
     pour 391 km : une pause toutes les ~130 km. Trois stations : à 30 %
     (117 km, 1,72), à la moitié (196 km, 1,65 — la moins chère), à 80 %
     (313 km, 1,80) : trois pauses, une par fenêtre. */
  const sur = (t: number) => ({ lon: 2.3522 + (4.8357 - 2.3522) * t, lat: 48.8566 + (45.7640 - 48.8566) * t });
  await page.route('**/data.economie.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ total_count: 3, results: [
      { geom: sur(0.3), adresse: 'Aire de la Réserve', ville: 'Auxerre', gazole_prix: 1.72, sp95_prix: 1.85 },
      { geom: sur(1 / 2), adresse: 'Aire de Beaune-Tailly', ville: 'Beaune', gazole_prix: 1.65 },
      { geom: sur(0.8), adresse: 'Aire de Mâcon-Saint-Albain', ville: 'Mâcon', gazole_prix: 1.80 },
    ] }),
  }));
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.route('**/www.bison-fute.gouv.fr/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(`/#iti=${TRACE[0]![0]},${TRACE[0]![1]};${TRACE[1]![0]},${TRACE[1]![1]};car`);
  await page.reload();
  await expect(page.locator('.iti-resultat')).toContainText('km', { timeout: 15_000 });
  await allerA(page, 'recharge');
  const corps = page.locator('.iti-recharge-corps');
  await expect(corps.locator('.carburant-titre')).toContainText('Arrêts carburant — Gazole', { timeout: 15_000 });
  await expect(corps.locator('.carburant-liste li')).toHaveCount(3);
  await expect(corps.locator('.carburant-liste li').nth(0)).toContainText('Auxerre');
  await expect(corps.locator('.carburant-liste li').nth(0)).toContainText('1,720 €/L');
  await expect(corps.locator('.carburant-liste li').nth(0)).toContainText('pause des deux heures');
  await expect(corps.locator('.carburant-liste li').nth(1)).toContainText('Beaune');
  await expect(corps.locator('.carburant-liste li').nth(2)).toContainText('Mâcon');
  await expect(corps.locator('.carburant-moins-chere')).toContainText('Beaune');
  await expect(corps).toContainText('enseigne');

  await retour(page);
  await page.getByRole('button', { name: 'Démarrer le suivi' }).click();
  await expect(page.locator('.bg-chiffres')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bg-chiffre-soc')).toBeHidden();
});
