import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirMenu } from './volets';

/* LE FILTRE DES LIEUX, SUR LA CARTE (POI-2 du 30/08, POI-3 du 31/08).
 *
 * CE QUE CES PARCOURS DÉFENDENT MAINTENANT : que le filtre cherche TOUT SEUL
 * quand la carte s'arrête — la demande d'Armelin — SANS que le service en
 * paie le prix. Les deux vont ensemble : un automatisme sans garde serait
 * l'abus que le mandat interdit, et une garde sans automatisme serait le
 * bouton qu'il ne veut plus.
 *
 * ET QUE LA LIGNE D'ÉTAT NE SE TAISE JAMAIS : c'est le défaut qu'il a vu en
 * production, et le seul moment où elle se taisait était celui où l'usager
 * attendait qu'elle parle. */

const LIEUX = {
  elements: [
    { type: 'node', id: 1, lat: 48.8566, lon: 2.3522,
      tags: { amenity: 'restaurant', name: 'Le Bistrot' } },
    { type: 'node', id: 2, lat: 48.857, lon: 2.353,
      tags: { amenity: 'pharmacy', name: 'Pharmacie du Centre' } },
    // Un lieu d'une famille NON cochée : il ne doit pas s'afficher.
    { type: 'node', id: 3, lat: 48.858, lon: 2.354, tags: { tourism: 'hotel' } },
  ],
};

async function ouvrirCarte(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

/** Compte les appels au service et répond ce qu'on lui donne. */
async function simulerOverpass(page: Page, corps: unknown = LIEUX): Promise<string[]> {
  const urls: string[] = [];
  await page.route('**overpass.openstreetmap.fr**', (route) => {
    urls.push(decodeURIComponent(route.request().url()));
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json', body: JSON.stringify(corps),
    });
  });
  return urls;
}

/** Place la carte, et attend que le filtre ait eu le temps d'agir. */
async function poser(page: Page, lon: number, lat: number, zoom = 15): Promise<void> {
  await page.evaluate(([lo, la, z]) => {
    (window as unknown as { __carte: { jumpTo(o: object): void } })
      .__carte.jumpTo({ center: [lo, la], zoom: z });
  }, [lon, lat, zoom]);
  // Le repos (600 ms) plus l'intervalle minimal (1 500 ms), avec de la marge.
  await page.waitForTimeout(2_600);
}

const ouvrir = (page: Page): Promise<void> => page
  .getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' }).click();

test('le filtre s’ouvre depuis la CARTE, en un geste', async ({ page }) => {
  await ouvrirCarte(page);
  const bulle = page.getByRole('button', { name: 'Filtrer les lieux affichés sur la carte' });
  await expect(bulle).toBeVisible();
  await expect(page.locator('.poi-panneau')).toBeHidden();
  await bulle.click();
  await expect(page.locator('.poi-panneau')).toBeVisible();
  /* QUINZE FAMILLES depuis POI-6 : les écoles ont rejoint la liste (« les
     écoles et les stades ne sont pas affichés en tant que POI »). Elles
     tiennent encore sur un téléphone — et depuis qu'elles portent un
     dessin, elles se reconnaissent plus vite que douze étiquettes ne se
     lisaient. */
  await expect(page.locator('.poi-famille')).toHaveCount(15);
});

test('IL NE CHEVAUCHE PLUS le planificateur, sur un écran large', async ({ page }) => {
  /* Armelin, 31/08 : « en mode desktop, le bouton de filtre est superposé sur
     le bouton itinéraire ». Mon `top`/`left` en dur visait la place d'un
     contrôle « top-left » de MapLibre — celle du planificateur. On MESURE
     donc qu'aucun pixel n'est partagé, plutôt que de croire une règle CSS. */
  await page.setViewportSize({ width: 1440, height: 900 });
  await ouvrirCarte(page);
  const chevauche = await page.evaluate(() => {
    const f = document.querySelector('.poi-bulle')!.getBoundingClientRect();
    const i = document.querySelector('panneau-itineraire')!.getBoundingClientRect();
    return !(f.right <= i.left || f.left >= i.right || f.bottom <= i.top || f.top >= i.bottom);
  });
  expect(chevauche, 'le filtre et le planificateur se recouvrent').toBe(false);
});

test('LA RECHERCHE SUIT LA CARTE — sans toucher au bouton', async ({ page }) => {
  /* LE CŒUR DE LA DEMANDE : « ce serait bien que les POI sélectionnés
     s'affichent tout seuls […] Cela évitera d'avoir à cliquer sur un bouton
     de recherche. » */
  await ouvrirCarte(page);
  const urls = await simulerOverpass(page);
  await ouvrir(page);
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await page.locator('.poi-famille[data-cle="sante"]').click();
  await poser(page, 2.3522, 48.8566);

  await expect(page.locator('.poi-filtre-etat')).toContainText('2 lieux', { timeout: 15_000 });
  expect(urls.length, 'la recherche doit être partie seule').toBeGreaterThan(0);
  // UNE SEULE REQUÊTE POUR TOUTES LES FAMILLES : Overpass est bénévole.
  expect(urls).toHaveLength(1);
  expect(urls[0]).toContain('pharmacy');
  expect(urls[0]).toContain('restaurant|fast_food');
  const pose = await page.evaluate(() => Boolean(
    (window as unknown as { __carte: { getLayer(id: string): unknown } })
      .__carte.getLayer('filtre-poi-points'),
  ));
  expect(pose, 'la couche des lieux n’est pas posée').toBe(true);
});

test('REVENIR SUR SES PAS NE REDEMANDE RIEN — la garde du service', async ({ page }) => {
  /* SANS CETTE GARDE, l'automatisme serait le martèlement que le mandat
     interdit : un aller-retour entre deux rues paierait deux fois. La zone
     cherchée est plus large que la vue, donc un petit déplacement y reste. */
  await ouvrirCarte(page);
  const urls = await simulerOverpass(page);
  await ouvrir(page);
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await poser(page, 2.3522, 48.8566);
  await expect(page.locator('.poi-filtre-etat')).toContainText('lieu', { timeout: 15_000 });
  const apresPremiere = urls.length;
  expect(apresPremiere).toBe(1);

  // Un petit pas, puis le retour : tout tient dans la zone déjà couverte.
  await poser(page, 2.3530, 48.8570);
  await poser(page, 2.3522, 48.8566);
  expect(urls.length, 'un déplacement couvert ne doit RIEN redemander')
    .toBe(apresPremiere);
});

test('SOUS LE ZOOM, RIEN NE PART — et la ligne le dit', async ({ page }) => {
  await ouvrirCarte(page);
  const urls = await simulerOverpass(page);
  await ouvrir(page);
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await poser(page, 2.3522, 48.8566, 9);
  await expect(page.locator('.poi-filtre-etat')).toContainText('Rapprochez-vous');
  expect(urls, 'une vue trop large ne doit rien demander').toHaveLength(0);
});

test('LA LIGNE D’ÉTAT NE SE TAIT JAMAIS', async ({ page }) => {
  /* LE DÉFAUT VU EN PRODUCTION : elle disait le zoom manquant, puis le choix
     manquant, puis SE TAISAIT une fois le choix fait — au seul moment où
     l'usager attend qu'on lui dise ce qui se passe. */
  await ouvrirCarte(page);
  await simulerOverpass(page);
  await ouvrir(page);
  const etat = page.locator('.poi-filtre-etat');

  await expect(etat).not.toBeEmpty();
  await expect(etat).toContainText('Rapprochez-vous');

  await poser(page, 2.3522, 48.8566);
  await expect(etat).not.toBeEmpty();
  await expect(etat).toContainText('Choisissez');

  // LE MOMENT DU DÉFAUT : le choix est fait, et la ligne doit parler.
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await expect(etat).not.toBeEmpty();
  await expect(etat).toContainText('lieu', { timeout: 15_000 });
});

test('UNE PANNE DU SERVICE SE DIT, et se redit', async ({ page }) => {
  /* Une carte vide sans explication se prend pour une carte sans lieux. */
  await ouvrirCarte(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' }, status: 504, body: 'saturé',
  }));
  await ouvrir(page);
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await poser(page, 2.3522, 48.8566);
  const etat = page.locator('.poi-filtre-etat');
  await expect(etat).toContainText('indisponible', { timeout: 15_000 });
  // Le message survit à un déplacement : sinon la carte vide n'a plus d'excuse.
  await poser(page, 2.3530, 48.8570);
  await expect(etat).toContainText('indisponible');
});

test('le choix des familles SURVIT au rechargement', async ({ page }) => {
  /* C'est un réglage, pas un geste de session : on ne recoche pas ses
     habitudes à chaque ouverture. */
  await ouvrirCarte(page);
  await simulerOverpass(page);
  await ouvrir(page);
  await page.locator('.poi-famille[data-cle="hotel"]').click();
  await expect(page.locator('.poi-famille[data-cle="hotel"]'))
    .toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400);

  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await ouvrir(page);
  await expect(page.locator('.poi-famille[data-cle="hotel"]'))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
});

test('LE MOTIF DIT LE TYPE, LA COULEUR DIT LA FAMILLE', async ({ page }) => {
  /* Armelin, 31/08 : « au lieu de faire un rond de couleur différente, ce
     serait bien de faire un rond de couleur un peu plus gros, mais avec un
     motif clairement identifiable ».
     SA LISTE EST PLUS FINE QUE LES FAMILLES : une tasse pour un café, un
     verre pour un bar — deux dessins pour une seule famille. On sépare donc
     les rôles, et c'est ce que ce parcours défend : MÊME couleur, DEUX
     images. Sans cette séparation, l'honorer aurait demandé une famille par
     dessin, soit vingt pastilles à cocher sur un téléphone. */
  await ouvrirCarte(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [
      { type: 'node', id: 1, lat: 48.8566, lon: 2.3522,
        tags: { amenity: 'cafe', name: 'LE CAFE' } },
      { type: 'node', id: 2, lat: 48.8570, lon: 2.3530,
        tags: { amenity: 'bar', name: 'LE BAR' } },
      { type: 'node', id: 3, lat: 48.8574, lon: 2.3538,
        tags: { amenity: 'dentist', name: 'LE DENTISTE' } },
    ] }),
  }));
  await ouvrir(page);
  await page.locator('.poi-famille[data-cle="cafe"]').click();
  await page.locator('.poi-famille[data-cle="sante"]').click();
  await poser(page, 2.3530, 48.8570);
  await expect(page.locator('.poi-filtre-etat')).toContainText('3 lieux', { timeout: 15_000 });

  /* ON LIT CE QUE LA CARTE A VRAIMENT REÇU, par l'API publique, ET ON RANGE
     PAR NOM. `querySourceFeatures` ne promet aucun ordre — il rend ce que
     portent les tuiles chargées, dans l'ordre où elles le portent. Un
     parcours indexé sur la position aurait mesuré ce hasard, pas le
     comportement : il a d'abord comparé un café à lui-même, et « réussi »
     à trouver deux fois la même image. */
  const vu = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      querySourceFeatures(id: string): { properties: Record<string, string> }[];
      hasImage(id: string): boolean;
    } }).__carte;
    const par: Record<string, { image: string; famille: string; posee: boolean }> = {};
    for (const f of c.querySourceFeatures('filtre-poi')) {
      const image = f.properties['image'] ?? '';
      par[f.properties['nom'] ?? ''] = {
        image, famille: f.properties['famille'] ?? '', posee: c.hasImage(image),
      };
    }
    return par;
  });
  const cafe = vu['LE CAFE']!; const bar = vu['LE BAR']!; const dentiste = vu['LE DENTISTE']!;
  // LE CAFÉ ET LE BAR : même famille, donc même couleur…
  expect(cafe.famille).toBe(bar.famille);
  // …et deux images différentes, donc deux dessins.
  expect(cafe.image).not.toBe(bar.image);
  expect(cafe.image).toContain('tasse');
  expect(bar.image).toContain('cocktail');
  // La dent qu'il demandait, dans la famille « Santé ».
  expect(dentiste.image).toContain('dent');
  expect(dentiste.famille).toBe('sante');
  // ET LES IMAGES SONT VRAIMENT POSÉES : une clé sans image ferait un trou.
  for (const [nom, v] of Object.entries(vu)) {
    expect(v.posee, `« ${nom} » annonce une pastille qui n’est pas dessinée`).toBe(true);
  }
});

test('QUINZE FAMILLES — sport et stades, écoles, gares et aéroports compris', async ({ page }) => {
  /* Trois catégories de sa liste n'existaient nulle part : « des haltères
     pour les salles de sport », « un avion pour les aéroports, un train pour
     les gares ». Puis POI-6 (01/09) : « les écoles et les stades ne sont
     pas affichés en tant que POI » — la famille Écoles est née, les stades
     ont rejoint le sport. Encore fallait-il pouvoir les CHERCHER. */
  await ouvrirCarte(page);
  await ouvrir(page);
  await expect(page.locator('.poi-famille')).toHaveCount(15);
  await expect(page.locator('.poi-famille[data-cle="sport"]')).toBeVisible();
  await expect(page.locator('.poi-famille[data-cle="ecole"]')).toBeVisible();
  await expect(page.locator('.poi-famille[data-cle="transport"]')).toBeVisible();
  await expect(page.locator('.poi-famille[data-cle="sante"]')).toBeVisible();
});

test('LA FICHE D’UN LIEU DIT CE QU’ON EN SAIT, et propose d’y aller', async ({ page }) => {
  /* Armelin, 31/08 : « il y a juste écrit un texte pour indiquer le nom de
     l'enseigne ou le type de POI, mais ce serait bien d'afficher une fenêtre
     avec du détail sur le POI ainsi qu'un bouton permettant de configurer
     directement un trajet pour y aller ou pour l'ajouter en favoris. »
     LE DÉTAIL NE COÛTE AUCUNE REQUÊTE : les étiquettes étaient déjà dans la
     réponse ; on les jetait après avoir lu le nom. */
  await ouvrirCarte(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [{
      type: 'node', id: 1, lat: 48.8566, lon: 2.3522,
      tags: {
        amenity: 'restaurant', name: 'Le Bistrot',
        'addr:housenumber': '12', 'addr:street': 'rue de la Paix',
        'addr:city': 'Paris', phone: '+33 1 42 60 30 30',
        opening_hours: 'Mo-Fr 12:00-14:00; Su off',
        website: 'https://le-bistrot.example', wheelchair: 'yes',
      },
    }] }),
  }));
  await ouvrir(page);
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await poser(page, 2.3522, 48.8566);
  await expect(page.locator('.poi-filtre-etat')).toContainText('1 lieu', { timeout: 15_000 });

  await page.locator('.poi-bulle').click(); // replier le panneau
  await page.locator('#carte canvas.maplibregl-canvas').click({
    position: await page.evaluate(() => {
      const c = (window as unknown as { __carte: {
        project(l: [number, number]): { x: number; y: number };
      } }).__carte;
      const p = c.project([2.3522, 48.8566]);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    }),
  });

  const fiche = page.locator('.poi-fiche');
  await expect(fiche).toBeVisible({ timeout: 10_000 });
  await expect(fiche).toContainText('Le Bistrot');
  await expect(fiche).toContainText('12 rue de la Paix, Paris');
  // LES HORAIRES SONT EN FRANÇAIS, sans conclure « ouvert » : voir le module.
  await expect(fiche).toContainText('du lundi au vendredi de 12 h 00 à 14 h 00');
  await expect(fiche).toContainText('dimanche fermé');
  // LE NUMÉRO SE COMPOSE D'UN DOIGT — en voiture, on ne recopie pas.
  await expect(fiche.locator('a[href="tel:+33142603030"]')).toBeVisible();
  /* UN LIEN EXTERNE NE PARTAGE RIEN : `noreferrer` empêche le site
     d'apprendre d'où vient la visite. */
  await expect(fiche.locator('a[href^="https://le-bistrot"]'))
    .toHaveAttribute('rel', /noreferrer/);
  await expect(fiche).toContainText('Accès fauteuil');
  // ET LA SOURCE EST DITE : ce qui manque manque à la carte.
  await expect(fiche).toContainText('OpenStreetMap');

  // LES DEUX BOUTONS DEMANDÉS.
  await expect(fiche.getByRole('button', { name: /Itinéraire vers Le Bistrot/ })).toBeVisible();
  const favori = fiche.getByRole('button', { name: 'Ajouter aux favoris' });
  await favori.click();
  /* LA LISTE SE CHOISIT (FAVORIS-4, 03/09) — c'est le retour d'Armelin du
     03/09 : « on n'a pas la possibilité de choisir directement dans quelle
     catégorie l'enregistrer ». */
  await fiche.getByRole('button', { name: '🍽️ Restaurants' }).click();
  /* LE BOUTON DIT CE QU'IL A FAIT : sans cela, on ne sait pas si le clic a
     porté, et l'on presse deux fois. */
  await expect(fiche.getByRole('button', { name: 'Ajouté aux favoris — Restaurants' }))
    .toBeDisabled();
});

test.describe('en thème sombre', () => {
  test.use({ colorScheme: 'dark' });

  test('LA FICHE NE S’ÉCRIT PLUS TON SUR TON', async ({ page }) => {
    /* FICHE-2 (31/08). Armelin, sur téléphone : « il est affiché dans un
       encart blanc avec une écriture claire […] c'est écrit ton sur ton. »
       MESURÉ : fond rgb(255,255,255) — le blanc EN DUR de maplibre-gl.css —
       sous un texte rgb(240,242,245) venu de nos variables. Le défaut ne se
       voyait qu'en sombre : sur son téléphone, pas dans mes captures
       claires. On mesure le CONTRASTE réel, pas la présence d'une règle. */
    await ouvrirCarte(page);
    await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ elements: [{
        type: 'node', id: 1, lat: 48.8566, lon: 2.3522,
        tags: { amenity: 'restaurant', name: 'Le Bistrot',
          opening_hours: 'Mo-Fr 12:00-14:00; Su off' },
      }] }),
    }));
    await ouvrir(page);
    await page.locator('.poi-famille[data-cle="restaurant"]').click();
    await poser(page, 2.3522, 48.8566);
    await expect(page.locator('.poi-filtre-etat')).toContainText('1 lieu', { timeout: 15_000 });
    await page.locator('.poi-bulle').click();
    await page.locator('#carte canvas.maplibregl-canvas').click({
      position: await page.evaluate(() => {
        const c = (window as unknown as { __carte: {
          project(l: [number, number]): { x: number; y: number };
        } }).__carte;
        const q = c.project([2.3522, 48.8566]);
        return { x: Math.round(q.x), y: Math.round(q.y) };
      }),
    });
    await expect(page.locator('.poi-fiche')).toBeVisible({ timeout: 10_000 });
    const m = await page.evaluate(() => {
      const luminance = (rgb: string): number => {
        const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
        return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
      };
      const fond = getComputedStyle(document.querySelector('.maplibregl-popup-content')!)
        .backgroundColor;
      const texte = getComputedStyle(document.querySelector('.poi-fiche-nom')!).color;
      return { ecart: Math.abs(luminance(fond) - luminance(texte)) };
    });
    expect(m.ecart, 'le texte et le fond de la bulle se confondent')
      .toBeGreaterThan(0.4);
    /* ET LES HORAIRES SONT EN LIGNES (point 1) : un jour par ligne, pas une
       phrase d'un seul tenant. */
    await expect(page.locator('.poi-fiche-horaires > span')).toHaveCount(2);
  });
});

test('LES PASTILLES DU FILTRE PORTENT LE DESSIN DE LA CARTE', async ({ page }) => {
  /* POI-5 (31/08) : « les POI associés sont encore écrits avec un rond de
     couleur au lieu de leur logo dédié comme c'est le cas sur la carte. »
     La pastille du filtre et celle de la carte sont LE MÊME dessin — c'est
     ce qui fait du panneau une légende. */
  await ouvrirCarte(page);
  await ouvrir(page);
  // Chaque pastille porte un SVG — plus un simple rond peint en CSS.
  await expect(page.locator('.poi-famille .poi-pastille svg')).toHaveCount(15);
  // Et le motif est distinctif : la santé porte sa croix (un path plein).
  const croix = page.locator('.poi-famille[data-cle="sante"] .poi-pastille svg path');
  await expect(croix.first()).toBeAttached();
});


test('LA FICHE RESTE À L’ÉCRAN quand la carte bougeait sous elle', async ({ page }) => {
  /* FICHE-3 (01/09). Armelin, sur mobile : « si le POI est situé à droite de
     l'écran, il arrive que la fenêtre s'affiche hors champ et le bouton
     fermer est alors inaccessible ». La bulle s'ancre bien à l'OUVERTURE —
     c'est le déplacement qui l'emmenait dehors, puisqu'elle suit son point.
     Le clic recadre désormais le lieu sous le centre : on MESURE que la
     fiche et sa croix tiennent dans l'écran, même pour un point collé au
     bord droit. */
  await page.setViewportSize({ width: 375, height: 812 });
  await ouvrirCarte(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [{
      type: 'node', id: 1, lat: 48.8566, lon: 2.3620,
      tags: { amenity: 'restaurant', name: 'Le Bord Droit',
        opening_hours: 'Mo-Su 09:00-19:00', cuisine: 'italian' },
    }] }),
  }));
  await ouvrir(page);
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await poser(page, 2.3600, 48.8566);
  await expect(page.locator('.poi-filtre-etat')).toContainText('1 lieu', { timeout: 15_000 });
  await page.locator('.poi-bulle').click();
  const p = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      project(l: [number, number]): { x: number; y: number };
    } }).__carte;
    const q = c.project([2.3620, 48.8566]);
    return { x: Math.min(374, Math.round(q.x)), y: Math.round(q.y) };
  });
  await page.locator('#carte canvas.maplibregl-canvas').click({ position: p });
  await expect(page.locator('.poi-fiche')).toBeVisible({ timeout: 10_000 });
  // Le recadrage prend 350 ms : on mesure APRÈS, pas pendant.
  await page.waitForTimeout(700);
  const g = await page.evaluate(() => {
    const bulle = document.querySelector('.maplibregl-popup-content')!.getBoundingClientRect();
    const croix = document.querySelector('.maplibregl-popup-close-button')!.getBoundingClientRect();
    return {
      dedans: bulle.left >= 0 && bulle.right <= window.innerWidth
        && bulle.top >= 0 && bulle.bottom <= window.innerHeight,
      croixDedans: croix.right <= window.innerWidth && croix.top >= 0,
    };
  });
  expect(g.dedans, 'la fiche sort de l’écran').toBe(true);
  expect(g.croixDedans, 'la croix de fermeture est inaccessible').toBe(true);

  /* ET LES DEUX NOUVEAUTÉS DE LA FICHE, au passage : l'état d'ouverture (sur
     une expression simple, donc évaluable) et la cuisine en français. */
  await expect(page.locator('.poi-fiche-ouvert')).toContainText(/Ouvert|Ferme bientôt|Fermé/);
  await expect(page.locator('.poi-fiche')).toContainText('italienne');
  await expect(page.locator('.poi-fiche')).not.toContainText('italian');
});

test('LE « PARTAGE FACILE » fait un lien qui rouvre la fiche', async ({ page, context }) => {
  /* « Inclure un lien permettant de partager l'adresse à quelqu'un
     d'autre. » Les coordonnées vivent dans le FRAGMENT #, jamais envoyé au
     serveur — et ce sont des coordonnées WGS84, pas un code maison : elles
     s'ouvrent partout. */
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  /* SANS feuille de partage système : Chromium de bureau en a une, et elle
     avalerait le geste. On mesure le REPLI presse-papiers, qui est le chemin
     vérifiable — la feuille système, elle, appartient au système. */
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
  });
  await ouvrirCarte(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [{
      type: 'node', id: 1, lat: 48.8566, lon: 2.3522,
      tags: { amenity: 'restaurant', name: 'Chez Paul' },
    }] }),
  }));
  await ouvrir(page);
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await poser(page, 2.3522, 48.8566);
  await expect(page.locator('.poi-filtre-etat')).toContainText('1 lieu', { timeout: 15_000 });
  await page.locator('.poi-bulle').click();
  await page.locator('#carte canvas.maplibregl-canvas').click({
    position: await page.evaluate(() => {
      const c = (window as unknown as { __carte: {
        project(l: [number, number]): { x: number; y: number };
      } }).__carte;
      const q = c.project([2.3522, 48.8566]);
      return { x: Math.round(q.x), y: Math.round(q.y) };
    }),
  });
  await expect(page.locator('.poi-fiche')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Partager Chez Paul/ }).click();
  /* Par la CLASSE, pas par le rôle : l'aria-label du bouton reste « Partager
     Chez Paul » pendant que son texte visible dit « Lien copié ! » — c'est
     voulu, le lecteur d'écran garde l'intention du bouton. */
  await expect(page.locator('.poi-fiche-partager')).toHaveText('Lien copié !');
  const lien = await page.evaluate(() => navigator.clipboard.readText());
  expect(lien).toContain('#lieu=2.352200,48.856600,Chez%20Paul');

  /* ET LE LIEN S'OUVRE : la carte se centre, la fiche est là — celui qui
     reçoit n'a rien à chercher. */
  await page.goto(lien);
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.poi-fiche')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.poi-fiche')).toContainText('Chez Paul');
});

test('CLIQUER SUR UN POINT NE REFERME RIEN — le va-et-vient est préservé', async ({ page }) => {
  /* ERGO-4 (02/09). Un clic DANS LE VIDE referme les volets, à la demande
     d'un collègue d'Armelin. Mais la règle qu'elle remplace protégeait un
     usage réel, écrit noir sur blanc le 27/08 : « on coche une couche, on
     inspecte un point, on en coche une autre ». Refermer au premier POI
     cliqué aurait cassé ce va-et-vient.
     D'OÙ LA FORMULATION EXACTE — « dans le vide » — et ce parcours, qui garde
     l'autre moitié de la règle. */
  await ouvrirCarte(page);
  await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: 'application/json',
    body: JSON.stringify({ elements: [{
      type: 'node', id: 1, lat: 48.8566, lon: 2.3600,
      tags: { amenity: 'restaurant', name: 'Le Va-et-Vient' },
    }] }),
  }));
  await ouvrir(page);
  await page.locator('.poi-famille[data-cle="restaurant"]').click();
  await poser(page, 2.3600, 48.8566);
  await expect(page.locator('.poi-filtre-etat')).toContainText('1 lieu', { timeout: 15_000 });

  // Le menu des réglages est ouvert : c'est lui qu'on ne veut pas perdre.
  await ouvrirMenu(page);
  await expect(page.locator('details.reglages[open]')).toHaveCount(1);

  const p = await page.evaluate(() => {
    const c = (window as unknown as { __carte: {
      project(l: [number, number]): { x: number; y: number };
    } }).__carte;
    const q = c.project([2.3600, 48.8566]);
    return { x: Math.round(q.x), y: Math.round(q.y) };
  });
  await page.locator('#carte canvas.maplibregl-canvas').click({ position: p });

  /* LE POINT S'OUVRE, ET LE MENU RESTE : les deux moitiés de la règle. */
  await expect(page.locator('.poi-fiche')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('details.reglages[open]'),
    'cliquer un point a refermé le menu — le va-et-vient est cassé').toHaveCount(1);
});

test.describe('TEMPS-POI-1', () => {
  test.use({ permissions: ['geolocation'], geolocation: { longitude: 2.34, latitude: 48.85 } });

  test('le temps de trajet se demande PAR MODE — jamais d’office, jamais sans position', async ({ page }) => {
    /* ARMELIN, 04/09 : « quand je clique sur un POI, ça devrait afficher le
       temps de trajet de ma position jusqu'à ce POI si j'y allais en
       voiture, à pied, vélo ou moto ». QUATRE MODES, DEUX REQUÊTES AU PLUS,
       ZÉRO D'OFFICE — les quotas sont un bien commun, et ce parcours COMPTE
       les requêtes. */
    const itineraires: string[] = [];
    await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
      itineraires.push(route.request().url());
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        geometry: { type: 'LineString', coordinates: [[2.34, 48.85], [2.3522, 48.8566]] },
        distance: 5_200, duration: 780,
      }) });
    });
    await ouvrirCarte(page);
    await page.route('**overpass.openstreetmap.fr**', (route) => route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ elements: [{
        type: 'node', id: 1, lat: 48.8566, lon: 2.3522,
        tags: { amenity: 'restaurant', name: 'Le Bistrot' },
      }] }),
    }));
    await ouvrir(page);
    await page.locator('.poi-famille[data-cle="restaurant"]').click();
    await poser(page, 2.3522, 48.8566);
    await expect(page.locator('.poi-filtre-etat')).toContainText('1 lieu', { timeout: 15_000 });
    await page.locator('.poi-bulle').click();
    await page.locator('#carte canvas.maplibregl-canvas').click({
      position: await page.evaluate(() => {
        const c = (window as unknown as { __carte: {
          project(l: [number, number]): { x: number; y: number };
        } }).__carte;
        const q = c.project([2.3522, 48.8566]);
        return { x: Math.round(q.x), y: Math.round(q.y) };
      }),
    });
    await expect(page.locator('.poi-fiche')).toBeVisible({ timeout: 10_000 });

    /* OUVRIR EST GRATUIT : aucune requête d'itinéraire n'est partie. */
    expect(itineraires).toHaveLength(0);

    /* SANS POSITION, PAS DE PROMESSE : le geste renvoie au bouton qui la
       donne — jamais une requête depuis un point inventé. */
    const etat = page.locator('.poi-fiche-temps-etat');
    await page.getByRole('button', { name: 'Temps de trajet en voiture' }).click();
    await expect(etat).toContainText('Me localiser');
    expect(itineraires).toHaveLength(0);

    /* On se localise (le bouton MapLibre), puis chaque mode répond. */
    await page.locator('.maplibregl-ctrl-geolocate').click();

    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Temps de trajet en voiture' }).click();
      return etat.textContent();
    }, { timeout: 10_000 }).toContain('en voiture');
    await expect(etat).toContainText('13 min');
    await expect(etat).toContainText('5,2 km');
    expect(itineraires).toHaveLength(1);

    /* LE SUIVI VERROUILLE LA CAMÉRA sur la position : chaque tique GPS
       ramènerait la fiche sous les contrôles du coin. Un second appui coupe
       le suivi (le cycle du bouton MapLibre — leçon DEST-1), puis on ramène
       la vue sur le lieu, comme le ferait l'usager. */
    await page.locator('.maplibregl-ctrl-geolocate').click();
    await page.evaluate(() => {
      (window as unknown as { __carte: { easeTo(o: object): void } })
        .__carte.easeTo({ center: [2.3522, 48.8566], offset: [0, 120], duration: 0 });
    });

    /* La moto PARTAGE la voiture : même moteur, zéro requête de plus. */
    await page.getByRole('button', { name: 'Temps de trajet à moto' }).click();
    await expect(etat).toContainText('à moto');
    expect(itineraires).toHaveLength(1);

    /* Le vélo se déduit du chemin piéton — une seconde requête, et le mot
       « estimation » se dit. */
    await page.getByRole('button', { name: 'Temps de trajet à vélo' }).click();
    await expect(etat).toContainText('à vélo');
    await expect(etat).toContainText('estimation');
    expect(itineraires).toHaveLength(2);

    /* Et le piéton la réutilise. */
    await page.getByRole('button', { name: 'Temps de trajet à pied' }).click();
    await expect(etat).toContainText('à pied');
    expect(itineraires).toHaveLength(2);
  });
});
