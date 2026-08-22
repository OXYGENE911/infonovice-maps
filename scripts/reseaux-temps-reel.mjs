// ENGENDRE src/donnees/reseaux-temps-reel.ts — la table des réseaux de
// transport qui publient la position de leurs véhicules en temps réel.
//
// POURQUOI UNE TABLE ENGENDRÉE, ET NON UN APPEL AU DÉMARRAGE. Le catalogue de
// transport.data.gouv.fr pèse 2,4 Mo et ne bouge que de temps en temps ; le
// télécharger à chaque visite pour n'en tirer que quarante-sept lignes serait
// un gaspillage — le nôtre et celui d'un service public. La table est donc
// relevée à la main, relue, et versionnée. Elle coûte ~5 Ko dans le paquet.
//
// POURQUOI PAS AU BUILD NON PLUS. La CI ne doit pas tomber parce qu'un
// service tiers est en maintenance. Le dépôt porte la donnée ; la
// régénération est un geste délibéré.
//
//   node scripts/reseaux-temps-reel.mjs
//
// Sources, toutes publiques et sans clé :
// - transport.data.gouv.fr/api/datasets  → réseaux, flux, autorité, couverture
// - geo.api.gouv.fr                      → emprises (EPCI, commune, dép., région)
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = resolve(RACINE, 'src/donnees/reseaux-temps-reel.ts');
const PROXY = 'https://proxy.transport.data.gouv.fr/resource/';

/** Les appels sont sérialisés et espacés : ces quotas sont un bien commun. */
const souffle = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

async function json(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} sur ${url}`);
  return r.json();
}

/** Emprise d'une liste de points, arrondie au centième de degré. */
function emprise(points, marge = 0) {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const arrondi = (v) => Math.round(v * 100) / 100;
  return [
    arrondi(Math.min(...lons) - marge), arrondi(Math.min(...lats) - marge),
    arrondi(Math.max(...lons) + marge), arrondi(Math.max(...lats) + marge),
  ];
}

function sommets(geometrie) {
  const plat = [];
  const descendre = (n) => {
    if (typeof n[0] === 'number') plat.push([n[0], n[1]]);
    else n.forEach(descendre);
  };
  descendre(geometrie.coordinates);
  return plat;
}

/** Résout l'emprise d'une zone couverte, quel que soit son échelon. */
async function empriseDe(zone) {
  if (zone.type === 'epci' || zone.type === 'commune') {
    const chemin = zone.type === 'epci' ? 'epcis' : 'communes';
    const f = await json(
      `https://geo.api.gouv.fr/${chemin}/${zone.insee}?format=geojson&geometry=contour`,
    );
    if (!f.geometry) throw new Error(`sans contour : ${zone.type} ${zone.insee}`);
    return emprise(sommets(f.geometry));
  }
  // Départements et régions : geo.api.gouv.fr ne rend pas leur contour. On
  // prend les CENTRES de leurs communes et on élargit d'un dixième de degré
  // (~11 km) pour rattraper l'étendue des communes de bordure.
  const clef = zone.type === 'departement' ? 'codeDepartement' : 'codeRegion';
  const communes = await json(
    `https://geo.api.gouv.fr/communes?${clef}=${zone.insee}&fields=centre&format=json`,
  );
  const points = communes.filter((c) => c.centre).map((c) => c.centre.coordinates);
  if (points.length === 0) throw new Error(`aucune commune : ${zone.type} ${zone.insee}`);
  return emprise(points, 0.1);
}

/* Le nom commercial l'emporte — « Divia » parle mieux que le titre du jeu —
   MAIS seulement quand le jeu ne porte qu'une offre. Les agrégats régionaux en
   déclarent des dizaines : l'Atoumod normand en a 22, et prendre la première
   baptisait tout le flux de Normandie « Astrobus », du nom du réseau de
   Lisieux. Dans ce cas, c'est le titre du jeu qui est juste. */
function nomLisible(jeu) {
  const offres = (jeu.offers ?? []).filter((o) => o.nom_commercial);
  if (offres.length === 1) return offres[0].nom_commercial.trim();
  return jeu.title.replace(/^R[ée]seau\s+(urbain|interurbain|national|européen)?\s*/i, '').trim();
}

const jeux = await json('https://transport.data.gouv.fr/api/datasets?type=public-transit');
console.log(`catalogue : ${jeux.length} jeux de données`);

const candidats = [];
for (const jeu of jeux) {
  for (const res of jeu.resources ?? []) {
    if (!/gtfs-rt/i.test(res.format ?? '')) continue;
    if (!(res.features ?? []).includes('vehicle_positions')) continue;
    if (!String(res.url).startsWith(PROXY)) continue;  // sans proxy, pas de CORS
    candidats.push({ jeu, id: String(res.url).slice(PROXY.length) });
  }
}
console.log(`flux « positions de véhicules » proxifiés : ${candidats.length}`);

// Un même réseau publie parfois deux ressources équivalentes : on garde celle
// dont l'identifiant est explicite, pour que le fichier reste lisible.
const parReseau = new Map();
for (const c of candidats) {
  const clef = c.jeu.id;
  const garde = parReseau.get(clef);
  if (!garde || (!garde.id.includes('vehicle-position') && c.id.includes('vehicle-position'))) {
    parReseau.set(clef, c);
  }
}
console.log(`réseaux distincts : ${parReseau.size}`);

const reseaux = [];
const echecs = [];
for (const { jeu, id } of parReseau.values()) {
  const zone = (jeu.covered_area ?? [])[0];
  if (!zone) { echecs.push(`${jeu.title} — aucune zone couverte`); continue; }
  try {
    const bbox = await empriseDe(zone);
    reseaux.push({
      id,
      nom: nomLisible(jeu),
      autorite: zone.nom,
      bbox,
    });
    console.log(`  ${id.padEnd(52)} ${zone.nom}`);
  } catch (e) {
    echecs.push(`${jeu.title} — ${e.message}`);
  }
  await souffle(120);
}
reseaux.sort((a, b) => a.id.localeCompare(b.id, 'fr'));

if (echecs.length > 0) {
  console.log(`\n${echecs.length} réseau(x) écarté(s), faute d'emprise :`);
  echecs.forEach((e) => console.log(`  - ${e}`));
}

const jour = new Date().toISOString().slice(0, 10);
const lignes = reseaux.map((r) => `  { id: '${r.id}', nom: ${JSON.stringify(r.nom)}, `
  + `autorite: ${JSON.stringify(r.autorite)}, bbox: [${r.bbox.join(', ')}] },`);

writeFileSync(SORTIE, `// FICHIER ENGENDRÉ — ne pas modifier à la main.
// Régénérer : \`node scripts/reseaux-temps-reel.mjs\` (voir l'en-tête du script).
// Relevé le ${jour} : ${reseaux.length} réseaux publient la position de leurs
// véhicules en temps réel derrière le proxy CORS de transport.data.gouv.fr.
//
// \`bbox\` est l'emprise de l'autorité organisatrice — ouest, sud, est, nord —
// et sert à ne solliciter QUE les flux qui concernent la vue affichée.
export const RESEAUX_TEMPS_REEL = [
${lignes.join('\n')}
] as const;
`, 'utf8');

console.log(`\n${reseaux.length} réseaux écrits dans ${SORTIE}`);
