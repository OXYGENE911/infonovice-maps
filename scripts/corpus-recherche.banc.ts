import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { chercherAdresses } from '../src/lib/adresse';
import { chercherPartout } from '../src/lib/recherche-multi';
import {
  rangDe, bilanDesRangs, enPourcent, PROFONDEUR_VUE, type Bilan, type Rang,
} from '../src/lib/metriques-recherche';

/* LE BANC DE RECHERCHE (CORPUS-1, 09/09/2026).
 *
 * Dernier point « Maps » de l'audit du 06/09 : « corpus de 200–300 requêtes
 * annotées avec Top-1 / Top-5 / MRR mesurés ; le banc actuel n'en a que
 * douze ». Le corpus est bâti à part (`scripts/corpus-batir.mjs`) et écrit
 * sur disque : ce fichier-ci ne fait que MESURER, et il mesure le code de
 * l'application, pas une copie.
 *
 * IL NE PART PAS AVEC `npm test` — voir `vitest.corpus.config.ts` : deux cent
 * cinquante requêtes réelles sur cinq sources publiques n'ont rien à faire
 * dans une suite qui tourne à chaque poussée.
 *
 *   npx vitest run --config vitest.corpus.config.ts
 *
 * CE QUI COMPTE COMME UNE BONNE RÉPONSE : la COORDONNÉE, dans le rayon que
 * L'ENTRÉE DÉCLARE. Pas le libellé — chaque source nomme le même lieu à sa
 * façon, et comparer des chaînes ferait échouer des réponses justes.
 *
 * DEUX CENTS MÈTRES POUR UN OBJET PONCTUEL — un pâté de maisons : assez pour
 * reconnaître le lieu, assez peu pour ne pas confondre deux commerces d'une
 * même rue. LA TAILLE DE LA COMMUNE POUR UNE COMMUNE : la première mesure
 * comptait « Marseille » ABSENTE quand le service rendait « Marseille » en
 * tête, parce qu'elle exigeait deux cents mètres entre deux définitions du
 * centre d'une ville de 238 km². Le banc avait tort, pas le service.
 */

const CORPUS = 'docs/corpus-recherche.json';
const RAPPORT = 'docs/mesure-recherche.md';
const PAUSE_MS = 250;

interface Entree {
  famille: string;
  requete: string;
  attendu: { lon: number; lat: number };
  pipeline: 'adresse' | 'nom';
  origine: string;
  reference: string;
  commune: string;
  /** La tolérance DÉCLARÉE PAR LE CORPUS — voir `corpus-batir.mjs`. */
  rayonM: number;
}

const dors = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

/** Distance à vol d'oiseau en mètres — la même formule que le reste du projet. */
function distanceM(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const R = 6_371_000;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface Ligne extends Entree { rang: Rang; rendu: string; combien: number }

/**
 * Une requête, jouée sur le pipeline que l'application lui destine.
 *
 * LES DEUX PIPELINES SE MESURENT SÉPARÉMENT, et il faut le dire clairement :
 * l'application les ARBITRE dans son composant de recherche — la Base Adresse
 * Nationale d'abord, la recherche par nom si la BAN n'a pas répondu à la
 * saisie. Cet arbitrage dépend de la vue de la carte et vit dans le DOM ; le
 * reproduire ici en ferait une COPIE, qui dériverait. On mesure donc chaque
 * pipeline sur les familles qui lui reviennent, et l'on dit ce qu'on ne
 * mesure pas plutôt que de faire semblant.
 */
async function jouer(e: Entree): Promise<Ligne> {
  let points: { lon: number; lat: number; libelle: string }[] = [];
  try {
    if (e.pipeline === 'adresse') {
      points = (await chercherAdresses(e.requete)).map((r) => ({
        lon: r.lon, lat: r.lat, libelle: r.libelle,
      }));
    } else {
      const t = await chercherPartout(e.requete, { centre: null });
      points = t.lieux.map((r) => ({ lon: r.lon, lat: r.lat, libelle: r.libelle }));
    }
  } catch {
    // Une source en panne rend une liste vide : le rang sera 0, et c'est vrai.
  }
  await dors(PAUSE_MS);
  /* LA TOLÉRANCE VIENT DE L'ENTRÉE, pas d'une constante du mesureur : une
     commune n'est pas un point, et la première mesure comptait « Marseille »
     absente alors que le service la rendait en tête. */
  const rang = rangDe(points, (p) => distanceM(p, e.attendu) <= e.rayonM);
  return { ...e, rang, combien: points.length, rendu: points[0]?.libelle ?? '(rien)' };
}

function parFamille(lignes: readonly Ligne[]): Map<string, Bilan> {
  const paquets = new Map<string, Rang[]>();
  for (const l of lignes) {
    const p = paquets.get(l.famille) ?? [];
    p.push(l.rang);
    paquets.set(l.famille, p);
  }
  return new Map([...paquets].map(([f, r]) => [f, bilanDesRangs(r)]));
}

function tableau(titre: string, bilans: Map<string, Bilan>): string {
  const l = [`### ${titre}`, '', '| Famille | Requêtes | Top-1 | Top-5 | MRR | Absentes |',
    '|---|---:|---:|---:|---:|---:|'];
  for (const [f, b] of [...bilans].sort()) {
    l.push(`| ${f} | ${b.total} | ${enPourcent(b.top1)} | ${enPourcent(b.top5)}`
      + ` | ${b.mrr.toFixed(3).replace('.', ',')} | ${b.absentes} |`);
  }
  return l.join('\n');
}

describe('le banc de recherche', () => {
  it('mesure le corpus annoté et écrit son rapport', async () => {
    const brut = JSON.parse(readFileSync(CORPUS, 'utf-8')) as
      { batiLe: string; communes: number; entrees: Entree[] };
    const entrees = brut.entrees;
    expect(entrees.length, 'le corpus est trop maigre pour conclure quoi que ce soit')
      .toBeGreaterThan(150);

    const lignes: Ligne[] = [];
    for (const [i, e] of entrees.entries()) {
      lignes.push(await jouer(e));
      if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${entrees.length}\n`);
    }

    const adresses = lignes.filter((l) => l.pipeline === 'adresse');
    const noms = lignes.filter((l) => l.pipeline === 'nom');
    const global = bilanDesRangs(lignes.map((l) => l.rang));

    /* LES PIRES CAS SE NOMMENT, un par un. Une moyenne ne se corrige pas ;
       une requête qui rend la mauvaise réponse, si. */
    const rates = lignes.filter((l) => l.rang === 0 || l.rang > PROFONDEUR_VUE)
      .sort((a, b) => a.famille.localeCompare(b.famille));

    const rapport = [
      '# Mesure de la recherche — corpus annoté',
      '',
      `Corpus bâti le ${brut.batiLe} sur ${brut.communes} communes,`
      + ` ${entrees.length} requêtes. Mesuré le ${new Date().toISOString().slice(0, 10)}.`,
      '',
      'Chaque réponse attendue vient d’une source publique : **rien n’est écrit',
      'de mémoire**. Une réponse compte comme juste quand elle tombe à moins de',
      'du lieu attendu **dans le rayon que l’entrée déclare** : 200 m pour un',
      'objet ponctuel, la taille de la commune pour une commune. La coordonnée,',
      'jamais le libellé, qui change d’une source à l’autre.',
      '',
      '**Ce qui n’est pas mesuré ici**, et qu’il faut savoir en lisant les',
      'chiffres : l’application ARBITRE entre les deux pipelines dans son',
      'composant de recherche, et cet arbitrage dépend de la vue de la carte.',
      'Le reproduire dans le banc en ferait une copie qui dérive. Chaque',
      'pipeline est donc mesuré sur les familles qui lui reviennent.',
      '',
      '## Ensemble',
      '',
      `| | Requêtes | Top-1 | Top-5 | MRR | Absentes |`,
      '|---|---:|---:|---:|---:|---:|',
      `| **Tout** | ${global.total} | ${enPourcent(global.top1)}`
      + ` | ${enPourcent(global.top5)} | ${global.mrr.toFixed(3).replace('.', ',')}`
      + ` | ${global.absentes} |`,
      '',
      '> Une moyenne d’ensemble mêle des familles de difficulté très inégale :',
      '> elle sert de repère dans le temps, pas de verdict. Ce sont les lignes',
      '> par famille qui se lisent.',
      '',
      tableau('Pipeline « adresse » (Base Adresse Nationale)', parFamille(adresses)),
      '',
      tableau('Pipeline « nom » (recherche multi-sources)', parFamille(noms)),
      '',
      `## Les ${rates.length} requêtes hors des cinq premières`,
      '',
      '| Famille | Requête | Attendu | Rendu en tête | Rang |',
      '|---|---|---|---|---:|',
      ...rates.map((l) => `| ${l.famille} | ${l.requete.replace(/\|/g, '/')}`
        + ` | ${l.reference.replace(/\|/g, '/')} | ${l.rendu.replace(/\|/g, '/')}`
        + ` | ${l.rang === 0 ? 'absente' : l.rang} |`),
      '',
    ].join('\n');
    writeFileSync(RAPPORT, `${rapport}\n`, 'utf-8');

    console.log(`\n=== ENSEMBLE : ${global.total} requêtes`);
    console.log(`  Top-1 ${enPourcent(global.top1)} · Top-5 ${enPourcent(global.top5)}`
      + ` · MRR ${global.mrr.toFixed(3)} · ${global.absentes} absentes`);
    for (const [nom, b] of [['adresse', parFamille(adresses)], ['nom', parFamille(noms)]] as const) {
      console.log(`\n--- pipeline ${nom} ---`);
      for (const [f, x] of [...b].sort()) {
        console.log(`  ${f.padEnd(24)} n=${String(x.total).padStart(3)}`
          + `  top1 ${enPourcent(x.top1).padStart(7)}`
          + `  top5 ${enPourcent(x.top5).padStart(7)}`
          + `  mrr ${x.mrr.toFixed(3)}  absentes ${x.absentes}`);
      }
    }
    console.log(`\nRapport écrit dans ${RAPPORT}`);

    /* LE BANC NE JUGE PAS, IL MESURE. Une seule exigence : qu'il ait
       réellement travaillé — sans quoi un service en panne rendrait un
       rapport vide et rassurant. */
    expect(lignes.filter((l) => l.combien > 0).length,
      'aucune source n’a répondu : le rapport ne vaut rien')
      .toBeGreaterThan(entrees.length / 2);
  });
});
