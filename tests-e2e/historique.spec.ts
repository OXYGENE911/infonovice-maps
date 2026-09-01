import { test, expect } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';
import { ouvrirVolet } from './volets';

/* L'HISTORIQUE DES TRAJETS (STATS-2, 01/09).
 *
 * LA CONCEPTION EST CELLE D'ARMELIN : « cela ne doit pas être fait
 * automatiquement, mais proposé à l'enregistrement à la fin du parcours au
 * moment du récapitulatif […] on retrouverait une section "Historique" avec
 * les parcours enregistrés manuellement afin qu'on puisse les comparer en
 * cochant deux ou plusieurs parcours ». */

/** Sème deux parcours dans le navigateur, comme l'aurait fait le bilan. */
async function semer(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const trajets = [
      /* LE TITRE PORTE UNE ADRESSE RECONNAISSABLE (PARTAGE-1) : sans elle,
         un test de floutage ne prouverait rien — il faut que quelque chose
         PUISSE fuiter pour qu'on établisse que rien ne fuit. */
      { id: 't2', departMs: 1_700_600_000_000,
        titre: 'Le Plessis-Trévise → 12 rue de la Paix, Paris', releves: [],
        resume: { dureeMs: 3_000_000, vitesseMaxKmh: 130,
          vitesseMoyenneKmh: 95, arrets: 0, arretMs: 0 } },
      { id: 't1', departMs: 1_700_000_000_000, titre: '→ Lyon', releves: [],
        resume: { dureeMs: 3_600_000, vitesseMaxKmh: 128,
          vitesseMoyenneKmh: 88, arrets: 2, arretMs: 900_000 } },
    ];
    await new Promise<void>((ok, ko) => {
      const d = indexedDB.open('infonovice-maps', 2);
      d.onupgradeneeded = () => {
        for (const m of ['preferences', 'favoris']) {
          if (!d.result.objectStoreNames.contains(m)) d.result.createObjectStore(m);
        }
      };
      d.onsuccess = () => {
        const tx = d.result.transaction('preferences', 'readwrite');
        tx.objectStore('preferences').put(trajets, 'historique-trajets');
        tx.oncomplete = () => ok();
        tx.onerror = () => ko(tx.error);
      };
      d.onerror = () => ko(d.error);
    });
  });
}

test('LES PARCOURS ENREGISTRÉS SE COMPARENT CÔTE À CÔTE', async ({ page }) => {
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

  /* COMPARER EXIGE DEUX PARCOURS : le bouton reste éteint tant qu'un seul est
     coché — promettre un écart entre un parcours et lui-même serait mentir. */
  const comparer = page.getByRole('button', { name: 'Comparer' });
  await lignes.first().locator('input').check();
  await expect(comparer).toBeDisabled();
  await lignes.nth(1).locator('input').check();
  await expect(comparer).toBeEnabled();

  await comparer.click();
  const tableau = page.locator('.iti-hist-comparaison table');
  await expect(tableau).toBeVisible();
  await expect(tableau).toContainText('Durée du trajet');
  await expect(tableau).toContainText('50 min');
  await expect(tableau).toContainText('1 h 00');

  /* LE MEILLEUR EST DÉSIGNÉ, ET SEULEMENT LÀ OÙ « MEILLEUR » VEUT DIRE
     QUELQUE CHOSE : la durée et les arrêts, jamais la vitesse maximale —
     rouler plus vite n'est pas mieux, et le couronner encouragerait à le
     faire. */
  const couronnes = page.locator('.iti-hist-comparaison td[data-meilleur]');
  await expect(couronnes).toHaveCount(2);
  await expect(couronnes.first()).toContainText('50 min');

  const ligneMax = page.locator('.iti-hist-comparaison tr', { hasText: 'Vitesse maximale' });
  await expect(ligneMax.locator('td[data-meilleur]')).toHaveCount(0);
});

test('OUBLIER UN PARCOURS LE RETIRE POUR DE BON', async ({ page }) => {
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
  await page.locator('.iti-hist-ligne').first().locator('input').check();
  await page.getByRole('button', { name: 'Oublier' }).click();
  await expect(page.locator('.iti-hist-ligne')).toHaveCount(1);

  /* ET LA MÉMOIRE EST VRAIMENT CORRIGÉE : un oubli qui revient au
     rechargement n'est pas un oubli. */
  await expect.poll(async () => page.evaluate(async () => new Promise((res) => {
    const d = indexedDB.open('infonovice-maps', 2);
    d.onsuccess = () => {
      const g = d.result.transaction('preferences').objectStore('preferences')
        .get('historique-trajets');
      g.onsuccess = () => { res(JSON.stringify(g.result ?? [])); };
      g.onerror = () => { res('erreur'); };
    };
    d.onerror = () => { res('erreur'); };
  })), { message: 'le parcours oublié est encore en mémoire' }).not.toContain('"t2"');
});

test('CONTRIBUER MONTRE LE FICHIER, ET AUCUNE ADRESSE N’Y SURVIT', async ({ page }) => {
  /* PARTAGE-1 (01/09). Armelin : « un bouton dédié pour améliorer
     l'algorithme en indiquant aux gens qu'on floute les adresses de départ et
     d'arrivée. D'exposer le fichier à l'utilisateur qui pourra vérifier le
     contenu avant de nous l'envoyer. »
     CE PARCOURS JUGE LA PROMESSE, pas l'intention : il lit le fichier
     RÉELLEMENT proposé et y cherche l'adresse semée plus haut. */
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

  /* LA LIGNE, ELLE, MONTRE BIEN L'ADRESSE : c'est l'historique local, il ne
     quitte pas l'appareil. Le floutage ne concerne QUE ce qu'on donne. */
  await expect(lignes.first()).toContainText('rue de la Paix');

  await lignes.first().locator('input').check();
  await page.getByRole('button', { name: /Contribuer/ }).click();

  const boite = page.locator('.iti-hist-partage');
  await expect(boite).toBeVisible();
  // CE QUI PART ET CE QUI RESTE SONT DITS AVANT LE FICHIER, pas après.
  await expect(boite).toContainText('Ce qui part');
  await expect(boite).toContainText('Ce qui NE part pas');
  await expect(boite).toContainText('elles sont RETIRÉES du fichier');

  const fichier = await boite.locator('.iti-hist-fichier').inputValue();
  expect(fichier, 'la commune de départ ne doit pas survivre').not.toContain('Plessis');
  expect(fichier, 'l’adresse d’arrivée ne doit pas survivre').not.toContain('rue de la Paix');
  /* L'HEURE EST ARRONDIE : à la minute près, deux fichiers d'une même personne
     se recollent. */
  expect(fichier).toMatch(/"departHeure": "\d{4}-\d{2}-\d{2}T\d{2}:00Z"/);
  // ET CE QUI SERT À L'ALGORITHME EST BIEN LÀ, sinon le don ne servirait à rien.
  expect(fichier).toContain('"vitesseMoyenneKmh"');

  /* RIEN NE PART D'ICI : l'application propose un téléchargement et une
     adresse, elle n'expédie pas. Une application qui poste d'elle-même
     n'aurait pas à demander la permission. */
  await expect(boite.locator('.iti-hist-telecharger')).toHaveAttribute('download', /\.json$/);
  await expect(boite).toContainText('contact@infonovice.fr');
  await expect(boite).toContainText('Aucun envoi n’est fait par l’application');

  /* ET LA BOÎTE SE REFERME QUAND LA SÉLECTION CHANGE : le fichier montré ne
     correspondrait plus à ce qui est coché, et un contenu périmé serait pire
     que pas de contenu du tout. */
  await lignes.nth(1).locator('input').check();
  await expect(boite).toBeHidden();
});
