import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { chercherAdresses, repondALaSaisie } from '../src/lib/adresse';

/* LA PORTE DE LA BASE ADRESSE NATIONALE — combien de fois se ferme-t-elle à
 * tort ? (PORTE-1, 10/09/2026)
 *
 * CE QUI A ÉTÉ TROUVÉ À LA MAIN. En sondant la recherche en production, taper
 * « Stade de France » rend « Avenue du Stade de France 93210 Saint-Denis » —
 * la RUE nommée d'après le stade — puis trois terrains de football à Marle,
 * Berthecourt et Breilly. Le stade lui-même n'est nulle part.
 *
 * POURQUOI. L'application demande d'abord à la BAN, et ne va chercher un LIEU
 * NOMMÉ que si la BAN « n'a pas répondu ». La porte, écrite le 01/09
 * (RECHERCHE-5), lit les MOTS : si tous les mots tapés se retrouvent dans le
 * libellé rendu, la BAN a répondu. Or « Avenue du Stade de France » contient
 * bien « stade » et « france ». La porte se ferme, et l'index des lieux — qui
 * rend le vrai stade EN PREMIER, vérifié le 10/09 — n'est jamais consulté.
 *
 * CE BANC MESURE L'AMPLEUR AVANT QU'ON TOUCHE À QUOI QUE CE SOIT. Une règle
 * plus large coûterait des appels à des services publics sur CHAQUE saisie,
 * et la décision du 01/09 l'interdit expressément. On veut donc savoir :
 * combien de requêtes du corpus verraient la porte s'ouvrir alors qu'elle est
 * fermée aujourd'hui, et combien de ces ouvertures sont MÉRITÉES.
 *
 *   npx vitest run --config vitest.corpus.config.ts
 */

const CORPUS = 'docs/corpus-recherche.json';
const PAUSE_MS = 250;

interface Entree {
  famille: string; requete: string; pipeline: 'adresse' | 'nom';
  attendu: { lon: number; lat: number }; rayonM: number; reference: string;
}

const dors = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

/* LES MOTS QUI DISENT UNE VOIE. Si l'usager en a écrit un, il cherche une
   voie et la BAN est chez elle. S'il n'en a écrit aucun et que la BAN répond
   par une voie, c'est peut-être un lieu nommé qu'il cherchait. */
const MOTS_DE_VOIE = [
  'rue', 'avenue', 'av', 'boulevard', 'bd', 'place', 'impasse', 'allee', 'allée',
  'chemin', 'route', 'quai', 'cours', 'square', 'passage', 'voie', 'sentier',
  'esplanade', 'rond point', 'giratoire', 'lieu dit',
];

function nu(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Un texte nomme-t-il un type de voie ? — PURE. */
function ditUneVoie(texte: string): boolean {
  const t = ` ${nu(texte)} `;
  return MOTS_DE_VOIE.some((m) => t.includes(` ${nu(m)} `));
}

describe('la porte de la BAN', () => {
  it('mesure combien de fois elle se ferme sur une voie qu’on n’a pas demandée', async () => {
    const brut = JSON.parse(readFileSync(CORPUS, 'utf-8')) as { entrees: Entree[] };
    /* ON NE JUGE QUE LES REQUÊTES DE NOM : les familles d'adresse vont à la
       BAN par construction, et la porte n'a rien à y faire. */
    const entrees = brut.entrees.filter((e) => e.pipeline === 'nom');
    expect(entrees.length).toBeGreaterThan(50);

    let fermeeAujourdHui = 0;
    let large = 0;
    let ouvrirait = 0;
    const cas: string[] = [];

    for (const e of entrees) {
      let premiers: Awaited<ReturnType<typeof chercherAdresses>> = [];
      try { premiers = await chercherAdresses(e.requete); } catch { /* rien */ }
      await dors(PAUSE_MS);
      const meilleur = premiers[0];
      if (!meilleur) continue;
      const ferme = repondALaSaisie(e.requete, meilleur.libelle);
      if (!ferme) continue;
      fermeeAujourdHui += 1;
      /* PREMIÈRE RÈGLE ESSAYÉE, ET TROP LARGE : « la BAN rend une voie et
         l'usager n'en a pas nommé une ». Elle rouvrait 14 fois sur 193, mais
         la moitié pour rien — quand la BAN rend « le Thuré 72160 Vouvray »
         pour « le Thuré Vouvray », c'est le bon lieu, et un appel de plus
         n'aurait rien apporté. */
      const voie = meilleur.type === 'street' || meilleur.type === 'locality';
      if (voie && !ditUneVoie(e.requete)) large += 1;

      /* LA RÈGLE RETENUE, plus fine d'un cran : la porte ne se ferme que si le
         libellé rendu N'AJOUTE PAS un mot de voie que l'usager n'a pas écrit.
         « Avenue du Stade de France » ajoute « avenue » à « Stade de France » :
         ce n'est plus la chose demandée, c'est une rue qui la cite. « le Thuré
         72160 Vouvray-sur-Huisne » n'ajoute rien : c'est bien le lieu. */
      if (voie && ditUneVoie(meilleur.libelle) && !ditUneVoie(e.requete)) {
        ouvrirait += 1;
        cas.push(`- **${e.requete}** (${e.famille})`
          + ` → BAN : « ${meilleur.libelle} » *[${meilleur.type}]*`);
      }
    }

    /* LE RELEVÉ S'ÉCRIT DANS UN FICHIER : vitest ne rend pas la sortie
       console de ce banc, et un résultat qu'on ne peut pas relire ne sert à
       personne. */
    const part = ((ouvrirait / entrees.length) * 100).toFixed(1).replace('.', ',');
    writeFileSync('docs/mesure-porte-ban.md', [
      '# La porte de la Base Adresse Nationale — mesure',
      '',
      `Sur **${entrees.length}** requêtes de nom du corpus, le `
        + `${new Date().toISOString().slice(0, 10)}.`,
      '',
      `- Porte **fermée** aujourd'hui, la BAN étant réputée avoir répondu : `
        + `**${fermeeAujourdHui}**`,
      `- Que la première règle, trop large, rouvrirait : ${large}`,
      `- Que la règle **retenue** rouvrirait : **${ouvrirait}** — ${part} %`,
      '',
      '> **La règle retenue** : la porte ne se ferme que si le libellé rendu',
      "> n'AJOUTE PAS un mot de voie que l'usager n'a pas écrit. « Avenue du",
      '> Stade de France » ajoute « avenue » à « Stade de France » : ce n\'est',
      '> plus la chose demandée, c\'est une rue qui la cite. « le Thuré 72160',
      '> Vouvray-sur-Huisne » n\'ajoute rien — c\'est bien le lieu, et un appel',
      '> de plus n\'apporterait rien.',
      '>',
      '> Chaque réouverture coûte un appel de plus aux sources de noms, et la',
      "> décision du 01/09 interdit d'élargir sans compter.",
      '',
      '## Les cas',
      '',
      ...cas,
      '',
    ].join('\n'), 'utf-8');

    expect(fermeeAujourdHui).toBeGreaterThanOrEqual(0);
  });
});
