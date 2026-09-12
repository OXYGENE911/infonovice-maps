import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — script de construction en JS, hors du périmètre de tsc.
import { verifierPrevisualisation } from '../scripts/verifier-previsualisation.mjs';
import {
  BANDEAU_PREVISUALISATION,
  ENTETES_PREVISUALISATION,
  FEUILLE_PREVISUALISATION,
  ROBOTS_PREVISUALISATION,
  marquerHtmlPrevisualisation,
} from '../src/lib/previsualisation';

/* LES CONTOURNEMENTS TROUVÉS PAR CODEX (deux revues, 13/09/2026).
 *
 * La première version de la porte cherchait des CHAÎNES : « Disallow: / »
 * quelque part dans robots.txt, « X-Robots-Tag: noindex » quelque part dans
 * _headers, « .previsualisation-cadre » quelque part dans le CSS. Deux revues
 * ont produit dix dossiers NON conformes qu'elle laissait passer. Chacun est
 * devenu un test : ce ne sont pas des hypothèses, ce sont des dossiers qu'on
 * construit et qu'on soumet à la porte.
 *
 * LE TÉMOIN CONFORME EST LE VRAI. Il n'est pas écrit à la main pour la
 * circonstance — il vient des constantes de production et du transformateur
 * HTML. Un témoin simplifié consacrerait comme « conforme » un dossier que la
 * porte devrait refuser : c'est exactement ce que la deuxième revue a relevé
 * sur la première version de ce fichier. */

const PAGE_SOURCE = [
  '<!doctype html>',
  '<html lang="fr">',
  '<head><meta charset="utf-8">',
  '<title>Test</title>',
  '</head>',
  '<body><h1>Carte</h1></body>',
  '</html>',
].join('\n');

let dossier: string;

/** Le dossier conforme de référence, que chaque test abîme ensuite d'UNE façon. */
function dossierConforme(): void {
  writeFileSync(join(dossier, 'robots.txt'), ROBOTS_PREVISUALISATION);
  writeFileSync(join(dossier, '_headers'), ENTETES_PREVISUALISATION);
  writeFileSync(join(dossier, 'previsualisation.css'), FEUILLE_PREVISUALISATION);
  writeFileSync(join(dossier, 'index.html'), marquerHtmlPrevisualisation(PAGE_SOURCE, 'index.html'));
}

const griefsDe = (): string[] => verifierPrevisualisation(dossier).griefs as string[];

beforeEach(() => { dossier = mkdtempSync(join(tmpdir(), 'porte-previz-')); });
afterEach(() => { rmSync(dossier, { recursive: true, force: true }); });

describe('la porte accepte ce que la construction produit vraiment', () => {
  it('le témoin, bâti avec les constantes de production, passe sans grief', () => {
    dossierConforme();
    const griefs = griefsDe();
    expect(griefs, griefs.join(' | ')).toEqual([]);
  });

  it('et le bandeau du témoin porte bien sa pastille', () => {
    // Garde-fou du garde-fou : si le bandeau perdait sa phrase, le test
    // ci-dessus continuerait de passer sans que rien ne le dise.
    expect(BANDEAU_PREVISUALISATION).toContain('previsualisation-pastille');
    expect(BANDEAU_PREVISUALISATION).toContain('PRÉVISUALISATION');
  });
});

describe('_headers : les cinq façons de faire semblant', () => {
  const pose = (contenu: string) => {
    dossierConforme();
    writeFileSync(join(dossier, '_headers'), contenu);
    return griefsDe().join(' ');
  };

  it('un X-Robots-Tag en COMMENTAIRE ne protège rien', () => {
    expect(pose('/*\n  # X-Robots-Tag: noindex\n')).toMatch(/noindex/);
  });

  it('un X-Robots-Tag posé sur une PARTIE du site ne protège pas la racine', () => {
    expect(pose('/prive/*\n  X-Robots-Tag: noindex\n')).toMatch(/noindex/);
  });

  it('un motif sur le domaine d’un TIERS ne protège pas le nôtre', () => {
    expect(pose('https://ailleurs.example/*\n  X-Robots-Tag: noindex\n')).toMatch(/noindex/);
  });

  it('une directive adressée à UN robot ne dit rien aux autres', () => {
    expect(pose('/*\n  X-Robots-Tag: bingbot: noindex\n')).toMatch(/noindex/);
  });

  it('un en-tête DÉTACHÉ plus bas par « ! » est un en-tête absent', () => {
    expect(pose('/*\n  X-Robots-Tag: noindex\n\n/*\n  ! X-Robots-Tag\n')).toMatch(/noindex/);
  });
});

describe('robots.txt : à qui l’interdiction s’adresse', () => {
  const pose = (contenu: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'robots.txt'), contenu);
    return griefsDe().join(' ');
  };

  it('un Disallow réservé à UN robot laisse passer tous les autres', () => {
    expect(pose('User-agent: Bingbot\nDisallow: /\n')).toMatch(/User-agent: \*/);
  });

  it('un groupe SPÉCIFIQUE plus permissif annule le groupe « * »', () => {
    // Un moteur choisit le groupe le plus spécifique qui le nomme.
    expect(pose('User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n'))
      .toMatch(/Allow/);
  });

  it('le robots.txt ouvert de la production est refusé', () => {
    expect(pose('User-agent: *\nAllow: /\n\nSitemap: https://maps.infonovice.fr/sitemap.xml\n'))
      .not.toBe('');
  });
});

describe('le bandeau : présent, visible, inerte', () => {
  const poseCss = (contenu: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'), contenu);
    return griefsDe().join(' ');
  };

  it('une SECONDE règle qui éteint le cadre est vue, car c’est elle qui gagne', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}\n.previsualisation-cadre { display: none; }\n`))
      .toMatch(/invisible/);
  });

  it('« display : none » avec des espaces est la même chose', () => {
    expect(poseCss(FEUILLE_PREVISUALISATION.replace('position: fixed', 'display : none')))
      .toMatch(/invisible/);
  });

  it('mais « opacity: 0.5 » est visible, et ne doit PAS être refusé', () => {
    // Faux positif introduit puis corrigé : le nombre est lu, pas deviné.
    const griefs = poseCss(FEUILLE_PREVISUALISATION
      .replace('background: #FFB300; color: #1A1200;', 'background: #FFB300; opacity: 0.5;'));
    expect(griefs).not.toMatch(/invisible/);
  });

  it('un cadre qui intercepte les clics est refusé', () => {
    expect(poseCss(FEUILLE_PREVISUALISATION.replace('pointer-events: none;', '')))
      .toMatch(/intercepterait les clics/);
  });

  it('un cadre sans liseré ne se voit pas', () => {
    expect(poseCss(FEUILLE_PREVISUALISATION.replace('border: 4px solid #FFB300;', '')))
      .toMatch(/liseré/);
  });
});

describe('les pages livrées', () => {
  it('une page dans un SOUS-DOSSIER est contrôlée elle aussi', () => {
    dossierConforme();
    mkdirSync(join(dossier, 'aide'));
    writeFileSync(join(dossier, 'aide', 'index.html'),
      '<!doctype html><html lang="fr"><head><title>Aide</title></head><body></body></html>');
    expect(griefsDe().join(' ')).toMatch(/aide\/index\.html/);
  });

  it('un lien de feuille qui ne mène nulle part est refusé', () => {
    // Depuis `aide/index.html`, « previsualisation.css » demande
    // /aide/previsualisation.css, qui n'existe pas.
    dossierConforme();
    mkdirSync(join(dossier, 'aide'));
    writeFileSync(join(dossier, 'aide', 'index.html'),
      marquerHtmlPrevisualisation(PAGE_SOURCE, 'aide/index.html'));
    expect(griefsDe().join(' ')).toMatch(/ne mène à aucun fichier livré/);
  });

  it('un bandeau privé de sa pastille est refusé', () => {
    dossierConforme();
    const ampute = marquerHtmlPrevisualisation(PAGE_SOURCE, 'index.html')
      .replace(/<p class="previsualisation-pastille">[^<]*<\/p>/, '');
    writeFileSync(join(dossier, 'index.html'), ampute);
    expect(griefsDe().join(' ')).toMatch(/pastille/);
  });

  it('un CNAME ou un sitemap de production est refusé', () => {
    dossierConforme();
    writeFileSync(join(dossier, 'CNAME'), 'maps.infonovice.fr\n');
    writeFileSync(join(dossier, 'sitemap.xml'), '<urlset/>');
    const griefs = griefsDe().join(' ');
    expect(griefs).toMatch(/CNAME/);
    expect(griefs).toMatch(/sitemap\.xml/);
  });

  it('un dossier vide est refusé, pas « conforme par défaut »', () => {
    expect(griefsDe().length).toBeGreaterThan(0);
  });
});
