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
  neutraliserMetadonneesProduction,
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

  it('préfixe le titre de l’onglet', () => {
    expect(marquee).toContain(`<title>${PREFIXE_TITRE}Infonovice Maps — cartographie française et open source</title>`);
  });

  it('préfixe AUSSI og:title — et la première version avait tort de ne pas le faire', () => {
    /* RENVERSEMENT ASSUMÉ (vérificateur indépendant, 13/09). Ce test disait
       exactement le contraire, au motif que « og:title n'est pas le titre de
       la page : le réécrire changerait la vignette de partage sans rien
       apprendre au testeur qui a l'écran devant lui ». Le raisonnement
       s'arrête une personne trop tôt. Le testeur qui a l'écran devant lui voit
       le bandeau ; c'est celui à qui il ENVOIE le lien qui ne voit qu'une
       vignette — et cette vignette annonçait la production mot pour mot.
       Changer la vignette de partage n'est pas un dégât : c'est l'objet. */
    expect(marquee).toContain(`<meta property="og:title" content="${PREFIXE_TITRE}Infonovice Maps">`);
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

describe('la préversion se dit aussi quand on PARTAGE son lien', () => {
  /* LE DÉFAUT, TROUVÉ PAR LE VÉRIFICATEUR INDÉPENDANT (13/09). Le `dist/` de
     préversion portait `<link rel="canonical" href="https://maps.infonovice.fr/">`
     et un `og:url` de production. Autrement dit : la page se disait préversion
     à qui l'ouvrait, et production à qui recevait son lien. Un testeur AFUVE
     qui partage l'URL faisait croire à de la production — le dégât n° 1,
     déplacé du navigateur vers la messagerie. */
  const PAGE_METADONNEES = [
    '<!doctype html>',
    '<html lang="fr">',
    '<head>',
    '  <title>Infonovice Maps</title>',
    '  <link rel="canonical" href="https://maps.infonovice.fr/">',
    '  <meta property="og:site_name" content="Infonovice Maps">',
    '  <meta property="og:url" content="https://maps.infonovice.fr/">',
    '  <meta property="og:title" content="Infonovice Maps — cartographie française">',
    '  <meta property="og:image" content="https://maps.infonovice.fr/partage-social.png">',
    '  <script type="application/ld+json">',
    '  { "@type": "WebApplication", "url": "https://maps.infonovice.fr/" }',
    '  </script>',
    '</head>',
    '<body><h1>Carte</h1></body>',
    '</html>',
  ].join('\n');

  const marquee = marquerHtmlPrevisualisation(PAGE_METADONNEES, 'index.html');

  it('retire le canonical de production', () => {
    expect(marquee).not.toMatch(/rel="canonical"/);
  });

  it('retire og:url plutôt que d’en inventer un', () => {
    // L'URL de déploiement n'est pas connue à la construction. Absente, la
    // vignette retombe sur l'URL réellement partagée — qui, elle, est vraie.
    expect(marquee).not.toMatch(/property="og:url"/);
  });

  it('retire le bloc JSON-LD, qui n’affirme que des choses sur la production', () => {
    expect(marquee).not.toMatch(/ld\+json/);
    expect(marquee).not.toContain('WebApplication');
  });

  it('préfixe og:title et og:site_name, les deux lignes que lit un humain', () => {
    expect(marquee).toContain(`<meta property="og:title" content="${PREFIXE_TITRE}Infonovice Maps — cartographie française">`);
    expect(marquee).toContain('<meta property="og:site_name" content="Infonovice Maps — PRÉVISUALISATION">');
  });

  it('laisse og:image tranquille : c’est le même dessin, pas une affirmation', () => {
    expect(marquee).toContain('<meta property="og:image" content="https://maps.infonovice.fr/partage-social.png">');
  });

  it('retire et préfixe aussi quand le HTML est écrit autrement — 6e revue Codex', () => {
    /* QUATRE VARIANTES, TOUTES DU HTML VALIDE, TOUTES PASSÉES EN REVUE :
       guillemets simples, espaces autour du `=`, `content` avant `property`,
       un attribut de plus sur le `<script>`. Et un `>` dans une valeur
       d'attribut, qui coupait la balise en deux et laissait un fragment de
       texte dans la page. */
    const varie = [
      '<!doctype html>',
      '<html lang="fr">',
      '<head>',
      '  <title>Infonovice Maps</title>',
      "  <link rel='canonical' href='https://maps.infonovice.fr/' title='Carte > accueil'>",
      '  <meta content="Infonovice Maps" property="og:title">',
      "  <meta property = 'og:url' content='https://maps.infonovice.fr/'>",
      '  <script id="schema" type="application/ld+json">{"url":"https://maps.infonovice.fr/"}</script>',
      '</head>',
      '<body><h1>Carte</h1></body>',
      '</html>',
    ].join('\n');
    const sortie = marquerHtmlPrevisualisation(varie, 'index.html');
    expect(sortie).not.toMatch(/canonical/);
    expect(sortie).not.toMatch(/og:url/);
    expect(sortie).not.toMatch(/ld\+json/);
    expect(sortie).toContain(`property="og:title"`);
    expect(sortie).toContain(`content="${PREFIXE_TITRE}Infonovice Maps"`);
    // Le fragment de texte parasite : la balise est retirée ENTIÈREMENT.
    expect(sortie).not.toMatch(/accueil/);
  });

  it('7e revue Codex : références de caractères, rel en liste, data-content, textarea', () => {
    const retors = [
      '<!doctype html>',
      '<html lang="fr">',
      '<head>',
      '  <title>Infonovice Maps</title>',
      '  <link rel="alternate canonical" href="https://maps.infonovice.fr/">',
      '  <meta property="og&#58;url" content="https://maps.infonovice.fr/">',
      '  <meta data-content="ancien" property="og:title" content="Maps">',
      '  <script id="s" type="application/ld&#43;json">{"url":"x"}</script>',
      '  <!-- exemple : <link rel="canonical" href="https://maps.infonovice.fr/"> -->',
      '</head>',
      '<body>',
      '  <textarea><link rel="canonical" href="https://maps.infonovice.fr/"></textarea>',
      '</body>',
      '</html>',
    ].join('\n');
    const sortie = marquerHtmlPrevisualisation(retors, 'index.html');

    // `rel` est une liste ; `&#58;` et `&#43;` sont décodés comme par un
    // navigateur ; le retrait porte bien sur les balises du <head>.
    expect(sortie).not.toContain('rel="alternate canonical"');
    expect(sortie).not.toContain('og&#58;url');
    expect(sortie).not.toContain('ld&#43;json');

    // `data-content` n'est PAS `content` : c'est le vrai titre qui est préfixé.
    expect(sortie).toContain('data-content="ancien"');
    expect(sortie).toContain(`content="${PREFIXE_TITRE}Maps"`);

    // Le commentaire du <head> et le <textarea> du <body> sont intacts : une
    // transformation qui efface du contenu de page est pire que le défaut.
    expect(sortie).toContain('<!-- exemple : <link rel="canonical"');
    expect(sortie).toContain('<textarea><link rel="canonical"');
  });

  it('8e revue Codex : un « </head> » en commentaire, une balise citée en JavaScript', () => {
    const piege = [
      '<!doctype html>',
      '<html lang="fr">',
      '<head>',
      '  <title>Infonovice Maps</title>',
      '  <!-- </head> -->',
      '  <link rel="canonical" href="https://maps.infonovice.fr/">',
      `  <script>const exemple = '<link rel="canonical" href="https://x/">';</script>`,
      '</head>',
      '<body><h1>Carte</h1></body>',
      '</html>',
    ].join('\n');
    const sortie = marquerHtmlPrevisualisation(piege, 'index.html');

    // Le vrai canonical, écrit APRÈS un « </head> » cité, est bien retiré.
    expect(sortie).not.toContain('href="https://maps.infonovice.fr/"');
    // Et la chaîne JavaScript est intacte : amputer un script en silence est
    // pire que le défaut qu'on répare.
    expect(sortie).toContain(`const exemple = '<link rel="canonical" href="https://x/">';`);
    expect(sortie).toContain('<!-- </head> -->');
  });

  it('9e revue Codex : un commentaire cité DANS un script est rendu intact', () => {
    /* MASQUES IMBRIQUÉS. Le commentaire est masqué le premier, le script qui le
       contient ensuite : une seule passe de restitution rendait le script avec,
       à l'intérieur, un jeton de masque jamais remplacé. */
    const imbrique = [
      '<!doctype html>',
      '<html lang="fr">',
      '<head>',
      '  <title>Infonovice Maps</title>',
      `  <script>const exemple = '<!-- exemple -->';</script>`,
      '</head>',
      '<body><h1>Carte</h1></body>',
      '</html>',
    ].join('\n');
    const sortie = marquerHtmlPrevisualisation(imbrique, 'index.html');
    expect(sortie).toContain(`const exemple = '<!-- exemple -->';`);
    expect(sortie).not.toContain('\u0000');
  });

  it('et un marquage rejoué deux fois ne double pas le préfixe', () => {
    const une = marquerHtmlPrevisualisation(
      '<html><head><title>T</title><meta property="og:title" content="M"></head><body></body></html>',
      'index.html',
    );
    // La ré-entrée est déjà gardée par `data-previsualisation="cadre"`, mais la
    // neutralisation, elle, doit rester idempotente si on l'appelle seule.
    expect(neutraliserMetadonneesProduction(une)).toBe(une);
  });

  it('et la production, elle, garde tout : le marquage ne s’applique qu’en préversion', () => {
    // Garde-fou croisé. `marquerHtmlPrevisualisation` n'est appelée que par le
    // plugin, et le plugin ne s'allume que sur INFONOVICE_ENVIRONNEMENT ; ce
    // test vérifie l'autre moitié : le fichier SOURCE n'a pas été amputé.
    const source = readFileSync(resolve(__dirname, '../index.html'), 'utf-8');
    expect(source).toContain('<link rel="canonical" href="https://maps.infonovice.fr/">');
    expect(source).toContain('<meta property="og:url" content="https://maps.infonovice.fr/">');
  });
});
