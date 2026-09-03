// LE THÈME JOUR / NUIT, CHOISI OU SUIVI (THEME-1, 03/09).
//
// LE TERRAIN. Armelin, en 1.60 : « par défaut je suis en carte mode nuit,
// mais je n'ai pas la possibilité de changer ce paramétrage du navigateur en
// plein écran de l'application PWA. Est-ce possible d'ajouter dans le menu la
// possibilité de changer le thème Jour/Nuit ? »
//
// IL A RAISON SUR LE FOND : l'application suivait `prefers-color-scheme`, et
// c'est le bon défaut — mais une PWA installée n'a AUCUN réglage de
// navigateur sous la main. Le choix doit donc exister dans l'application.
//
// TROIS ÉTATS, PAS DEUX. « Auto » reste le défaut et suit le téléphone —
// celui qui passe en sombre à la tombée de la nuit doit continuer de le voir
// faire. « Clair » et « Sombre » sont des choix explicites, posés sur <html>
// en `data-theme`, et chaque bloc sombre du CSS sait les lire (voir la
// transformation dans les feuilles : le média est gardé par
// `:not([data-theme="clair"])`, et dupliqué sous `[data-theme="sombre"]`).

import { lirePreference, ecrirePreference } from './stockage';

export type Theme = 'auto' | 'clair' | 'sombre';
export const THEMES: readonly Theme[] = ['auto', 'clair', 'sombre'];
export const PREF_THEME = 'theme';

/** Le libellé de chaque choix, tel que le menu l'écrit. */
export const LIBELLES_THEME: Record<Theme, string> = {
  auto: 'Auto', clair: 'Jour', sombre: 'Nuit',
};

/** Un thème lu du stockage — PURE, défensive. */
export function versTheme(brut: unknown): Theme {
  return typeof brut === 'string' && (THEMES as readonly string[]).includes(brut)
    ? brut as Theme : 'auto';
}

/**
 * Le rendu est-il sombre ? — PURE.
 *
 * C'est LA décision que le CSS prend de son côté ; l'écrire ici aussi permet
 * au canevas de la carte (un filtre JS, pas une règle CSS) de prendre LA MÊME.
 * Deux décisions séparées finiraient par diverger — carte claire sous
 * interface sombre, le genre d'écart qu'on met des semaines à revoir.
 */
export function estSombre(theme: Theme, systemeSombre: boolean): boolean {
  if (theme === 'sombre') return true;
  if (theme === 'clair') return false;
  return systemeSombre;
}

/** Pose le choix sur <html> — c'est lui que toutes les feuilles lisent. */
export function appliquerTheme(theme: Theme): void {
  if (theme === 'auto') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = theme;
  /* LA CARTE DOIT L'APPRENDRE : son mode nuit est un filtre sur le canevas,
     piloté en JS — une classe CSS ne suffit pas à l'avertir du changement. */
  document.dispatchEvent(new CustomEvent('theme-change'));
}

/** Le choix courant, depuis <html> — la seule source pendant la session. */
export function themeCourant(): Theme {
  return versTheme(document.documentElement.dataset['theme'] ?? 'auto');
}

/** Restaure le thème gardé, au plus tôt du chargement. */
export async function restaurerTheme(): Promise<void> {
  try {
    appliquerTheme(versTheme(await lirePreference<unknown>(PREF_THEME)));
  } catch { /* sans stockage lisible, on reste en auto */ }
}

/** Garde le choix — l'échec d'écriture ne casse pas le geste. */
export function garderTheme(theme: Theme): void {
  appliquerTheme(theme);
  void ecrirePreference(PREF_THEME, theme).catch(() => { /* tant pis */ });
}
