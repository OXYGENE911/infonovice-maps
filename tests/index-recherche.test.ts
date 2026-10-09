// LES PAQUETS DE LA RECHERCHE DES LIEUX CONNUS : à jour, équivalents, légers
// (lot 145, 09/10/2026).
//
// 1. À JOUR : `public/donnees/recherche/` est exactement ce que les sources
//    engendrent (`scripts/index-recherche/construire.ts`). Pour les réécrire :
//    `INDEX_RECHERCHE_ECRIRE=1 npx vitest run tests/index-recherche.test.ts`.
// 2. ÉQUIVALENTS : pour chaque saisie essayée, lire un seul paquet rend
//    EXACTEMENT les lieux connus que rendait l'index entier du lot 144 — mêmes
//    lieux, même ordre. C'est l'étude de non-régression de l'allègement.
// 3. LÉGERS : ce que télécharge la première recherche, mesuré et borné.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { analyser } from '../src/lib/classement-recherche';
import {
  chargerLieuxConnus, chercherLieuxConnus, lireMonuments, lireMusees, lireWikidata, motsCherches, paquetPour, lireSommaire,
  URL_SOMMAIRE, urlPaquet, type LieuConnu,
} from '../src/lib/lieux-connus';
import { construireIndex, lignesDesSources } from '../scripts/index-recherche/construire';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const DOSSIER = `${RACINE}public/donnees/recherche/`;
const SOURCES = `${RACINE}scripts/index-recherche/sources/`;
const lireJson = (chemin: string): unknown => JSON.parse(readFileSync(chemin, 'utf8'));

const monuments = lireJson(`${RACINE}public/donnees/monuments.json`);
const musees = lireJson(`${SOURCES}musees.json`);
const wikidata = lireJson(`${SOURCES}lieux-wikidata.json`);
const SOURCE = 'Lieux connus de la recherche, en paquets (lot 145) : monuments historiques classés (base Mérimée), '
  + 'Musées de France (base Muséofile) — ministère de la Culture, Licence Ouverte 2.0 — et extrait Wikidata (CC0 1.0). '
  + 'Engendré par tests/index-recherche.test.ts (INDEX_RECHERCHE_ECRIRE=1).';
const construit = construireIndex(lignesDesSources(monuments, musees, wikidata), SOURCE);

if (process.env['INDEX_RECHERCHE_ECRIRE'] === '1') {
  if (existsSync(DOSSIER)) rmSync(DOSSIER, { recursive: true });
  mkdirSync(DOSSIER, { recursive: true });
  writeFileSync(`${DOSSIER}sommaire.json`, construit.sommaire);
  construit.paquets.forEach((p, n) => { writeFileSync(`${RACINE}public${urlPaquet(n)}`, p); });
}

/** Le lecteur du disque : les fichiers mêmes que le site sert (chacun lu une fois). */
const lus = new Map<string, unknown>();
const lireDisque = (url: string): Promise<unknown> => {
  if (!lus.has(url)) lus.set(url, lireJson(`${RACINE}public${url}`));
  return Promise.resolve(lus.get(url));
};

/** L'INDEX ENTIER du lot 144, dans son ordre : monuments, musées, Wikidata. */
const entier: LieuConnu[] = [...lireMonuments(monuments), ...lireMusees(musees), ...lireWikidata(wikidata)];

/* LES SAISIES ESSAYÉES : le banc du lot 141, des saisies de la vie courante
   (fautes, pluriels, mots coupés, chiffres), et un nom sur quatre cents de
   l'index entier, coupé ou non. Mesuré au lot 145 avec un nom sur
   cinquante (1 007 saisies) : 14 saisies touchées par la limite, aucune
   régression ; l'essai en garde moins pour tenir dans le temps de la CI. */
const banc = lireJson(`${RACINE}tests/donnees/banc-recherche/banc.json`) as { requetes: { saisie: string }[] };
const courantes = [
  'Sacré-Cœur', 'sacre coeur paris', 'Tour Eiffel', 'musée d’Orsay', 'Louvre', 'Pont du Gard', 'Mont Saint-Michel',
  'Saint-Denis', 'Sainte-Chapelle', 'basilique saint denis', 'château de Versailles', 'Versailles', 'Fourvière',
  'gare montparnase', 'gare de lyon', 'métro Châtelet', 'Montmartre', 'Montmarte', 'montmartres', 'cathédrales',
  'Notre-Dame', 'notre dame de la garde', 'Carcassonne', 'cite de carcassonne', 'Panthéon', 'arc de triomphe',
  'Stade de France', 'Accor Arena', 'Sorbonne', 'Invalides', 'Opéra Garnier', 'Palais des Papes', 'lac d’Annecy',
  'Puy de Dôme', 'col du Galibier', 'Futuroscope', 'Disneyland', 'Chambord', 'Mucem', 'Orsay', 'zz', 'abc',
  'Château', 'eglise', 'musee', 'saint', 'st', 'xv', '13', 'Musée des Beaux-Arts Lyon', 'beaux arts', 'Vélizy',
];
const echantillon = entier.filter((_, i) => i % 400 === 0).flatMap((l) => [l.nom, l.nom.slice(0, 8), `${l.nom} ${l.commune}`]);
const saisies = [...new Set([...banc.requetes.map((r) => r.saisie), ...courantes, ...echantillon])];
const VUE = [{ lon: 2.2875, lat: 48.8322 }];

describe('les paquets de la recherche des lieux connus (lot 145)', () => {
  it('sont exactement ce que les sources engendrent', () => {
    /* LES FINS DE LIGNE NE COMPTENT PAS : un poste Windows (core.autocrlf)
       extrait les fichiers en CRLF — le contenu, lui, doit être identique. */
    const lire = (chemin: string): string => readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');
    expect(lire(`${DOSSIER}sommaire.json`)).toBe(construit.sommaire);
    const fichiers = readdirSync(DOSSIER).filter((f) => /^p\d{3}\.json$/.test(f)).sort();
    expect(fichiers).toHaveLength(construit.paquets.length);
    construit.paquets.forEach((p, n) => {
      expect(lire(`${RACINE}public${urlPaquet(n)}`), urlPaquet(n)).toBe(p);
    });
  });

  it(`rendent, pour ${saisies.length} saisies, les lieux connus de l'index entier — à la seule limite écrite près`, async () => {
    /* ON COMPARE TOUTE LA LISTE, pas les trois premiers : un paquet ne peut
       qu'OMETTRE un lieu de l'index entier, jamais en ajouter ni en déplacer.
       Un lieu omis n'est permis que s'il ne répondait que par la tolérance
       d'UNE FAUTE au début d'un mot (« Chelles » → « Les Échelles ») : c'est
       la limite écrite en tête de `lieux-connus.ts`. Tout autre écart est une
       régression. */
    const sansFaute = (liste: readonly string[], m: string): boolean => liste.includes(m)
      || (m.length >= 6 && liste.some((w) => w.startsWith(m)))
      || (m.length >= 5 && m.endsWith('s') && liste.includes(m.slice(0, -1)));
    const parCle = new Map(entier.map((l) => [`${l.nom}|${l.lon}|${l.lat}`, l]));
    const cle = (c: { libelle: string; lon: number; lat: number }): string => `${c.libelle}|${c.lon}|${c.lat}`;
    const regressions: string[] = [];
    let ecarts = 0;
    for (const saisie of saisies) {
      const a = analyser(saisie);
      const attendu = chercherLieuxConnus(a, entier, VUE, 1_000_000);
      const obtenu = chercherLieuxConnus(a, await chargerLieuxConnus(a, lireDisque), VUE, 1_000_000);
      const gardes = new Set(obtenu.map(cle));
      const omis = attendu.filter((c) => !gardes.has(cle(c)));
      if (JSON.stringify(obtenu) !== JSON.stringify(attendu.filter((c) => gardes.has(cle(c))))) regressions.push(`${saisie} : ordre ou ajout`);
      if (omis.length > 0) ecarts += 1;
      for (const c of omis) {
        const l = parCle.get(cle(c));
        const cherches = motsCherches(a);
        if (!l || cherches.every((m) => sansFaute(l.motsNom, m) || sansFaute(l.motsCommune, m))) regressions.push(`${saisie} : ${c.libelle} omis`);
      }
    }
    if (process.env['INDEX_RECHERCHE_POIDS']) console.log(`lot145-ecarts ${ecarts}/${saisies.length}`);
    expect(regressions).toEqual([]);
    expect(ecarts / saisies.length).toBeLessThan(0.03);
  }, 120_000);

  it('ne téléchargent rien pour une adresse ou une saisie trop courte', async () => {
    const demandes: string[] = [];
    const espion = (url: string): Promise<unknown> => { demandes.push(url); return lireDisque(url); };
    for (const saisie of ['12 rue de Rivoli', '5 avenue Anatole France', 'ab', 'le la']) {
      expect(await chargerLieuxConnus(analyser(saisie), espion)).toEqual([]);
    }
    expect(demandes).toEqual([]);
  });

  it('pèsent peu à la première recherche : le sommaire, puis un seul paquet', () => {
    const sommaire = lireSommaire(lireJson(`${DOSSIER}sommaire.json`));
    expect(sommaire).not.toBeNull();
    const gz = (url: string): number => gzipSync(readFileSync(`${RACINE}public${url}`), { level: 9 }).length;
    const poidsSommaire = gz(URL_SOMMAIRE);
    const parSaisie = banc.requetes.map((r) => {
      const n = paquetPour(analyser(r.saisie), sommaire ?? new Map());
      return n === null ? 0 : gz(urlPaquet(n));
    });
    const tries = [...parSaisie].sort((x, y) => x - y);
    const mediane = tries[Math.floor(tries.length / 2)] ?? 0;
    const pire = tries[tries.length - 1] ?? 0;
    if (process.env['INDEX_RECHERCHE_POIDS']) {
      writeFileSync(process.env['INDEX_RECHERCHE_POIDS'], `${JSON.stringify({ poidsSommaire, mediane, pire, parSaisie })}\n`);
    }
    /* AVANT (lot 144, mesuré) : ≈ 545 Ko gzip à la première recherche. */
    expect(poidsSommaire).toBeLessThan(12_000);
    expect(mediane).toBeLessThan(15_000);
    expect(pire).toBeLessThan(100_000);
  });
});
