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

/** Une déclaration qui rend l'élément invisible, espaces et variantes comprises. */
function rendInvisible(corps) {
  if (/display\s*:\s*none/i.test(corps)) return true;
  if (/visibility\s*:\s*hidden/i.test(corps)) return true;
  if (/content-visibility\s*:\s*hidden/i.test(corps)) return true;
  // `opacity: 0` éteint ; `opacity: 0.5` non. Le nombre est LU, pas deviné —
  // la première version rejetait « 0.5 » (faux positif relevé par Codex).
  for (const m of corps.matchAll(/opacity\s*:\s*([0-9.]+)/gi)) {
    if (Number.parseFloat(m[1]) === 0) return true;
  }
  return false;
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
    } else if (!cadre.some((c) => /pointer-events\s*:\s*none/i.test(c))) {
      griefs.push('previsualisation.css : le cadre intercepterait les clics');
    } else if ([...cadre, ...pastille].some(rendInvisible)) {
      // UN BANDEAU INVISIBLE EST PIRE QU'UN BANDEAU ABSENT : il rassure la
      // porte sans rien dire au testeur.
      griefs.push('previsualisation.css : une règle rend le bandeau invisible');
    } else if (!cadre.some((c) => /border\s*:/i.test(c) || /border-width\s*:/i.test(c))) {
      griefs.push('previsualisation.css : le cadre ne dessine aucun liseré');
    } else constats.push('previsualisation.css : cadre visible et inerte, pastille visible');
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
