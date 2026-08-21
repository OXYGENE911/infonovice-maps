// Météo à destination — et surtout À L'HEURE D'ARRIVÉE : savoir qu'il pleut
// à Lyon maintenant n'aide personne qui y arrive dans cinq heures.
//
// ÉCART DE SOUVERAINETÉ ASSUMÉ, ET ÉCRIT. Open-Meteo est un service européen
// (allemand), pas français. Le projet s'était promis « uniquement des API
// publiques françaises » ; sept sources françaises ont été testées le
// 22/08/2026 et aucune ne réunit « sans clé exposée + CORS » (le détail et
// les preuves sont dans docs/apis.md). Décision d'Armelin : prendre
// Open-Meteo ET le dire en clair sur la page « À propos » — une promesse
// qu'on nuance à voix haute vaut mieux qu'une promesse qu'on trahit en
// silence. Aucune donnée personnelle n'est transmise : seules les
// coordonnées de la DESTINATION partent, jamais celles de l'usager.
//
// Les VIGILANCES Météo-France restent hors de portée (elles n'existent que
// derrière la clé) : la roadmap le consigne, l'interface ne les promet pas.
const SERVICE = 'https://api.open-meteo.com/v1/forecast';
const DELAI_MS = 8000;

export class ErreurMeteo extends Error {}

export interface Meteo {
  /** Heure visée, ISO locale du lieu (ex. « 2026-08-22T14:00 »). */
  heure: string;
  temperature: number;
  /** Précipitations en mm sur l'heure. */
  pluie: number;
  ventKmh: number;
  /** Code temps OMM (WMO 4677 simplifié par Open-Meteo). */
  code: number;
}

/** URL de prévision — PURE, testée à sec. */
export function urlMeteo(lon: number, lat: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'temperature_2m,precipitation,weather_code,wind_speed_10m',
    timezone: 'auto',
    forecast_days: '3',
  });
  return `${SERVICE}?${q.toString()}`;
}

/* Codes OMM → français. Table volontairement COMPLÈTE sur les codes
   qu'Open-Meteo émet : un « temps inconnu » sur un bulletin est une faute
   d'attention, pas une fatalité. */
const TEMPS: Record<number, string> = {
  0: 'ciel dégagé',
  1: 'plutôt dégagé',
  2: 'partiellement nuageux',
  3: 'couvert',
  45: 'brouillard',
  48: 'brouillard givrant',
  51: 'bruine légère',
  53: 'bruine',
  55: 'bruine dense',
  56: 'bruine verglaçante',
  57: 'bruine verglaçante dense',
  61: 'pluie faible',
  63: 'pluie',
  65: 'forte pluie',
  66: 'pluie verglaçante',
  67: 'forte pluie verglaçante',
  71: 'neige faible',
  73: 'neige',
  75: 'forte neige',
  77: 'grains de neige',
  80: 'averses faibles',
  81: 'averses',
  82: 'fortes averses',
  85: 'averses de neige',
  86: 'fortes averses de neige',
  95: 'orage',
  96: 'orage avec grêle',
  99: 'violent orage avec grêle',
};

export function libelleTemps(code: number): string {
  return TEMPS[code] ?? 'temps indéterminé';
}

/** Un pictogramme sobre, en texte : aucune image à charger.
    Les seuils ne s'appliquent qu'aux codes RECONNUS : sans cette garde,
    `code >= 95` faisait passer n'importe quel nombre pour un orage. */
export function symboleTemps(code: number): string {
  if (!Object.hasOwn(TEMPS, code)) return '·';
  if (code === 0 || code === 1) return '☀';
  if (code === 2) return '⛅';
  if (code === 3) return '☁';
  if (code === 45 || code === 48) return '≡';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄';
  if (code >= 95) return '⚡';
  return '☂';
}

interface ReponseMeteo {
  hourly?: {
    time?: unknown;
    temperature_2m?: unknown;
    precipitation?: unknown;
    weather_code?: unknown;
    wind_speed_10m?: unknown;
  };
}

/** Choisit l'heure la plus proche de `vise` dans la réponse — PURE.
    `vise` est un horodatage local « YYYY-MM-DDTHH » (le service rend ses
    heures dans le fuseau du LIEU, ce que demande `timezone=auto`). */
export function versMeteo(brut: unknown, vise: Date): Meteo {
  const h = (brut as ReponseMeteo)?.hourly;
  const temps = h?.time;
  if (!Array.isArray(temps) || temps.length === 0) {
    throw new ErreurMeteo('Le service météo n’a pas rendu de prévision exploitable.');
  }
  const nombres = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number) : []);
  const t = nombres(h?.temperature_2m);
  const p = nombres(h?.precipitation);
  const c = nombres(h?.weather_code);
  const w = nombres(h?.wind_speed_10m);

  // Les heures du service sont SANS fuseau (« 2026-08-22T14:00 ») et déjà
  // exprimées dans le fuseau du lieu ; la cible est convertie de la même
  // façon pour que la comparaison ait un sens.
  const cible = vise.getTime();
  let choisi = 0;
  let ecart = Infinity;
  for (let i = 0; i < temps.length; i += 1) {
    const brute = temps[i];
    if (typeof brute !== 'string') continue;
    const quand = new Date(brute).getTime();
    if (Number.isNaN(quand)) continue;
    const d = Math.abs(quand - cible);
    if (d < ecart) { ecart = d; choisi = i; }
  }
  const temperature = t[choisi];
  const code = c[choisi];
  if (!Number.isFinite(temperature) || !Number.isFinite(code)) {
    throw new ErreurMeteo('Le service météo n’a pas rendu de prévision exploitable.');
  }
  return {
    heure: String(temps[choisi]),
    temperature: temperature as number,
    pluie: Number.isFinite(p[choisi]) ? (p[choisi] as number) : 0,
    ventKmh: Number.isFinite(w[choisi]) ? (w[choisi] as number) : 0,
    code: code as number,
  };
}

/** Bulletin en une phrase française — PURE. */
export function phraseMeteo(m: Meteo): string {
  const bouts = [
    `${Math.round(m.temperature)} °C`,
    libelleTemps(m.code),
  ];
  if (m.pluie >= 0.2) bouts.push(`${m.pluie.toFixed(1).replace('.', ',')} mm de pluie`);
  if (m.ventKmh >= 20) bouts.push(`vent ${Math.round(m.ventKmh)} km/h`);
  return bouts.join(' · ');
}

/** Heure d'arrivée = maintenant + durée du trajet — PURE. */
export function heureArrivee(dureeSecondes: number, maintenant: Date): Date {
  return new Date(maintenant.getTime() + dureeSecondes * 1000);
}

/** Formate une heure d'arrivée en français : « à 14 h 30 » — PURE. */
export function formaterHeure(d: Date): string {
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function meteoA(
  lon: number, lat: number, vise: Date, signal?: AbortSignal,
): Promise<Meteo> {
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(urlMeteo(lon, lat), {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)])
          : AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
      if (r.ok) return versMeteo(await r.json(), vise);
      // Même politique que les autres services : seuls les 5xx se rejouent.
      if (r.status >= 500) throw new Error(`service ${r.status}`);
      throw new ErreurMeteo(`La météo est indisponible (réponse ${r.status}).`);
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof ErreurMeteo) throw e;
      derniere = e;
      if (essai === 0) await new Promise((s) => setTimeout(s, 500));
    }
  }
  throw new ErreurMeteo(
    'La météo est momentanément indisponible. Réessayez dans un instant.',
    { cause: derniere },
  );
}
