// GTFS-RT — décodeur protobuf MINIMAL, écrit à la main.
//
// POURQUOI PAS UNE BIBLIOTHÈQUE. `gtfs-realtime-bindings` traîne protobufjs et
// son interpréteur de descripteurs : ~120 Ko gzippés pour lire quatre champs.
// Le format « proto2 » sur le fil tient en trois règles (varint, longueur
// préfixée, flottant 32 bits), et on n'a besoin QUE de la position des
// véhicules. Le budget du projet est de 300 Ko gzippés pour tout le code
// applicatif : ce décodeur pèse moins de 2 Ko.
//
// LE FLUX EST UNE DONNÉE EXTERNE, donc hostile par principe : chaque lecture
// est bornée, chaque champ inconnu est sauté sans jamais reculer, et les
// coordonnées sont vérifiées avant d'être rendues. Un octet de travers doit
// donner une erreur en français, pas une boucle infinie.
//
// Numéros de champs : spécification GTFS Realtime v2.0 (gtfs-realtime.proto).
//   FeedMessage      1 header, 2 entity
//   FeedHeader       1 gtfs_realtime_version, 3 timestamp
//   FeedEntity       1 id, 4 vehicle
//   VehiclePosition  1 trip, 2 position, 5 timestamp, 8 vehicle
//   TripDescriptor   1 trip_id, 5 route_id
//   VehicleDescriptor 1 id, 2 label
//   Position         1 latitude, 2 longitude, 3 bearing, 5 speed

export class ErreurTransports extends Error {}

export interface Vehicule {
  /** Identifiant de l'entité dans le flux — unique au sein d'un réseau. */
  id: string;
  lon: number;
  lat: number;
  /** Cap en degrés (0 = nord), quand le producteur le donne. */
  cap: number | null;
  /** Vitesse en m/s, telle qu'annoncée. */
  vitesse: number | null;
  /** Le numéro de ligne, quand il est publié (« 4-93 », « 206 »). */
  ligne: string | null;
  /** L'étiquette du véhicule ou sa destination, selon les réseaux. */
  etiquette: string | null;
  /** Horodate de la position, en secondes Unix, ou null. */
  horodate: number | null;
}

export interface FluxVehicules {
  /** Horodate de l'en-tête du flux, en secondes Unix, ou null. */
  horodate: number | null;
  vehicules: Vehicule[];
  /** Vrai si le flux annonçait plus de véhicules que le plafond n'en garde. */
  tronque: boolean;
}

/** Plafond DUR de véhicules gardés par flux : au-delà, la carte devient
    illisible et le navigateur peine. Aucun réseau français proxifié n'en
    publie autant (le plus fourni en compte quelques centaines). */
export const PLAFOND_VEHICULES = 1200;

/** Au-delà, on refuse de décoder : un flux de positions honnête pèse
    quelques dizaines de kilo-octets, jamais des mégaoctets. */
export const PLAFOND_OCTETS = 4 * 1024 * 1024;

/* ---- Lecture protobuf, bornée ---- */

const VARINT = 0;
const BLOC = 2;
const FIXE64 = 1;
const FIXE32 = 5;

class Lecteur {
  #vue: DataView;
  #octets: Uint8Array;
  #i: number;
  #fin: number;

  constructor(octets: Uint8Array, debut = 0, fin = octets.length) {
    this.#octets = octets;
    this.#vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
    this.#i = debut;
    this.#fin = fin;
  }

  get fini(): boolean { return this.#i >= this.#fin; }

  #verifier(n: number): void {
    if (this.#i + n > this.#fin) throw new ErreurTransports('Flux temps réel tronqué.');
  }

  /** Entier à longueur variable. Borné à dix octets : sans cette borne, une
      suite d'octets à bit de continuation levé boucle jusqu'à la fin du flux. */
  varint(): number {
    let valeur = 0;
    let facteur = 1;
    for (let n = 0; n < 10; n += 1) {
      this.#verifier(1);
      const octet = this.#octets[this.#i]!;
      this.#i += 1;
      valeur += (octet & 0x7f) * facteur;
      if ((octet & 0x80) === 0) return valeur;
      facteur *= 128;
    }
    throw new ErreurTransports('Flux temps réel illisible (entier hors bornes).');
  }

  /** Clé d'un champ : son numéro et son type sur le fil. */
  cle(): { numero: number; type: number } {
    const brut = this.varint();
    const numero = Math.floor(brut / 8);
    if (numero === 0) throw new ErreurTransports('Flux temps réel illisible (champ 0).');
    return { numero, type: brut % 8 };
  }

  flottant(): number { this.#verifier(4); const v = this.#vue.getFloat32(this.#i, true); this.#i += 4; return v; }

  /** Les bornes d'un sous-message, sans copier les octets. */
  bloc(): { debut: number; fin: number } {
    const taille = this.varint();
    this.#verifier(taille);
    const debut = this.#i;
    this.#i += taille;
    return { debut, fin: this.#i };
  }

  texte(): string {
    const { debut, fin } = this.bloc();
    return new TextDecoder('utf-8', { fatal: false })
      .decode(this.#octets.subarray(debut, fin));
  }

  /** Saute un champ dont on n'a que faire. Avance TOUJOURS, jamais moins. */
  sauter(type: number): void {
    if (type === VARINT) { this.varint(); return; }
    if (type === BLOC) { this.bloc(); return; }
    if (type === FIXE64) { this.#verifier(8); this.#i += 8; return; }
    if (type === FIXE32) { this.#verifier(4); this.#i += 4; return; }
    // Les types 3 et 4 (groupes) sont retirés de proto3 et absents de
    // GTFS-RT ; le type 6 n'existe pas. On refuse plutôt que de deviner.
    throw new ErreurTransports('Flux temps réel illisible (champ de type inconnu).');
  }

  sousLecteur(bornes: { debut: number; fin: number }): Lecteur {
    return new Lecteur(this.#octets, bornes.debut, bornes.fin);
  }
}

/* ---- Les messages GTFS-RT dont on a besoin ---- */

function lirePosition(l: Lecteur, v: Vehicule): void {
  while (!l.fini) {
    const { numero, type } = l.cle();
    if (type === FIXE32 && numero === 1) { v.lat = l.flottant(); continue; }
    if (type === FIXE32 && numero === 2) { v.lon = l.flottant(); continue; }
    if (type === FIXE32 && numero === 3) { v.cap = l.flottant(); continue; }
    if (type === FIXE32 && numero === 5) { v.vitesse = l.flottant(); continue; }
    l.sauter(type);
  }
}

function lireCourse(l: Lecteur, v: Vehicule): void {
  while (!l.fini) {
    const { numero, type } = l.cle();
    if (type === BLOC && numero === 5) { v.ligne = l.texte() || null; continue; }
    l.sauter(type);
  }
}

function lireEngin(l: Lecteur, v: Vehicule): void {
  while (!l.fini) {
    const { numero, type } = l.cle();
    // L'étiquette (2) est plus parlante que l'identifiant technique (1) ;
    // beaucoup de réseaux ne publient que l'un des deux. Une étiquette VIDE
    // n'écrase pas un identifiant déjà lu : mieux vaut « 3631 » que rien.
    if (type === BLOC && numero === 2) { v.etiquette = l.texte() || v.etiquette; continue; }
    if (type === BLOC && numero === 1 && v.etiquette === null) {
      v.etiquette = l.texte() || null;
      continue;
    }
    l.sauter(type);
  }
}

function lireVehicule(l: Lecteur, v: Vehicule): void {
  while (!l.fini) {
    const { numero, type } = l.cle();
    if (type === BLOC && numero === 1) { lireCourse(l.sousLecteur(l.bloc()), v); continue; }
    if (type === BLOC && numero === 2) { lirePosition(l.sousLecteur(l.bloc()), v); continue; }
    if (type === BLOC && numero === 8) { lireEngin(l.sousLecteur(l.bloc()), v); continue; }
    if (type === VARINT && numero === 5) {
      const t = l.varint();
      v.horodate = horodateRenseignee(t) ? t : null;
      continue;
    }
    l.sauter(type);
  }
}

/** ZÉRO N'EST PAS UNE DATE, C'EST UN CHAMP VIDE.
    Bibus (Brest) publie `timestamp: 0` pour chacun de ses 27 véhicules —
    mesuré le 22/08/2026 sur le flux réel. Pris au pied de la lettre, cela les
    date de 1970, les vieillit de 56 ans, et la règle de fraîcheur efface le
    réseau entier sans un mot. En protobuf, un entier à zéro est précisément
    indiscernable d'un champ absent : le traduire en « inconnu » n'interprète
    rien, c'est lire la spécification.
    ON S'ARRÊTE LÀ, ET C'EST DÉLIBÉRÉ. Une première écriture écartait tout ce
    qui sortait de [2020, 2100] — ce qui transformait une position datée de
    2017 en « fraîcheur inconnue », donc en « vu à l'instant » après repli sur
    l'en-tête. Une date ancienne EST une information : elle doit vieillir et se
    faire écarter par la règle de fraîcheur, pas se faire effacer ici. */
function horodateRenseignee(s: number): boolean {
  return s !== 0;
}

/** Une position est retenue seulement si elle EXISTE et tombe sur Terre.
    Un flux qui omet la position (arrêt en dépôt, panne du GPS) publie
    volontiers des zéros : « 0, 0 » est au large du golfe de Guinée, et ce
    point-là n'a jamais transporté personne. */
function positionUtilisable(v: Vehicule): boolean {
  if (!Number.isFinite(v.lon) || !Number.isFinite(v.lat)) return false;
  if (v.lon === 0 && v.lat === 0) return false;
  return v.lon >= -180 && v.lon <= 180 && v.lat >= -90 && v.lat <= 90;
}

/** Décode un flux « positions de véhicules ». Ne jette que sur un flux
    illisible : un flux VIDE est une réponse légitime (la nuit, par exemple). */
export function decoderFlux(octets: Uint8Array): FluxVehicules {
  if (octets.length > PLAFOND_OCTETS) {
    throw new ErreurTransports('Flux temps réel anormalement volumineux — écarté.');
  }
  const flux: FluxVehicules = { horodate: null, vehicules: [], tronque: false };
  const l = new Lecteur(octets);
  while (!l.fini) {
    const { numero, type } = l.cle();
    if (type === BLOC && numero === 1) {
      const entete = l.sousLecteur(l.bloc());
      while (!entete.fini) {
        const c = entete.cle();
        if (c.type === VARINT && c.numero === 3) {
          const t = entete.varint();
          flux.horodate = horodateRenseignee(t) ? t : null;
          continue;
        }
        entete.sauter(c.type);
      }
      continue;
    }
    if (type === BLOC && numero === 2) {
      const entite = l.sousLecteur(l.bloc());
      const v: Vehicule = {
        id: '', lon: Number.NaN, lat: Number.NaN,
        cap: null, vitesse: null, ligne: null, etiquette: null, horodate: null,
      };
      while (!entite.fini) {
        const c = entite.cle();
        if (c.type === BLOC && c.numero === 1) { v.id = entite.texte(); continue; }
        if (c.type === BLOC && c.numero === 4) {
          lireVehicule(entite.sousLecteur(entite.bloc()), v);
          continue;
        }
        entite.sauter(c.type);
      }
      /* LE PLAFOND SE JUGE SUR CE QUI S'AFFICHERAIT, pas sur ce qui se lit.
         La première écriture levait le drapeau « liste écourtée » pour toute
         entité au-delà du plafond, y compris celles qu'on écarte de toute
         façon (sans position, en (0,0), hors du globe) : le volet annonçait
         « trop de véhicules » sans qu'aucun véhicule affichable ait été perdu. */
      if (!positionUtilisable(v)) continue;
      if (flux.vehicules.length >= PLAFOND_VEHICULES) { flux.tronque = true; continue; }
      flux.vehicules.push(v);
      continue;
    }
    l.sauter(type);
  }
  return flux;
}
