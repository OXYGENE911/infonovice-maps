/* LA VOIX — celle du navigateur, et d'aucun service.
 *
 * LA DEMANDE. Armelin, le 30/08/2026 : « fais le guidage vocal ».
 *
 * POURQUOI L'API DU NAVIGATEUR, ET RIEN D'AUTRE. Le CLAUDE.md du projet est
 * catégorique : coût de production nul, aucun service tiers, et « aucune
 * donnée utilisateur ne quitte le navigateur ». Une synthèse vocale en ligne
 * — il en existe d'excellentes — enverrait à un tiers, phrase après phrase,
 * l'itinéraire complet de l'usager. C'est exactement ce que ce projet refuse.
 * `speechSynthesis` est DANS le navigateur, gratuite, et présente partout
 * depuis dix ans.
 *
 * UNE RÉSERVE MESURÉE, ET ELLE COMPTE. Toutes les voix ne sont pas locales :
 * la spécification expose `localService`, et certains navigateurs proposent
 * des voix de SERVEUR — le texte part alors chez l'éditeur du navigateur. On
 * PRÉFÈRE donc systématiquement une voix locale, et l'on ne se rabat sur une
 * voix distante que si l'appareil n'en a aucune autre. Ce que l'on dit tout
 * haut le reste : c'est écrit sur la page « Vie privée ».
 *
 * CE MODULE NE DÉCIDE PAS CE QU'IL DIT : il reçoit des phrases toutes faites
 * (lib/annonces.ts) et les prononce. La séparation n'est pas cosmétique — la
 * décision se teste à sec, la prononciation ne se teste que dans un
 * navigateur.
 */

/** Ce qu'on attend d'une voix : parler français, et rester sur l'appareil. */
export function choisirVoix(
  voix: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const francaises = voix.filter((v) => v.lang.toLowerCase().startsWith('fr'));
  if (francaises.length === 0) return null;
  /* LOCALE D'ABORD, TOUJOURS : une voix de serveur enverrait chaque phrase —
     donc chaque rue, chaque sortie — à l'éditeur du navigateur. */
  return francaises.find((v) => v.localService) ?? francaises[0] ?? null;
}

export class Voix {
  #voix: SpeechSynthesisVoice | null = null;

  #prete = false;

  /** Vrai si l'appareil sait parler. */
  static get disponible(): boolean {
    return typeof window !== 'undefined'
      && typeof window.speechSynthesis !== 'undefined'
      && typeof window.SpeechSynthesisUtterance !== 'undefined';
  }

  /**
   * Choisit la voix — et le fait DEUX FOIS s'il le faut.
   *
   * `getVoices()` rend souvent une liste VIDE au premier appel : le
   * navigateur charge ses voix en tâche de fond et prévient par
   * `voiceschanged`. Ne l'appeler qu'une fois, c'est n'avoir aucune voix sur
   * la moitié des appareils — et se croire muet.
   */
  preparer(): void {
    if (!Voix.disponible || this.#prete) return;
    const poser = (): void => {
      this.#voix = choisirVoix(window.speechSynthesis.getVoices());
      if (this.#voix) this.#prete = true;
    };
    poser();
    if (!this.#prete) {
      window.speechSynthesis.addEventListener('voiceschanged', poser, { once: true });
    }
  }

  /**
   * Prononce une phrase.
   *
   * ON COUPE CE QUI EST EN COURS. Deux annonces qui se chevauchent ne
   * s'entendent pas, et la plus récente est toujours la plus utile : « dans
   * 300 mètres » n'a plus d'intérêt quand « tournez maintenant » arrive.
   */
  dire(phrase: string): void {
    if (!Voix.disponible || phrase === '') return;
    try {
      window.speechSynthesis.cancel();
      const mot = new window.SpeechSynthesisUtterance(phrase);
      mot.lang = 'fr-FR';
      if (this.#voix) mot.voice = this.#voix;
      /* UN PEU PLUS LENT QUE LA NORME : au volant, on écoute d'une oreille.
         Un dixième suffit — au-delà, la voix traîne et l'on décroche. */
      mot.rate = 0.95;
      window.speechSynthesis.speak(mot);
    } catch {
      /* Une synthèse indisponible ne doit JAMAIS interrompre le suivi : on
         roule sans voix, ce qui était le cas hier encore. */
    }
  }

  /** Fait taire ce qui est en cours — à l'arrêt du suivi, ou en coupant. */
  taire(): void {
    if (!Voix.disponible) return;
    try { window.speechSynthesis.cancel(); } catch { /* voir `dire` */ }
  }
}
