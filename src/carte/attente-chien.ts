/* <attente-chien> — le chien au volant, en grand, pendant qu'on calcule.
 *
 * ATTENTE-1 (06/09/2026). Armelin, trois fois dans la même journée : « le
 * trajet se reconfigure en piéton avec un recalcul mais rien n'est affiché,
 * on a l'impression que l'application a planté » ; « la navigation se lance
 * et se fige aussitôt quelques secondes […] 3 à 8 secondes » ; « un calcul
 * automatique se lance et fige l'écran […] un logo visuel en gros à l'écran
 * est mieux pour indiquer un temps de latence ». Un texte qui change dans un
 * formulaire qu'on vient de lire n'est pas un signe ; un chien plein écran
 * avec une phrase dessous en est un.
 *
 * UNE SEULE INSTANCE, SUR LE BODY (#carte crée son contexte d'empilement,
 * leçon BLANC-1), obtenue par `attenteChien()` : le planificateur n'a pas à
 * connaître la carte. `montrer` compte les demandes, `cacher` les décompte :
 * deux calculs qui se chevauchent ne se cachent pas l'un l'autre. */

export class AttenteChien extends HTMLElement {
  #demandes = 0;

  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.hidden = true;
    this.setAttribute('role', 'status');
    this.setAttribute('aria-live', 'polite');
    this.innerHTML = `
      <div class="attente-chien-boite">
        <img class="attente-chien-image" src="/icones/volant-192.png" alt="" width="128" height="128">
        <p class="attente-chien-mot"></p>
      </div>`;
  }

  /** Montre le chien et la phrase ; chaque `montrer` attend son `cacher`. */
  montrer(message: string): void {
    this.#demandes += 1;
    const mot = this.querySelector<HTMLElement>('.attente-chien-mot');
    if (mot) mot.textContent = message;
    this.hidden = false;
  }

  cacher(): void {
    this.#demandes = Math.max(0, this.#demandes - 1);
    if (this.#demandes === 0) this.hidden = true;
  }

  /** Cache quoi qu'il en soit — après une erreur, par exemple. */
  effacer(): void {
    this.#demandes = 0;
    this.hidden = true;
  }
}

customElements.define('attente-chien', AttenteChien);

let instance: AttenteChien | null = null;

/** L'instance unique, posée sur le body à la première demande. */
export function attenteChien(): AttenteChien {
  if (!instance) {
    instance = new AttenteChien();
    document.body.appendChild(instance);
  }
  return instance;
}

/**
 * Laisse le navigateur PEINDRE avant un calcul synchrone lourd.
 *
 * Le chien montré juste avant un `planifierArrets` de plusieurs secondes ne
 * paraîtrait qu'après : le fil est occupé. Deux images plus un tour de boucle
 * suffisent pour que l'écran change avant que le calcul ne commence.
 */
export function laisserPeindre(): Promise<void> {
  return new Promise((ok) => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { setTimeout(ok, 0); }); });
  });
}
