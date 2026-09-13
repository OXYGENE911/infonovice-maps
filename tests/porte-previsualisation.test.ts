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
