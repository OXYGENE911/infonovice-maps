import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — script de construction en JS, hors du périmètre de tsc.
import { verifierPrevisualisation, REFERENCE_MARQUAGE } from '../scripts/verifier-previsualisation.mjs';
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

describe('la porte lit les VALEURS, pas seulement la présence des déclarations', () => {
  const poseCss = (contenu: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'), contenu);
    return griefsDe().join(' ');
  };
  const sortie = (contenu: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'), contenu);
    return verifierPrevisualisation(dossier) as { griefs: string[]; constats: string[] };
  };

  /* LA SONDE DU VÉRIFICATEUR INDÉPENDANT (13/09), REPRISE TELLE QUELLE.
     Elle faisait sortir la porte en code 0 — et la porte imprimait alors
     « cadre visible et pastille visible ». Le code livré était correct : c'est
     la GARDE qui mentait. Une garde qui affirme une chose qu'elle n'a pas
     vérifiée est pire qu'une absence de garde, parce qu'on lui fait confiance.
     Ce test existe pour que cette sonde ne puisse plus jamais repasser. */
  const SONDE_DU_VERIFICATEUR = `${FEUILLE_PREVISUALISATION}
.previsualisation-cadre { border: 0 solid #FFB300; }
.previsualisation-pastille { font-size: 0; }
`;

  it('LA SONDE : « border: 0 » et « font-size: 0 » sont désormais refusés', () => {
    const { griefs, constats } = sortie(SONDE_DU_VERIFICATEUR);
    expect(griefs.join(' ')).toMatch(/épaisseur nulle/);
    expect(griefs.join(' ')).toMatch(/taille de texte nulle/);
    // ET LA PORTE NE DOIT PLUS SE FÉLICITER : le pire de l'ancien
    // comportement n'était pas de laisser passer, c'était de l'ANNONCER.
    expect(constats.join(' ')).not.toMatch(/pastille/);
  });

  it('un liseré de zéro pixel, quelle que soit l’unité', () => {
    expect(poseCss(FEUILLE_PREVISUALISATION.replace('border: 4px solid', 'border: 0em solid')))
      .toMatch(/épaisseur nulle/);
  });

  it('« border: none » ne dessine rien non plus', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}\n.previsualisation-cadre { border: none; }\n`))
      .toMatch(/liseré|épaisseur/);
  });

  it('« border-style: hidden » annule un liseré pourtant épais', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}\n.previsualisation-cadre { border-style: hidden; }\n`))
      .toMatch(/n'est pas dessiné/);
  });

  it('« border-width: 0 » écrit plus bas l’emporte, comme en CSS', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}\n.previsualisation-cadre { border-width: 0; }\n`))
      .toMatch(/épaisseur nulle/);
  });

  it('un seul côté à zéro suffit : le cadre est percé', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}\n.previsualisation-cadre { border-bottom-width: 0; }\n`))
      .toMatch(/épaisseur nulle/);
  });

  it('un liseré transparent ne se voit pas davantage', () => {
    expect(poseCss(FEUILLE_PREVISUALISATION.replace('#FFB300;\n  pointer-events', 'transparent;\n  pointer-events')))
      .toMatch(/transparent/);
  });

  it('« !important » posé AVANT ne se laisse pas écraser par la bonne règle', () => {
    // Sans la notion d'importance, la porte aurait retenu « 4px » — la
    // dernière déclaration — alors que le navigateur peint zéro.
    expect(poseCss(`.previsualisation-cadre { border: 0 !important; }\n${FEUILLE_PREVISUALISATION}`))
      .toMatch(/épaisseur nulle/);
  });

  it('la taille cachée DANS le raccourci « font » est lue, pas seulement font-size', () => {
    expect(poseCss(FEUILLE_PREVISUALISATION.replace('font: 700 13px/1.5', 'font: 700 0px/1.5')))
      .toMatch(/taille de texte nulle/);
  });

  it('mais 13 px reste 13 px : aucun faux positif sur le témoin', () => {
    const { griefs, constats } = sortie(FEUILLE_PREVISUALISATION);
    expect(griefs, griefs.join(' | ')).toEqual([]);
    expect(constats.join(' ')).toMatch(/liseré de 4 px/);
    expect(constats.join(' ')).toMatch(/pastille à 13 px/);
  });

  it('un texte de la couleur du fond est illisible, même à 13 px', () => {
    expect(poseCss(FEUILLE_PREVISUALISATION.replace('color: #1A1200;', 'color: #FFB300;')))
      .toMatch(/même couleur/);
  });

  it('« color: transparent » aussi', () => {
    expect(poseCss(FEUILLE_PREVISUALISATION.replace('color: #1A1200;', 'color: transparent;')))
      .toMatch(/transparent/);
  });

  it('une couleur écrite autrement reste la même couleur', () => {
    // #FFB300 et rgb(255,179,0) : la porte compare des couleurs, pas des
    // chaînes — sinon le contournement tient en une réécriture.
    expect(poseCss(FEUILLE_PREVISUALISATION
      .replace('background: #FFB300; color: #1A1200;', 'background: #FFB300; color: rgb(255, 179, 0);')))
      .toMatch(/même couleur/);
  });

  it('une mise à l’échelle nulle éteint le bandeau', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}\n.previsualisation-pastille { transform: scale(0); }\n`))
      .toMatch(/invisible/);
  });

  it('une boîte de largeur nulle aussi', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}\n.previsualisation-pastille { max-width: 0; }\n`))
      .toMatch(/invisible/);
  });

  it('« visibility: collapse » est la cousine de « hidden »', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}\n.previsualisation-cadre { visibility: collapse; }\n`))
      .toMatch(/invisible/);
  });

  it('une découpe qui ne laisse rien voir est refusée', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}\n.previsualisation-pastille { clip-path: inset(100%); }\n`))
      .toMatch(/invisible/);
  });

  it('le texte poussé hors de sa boîte est refusé', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}\n.previsualisation-pastille { text-indent: -9999px; }\n`))
      .toMatch(/invisible/);
  });

  it('mais « max-width: calc(100% - 8px) » du témoin n’est PAS une boîte nulle', () => {
    // Faux positif qu'il fallait éviter : la pastille livrée porte exactement
    // cette déclaration.
    expect(FEUILLE_PREVISUALISATION).toContain('max-width: calc(100% - 8px)');
    expect(poseCss(FEUILLE_PREVISUALISATION)).toEqual('');
  });
});

describe('la préversion ne doit pas se dire production quand on partage son lien', () => {
  /* TROUVÉ PAR LE VÉRIFICATEUR INDÉPENDANT (13/09) : le `dist/` de préversion
     portait un `canonical` et un `og:url` de production. La page se disait
     préversion à qui l'ouvrait, et production à qui recevait son lien. */
  const poseHtml = (html: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'index.html'), html);
    return griefsDe().join(' ');
  };
  const marquee = () => marquerHtmlPrevisualisation(PAGE_SOURCE, 'index.html');

  it('un canonical de production est refusé', () => {
    expect(poseHtml(marquee().replace('</head>', '<link rel="canonical" href="https://maps.infonovice.fr/"></head>')))
      .toMatch(/canonical/);
  });

  it('un og:url de production est refusé', () => {
    expect(poseHtml(marquee().replace('</head>', '<meta property="og:url" content="https://maps.infonovice.fr/"></head>')))
      .toMatch(/og:url/);
  });

  it('un bloc JSON-LD de production est refusé', () => {
    expect(poseHtml(marquee().replace('</head>', '<script type="application/ld+json">{"url":"https://maps.infonovice.fr/"}</script></head>')))
      .toMatch(/JSON-LD/);
  });

  it('un og:title non préfixé est refusé', () => {
    expect(poseHtml(marquee().replace('</head>', '<meta property="og:title" content="Infonovice Maps"></head>')))
      .toMatch(/og:title/);
  });

  it('mais un og:title préfixé passe', () => {
    expect(poseHtml(marquee().replace('</head>', '<meta property="og:title" content="PRÉVISUALISATION — Infonovice Maps"></head>')))
      .not.toMatch(/og:title/);
  });
});

describe('les huit contournements de la 6e revue Codex', () => {
  /* TOUS TROUVÉS SUR LE COMMIT DE CORRECTION, TOUS DU CSS OU DU HTML VALIDE.
     La leçon est la même que les cinq revues précédentes : la porte lisait des
     chaînes là où il fallait lire une STRUCTURE — une cascade, un attribut. */
  const poseCss = (contenu: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'), `${FEUILLE_PREVISUALISATION}\n${contenu}\n`);
    return griefsDe().join(' ');
  };
  const poseHtml = (html: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'index.html'), html);
    return griefsDe().join(' ');
  };
  const marquee = () => marquerHtmlPrevisualisation(PAGE_SOURCE, 'index.html');

  it('1. « opacity: calc(0) » : une opacité qu’on ne sait pas lire est REFUSÉE', () => {
    // `parseFloat('calc(0)')` rend NaN, donc « ce n'est pas zéro », donc la
    // porte acceptait. Une garde qui ne comprend pas doit dire non.
    expect(poseCss('.previsualisation-cadre { opacity: calc(0); }')).toMatch(/illisible/);
  });

  it('et « opacity: 50% » reste lisible et visible', () => {
    expect(poseCss('.previsualisation-cadre { opacity: 50%; }')).toEqual('');
  });

  it('2. « font: 700 0 / 1.5 system-ui » : les espaces autour de la barre sont légaux', () => {
    // Mot à mot, la porte retenait « 1.5 » — l'interligne — comme taille.
    expect(poseCss('.previsualisation-pastille { font: 700 0 / 1.5 system-ui; }'))
      .toMatch(/taille de texte nulle/);
  });

  it('3. « background-color » puis « background » : c’est la DERNIÈRE qui peint', () => {
    expect(poseCss('.previsualisation-pastille { color: #000; background-color: #fff; background: #000; }'))
      .toMatch(/même couleur/);
  });

  it('4. et l’ordre inverse ne doit PAS être refusé : noir sur blanc se lit', () => {
    expect(poseCss('.previsualisation-pastille { color: #000; background-color: #000; background: #fff; }'))
      .toEqual('');
  });

  it('5. « border-bottom-width: 0 » PUIS « border: 4px » : le raccourci écrit après redonne les 4 côtés', () => {
    expect(poseCss('.previsualisation-cadre { border-bottom-width: 0; border: 4px solid #FFB300; }'))
      .toEqual('');
  });

  it('et l’ordre inverse perce bien le cadre', () => {
    expect(poseCss('.previsualisation-cadre { border: 4px solid #FFB300; border-bottom-width: 0; }'))
      .toMatch(/épaisseur nulle/);
  });

  it('un seul côté à zéro dans « border-width: 4px 4px 0 4px » suffit', () => {
    expect(poseCss('.previsualisation-cadre { border-width: 4px 4px 0 4px; }'))
      .toMatch(/épaisseur nulle/);
  });

  it('6. guillemets simples et espaces autour du « = » : du HTML valide', () => {
    const griefs = poseHtml(marquee().replace('</head>',
      "<link rel='canonical' href='https://maps.infonovice.fr/'>"
      + "<meta property = 'og:url' content='https://maps.infonovice.fr/'></head>"));
    expect(griefs).toMatch(/canonical/);
    expect(griefs).toMatch(/og:url/);
  });

  it('7. « content » écrit AVANT « property » contournait le préfixage', () => {
    expect(poseHtml(marquee().replace('</head>', '<meta content="Infonovice Maps" property="og:title"></head>')))
      .toMatch(/og:title/);
  });

  it('8. un attribut de plus sur le <script> n’empêche plus de le reconnaître', () => {
    expect(poseHtml(marquee().replace('</head>',
      '<script id="schema" type="application/ld+json">{"url":"https://maps.infonovice.fr/"}</script></head>')))
      .toMatch(/JSON-LD/);
  });

  it('un « > » dans une valeur d’attribut ne coupe plus la balise en deux', () => {
    expect(poseHtml(marquee().replace('</head>',
      '<link rel="canonical" href="https://maps.infonovice.fr/" title="Carte > accueil"></head>')))
      .toMatch(/canonical/);
  });
});

describe('les huit contournements de la 7e revue Codex', () => {
  const poseCss = (contenu: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'), `${FEUILLE_PREVISUALISATION}\n${contenu}\n`);
    return griefsDe().join(' ');
  };
  const poseHtml = (html: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'index.html'), html);
    return griefsDe().join(' ');
  };
  const marquee = () => marquerHtmlPrevisualisation(PAGE_SOURCE, 'index.html');

  it('1. « opacity: -1 » vaut zéro : l’opacité est bornée à [0,1]', () => {
    expect(poseCss('.previsualisation-cadre { opacity: -1; }')).toMatch(/invisible/);
  });

  it('2. « opacity: 1e0 » est un nombre CSS valide et parfaitement visible', () => {
    // Faux positif : la notation exponentielle était jugée « illisible ».
    expect(poseCss('.previsualisation-cadre { opacity: 1e0; }')).toEqual('');
  });

  it('3. « border-style: solid none » efface deux côtés sur quatre', () => {
    expect(poseCss('.previsualisation-cadre { border-style: solid none; }'))
      .toMatch(/n'est pas dessiné côté right/);
  });

  it('et « border-color: #FFB300 transparent » aussi', () => {
    expect(poseCss('.previsualisation-cadre { border-color: #FFB300 transparent; }'))
      .toMatch(/transparent côté right/);
  });

  it('mais « border-style: solid » sur les quatre côtés reste bon', () => {
    expect(poseCss('.previsualisation-cadre { border-style: solid; }')).toEqual('');
  });

  it('4. « rgb(0, 0, 0) » : les espaces dans une couleur ne la découpent plus', () => {
    expect(poseCss('.previsualisation-pastille { color: rgb(0, 0, 0); background: rgb(0, 0, 0); }'))
      .toMatch(/même couleur/);
  });

  it('5. « rel="alternate canonical" » est un canonical : rel est une LISTE', () => {
    expect(poseHtml(marquee().replace('</head>',
      '<link rel="alternate canonical" href="https://maps.infonovice.fr/"></head>')))
      .toMatch(/canonical/);
  });

  it('6. les références de caractères sont décodées, comme le fait un navigateur', () => {
    const griefs = poseHtml(marquee().replace('</head>',
      '<meta property="og&#58;title" content="Maps">'
      + '<link rel="canonic&#97;l" href="https://maps.infonovice.fr/">'
      + '<meta property="og&#58;url" content="https://maps.infonovice.fr/">'
      + '<script type="application/ld&#43;json">{}</script></head>'));
    expect(griefs).toMatch(/og:title/);
    expect(griefs).toMatch(/canonical/);
    expect(griefs).toMatch(/og:url/);
    expect(griefs).toMatch(/JSON-LD/);
  });

  it('7. ce qui est dans un COMMENTAIRE du head n’est pas une balise', () => {
    // Faux positif à éviter : les pages du dépôt commentent abondamment leur
    // <head>, et un exemple cité en commentaire ne doit rien déclencher.
    expect(poseHtml(marquee().replace('</head>',
      '<!-- exemple : <link rel="canonical" href="https://maps.infonovice.fr/"> --></head>')))
      .toEqual('');
  });

  it('8. et ce qui est dans le <body> non plus : la porte ne lit que le <head>', () => {
    expect(poseHtml(marquee().replace('</body>',
      '<textarea><link rel="canonical" href="https://maps.infonovice.fr/"></textarea></body>')))
      .toEqual('');
  });
});

describe('les quatre contournements de la 8e revue Codex', () => {
  const poseCss = (contenu: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'), `${FEUILLE_PREVISUALISATION}\n${contenu}\n`);
    return griefsDe().join(' ');
  };
  const poseHtml = (html: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'index.html'), html);
    return griefsDe().join(' ');
  };
  const marquee = () => marquerHtmlPrevisualisation(PAGE_SOURCE, 'index.html');

  it('1. « scale(0e0) » est un zéro : le facteur est parsé, pas reconnu de forme', () => {
    expect(poseCss('.previsualisation-cadre { transform: scale(0e0); }')).toMatch(/invisible/);
  });

  it('et « scale(1) » ne doit rien déclencher', () => {
    expect(poseCss('.previsualisation-cadre { transform: scale(1); }')).toEqual('');
  });

  it('2. « .previsualisation-cadre-inactif » n’est PAS « .previsualisation-cadre »', () => {
    // Faux positif grave : la porte refusait un déploiement bon à cause d'une
    // classe voisine ne s'appliquant à aucun élément.
    expect(poseCss('.previsualisation-cadre-inactif { display: none; }')).toEqual('');
  });

  it('mais la vraie classe, elle, reste lue même écrite après une voisine', () => {
    expect(poseCss('.previsualisation-cadre-inactif { color: red; }\n.previsualisation-cadre { display: none; }'))
      .toMatch(/invisible/);
  });

  it('3. un « </head> » cité en commentaire n’arrête pas le contrôle', () => {
    expect(poseHtml(marquee().replace('</head>',
      '<!-- </head> --><link rel="canonical" href="https://maps.infonovice.fr/"></head>')))
      .toMatch(/canonical/);
  });

  it('4. une balise citée dans une chaîne JavaScript n’est pas une balise', () => {
    const page = marquee().replace('</head>',
      `<script>const exemple = '<link rel="canonical" href="https://x/">';</script></head>`);
    expect(poseHtml(page)).toEqual('');
  });
});

describe('les quatre contournements de la 9e revue Codex', () => {
  /* TROIS SUR QUATRE SONT DES FAUX POSITIFS, et c'est le bon signe : une porte
     qui refuse un déploiement légitime à trois semaines du salon coûte autant
     qu'un trou, et se découvre plus tard. */
  const poseCss = (contenu: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'), `${FEUILLE_PREVISUALISATION}\n${contenu}\n`);
    return griefsDe().join(' ');
  };

  it('1. « .previsualisation-cadre span » vise les DESCENDANTS, pas le cadre', () => {
    expect(poseCss('.previsualisation-cadre span { display: none; }')).toEqual('');
  });

  it('et « .previsualisation-cadre.eteint » ne s’applique pas non plus à lui seul', () => {
    expect(poseCss('.previsualisation-cadre.eteint { display: none; }')).toEqual('');
  });

  it('mais « .autre, .previsualisation-cadre » le vise bien', () => {
    expect(poseCss('.autre, .previsualisation-cadre { display: none; }')).toMatch(/invisible/);
  });

  it('2. « scale: 1 1 0 » n’aplatit que l’axe Z : rien n’est caché', () => {
    expect(poseCss('.previsualisation-cadre { scale: 1 1 0; }')).toEqual('');
  });

  it('et « scale: 0 1 1 » cache bien', () => {
    expect(poseCss('.previsualisation-cadre { scale: 0 1 1; }')).toMatch(/invisible/);
  });

  it('3. « transform: scale(calc(0)) » : les parenthèses sont équilibrées', () => {
    // Le motif s'arrêtait à la première parenthèse fermante et ne voyait rien.
    expect(poseCss('.previsualisation-cadre { transform: scale(calc(0)); }')).toMatch(/invisible/);
  });

  it('et « transform: translateX(-50%) scale(1) » ne déclenche rien', () => {
    expect(poseCss('.previsualisation-cadre { transform: translateX(-50%) scale(1); }')).toEqual('');
  });
});

describe('le bandeau éteint sur sa PROPRE balise — 10e revue Codex', () => {
  /* LA PORTE LISAIT LA FEUILLE DE STYLE ET PAS LE HTML. Un simple attribut
     `hidden` sur le `<div>` du cadre — du HTML courant, pas un raffinement de
     CSS que personne n'écrit — cachait cadre et pastille sans un grief. */
  const poseHtml = (html: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'index.html'), html);
    return griefsDe().join(' ');
  };
  const marquee = () => marquerHtmlPrevisualisation(PAGE_SOURCE, 'index.html');

  it('un « hidden » sur le cadre est refusé', () => {
    expect(poseHtml(marquee().replace('data-previsualisation="cadre"', 'data-previsualisation="cadre" hidden')))
      .toMatch(/hidden/);
  });

  it('un « hidden » sur la pastille aussi', () => {
    expect(poseHtml(marquee().replace('class="previsualisation-pastille"', 'class="previsualisation-pastille" hidden')))
      .toMatch(/hidden/);
  });

  it('un style EN LIGNE qui éteint le cadre est refusé', () => {
    expect(poseHtml(marquee().replace('data-previsualisation="cadre"',
      'data-previsualisation="cadre" style="display:none"')))
      .toMatch(/style en ligne/);
  });

  it('mais un style en ligne inoffensif ne déclenche rien', () => {
    expect(poseHtml(marquee().replace('data-previsualisation="cadre"',
      'data-previsualisation="cadre" style="z-index:99"')))
      .toEqual('');
  });

  it('et le témoin, qui ne porte ni l’un ni l’autre, passe toujours', () => {
    expect(poseHtml(marquee())).toEqual('');
  });

  it('et « hidden » écrit dans la VALEUR d’un attribut ne compte pas', () => {
    expect(poseHtml(marquee().replace('data-previsualisation="cadre"',
      'data-previsualisation="cadre" title="rien de hidden ici"')))
      .toEqual('');
  });
});

describe('la porte visait une CHAÎNE, elle vise désormais un SÉLECTEUR — 11e revue Codex', () => {
  const poseCss = (contenu: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'), `${FEUILLE_PREVISUALISATION}
${contenu}
`);
    return griefsDe().join(' ');
  };

  it('« [data-previsualisation="cadre"] » vise bien le cadre', () => {
    expect(poseCss('[data-previsualisation="cadre"] { display: none; }')).toMatch(/invisible/);
  });

  it('et « [data-previsualisation=cadre] » sans guillemets aussi', () => {
    expect(poseCss('[data-previsualisation=cadre] { display: none; }')).toMatch(/invisible/);
  });

  it('mais « [data-previsualisation="autre"] » ne vise rien de chez nous', () => {
    expect(poseCss('[data-previsualisation="autre"] { display: none; }')).toEqual('');
  });

  it('« div[data-previsualisation="cadre"] » aussi, balise comprise', () => {
    expect(poseCss('div[data-previsualisation="cadre"] { display: none; }')).toMatch(/invisible/);
  });

  it('et « span[data-previsualisation="cadre"] » non : le cadre est un div', () => {
    expect(poseCss('span[data-previsualisation="cadre"] { display: none; }')).toEqual('');
  });

  it('« [class~="previsualisation-pastille"] » vise la pastille', () => {
    expect(poseCss('[class~="previsualisation-pastille"] { font-size: 0; }'))
      .toMatch(/taille de texte nulle/);
  });

  it('un « :hover » n’est pas l’état au repos et ne compte pas', () => {
    expect(poseCss('.previsualisation-cadre:hover { display: none; }')).toEqual('');
  });

  it('mais « :not(.inactif) », lui, s’applique AU REPOS', () => {
    // Écarter toutes les pseudo-classes laissait passer celle-ci (11e revue).
    expect(poseCss('.previsualisation-cadre:not(.inactif) { display: none; }'))
      .toMatch(/invisible/);
  });

  it('et « ::before » stylise une boîte engendrée, pas l’élément', () => {
    expect(poseCss('.previsualisation-cadre::before { display: none; }')).toEqual('');
  });

  it('« :read-only » s’applique à tout élément non éditable — donc à notre div', () => {
    // Il figurait à tort parmi les pseudo-classes « d'état » : un div est en
    // lecture seule dès l'ouverture, la règle s'applique tout de suite.
    expect(poseCss('.previsualisation-cadre:read-only { display: none; }'))
      .toMatch(/invisible/);
  });

  it('et « :first-child » aussi, qui n’est pas un état', () => {
    expect(poseCss('.previsualisation-cadre:first-child { display: none; }'))
      .toMatch(/invisible/);
  });

  it('une règle dans un bloc @media est lue, elle aussi', () => {
    expect(poseCss('@media (min-width: 1px) { .previsualisation-cadre { display: none; } }'))
      .toMatch(/invisible/);
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
    expect(griefsDe().join(' ')).toMatch(/aide\/index\.html : aucun lien ne mène à/);
  });

  it('une page qui lie une AUTRE feuille est refusée', () => {
    /* Trouvé à la 3e revue Codex. La feuille contrôlée restait conforme, mais
       la page en chargeait une autre — qui éteignait le bandeau. Le motif de
       recherche acceptait « autre-previsualisation.css » ; la porte résout
       maintenant chaque lien et exige qu'il tombe sur la feuille vérifiée. */
    dossierConforme();
    writeFileSync(join(dossier, 'autre-previsualisation.css'),
      '.previsualisation-cadre { display: none; }\n');
    writeFileSync(join(dossier, 'index.html'),
      marquerHtmlPrevisualisation(PAGE_SOURCE, 'index.html')
        .replace('href="previsualisation.css"', 'href="autre-previsualisation.css"'));
    expect(griefsDe().join(' ')).toMatch(/aucun lien ne mène à previsualisation\.css/);
  });

  it('un lien racine « /previsualisation.css » reste accepté', () => {
    dossierConforme();
    writeFileSync(join(dossier, 'index.html'),
      marquerHtmlPrevisualisation(PAGE_SOURCE, 'index.html')
        .replace('href="previsualisation.css"', 'href="/previsualisation.css"'));
    const griefs = griefsDe();
    expect(griefs, griefs.join(' | ')).toEqual([]);
  });

  it('un fragment ou une requête dans le lien ne change pas le fichier demandé', () => {
    // « previsualisation.css#v1 » charge bien /previsualisation.css : refuser
    // cette page serait refuser une préversion parfaitement servable.
    dossierConforme();
    writeFileSync(join(dossier, 'index.html'),
      marquerHtmlPrevisualisation(PAGE_SOURCE, 'index.html')
        .replace('href="previsualisation.css"', 'href="previsualisation.css?v=1#haut"'));
    const griefs = griefsDe();
    expect(griefs, griefs.join(' | ')).toEqual([]);
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

/* LE SEUIL QUI SE CONTOURNAIT D'UN CARACTÈRE (objection du vérificateur
 * indépendant, 13/09 — dernier point de la PR #317).
 *
 * La porte refusait le ZÉRO. `border: 0` et `font-size: 0` étaient donc
 * couverts… et `border: 0.1px` / `font-size: 0.1px` passaient, en faisant
 * imprimer à la porte « cadre inerte, pastille à 0.1 px » — c'est-à-dire la
 * même fausse assurance que la sonde d'origine, décalée d'un chiffre.
 *
 * LE PLANCHER N'EST PAS UN NOMBRE CHOISI : c'est la valeur que la feuille de
 * référence écrit. Le premier test ci-dessous est celui qui le garantit : si
 * quelqu'un change le liseré dans `previsualisation.ts` sans toucher au
 * plancher (ou l'inverse), il rougit. Sans lui, les deux nombres dériveraient
 * en silence et le plancher redeviendrait arbitraire. */
describe('les planchers de la porte SONT ceux de la feuille de référence', () => {
  const ref = REFERENCE_MARQUAGE as { liserePx: number; taillePastillePx: number; boitePx: number };
  const poseCss = (contenu: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'), contenu);
    return griefsDe().join(' ');
  };

  it('les deux nombres ne peuvent pas diverger de la feuille en silence', () => {
    expect(FEUILLE_PREVISUALISATION).toContain(`border: ${ref.liserePx}px solid`);
    expect(FEUILLE_PREVISUALISATION).toContain(`font: 700 ${ref.taillePastillePx}px/1.5`);
  });

  it('« border: 0.1px » ne suffit plus à franchir la porte', () => {
    expect(poseCss(FEUILLE_PREVISUALISATION.replace('border: 4px solid', 'border: 0.1px solid')))
      .toMatch(/plus fin que la référence/);
  });

  it('« font-size: 0.1px » non plus', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}
.previsualisation-pastille { font-size: 0.1px; }
`))
      .toMatch(/plus petite que la référence/);
  });

  it('un liseré de 3 px — « medium », la valeur par défaut d’un raccourci sans largeur', () => {
    expect(poseCss(FEUILLE_PREVISUALISATION.replace('border: 4px solid #FFB300;', 'border: solid #FFB300;')))
      .toMatch(/plus fin que la référence/);
  });

  it('une largeur de boîte sous le pixel est une boîte vide à l’écran', () => {
    expect(poseCss(`${FEUILLE_PREVISUALISATION}
.previsualisation-cadre { width: 0.5px; }
`))
      .toMatch(/sous le pixel/);
  });

  /* ET CE QUE LA PORTE NE SAIT PAS CONVERTIR, ELLE LE REFUSE. Sans cela, le
     plancher se contournerait en changeant d'unité : `0.5em` vaut 0.5 pour un
     `parseFloat` naïf, donc « moins de 4 » — mais 8 px à l'écran. La porte
     dirait alors une chose fausse dans un sens comme dans l'autre. */
  it('une épaisseur dans une unité non convertible est refusée, pas comparée à tort', () => {
    expect(poseCss(FEUILLE_PREVISUALISATION.replace('border: 4px solid', 'border: 0.5em solid')))
      .toMatch(/ne sait pas la convertir/);
  });

  it('et la feuille de référence, elle, passe toujours sans le moindre grief', () => {
    dossierConforme();
    const griefs = griefsDe();
    expect(griefs, griefs.join(' | ')).toEqual([]);
  });
});

/* LE TROISIÈME TROU, ET LES AUTRES QU'IL CACHAIT — vérificateur indépendant,
 * 13/09/2026.
 *
 * La porte annonçait « les deux endroits où elle reste lâche » (`opacity`,
 * `text-indent`) et donnait cette liste pour exhaustive. Elle ne l'était pas :
 * la MISE À L'ÉCHELLE n'était refusée qu'à zéro exact, si bien que
 * `transform: scale(0.0001)` passait — mot pour mot le défaut « un caractère de
 * plus » que le liseré et la pastille venaient de payer, laissé une ligne plus
 * bas. Une liste qui se dit exhaustive sans l'être rend la porte décorative.
 *
 * La liste a donc été refaite PAR SONDE : chaque façon d'éteindre le bandeau a
 * été ajoutée à la feuille réellement servie, la porte relancée. Ce bloc tient
 * les deux bouts de ce qu'elle a rendu — ce qui est désormais refusé, ce qui
 * passe encore ET DOIT ÊTRE DÉCLARÉ, et ce qui doit continuer de passer parce
 * qu'un refus y serait un faux positif. */
describe('le troisième seuil lâche, et la liste rendue complète', () => {
  const ref = REFERENCE_MARQUAGE as {
    liserePx: number; taillePastillePx: number; boitePx: number; echelle: number;
  };
  const poseCss = (ajout: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'), `${FEUILLE_PREVISUALISATION}\n${ajout}\n`);
    return griefsDe().join(' ');
  };

  /* 1. LE TROISIÈME, CELUI QUI N'ÉTAIT PAS DÉCLARÉ. */
  it('« transform: scale(0.0001) » ne franchit plus la porte', () => {
    expect(poseCss('.previsualisation-cadre { transform: scale(0.0001); }'))
      .toMatch(/rétréci .*< 1.*plus petit que la référence/);
  });

  it('« scale: 0.0001 », la propriété autonome, non plus', () => {
    expect(poseCss('.previsualisation-cadre { scale: 0.0001; }'))
      .toMatch(/rétréci .*< 1.*plus petit que la référence/);
  });

  it('et le plancher d’échelle n’est pas un nombre choisi : c’est l’identité', () => {
    expect(ref.echelle).toBe(1);
  });

  /* LE PLANCHER NE PEUT PAS FAIRE DE FAUX POSITIF SUR LA FEUILLE CONFORME, et
     ce n'est pas une opinion : la feuille de référence ne met le bandeau à
     aucune échelle. Si un dessin futur en ajoutait une, ce test rougirait — et
     c'est exactement ce qu'on veut : le plancher et la feuille ne peuvent pas
     diverger en silence, comme les 4 px et les 13 px. */
  it('la feuille de référence ne met le bandeau à aucune échelle', () => {
    expect(FEUILLE_PREVISUALISATION).not.toMatch(/scale\s*[:(]/);
  });

  it('agrandir n’est pas cacher : « scale(2) » ne déclenche rien', () => {
    expect(poseCss('.previsualisation-cadre { transform: scale(2); }')).toEqual('');
  });

  it('et « scale3d(1, 1, 0) » n’aplatit que l’axe Z : rien n’est caché', () => {
    expect(poseCss('.previsualisation-cadre { transform: scale3d(1, 1, 0); }')).toEqual('');
  });

  /* 2. CE QU'ELLE NE SAIT PAS ÉVALUER, ELLE LE REFUSE. Trois façons d'aplatir
       le bandeau sans qu'aucun facteur d'échelle apparaisse. */
  it('« matrix(0, 0, 0, 0, 0, 0) » est refusée faute d’être évaluable', () => {
    expect(poseCss('.previsualisation-cadre { transform: matrix(0, 0, 0, 0, 0, 0); }'))
      .toMatch(/« matrix\(\) » n’est pas évaluable|« matrix\(\) » n'est pas évaluable/);
  });

  it('« rotateY(90deg) » met le bandeau de profil : refusée aussi', () => {
    expect(poseCss('.previsualisation-cadre { transform: rotateY(90deg); }'))
      .toMatch(/rotatey\(\).*pas évaluable/);
  });

  it('« perspective(1px) translateZ(-999px) » : refusée', () => {
    expect(poseCss('.previsualisation-cadre { transform: perspective(1px) translateZ(-999px); }'))
      .toMatch(/perspective\(\).*pas évaluable/);
  });

  it('mais une rotation DANS LE PLAN ne cache rien, et passe', () => {
    expect(poseCss('.previsualisation-cadre { transform: rotate(2deg); }')).toEqual('');
  });

  /* 3. `display: contents` — AUCUNE BOÎTE, DONC AUCUN LISERÉ PEINT. */
  it('« display: contents » sur le cadre efface le liseré sans dire « none »', () => {
    expect(poseCss('.previsualisation-cadre { display: contents; }'))
      .toMatch(/invisible — cadre, display: contents/);
  });

  it('et sur la pastille, qui perdrait fond et remplissage', () => {
    expect(poseCss('.previsualisation-pastille { display: contents; }'))
      .toMatch(/invisible — pastille, display: contents/);
  });

  /* 4. DÉCOUPES, MASQUES ET FILTRES : la porte ne peint pas, donc elle refuse
       tout ce qui n'est pas la valeur inerte. La version d'avant ne connaissait
       que deux formes écrites. */
  it('« clip-path: inset(50%) » — une seule valeur, donc les quatre côtés', () => {
    expect(poseCss('.previsualisation-cadre { clip-path: inset(50%); }'))
      .toMatch(/clip-path: inset\(50%\).*refuse/);
  });

  it('« clip-path: circle(0) » aussi, et « url(#vide) » que rien ne peut lire', () => {
    expect(poseCss('.previsualisation-cadre { clip-path: circle(0); }')).toMatch(/refuse/);
    expect(poseCss('.previsualisation-cadre { clip-path: url(#vide); }')).toMatch(/refuse/);
  });

  it('« clip: rect(1px, 1px, 1px, 1px) » — le zéro décalé d’un caractère', () => {
    expect(poseCss('.previsualisation-cadre { clip: rect(1px, 1px, 1px, 1px); }'))
      .toMatch(/clip: rect.*refuse/);
  });

  it('« filter: opacity(0) » : l’opacité entrée par une autre porte', () => {
    expect(poseCss('.previsualisation-cadre { filter: opacity(0); }'))
      .toMatch(/filter: opacity\(0\).*refuse/);
  });

  it('« mask » et « -webkit-mask-image » effacent aussi bien', () => {
    expect(poseCss('.previsualisation-cadre { mask: linear-gradient(#0000, #0000); }'))
      .toMatch(/mask:.*refuse/);
    expect(poseCss('.previsualisation-cadre { -webkit-mask-image: linear-gradient(#0000, #0000); }'))
      .toMatch(/-webkit-mask-image:.*refuse/);
  });

  it('mais les valeurs inertes, elles, passent : « clip-path: none », « filter: none »', () => {
    expect(poseCss('.previsualisation-cadre { clip-path: none; filter: none; clip: auto; }')).toEqual('');
  });

  /* 4 bis. CE QU'UN PREMIER JET AVAIT ENCORE MANQUÉ. Refermer l'échelle sous
       `transform` et sous `scale` et la laisser ouverte sous `zoom` n'aurait rien
       refermé du tout : la deuxième sonde l'a rendu, et c'est la raison pour
       laquelle cette liste a été passée DEUX fois avant d'être publiée. */
  it('« zoom: 0.0001 » est la même échelle sous un autre nom', () => {
    expect(poseCss('.previsualisation-cadre { zoom: 0.0001; }'))
      .toMatch(/zoom: 0\.0001.*rétréci.*plus petit que la référence/);
  });

  it('mais « zoom: 2 » agrandit, et « zoom: normal » ne dit rien', () => {
    expect(poseCss('.previsualisation-cadre { zoom: 2; }')).toEqual('');
    expect(poseCss('.previsualisation-cadre { zoom: normal; }')).toEqual('');
  });

  it('la propriété « rotate » avec un axe vaut « rotateY » : refusée aussi', () => {
    expect(poseCss('.previsualisation-cadre { rotate: y 90deg; }'))
      .toMatch(/rotate: y 90deg.*hors du plan.*pas évaluable/);
    expect(poseCss('.previsualisation-cadre { rotate: x 90deg; }'))
      .toMatch(/hors du plan/);
  });

  it('mais un angle seul, ou l’axe Z, tourne DANS le plan et ne cache rien', () => {
    expect(poseCss('.previsualisation-cadre { rotate: 45deg; }')).toEqual('');
    expect(poseCss('.previsualisation-cadre { rotate: z 45deg; }')).toEqual('');
    expect(poseCss('.previsualisation-cadre { rotate: none; }')).toEqual('');
  });

  it('« all: unset » efface tout ce que la porte vient de lire', () => {
    expect(poseCss('.previsualisation-cadre { all: unset; }'))
      .toMatch(/all: unset.*efface les déclarations/);
    expect(poseCss('.previsualisation-cadre { all: initial; }'))
      .toMatch(/efface les déclarations/);
  });

  it('« border-image » remplace le liseré que la porte vient de mesurer', () => {
    expect(poseCss('.previsualisation-cadre { border-image: linear-gradient(#0000, #0000) 1 fill; }'))
      .toMatch(/border-image:.*refuse/);
  });

  it('et « border-image: none », la valeur inerte, passe', () => {
    expect(poseCss('.previsualisation-cadre { border-image: none; }')).toEqual('');
  });

  /* 5. `-webkit-text-fill-color` PEINT LE GLYPHE À LA PLACE DE `color`. */
  it('« -webkit-text-fill-color: transparent » rend la pastille illisible', () => {
    expect(poseCss('.previsualisation-pastille { -webkit-text-fill-color: transparent; }'))
      .toMatch(/illisible — -webkit-text-fill-color: transparent/);
  });

  it('et « currentColor » retombe sur « color », sans faux positif', () => {
    expect(poseCss('.previsualisation-pastille { -webkit-text-fill-color: currentColor; }')).toEqual('');
  });

  /* 6. L'INTERLIGNE ROGNE LE TEXTE : la pastille est en `overflow: hidden` et
       ne déclare aucune hauteur, donc sa boîte fait la hauteur de sa ligne. */
  it('« line-height: 0 » découpe le texte que la porte annonçait à 13 px', () => {
    expect(poseCss('.previsualisation-pastille { line-height: 0; }'))
      .toMatch(/interligne de la pastille rogne son texte \(0 px < 13 px\)/);
  });

  it('par le raccourci aussi : « font: 700 13px/0 system-ui »', () => {
    expect(poseCss('.previsualisation-pastille { font: 700 13px/0 system-ui; }'))
      .toMatch(/rogne son texte \(0 px < 13 px\)/);
  });

  it('et en pourcentage : « line-height: 50% » vaut 6.5 px pour 13 px de texte', () => {
    expect(poseCss('.previsualisation-pastille { line-height: 50%; }'))
      .toMatch(/rogne son texte \(6\.5 px < 13 px\)/);
  });

  it('« 2em » se convertit — il se rapporte à la taille lue — et passe', () => {
    expect(poseCss('.previsualisation-pastille { line-height: 2em; }')).toEqual('');
  });

  it('« 3rem » ne se convertit pas : refusé plutôt que comparé à tort', () => {
    expect(poseCss('.previsualisation-pastille { line-height: 3rem; }'))
      .toMatch(/ne sait pas le convertir/);
  });

  it('et l’interligne de la feuille, 1.5 fois la taille, ne déclenche rien', () => {
    expect(FEUILLE_PREVISUALISATION).toContain(`font: 700 ${ref.taillePastillePx}px/1.5`);
    dossierConforme();
    expect(griefsDe()).toEqual([]);
  });
});

/* LES CINQ TROUS QUI RESTENT, TENUS PAR UN TEST PLUTÔT QUE PAR UNE PHRASE.
 *
 * Ce bloc affirme que la porte LAISSE PASSER ces cinq-là. C'est volontaire, et
 * c'est la seule façon d'empêcher la liste de redevenir fausse : si quelqu'un
 * en referme un sans mettre la liste à jour, le test rougit et lui demande de
 * l'écrire. Une liste de trous non gardée redevient décorative en un cycle —
 * c'est exactement ce qui vient d'arriver à la précédente.
 * Les raisons de ne PAS les refermer sont en tête de
 * `scripts/verifier-previsualisation.mjs` ; en deux mots : il faudrait peindre
 * la page, et la porte lit du texte. */
describe('les cinq trous que la porte assume, et qu’elle déclare', () => {
  const poseCss = (ajout: string) => {
    dossierConforme();
    writeFileSync(join(dossier, 'previsualisation.css'), `${FEUILLE_PREVISUALISATION}\n${ajout}\n`);
    return griefsDe();
  };

  it('1. une opacité presque nulle passe — juger un contraste demanderait un fond', () => {
    expect(poseCss('.previsualisation-cadre { opacity: 0.05; }')).toEqual([]);
  });

  it('2. « text-indent: -999px » passe — la porte ignore la largeur peinte', () => {
    expect(poseCss('.previsualisation-pastille { text-indent: -999px; }')).toEqual([]);
  });

  /* LES HUIT DÉCLARATIONS SONT TESTÉES, PAS DEUX. Écrire huit exemples dans la
     liste et n'en tenir que deux referait, en plus petit, la faute qu'on vient
     de corriger : une liste qui affirme plus que ce qu'elle garde. */
  it('3. la géométrie de la boîte passe — il faudrait connaître la fenêtre et peindre', () => {
    for (const regle of [
      '.previsualisation-cadre { transform: translateX(-99999px); }',
      '.previsualisation-cadre { translate: -99999px; }',
      '.previsualisation-cadre { left: -9999px; }',
      '.previsualisation-cadre { top: 100vh; }',
      '.previsualisation-cadre { inset: 100%; }',
      '.previsualisation-pastille { margin-left: -9999px; }',
      '.previsualisation-cadre { position: static; }',
      '.previsualisation-cadre { contain: strict; }',
    ]) {
      const griefs = poseCss(regle);
      expect(griefs, `${regle} → ${griefs.join(' | ')}`).toEqual([]);
    }
  });

  it('4. « z-index: -1 » passe — la porte ne compose pas les feuilles entre elles', () => {
    expect(poseCss('.previsualisation-cadre { z-index: -1; }')).toEqual([]);
  });

  it('5. une boîte d’un pixel passe — le cadre ne déclare aucune taille de référence', () => {
    expect(poseCss('.previsualisation-cadre { width: 1px; }')).toEqual([]);
    // Et le plancher du pixel, lui, tient toujours un cran plus bas.
    expect(poseCss('.previsualisation-cadre { width: 0.5px; }').join(' ')).toMatch(/sous le pixel/);
  });

  it('et la tête du script déclare ces cinq-là, nommément', () => {
    const source = readFileSync(new URL('../scripts/verifier-previsualisation.mjs', import.meta.url), 'utf-8');
    const entete = source.slice(0, source.indexOf('const REFERENCE_MARQUAGE'));
    for (const mot of ['opacity', 'text-indent', 'GÉOMÉTRIE DE LA BOÎTE', 'EMPILEMENT', 'ENTRE UN PIXEL ET LA RÉFÉRENCE']) {
      expect(entete, `« ${mot} » manque à la liste déclarée`).toContain(mot);
    }
  });
});
