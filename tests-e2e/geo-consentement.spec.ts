import { test, expect, type Page } from '@playwright/test';
import { simulerTuiles, simulerCommunes } from './tuiles-simulees';

/* CHERCHER AUTOUR DE SOI, SUR DEMANDE (GEO-1, 03/09).
 *
 * ARMELIN, la nuit du 03/09 : « pour la décision de géolocalisation
 * automatique, on oublie pour le moment, ou alors on affiche un message
 * explicite pendant la recherche pour demander le consentement de la personne
 * à se localiser s'il souhaite rechercher autour de lui ? »
 *
 * SA SECONDE OPTION EST LA BONNE, ET ELLE NE DEMANDE AUCUNE DÉROGATION. Une
 * géolocalisation À L'OUVERTURE prendrait la position sans que personne n'ait
 * rien demandé : la contrainte 4 du projet l'interdit, et la page « Vie
 * privée » promet le contraire. Une géolocalisation SUR GESTE, précédée de la
 * phrase qui dit à quoi elle sert et où elle part, est un consentement
 * explicite et ponctuel.
 *
 * CE QUE CES PARCOURS GARDENT, ET C'EST LE POINT DÉLICAT : que rien ne parte
 * tant qu'on n'a pas appuyé. Une invitation qui déclencherait la demande du
 * navigateur en paraissant serait exactement ce qu'on refuse. */

async function ouvrirLaRecherche(page: Page): Promise<void> {
  await simulerTuiles(page);
  await simulerCommunes(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  for (const motif of [
    '**/api-adresse.data.gouv.fr/**', '**/data.geopf.fr/geocodage/**',
    '**/recherche-entreprises.api.gouv.fr/**', '**overpass.openstreetmap.fr**',
    '**/data.education.gouv.fr/**', '**/api-lannuaire.service-public.fr/**',
  ]) {
    await page.route(motif, (route) => route.fulfill({
      headers: cors, contentType: 'application/json',
      body: JSON.stringify({ features: [], results: [], elements: [] }),
    }));
  }
  await page.goto('/');
  await expect(page.locator('#carte canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('.entete .recherche input').click();
}

const bloc = (page: Page) => page.locator('.entete .recherche-ici');

test('L’INVITATION PARAÎT, et elle DIT ce que la position devient', async ({ page }) => {
  await ouvrirLaRecherche(page);
  await expect(bloc(page)).toBeVisible();

  /* ELLE VIT DANS LA MOITIÉ HAUTE DE L'ÉCRAN (GEO-2, 03/09). Armelin : « le
     clavier du smartphone se lance et couvre le message […] Toute fonction
     cachée à l'utilisateur est une fonction inutilisable. » Le bloc vivait en
     bas — la moitié que le clavier recouvre précisément. On MESURE sa
     position : un clavier occupe rarement plus de la moitié basse. */
  const place = await bloc(page).evaluate((e) => {
    const b = e.getBoundingClientRect();
    const champ = document.querySelector('.entete .recherche input')!.getBoundingClientRect();
    return { haut: b.top, sousLeChamp: b.top >= champ.bottom, moitie: window.innerHeight / 2 };
  });
  expect(place.sousLeChamp, 'l’invitation doit être SOUS la barre').toBe(true);
  expect(place.haut, 'et dans la moitié haute, hors de portée du clavier')
    .toBeLessThan(place.moitie);
  /* ELLE DIT À QUOI ÇA SERT — sans cela, on demande une permission sans dire
     pourquoi, ce qui est la façon la plus sûre de se la voir refuser. */
  await expect(bloc(page)).toContainText('trier les résultats par distance');
  /* ET ELLE DIT OÙ LA POSITION PART. C'est la partie qu'on serait tenté de
     taire : chercher « autour de moi » ENVOIE le point au service qui recense
     les lieux. Le passer sous silence ferait de cette page une promesse
     fausse, comme celle que RGPD-1 a dû corriger. */
  await expect(bloc(page)).toContainText('OpenStreetMap France');
  await expect(bloc(page)).toContainText('ni enregistrée, ni transmise à personne d’autre');
});

test('RIEN NE PART TANT QU’ON N’A PAS APPUYÉ', async ({ page }) => {
  /* LE CŒUR DE LA DÉCISION D'ARMELIN. Une invitation qui déclencherait la
     demande du navigateur en PARAISSANT serait une géolocalisation d'office
     déguisée en consentement. */
  await ouvrirLaRecherche(page);
  const demandes = await page.evaluate(() => {
    let n = 0;
    const vrai = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      configurable: true,
      value: (...a: unknown[]) => { n += 1; return (vrai as (...x: unknown[]) => void)(...a); },
    });
    Object.defineProperty(window, '__demandes', { configurable: true, get: () => n });
    return n;
  });
  expect(demandes).toBe(0);
  await expect(bloc(page)).toBeVisible();
  await page.locator('.entete .recherche input').fill('Tour Eiffel');
  await page.waitForTimeout(800);
  /* MÊME APRÈS UNE RECHERCHE ENTIÈRE : la position n'est pas demandée. */
  expect(await page.evaluate(() => (window as unknown as { __demandes: number }).__demandes))
    .toBe(0);
});

test('APPUYER DONNE LA POSITION, et l’invitation s’efface', async ({ page }) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ longitude: 2.5762, latitude: 48.8101 });
  await ouvrirLaRecherche(page);
  await bloc(page).getByRole('button', { name: 'Utiliser ma position' }).click();
  /* L'INVITATION A REMPLI SON OFFICE : la redemander à qui vient d'accepter
     serait rendre le consentement insignifiant. */
  await expect(bloc(page)).toBeHidden({ timeout: 10_000 });
});

test('UN REFUS N’EST PAS UNE PANNE, et se dit autrement', async ({ page }) => {
  /* L'usager qui a dit non ne doit pas croire que l'application est cassée —
     et il doit pouvoir continuer à chercher sans sa position. */
  await ouvrirLaRecherche(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      configurable: true,
      value: (_ok: unknown, ko: (e: { code: number; PERMISSION_DENIED: number }) => void) => {
        ko({ code: 1, PERMISSION_DENIED: 1 });
      },
    });
  });
  await bloc(page).getByRole('button', { name: 'Utiliser ma position' }).click();
  const etat = bloc(page).locator('.recherche-ici-etat');
  await expect(etat).toContainText('refusée', { timeout: 10_000 });
  await expect(etat).toContainText('la recherche continue sans elle');
  // ET LE BOUTON REDEVIENT PRESSABLE : on a le droit de changer d'avis.
  await expect(bloc(page).getByRole('button', { name: 'Utiliser ma position' }))
    .toBeEnabled();
});

test('L’INVITATION NE PARAÎT PAS dans les champs du planificateur', async ({ page }) => {
  /* Ils vivent DANS un volet déjà ouvert : y poser un bloc de consentement
     recouvrirait le formulaire qu'on est en train de remplir. C'est la même
     raison qui leur épargne la page plein écran (RECHERCHE-7). */
  await ouvrirLaRecherche(page);
  await page.keyboard.press('Escape');
  await page.locator('.iti > summary').click();
  await page.locator('[data-role="depart"] input').click();
  await expect(page.locator('[data-role="depart"] .recherche-ici')).toBeHidden();
});
