// ENGENDRE public/donnees/monuments.json — les monuments historiques CLASSÉS,
// réduits à ce qu'un trajet sait en faire : où, comment ça s'appelle, dans
// quelle commune.
//
// LA SOURCE : la base Mérimée du ministère de la Culture, publiée sur
// data.gouv.fr (« Immeubles protégés au titre des Monuments Historiques »),
// sans clé. Le CSV source pèse 100 Mo — aucun navigateur ne doit le voir.
//
// POURQUOI ENGENDRÉ ET VERSIONNÉ, PAS TÉLÉCHARGÉ AU BUILD. La CI ne doit pas
// tomber parce qu'un seau OVH est en maintenance, et un monument classé ne
// bouge pas d'un mois à l'autre. Le dépôt porte la donnée réduite (~1 Mo,
// texte diffable) ; la régénération est un geste délibéré :
//
//   node scripts/generer-monuments.mjs [chemin/vers/merimee.csv]
//
// (sans argument, le script télécharge le CSV du ministère.)
//
// LES MESURES QUI ONT DÉCIDÉ DE LA COUPE, faites le 27/08/2026 sur le fichier
// du jour (46 760 notices) :
//   - 95 % des notices portent des coordonnées WGS84 — les autres sont tues ;
//   - « classé MH » (au moins partiellement) : 14 990 notices ; « inscrit »
//     seul : 31 321. L'index ne garde QUE les classés : un immeuble inscrit
//     est souvent une façade privée sans rien à visiter, et « lieux
//     d'exception » est la promesse de la page ;
//   - l'index classés tient en ~1,1 Mo brut (~0,3 Mo gzippé par le serveur).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = resolve(RACINE, 'public/donnees/monuments.json');
const SOURCE = 'https://ministere-culture.s3.sbg.io.cloud.ovh.net/POP/merimee.csv';

/** Lit le CSV : depuis un fichier local (argument) ou depuis le ministère. */
async function lireSource() {
  const local = process.argv[2];
  if (local) return readFileSync(local, 'utf8');
  console.log(`Téléchargement de ${SOURCE} (~100 Mo)…`);
  const r = await fetch(SOURCE);
  if (!r.ok) throw new Error(`Le ministère répond ${r.status}.`);
  return r.text();
}

/* Le CSV Mérimée est séparé par des BARRES VERTICALES, avec des champs cités
   qui contiennent virgules et retours à la ligne. Un découpage naïf par ligne
   casserait au premier « Historique » multiligne : on lit caractère par
   caractère, l'automate le plus simple qui soit. */
function* lignesCSV(texte) {
  let champ = '';
  let ligne = [];
  let entreGuillemets = false;
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i += 1; continue; }
      if (c === '"') { entreGuillemets = false; continue; }
      champ += c;
      continue;
    }
    if (c === '"') { entreGuillemets = true; continue; }
    if (c === '|') { ligne.push(champ); champ = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i += 1;
      ligne.push(champ); champ = '';
      if (ligne.length > 1 || ligne[0] !== '') yield ligne;
      ligne = [];
      continue;
    }
    champ += c;
  }
  if (champ !== '' || ligne.length > 0) { ligne.push(champ); yield ligne; }
}

const texte = await lireSource();
const iterateur = lignesCSV(texte);
const entete = iterateur.next().value;
const colonne = (nom) => entete.indexOf(nom);

const iCoord = colonne('coordonnees_au_format_WGS84');
const iTypo = colonne('Typologie_de_la_protection');
const iTitre = colonne('Titre_editorial_de_la_notice');
const iDenom = colonne('Denomination_de_l_edifice');
const iCommune = colonne('Commune_forme_editoriale');
/* LA FICHE D'UN LIEU (retour d'Armelin du 27/08 au soir : « impossible de
   cliquer dessus pour avoir le détail à l'identique d'une station ») demande
   trois champs de plus, MESURÉS avant d'être embarqués : la référence
   Mérimée (100 % des classés — elle ouvre la notice officielle POP), le
   siècle de construction (85 %), l'adresse (27 % — affichée quand elle est
   là). L'index passe de 890 Ko à 1,50 Mo brut — 0,42 Mo gzippés servis. */
const iRef = colonne('Reference');
const iSiecle = colonne('Format_abrege_du_siecle_de_construction');
const iAdresse = colonne('Adresse_forme_editoriale');
for (const [nom, i] of [['coordonnées', iCoord], ['typologie', iTypo],
  ['titre', iTitre], ['commune', iCommune], ['référence', iRef],
  ['siècle', iSiecle], ['adresse', iAdresse]]) {
  if (i < 0) throw new Error(`Colonne ${nom} introuvable — le format a changé.`);
}

let total = 0;
let sansCoordonnees = 0;
const monuments = [];
for (const l of iterateur) {
  total += 1;
  // La coupe éditoriale : les CLASSÉS seuls (voir l'en-tête).
  if (!/classé/i.test(l[iTypo] ?? '')) continue;
  const m = /^\[?\s*(-?\d+\.?\d*)\s*[,;]\s*(-?\d+\.?\d*)/.exec((l[iCoord] ?? '').trim());
  if (!m) { sansCoordonnees += 1; continue; }
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) || (lat === 0 && lon === 0)) {
    sansCoordonnees += 1;
    continue;
  }
  const titre = (l[iTitre] || l[iDenom] || '').trim().slice(0, 80);
  if (!titre) continue; // un lieu sans nom ne se propose pas
  const commune = (l[iCommune] ?? '').trim().slice(0, 40);
  // Un tableau de tuples, pas d'objets : les clés répétées 15 000 fois
  // pèseraient le tiers du fichier.
  monuments.push([Number(lon.toFixed(5)), Number(lat.toFixed(5)), titre, commune,
    (l[iRef] ?? '').trim().slice(0, 12),
    (l[iSiecle] ?? '').trim().slice(0, 40),
    (l[iAdresse] ?? '').trim().slice(0, 60)]);
}

monuments.sort((a, b) => a[0] - b[0]);
mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, JSON.stringify(monuments));
console.log(`${monuments.length} monuments classés gardés sur ${total} notices`
  + ` (${sansCoordonnees} classés sans coordonnées exploitables, tus).`);
console.log(`Écrit : ${SORTIE}`);
