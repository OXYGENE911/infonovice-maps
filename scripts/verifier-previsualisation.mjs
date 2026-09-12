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
// Ce script lit le dossier RÉELLEMENT construit et sort en erreur si une
// seule marque manque. Le workflow le place AVANT l'étape de déploiement :
// un `dist/` non conforme ne part pas.
//
// Usage : node scripts/verifier-previsualisation.mjs [dossier]  (défaut : dist)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dossier = process.argv[2] ?? 'dist';
const griefs = [];
const constats = [];

function lire(nom) {
  const chemin = join(dossier, nom);
  return existsSync(chemin) ? readFileSync(chemin, 'utf-8') : null;
}

// 1. robots.txt — le verrou que lit un robot bien élevé.
const robots = lire('robots.txt');
if (robots === null) griefs.push('robots.txt absent');
else if (!/^\s*Disallow:\s*\/\s*$/m.test(robots)) {
  griefs.push('robots.txt n’interdit pas tout (« Disallow: / » attendu)');
} else if (/^\s*Allow:/m.test(robots) || /Sitemap:/i.test(robots)) {
  griefs.push('robots.txt porte encore un Allow ou un Sitemap de production');
} else constats.push('robots.txt : Disallow: / — aucun Allow, aucun Sitemap');

// 2. _headers — le verrou côté serveur, celui qui tient même sur un lien fuité.
const entetes = lire('_headers');
if (entetes === null) griefs.push('_headers absent (en-tête X-Robots-Tag impossible)');
else if (!/X-Robots-Tag:\s*noindex/i.test(entetes)) {
  griefs.push('_headers ne pose pas X-Robots-Tag: noindex');
} else constats.push('_headers : X-Robots-Tag noindex présent');

// 3. La feuille de style du bandeau. SANS ELLE, LE BANDEAU EST UN TEXTE NU :
//    les six pages de texte portent une CSP `style-src 'self'` qui interdit
//    le style en ligne — vu à la capture d'écran, pas deviné.
const feuille = lire('previsualisation.css');
if (feuille === null) griefs.push('previsualisation.css absent (le bandeau serait sans style)');
else if (!/\.previsualisation-cadre\b/.test(feuille) || !/pointer-events:\s*none/.test(feuille)) {
  griefs.push('previsualisation.css ne porte pas le cadre, ou lui laisse intercepter les clics');
} else constats.push('previsualisation.css : cadre présent, pointer-events: none');

// 4. Aucun artefact de production ne doit rester.
for (const intrus of ['CNAME', 'sitemap.xml']) {
  if (existsSync(join(dossier, intrus))) griefs.push(`${intrus} traîne dans la préversion`);
}

// 5. CHAQUE page HTML porte les marques. Pas « la page d'accueil » :
//    un testeur peut arriver par « À propos » depuis un lien partagé.
const pages = existsSync(dossier)
  ? readdirSync(dossier).filter((f) => f.endsWith('.html'))
  : [];
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
  if (!/<link rel="stylesheet" href="previsualisation.css">/.test(html)) {
    griefs.push(`${page} : la feuille previsualisation.css n'est pas liée`);
  }
}
if (pages.length > 0) constats.push(`${pages.length} page(s) HTML marquée(s) : ${pages.join(', ')}`);

for (const c of constats) console.log(`  ok — ${c}`);
if (griefs.length > 0) {
  for (const g of griefs) console.error(`  ÉCHEC — ${g}`);
  console.error(`\n${griefs.length} défaut(s) : ce dossier ne doit PAS être déployé en préversion.`);
  process.exit(1);
}
console.log(`\nPréversion conforme : ${dossier}/ peut être déployé.`);
