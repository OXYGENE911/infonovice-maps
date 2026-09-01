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
  await expect(page.locator('.iti-hist-ligne')).toHaveCount(1, { timeout: 10_000 });

  /* LE TEXTE DU PARCOURS EST LÀ ET IL SE LIT : c'est exactement ce qu'Armelin
     ne voyait pas, et donc ce qu'il ne pouvait pas cocher. */
  await expect(page.locator('.iti-hist-ligne')).toContainText('Domicile → Travail');

  const pales = await textesTropPales(page, '.iti-corps');
  expect(pales, `textes sous le seuil AA : ${JSON.stringify(pales)}`).toEqual([]);

  // ET LE PARCOURS SE COCHE VRAIMENT — le but de la lecture.
  await page.locator('.iti-hist-ligne input').check();
  await expect(page.locator('.iti-hist-actions')).toBeVisible();
});
