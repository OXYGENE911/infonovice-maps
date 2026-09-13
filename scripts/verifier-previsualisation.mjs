// LA PORTE AVANT LE DÉPLOIEMENT DE LA PRÉVERSION (STAGING-1, 13/09/2026).
//
// POURQUOI UNE PORTE ET PAS UNE CONFIANCE. Le marquage « prévisualisation »
// et le double verrou d'indexation sont produits par un plugin Vite. Un plugin
// peut cesser de s'appliquer sans rien casser d'autre : une variable
// d'environnement mal orthographiée dans le workflow, un `apply: 'build'` qui
// ne se déclenche pas, une mise à jour de Vite qui change l'ordre des
// transformations. Le symptôme serait alors une préversion qui ressemble
// EXACTEMENT à la production et que les moteurs ont le droit d'indexer —
// c'est-à-dire les deux dégâts que ce travail existe pour empêcher, arrivés en
// silence.
//
// DEUX REVUES CODEX ONT MONTRÉ DIX FAÇONS DE LA FRANCHIR (13/09). Toutes de la
// même famille : la porte cherchait des CHAÎNES là où il fallait lire une
// STRUCTURE. Un `X-Robots-Tag` en commentaire, sous `/prive/*`, sous le domaine
// d'un tiers, adressé au seul Bingbot, ou détaché plus bas par `! X-Robots-Tag`.
// Un `Disallow: /` réservé à un robot, ou annulé par un groupe `Googlebot:
// Allow: /` placé après. Un bandeau éteint par une SECONDE règle CSS, ou par un
// `display : none` avec des espaces. Une page dans un sous-dossier. Un lien de
// feuille qui ne résout nulle part.
// Elle lit donc désormais les GROUPES de robots.txt, les BLOCS de `_headers`,
// TOUTES les règles du CSS portant un sélecteur, et elle descend dans les
// sous-dossiers en vérifiant que le lien de chaque page mène à un fichier qui
// existe. Chacun des dix contournements est un test
// (tests/porte-previsualisation.test.ts).
//
// CE QU'ELLE NE SAIT PAS FAIRE, ET IL FAUT LE DIRE : elle lit du texte, elle ne
// peint pas la page. Elle refuse les façons ÉCRITES de disparaître ; le rendu
// réel reste jugé à la capture d'écran, en navigateur.
//
// Usage : node scripts/verifier-previsualisation.mjs [dossier]  (défaut : dist)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

/** La SEULE feuille de bandeau admise : celle que le point 3 contrôle. */
const FEUILLE_ATTENDUE = 'previsualisation.css';

/** Retire le commentaire « # … » d'une ligne de robots.txt ou de _headers. */
function sansCommentaire(ligne) {
  const i = ligne.indexOf('#');
  return i === -1 ? ligne : ligne.slice(0, i);
}

/** Coupe « nom: valeur » en deux, ou rend null. */
function paire(ligne) {
  const i = ligne.indexOf(':');
  if (i === -1) return null;
  return [ligne.slice(0, i).trim().toLowerCase(), ligne.slice(i + 1).trim()];
}

/** Toutes les pages `.html` livrées, sous-dossiers compris, en chemins relatifs. */
function pagesHtml(racine, prefixe = '') {
  const trouvees = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    const sous = prefixe === '' ? entree : posix.join(prefixe, entree);
    if (statSync(chemin).isDirectory()) trouvees.push(...pagesHtml(chemin, sous));
    else if (entree.endsWith('.html')) trouvees.push(sous);
  }
  return trouvees;
}

/** TOUTES les règles portant ce sélecteur, pas seulement la première : en CSS,
    c'est la DERNIÈRE qui gagne, et c'est par là qu'on éteint un bandeau. */
function reglesCss(css, selecteur) {
  const corps = [];
  let depuis = 0;
  for (;;) {
    const debut = css.indexOf(selecteur, depuis);
    if (debut === -1) return corps;
    const ouvre = css.indexOf('{', debut);
    const ferme = css.indexOf('}', ouvre);
    if (ouvre === -1 || ferme === -1) return corps;
    corps.push(css.slice(ouvre + 1, ferme));
    depuis = ferme + 1;
  }
}

/* LIRE LA VALEUR, PAS SEULEMENT LA PRÉSENCE (défaut trouvé par le vérificateur
   indépendant, 13/09). La porte exigeait qu'une déclaration `border:` EXISTE
   sans jamais lire son épaisseur : `.previsualisation-cadre { border: 0 solid
   #FFB300; }` et `.previsualisation-pastille { font-size: 0; }` la faisaient
   sortir en code 0 — et elle imprimait « cadre visible et pastille visible ».
   C'est la troisième fois que ce trou se rouvre sous une forme voisine, et
   c'est le même trou à chaque fois : chercher un MOT là où il faut lire un
   NOMBRE. Tout ce qui suit lit des nombres. */

/** Les déclarations d'un corps de règle, dans l'ordre, propriété en minuscules.
    LIMITE ASSUMÉE : la coupe se fait sur « ; », donc une valeur qui en
    contiendrait un (une `url(data:…;base64,…)`) serait mal lue. La feuille de
    préversion n'en contient pas, et la porte n'a pas à devenir un analyseur
    CSS complet — mais il faut le savoir avant d'en mettre une. */
function declarations(corps) {
  const paires = [];
  for (const brute of corps.replace(/\/\*[\s\S]*?\*\//g, ' ').split(';')) {
    const d = brute.trim();
    if (d === '') continue;
    const i = d.indexOf(':');
    if (i === -1) continue;
    paires.push([d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]);
  }
  return paires;
}

/* LA CASCADE, RÉDUITE À CE QUI NOUS CONCERNE. À sélecteur égal, la DERNIÈRE
   déclaration gagne — sauf qu'une déclaration `!important` ne se laisse pas
   écraser par une déclaration ordinaire écrite plus bas. Sans cette nuance,
   `border: 0 !important` placé AVANT la bonne règle repassait. */
function declarationsEffectives(corpsListe) {
  const retenues = new Map();
  let ordre = 0;
  for (const corps of corpsListe) {
    for (const [prop, brute] of declarations(corps)) {
      const important = /!\s*important$/i.test(brute);
      const valeur = brute.replace(/!\s*important$/i, '').trim();
      const ancienne = retenues.get(prop);
      ordre += 1;
      if (ancienne !== undefined && ancienne.important && !important) continue;
      retenues.set(prop, { valeur, important, ordre });
    }
  }
  return retenues;
}

/** Parmi plusieurs propriétés concurrentes (raccourci et propriétés longues),
    celle qui l'emporte : `!important` d'abord, puis la plus tardive. */
function gagnante(effectives, proprietes) {
  let meilleure = null;
  for (const prop of proprietes) {
    const d = effectives.get(prop);
    if (d === undefined) continue;
    if (meilleure === null
      || (d.important && !meilleure.important)
      || (d.important === meilleure.important && d.ordre > meilleure.ordre)) {
      meilleure = { prop, ...d };
    }
  }
  return meilleure;
}

const MOT_LONGUEUR = /^[+-]?(\d+(\.\d+)?|\.\d+)(px|em|rem|ex|ch|pt|pc|in|cm|mm|q|vw|vh|vmin|vmax|%)?$/i;
const MOT_STYLE_BORDURE = /^(none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset)$/i;

/** Le nombre de pixels « logiques » d'un mot de longueur, ou null si ce n'en
    est pas un. `thin|medium|thick` valent 1, 3 et 5 px (valeurs usuelles des
    navigateurs) : seul le fait qu'elles soient NON NULLES nous importe. */
function longueur(mot) {
  if (/^thin$/i.test(mot)) return 1;
  if (/^medium$/i.test(mot)) return 3;
  if (/^thick$/i.test(mot)) return 5;
  return MOT_LONGUEUR.test(mot) ? Number.parseFloat(mot) : null;
}

const NOMS_COULEURS = {
  transparent: 'transparent', white: '#ffffff', black: '#000000', red: '#ff0000',
  lime: '#00ff00', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff',
  aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', silver: '#c0c0c0',
  gray: '#808080', grey: '#808080', maroon: '#800000', olive: '#808000',
  green: '#008000', purple: '#800080', teal: '#008080', navy: '#000080',
};

/** Une couleur réduite à une forme comparable, ou null si le mot n'en est pas
    une. Une couleur totalement transparente devient « transparent ». */
function couleur(mot) {
  const m = mot.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(NOMS_COULEURS, m)) return NOMS_COULEURS[m];
  const hex = /^#([0-9a-f]{3,8})$/.exec(m);
  if (hex !== null) {
    const c = hex[1];
    if (c.length === 3 || c.length === 4) {
      if (c.length === 4 && c[3] === '0') return 'transparent';
      return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
    }
    if (c.length === 6) return `#${c}`;
    if (c.length === 8) return c.slice(6) === '00' ? 'transparent' : `#${c.slice(0, 6)}`;
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(m);
  if (rgb !== null) {
    const parts = rgb[1].split(/[,/\s]+/).filter((p) => p !== '');
    if (parts.length >= 4 && Number.parseFloat(parts[3]) === 0) return 'transparent';
    if (parts.length >= 3) {
      /* RAMENÉ À LA MÊME FORME QUE L'HEXADÉCIMAL, ET C'EST LE POINT : sinon
         `#FFB300` et `rgb(255, 179, 0)` sont deux chaînes différentes pour la
         même couleur, et le contournement tient en une réécriture. */
      const octets = parts.slice(0, 3).map((p) => {
        const n = p.endsWith('%')
          ? Math.round((Number.parseFloat(p) * 255) / 100)
          : Math.round(Number.parseFloat(p));
        return Number.isFinite(n) ? Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0') : null;
      });
      if (octets.every((o) => o !== null)) return `#${octets.join('')}`;
    }
  }
  return null;
}

/** La taille de police EFFECTIVE, `font-size` comme raccourci `font`, ou null
    si aucune n'est déclarée (elle est alors héritée, donc hors de notre vue). */
function tailleTexte(effectives) {
  const d = gagnante(effectives, ['font-size', 'font']);
  if (d === null) return null;
  if (d.prop === 'font-size') return longueur(d.valeur.split(/\s+/)[0]);
  /* DANS LE RACCOURCI `font`, LA TAILLE EST LE DERNIER MOT DE TAILLE AVANT LA
     FAMILLE : dans « 700 13px/1.5 system-ui », « 700 » est la graisse et
     « 13px/1.5 » la taille. Prendre le PREMIER mot qui ressemble à un nombre
     laisserait passer « font: 700 0/1.5 system-ui ». */
  let taille = null;
  /* LES ESPACES AUTOUR DE LA BARRE SONT LÉGAUX, ET COÛTAIENT LA PORTE : Codex
     est passé avec `font: 700 0 / 1.5 system-ui`, où la lecture mot à mot
     retenait « 1.5 » (l'interligne) comme taille. On recolle la barre d'abord. */
  const recolle = d.valeur.replace(/\s*\/\s*/g, '/');
  for (const mot of recolle.split(/\s+/).filter((m) => m !== '')) {
    const avantBarre = mot.split('/')[0];
    if (mot.includes('/')) { const v = longueur(avantBarre); if (v !== null) taille = v; continue; }
    if (/^(xx-small|x-small|small|large|x-large|xx-large|smaller|larger)$/i.test(mot)) { taille = 16; continue; }
    const v = longueur(mot);
    if (v !== null) taille = v;
  }
  return taille;
}

/** Le liseré effectif du cadre : son épaisseur la plus fine, son style et sa
    couleur. `null` en épaisseur = aucune déclaration de bordure. */
function liseré(effectives) {
  const cotes = ['top', 'right', 'bottom', 'left'];
  const motsDe = (d) => (d === null ? [] : d.valeur.split(/\s+/).filter((m) => m !== ''));

  /* CÔTÉ PAR CÔTÉ, ET C'EST LA SEULE FAÇON CORRECTE. La première version
     prenait le minimum de TOUTES les largeurs rencontrées, sans regarder
     l'ordre : `border-bottom-width: 0; border: 4px solid` était refusé alors
     que le raccourci, écrit après, redonne 4 px aux quatre côtés (faux positif
     relevé par Codex). Et `border-top-width: 0; border-bottom-width: 4px`
     aurait été accepté à tort. Pour chaque côté, on redemande donc qui gagne
     entre le raccourci, la propriété longue, et la propriété de ce côté. */
  const nValeurs = (mots, index) => {
    // `border-width: a b c d` → haut, droite, bas, gauche ; 1, 2 ou 3 valeurs
    // se répartissent selon la règle usuelle du CSS.
    if (mots.length === 0) return null;
    const ordre = [[0, 0, 0, 0], [0, 1, 0, 1], [0, 1, 2, 1], [0, 1, 2, 3]][Math.min(mots.length, 4) - 1];
    return mots[ordre[index]];
  };

  const parCote = cotes.map((cote, index) => {
    const d = gagnante(effectives, ['border', 'border-width', `border-${cote}`, `border-${cote}-width`]);
    if (d === null) return null;
    const mots = motsDe(d);
    if (d.prop === 'border' || d.prop === `border-${cote}`) {
      // Raccourci : la largeur omise vaut `medium` (3 px) ; `none`/`hidden` est
      // traité par le style, pas par la largeur.
      const trouvees = mots.map(longueur).filter((v) => v !== null);
      return trouvees.length > 0 ? trouvees[0] : 3;
    }
    const mot = d.prop === 'border-width' ? nValeurs(mots, index) : mots[0];
    return mot === null ? null : longueur(mot);
  });

  const connues = parCote.filter((v) => v !== null && v !== undefined);
  const epaisseur = connues.length === 0 ? null : Math.min(...connues);

  const styles = gagnante(effectives, ['border', 'border-style',
    ...cotes.map((c) => `border-${c}`), ...cotes.map((c) => `border-${c}-style`)]);
  const couleurs = gagnante(effectives, ['border', 'border-color',
    ...cotes.map((c) => `border-${c}`), ...cotes.map((c) => `border-${c}-color`)]);
  const style = styles === null
    ? null
    : (motsDe(styles).find((m) => MOT_STYLE_BORDURE.test(m)) ?? null);
  const teinte = couleurs === null
    ? null
    : (motsDe(couleurs).map(couleur).find((c) => c !== null && c !== undefined) ?? null);
  return { epaisseur, style, teinte };
}

/* CE QUI FAIT DISPARAÎTRE UN ÉLÉMENT SANS ÉCRIRE `display: none`. Chaque entrée
   est une façon vue ou plausible d'éteindre le bandeau tout en laissant la
   porte contente. La fonction rend la RAISON, pas un booléen : un grief qui
   nomme la règle fautive se corrige, un grief muet se contourne. */
function raisonInvisible(effectives) {
  const val = (prop) => (effectives.get(prop)?.valeur ?? null);

  if (/^none$/i.test(val('display') ?? '')) return 'display: none';
  if (/^(hidden|collapse)$/i.test(val('visibility') ?? '')) return `visibility: ${val('visibility')}`;
  if (/^hidden$/i.test(val('content-visibility') ?? '')) return 'content-visibility: hidden';

  /* `opacity: 0` éteint ; `opacity: 0.5` non. Le nombre est LU, pas deviné —
     la première version rejetait « 0.5 » (faux positif relevé par Codex).
     ET UNE OPACITÉ QU'ON NE SAIT PAS LIRE EST REFUSÉE, PAS ACCEPTÉE : Codex a
     franchi la porte avec `opacity: calc(0)`, que `parseFloat` rend NaN. Une
     garde qui ne comprend pas ce qu'elle lit doit dire non ; c'est le seul sens
     dans lequel une porte a le droit de se tromper. */
  const o = val('opacity');
  if (o !== null) {
    const n = /%$/.test(o) ? Number.parseFloat(o) / 100 : Number.parseFloat(o);
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)%?$/.test(o.trim())) return `opacity illisible (${o})`;
    if (n === 0) return `opacity: ${o}`;
  }

  // Une mise à l'échelle nulle : l'élément occupe zéro pixel peint.
  const t = val('transform');
  if (t !== null && /\bscale[3dxyz]*\(\s*0*\.?0+\s*[,)]/i.test(t)) return `transform: ${t}`;
  const s = val('scale');
  if (s !== null && s.split(/\s+/).some((m) => Number.parseFloat(m) === 0)) return `scale: ${s}`;

  // Une boîte de taille nulle, sur n'importe laquelle des dimensions.
  for (const prop of ['width', 'height', 'max-width', 'max-height']) {
    const v = val(prop);
    if (v === null) continue;
    const n = longueur(v.split(/\s+/)[0]);
    if (n === 0) return `${prop}: ${v}`;
  }

  // Les découpes qui ne laissent rien voir.
  const cp = val('clip-path');
  if (cp !== null && /inset\(\s*(100%|50%\s+50%)/i.test(cp)) return `clip-path: ${cp}`;
  const cl = val('clip');
  if (cl !== null && /^rect\(\s*0[a-z%]*\s*[, ]\s*0[a-z%]*\s*[, ]\s*0[a-z%]*\s*[, ]\s*0[a-z%]*\s*\)$/i.test(cl)) {
    return `clip: ${cl}`;
  }

  // Le texte poussé hors de sa boîte.
  const ti = val('text-indent');
  if (ti !== null) { const n = longueur(ti.split(/\s+/)[0]); if (n !== null && n <= -1000) return `text-indent: ${ti}`; }

  return null;
}

/** La couleur du texte et celle du fond, quand elles sont déclarées. */
function contrasteNul(effectives) {
  const texte = couleur(effectives.get('color')?.valeur ?? '');
  if (texte === null) return null; // héritée : hors de notre vue, et on le dit
  if (texte === 'transparent') return 'color: transparent';
  /* LA CASCADE VAUT ICI AUSSI, ET C'ÉTAIT UN VRAI TROU (Codex) : donner la
     priorité à `background-color` quel que soit l'ordre laissait passer
     `background-color: #fff; background: #000` (texte noir sur fond noir) et
     refusait à tort `background-color: #000; background: #fff`. C'est la
     DERNIÈRE déclarée qui peint. */
  const d = gagnante(effectives, ['background-color', 'background']);
  if (d === null) return null;
  const fond = d.prop === 'background-color'
    ? couleur(d.valeur)
    : (d.valeur.split(/\s+/).map(couleur).find((c) => c !== null && c !== undefined) ?? null);
  if (fond === null) return null;
  if (fond === texte) return `texte et fond à la même couleur (${texte})`;
  return null;
}

/* LE ROBOT DE RÉFÉRENCE EST `*`, MAIS IL NE SUFFIT PAS. Un moteur choisit LE
   groupe le plus spécifique qui le nomme : `User-agent: *` / `Disallow: /`
   suivi de `User-agent: Googlebot` / `Allow: /` laisse Googlebot tout explorer.
   D'où la règle simple et vérifiable : il faut un groupe `*`, TOUS les groupes
   doivent interdire la racine, et aucun `Allow:` ne doit exister nulle part. */
function robotsInterditTout(robots) {
  const groupes = [];
  let courant = null;
  let dansEnTetes = false;
  for (const brute of robots.split('\n')) {
    const ligne = sansCommentaire(brute).trim();
    if (ligne === '') continue;
    const p = paire(ligne);
    if (p === null) continue;
    const [nom, valeur] = p;
    if (nom === 'user-agent') {
      if (!dansEnTetes) { courant = { robots: [], directives: [] }; groupes.push(courant); }
      dansEnTetes = true;
      courant.robots.push(valeur);
      continue;
    }
    dansEnTetes = false;
    // `Sitemap:` est hors groupe ; il est contrôlé ailleurs.
    if (courant !== null && nom !== 'sitemap') courant.directives.push([nom, valeur]);
  }
  if (groupes.length === 0) return false;
  if (!groupes.some((g) => g.robots.includes('*'))) return false;
  return groupes.every((g) =>
    g.directives.some(([nom, valeur]) => nom === 'disallow' && valeur === '/')
    && !g.directives.some(([nom]) => nom === 'allow'));
}

/* LE MOTIF DOIT COUVRIR TOUT LE SITE, LA DIRECTIVE DOIT ÊTRE ACTIVE, ET RIEN
   NE DOIT LA RETIRER PLUS BAS.
   - Motif : `/*` exactement, en relatif. Un motif en URL absolue ne vaut que
     pour l'hôte qu'il nomme — `https://ailleurs.example/*` ne protège rien
     d'ici, et la porte n'a pas à deviner les hôtes servis.
   - Directive : `noindex` doit être une directive NUE. Cloudflare accepte
     `X-Robots-Tag: bingbot: noindex`, qui ne dit rien à Google.
   - `! X-Robots-Tag` DÉTACHE l'en-tête : sa seule présence disqualifie. */
function entetesNoindexPartout(entetes) {
  let motif = null;
  let couvre = false;
  for (const brute of entetes.split('\n')) {
    const ligne = sansCommentaire(brute);
    if (ligne.trim() === '') continue;
    if (!/^\s/.test(ligne)) { motif = ligne.trim(); continue; }
    const nue = ligne.trim();
    if (/^!\s*x-robots-tag\b/i.test(nue)) return false;
    if (motif !== '/*') continue;
    const p = paire(nue);
    if (p === null || p[0] !== 'x-robots-tag') continue;
    const directives = p[1].split(',').map((d) => d.trim().toLowerCase());
    // Une directive nue : ni « bingbot: noindex », ni « unavailable_after: … ».
    if (directives.some((d) => d === 'noindex' || d === 'none')) couvre = true;
  }
  return couvre;
}

/* LES BALISES DE MÉTADONNÉES, LUES COMME DES BALISES. Les alternances
   `"[^"]*"|'[^']*'` font que la fin de balise n'est pas confondue avec un `>`
   écrit dans une valeur d'attribut — `title="Carte > accueil"` coupait la
   balise en deux dans la première version. */
const BALISE_SIMPLE = /[ \t]*<(link|meta)\b((?:[^>"']|"[^"]*"|'[^']*')*)\/?>[ \t]*\r?\n?/gi;
const BALISE_SCRIPT = /[ \t]*<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>[\s\S]*?<\/script\s*>[ \t]*\r?\n?/gi;
const ATTRIBUT = /([a-zA-Z0-9_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g;
const PREFIXE_ATTENDU = 'PRÉVISUALISATION — ';

function attributsHtml(interieur) {
  const lus = {};
  for (const m of interieur.matchAll(ATTRIBUT)) {
    lus[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return lus;
}

/** Le fichier visé par un `href`, résolu depuis la page qui le porte. */
function cibleDuLien(href, pageRelative) {
  if (/^[a-z]+:\/\//i.test(href)) return null; // hors du dossier livré
  // LE NAVIGATEUR NE DEMANDE PAS LE FRAGMENT NI LA REQUÊTE : « feuille.css#v1 »
  // charge bien /feuille.css. La porte les coupe donc avant de résoudre, sinon
  // elle refuse une préversion parfaitement servable (relevé en revue).
  const chemin = href.split('#')[0].split('?')[0];
  if (chemin === '') return null;
  if (chemin.startsWith('/')) return chemin.slice(1);
  const dossierPage = posix.dirname(pageRelative);
  return posix.normalize(dossierPage === '.' ? chemin : posix.join(dossierPage, chemin));
}

export function verifierPrevisualisation(dossier) {
  const griefs = [];
  const constats = [];
  const lire = (nom) => {
    const chemin = join(dossier, nom);
    return existsSync(chemin) ? readFileSync(chemin, 'utf-8') : null;
  };

  // 1. robots.txt — le verrou que lit un robot bien élevé.
  const robots = lire('robots.txt');
  if (robots === null) griefs.push('robots.txt absent');
  else if (!robotsInterditTout(robots)) {
    griefs.push('robots.txt : il faut un groupe « User-agent: * », un « Disallow: / » dans CHAQUE groupe, et aucun « Allow: »');
  } else if (/^\s*Sitemap:/im.test(robots)) {
    griefs.push('robots.txt annonce encore un Sitemap de production');
  } else constats.push('robots.txt : tous les groupes en Disallow: /, aucun Allow, aucun Sitemap');

  // 2. _headers — le verrou côté serveur, celui qui tient même sur un lien fuité.
  const entetes = lire('_headers');
  if (entetes === null) griefs.push('_headers absent (en-tête X-Robots-Tag impossible)');
  else if (!entetesNoindexPartout(entetes)) {
    griefs.push('_headers : aucune directive « noindex » nue et active sous le motif « /* »');
  } else constats.push('_headers : X-Robots-Tag noindex actif sur « /* », jamais détaché');

  // 3. La feuille du bandeau. SANS ELLE, LE BANDEAU EST UN TEXTE NU : les six
  //    pages de texte portent une CSP `style-src 'self'` qui interdit le style
  //    en ligne — vu à la capture d'écran, pas deviné.
  const feuille = lire(FEUILLE_ATTENDUE);
  if (feuille === null) griefs.push('previsualisation.css absent (le bandeau serait sans style)');
  else {
    const cadre = reglesCss(feuille, '.previsualisation-cadre');
    const pastille = reglesCss(feuille, '.previsualisation-pastille');
    if (cadre.length === 0 || pastille.length === 0) {
      griefs.push('previsualisation.css : règle du cadre ou de la pastille absente');
    } else {
      const effCadre = declarationsEffectives(cadre);
      const effPastille = declarationsEffectives(pastille);
      const trait = liseré(effCadre);
      const taille = tailleTexte(effPastille);
      // UN BANDEAU INVISIBLE EST PIRE QU'UN BANDEAU ABSENT : il rassure la
      // porte sans rien dire au testeur. On regarde donc CHAQUE façon connue de
      // le faire disparaître, et on lit les valeurs.
      const invisibleCadre = raisonInvisible(effCadre);
      const invisiblePastille = raisonInvisible(effPastille);
      const memeCouleur = contrasteNul(effPastille);
      const avant = griefs.length;

      if (!cadre.some((c) => /pointer-events\s*:\s*none/i.test(c))) {
        griefs.push('previsualisation.css : le cadre intercepterait les clics');
      }
      if (invisibleCadre !== null) {
        griefs.push(`previsualisation.css : une règle rend le bandeau invisible — cadre, ${invisibleCadre}`);
      }
      if (invisiblePastille !== null) {
        griefs.push(`previsualisation.css : une règle rend le bandeau invisible — pastille, ${invisiblePastille}`);
      }
      if (trait.epaisseur === null) {
        griefs.push('previsualisation.css : le cadre ne dessine aucun liseré');
      } else if (trait.epaisseur <= 0) {
        griefs.push(`previsualisation.css : le liseré du cadre a une épaisseur nulle (${trait.epaisseur})`);
      }
      if (trait.style !== null && /^(none|hidden)$/i.test(trait.style)) {
        griefs.push(`previsualisation.css : le liseré du cadre n'est pas dessiné (border-style: ${trait.style})`);
      }
      if (trait.teinte === 'transparent') {
        griefs.push('previsualisation.css : le liseré du cadre est transparent');
      }
      if (taille !== null && taille <= 0) {
        griefs.push(`previsualisation.css : la pastille a une taille de texte nulle (font-size: ${taille})`);
      }
      if (memeCouleur !== null) {
        griefs.push(`previsualisation.css : la pastille est illisible — ${memeCouleur}`);
      }
      if (griefs.length === avant) {
        constats.push(`previsualisation.css : liseré de ${trait.epaisseur} px ${trait.style ?? 'solid'} ${trait.teinte ?? ''}`.trimEnd()
          + `, cadre inerte, pastille à ${taille ?? '(hérité)'} px`);
      }
    }
  }

  // 4. Aucun artefact de production ne doit rester.
  for (const intrus of ['CNAME', 'sitemap.xml']) {
    if (existsSync(join(dossier, intrus))) griefs.push(`${intrus} traîne dans la préversion`);
  }

  // 5. CHAQUE page HTML porte les marques — SOUS-DOSSIERS COMPRIS. Pas « la
  //    page d'accueil » : un testeur peut arriver par « À propos » depuis un
  //    lien partagé, et une page oubliée est une page qui ment.
  const pages = existsSync(dossier) ? pagesHtml(dossier) : [];
  if (pages.length === 0) griefs.push(`aucune page HTML dans ${dossier}/`);
  for (const page of pages) {
    const html = readFileSync(join(dossier, page), 'utf-8');
    if (!/<html[^>]*data-environnement="previsualisation"/i.test(html)) {
      griefs.push(`${page} : <html data-environnement="previsualisation"> manquant`);
    }
    if (!html.includes('data-previsualisation="cadre"')) {
      griefs.push(`${page} : bandeau de prévisualisation manquant`);
    }
    // LE CADRE SANS SA PASTILLE NE DIT RIEN : un liseré ambre sans phrase
    // n'apprend pas à un testeur qu'il n'est pas en production.
    if (!html.includes('previsualisation-pastille') || !html.includes('PRÉVISUALISATION')) {
      griefs.push(`${page} : la pastille « PRÉVISUALISATION » manque dans le bandeau`);
    }
    if (!/<meta name="robots" content="noindex/i.test(html)) {
      griefs.push(`${page} : <meta name="robots" content="noindex…"> manquant`);
    }
    if (!/<title>PRÉVISUALISATION — /.test(html)) {
      griefs.push(`${page} : le titre ne commence pas par « PRÉVISUALISATION — »`);
    }
    /* ET ELLE DOIT SE DIRE AUSSI QUAND ON PARTAGE SON LIEN (vérificateur
       indépendant, 13/09). Le bandeau ne se voit qu'une fois la page ouverte.
       Une vignette de partage, elle, se lit AVANT : si `canonical`, `og:url` ou
       le bloc JSON-LD désignent encore la production, un testeur qui colle
       l'URL de préversion dans une messagerie fait croire à de la production.
       Ce sont les trois affirmations machine ; `og:title` est celle que lit un
       humain. */
    /* LA PORTE LIT LES ATTRIBUTS, PAS DES CHAÎNES. `rel='canonical'` en
       guillemets simples, `property = "og:url"` avec des espaces, `content`
       écrit avant `property`, un `id` de plus sur le `<script>` : Codex a
       franchi chacune de ces variantes, toutes du HTML valide. */
    for (const [balise, nom, interieur] of [...html.matchAll(BALISE_SIMPLE)]
      .map((m) => [m[0], m[1].toLowerCase(), m[2]])) {
      const a = attributsHtml(interieur);
      if (nom === 'link' && (a.rel ?? '').trim().toLowerCase() === 'canonical') {
        griefs.push(`${page} : <link rel="canonical"> désigne encore la production`);
      }
      if (nom !== 'meta') continue;
      const propriete = (a.property ?? '').trim().toLowerCase();
      if (propriete === 'og:url') {
        griefs.push(`${page} : <meta property="og:url"> désigne encore la production`);
      }
      if (propriete === 'og:title' && !(a.content ?? '').startsWith(PREFIXE_ATTENDU)) {
        griefs.push(`${page} : og:title ne dit pas la préversion (« ${a.content ?? ''} », balise ${balise.slice(0, 60)})`);
      }
    }
    for (const m of html.matchAll(BALISE_SCRIPT)) {
      if ((attributsHtml(m[1]).type ?? '').trim().toLowerCase() === 'application/ld+json') {
        griefs.push(`${page} : le bloc JSON-LD de production est resté dans la préversion`);
      }
    }
    /* LE LIEN DOIT MENER À LA FEUILLE QU'ON A VÉRIFIÉE, ET À AUCUNE AUTRE.
       Deux pièges, tous deux trouvés en revue :
       - depuis `aide/index.html`, un href relatif « previsualisation.css »
         demande /aide/previsualisation.css, qui n'existe pas ;
       - une page qui lierait « autre-previsualisation.css » satisfaisait le
         motif tout en chargeant une feuille que la porte n'a jamais lue — et
         qui pouvait éteindre le bandeau.
       D'où : on RÉSOUT chaque lien, et l'un d'eux doit tomber exactement sur
       le fichier contrôlé au point 3. */
    const liens = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)]
      .map((m) => m[1]);
    const mene = liens.some((href) => cibleDuLien(href, page) === FEUILLE_ATTENDUE);
    if (!mene) {
      const vus = liens.length === 0 ? 'aucun lien de feuille' : liens.join(', ');
      griefs.push(`${page} : aucun lien ne mène à ${FEUILLE_ATTENDUE} (${vus})`);
    }
  }
  if (pages.length > 0) constats.push(`${pages.length} page(s) HTML marquée(s) : ${pages.join(', ')}`);

  return { griefs, constats };
}

/* Exécution en ligne de commande. Le module reste importable par les tests,
   qui lui présentent des dossiers volontairement mal fichus. */
if (process.argv[1] && process.argv[1].endsWith('verifier-previsualisation.mjs')) {
  const dossier = process.argv[2] ?? 'dist';
  const { griefs, constats } = verifierPrevisualisation(dossier);
  for (const c of constats) console.log(`  ok — ${c}`);
  if (griefs.length > 0) {
    for (const g of griefs) console.error(`  ÉCHEC — ${g}`);
    console.error(`\n${griefs.length} défaut(s) : ce dossier ne doit PAS être déployé en préversion.`);
    process.exit(1);
  }
  console.log(`\nPréversion conforme : ${dossier}/ peut être déployé.`);
}
