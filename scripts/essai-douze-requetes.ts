// LE JEU D'ESSAI D'ARMELIN, JOUÉ PAR LE VRAI CODE (RECHERCHE-8, 03/09).
//
// Armelin, la nuit du 03/09 : « je veux surtout pouvoir rechercher les mots
// clés suivants en jeu de tests et je ne veux pas avoir à écrire les mots
// exacts dans la barre de recherche mais avoir plus de souplesse même si les
// mots sont incomplets ».
//
// CE SCRIPT N'INTERROGE PAS LES API : il appelle `chercherPartout`, c'est-à-
// dire EXACTEMENT ce que l'application appelle. Mesurer les sources une à une
// dirait ce qu'elles savent ; celui-ci dit ce que l'usager obtient.
//
//   npx vite-node scripts/essai-douze-requetes.ts
//
// IL NE TOURNE PAS EN INTÉGRATION CONTINUE, et c'est délibéré : il dépend de
// cinq services publics. Une CI qui rougirait parce qu'Overpass tousse ne
// dirait rien sur le code. Les parcours de la CI, eux, simulent les réponses.

import { chercherPartout } from '../src/lib/recherche-multi';

/* NODE N'EST PAS UN NAVIGATEUR, ET OVERPASS LE SAIT. Mesuré le 03/09 : sans
   en-tête `User-Agent`, overpass.openstreetmap.fr rend « 403 This service is
   only available to white-listed usages » ; avec, il rend 200. Le navigateur
   en envoie un tout seul, donc l'application n'a rien à faire — mais ce
   script, lui, doit s'en poser un, sans quoi il rapporterait une panne qui
   n'existe que chez lui. Un banc d'essai qui accuse le code à tort est pire
   qu'une absence de banc d'essai. */
const brut = globalThis.fetch;
globalThis.fetch = ((entree: RequestInfo | URL, init?: RequestInit) => brut(entree, {
  ...init,
  headers: { ...(init?.headers ?? {}), 'User-Agent': 'infonovice-maps/1.0 (https://maps.infonovice.fr)' },
})) as typeof fetch;

/* LE CENTRE DE RÉFÉRENCE EST CELUI DE L'APPLICATION QUI S'OUVRE, et c'est une
   correction (RECHERCHE-8b, 03/09). Ce script passait 12/12 en lui donnant les
   coordonnées d'Armelin — mais l'usager qui ouvre l'application regarde la
   France entière, zoom 5,4, centre (2.4 ; 46.6). Vérifié EN PRODUCTION juste
   après la mise en ligne de la v1.57.0 : « Castorama Ormesson » ne rendait
   alors AUCUN Castorama, parce que « Ormesson » désigne deux communes et que
   la plus proche du centre de la France est la mauvaise.
   UN BANC D'ESSAI QUI PART D'UN ÉTAT PRIVILÉGIÉ ne mesure pas ce que
   l'utilisateur vit. On part donc d'où l'application part. */
const VUE_PAR_DEFAUT = { lon: 2.4, lat: 46.6 };
const CHEZ_LUI = VUE_PAR_DEFAUT;

/** Ce qu'on attend de chaque requête, en toutes lettres. */
const ESSAIS: { q: string; attendu: RegExp }[] = [
  { q: 'Castorama Ormesson', attendu: /castorama/i },
  { q: 'Leroy Merlin Lognes', attendu: /leroy\s*merlin/i },
  { q: 'Carrefour Pincevent', attendu: /carrefour/i },
  { q: 'Collège Albert Camus Plessis-Trévise', attendu: /albert\s*camus/i },
  { q: 'Disneyland Paris', attendu: /disneyland/i },
  { q: 'INRAE BEAUCOUZE', attendu: /inrae/i },
  { q: 'Gare Saint Lazare', attendu: /saint[- ]?lazare/i },
  { q: 'Tour Effeil', attendu: /tour eiffel/i },
  { q: 'Tour Effeil Paris', attendu: /tour eiffel/i },
  { q: 'Musée du Louvre', attendu: /louvre/i },
  { q: 'Stade de France', attendu: /stade de france/i },
  { q: 'FnacDarty Siège Ivry sur Seine', attendu: /fnac/i },
];

let reussis = 0;
for (const { q, attendu } of ESSAIS) {
  const t0 = Date.now();
  let ligne = '';
  try {
    const r = await chercherPartout(q, { centre: CHEZ_LUI });
    const ms = Date.now() - t0;
    const gagnant = r.lieux.findIndex((l) => attendu.test(l.libelle));
    const ok = gagnant >= 0;
    if (ok) reussis += 1;
    ligne = `${ok ? '  OK ' : 'ÉCHEC'}  ${String(ms).padStart(5)}ms  ${q}`
      + (ok ? `  → rang ${gagnant + 1}/${r.lieux.length}` : `  (${r.lieux.length} réponses)`);
    console.log(ligne);
    for (const l of r.lieux.slice(0, 3)) {
      console.log(`         · [${l.source}] ${l.libelle} — ${l.contexte}`);
    }
    if (r.panne) console.log(`         ! une source en panne : ${r.panne.message}`);
    if (r.commune) console.log(`         ~ commune reconnue : ${r.commune.nom} ${r.commune.codePostal}`);
  } catch (e) {
    console.log(`ÉCHEC  ${q} — ${String(e).slice(0, 120)}`);
  }
  /* ON NE MARTÈLE PAS : une seconde entre deux requêtes, et l'on interroge
     cinq services à chaque fois. « Ces quotas sont un bien commun. » */
  await new Promise((r) => { setTimeout(r, 1000); });
}

console.log(`\n=== ${reussis}/${ESSAIS.length} requêtes résolues ===`);
