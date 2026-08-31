import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

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
  /* QUATORZE FAMILLES depuis POI-4 : sport, gares et aéroports manquaient à
     la liste d'Armelin. Elles tiennent encore sur un téléphone — et depuis
     qu'elles portent un dessin, elles se reconnaissent plus vite que douze
     étiquettes ne se lisaient. */
  await expect(page.locator('.poi-famille')).toHaveCount(14);
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

test('QUATORZE FAMILLES — sport, gares et aéroports compris', async ({ page }) => {
  /* Trois catégories de sa liste n'existaient nulle part : « des haltères
     pour les salles de sport », « un avion pour les aéroports, un train pour
     les gares ». Encore fallait-il pouvoir les CHERCHER. */
  await ouvrirCarte(page);
  await ouvrir(page);
  await expect(page.locator('.poi-famille')).toHaveCount(14);
  await expect(page.locator('.poi-famille[data-cle="sport"]')).toBeVisible();
  await expect(page.locator('.poi-famille[data-cle="transport"]')).toBeVisible();
  await expect(page.locator('.poi-famille[data-cle="sante"]')).toBeVisible();
});
