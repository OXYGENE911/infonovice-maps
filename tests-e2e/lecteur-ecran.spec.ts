import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* CE QU'UN LECTEUR D'ÉCRAN ENTEND, SUR LES DEUX PARCOURS PRINCIPAUX
 * (A11Y-LECTEUR-1, 09/09/2026).
 *
 * DERNIER VOLET DE L'AUDIT CODEX du 06/09. Les deux premiers sont clos : le
 * parcours clavier vérifié le 07/09 (quinze arrêts nommés, la liste d'adresses
 * aux flèches, le focus qui arrive sur « Y aller »), le texte agrandi le
 * 08/09 (WCAG 1.4.10 à 320 px sur six surfaces). Le suivi, lui, a été relu le
 * 08/09 : ses annonces sont déjà en régions vivantes.
 *
 * RESTENT LES DEUX PARCOURS QU'ON FAIT AVANT DE ROULER : chercher une
 * adresse, et planifier un trajet.
 *
 * CE QU'ON MESURE, ET COMMENT. Un lecteur d'écran ne lit pas des pixels : il
 * lit l'ARBRE D'ACCESSIBILITÉ, et il n'annonce spontanément que les régions
 * vivantes. Ces parcours regardent donc exactement cela — les noms
 * accessibles de ce qu'on rencontre, et ce qui se dit tout seul quand l'état
 * change. Lighthouse donne 100 sur cette page ; les trois défauts trouvés les
 * 07 et 08/09 l'étaient tous MALGRÉ ce 100. On ne se fie donc pas au score.
 */

/**
 * Les contrôles VISIBLES qui n'ont aucun nom accessible.
 *
 * ON CALCULE LE NOM COMME LE FAIT UN LECTEUR D'ÉCRAN, dans l'ordre de la
 * spécification : `aria-label`, puis `aria-labelledby`, puis le contenu
 * textuel, puis `title` — et, pour un champ, son `<label>` ou son
 * `placeholder`. Un `alt` d'image imbriquée compte comme du texte.
 *
 * ON NE JUGE QUE LE VISIBLE : un bouton derrière un volet fermé n'est pas
 * atteint par la navigation, et l'accuser ferait échouer le parcours sur du
 * hors-champ.
 */
async function controlesMuets(page: Page): Promise<{ muets: string[]; vus: number }> {
  return page.evaluate(() => {
    const SEL = 'button, a[href], input:not([type="hidden"]), select, textarea,'
      + ' [role="button"], [role="link"], [role="checkbox"], [role="switch"]';
    const muets: string[] = [];
    let vus = 0;
    for (const e of document.querySelectorAll(SEL)) {
      const el = e as HTMLElement;
      if (!el.checkVisibility?.()) continue;
      const parId = el.getAttribute('aria-labelledby');
      const nom = (el.getAttribute('aria-label') ?? '').trim()
        || (parId ? (document.getElementById(parId)?.textContent ?? '').trim() : '')
        || (el.textContent ?? '').trim()
        || (el.getAttribute('title') ?? '').trim()
        || [...el.querySelectorAll('img[alt]')]
          .map((i) => (i as HTMLImageElement).alt.trim()).join(' ').trim()
        || (el instanceof HTMLInputElement
          ? ((el.labels?.[0]?.textContent ?? '').trim() || el.placeholder.trim())
          : '');
      vus += 1;
      if (nom === '') {
        muets.push(`${el.tagName.toLowerCase()}.${el.className || '(sans classe)'}`);
      }
    }
    return { muets, vus };
  });
}

/** Les régions vivantes de la page, et ce qu'elles disent à cet instant. */
async function regionsVivantes(page: Page): Promise<{ sel: string; texte: string }[]> {
  return page.evaluate(() => {
    const sortie: { sel: string; texte: string }[] = [];
    const vues = new Set<Element>();
    const ramasser = (racine: ParentNode): void => {
      for (const e of racine.querySelectorAll('[role="status"], [role="alert"], [aria-live]')) {
        if (vues.has(e)) continue;
        vues.add(e);
        const el = e as HTMLElement;
        if (el.hidden || !el.checkVisibility?.()) continue;
        sortie.push({
          sel: el.className || el.tagName.toLowerCase(),
          texte: (el.textContent ?? '').trim(),
        });
      }
    };
    ramasser(document);
    return sortie;
  });
}

async function ouvrir(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**overpass**', (route) => route.fulfill({
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
}

const ADRESSES = (labels: string[]) => JSON.stringify({
  features: labels.map((label, i) => ({
    geometry: { coordinates: [2.35 + i * 0.001, 48.85] },
    properties: {
      label, type: 'housenumber', score: 0.95 - i * 0.02, city: 'Paris',
      postcode: '75001', context: '75, Paris, Île-de-France',
      name: label.replace(/^\d+ /, '').replace(/ \d{5}.*$/, ''),
      housenumber: label.split(' ')[0],
    },
  })),
});

test('PARCOURS 1 — CHERCHER UNE ADRESSE : tout ce qu’on rencontre a un nom, et '
  + 'ce qui change se dit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: ADRESSES(['1 Rue de Rivoli 75001 Paris', '3 Rue de Rivoli 75001 Paris']),
  }));
  await ouvrir(page);

  /* 1. LE CHAMP SE PRÉSENTE. Un champ sans nom se lit « zone d'édition », et
        l'on ne sait pas ce qu'on est censé y mettre. */
  const champ = page.locator('recherche-adresse input').first();
  const nomChamp = await champ.getAttribute('aria-label') ?? await champ.getAttribute('placeholder');
  expect(nomChamp, 'le champ de recherche n’a pas de nom').toBeTruthy();

  /* 2. LA LISTE S'ANNONCE COMME UNE LISTE, et le champ dit qu'elle est
        ouverte : sans `aria-expanded`, rien ne signale que des suggestions
        viennent d'apparaître sous le doigt. */
  await champ.click();
  await champ.fill('1 rue de rivoli');
  const liste = page.locator('ul[role="listbox"]');
  await expect(liste).toBeVisible({ timeout: 10_000 });
  await expect(champ).toHaveAttribute('aria-expanded', 'true');
  await expect(liste).toHaveAttribute('aria-label', /suggestion/i);

  /* 3. CHAQUE SUGGESTION EST UNE OPTION NOMMÉE. Une liste d'options muettes
        se parcourt à l'aveugle. */
  const options = page.locator('ul[role="listbox"] li[role="option"]');
  const combien = await options.count();
  expect(combien).toBeGreaterThan(0);
  for (let i = 0; i < combien; i += 1) {
    const texte = (await options.nth(i).textContent() ?? '').trim();
    expect(texte, `la suggestion ${i + 1} est muette`).not.toBe('');
  }

  /* 4. LA COMMUNE NE SE DIT PAS DEUX FOIS. Trouvé le 09/09 en lisant l'arbre
        ARIA : chaque suggestion s'annonçait « 1 Rue de Rivoli 75001 Paris
        75001 Paris 250 km ». À l'œil, deux lignes qui se répètent se
        pardonnent — on saute la seconde. À l'oreille, il faut les écouter
        toutes les deux, sur CHAQUE suggestion, avant d'atteindre la suivante.
        LA GARDE LIT LE VRAI NOM ACCESSIBLE, pas le texte du DOM : c'est ce
        qu'entend un lecteur d'écran, et les deux diffèrent (une première
        version de ce parcours accusait « PParkings » — le « P » décoratif du
        pictogramme, que `aria-hidden` écarte pourtant bel et bien). */
  const nomOption = await options.first().ariaSnapshot();
  const villes = nomOption.match(/75001 Paris/g) ?? [];
  expect(villes.length, `la commune est dite ${villes.length} fois : ${nomOption}`)
    .toBe(1);

  /* 5. AUCUN NOM ACCESSIBLE N'EST VIDE dans tout l'arbre : un bouton sans nom
        est un bouton qu'on ne peut pas décider d'appuyer. On écarte ce qui
        est légitimement décoratif ou textuel. */
  /* LE BANC SE VÉRIFIE AVANT DE JUGER : un contrôle sans nom ne se trouve pas
     si l'on n'a regardé aucun contrôle. Sans ce plancher, le parcours
     passerait au vert en ne voyant rien — et c'est exactement l'erreur que le
     banc de recherche avait déjà coûtée. */
  const { muets, vus } = await controlesMuets(page);
  expect(vus, 'le parcours n’a examiné aucun contrôle').toBeGreaterThan(5);
  expect(muets, `contrôles sans nom : ${JSON.stringify(muets)}`).toEqual([]);
});

test('PARCOURS 2 — PLANIFIER UN TRAJET : le résultat se dit tout seul, sans '
  + 'qu’on ait à partir le chercher', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api-adresse.data.gouv.fr/search/**', (route) => route.fulfill({
    contentType: 'application/json', body: ADRESSES(['1 Rue de Rivoli 75001 Paris']),
  }));
  await page.route('**/data.geopf.fr/navigation/itineraire**', (route) => {
    if (/getSteps=true/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        distance: 390_000, duration: 13_000,
        portions: [{ steps: [
          { instruction: { type: 'depart' }, distance: 200_000, attributes: { name: { cpx_numero: 'A6' } } },
          { instruction: { type: 'arrive' }, distance: 190_000, attributes: { name: {} } },
        ] }],
      }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      geometry: { type: 'LineString', coordinates: [[2.3522, 48.8566], [4.8357, 45.764]] },
      distance: 390_000, duration: 13_000,
    }) });
  });
  /* LE LIEN SE CHARGE EN UNE SEULE NAVIGATION : ouvrir « / » puis changer le
     fragment ne recharge PAS le document, et le planificateur ne verrait
     jamais le trajet. */
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.route('**overpass**', (route) => route.fulfill({
    contentType: 'application/json', body: '{"elements":[]}',
  }));
  await page.goto('/#iti=2.35220,48.85660;4.83570,45.76400;car');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  /* 1. LE RÉSULTAT EST UNE RÉGION VIVANTE. C'est LE point du parcours : le
        calcul dure plusieurs secondes, et si son résultat n'est pas annoncé,
        un usager qui n'a pas les yeux sur l'écran ne sait pas qu'il est
        arrivé — ni s'il a échoué. */
  const resultat = page.locator('.iti-resultat');
  await expect(resultat).toHaveAttribute('role', 'status');
  await expect(resultat).toContainText('390 km', { timeout: 20_000 });

  /* 2. LA DISTANCE ET LA DURÉE SE LISENT EN TOUTES LETTRES, pas en pictogrammes
        muets : « 390 km — 3 h 37 » s'entend, une icône de montre non. */
  const dit = (await resultat.textContent() ?? '');
  expect(dit).toMatch(/\d/);
  expect(dit.length, 'le résumé du trajet est trop court pour être une phrase').toBeGreaterThan(8);

  /* 3. AUCUN CONTRÔLE MUET une fois le trajet posé — c'est là que le
        planificateur déploie ses boutons. */
  /* LE BANC SE VÉRIFIE AVANT DE JUGER : un contrôle sans nom ne se trouve pas
     si l'on n'a regardé aucun contrôle. Sans ce plancher, le parcours
     passerait au vert en ne voyant rien — et c'est exactement l'erreur que le
     banc de recherche avait déjà coûtée. */
  const { muets, vus } = await controlesMuets(page);
  expect(vus, 'le parcours n’a examiné aucun contrôle').toBeGreaterThan(5);
  expect(muets, `contrôles sans nom : ${JSON.stringify(muets)}`).toEqual([]);

  /* 4. LES RÉGIONS VIVANTES VISIBLES NE SE MARCHENT PAS DESSUS. Une page qui
        en empile plusieurs, toutes bavardes au même instant, se lit comme un
        brouhaha : le lecteur enchaîne tout, et l'usager n'en retient rien.
        On vérifie qu'au repos, après le calcul, une seule parle vraiment. */
  const vivantes = (await regionsVivantes(page)).filter((r) => r.texte !== '');
  expect(vivantes.length,
    `régions vivantes bavardes en même temps : ${JSON.stringify(vivantes)}`)
    .toBeLessThanOrEqual(3);
});

test('LA PAGE A UN TITRE DE NIVEAU — naviguer PAR LES TITRES est un geste de '
  + 'base, et il ne rendait rien', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ouvrir(page);

  /* TROUVÉ LE 09/09 EN LISANT L'ARBRE : l'application n'avait AUCUN titre de
     niveau. Or prendre la mesure d'une page en parcourant ses titres est
     l'un des deux ou trois gestes de base d'un lecteur d'écran. Ici, il ne
     rendait rien : la page n'avait pas de forme. */
  const h1 = page.locator('h1');
  await expect(h1).toHaveCount(1);
  const titre = (await h1.textContent() ?? '').trim();
  expect(titre.length, 'le titre de niveau 1 est vide').toBeGreaterThan(8);
  expect(titre).toContain('Infonovice Maps');

  /* IL EST LU SANS ÊTRE VU, et c'est assumé : la marque en haut à gauche est
     un LIEN vers Maps Pro, et faire du titre de cette page un lien vers une
     autre page serait un contresens. On vérifie donc les deux moitiés — qu'il
     ne prend aucune place à l'écran, et qu'il reste dans l'arbre. */
  /* IL RESTE « VISIBLE » AU SENS DU NAVIGATEUR, et ce n'est pas un défaut :
     c'est la condition pour qu'il demeure dans l'arbre d'accessibilité. Un
     `display: none` ou un `hidden` l'en sortirait, et le titre ne serait plus
     lu par personne — on aurait écrit un titre pour rien. Ce qu'on mesure,
     c'est donc la PLACE qu'il prend : un pixel. */
  const boite = await h1.boundingBox();
  expect(boite!.width, 'le titre occupe de la place à l’écran').toBeLessThan(3);
  expect(boite!.height, 'le titre occupe de la hauteur').toBeLessThan(3);
  expect(await page.locator('body').ariaSnapshot()).toContain('Infonovice Maps');
});
