import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — script de construction en JS, hors du périmètre de tsc.
import { verifierPrevisualisation } from '../scripts/verifier-previsualisation.mjs';

/* LES CINQ PORTES DÉROBÉES TROUVÉES PAR CODEX (13/09/2026).
 *
 * La première version de la porte cherchait des CHAÎNES : « Disallow: / »
 * quelque part dans robots.txt, « X-Robots-Tag: noindex » quelque part dans
 * _headers, « .previsualisation-cadre » quelque part dans le CSS. La revue
 * Codex a produit cinq dossiers non conformes qu'elle laissait passer. Chacun
 * est devenu un test : ce ne sont pas des hypothèses, ce sont des dossiers
 * qu'on a construits et soumis à la porte.
 *
 * Une porte dont on ne teste que le cas qui passe n'est pas testée. */

const ROBOTS_BON = 'User-agent: *\nDisallow: /\n';
const ENTETES_BON = '/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n';
const CSS_BON = `.previsualisation-cadre { position: fixed; inset: 0; pointer-events: none; }
.previsualisation-pastille { position: absolute; bottom: 0; background: #FFB300; }
`;
const PAGE_BONNE = [
  '<!doctype html>',
  '<html lang="fr" data-environnement="previsualisation">',
  '<head><meta name="robots" content="noindex, nofollow, noarchive">',
  '<title>PRÉVISUALISATION — Test</title>',
  '<link rel="stylesheet" href="previsualisation.css"></head>',
  '<body><div class="previsualisation-cadre" data-previsualisation="cadre"></div></body>',
  '</html>',
].join('\n');

let dossier: string;

/** Écrit un dossier conforme, que chaque test abîme ensuite d'UNE façon. */
function dossierConforme(): void {
  writeFileSync(join(dossier, 'robots.txt'), ROBOTS_BON);
  writeFileSync(join(dossier, '_headers'), ENTETES_BON);
  writeFileSync(join(dossier, 'previsualisation.css'), CSS_BON);
  writeFileSync(join(dossier, 'index.html'), PAGE_BONNE);
}

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'porte-previz-'));
});
afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

describe('la porte accepte ce qui est conforme', () => {
  it('un dossier complet passe, sans grief', () => {
    dossierConforme();
    const { griefs } = verifierPrevisualisation(dossier);
    expect(griefs, griefs.join(' | ')).toEqual([]);
  });
});

describe('la porte refuse les cinq contournements trouvés par Codex', () => {
  it('1. un X-Robots-Tag en COMMENTAIRE ne protège rien', () => {
    dossierConforme();
    writeFileSync(join(dossier, '_headers'), '/*\n  # X-Robots-Tag: noindex\n');
    const { griefs } = verifierPrevisualisation(dossier);
    expect(griefs.join(' ')).toMatch(/X-Robots-Tag noindex ACTIF/);
  });

  it('2. un X-Robots-Tag posé sur une PARTIE du site ne protège pas la racine', () => {
    dossierConforme();
    writeFileSync(join(dossier, '_headers'), '/prive/*\n  X-Robots-Tag: noindex\n');
    const { griefs } = verifierPrevisualisation(dossier);
    expect(griefs.join(' ')).toMatch(/motif couvrant tout le site/);
  });

  it('3. un Disallow réservé à UN robot laisse passer tous les autres', () => {
    dossierConforme();
    writeFileSync(join(dossier, 'robots.txt'), 'User-agent: Bingbot\nDisallow: /\n');
    const { griefs } = verifierPrevisualisation(dossier);
    expect(griefs.join(' ')).toMatch(/User-agent: \*/);
  });

  it('4. une page dans un SOUS-DOSSIER est contrôlée elle aussi', () => {
    dossierConforme();
    mkdirSync(join(dossier, 'aide'));
    writeFileSync(join(dossier, 'aide', 'index.html'),
      '<!doctype html><html lang="fr"><head><title>Aide</title></head><body></body></html>');
    const { griefs } = verifierPrevisualisation(dossier);
    expect(griefs.join(' ')).toMatch(/aide\/index\.html/);
  });

  it('5. un bandeau mis en display:none est un bandeau absent', () => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'),
      '.previsualisation-cadre { display: none; pointer-events: none; }\n'
      + '.previsualisation-pastille { background: #FFB300; }\n');
    const { griefs } = verifierPrevisualisation(dossier);
    expect(griefs.join(' ')).toMatch(/rendu invisible/);
  });
});

describe('la porte refuse aussi les défauts de base', () => {
  it('un robots.txt ouvert (celui de la production) est refusé', () => {
    dossierConforme();
    writeFileSync(join(dossier, 'robots.txt'),
      'User-agent: *\nAllow: /\n\nSitemap: https://maps.infonovice.fr/sitemap.xml\n');
    const { griefs } = verifierPrevisualisation(dossier);
    expect(griefs.length).toBeGreaterThan(0);
  });

  it('un CNAME ou un sitemap de production est refusé', () => {
    dossierConforme();
    writeFileSync(join(dossier, 'CNAME'), 'maps.infonovice.fr\n');
    writeFileSync(join(dossier, 'sitemap.xml'), '<urlset/>');
    const { griefs } = verifierPrevisualisation(dossier);
    expect(griefs.join(' ')).toMatch(/CNAME/);
    expect(griefs.join(' ')).toMatch(/sitemap\.xml/);
  });

  it('un cadre qui intercepte les clics est refusé', () => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'),
      '.previsualisation-cadre { position: fixed; inset: 0; }\n'
      + '.previsualisation-pastille { background: #FFB300; }\n');
    const { griefs } = verifierPrevisualisation(dossier);
    expect(griefs.join(' ')).toMatch(/intercepterait les clics/);
  });

  it('un dossier vide est refusé, pas « conforme par défaut »', () => {
    const { griefs } = verifierPrevisualisation(dossier);
    expect(griefs.length).toBeGreaterThan(0);
  });
});
