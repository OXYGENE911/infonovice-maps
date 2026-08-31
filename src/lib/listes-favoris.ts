/* LES LISTES DE FAVORIS — nommées, colorées, marquées d'un émoji. PURE.
 *
 * LA DEMANDE. Armelin, le 31/08/2026 : « quand on ajoute un POI à l'écran, ce
 * serait bien de pouvoir l'enregistrer dans une catégorie custom de ses POI en
 * indiquant soi-même un nom, un émoji et couleur dédiée pour ce POI, ou en
 * sélectionnant une liste prédéfinie comme sur Google Maps qui possède déjà
 * des listes de favoris prédéfinies pour les restaurants, les lieux favoris et
 * les lieux à visiter (Drapeau vert). »
 *
 * POURQUOI DES LISTES PRÉDÉFINIES. Une application qui s'ouvre sur « créez
 * votre première liste » demande un travail avant de rendre un service. Trois
 * listes existent donc d'emblée — celles qu'il cite — et l'on peut en ajouter.
 * Elles ne sont PAS effaçables tant qu'elles portent des lieux : perdre ses
 * favoris parce qu'on a supprimé une catégorie serait une trahison du contrat.
 *
 * OÙ ELLES VIVENT. Dans les préférences, en IndexedDB, comme tout le reste :
 * « vos données ne quittent jamais ce navigateur ». Pas de nouveau magasin —
 * une liste est un réglage, et un magasin de plus imposerait une migration de
 * schéma à tous les usagers pour trois objets.
 *
 * CE QUI EST VALIDÉ, ET POURQUOI. Un nom vide rendrait une liste invisible ;
 * un émoji de dix caractères casserait l'alignement des pastilles ; une
 * couleur libre pourrait être illisible sur la carte. Chaque champ est borné
 * — et les bornes sont dites ici plutôt que devinées dans l'interface.
 */

/** Une liste de favoris, telle que l'usager la voit. */
export interface ListeFavoris {
  id: string;
  nom: string;
  /** Un émoji, un seul — c'est la pastille de la liste. */
  emoji: string;
  /** La couleur de la liste, en hexadécimal. */
  couleur: string;
  /** Vrai pour les trois listes livrées : on ne les efface pas à la légère. */
  livree?: boolean;
}

/* LES TROIS LISTES QU'IL CITE, livrées d'emblée. Les identifiants sont
   STABLES et lisibles : un export relu six mois plus tard doit se comprendre
   sans table de correspondance. */
export const LISTES_LIVREES: readonly ListeFavoris[] = [
  { id: 'favoris', nom: 'Lieux favoris', emoji: '⭐', couleur: '#E8A800', livree: true },
  { id: 'a-visiter', nom: 'À visiter', emoji: '🚩', couleur: '#1E9E5A', livree: true },
  { id: 'restaurants', nom: 'Restaurants', emoji: '🍽️', couleur: '#D9534F', livree: true },
];

/** La liste par défaut, quand l'usager n'en choisit aucune. */
export const LISTE_PAR_DEFAUT = 'favoris';

/* CE QU'UN NOM PEUT PORTER. Quarante caractères : de quoi écrire « Restaurants
   du week-end à Marseille » sans qu'une liste déborde de son bouton. */
export const NOM_MAX = 40;

/* LES COULEURS PROPOSÉES. Elles viennent de la palette des familles de lieux —
   deux jeux de couleurs se seraient désaccordés au premier changement — et
   toutes portent du texte blanc lisible. */
export const COULEURS: readonly string[] = [
  '#D9534F', '#E8620C', '#E8A800', '#1E9E5A', '#00796B',
  '#2272C4', '#3F51B5', '#6C4FA1', '#C2185B', '#546E7A',
];

/**
 * Valide et normalise une liste saisie — PURE.
 *
 * Rend `null` quand la saisie ne peut pas faire une liste utilisable : mieux
 * vaut refuser clairement que garder une liste sans nom, invisible dans son
 * propre panneau.
 */
export function normaliserListe(brut: unknown): ListeFavoris | null {
  /* CE QUI VIENT DU STOCKAGE VIENT DU DEHORS : un fichier importé, une base
     abîmée, une version future. `null` n'est pas un objet, et se disait
     défensif sans l'être — un parcours l'a attrapé avant l'usager. */
  if (typeof brut !== 'object' || brut === null) return null;
  const champs = brut as { id?: unknown; nom?: unknown; emoji?: unknown; couleur?: unknown };
  const nom = typeof champs.nom === 'string' ? champs.nom.trim().slice(0, NOM_MAX) : '';
  if (nom === '') return null;

  /* UN SEUL ÉMOJI, ET C'EST MESURÉ EN GRAPPES : « 🇫🇷 » et « 👍🏽 » comptent
     plusieurs points de code mais s'affichent en un seul signe. Découper au
     caractère les couperait en deux. */
  const emojiBrut = typeof champs.emoji === 'string' ? champs.emoji.trim() : '';
  const emoji = premiereGrappe(emojiBrut) || '📍';

  const couleurBrute = typeof champs.couleur === 'string' ? champs.couleur.trim() : '';
  /* LA COULEUR EST BORNÉE À CE QU'ON SAIT PEINDRE : une valeur libre pourrait
     être illisible sur la carte, ou n'être pas une couleur du tout. */
  const couleur = /^#[0-9A-Fa-f]{6}$/.test(couleurBrute)
    ? couleurBrute.toUpperCase() : COULEURS[0]!;

  const id = typeof champs.id === 'string' && champs.id.trim() !== ''
    ? champs.id.trim() : identifiantDe(nom);

  return { id, nom, emoji, couleur };
}

/** La première grappe de graphèmes d'une chaîne — PURE. */
export function premiereGrappe(texte: string): string {
  if (texte === '') return '';
  /* `Intl.Segmenter` connaît les grappes ; là où il manque, on retombe sur le
     découpage par points de code — imparfait, mais jamais cassant. */
  const Seg = (Intl as unknown as {
    Segmenter?: new (l?: string, o?: { granularity: string }) =>
    { segment(s: string): Iterable<{ segment: string }> };
  }).Segmenter;
  if (Seg) {
    for (const s of new Seg('fr', { granularity: 'grapheme' }).segment(texte)) {
      return s.segment;
    }
    return '';
  }
  return [...texte][0] ?? '';
}

/** Un identifiant lisible tiré du nom — PURE. */
export function identifiantDe(nom: string): string {
  const base = nom.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // Un nom entièrement fait d'émojis ne donnerait rien : on garde une clé.
  return base === '' ? `liste-${Date.now().toString(36)}` : base.slice(0, 40);
}

/**
 * Range les listes lues du stockage — PURE, défensive.
 *
 * LES TROIS LIVRÉES SONT TOUJOURS LÀ, en tête, même si le stockage est vide ou
 * abîmé : une application dont le panneau de favoris est vide au premier
 * lancement ne dit pas ce qu'elle sait faire.
 */
export function versListes(brut: unknown): ListeFavoris[] {
  const lues = Array.isArray(brut)
    ? brut.map((l) => normaliserListe(l))
      .filter((l): l is ListeFavoris => l !== null)
    : [];
  const rendu = [...LISTES_LIVREES];
  for (const l of lues) {
    if (rendu.some((r) => r.id === l.id)) continue;
    rendu.push(l);
  }
  return rendu;
}

/**
 * Les listes que l'usager a ajoutées — celles qu'on écrit dans le stockage.
 *
 * ON NE STOCKE PAS LES LIVRÉES : leur définition vit dans le code, et les
 * recopier figerait un libellé qu'on voudra peut-être corriger.
 */
export function listesAEcrire(listes: readonly ListeFavoris[]): ListeFavoris[] {
  const livrees = new Set(LISTES_LIVREES.map((l) => l.id));
  return listes.filter((l) => !livrees.has(l.id)).map((l) => ({ ...l }));
}
