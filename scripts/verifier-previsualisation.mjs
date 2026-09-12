// LA PORTE AVANT LE DÉPLOIEMENT DE LA PRÉVERSION (STAGING-1, 13/09/2026).
//
// POURQUOI UNE PORTE ET PAS UNE CONFIANCE. Le marquage « prévisualisation »
// et le double verrou d'indexation sont produits par un plugin Vite. Un
// plugin peut cesser de s'appliquer sans rien casser d'autre : une variable
// d'environnement mal orthographiée dans le workflow, un `apply: 'build'` qui
// ne se déclenche pas, une mise à jour de Vite qui change l'ordre des
// transformations. Le symptôme serait alors une préversion qui ressemble
// EXACTEMENT à la production et que les moteurs ont le droit d'indexer —
// c'est-à-dire les deux dégâts que ce travail existe pour empêcher, arrivés
// en silence.
//
// POURQUOI ELLE ANALYSE AU LIEU DE CHERCHER DES MOTS (revue Codex, 13/09).
// Premier jet : la porte cherchait la chaîne « X-Robots-Tag: noindex »
// quelque part dans `_headers`, et « Disallow: / » quelque part dans
// `robots.txt`. Codex a montré cinq dossiers NON conformes qu'elle acceptait :
// un en-tête en commentaire, un en-tête posé sur `/prive/*` seulement, un
// `Disallow: /` réservé à Bingbot, une page dans un sous-dossier, un bandeau
// mis en `display: none`. Une porte qu'on franchit en écrivant les bons mots
// au mauvais endroit n'est pas une porte. Elle lit donc les GROUPES de
// `robots.txt`, les BLOCS de `_headers`, les RÈGLES du CSS, et elle descend
// dans les sous-dossiers. Les cinq cas sont devenus des tests
// (tests/porte-previsualisation.test.ts).
//
// Usage : node scripts/verifier-previsualisation.mjs [dossier]  (défaut : dist)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

/** Retire le commentaire « # … » d'une ligne de robots.txt ou de _headers. */
function sansCommentaire(ligne) {
  const i = ligne.indexOf('#');
  return i === -1 ? ligne : ligne.slice(0, i);
}

/** Toutes les pages `.html` livrées, sous-dossiers compris, en chemins relatifs. */
function pagesHtml(racine, prefixe = '') {
  const trouvees = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) {
      trouvees.push(...pagesHtml(chemin, prefixe === '' ? entree : posix.join(prefixe, entree)));
    } else if (entree.endsWith('.html')) {
      trouvees.push(prefixe === '' ? entree : posix.join(prefixe, entree));
    }
  }
  return trouvees;
}

/** Le corps de la règle CSS d'un sélecteur donné, ou null. */
function regleCss(css, selecteur) {
  const debut = css.indexOf(selecteur);
  if (debut === -1) return null;
  const ouvre = css.indexOf('{', debut);
  const ferme = css.indexOf('}', ouvre);
  if (ouvre === -1 || ferme === -1) return null;
  return css.slice(ouvre + 1, ferme);
}

/* LE ROBOT DE RÉFÉRENCE EST `*`, PAS UN MOTEUR EN PARTICULIER : un groupe
   `User-agent: Bingbot` qui interdit tout laisse passer tous les autres. */
function robotsInterditTout(robots) {
  let groupeCourant = [];
  let directivesEtoile = null;
  let dansEnTetesDeGroupe = false;
  for (const brute of robots.split('\n')) {
    const ligne = sansCommentaire(brute).trim();
    if (ligne === '') continue;
    const sep = ligne.indexOf(':');
    if (sep === -1) continue;
    const nom = ligne.slice(0, sep).trim().toLowerCase();
    const valeur = ligne.slice(sep + 1).trim();
    if (nom === 'user-agent') {
      // Plusieurs `User-agent` d'affilée forment UN seul groupe.
      if (!dansEnTetesDeGroupe) groupeCourant = [];
      dansEnTetesDeGroupe = true;
      groupeCourant.push(valeur);
      continue;
    }
    dansEnTetesDeGroupe = false;
    if (groupeCourant.includes('*')) {
      directivesEtoile ??= [];
      directivesEtoile.push([nom, valeur]);
    }
  }
  if (directivesEtoile === null) return false;
  const interdit = directivesEtoile.some(([nom, valeur]) => nom === 'disallow' && valeur === '/');
  const autorise = directivesEtoile.some(([nom]) => nom === 'allow');
  return interdit && !autorise;
}

/* LE MOTIF DOIT COUVRIR TOUT LE SITE, ET LA DIRECTIVE DOIT ÊTRE ACTIVE.
   Format `_headers` : une ligne de motif en colonne 0, puis les en-têtes
   INDENTÉS qui lui appartiennent. Un `X-Robots-Tag` en commentaire, ou posé
   sous `/prive/*`, ne protège rien. */
function entetesNoindexPartout(entetes) {
  let motifCourant = null;
  let couvre = false;
  for (const brute of entetes.split('\n')) {
    const ligne = sansCommentaire(brute);
    if (ligne.trim() === '') continue;
    if (!/^\s/.test(ligne)) { motifCourant = ligne.trim(); continue; }
    // Universel : le chemin est exactement « /* », que le motif soit relatif
    // ou écrit en URL absolue (https://exemple/*).
    const chemin = motifCourant === null
      ? null
      : motifCourant.replace(/^https?:\/\/[^/]+/i, '');
    if (chemin !== '/*') continue;
    const sep = ligne.indexOf(':');
    if (sep === -1) continue;
    if (ligne.slice(0, sep).trim().toLowerCase() === 'x-robots-tag'
      && /\bnoindex\b/i.test(ligne.slice(sep + 1))) couvre = true;
  }
  return couvre;
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
    griefs.push('robots.txt : aucun groupe « User-agent: * » avec « Disallow: / » et sans « Allow: »');
  } else if (/^\s*Sitemap:/im.test(robots)) {
    griefs.push('robots.txt annonce encore un Sitemap de production');
  } else constats.push('robots.txt : User-agent * → Disallow: /, aucun Allow, aucun Sitemap');

  // 2. _headers — le verrou côté serveur, celui qui tient même sur un lien fuité.
  const entetes = lire('_headers');
  if (entetes === null) griefs.push('_headers absent (en-tête X-Robots-Tag impossible)');
  else if (!entetesNoindexPartout(entetes)) {
    griefs.push('_headers : aucun X-Robots-Tag noindex ACTIF sur un motif couvrant tout le site');
  } else constats.push('_headers : X-Robots-Tag noindex actif sur « /* »');

  // 3. La feuille du bandeau. SANS ELLE, LE BANDEAU EST UN TEXTE NU : les six
  //    pages de texte portent une CSP `style-src 'self'` qui interdit le style
  //    en ligne — vu à la capture d'écran, pas deviné.
  const feuille = lire('previsualisation.css');
  if (feuille === null) griefs.push('previsualisation.css absent (le bandeau serait sans style)');
  else {
    const cadre = regleCss(feuille, '.previsualisation-cadre');
    const pastille = regleCss(feuille, '.previsualisation-pastille');
    if (cadre === null || pastille === null) {
      griefs.push('previsualisation.css : règle du cadre ou de la pastille absente');
    } else if (!/pointer-events:\s*none/.test(cadre)) {
      griefs.push('previsualisation.css : le cadre intercepterait les clics');
    } else {
      /* UN BANDEAU INVISIBLE EST PIRE QU'UN BANDEAU ABSENT : il rassure la
         porte sans rien dire au testeur. La porte lit du texte, elle ne peint
         pas la page — elle refuse donc les façons ÉCRITES de disparaître, et
         c'est la capture d'écran qui reste juge du rendu. */
      const invisible = /display:\s*none|visibility:\s*hidden|opacity:\s*0(\D|$)|content-visibility:\s*hidden/;
      if (invisible.test(cadre) || invisible.test(pastille)) {
        griefs.push('previsualisation.css : le bandeau est rendu invisible');
      } else constats.push('previsualisation.css : cadre visible, pointer-events: none');
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
    if (!/<meta name="robots" content="noindex/i.test(html)) {
      griefs.push(`${page} : <meta name="robots" content="noindex…"> manquant`);
    }
    if (!/<title>PRÉVISUALISATION — /.test(html)) {
      griefs.push(`${page} : le titre ne commence pas par « PRÉVISUALISATION — »`);
    }
    if (!/<link rel="stylesheet" href="previsualisation\.css">/.test(html)) {
      griefs.push(`${page} : la feuille previsualisation.css n'est pas liée`);
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
