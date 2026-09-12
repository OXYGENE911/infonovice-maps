import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ENTETES_PREVISUALISATION,
  FEUILLE_PREVISUALISATION,
  PREFIXE_TITRE,
  ROBOTS_PREVISUALISATION,
  estPrevisualisation,
  marquerHtmlPrevisualisation,
} from '../src/lib/previsualisation';

/* LE MARQUAGE DE LA PRÉVERSION (STAGING-1, 13/09/2026).
 *
 * POURQUOI CES TESTS. Les deux dégâts que le marquage empêche sont muets :
 * un testeur AFUVE qui croit être en production ne le dit pas — il signale un
 * bogue qui n'existe pas là où on le cherchera ; une préversion indexée ne se
 * voit qu'au moment où elle apparaît dans un moteur de recherche, trop tard.
 * Rien ne rougit tout seul. D'où des tests sur les fonctions pures, doublés
 * d'une porte sur le `dist/` réel (scripts/verifier-previsualisation.mjs). */

const PAGE = [
  '<!doctype html>',
  '<html lang="fr">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <title>Infonovice Maps — cartographie française et open source</title>',
  '  <meta property="og:title" content="Infonovice Maps">',
  '</head>',
  '<body>',
  '  <h1>Carte</h1>',
  '</body>',
  '</html>',
].join('\n');

describe('estPrevisualisation', () => {
  it('ne s’allume que sur la valeur attendue', () => {
    expect(estPrevisualisation({ INFONOVICE_ENVIRONNEMENT: 'previsualisation' })).toBe(true);
    // Tolérante à la casse et aux espaces : une variable posée à la main dans
    // un terminal en traîne souvent.
    expect(estPrevisualisation({ INFONOVICE_ENVIRONNEMENT: '  Previsualisation ' })).toBe(true);
  });

  it('reste éteinte par défaut — la production est le cas normal', () => {
    expect(estPrevisualisation({})).toBe(false);
    expect(estPrevisualisation({ INFONOVICE_ENVIRONNEMENT: '' })).toBe(false);
    expect(estPrevisualisation({ INFONOVICE_ENVIRONNEMENT: 'production' })).toBe(false);
    // Un synonyme n'est PAS la valeur attendue : mieux vaut un déploiement non
    // marqué qui échoue à la porte qu'un marquage qui s'allume par surprise.
    expect(estPrevisualisation({ INFONOVICE_ENVIRONNEMENT: 'staging' })).toBe(false);
  });
});

describe('marquerHtmlPrevisualisation', () => {
  const marquee = marquerHtmlPrevisualisation(PAGE, 'index.html');

  it('pose l’attribut d’environnement sur <html>, point d’ancrage des sondes', () => {
    expect(marquee).toContain('<html lang="fr" data-environnement="previsualisation">');
  });

  it('préfixe le titre de l’onglet, et LUI SEUL', () => {
    expect(marquee).toContain(`<title>${PREFIXE_TITRE}Infonovice Maps — cartographie française et open source</title>`);
    // og:title n'est pas le titre de la page : le réécrire changerait la
    // vignette de partage sans rien apprendre au testeur qui a l'écran devant
    // lui.
    expect(marquee).toContain('<meta property="og:title" content="Infonovice Maps">');
  });

  it('pose la balise robots noindex dans le <head>', () => {
    expect(marquee).toMatch(/<meta name="robots" content="noindex, nofollow, noarchive">/);
  });

  it('pose le bandeau dans le <body>', () => {
    expect(marquee).toContain('data-previsualisation="cadre"');
    expect(marquee).toContain('ce site n’est pas la production');
  });

  it('lie la feuille, et n’écrit AUCUN style en ligne', () => {
    /* PAYÉ À LA CAPTURE D'ÉCRAN. Le premier jet portait tout en attributs
       `style=`. index.html l'acceptait (`style-src 'self' 'unsafe-inline'`),
       mais les six pages de texte ont une CSP `style-src 'self'` : le
       navigateur jetait le bandeau, qui s'affichait en texte nu en haut à
       gauche. Ce test empêche le retour en arrière. */
    expect(marquee).toContain('<link rel="stylesheet" href="previsualisation.css">');
    const debut = marquee.indexOf('<div class="previsualisation-cadre"');
    const bandeau = marquee.slice(debut, marquee.indexOf('</div>', debut) + 6);
    expect(bandeau).not.toMatch(/style=/);
    expect(bandeau).not.toMatch(/<style/);
  });

  it('est idempotente — un second passage ne double pas le bandeau', () => {
    const deux = marquerHtmlPrevisualisation(marquee, 'index.html');
    expect(deux).toBe(marquee);
  });

  it('ARRÊTE la construction plutôt que de livrer une page non marquée', () => {
    expect(() => marquerHtmlPrevisualisation('<html><head></head></html>', 'cassee.html'))
      .toThrow(/cassee\.html/);
  });
});

describe('la feuille de style du bandeau', () => {
  it('réserve sa place au lieu de la prendre', () => {
    /* MESURÉ AU NAVIGATEUR : posée à `bottom: 0` sans réserve, la pastille
       recouvrait l'attribution MapLibre et l'échelle sur un écran de 390 px.
       L'attribution IGN/OSM est une obligation de licence, pas un ornement. */
    expect(FEUILLE_PREVISUALISATION).toMatch(/--sur-barre-basse:\s*calc\(/);
    expect(FEUILLE_PREVISUALISATION).toMatch(/body\.page\s*\{[^}]*padding-bottom/);
  });

  it('n’intercepte aucun geste', () => {
    expect(FEUILLE_PREVISUALISATION)
      .toMatch(/\.previsualisation-cadre\s*\{[^}]*pointer-events:\s*none/);
  });
});

describe('les deux verrous d’indexation', () => {
  it('robots.txt interdit tout et n’annonce aucun sitemap', () => {
    expect(ROBOTS_PREVISUALISATION).toMatch(/^Disallow: \/$/m);
    expect(ROBOTS_PREVISUALISATION).not.toMatch(/^Allow:/m);
    expect(ROBOTS_PREVISUALISATION).not.toMatch(/Sitemap:/i);
  });

  it('_headers pose X-Robots-Tag sur toutes les URL', () => {
    // Le motif `/*` couvre le domaine personnalisé ET les URL *.pages.dev de
    // chaque déploiement, publiques elles aussi.
    expect(ENTETES_PREVISUALISATION).toMatch(/^\/\*$/m);
    expect(ENTETES_PREVISUALISATION).toMatch(/^\s+X-Robots-Tag: noindex, nofollow, noarchive$/m);
  });

  it('la production, elle, garde son robots.txt ouvert', () => {
    // Garde-fou croisé : si un jour quelqu'un « simplifiait » en écrivant le
    // robots.txt de préversion dans public/, la production cesserait d'être
    // indexée. Ce test le dirait le jour même.
    const prod = readFileSync(resolve(__dirname, '../public/robots.txt'), 'utf-8');
    expect(prod).toMatch(/^Allow: \/$/m);
    expect(prod).not.toMatch(/^Disallow: \/$/m);
  });
});
