// La commune française — le repère sur lequel s'appuie l'adressage en mots.
//
// Source : `geo.api.gouv.fr`, service public, sans clé, CORS ouvert (vérifié
// par appels réels le 22/08/2026, voir docs/apis.md). Deux usages seulement :
// - trouver la commune qui CONTIENT un point (pour coder une adresse) ;
// - retrouver une commune par son NOM et son département (pour la décoder).
//
// POURQUOI PAS UNE TABLE EMBARQUÉE. Les 34 969 communes avec leur centre
// pèsent 3,3 Mo bruts ; même réduites au strict nécessaire, elles dépasseraient
// à elles seules le budget de 300 Ko du paquet applicatif. L'adressage en mots
// demande donc le réseau — c'est dit dans l'interface, et la carte hors ligne
// n'en promet rien.
import type { Commune } from './adresse-mots';

const BASE = 'https://geo.api.gouv.fr/communes';
const DELAI_MS = 8000;
const CHAMPS = 'nom,code,centre';

export class ErreurCommune extends Error {}

interface CommuneBrute {
  nom?: unknown;
  code?: unknown;
  centre?: { coordinates?: unknown } | null;
}

/** Ne garde que ce qui est exploitable : un nom, un code INSEE, un centre. */
function versCommune(brut: unknown): Commune | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const c = brut as CommuneBrute;
  const coords = c.centre?.coordinates;
  if (typeof c.nom !== 'string' || typeof c.code !== 'string') return null;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords as [unknown, unknown];
  if (typeof lon !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (!/^\d[\dAB]\d{3}$/.test(c.code)) return null;  // 2A/2B pour la Corse
  return { nom: c.nom, code: c.code, centre: { lon, lat } };
}

/** Une seule reprise, et seulement sur un 5xx : un 404 est une réponse. */
async function appel(url: string, signal?: AbortSignal): Promise<unknown> {
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)])
          : AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
      if (r.ok) return await r.json();
      if (r.status >= 500) throw new Error(`service ${r.status}`);
      throw new ErreurCommune(`Le répertoire des communes est indisponible (réponse ${r.status}).`);
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof ErreurCommune) throw e;
      derniere = e;
      if (essai === 0) await new Promise((s) => { setTimeout(s, 500); });
    }
  }
  throw new ErreurCommune(
    'Le répertoire des communes est momentanément indisponible.',
    { cause: derniere },
  );
}

/** La commune qui contient ce point, ou null en pleine mer comme à l'étranger. */
export async function communeDuPoint(
  p: { lon: number; lat: number },
  signal?: AbortSignal,
): Promise<Commune | null> {
  const url = `${BASE}?lat=${p.lat.toFixed(6)}&lon=${p.lon.toFixed(6)}`
    + `&fields=${CHAMPS}&format=json`;
  const brut = await appel(url, signal);
  if (!Array.isArray(brut) || brut.length === 0) return null;
  return versCommune(brut[0]);
}

/** Les communes portant ce nom dans ce département — au plus une, en principe.
    On rend une LISTE plutôt qu'un résultat : six couples nom/département
    restent ambigus en outre-mer (mesuré sur les 34 969 communes), et taire
    l'ambiguïté vaudrait moins que la montrer. */
export async function communesParNom(
  nom: string,
  departement: string,
  signal?: AbortSignal,
): Promise<Commune[]> {
  const url = `${BASE}?nom=${encodeURIComponent(nom)}&fields=${CHAMPS}`
    + `&format=json&limit=20`;
  const brut = await appel(url, signal);
  if (!Array.isArray(brut)) return [];
  return brut
    .map(versCommune)
    .filter((c): c is Commune => c !== null)
    // `nom=` est une recherche APPROCHÉE : « Dijon » rend aussi
    // « Fontaine-lès-Dijon ». On exige le nom exact, accents et casse mis à
    // part, puis le département.
    .filter((c) => sansAccent(c.nom) === sansAccent(nom))
    .filter((c) => (c.code.startsWith('97')
      ? c.code.startsWith(departement)
      : c.code.startsWith(departement)));
}

/** Comparer des noms de communes sans buter sur les accents ni la casse. */
function sansAccent(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
