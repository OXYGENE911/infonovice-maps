/* LA FEUILLE BASSE — la décision d'Armelin du 28/08 : « on tranche les
 * décisions maintenant : commence par les bottom sheets ».
 *
 * SUR TÉLÉPHONE SEULEMENT. Un volet qui s'ouvre depuis le haut couvre la
 * carte — la capture d'Armelin le montrait — et le pouce ne l'atteint pas.
 * Ancré en bas, il laisse la carte respirer au-dessus et se règle d'un
 * geste : la poignée se tire vers le haut (plein écran), vers le bas
 * (mi-hauteur), plus bas encore (fermé). Sur grand écran, RIEN ne change :
 * les panneaux latéraux y sont à leur place.
 *
 * UNE MÉCANIQUE, PLUSIEURS VOLETS : le planificateur et le menu des
 * réglages l'installent aujourd'hui ; les fiches de borne et de lieu —
 * déjà ancrées en bas — suivront si l'essai convainc (BS-2). C'est la
 * « généralisation » demandée : un seul code, pas un par panneau.
 *
 * LE CLAVIER N'EST PAS CONCERNÉ : la poignée est un confort du doigt
 * (aria-hidden), le volet s'ouvre et se ferme comme avant par son bouton,
 * et son contenu défile normalement.
 */

/** Les paliers d'une feuille : mi-hauteur (défaut) ou plein écran. */
export type Cran = 'mi' | 'plein';

/**
 * Le palier d'arrivée d'un relâchement. PURE, testée à sec.
 *
 * Un geste FRANC décide seul : au-delà d'un demi-pixel par milliseconde, la
 * direction l'emporte — c'est le « flick » qu'on attend d'une feuille.
 * Un geste lent s'arrête au palier le plus proche, fermeture comprise.
 *
 * @param hauteur   hauteur au relâchement, en px
 * @param vitesse   vitesse finale en px/ms — POSITIVE vers le haut
 * @param mi        hauteur du palier mi-hauteur, en px
 * @param plein     hauteur du palier plein écran, en px
 */
export function cranSuivant(
  hauteur: number, vitesse: number, mi: number, plein: number,
): Cran | 'fermer' {
  if (vitesse > 0.5) return hauteur >= mi ? 'plein' : 'mi';
  if (vitesse < -0.5) return hauteur > mi ? 'mi' : 'fermer';
  const paliers: [Cran | 'fermer', number][] = [['fermer', 0], ['mi', mi], ['plein', plein]];
  paliers.sort((a, b) => Math.abs(a[1] - hauteur) - Math.abs(b[1] - hauteur));
  return paliers[0]![0];
}

/** Les hauteurs des paliers pour la fenêtre courante. */
function paliers(): { mi: number; plein: number } {
  return {
    mi: Math.round(window.innerHeight * 0.5),
    /* 0,88 et pas 1 : l'en-tête et un liseré de carte restent visibles —
       une feuille qui mange tout l'écran n'est plus une feuille, c'est une
       page, et l'on perd le contexte qu'elle promettait de garder. */
    plein: Math.round(window.innerHeight * 0.88),
  };
}

const MOBILE = '(max-width: 640px)';

/**
 * Installe la mécanique de feuille basse sur un volet `<details>`.
 *
 * Le CSS (media ≤ 640 px) fait du corps une feuille ancrée en bas dont la
 * hauteur est `var(--feuille-hauteur, 50dvh)` ; ce module ne fait que
 * poser la variable pendant le glissement et au relâchement. Fermer remet
 * tout à zéro : la prochaine ouverture repart à mi-hauteur.
 */
export function installerFeuilleBasse(volet: HTMLDetailsElement, corps: HTMLElement): void {
  const poignee = document.createElement('div');
  poignee.className = 'feuille-poignee';
  poignee.setAttribute('aria-hidden', 'true');
  poignee.appendChild(document.createElement('span'));
  corps.prepend(poignee);

  const mobile = window.matchMedia(MOBILE);
  const poser = (h: number | null): void => {
    if (h === null) corps.style.removeProperty('--feuille-hauteur');
    else corps.style.setProperty('--feuille-hauteur', `${h}px`);
  };

  // Fermé, la hauteur s'oublie : chaque ouverture repart à mi-hauteur.
  volet.addEventListener('toggle', () => { if (!volet.open) poser(null); });
  // Un passage sur grand écran (rotation, fenêtre redimensionnée) rend le
  // volet à sa forme latérale : la hauteur de feuille n'y a pas de sens.
  mobile.addEventListener('change', () => { if (!mobile.matches) poser(null); });

  let depart: { y: number; h: number } | null = null;
  let precedent = { y: 0, t: 0 };
  let dernier = { y: 0, t: 0 };

  poignee.addEventListener('pointerdown', (e) => {
    if (!mobile.matches) return;
    poignee.setPointerCapture(e.pointerId);
    depart = { y: e.clientY, h: corps.getBoundingClientRect().height };
    precedent = dernier = { y: e.clientY, t: performance.now() };
    // La transition se coupe sous le doigt : une feuille qui « rattrape » le
    // geste avec 200 ms de retard paraît molle.
    corps.classList.add('feuille-glisse');
  });

  poignee.addEventListener('pointermove', (e) => {
    if (!depart) return;
    precedent = dernier;
    dernier = { y: e.clientY, t: performance.now() };
    const h = Math.min(Math.max(depart.h + (depart.y - e.clientY), 40), paliers().plein);
    poser(h);
  });

  const relacher = (e: PointerEvent): void => {
    if (!depart) return;
    depart = null;
    corps.classList.remove('feuille-glisse');
    const { mi, plein } = paliers();
    /* La vitesse se lit sur le DERNIER segment du geste, pas sur sa moyenne :
       un doigt qui hésite puis claque vers le bas veut fermer. */
    const dt = Math.max(dernier.t - precedent.t, 1);
    const vitesse = (precedent.y - dernier.y) / dt;
    const cran = cranSuivant(corps.getBoundingClientRect().height, vitesse, mi, plein);
    if (cran === 'fermer') { volet.open = false; poser(null); return; }
    poser(cran === 'mi' ? mi : plein);
    void e;
  };
  poignee.addEventListener('pointerup', relacher);
  poignee.addEventListener('pointercancel', relacher);
}
