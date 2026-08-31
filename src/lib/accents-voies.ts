/* RENDRE LEURS ACCENTS AUX NOMS DE VOIES — un dictionnaire BORNÉ, PURE.
 *
 * LA DEMANDE. Armelin, le 31/08/2026 : « mon adresse "Avenue du prophète" est
 * écrite "Avenue du Prophete" sans accent. Du coup, la lecture vocale
 * prononce le nom tel quel et phonétiquement, ça fait tache d'entendre
 * "Avenue du Proph[eu]te". Si les vrais accents étaient présents, la lecture
 * vocale serait de meilleure qualité. »
 *
 * D'OÙ VIENT LE DÉFAUT — MESURÉ, ET CE N'EST PAS NOUS. Le moteur d'itinéraire
 * rend les noms depuis la BD TOPO, en majuscules, abrégés et SANS accents :
 * « IMP DU PROPHETE », « R DOCTEUR LEON PERRIN », « AV DE LA MARECHALE ».
 * Vérifié le 31/08 sur l'API : la BAN elle-même a perdu l'accent pour
 * certaines de ces voies.
 *
 * CE QU'ON PEUT PROMETTRE, ET CE QU'ON NE PEUT PAS. Deviner les accents du
 * français en général est impossible sans se tromper : « cote » et « côte »,
 * « mure » et « mûre », « pêcheur » et « pécheur » sont des mots différents.
 * Une règle automatique ferait des fautes AILLEURS pour en corriger ici, et
 * une faute inventée est pire qu'une lettre manquante.
 *
 * ON CHOISIT DONC UN DICTIONNAIRE FERMÉ : seuls les mots listés ici reçoivent
 * leurs accents ; tout le reste passe intact. La liste ne contient que des
 * mots dont la forme accentuée est CERTAINE dans un nom de voie français —
 * les ambigus en sont écartés, et cet écart est délibéré :
 *
 *   — « marche » n'y est PAS : « place du Marché » est fréquent, mais
 *     « rue de la Marche » existe (le pays de la Marche, une marche d'escalier).
 *   — « cote » n'y est PAS : « la Côte » et « la Cote » sont deux mots.
 *   — « mure », « tache », « sur », « pres » n'y sont pas davantage.
 *
 * CE QUE ÇA CHANGE. À l'écran, le nom s'écrit juste. À la voix, la synthèse
 * prononce « Prophète » au lieu de « Proph-eu-te » — c'est la demande exacte,
 * et c'est la même correction qui sert les deux.
 */

/* LE DICTIONNAIRE, en minuscules sans accents → forme accentuée en minuscules.
   La capitalisation est faite APRÈS, par l'appelant : ce module ne s'occupe
   que des accents. */
const ACCENTS: Readonly<Record<string, string>> = {
  // — Le religieux et le civil, très présents dans les noms de rues —
  eglise: 'église', abbe: 'abbé', eveque: 'évêque',
  eveche: 'évêché', cure: 'curé', prieure: 'prieuré', prophete: 'prophète',
  bapteme: 'baptême',
  prefecture: 'préfecture', hotel: 'hôtel',
  hopital: 'hôpital', ecole: 'école', college: 'collège', lycee: 'lycée',
  universite: 'université', bibliotheque: 'bibliothèque', theatre: 'théâtre',
  cinema: 'cinéma', musee: 'musée', cimetiere: 'cimetière',
  // — La République et son vocabulaire —
  republique: 'république', liberte: 'liberté', egalite: 'égalité',
  fraternite: 'fraternité', liberation: 'libération', resistance: 'résistance',
  deportes: 'déportés', deportation: 'déportation', armee: 'armée',
  general: 'général', marechal: 'maréchal', marechale: 'maréchale',
  president: 'président', depute: 'député', senateur: 'sénateur',
  federation: 'fédération',
  // — Le paysage —
  foret: 'forêt', chene: 'chêne', chenes: 'chênes', hetre: 'hêtre',
  hetres: 'hêtres', muriers: 'mûriers', murier: 'mûrier', cedre: 'cèdre',
  cedres: 'cèdres', genets: 'genêts', bruyere: 'bruyère', bruyeres: 'bruyères',
  riviere: 'rivière', rivieres: 'rivières', carriere: 'carrière',
  carrieres: 'carrières', vallee: 'vallée',
  montee: 'montée', allee: 'allée', allees: 'allées', ile: 'île',
  iles: 'îles', etang: 'étang', etangs: 'étangs', pre: 'pré',
  chateau: 'château', chateaux: 'châteaux',
  clotures: 'clôtures', frenes: 'frênes', frene: 'frêne',
  trefle: 'trèfle', oree: 'orée',
  // — Les métiers et les titres —
  ingenieur: 'ingénieur',
  // — Les prénoms accentués les plus fréquents en France —
  andre: 'andré', rene: 'rené', renee: 'renée', helene: 'hélène',
  therese: 'thérèse', gerard: 'gérard', emile: 'émile', edouard: 'édouard',
  etienne: 'étienne', eugene: 'eugène', frederic: 'frédéric',
  frederick: 'frédérick', desire: 'désiré', desiree: 'désirée',
  cesar: 'césar', felix: 'félix', honore: 'honoré', leon: 'léon',
  leonie: 'léonie', leopold: 'léopold', michele: 'michèle', noel: 'noël',
  remi: 'rémi', stephane: 'stéphane', stephanie: 'stéphanie',
  jerome: 'jérôme', raphael: 'raphaël', barthelemy: 'barthélemy',
  clement: 'clément', genevieve: 'geneviève', irenee: 'irénée',
  aime: 'aimé', aimee: 'aimée', amedee: 'amédée',
  benedicte: 'bénédicte', cecile: 'cécile', celestin: 'célestin',
  elisabeth: 'élisabeth', jeremie: 'jérémie',
  // — Les noms propres accentués les plus donnés aux rues —
  jaures: 'jaurès', moliere: 'molière', ampere: 'ampère',
  lumiere: 'lumière',
  lumieres: 'lumières',
  // — Divers fréquents —
  premiere: 'première', derniere: 'dernière', frere: 'frère', freres: 'frères',
  pere: 'père', peres: 'pères', mere: 'mère', meres: 'mères',
  barriere: 'barrière', barrieres: 'barrières', croisiere: 'croisière',
  ferriere: 'ferrière', ferrieres: 'ferrières', lisiere: 'lisière',
  pepiniere: 'pépinière', pepinieres: 'pépinières',
  chevrefeuille: 'chèvrefeuille',
  bles: 'blés', epis: 'épis', ble: 'blé',
  gue: 'gué', peage: 'péage', echangeur: 'échangeur', ecluse: 'écluse',
  levee: 'levée', jetee: 'jetée',
};

/* CES MOTS-LÀ SONT ÉCARTÉS EXPRÈS, et la liste existe pour que le choix se
   voie : leur forme accentuée n'est pas certaine dans un nom de voie, et une
   faute inventée est pire qu'une lettre manquante. */
export const AMBIGUS: readonly string[] = [
  'marche', 'cote', 'mure', 'mures', 'tache', 'pres', 'sur', 'pecheur',
  'foret_noire', 'roture', 'cotes',
];

/**
 * Rend ses accents à UN mot, s'il est au dictionnaire — PURE.
 *
 * Le mot est attendu en minuscules et sans accents. Inconnu, il ressort tel
 * quel : c'est la garantie du dictionnaire fermé.
 */
export function accentuerMot(mot: string): string {
  return ACCENTS[mot] ?? mot;
}

/**
 * Rend ses accents à un libellé entier, mot à mot — PURE.
 *
 * LES SEGMENTS COMPOSÉS SONT TRAITÉS CHACUN POUR SOI : « saint-andre » doit
 * donner « saint-andré », et non rester intact faute d'avoir reconnu le tout.
 * L'élision aussi : « l’eglise » porte son accent sur « eglise ».
 */
export function accentuerLibelle(libelle: string): string {
  return libelle.replace(/[\p{L}]+/gu, (mot) => {
    const bas = mot.toLowerCase();
    const accentue = ACCENTS[bas];
    if (accentue === undefined) return mot;
    /* LA CASSE D'ORIGINE EST RENDUE : le libellé arrive parfois déjà
       capitalisé, et remplacer « Prophete » par « prophète » aurait corrigé
       l'accent en cassant la majuscule. */
    if (mot[0] === mot[0]?.toUpperCase() && mot !== bas) {
      return accentue[0]!.toUpperCase() + accentue.slice(1);
    }
    return accentue;
  });
}
