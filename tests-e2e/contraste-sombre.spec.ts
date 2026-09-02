import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* LE TEXTE SE LIT EN THÈME SOMBRE, SUR TÉLÉPHONE (HIST-1, 01/09).
 *
 * LE TERRAIN. Armelin, après un essai à pied : « quand je vais chercher la
 * carte dans l'historique c'est écrit ton sur ton sur mobile et je ne peux pas
 * sélectionner le parcours archivé car je ne vois pas ce qu'il y a écrit
 * dessus. »
 *
 * MESURÉ AVANT CORRECTION : la ligne d'un parcours s'affichait en
 * `rgb(0, 0, 0)` sur `rgb(14, 16, 20)` — un contraste de **1,1**. La ligne est
 * un `<label>` auquel aucune règle ne donnait de couleur : elle héritait du
 * NOIR par défaut du navigateur. En thème clair la faute est invisible ; en
 * sombre elle efface le texte.
 *
 * CE PARCOURS NE GARDE PAS QUE CETTE LIGNE. Il balaie TOUT le volet et calcule
 * le contraste réel de chaque texte visible, parce que la faute — un élément
 * qui ne nomme pas sa couleur — peut renaître partout ailleurs, et qu'elle ne
 * se voit pas en thème clair. */

test.use({ colorScheme: 'dark', viewport: { width: 390, height: 780 } });

/** Sème un parcours dans le navigateur, comme l'aurait fait le bilan. */
async function semer(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((ok, ko) => {
      const d = indexedDB.open('infonovice-maps', 2);
      d.onupgradeneeded = () => {
        for (const m of ['preferences', 'favoris']) {
          if (!d.result.objectStoreNames.contains(m)) d.result.createObjectStore(m);
        }
      };
      d.onsuccess = () => {
        const tx = d.result.transaction('preferences', 'readwrite');
        tx.objectStore('preferences').put([{
          id: 't1', departMs: 1_700_000_000_000, titre: 'Domicile → Travail',
          releves: [],
          resume: { dureeMs: 3_600_000, vitesseMaxKmh: 128, vitesseMoyenneKmh: 88,
            arrets: 2, arretMs: 900_000 },
        }, {
          id: 't2', departMs: 1_700_600_000_000, titre: 'Travail → Domicile',
          releves: [],
          resume: { dureeMs: 3_000_000, vitesseMaxKmh: 130, vitesseMoyenneKmh: 95,
            arrets: 0, arretMs: 0 },
        }], 'historique-trajets');
        tx.oncomplete = () => ok();
        tx.onerror = () => ko(tx.error);
      };
      d.onerror = () => ko(d.error);
    });
  });
}

/** Le contraste de chaque texte visible du volet, calculé dans la page. */
async function textesTropPales(
  page: import('@playwright/test').Page, racine: string,
): Promise<{ texte: string; couleur: string; ratio: number }[]> {
  return page.evaluate((sel) => {
    const lire = (s: string): number[] =>
      (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    /* LA LUMINANCE RELATIVE DU WCAG, sans approximation : c'est elle qui
       décide, et une formule « à peu près » laisserait passer exactement le
       cas limite qu'on veut attraper. */
    const lum = (c: number[]): number => {
      const [r, g, b] = c.map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    /* LE FOND EFFECTIF EST CELUI DU PREMIER ANCÊTRE QUI EN PEINT UN : un
       élément transparent n'a pas de fond à lui, et comparer à « transparent »
       ne mesurerait rien. */
    const fondDe = (e: Element): number[] => {
      let n: Element | null = e;
      while (n) {
        const b = getComputedStyle(n).backgroundColor;
        if (b && b !== 'rgba(0, 0, 0, 0)') return lire(b);
        n = n.parentElement;
      }
      return [255, 255, 255];
    };
    const mauvais: { texte: string; couleur: string; ratio: number }[] = [];
    for (const e of document.querySelectorAll<HTMLElement>(`${sel} *`)) {
      /* ON NE JUGE QUE LE TEXTE PROPRE À L'ÉLÉMENT : compter celui des enfants
         accuserait un conteneur pour la couleur de son contenu. */
      const propre = [...e.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim() ?? '').join('');
      if (propre === '' || e.offsetParent === null) continue;
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || Number(s.opacity) < 0.3) continue;
      const a = lum(lire(s.color));
      const b = lum(fondDe(e));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      /* 4,5 : le seuil AA du texte courant, celui que le projet s'impose. */
      if (ratio < 4.5) {
        mauvais.push({
          texte: propre.slice(0, 40), couleur: s.color,
          ratio: Math.round(ratio * 100) / 100,
        });
      }
    }
    return mauvais;
  }, racine);
}

test('L’HISTORIQUE SE LIT EN SOMBRE — et tout le volet avec lui', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await semer(page);
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await ouvrirVolet(page, '.iti');
  await page.getByRole('button', { name: /Historique/ }).click();
  await expect(page.locator('.iti-hist-ligne')).toHaveCount(2, { timeout: 10_000 });

  /* LE TEXTE DU PARCOURS EST LÀ ET IL SE LIT : c'est exactement ce qu'Armelin
     ne voyait pas, et donc ce qu'il ne pouvait pas cocher. */
  await expect(page.locator('.iti-hist-ligne').first()).toContainText('Domicile → Travail');

  const pales = await textesTropPales(page, '.iti-corps');
  expect(pales, `textes sous le seuil AA : ${JSON.stringify(pales)}`).toEqual([]);

  // ET LE PARCOURS SE COCHE VRAIMENT — le but de la lecture.
  await page.locator('.iti-hist-ligne input').first().check();
  await expect(page.locator('.iti-hist-actions')).toBeVisible();
});

test('LA COMPARAISON SE LIT AUSSI — le balayage d’hier ne l’ouvrait pas', async ({ page }) => {
  /* HIST-2 (02/09), deuxième signalement du même défaut : « quand je clique
     sur l'historique pour comparer deux trajets, les textes sont écrits en
     noir sur fond noir en mode sombre ».
     ET C'EST UNE LEÇON SUR MON PROPRE GARDE-FOU : le balayage de HIST-1
     n'OUVRAIT PAS la comparaison, il n'avait donc rien à mesurer dedans. Un
     balayage ne vaut que ce que son parcours a fait paraître à l'écran. */
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await semer(page);
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await ouvrirVolet(page, '.iti');
  await page.getByRole('button', { name: /Historique/ }).click();
  const lignes = page.locator('.iti-hist-ligne');
  await expect(lignes).toHaveCount(2, { timeout: 10_000 });
  await lignes.nth(0).locator('input').check();
  await lignes.nth(1).locator('input').check();
  await page.getByRole('button', { name: 'Comparer' }).click();
  await expect(page.locator('.iti-hist-comparaison table')).toBeVisible();

  const pales = await textesTropPales(page, '.iti-corps');
  expect(pales, `textes sous le seuil AA : ${JSON.stringify(pales)}`).toEqual([]);
});

test('ELLE SE REFERME, ET NE REVIENT PAS TOUTE SEULE', async ({ page }) => {
  /* HIST-3 (02/09). « L'affichage de la comparaison reste et je ne peux pas
     l'enlever même en fermant la page d'historique. Quand je reviens sur
     l'historique, la dernière comparaison reste affichée à l'écran. » */
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await semer(page);
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await ouvrirVolet(page, '.iti');
  await page.getByRole('button', { name: /Historique/ }).click();
  const lignes = page.locator('.iti-hist-ligne');
  await expect(lignes).toHaveCount(2, { timeout: 10_000 });
  await lignes.nth(0).locator('input').check();
  await lignes.nth(1).locator('input').check();
  await page.getByRole('button', { name: 'Comparer' }).click();

  const tableau = page.locator('.iti-hist-comparaison');
  await expect(tableau).toBeVisible();

  // 1. ELLE SE FERME À LA DEMANDE.
  await tableau.getByRole('button', { name: 'Fermer' }).click();
  await expect(tableau).toHaveCount(0);

  // 2. ELLE NE REVIENT PAS QUAND ON REVIENT SUR LA PAGE.
  await page.getByRole('button', { name: 'Comparer' }).click();
  await expect(tableau).toBeVisible();
  await page.getByRole('button', { name: 'Revenir au trajet' }).click();
  await page.getByRole('button', { name: /Historique/ }).click();
  await expect(tableau, 'la comparaison d’hier est encore là').toHaveCount(0);
  /* LA LISTE SE RECONSTRUIT À CHAQUE OUVERTURE (la lecture d'IndexedDB est
     asynchrone) et les cases repartent décochées : on l'attend, plutôt que
     de cocher des éléments que le rendu suivant remplacera. */
  await expect(lignes.nth(0).locator('input')).not.toBeChecked();

  /* 3. ET COCHER AUTRE CHOSE L'EFFACE : ses chiffres portaient sur la
     sélection précédente — les laisser afficherait un écart qui n'existe
     plus. */
  await lignes.nth(0).locator('input').check();
  await lignes.nth(1).locator('input').check();
  await page.getByRole('button', { name: 'Comparer' }).click();
  await expect(tableau).toBeVisible();
  await lignes.nth(1).locator('input').uncheck();
  await expect(tableau, 'un changement de sélection laisse des chiffres périmés')
    .toHaveCount(0);
});
