// La faute de frappe — non pas la corriger, mais SAVOIR QUAND LA RÉPONSE EST
// À CÔTÉ. Module PUR, sans réseau ni DOM.
//
// CE QUE LA MESURE A DIT, ET QUI A CHANGÉ LE PROJET (09/09/2026, 22 adresses
// réelles vérifiées auprès du service, 72 variantes, dans le mode exact de
// `chercherAdresses`) :
//
//   1. LA BAN TOLÈRE DÉJÀ TRÈS BIEN LA FAUTE : 94 % des fautes d'un caractère
//      rendent la bonne adresse AU PREMIER RANG. Insertion et inversion de
//      deux lettres : 100 %. Suppression et substitution : 89 %. Le retour du
//      04/09 — « à un caractère près, l'adresse est introuvable » — ne décrit
//      donc pas le cas général. Écrire un correcteur pour battre la BAN
//      aurait été du travail contre une porte ouverte.
//
//   2. CE QUI FAIT MAL, C'EST LES 6 % QUI RESTENT — et pas parce qu'ils
//      échouent : parce qu'ils échouent EN SILENCE. « Place Kléer » à
//      Strasbourg rend « 1 Rue Heckler 67000 Strasbourg », une vraie rue de
//      la bonne ville, en tête de liste, suivie de quatre autres vraies rues.
//      Rien ne dit à l'usager qu'aucune ne reprend ce qu'il a tapé. Il en
//      choisit une, et part ailleurs.
//
//   3. LE SCORE DU SERVICE NE SUFFIT PAS À LE DIRE. Sur des adresses
//      complètes il sépare bien (fausses ≤ 0,61, justes ≥ 0,70) — mais
//      l'application interroge à CHAQUE FRAPPE, et 13 % des saisies en cours
//      passent sous ce seuil : « 12 Place Be » vaut 0,49. Un avertissement
//      accroché au score crierait pendant qu'on tape.
//
// D'OÙ CE MODULE. On ne corrige pas : on VÉRIFIE. Ce que l'usager a tapé se
// retrouve-t-il dans ce qui revient, à une faute près ? « Klébr » contre
// « Place Kléber », oui — et c'est justement le cas où la BAN a bien
// travaillé. « Kléer » contre « Rue Heckler », non.
//
// MESURÉ SUR LES MÊMES 92 CAS : la règle voit les 4 réponses à côté sur 4,
// n'accuse à tort AUCUNE des 88 bonnes réponses, et reste muette sur les 7
// saisies en cours qui font trébucher le score.

/* LES MOTS QUI NE PORTENT RIEN. « Rue », « avenue », « de » se retrouvent
   partout et ne prouvent aucune correspondance : les compter ferait passer
   « Rue Heckler » pour une réponse à « Rue Kléer ». On ne juge que sur ce qui
   distingue. « Saint » en fait partie — la France en compte trop. */
const GENERIQUES = new Set([
  'rue', 'avenue', 'place', 'boulevard', 'cours', 'quai', 'allee', 'impasse',
  'chemin', 'route', 'square', 'passage', 'villa', 'voie', 'sentier', 'esplanade',
  'de', 'du', 'des', 'la', 'le', 'les', 'aux', 'au', 'saint', 'sainte',
]);

/** Sans accents, sans ponctuation, en minuscules — PURE. */
export function aplatir(texte: string): string {
  return texte
    .normalize('NFD')
    /* Les signes combinants, écrits en points de code : posés en clair, ils
       sont invisibles à la relecture et un éditeur peut les manger. */
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Les mots d'une saisie qui PROUVENT quelque chose — PURE.
 *
 * On écarte les chiffres : le numéro et le code postal se vérifient autrement,
 * et une faute dessus ne se rattrape pas par ressemblance — le 12 et le 13
 * sont à une lettre l'un de l'autre et à cent mètres.
 */
export function motsPorteurs(saisie: string): string[] {
  return aplatir(saisie).split(' ')
    .filter((m) => m.length >= 4 && !/^\d+$/.test(m) && !GENERIQUES.has(m));
}

/**
 * Distance de Damerau-Levenshtein, bornée — PURE.
 *
 * L'INVERSION DE DEUX LETTRES COMPTE POUR UNE FAUTE, et ce n'est pas un
 * raffinement d'école : c'est la moitié du sujet. « Carems » pour « Carmes »
 * est la faute de frappe la plus banale qui soit — le doigt part trop tôt — et
 * le service la rattrape à 100 % (mesuré). Comptée double, comme le ferait un
 * Levenshtein ordinaire, elle ferait accuser une réponse parfaitement juste :
 * sur dix accusations à tort de la première version, DIX étaient exactement
 * cela.
 *
 * BORNÉE, parce que la réponse ne sert qu'à comparer à un seuil : dès que la
 * ligne courante dépasse le plafond, on rend `plafond + 1` sans finir. Une
 * liste de suggestions se redessine à chaque frappe ; ce calcul-là ne doit
 * jamais se voir.
 */
export function distanceFrappe(a: string, b: string, plafond: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > plafond) return plafond + 1;
  let avant: number[] = [];
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cour = [i];
    let mini = i;
    for (let j = 1; j <= b.length; j += 1) {
      let v = Math.min(
        prec[j]! + 1,
        cour[j - 1]! + 1,
        prec[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      // L'inversion : les deux lettres croisées valent UNE faute.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, avant[j - 2]! + 1);
      }
      cour.push(v);
      if (v < mini) mini = v;
    }
    if (mini > plafond) return plafond + 1;
    avant = prec;
    prec = cour;
  }
  return prec[b.length]!;
}

/* CE QU'ON TOLÈRE, SELON LA LONGUEUR DU MOT. Une faute sur un mot court en
   change le sens — « Vaux » et « Vaud » sont deux communes. Sur un mot long,
   deux fautes restent lisibles et ne créent guère d'ambiguïté. */
export function fautesTolerees(longueur: number): number {
  return longueur <= 7 ? 1 : 2;
}

/**
 * Un mot tapé se retrouve-t-il dans un libellé, à une faute près ? — PURE.
 *
 * LE PRÉFIXE COMPTE COMME UNE CORRESPONDANCE, et c'est ce qui rend la règle
 * utilisable sous autocomplétion : quand on a tapé « Bellecou », la réponse
 * « Bellecour » n'est pas à côté, elle est en avance. Sans cette clause, la
 * règle accuserait à chaque lettre.
 */
export function motRetrouve(mot: string, libelle: string): boolean {
  const plafond = fautesTolerees(mot.length);
  return aplatir(libelle).split(' ').some(
    (c) => c.startsWith(mot) || distanceFrappe(mot, c, plafond) <= plafond,
  );
}

/**
 * Une réponse est-elle À CÔTÉ de ce qui a été tapé ? — PURE.
 *
 * VRAI quand un mot porteur de la saisie ne se retrouve nulle part dans le
 * libellé, même de loin. C'est une accusation, et elle doit donc être avare :
 * une saisie sans aucun mot porteur (« 12 », « rue de ») ne se juge pas.
 */
export function reponseACote(saisie: string, libelle: string): boolean {
  const mots = motsPorteurs(saisie);
  if (mots.length === 0) return false;
  return mots.some((m) => !motRetrouve(m, libelle));
}

/**
 * TOUTES les réponses sont-elles à côté ? — PURE.
 *
 * C'EST LA SEULE FORMULATION HONNÊTE. Il suffit qu'UNE suggestion reprenne ce
 * qu'on a tapé pour qu'il n'y ait rien à signaler : l'usager n'a qu'à la
 * choisir. On ne parle que lorsque la liste entière est à côté — mesuré sur
 * les quatre échecs, les cinq suggestions l'étaient à chaque fois.
 *
 * UNE LISTE VIDE N'EST PAS « À CÔTÉ » : elle est vide, et l'application le dit
 * déjà ailleurs. Deux messages pour un même silence en feraient un bavardage.
 */
export function toutesACote(saisie: string, libelles: readonly string[]): boolean {
  if (libelles.length === 0) return false;
  return libelles.every((l) => reponseACote(saisie, l));
}

/**
 * Ce qu'on dit alors — PURE.
 *
 * ON NE DIT PAS « aucun résultat » : il y en a cinq, ils sont sous les yeux,
 * et le nier passerait pour une panne. On dit ce qui est vrai et utile :
 * aucun ne reprend ce qui a été tapé. La suite appartient à l'usager — c'est
 * lui qui sait s'il s'est trompé de lettre ou de ville.
 */
export const MOT_A_COTE =
  'Aucune de ces suggestions ne reprend ce que vous avez tapé — vérifiez l’orthographe.';
