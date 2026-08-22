// ENGENDRE src/donnees/reseaux-temps-reel.ts — la table des réseaux de
// transport qui publient la position de leurs véhicules en temps réel.
//
// POURQUOI UNE TABLE ENGENDRÉE, ET NON UN APPEL AU DÉMARRAGE. Le catalogue de
// transport.data.gouv.fr pèse 2,4 Mo et ne bouge que de temps en temps ; le
// télécharger à chaque visite pour n'en tirer que quarante lignes serait un
// gaspillage — le nôtre et celui d'un service public. La table est donc
// relevée à la main, relue, et versionnée.
//
// POURQUOI PAS AU BUILD NON PLUS. La CI ne doit pas tomber parce qu'un
// service tiers est en maintenance. Le dépôt porte la donnée ; la
// régénération est un geste délibéré.
//
//   node scripts/reseaux-temps-reel.mjs
//
// POURQUOI UNE COUVERTURE EN CELLULES, ET PAS SEULEMENT UN RECTANGLE. Un
// rectangle autour d'une région est deux fois plus vaste qu'elle : celui des
// Pays de la Loire couvre Rennes, à 97 km du car Aléop le plus proche. On
// interrogeait donc un service public pour rien, et le volet annonçait
// « 3 réseaux » là où un seul avait des véhicules. La couverture est
// désormais une liste de bandes [ligne, colonneMin, colonneMax] sur une
// grille de 0,2° (~22 km), déduite des communes réellement desservies : elle
// épouse le territoire au lieu de l'encadrer, et tient en quelques dizaines
// de nombres par réseau.
//
// Sources, toutes publiques et sans clé :
// - transport.data.gouv.fr/api/datasets  → réseaux, flux, autorité, couverture
// - geo.api.gouv.fr                      → communes (EPCI, commune, dép., région)
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = resolve(RACINE, 'src/donnees/reseaux-temps-reel.ts');
const PROXY = 'https://proxy.transport.data.gouv.fr/resource/';
/** Le pas de la grille de couverture, en degrés. Doit rester en phase avec
    PAS_GRILLE de src/lib/transports.ts — un test unitaire le vérifie. */
const PAS = 0.2;

/** Les appels sont sérialisés et espacés : ces quotas sont un bien commun. */
const souffle = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

async function json(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} sur ${url}`);
  return r.json();
}

const cellule = (v) => Math.floor(v / PAS);
const arrondi = (v) => Math.round(v * 100) / 100;

/** Les communes d'une zone couverte, quel que soit son échelon. */
async function communesDe(zone) {
  if (zone.type === 'commune') {
    const c = await json(
      `https://geo.api.gouv.fr/communes/${zone.insee}?fields=centre,contour&format=json`,
    );
    return [c];
  }
  if (zone.type === 'epci') {
    return json(
      `https://geo.api.gouv.fr/epcis/${zone.insee}/communes?fields=centre,contour&format=json`,
    );
  }
  /* LE CONTOUR N'EST DEMANDÉ QUE POUR LES PETITES ZONES. Une région compte
     plus de mille communes : leurs contours pèsent des dizaines de mégaoctets
     pour une précision dont une grille de 0,2° n'a que faire. À cette échelle
     les centres suffisent — les communes françaises sont bien plus serrées
     que 22 km. */
  const clef = zone.type === 'departement' ? 'codeDepartement' : 'codeRegion';
  return json(
    `https://geo.api.gouv.fr/communes?${clef}=${zone.insee}&fields=centre&format=json`,
  );
}

/** Tous les points d'une commune : les sommets de son contour si elle en a
    un, son centre sinon. Le contour évite de rater une commune allongée. */
function pointsDe(commune) {
  const plat = [];
  if (commune.contour) {
    const descendre = (n) => {
      if (typeof n[0] === 'number') plat.push([n[0], n[1]]);
      else n.forEach(descendre);
    };
    descendre(commune.contour.coordinates);
  }
  if (plat.length === 0 && commune.centre) plat.push(commune.centre.coordinates);
  return plat;
}

/* L'ACCUMULATION EST INCRÉMENTALE. Une région rend plus de mille communes ;
   rassembler tous leurs points dans un tableau avant de les réduire faisait
   déborder la pile d'appel (« Maximum call stack size exceeded », mesuré sur
   les Pays de la Loire et la Normandie). On avale donc point par point. */
function accumulateur() {
  const lignes = new Map();
  let n = 0;
  let ouest = Infinity; let sud = Infinity; let est = -Infinity; let nord = -Infinity;
  return {
    ajouter(lon, lat) {
      n += 1;
      if (lon < ouest) ouest = lon;
      if (lon > est) est = lon;
      if (lat < sud) sud = lat;
      if (lat > nord) nord = lat;
      const cy = cellule(lat);
      const cx = cellule(lon);
      const b = lignes.get(cy);
      if (!b) lignes.set(cy, [cx, cx]);
      else { if (cx < b[0]) b[0] = cx; if (cx > b[1]) b[1] = cx; }
    },
    get vide() { return n === 0; },
    /** Une bande par ligne de grille. Le remplissage entre colonne minimale et
        maximale d'une même ligne bouche les trous que laisserait un semis de
        points, sans jamais déborder de l'étendue est-ouest desservie sur
        cette ligne-là. */
    couverture() {
      return [...lignes.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([cy, minMax]) => [cy, minMax[0], minMax[1]]);
    },
    emprise() {
      return [arrondi(ouest), arrondi(sud), arrondi(est), arrondi(nord)];
    },
  };
}

/* Le nom commercial l'emporte — « Divia » parle mieux que le titre du jeu —
   MAIS seulement quand le jeu ne porte qu'une offre. Les agrégats régionaux en
   déclarent des dizaines : l'Atoumod normand en a 22, et prendre la première
   baptisait tout le flux de Normandie « Astrobus », du nom du réseau de
   Lisieux. Dans ce cas, c'est le titre du jeu qui est juste. */
function offresDe(jeu) {
  return [...new Set((jeu.offers ?? []).map((o) => o.nom_commercial).filter(Boolean))];
}

function nomLisible(jeu) {
  const offres = offresDe(jeu);
  if (offres.length === 1) return offres[0].trim();
  return jeu.title.replace(/^R[ée]seau\s+(urbain|interurbain|national|européen)?\s*/i, '').trim();
}

/* UN AGRÉGAT REPUBLIE LES VÉHICULES DE SES MEMBRES. L'Atoumod normand déclare
   22 offres commerciales et rediffuse les bus d'Astrobus, Ficibus, Vikibus,
   Transurbain, Semo Bus, Deep Mob… Mesuré le 22/08 : 17 véhicules normands
   apparaissaient DEUX FOIS, une fois par l'agrégat, une fois par leur réseau.
   Ils ne se dédoublonnent pas par identifiant (deux réseaux quelconques
   peuvent numéroter « 3 » et « 4 ») ni par position (l'agrégat et le membre
   échantillonnent le même bus à une seconde d'écart : jusqu'à 1 km d'écart
   mesuré). Le lien est STRUCTUREL, il se lit dans le catalogue : plus d'une
   offre commerciale = agrégat. Un seul des 44 réseaux l'est. */
const estAgregat = (jeu) => offresDe(jeu).length > 1;

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
  const garde = parReseau.get(c.jeu.id);
  if (!garde || (!garde.id.includes('vehicle-position') && c.id.includes('vehicle-position'))) {
    parReseau.set(c.jeu.id, c);
  }
}
console.log(`réseaux distincts : ${parReseau.size}`);

const reseaux = [];
const echecs = [];
for (const { jeu, id } of parReseau.values()) {
  const zones = jeu.covered_area ?? [];
  if (zones.length === 0) { echecs.push(`${jeu.title} (${id}) — aucune zone couverte`); continue; }
  try {
    // TOUTES les zones, pas seulement la première : la navette Giverny-Vernon
    // en déclare deux, et n'en garder qu'une amputait son emprise de 88 %.
    const acc = accumulateur();
    for (const zone of zones) {
      const communes = await communesDe(zone);
      if (communes.length === 0) throw new Error(`aucune commune : ${zone.type} ${zone.insee}`);
      for (const c of communes) for (const p of pointsDe(c)) acc.ajouter(p[0], p[1]);
      await souffle(120);
    }
    if (acc.vide) throw new Error('aucun point géographique');
    const entree = {
      id,
      nom: nomLisible(jeu),
      autorite: zones.map((z) => z.nom).join(', '),
      agregat: estAgregat(jeu),
      bbox: acc.emprise(),
      couverture: acc.couverture(),
    };
    reseaux.push(entree);
    console.log(`  ${id.padEnd(52)} ${String(entree.couverture.length).padStart(3)} bandes  ${entree.autorite.slice(0, 40)}`);
  } catch (e) {
    echecs.push(`${jeu.title} (${id}) — ${e.message}`);
  }
}

/* UNE TABLE AMPUTÉE NE S'ÉCRIT PAS. La version précédente écrivait ce qu'elle
   avait pu résoudre, avec un en-tête affirmant « N réseaux publient… » et un
   code de sortie 0 : une panne partielle de geo.api.gouv.fr faisait donc
   disparaître des réseaux en silence, et le seul garde-fou de test
   (length > 20) était trop lâche pour s'en apercevoir. */
if (echecs.length > 0) {
  console.error(`\nÉCHEC — ${echecs.length} réseau(x) non résolu(s), la table n'est PAS écrite :`);
  echecs.forEach((e) => console.error(`  - ${e}`));
  console.error('\nRéessayez plus tard : geo.api.gouv.fr ou le catalogue sont peut-être indisponibles.');
  process.exit(1);
}

// Deux réseaux voisins portent parfois le même nom commercial (la navette
// « SNgo! » de Giverny et le réseau « SNgo! » de Vernon) : le résumé d'état
// les énumérait deux fois à l'identique. On les distingue par leur autorité.
const parNom = new Map();
reseaux.forEach((r) => parNom.set(r.nom, (parNom.get(r.nom) ?? 0) + 1));
reseaux.forEach((r) => {
  if (parNom.get(r.nom) > 1) {
    const premiere = r.autorite.split(',')[0].trim();
    r.nom = `${r.nom} (${premiere})`;
  }
});

reseaux.sort((a, b) => a.id.localeCompare(b.id, 'fr'));

const jour = new Date().toISOString().slice(0, 10);
const lignes = reseaux.map((r) => `  { id: '${r.id}', nom: ${JSON.stringify(r.nom)},\n`
  + `    autorite: ${JSON.stringify(r.autorite)}, agregat: ${r.agregat},\n`
  + `    bbox: [${r.bbox.join(', ')}],\n`
  + `    couverture: [${r.couverture.map((b) => `[${b.join(',')}]`).join(', ')}] },`);

writeFileSync(SORTIE, `// FICHIER ENGENDRÉ — ne pas modifier à la main.
// Régénérer : \`node scripts/reseaux-temps-reel.mjs\` (voir l'en-tête du script).
// Relevé le ${jour} : ${reseaux.length} réseaux publient la position de leurs
// véhicules en temps réel derrière le proxy CORS de transport.data.gouv.fr.
//
// \`bbox\` — ouest, sud, est, nord — sert de filtre grossier et rapide.
// \`couverture\` — des bandes [ligne, colonneMin, colonneMax] sur une grille de
// ${PAS}° — dit où le réseau dessert VRAIMENT, commune par commune : sans elle,
// le rectangle des Pays de la Loire couvrait Rennes, à 97 km du car le plus
// proche, et on interrogeait un service public pour rien.
export const RESEAUX_TEMPS_REEL = [
${lignes.join('\n')}
] as const;
`, 'utf8');

console.log(`\n${reseaux.length} réseaux écrits dans ${SORTIE}`);
