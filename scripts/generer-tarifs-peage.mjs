// ENGENDRE public/donnees/tarifs-peage.json — la grille tarifaire du réseau
// AREA, réduite à ce qu'un trajet en voiture sait en faire. (APRR est écarté :
// son fichier est corrompu à la source — voir RESSOURCES plus bas.)
//
// LA SOURCE : le jeu « Tarifs autoroutes APRR » publié sur data.gouv.fr sous
// Licence Ouverte v2. Il porte DEUX réseaux (APRR et AREA) en fichiers
// séparés, chacun donnant, pour chaque paire gare d'entrée / gare de sortie,
// la distance tarifaire et le tarif par classe de véhicule.
//
// CE QUI EST GARDÉ, ET POURQUOI SI PEU. La CLASSE 1 seulement : c'est la
// voiture particulière, et c'est tout ce que ce planificateur promet — un
// poids lourd ne se planifie pas avec des bornes de recharge de tourisme.
// La distance tarifaire est écartée : elle sert au concessionnaire, pas à
// l'usager, qui veut un prix. Le fichier passe ainsi de 1,2 Mo à ~630 Ko.
//
// POURQUOI ENGENDRÉ ET VERSIONNÉ, PAS TÉLÉCHARGÉ AU BUILD — la même règle
// que l'index des monuments : la CI ne doit pas tomber parce qu'un serveur
// est en maintenance, et une grille tarifaire change une à deux fois par an.
// La régénération est un geste délibéré :
//
//   node scripts/generer-tarifs-peage.mjs
//
// CE QUE CET INDEX NE COUVRE PAS, ET IL FAUT LE DIRE : Vinci (ASF,
// Cofiroute, Escota), Sanef, SAPN, ATMB ne publient RIEN sur data.gouv.fr —
// sept recherches le 30/08/2026, zéro jeu. Un Paris-Marseille n'aura donc
// pas d'estimation. L'application le dit plutôt que de deviner.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = resolve(RACINE, 'public/donnees/tarifs-peage.json');

/* Les ressources du jeu, relevées le 30/08/2026. Les URL portent un
   horodatage : elles sont donc STABLES — une nouvelle grille crée une
   nouvelle ressource, elle n'écrase pas celle-ci. */
const RESSOURCES = [
  { reseau: 'AREA', url: 'https://static.data.gouv.fr/resources/tarifs-autoroutes-aprr/20260802-131936/2026-02.csv' },
];

/* POURQUOI PAS APRR — ET C'EST UNE MESURE, PAS UN CHOIX (30/08/2026).
 *
 * Le fichier APRR du même jeu est CORROMPU À LA SOURCE : sa colonne
 * `gare_sortie` porte 6 911 valeurs distinctes là où le réseau compte environ
 * deux cents gares. La cause se lit ligne à ligne — le séparateur
 * entre les deux gares a été remplacé par une espace, et une espace INTERNE
 * au nom de la gare d'entrée est devenue la virgule :
 *
 *   attendu : MACON CENTRE,AMBERIEU,69.84,6.7,…
 *   publié  : MACON,CENTRE AMBERIEU,69.84,6.7,…
 *
 * Les quatre millésimes publiés (2023-02, 2024-09, 2025-01, 2026-02) portent
 * le même défaut.
 *
 * UNE RECONSTRUCTION A ÉTÉ TENTÉE, ET REJETÉE. Le fichier a une structure
 * forte — 21 505 lignes, soit toutes les paires de ~208 gares — qui donne un
 * moyen de VÉRIFIER un décodage : chaque paire doit apparaître une fois et
 * une seule. Un décodage par fréquence des suffixes rend 195 noms de gares
 * plausibles… mais seulement 10 738 paires distinctes sur 18 915 attendues :
 * la moitié des lignes se replient sur une paire déjà vue. Le décodage n'est
 * donc PAS prouvé, et un tarif attribué à la mauvaise paire serait pire que
 * pas de tarif du tout — c'est sur lui qu'on déciderait d'éviter l'autoroute.
 *
 * APRR est donc écarté tant que le producteur n'aura pas corrigé son export.
 * AREA, publié dans le même jeu avec des IDENTIFIANTS de gare, est intact. */

/** Normalise un nom de gare pour l'appariement — voir lib/peages-tarifs.ts. */
function normaliser(nom) {
  return nom
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\bS\/\b/g, 'SUR ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

async function lire(url) {
  const reponse = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!reponse.ok) throw new Error(`${url} → HTTP ${reponse.status}`);
  return reponse.text();
}

const paires = {};
let lues = 0;
for (const { reseau, url } of RESSOURCES) {
  const texte = await lire(url);
  const lignes = texte.trim().split(/\r?\n/);
  const entete = lignes[0].split(',');
  /* LES DEUX FICHIERS N'ONT PAS LE MÊME EN-TÊTE, et c'est le genre de
     détail qui ferait rendre un index vide sans qu'on le voie : APRR
     nomme ses colonnes `gare_entree`, AREA `libelle_gare_entree` (relevé
     le 30/08). On accepte les deux, et l'on REFUSE tout le reste plutôt
     que de deviner un ordre de colonnes. */
  const trouver = (...noms) => {
    for (const n of noms) { const i = entete.indexOf(n); if (i >= 0) return i; }
    return -1;
  };
  const iEntree = trouver('gare_entree', 'libelle_gare_entree');
  const iSortie = trouver('gare_sortie', 'libelle_gare_sortie');
  const iTarif = trouver('tarif_classe_1');
  if (iEntree < 0 || iSortie < 0 || iTarif < 0) {
    throw new Error(`${reseau} : colonnes attendues absentes (${entete.join(',')})`);
  }
  for (const ligne of lignes.slice(1)) {
    const c = ligne.split(',');
    const tarif = Number(c[iTarif]);
    if (!Number.isFinite(tarif) || tarif <= 0) continue;
    const entree = normaliser(c[iEntree] ?? '');
    const sortie = normaliser(c[iSortie] ?? '');
    if (!entree || !sortie) continue;
    lues += 1;
    /* LA CLÉ EST ORDONNÉE : la grille ne donne qu'un sens, mais un péage se
       paie dans les deux. On range donc les deux gares par ordre
       alphabétique et l'on retient le tarif — au moins cher si les deux
       sens diffèrent, ce qui arrive sur quelques paires. */
    const cle = entree < sortie ? `${entree}~${sortie}` : `${sortie}~${entree}`;
    const connu = paires[cle];
    paires[cle] = connu === undefined ? tarif : Math.min(connu, tarif);
  }
  console.log(`${reseau} : ${lignes.length - 1} lignes lues`);
}

const gares = new Set();
for (const cle of Object.keys(paires)) {
  const [a, b] = cle.split('~');
  gares.add(a);
  gares.add(b);
}

mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, JSON.stringify({
  source: 'Tarifs autoroutes APRR et AREA — data.gouv.fr, Licence Ouverte v2',
  grille: '2026-02',
  classe: 1,
  paires,
}));

console.log(`${lues} tarifs retenus, ${Object.keys(paires).length} paires,`
  + ` ${gares.size} gares → ${SORTIE}`);
