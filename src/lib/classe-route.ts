/* LA CLASSE D'UNE ROUTE, LUE SUR SON NUMÉRO — et ce qu'on a le droit d'en
 * peindre.
 *
 * LA DEMANDE. Armelin, le 29/08/2026 : « les fenêtres flottantes
 * d'instructions doivent s'afficher dans des cartouches de couleurs en
 * fonction de la route empruntée, comme du Bleu pour les indications sur
 * autoroute, du vert pour les nationales et du orange pour les
 * départementales ». La convention retenue est la SIENNE, énoncée dans ces
 * termes — elle croise d'ailleurs celle de la signalisation française, où le
 * bleu est l'autoroute et le vert les grandes liaisons.
 *
 * CE QUE LA DONNÉE DONNE, MESURÉ LE 29/08 sur le service Géoplateforme :
 * chaque étape porte `attributes.name.cpx_numero` — relevé « D39 », « D415 »,
 * « D606 » sur un Melun-Fontainebleau. C'est ce champ, et lui seul, qui dit
 * la classe. Aucun champ de VOIES (lanes) n'existe dans la réponse (cherché
 * sur deux itinéraires : aucune occurrence) : les schémas de placement sur
 * la chaussée ne sont donc pas promis — on ne dessine pas ce qu'on ne sait
 * pas.
 */

/** Les classes que le numéro permet d'affirmer. */
export type ClasseRoute = 'autoroute' | 'nationale' | 'departementale' | 'locale';

/**
 * La classe d'une voie d'après son numéro — PURE.
 *
 * Prudence volontaire : une rue nommée (« Rue de Rivoli ») n'est PAS une
 * route numérotée, et tout ce qui n'est pas reconnu retombe sur `locale`,
 * qui ne peint rien de particulier. Mieux vaut un cartouche neutre qu'un
 * cartouche bleu sur une départementale.
 */
export function classeRoute(voie: string): ClasseRoute {
  const v = voie.trim().toUpperCase();
  // « A6 », « A 6 », « A6a » — mais pas « AVENUE », d'où le chiffre exigé.
  if (/^A\s?\d/.test(v)) return 'autoroute';
  // Les nationales s'écrivent « N7 » ou « RN7 » selon les producteurs.
  if (/^R?N\s?\d/.test(v)) return 'nationale';
  // Les départementales : « D906 », « RD 906 », parfois suffixées « D14E ».
  if (/^R?D\s?\d/.test(v)) return 'departementale';
  return 'locale';
}

/**
 * Le numéro à porter sur l'écusson, normalisé — ou `''` si la voie n'est pas
 * une route numérotée.
 *
 * L'espace des producteurs disparaît (« A 6 » devient « A6 ») : un écusson
 * est un signe court, pas une citation.
 */
export function numeroRoute(voie: string): string {
  const v = voie.trim().toUpperCase().replace(/\s+/g, '');
  return classeRoute(v) === 'locale' ? '' : v;
}

/** Comment nommer la classe à voix haute — pour les lecteurs d'écran. */
export function libelleClasse(classe: ClasseRoute): string {
  switch (classe) {
    case 'autoroute': return 'autoroute';
    case 'nationale': return 'route nationale';
    case 'departementale': return 'route départementale';
    default: return 'voie locale';
  }
}
