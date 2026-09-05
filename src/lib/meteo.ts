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
  /** Heure retenue, ISO locale du lieu (ex. « 2026-08-22T14:00 »). */
  heure: string;
  temperature: number;
  /** Précipitations en mm sur l'heure. */
  pluie: number;
  ventKmh: number;
  /** Code temps OMM (WMO 4677 simplifié par Open-Meteo). */
  code: number;
  /** Décalage du LIEU par rapport à UTC, en secondes (fourni par le service). */
  decalageLieu: number;
  /** Écart entre l'heure retenue et l'heure demandée, en minutes.
      Au-delà de l'horizon de prévision, il devient énorme : l'appelant DOIT
      le regarder plutôt que d'afficher un bulletin trompeur. */
  ecartMinutes: number;
}

/** Au-delà, la case trouvée ne décrit plus l'arrivée : mieux vaut le dire
    que de servir un bulletin faux (revue du 22/08). */
export const ECART_MAX_MINUTES = 90;

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
  utc_offset_seconds?: unknown;
  hourly?: {
    time?: unknown;
    temperature_2m?: unknown;
    precipitation?: unknown;
    weather_code?: unknown;
    wind_speed_10m?: unknown;
  };
}

/** Choisit l'heure la plus proche de l'instant `vise` — PURE.
    LE PIÈGE DES FUSEAUX, ET SA PARADE. `timezone=auto` fait rendre au service
    des heures LOCALES AU LIEU et sans décalage (« 2026-08-22T14:00 ») ; les
    lire avec `new Date(...)` les interprète dans le fuseau du NAVIGATEUR.
    Tant que l'usager est en France pour un trajet en France, cela coïncide —
    et ment dès que les deux diffèrent (depuis La Réunion, deux heures
    d'écart ; depuis Nouméa, neuf — soit la nuit pour une arrivée en plein
    jour). La réponse porte `utc_offset_seconds` : on s'en sert pour ramener
    chaque case à un INSTANT ABSOLU, seule grandeur comparable (revue 22/08). */
export function versMeteo(brut: unknown, vise: Date): Meteo {
  const r = brut as ReponseMeteo;
  const h = r?.hourly;
  const temps = h?.time;
  if (!Array.isArray(temps) || temps.length === 0) {
    throw new ErreurMeteo('Le service météo n’a pas rendu de prévision exploitable.');
  }
  const decalageLieu = Number.isFinite(Number(r?.utc_offset_seconds))
    ? Number(r.utc_offset_seconds) : 0;
  const nombres = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number) : []);
  const t = nombres(h?.temperature_2m);
  const p = nombres(h?.precipitation);
  const c = nombres(h?.weather_code);
  const w = nombres(h?.wind_speed_10m);

  const cible = vise.getTime();
  let choisi = -1;
  let ecart = Infinity;
  for (let i = 0; i < temps.length; i += 1) {
    const brute = temps[i];
    if (typeof brute !== 'string') continue;
    // « 2026-08-22T14:00 » + « Z » se lit en UTC ; retrancher le décalage du
    // lieu rend l'instant absolu où il est 14 h LÀ-BAS.
    const quand = Date.parse(`${brute}Z`) - decalageLieu * 1000;
    if (Number.isNaN(quand)) continue;
    const d = Math.abs(quand - cible);
    if (d < ecart) { ecart = d; choisi = i; }
  }
  const temperature = t[choisi];
  const code = c[choisi];
  if (choisi < 0 || !Number.isFinite(temperature) || !Number.isFinite(code)) {
    throw new ErreurMeteo('Le service météo n’a pas rendu de prévision exploitable.');
  }
  return {
    heure: String(temps[choisi]),
    temperature: temperature as number,
    pluie: Number.isFinite(p[choisi]) ? (p[choisi] as number) : 0,
    ventKmh: Number.isFinite(w[choisi]) ? (w[choisi] as number) : 0,
    code: code as number,
    decalageLieu,
    ecartMinutes: Math.round(ecart / 60_000),
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

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** L'heure d'arrivée DANS LE FUSEAU DU LIEU, avec le jour quand l'arrivée
    n'est pas pour aujourd'hui — PURE. « 14 h 05 » lu à midi laisse croire
    « dans deux heures » même quand l'arrivée est le lendemain (trajet à
    pied), et l'horloge du navigateur n'est pas celle de la destination
    (revue du 22/08). `decalageLieu` en secondes, `maintenant` sert à savoir
    si l'on change de jour LÀ-BAS. */
export function formaterHeure(arrivee: Date, decalageLieu = 0, maintenant?: Date): string {
  // Décaler l'instant puis lire en UTC = lire l'heure telle qu'elle est au lieu.
  const laBas = new Date(arrivee.getTime() + decalageLieu * 1000);
  const heure = `${laBas.getUTCHours()} h ${String(laBas.getUTCMinutes()).padStart(2, '0')}`;
  if (!maintenant) return heure;
  const iciLaBas = new Date(maintenant.getTime() + decalageLieu * 1000);
  const jours = Math.round(
    (Date.UTC(laBas.getUTCFullYear(), laBas.getUTCMonth(), laBas.getUTCDate())
      - Date.UTC(iciLaBas.getUTCFullYear(), iciLaBas.getUTCMonth(), iciLaBas.getUTCDate()))
    / 86_400_000,
  );
  if (jours <= 0) return heure;
  if (jours === 1) return `demain ${heure}`;
  if (jours < 7) return `${JOURS[laBas.getUTCDay()]} ${heure}`;
  return `dans ${jours} jours, ${heure}`;
}

export async function meteoA(
  lon: number, lat: number, vise: Date, signal?: AbortSignal,
): Promise<Meteo> {
  return versMeteo(await lireJson(urlMeteo(lon, lat), signal), vise);
}

/** Un appel au service, deux essais, huit secondes : la politique commune à
 *  la météo d'arrivée et au bulletin d'une ville. */
async function lireJson(url: string, signal?: AbortSignal): Promise<unknown> {
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)])
          : AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
      if (r.ok) return await r.json();
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

/* LE BULLETIN D'UNE VILLE (METEO-VILLE-1, 05/09/2026). Des amis d'Armelin :
   « la météo d'une ville au choix, heure par heure, et sur 7 jours ». Même
   service, même dérogation publique, une requête de plus (`daily`). */
export interface PrevisionHeure {
  /** « 14 h », dans l'heure du LIEU. */
  heure: string;
  temperature: number;
  pluie: number;
  ventKmh: number;
  code: number;
}
export interface PrevisionJour {
  /** « aujourd’hui », « demain », puis « lundi 7 ». */
  jour: string;
  min: number;
  max: number;
  pluie: number;
  ventKmh: number;
  code: number;
}
export interface Previsions {
  heures: PrevisionHeure[];
  jours: PrevisionJour[];
  decalageLieu: number;
}

export function urlPrevisions(lon: number, lat: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'temperature_2m,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
    timezone: 'auto',
    forecast_days: '7',
  });
  return `${SERVICE}?${q.toString()}`;
}

interface ReponsePrevisions extends ReponseMeteo {
  daily?: {
    time?: unknown;
    weather_code?: unknown;
    temperature_2m_max?: unknown;
    temperature_2m_min?: unknown;
    precipitation_sum?: unknown;
    wind_speed_10m_max?: unknown;
  };
}

/** Vingt-quatre heures à partir de MAINTENANT (heure du lieu), puis sept
 *  jours — PURE. Le fuseau du lieu fait foi, comme pour la météo d'arrivée. */
export function versPrevisions(brut: unknown, maintenant: Date): Previsions {
  const r = brut as ReponsePrevisions;
  const h = r?.hourly;
  const d = r?.daily;
  const heuresBrutes = h?.time;
  const joursBruts = d?.time;
  if (!Array.isArray(heuresBrutes) || heuresBrutes.length === 0
    || !Array.isArray(joursBruts) || joursBruts.length === 0) {
    throw new ErreurMeteo('Le service météo n’a pas rendu de prévision exploitable.');
  }
  const decalageLieu = Number.isFinite(Number(r?.utc_offset_seconds))
    ? Number(r.utc_offset_seconds) : 0;
  const nombres = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number) : []);
  const ou0 = (v: number | undefined): number => (Number.isFinite(v) ? (v as number) : 0);

  const t = nombres(h?.temperature_2m);
  const p = nombres(h?.precipitation);
  const c = nombres(h?.weather_code);
  const w = nombres(h?.wind_speed_10m);
  /* La première case qui n'est pas déjà passée de plus d'une demi-heure :
     à 14 h 20, la frise commence à 14 h. */
  const seuil = maintenant.getTime() - 30 * 60_000;
  let debut = heuresBrutes.findIndex((b) =>
    typeof b === 'string' && Date.parse(`${b}Z`) - decalageLieu * 1000 >= seuil);
  if (debut < 0) debut = Math.max(0, heuresBrutes.length - 24);
  const heures: PrevisionHeure[] = [];
  for (let i = debut; i < heuresBrutes.length && heures.length < 24; i += 1) {
    const b = heuresBrutes[i];
    if (typeof b !== 'string' || !Number.isFinite(t[i]) || !Number.isFinite(c[i])) continue;
    heures.push({
      heure: `${Number(b.slice(11, 13))} h`,
      temperature: t[i] as number, pluie: ou0(p[i]), ventKmh: ou0(w[i]), code: c[i] as number,
    });
  }

  const cj = nombres(d?.weather_code);
  const tmax = nombres(d?.temperature_2m_max);
  const tmin = nombres(d?.temperature_2m_min);
  const pj = nombres(d?.precipitation_sum);
  const wj = nombres(d?.wind_speed_10m_max);
  const jours: PrevisionJour[] = [];
  for (let i = 0; i < joursBruts.length && jours.length < 7; i += 1) {
    const b = joursBruts[i];
    if (typeof b !== 'string' || !Number.isFinite(tmax[i]) || !Number.isFinite(tmin[i])
      || !Number.isFinite(cj[i])) continue;
    const date = new Date(`${b}T00:00:00Z`);
    const jour = i === 0 ? 'aujourd’hui' : i === 1 ? 'demain'
      : `${JOURS[date.getUTCDay()]} ${date.getUTCDate()}`;
    jours.push({ jour, min: tmin[i] as number, max: tmax[i] as number,
      pluie: ou0(pj[i]), ventKmh: ou0(wj[i]), code: cj[i] as number });
  }
  if (heures.length === 0 || jours.length === 0) {
    throw new ErreurMeteo('Le service météo n’a pas rendu de prévision exploitable.');
  }
  return { heures, jours, decalageLieu };
}

export async function previsionsA(
  lon: number, lat: number, signal?: AbortSignal, maintenant = new Date(),
): Promise<Previsions> {
  return versPrevisions(await lireJson(urlPrevisions(lon, lat), signal), maintenant);
}
