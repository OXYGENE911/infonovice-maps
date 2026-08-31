/* CE QU'ON SAIT DIRE D'UN LIEU — lecture des étiquettes OSM, PURE.
 *
 * LA DEMANDE. Armelin, le 31/08/2026 : « quand on clique sur un POI à
 * l'écran, il y a juste écrit un texte pour indiquer le nom de l'enseigne ou
 * le type de POI, mais ce serait bien d'afficher une fenêtre avec du détail
 * sur le POI ainsi qu'un bouton permettant de configurer directement un trajet
 * pour y aller ou pour l'ajouter en favoris. »
 *
 * D'OÙ VIENT LE DÉTAIL — DE CE QU'ON A DÉJÀ. La réponse d'Overpass porte les
 * étiquettes complètes ; on n'en gardait que le nom. Aucune requête de plus
 * n'est nécessaire : il suffisait de ne pas jeter.
 *
 * CE QU'ON N'INVENTE PAS. Une fiche qui affiche des rubriques vides donne
 * l'impression d'un lieu mal renseigné alors que c'est la CARTE qui l'est.
 * Chaque rubrique n'existe que si sa donnée existe — et l'on dit d'où elle
 * vient, comme partout ailleurs dans le projet.
 *
 * LES HORAIRES SONT LE CAS DÉLICAT. `opening_hours` est un petit langage à
 * lui tout seul (« Mo-Fr 08:00-12:00,14:00-19:00; Sa 09:00-18:00; PH off »).
 * L'INTERPRÉTER POUR RÉPONDRE « ouvert maintenant ? » demanderait de gérer les
 * jours fériés, les exceptions de dates, les semaines paires — et une réponse
 * fausse sur ce point-là fait faire un détour pour rien. ON AFFICHE DONC LA
 * CHAÎNE MISE EN FRANÇAIS, sans jamais conclure : l'usager lit, et décide.
 */

/** Une rubrique de la fiche : ce qu'on affiche, et comment. */
export interface Rubrique {
  cle: string;
  libelle: string;
  valeur: string;
  /** Un lien à ouvrir — `tel:`, `mailto:` ou http(s). */
  lien?: string;
}

/** Les jours de la semaine OSM, en français. */
const JOURS: Readonly<Record<string, string>> = {
  Mo: 'lundi', Tu: 'mardi', We: 'mercredi', Th: 'jeudi',
  Fr: 'vendredi', Sa: 'samedi', Su: 'dimanche', PH: 'jours fériés',
};

/**
 * Met des horaires OSM en français — PURE, SANS conclure.
 *
 * ON NE DIT PAS « ouvert » : voir l'en-tête. On traduit les abréviations, on
 * remplace `off` par « fermé », et l'on rend les plages lisibles. Ce qu'on ne
 * sait pas traduire ressort tel quel plutôt que d'être caché.
 */
export function horairesEnFrancais(brut: string): string {
  return lignesHoraires(brut).join(' · ');
}

/**
 * Les mêmes horaires, une LIGNE PAR BLOC — pour le tableau de la fiche.
 *
 * LA DEMANDE (FICHE-2, 31/08) : « ce serait plus joli et facile à lire
 * d'afficher une sorte de tableau avec un jour par ligne et les horaires
 * associés ». Un bloc de l'expression OSM est déjà « des jours et leurs
 * plages » : c'est la ligne naturelle du tableau.
 */
export function lignesHoraires(brut: string): string[] {
  return brut
    .split(';')
    .map((bloc) => bloc.trim())
    .filter((bloc) => bloc !== '')
    .map((bloc) => bloc
      // Les intervalles de jours : « Mo-Fr » → « du lundi au vendredi ».
      .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)\b/g,
        (_, a: string, b: string) => `du ${JOURS[a]} au ${JOURS[b]}`)
      // Les jours isolés, listés.
      .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (j: string) => JOURS[j] ?? j)
      .replace(/\boff\b/gi, 'fermé')
      .replace(/\b24\/7\b/g, 'ouvert en permanence')
      .replace(/,/g, ' et ')
      /* « DE … À … » PLUTÔT QU'UN TIRET : « 12 h 00-14 h 00 » se lit mal à
         l'œil et plus mal encore à voix haute. La plage se dit d'abord, le
         tiret ne se prononce pas. */
      .replace(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g,
        'de $1 h $2 à $3 h $4')
      .trim());
}

/**
 * Les rubriques d'un lieu, d'après ses étiquettes — PURE.
 *
 * L'ORDRE EST CELUI DE L'USAGE : ce qui décide d'y aller vient d'abord —
 * l'adresse, les horaires — puis ce qui sert une fois décidé.
 */
export function rubriquesDe(tags: Readonly<Record<string, string>>): Rubrique[] {
  const rendu: Rubrique[] = [];
  const lire = (...cles: string[]): string | null => {
    for (const c of cles) {
      const v = tags[c];
      if (typeof v === 'string' && v.trim() !== '') return v.trim();
    }
    return null;
  };

  /* L'ADRESSE SE RECOMPOSE : OSM la range en morceaux, et « 12 rue de la
     Paix » se lit mieux que trois étiquettes séparées. */
  const numero = lire('addr:housenumber');
  const rue = lire('addr:street');
  const ville = lire('addr:city');
  const adresse = [
    [numero, rue].filter(Boolean).join(' '),
    ville,
  ].filter((x) => x !== null && x !== '').join(', ');
  if (adresse !== '') rendu.push({ cle: 'adresse', libelle: 'Adresse', valeur: adresse });

  const horaires = lire('opening_hours');
  if (horaires !== null) {
    rendu.push({
      cle: 'horaires', libelle: 'Horaires', valeur: horairesEnFrancais(horaires),
    });
  }

  const tel = lire('phone', 'contact:phone');
  if (tel !== null) {
    /* LE NUMÉRO SE COMPOSE D'UN DOIGT : en voiture, recopier dix chiffres
       n'est pas une option. Les espaces sont retirés du lien, gardés à
       l'affichage. */
    rendu.push({
      cle: 'tel', libelle: 'Téléphone', valeur: tel,
      lien: `tel:${tel.replace(/[^\d+]/g, '')}`,
    });
  }

  const site = lire('website', 'contact:website', 'url');
  if (site !== null && /^https?:\/\//i.test(site)) {
    rendu.push({
      cle: 'site', libelle: 'Site', valeur: site.replace(/^https?:\/\/(www\.)?/i, ''),
      lien: site,
    });
  }

  /* L'ACCESSIBILITÉ EST UNE INFORMATION DE DÉCISION, pas un détail : elle
     décide d'y aller ou non. On ne l'affiche que si la carte la déclare —
     « inconnu » ne se dit pas « non ». */
  const roulant = lire('wheelchair');
  if (roulant === 'yes' || roulant === 'limited' || roulant === 'no') {
    rendu.push({
      cle: 'roulant', libelle: 'Accès fauteuil',
      valeur: roulant === 'yes' ? 'oui' : (roulant === 'limited' ? 'partiel' : 'non'),
    });
  }

  const cuisine = lire('cuisine');
  if (cuisine !== null) {
    rendu.push({
      cle: 'cuisine',
      libelle: 'Cuisine',
      valeur: cuisine.split(/[;,]/).map((c) => c.trim().replace(/_/g, ' ')).join(', '),
    });
  }

  return rendu;
}
