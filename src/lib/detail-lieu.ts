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
      valeur: cuisine.split(/[;,]/).map((c) => cuisineEnFrancais(c)).join(', '),
    });
  }

  return rendu;
}


/* ==========================================================================
   L'ÉTAT D'OUVERTURE — un verdict SEULEMENT quand on sait (FICHE-3, 01/09).

   Armelin : « ce serait bien d'afficher si l'établissement est ouvert ou
   fermé aujourd'hui et dans combien de temps il ferme ». La position d'hier
   tient : `opening_hours` est un petit langage, et répondre juste en général
   demanderait jours fériés, exceptions de dates et semaines paires. La voie
   du milieu est un ÉVALUATEUR PARTIEL HONNÊTE : il ne rend un verdict que
   sur les expressions qu'il sait évaluer EXACTEMENT — jours de semaine et
   plages horaires, « 24/7 », « off ». Le moindre morceau qu'il ne comprend
   pas (PH, week, dates, sunset…) et il rend `null` : la fiche affiche alors
   les horaires SANS verdict. Un « ouvert » faux fait faire un détour pour
   rien — un silence honnête, non.
   ========================================================================== */

/** Ce que l'évaluateur sait dire — ou `null` quand il ne SAIT pas. */
export interface EtatOuverture {
  ouvert: boolean;
  /** « Ouvert — ferme à 19 h 00 », « Ferme bientôt (18 min) », « Fermé ». */
  texte: string;
}

const JOUR_OSM = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

/** Les plages d'un jour, ou `null` si l'expression dépasse ce qu'on évalue. */
export function plagesDuJour(
  brut: string, jour: number,
): { debut: number; fin: number }[] | null {
  const cible = JOUR_OSM[jour]!;
  const plages: { debut: number; fin: number }[] = [];
  for (const blocBrut of brut.split(';')) {
    const bloc = blocBrut.trim();
    if (bloc === '') continue;
    if (bloc === '24/7') { plages.push({ debut: 0, fin: 24 * 60 }); continue; }
    /* LA GRAMMAIRE ADMISE, ET RIEN D'AUTRE : jours (listes et intervalles),
       plages HH:MM-HH:MM, « off ». Tout le reste — PH, semaine paire, dates,
       sunset — fait rendre `null` : on ne devine pas. */
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+(off|(?:\d{1,2}:\d{2}-\d{1,2}:\d{2})(?:,\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/
      .exec(bloc);
    if (!m) return null;
    const jours = new Set<string>();
    for (const morceau of m[1]!.split(',')) {
      const [a, b] = morceau.split('-');
      if (b === undefined) { jours.add(a!); continue; }
      const ia = JOUR_OSM.indexOf(a as typeof JOUR_OSM[number]);
      const ib = JOUR_OSM.indexOf(b as typeof JOUR_OSM[number]);
      /* L'intervalle OSM tourne en avant, dimanche compris : « Sa-Su » vaut
         samedi puis dimanche, « Fr-Mo » quatre jours. */
      for (let i = ia; ; i = (i + 1) % 7) {
        jours.add(JOUR_OSM[i]!);
        if (i === ib) break;
      }
    }
    if (!jours.has(cible)) continue;
    if (m[2] === 'off') { plages.length = 0; continue; }
    for (const plage of m[2]!.split(',')) {
      const h = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(plage)!;
      const debut = Number(h[1]) * 60 + Number(h[2]);
      let fin = Number(h[3]) * 60 + Number(h[4]);
      /* « 19:00-01:00 » déborde sur demain : on borne À MINUIT plutôt que de
         suivre la nuit — le verdict reste vrai ce soir, et l'on ne prétend
         pas savoir demain. */
      if (fin <= debut) fin = 24 * 60;
      if (debut > 24 * 60 || fin > 24 * 60) return null;
      plages.push({ debut, fin });
    }
  }
  return plages;
}

/** « Ouvert / Fermé maintenant » — `null` quand on ne SAIT pas — PURE. */
export function etatOuverture(brut: string, maintenant: Date): EtatOuverture | null {
  if (brut.trim() === '') return null;
  const plages = plagesDuJour(brut, maintenant.getDay());
  if (plages === null) return null;
  const minute = maintenant.getHours() * 60 + maintenant.getMinutes();
  const enCours = plages.find((p) => minute >= p.debut && minute < p.fin);
  const dire = (m: number): string =>
    `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  if (enCours) {
    const reste = enCours.fin - minute;
    if (enCours.fin >= 24 * 60) return { ouvert: true, texte: 'Ouvert' };
    /* « FERME BIENTÔT » SOUS L'HEURE PILE — le seuil qu'Armelin nomme. */
    if (reste <= 60) {
      return { ouvert: true, texte: `Ferme bientôt (${reste} min, à ${dire(enCours.fin)})` };
    }
    return { ouvert: true, texte: `Ouvert — ferme à ${dire(enCours.fin)}` };
  }
  const suivante = plages.find((p) => p.debut > minute);
  if (suivante) return { ouvert: false, texte: `Fermé — ouvre à ${dire(suivante.debut)}` };
  return { ouvert: false, texte: 'Fermé' };
}

/* LES CUISINES EN FRANÇAIS (FICHE-3, 01/09). Armelin : « les POI restaurants
   affichent une indication du type de cuisine mais en anglais ». Les valeurs
   OSM les plus posées en France ; l'inconnue ressort telle quelle — une
   cuisine rare mal traduite serait pire qu'un mot anglais. */
const CUISINES: Readonly<Record<string, string>> = {
  french: 'française', italian: 'italienne', pizza: 'pizza',
  japanese: 'japonaise', sushi: 'sushi', chinese: 'chinoise',
  indian: 'indienne', thai: 'thaïlandaise', vietnamese: 'vietnamienne',
  lebanese: 'libanaise', turkish: 'turque', kebab: 'kebab',
  moroccan: 'marocaine', mexican: 'mexicaine', spanish: 'espagnole',
  portuguese: 'portugaise', greek: 'grecque', american: 'américaine',
  burger: 'burger', regional: 'régionale', seafood: 'fruits de mer',
  fish: 'poisson', steak_house: 'grillades', barbecue: 'barbecue',
  vegetarian: 'végétarienne', vegan: 'végane', asian: 'asiatique',
  oriental: 'orientale', african: 'africaine', creole: 'créole',
  crepe: 'crêpes', pancake: 'crêpes', sandwich: 'sandwichs',
  bistro: 'bistrot', brasserie: 'brasserie', friture: 'friture',
  couscous: 'couscous', tapas: 'tapas', ramen: 'ramen', korean: 'coréenne',
  ethiopian: 'éthiopienne', peruvian: 'péruvienne', brazilian: 'brésilienne',
  argentinian: 'argentine', russian: 'russe', polish: 'polonaise',
  german: 'allemande', savoyard: 'savoyarde', corsican: 'corse',
  basque: 'basque', alsatian: 'alsacienne', breton: 'bretonne',
  fine_dining: 'gastronomique', fast_food: 'rapide', chicken: 'poulet',
  noodle: 'nouilles', dumpling: 'raviolis', bubble_tea: 'bubble tea',
  ice_cream: 'glaces', dessert: 'desserts', coffee_shop: 'café',
  tea: 'salon de thé', bagel: 'bagels', donut: 'donuts',
};

/** Une valeur de cuisine OSM, en français — PURE, l'inconnue passe intacte. */
export function cuisineEnFrancais(brut: string): string {
  return CUISINES[brut.trim().toLowerCase()] ?? brut.trim().replace(/_/g, ' ');
}
