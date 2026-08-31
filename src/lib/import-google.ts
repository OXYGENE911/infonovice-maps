/* IMPORTER SES FAVORIS GOOGLE MAPS — lecture LOCALE, PURE.
 *
 * LA DEMANDE. Armelin, le 31/08/2026 : « cela serait bien de pouvoir exporter
 * et importer ses favoris Google Maps dans Infonovice Maps. Du coup, lors de
 * l'import des favoris, il faudrait recréer une structure similaire sous forme
 * de liste dans nos favoris Infonovice Maps. »
 *
 * RIEN NE PART CHEZ GOOGLE, ET C'EST LE POINT. Le fichier vient de Google
 * Takeout, l'usager le télécharge lui-même, et TOUT se lit ici — dans le
 * navigateur, sans une requête. Interroger l'API de Google pour compléter ce
 * qui manque serait exactement ce que le mandat interdit : envoyer les lieux
 * favoris de quelqu'un chez un tiers pour les lui rendre.
 *
 * DEUX FORMATS, PARCE QUE TAKEOUT EN REND DEUX.
 *
 *   — Le GeoJSON (« Lieux enregistrés », `Favourite places.json` selon la
 *     langue du compte) : il PORTE les coordonnées. Tout s'importe.
 *   — Le CSV d'une liste (`Titre, Note, URL`) : il ne porte QUE des liens.
 *     Certains contiennent les coordonnées, d'autres un identifiant de lieu
 *     que seul Google sait résoudre.
 *
 * CE QU'ON NE SAIT PAS FAIRE, ON LE DIT. Une entrée dont le lien ne porte pas
 * de coordonnées n'est PAS importée, et son titre est rendu à l'appelant pour
 * qu'il l'affiche. Deviner par un géocodage sur le seul titre placerait
 * « Chez Marcel » sur un homonyme à trois cents kilomètres — un favori faux
 * est pire qu'un favori manquant, parce qu'on le croit.
 *
 * LE NOM DU FICHIER FAIT LA LISTE : « Envie d'y aller.csv » devient la liste
 * « Envie d'y aller ». C'est la « structure similaire » demandée, et elle ne
 * coûte aucune saisie.
 */

/** Un lieu lu d'un export Google, prêt à devenir un favori. */
export interface LieuGoogle {
  nom: string;
  lon: number;
  lat: number;
  /** La note personnelle, quand Google l'a exportée. */
  note?: string;
}

/** Ce qu'une lecture rapporte : ce qui est importable, et ce qui ne l'est pas. */
export interface LectureGoogle {
  lieux: LieuGoogle[];
  /** Les titres qu'on n'a pas su situer — dits, jamais devinés. */
  sansPosition: string[];
  /* LES LIGNES DONT ON NE SAIT MÊME PAS LIRE LE TITRE. Elles se comptent au
     lieu de se nommer : leur nom est justement ce qui manque. Les taire
     ferait croire à un import complet. */
  illisibles: number;
}

/** Vrai si le couple est une position terrestre plausible — PURE. */
function positionValide(lon: number, lat: number): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat)
    && Math.abs(lon) <= 180 && Math.abs(lat) <= 90
    // 0,0 est le « point nul » : un lieu qui y tombe est un lieu mal lu.
    && !(lon === 0 && lat === 0);
}

/**
 * Extrait la position d'un lien Google Maps — PURE, `null` si absente.
 *
 * TROIS FORMES CONNUES, dans l'ordre de fiabilité :
 *   `!3d<lat>!4d<lon>` — la position du LIEU, la plus sûre ;
 *   `?q=<lat>,<lon>`   — une position explicite ;
 *   `@<lat>,<lon>,<z>` — le CENTRE DE LA CARTE, pas forcément le lieu, mais
 *                        c'est mieux que rien et l'écart reste faible.
 *
 * `cid=` et `ftid=` sont des identifiants internes : les résoudre demanderait
 * d'interroger Google. On rend `null` et l'appelant le dira.
 */
export function positionDuLien(lien: string): { lon: number; lat: number } | null {
  if (typeof lien !== 'string') return null;

  const precis = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(lien);
  if (precis) {
    const lat = Number(precis[1]); const lon = Number(precis[2]);
    if (positionValide(lon, lat)) return { lon, lat };
  }

  const requete = /[?&]q=(-?\d+(?:\.\d+)?)%2C(-?\d+(?:\.\d+)?)|[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/
    .exec(lien);
  if (requete) {
    const lat = Number(requete[1] ?? requete[3]);
    const lon = Number(requete[2] ?? requete[4]);
    if (positionValide(lon, lat)) return { lon, lat };
  }

  const centre = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(lien);
  if (centre) {
    const lat = Number(centre[1]); const lon = Number(centre[2]);
    if (positionValide(lon, lat)) return { lon, lat };
  }
  return null;
}

/**
 * Découpe une ligne de CSV — PURE, guillemets compris.
 *
 * ON N'UTILISE PAS `split(',')` : un titre comme « Chez Paul, Lyon » porte une
 * virgule, et le découpage naïf en ferait deux colonnes — le lien passerait
 * dans la mauvaise, et l'entrée serait perdue en silence.
 */
export function decouperLigneCsv(ligne: string): string[] {
  const cellules: string[] = [];
  let courante = '';
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i]!;
    if (dansGuillemets) {
      // Deux guillemets d'affilée valent un guillemet littéral.
      if (c === '"' && ligne[i + 1] === '"') { courante += '"'; i += 1; continue; }
      if (c === '"') { dansGuillemets = false; continue; }
      courante += c;
      continue;
    }
    if (c === '"') { dansGuillemets = true; continue; }
    if (c === ',') { cellules.push(courante); courante = ''; continue; }
    courante += c;
  }
  cellules.push(courante);
  return cellules.map((x) => x.trim());
}

/**
 * Lit un CSV de liste Google Maps — PURE.
 *
 * LES EN-TÊTES CHANGENT AVEC LA LANGUE DU COMPTE (« Titre » ou « Title »,
 * « URL » dans les deux). On les cherche donc par NOM, sans supposer l'ordre
 * des colonnes : un export anglais et un export français doivent tous deux
 * passer.
 */
export function lireCsvGoogle(texte: string): LectureGoogle {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lignes.length < 2) return { lieux: [], sansPosition: [], illisibles: 0 };

  const entetes = decouperLigneCsv(lignes[0]!).map((h) => h.toLowerCase());
  const colonne = (...noms: string[]): number => {
    for (const n of noms) {
      const i = entetes.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iTitre = colonne('titre', 'title', 'nom', 'name');
  const iLien = colonne('url', 'lien', 'adresse url');
  const iNote = colonne('note', 'commentaire', 'comment');
  if (iTitre < 0 || iLien < 0) return { lieux: [], sansPosition: [], illisibles: 0 };

  const lieux: LieuGoogle[] = [];
  const sansPosition: string[] = [];
  let illisibles = 0;
  for (const ligne of lignes.slice(1)) {
    const c = decouperLigneCsv(ligne);
    /* UNE LIGNE DÉCALÉE NE DONNE PAS UN NOM DE CONFIANCE. Si elle porte plus
       de cellules que d'en-têtes, c'est qu'une virgule non protégée l'a
       coupée — souvent celle de l'URL. Les colonnes situées APRÈS le lien
       sont alors décalées : on y lirait « 2.2945 » comme titre. On ne rattrape
       donc que si le titre vient AVANT le lien ; sinon la ligne se compte
       comme illisible, plutôt que de fabriquer un favori bien placé et mal
       nommé. */
    const decalee = c.length !== entetes.length;
    if (decalee && iTitre > iLien) { illisibles += 1; continue; }
    const nom = (c[iTitre] ?? '').trim();
    if (nom === '') { illisibles += 1; continue; }
    /* ON CHERCHE D'ABORD DANS LA COLONNE, PUIS DANS TOUTE LA LIGNE. Une URL
       Google porte une virgule (« ?q=48.8,2.3 ») : si l'export ne l'a pas
       entourée de guillemets — ou si un tableur l'a réécrit —, le découpage
       la coupe en deux et la colonne ne contient plus qu'un morceau. Relire
       la ligne entière rattrape le cas sans rien deviner : la position vient
       toujours du lien, jamais du titre. */
    const position = positionDuLien(c[iLien] ?? '') ?? positionDuLien(ligne);
    if (!position) { sansPosition.push(nom); continue; }
    const note = iNote >= 0 ? (c[iNote] ?? '').trim() : '';
    lieux.push({ nom, ...position, ...(note !== '' ? { note } : {}) });
  }
  return { lieux, sansPosition, illisibles };
}

/**
 * Lit le GeoJSON « Lieux enregistrés » de Takeout — PURE, défensive.
 *
 * IL PORTE LES COORDONNÉES : tout s'importe, sans lien à décortiquer. Le nom
 * se cherche à plusieurs endroits parce que Google le range différemment selon
 * qu'il s'agit d'un commerce ou d'une adresse.
 */
export function lireGeoJsonGoogle(brut: unknown): LectureGoogle {
  const features = (brut as { features?: unknown })?.features;
  if (!Array.isArray(features)) return { lieux: [], sansPosition: [], illisibles: 0 };

  const lieux: LieuGoogle[] = [];
  const sansPosition: string[] = [];
  for (const f of features) {
    if (typeof f !== 'object' || f === null) continue;
    const e = f as {
      geometry?: { coordinates?: unknown };
      properties?: Record<string, unknown>;
    };
    const p = e.properties ?? {};
    const lieuGoogle = (p['Location'] ?? p['location'] ?? {}) as Record<string, unknown>;
    const nom = [
      p['Title'], p['title'], lieuGoogle['Business Name'], lieuGoogle['Address'],
    ].find((v): v is string => typeof v === 'string' && v.trim() !== '')?.trim();
    if (nom === undefined) continue;

    const coords = e.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lon = Number(coords[0]); const lat = Number(coords[1]);
      if (positionValide(lon, lat)) {
        const note = typeof p['Comment'] === 'string' ? p['Comment'].trim() : '';
        lieux.push({ nom, lon, lat, ...(note !== '' ? { note } : {}) });
        continue;
      }
    }
    sansPosition.push(nom);
  }
  return { lieux, sansPosition, illisibles: 0 };
}

/**
 * Lit un export Google, quel qu'il soit — PURE.
 *
 * ON DEVINE LE FORMAT AU CONTENU, PAS À L'EXTENSION : un fichier renommé, un
 * navigateur qui ment sur le type, un usager qui change le suffixe — la
 * lecture doit marcher quand même.
 */
export function lireExportGoogle(texte: string): LectureGoogle {
  const debut = texte.trimStart();
  if (debut.startsWith('{') || debut.startsWith('[')) {
    try {
      return lireGeoJsonGoogle(JSON.parse(texte));
    } catch {
      return { lieux: [], sansPosition: [], illisibles: 0 };
    }
  }
  return lireCsvGoogle(texte);
}

/**
 * Le nom de liste tiré du nom de fichier — PURE.
 *
 * « Envie d'y aller.csv » → « Envie d'y aller ». C'est la « structure
 * similaire » demandée, et elle ne coûte aucune saisie. Sans nom exploitable,
 * on rend « Google Maps » : mieux vaut une liste nommée platement qu'une
 * liste sans nom, qui serait invisible.
 */
export function nomDeListe(nomFichier: string): string {
  const base = nomFichier.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base === '' ? 'Google Maps' : base.slice(0, 40);
}
