// LE BANC DE RECHERCHE DU LOT 141, REJOUÉ SANS RÉSEAU (lot 144, 09/10/2026).
//
// 67 saisies publiques (monuments, gares, adresses, communes, commerces…), le
// même banc que l'application Maps Pro (`BancLieuxTest.kt`) et le même critère
// de « première réponse juste » : le nom attendu dans le libellé, la commune
// dans le libellé ou le détail, le point dans la tolérance.
//
// IL JOUE LE VRAI CHEMIN DE LA BARRE (`rechercherTout`), pas une copie, sur des
// RÉPONSES GARDÉES (`reponses.json.gz`) : aucun appel ne part, la suite reste
// hors réseau et ne marteler aucun service public. Une URL absente des
// réponses gardées échoue comme une panne — c'est la règle de la barre, qui
// doit savoir vivre avec une source tombée.
//
// RÉ-ENREGISTRER (à la main, jamais en CI) : `BANC_ENREGISTRER=1 npx vitest run
// tests/banc-recherche.test.ts` — un appel à la fois par service, 1,1 s entre
// deux (2 s pour Overpass), puis les réponses gardées sont réécrites.
//
// LA VUE : le centre du banc (Paris Expo Porte de Versailles), une vue de ville
// d'environ 7 km × 7 km — celle de l'étude du 08/10.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { rechercherTout } from '../src/lib/recherche-globale';
import { lireMusees, lireWikidata, MONUMENT, type LieuConnu } from '../src/lib/lieux-connus';
import { mots } from '../src/lib/classement-recherche';
import type { ResultatAdresse } from '../src/lib/adresse';

const ICI = fileURLToPath(new URL('./donnees/banc-recherche/', import.meta.url));
const RACINE = fileURLToPath(new URL('../', import.meta.url));
const ENREGISTRER = process.env['BANC_ENREGISTRER'] === '1';

interface Saisie {
  id: string; saisie: string; nom: string; commune: string; cas: string;
  pres: [number, number]; rayon_m: number; echantillon36: boolean; proApresLot141: boolean;
}
const banc = JSON.parse(readFileSync(`${ICI}banc.json`, 'utf8')) as { centre: { lat: number; lon: number }; requetes: Saisie[] };

/* LES RÉPONSES GARDÉES : clé = sha1(méthode, URL, corps) — le format de l'étude du 08/10. */
interface Gardee { status: number; type: string; body: string }
const FICHIER = `${ICI}reponses.json.gz`;
const gardees: Record<string, Gardee> = existsSync(FICHIER)
  ? JSON.parse(gunzipSync(readFileSync(FICHIER)).toString('utf8')) as Record<string, Gardee> : {};
const sha1 = (s: string): string => createHash('sha1').update(s, 'utf8').digest('hex');
const vraiFetch = globalThis.fetch;
const dernier = new Map<string, number>();
const files = new Map<string, Promise<void>>();
const utilisees = new Set<string>();

async function fetchBanc(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const methode = (init.method ?? 'GET').toUpperCase();
  const corps = typeof init.body === 'string' ? init.body : '';
  const cle = sha1(`${methode}\n${url}\n${corps}`);
  const g = gardees[cle];
  if (g) {
    utilisees.add(cle);
    return new Response(g.body, { status: g.status, headers: { 'content-type': g.type } });
  }
  if (!ENREGISTRER) throw new TypeError(`hors ligne (réponse non gardée) : ${url}`);
  const hote = new URL(url).host;
  const avant = files.get(hote) ?? Promise.resolve();
  let liberer: () => void = () => undefined;
  files.set(hote, avant.then(() => new Promise<void>((ok) => { liberer = ok; })));
  await avant;
  try {
    const attente = (dernier.get(hote) ?? 0) + (hote.includes('overpass') ? 2000 : 1100) - Date.now();
    if (attente > 0) await new Promise((ok) => { setTimeout(ok, attente); });
    const entetes = new Headers(init.headers ?? {});
    entetes.set('User-Agent', 'Infonovice Maps - banc de recherche lot 144 (contact@infonovice.fr)');
    const rep = await vraiFetch(url, { ...init, headers: entetes });
    const body = await rep.text();
    dernier.set(hote, Date.now());
    if (rep.status === 200) { gardees[cle] = { status: 200, type: rep.headers.get('content-type') ?? 'application/json', body }; utilisees.add(cle); }
    return new Response(body, { status: rep.status, headers: { 'content-type': rep.headers.get('content-type') ?? '' } });
  } finally { liberer(); }
}

/* LES LIEUX CONNUS, lus sur le disque : les fichiers mêmes que le site sert. */
function indexDuDisque(): LieuConnu[] {
  const lire = (f: string): unknown => JSON.parse(readFileSync(`${RACINE}public/donnees/${f}`, 'utf8'));
  const monuments = (lire('monuments.json') as unknown[][]).flatMap((m) => {
    const [lon, lat, titre, commune] = m;
    if (typeof lon !== 'number' || typeof lat !== 'number' || typeof titre !== 'string') return [];
    const c = typeof commune === 'string' ? commune : '';
    return [{ nom: titre, commune: c, lon, lat, type: MONUMENT, source: 'notoire' as const, notoriete: 0, motsNom: mots(titre), motsCommune: mots(c) }];
  });
  return [...monuments, ...lireMusees(lire('musees.json')), ...lireWikidata(lire('lieux-wikidata.json'))];
}

/* LE CRITÈRE DE BancLieuxTest.kt : même normalisation, même distance. */
const normaliser = (s: string): string => s.replace(/œ/g, 'oe').replace(/Œ/g, 'oe').replace(/æ/g, 'ae').replace(/Æ/g, 'ae')
  .normalize('NFD').replace(/\p{Mn}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const kx = 111_320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.hypot((lon1 - lon2) * kx, (lat1 - lat2) * 110_540);
}
function juste(r: ResultatAdresse, s: Saisie): boolean {
  const lib = normaliser(r.libelle);
  const det = normaliser(r.contexte);
  const nomOk = new RegExp(s.nom).test(lib);
  const communeOk = s.commune === '' || new RegExp(s.commune).test(lib) || new RegExp(s.commune).test(det);
  return nomOk && communeOk && distanceM(r.lat, r.lon, s.pres[0], s.pres[1]) <= s.rayon_m;
}

const vue = {
  lon: banc.centre.lon, lat: banc.centre.lat,
  emprise: { ouest: banc.centre.lon - 0.0478, est: banc.centre.lon + 0.0478, sud: banc.centre.lat - 0.0315, nord: banc.centre.lat + 0.0315 },
};

/* LES PLANCHERS : la mesure du lot 144 (09/10/2026), qu'un changement ne doit
   pas faire baisser. Avant ce lot : 17 sur 36 et 33 sur 67 ; après : 33 sur 36
   et 60 sur 67 (Maps Pro, application, lot 141 : 32 sur 36 et 62 sur 67). */
const PLANCHER_36 = 33;
const PLANCHER_67 = 60;
/* LES SAISIES JUSTES AVANT LE LOT 144 (mesure du 08/10 et rejeu du 09/10) :
   chacune doit le rester — c'est l'étude de non-régression. */
const JUSTES_AVANT: readonly string[] = [
  'm05', 'm10', 'm12', 'm13', 'm20', 'e01', 'a06', 's01', 'f01', 'f03', 'f04', 'f05', 'l01', 'c03', 'g02', 'g05', 'g09',
  'g10', 'h01', 'h02', 'h04', 'h07', 'h08', 'n01', 'n09', 'cc01', 'cc02', 'st02', 'ev02', 'ev06', 'me03', 'cp01', 'ln03',
];

describe('banc de recherche du lot 141 (67 saisies, réponses gardées)', () => {
  const verdicts = new Map<string, { juste: boolean; rang: number; tete: string }>();
  afterAll(() => {
    if (ENREGISTRER) writeFileSync(FICHIER, gzipSync(JSON.stringify(Object.fromEntries(
      Object.entries(gardees).filter(([k]) => utilisees.has(k)))), { level: 9 }));
  });

  it('rejoue chaque saisie sur le vrai chemin de la barre', async () => {
    vi.stubGlobal('fetch', fetchBanc);
    const index = indexDuDisque();
    try {
      for (const s of banc.requetes) {
        let liste: ResultatAdresse[] = [];
        try {
          liste = (await rechercherTout(s.saisie, { vue, lieuxConnus: () => Promise.resolve(index) })).resultats;
        } catch { liste = []; }
        const rang = liste.slice(0, 10).findIndex((r) => juste(r, s)) + 1;
        verdicts.set(s.id, { juste: rang === 1, rang, tete: liste.slice(0, 3).map((r) => `${r.libelle} — ${r.contexte}`).join(' // ') });
      }
    } finally { vi.unstubAllGlobals(); }
    const sur36 = banc.requetes.filter((s) => s.echantillon36 && verdicts.get(s.id)?.juste).length;
    const sur67 = banc.requetes.filter((s) => verdicts.get(s.id)?.juste).length;
    const lignes = banc.requetes.map((s) => {
      const v = verdicts.get(s.id);
      return `${s.id}\t${s.echantillon36 ? '36' : '  '}\t${v?.juste ? 'oui' : 'non'}\t${v?.rang ?? 0}\t${s.saisie}\t${v?.tete ?? ''}`;
    });
    if (process.env['BANC_RAPPORT']) writeFileSync(process.env['BANC_RAPPORT'], `${lignes.join('\n')}\nsur36\t${sur36}\nsur67\t${sur67}\n`);
    expect(sur36, lignes.join('\n')).toBeGreaterThanOrEqual(PLANCHER_36);
    expect(sur67, lignes.join('\n')).toBeGreaterThanOrEqual(PLANCHER_67);
    const perdues = JUSTES_AVANT.filter((id) => !verdicts.get(id)?.juste);
    expect(perdues, 'saisies justes avant le lot 144, perdues').toEqual([]);
  }, ENREGISTRER ? 30 * 60_000 : 60_000);
});
