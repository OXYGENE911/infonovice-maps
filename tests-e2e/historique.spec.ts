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
        titre: 'Le Plessis-Trévise → 12 rue de la Paix, Paris',
        /* CELUI-CI PORTE SON ARRIVÉE (HIST-2) : c'est lui qu'on relancera.
           L'autre n'en a pas, comme les parcours gardés avant HIST-2 — et
           c'est exprès : les deux cas doivent se distinguer à l'écran. */
        arrivee: { lon: 2.3316, lat: 48.8687, libelle: '12 rue de la Paix, Paris' },
        releves: [],
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

  /* L'HISTORIQUE VIT DANS LE MENU DEPUIS ERGO-3/4 (02/09) : on le consulte
     SANS avoir planifié quoi que ce soit. Le raccourci demande au DOM où il
     est rangé — un déménagement de plus ne touchera toujours qu'un fichier. */
  await ouvrirVolet(page, '.hist');

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
  /* L'HISTORIQUE VIT DANS LE MENU DEPUIS ERGO-3/4 (02/09) : on le consulte
     SANS avoir planifié quoi que ce soit. Le raccourci demande au DOM où il
     est rangé — un déménagement de plus ne touchera toujours qu'un fichier. */
  await ouvrirVolet(page, '.hist');

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

  /* L'HISTORIQUE VIT DANS LE MENU DEPUIS ERGO-3/4 (02/09) : on le consulte
     SANS avoir planifié quoi que ce soit. Le raccourci demande au DOM où il
     est rangé — un déménagement de plus ne touchera toujours qu'un fichier. */
  await ouvrirVolet(page, '.hist');
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

/* RELANCER LE MÊME TRAJET (HIST-2, 02/09).
 *
 * Armelin, après un essai : « il n'y a aucun moyen de relancer le même trajet
 * depuis l'historique ». Il n'y en avait aucun parce qu'on ne gardait que le
 * TITRE — « Domicile → Travail » ne se recalcule pas. */

test('UN PARCOURS SE RELANCE — et celui qui n’a pas d’arrivée le dit', async ({ page }) => {
  await simulerTuiles(page);
  await simulerCommunes(page);
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await semer(page);
  await page.reload();
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await ouvrirVolet(page, '.hist');
  const lignes = page.locator('.iti-hist-ligne');
  await expect(lignes).toHaveCount(2, { timeout: 10_000 });

  const relancer = page.getByRole('button', { name: 'Relancer' });

  /* LE PARCOURS D'AVANT HIST-2 N'A PAS D'ARRIVÉE : le bouton reste éteint, et
     son infobulle dit pourquoi. Un clic sans effet passerait pour une panne. */
  await lignes.nth(1).locator('input').check();
  await expect(relancer).toBeDisabled();
  await expect(relancer).toHaveAttribute('title', /gardé avant/);

  /* DEUX PARCOURS COCHÉS : on ne repart pas vers deux endroits. */
  await lignes.first().locator('input').check();
  await expect(relancer).toBeDisabled();

  /* UN SEUL, AVEC SON ARRIVÉE : le bouton s'allume. */
  await lignes.nth(1).locator('input').uncheck();
  await expect(relancer).toBeEnabled();

  await relancer.click();

  /* LE VOLET DE L'HISTORIQUE SE REFERME — le planificateur qui s'ouvre
     derrière lui doit se voir. */
  await expect(page.locator('details.hist')).not.toHaveAttribute('open', '');

  /* ET LA DESTINATION PORTE SON NOM, pas ses coordonnées : « itinéraire vers
     2,3316 ; 48,8687 » ne dit à personne vers quoi il va. */
  await expect(page.locator('[data-role="arrivee"] recherche-adresse input'))
    .toHaveValue('12 rue de la Paix, Paris', { timeout: 10_000 });
});
