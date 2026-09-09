// BÂTIR LE CORPUS ANNOTÉ DE RECHERCHE (CORPUS-1, 09/09/2026).
//
// L'audit du 06/09 demandait « un corpus de 200–300 requêtes annotées avec
// Top-1 / Top-5 / MRR mesurés ». Le banc d'alors en comptait douze, et il
// avait déjà menti : douze sur douze « trouvé », pendant que les RANGS
// disaient « SCI 43 CLER TOUR EFFEIL » devant la Tour Eiffel.
//
// LA RÈGLE DE CE FICHIER, ET ELLE EST TOUT LE SUJET : ON N'INVENTE RIEN.
// Chaque réponse attendue est OBTENUE d'une source publique, jamais écrite de
// mémoire — la leçon a déjà été payée deux fois le 09/09, avec un « boulevard
// de la Liberté 59000 Lille » qui n'existe pas (la voie est au 59800) et dont
// je comptais l'échec à la Base Adresse Nationale.
//
// COMMENT. On part de la LISTE OFFICIELLE DES COMMUNES (geo.api.gouv.fr), on
// demande à chaque source un objet RÉEL de cette commune — une voie, un lieu
// nommé, un établissement — et l'on DÉGRADE ensuite son nom pour en faire une
// requête : sans le code postal, avec une faute, réduit à un préfixe, ramené
// à un surnom. La vérité de terrain, ce sont les COORDONNÉES de l'objet ; le
// libellé, lui, change d'une source à l'autre et ne peut pas servir de juge.
//
// LES QUOTAS SONT UN BIEN COMMUN : une requête à la fois, une pause entre
// chacune, et le corpus est ÉCRIT SUR DISQUE pour que la mesure se rejoue
// ensuite sans redemander quoi que ce soit.
//
//   node scripts/corpus-batir.mjs [nombre-de-communes]

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const UA = 'infonovice-maps/1.0 (https://maps.infonovice.fr; contact@infonovice.fr)';
const SORTIE = 'docs/corpus-recherche.json';
const PAUSE_MS = 220;
const COMMUNES = Number(process.argv[2] ?? 40);

const dors = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  for (let essai = 0; essai < 3; essai += 1) {
    try {
      const rep = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      await dors(PAUSE_MS);
      if (!rep.ok) {
        // 5xx : passager, on réessaie. 4xx : la demande est mauvaise, inutile.
        if (rep.status < 500) return null;
        continue;
      }
      return await rep.json();
    } catch {
      await dors(600 * (essai + 1));
    }
  }
  return null;
}

/** La distance à vol d'oiseau, en kilomètres — de quoi juger « dans la commune ». */
function distanceKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const sansAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* LES QUATRE FAUTES DE FRAPPE, celles qu'un doigt fait vraiment — mesurées
   sur le service le 09/09 (FRAPPE-1) : insertion et inversion passent à
   100 %, suppression et substitution à 89 %. */
function avecUneFaute(mot) {
  if (mot.length < 5) return null;
  const p = Math.floor(mot.length / 2);
  return mot.slice(0, p) + mot.slice(p + 1); // suppression : la plus dure
}

/** Le mot le plus long d'un libellé — le plus porteur de sens. */
function motPorteur(libelle) {
  const mots = libelle.split(/[\s'’-]+/).filter((m) => m.length >= 5);
  return mots.sort((a, b) => b.length - a.length)[0] ?? null;
}

/* ---------------------------------------------------------------- communes */

/**
 * Un échantillon de communes, GRANDES ET PETITES.
 *
 * POURQUOI PAS SEULEMENT LES GRANDES : une recherche qui ne marche qu'à Paris
 * et Lyon ne sert pas Armelin, qui vit au Plessis-Trévise. Le tiers des
 * communes tirées ici a moins de cinq mille habitants — c'est là que les
 * sources sont clairsemées, et donc là que la mesure est intéressante.
 */
async function echantillonCommunes(combien) {
  const toutes = await json('https://geo.api.gouv.fr/communes'
    + '?fields=nom,code,codesPostaux,centre,population,surface&format=json');
  if (!Array.isArray(toutes)) throw new Error('la liste des communes est indisponible');
  const nettes = toutes.filter((c) => c.centre?.coordinates && c.population > 0
    && (c.codesPostaux?.length ?? 0) > 0);
  const parTaille = [...nettes].sort((a, b) => b.population - a.population);
  const grandes = parTaille.slice(0, Math.round(combien * 0.4));
  /* Le reste se tire à pas RÉGULIER dans la liste triée : reproductible, et
     sans le hasard d'un tirage qui changerait à chaque exécution. */
  const reste = parTaille.slice(Math.round(combien * 0.4));
  const pas = Math.floor(reste.length / (combien - grandes.length));
  const autres = [];
  for (let i = 0; autres.length < combien - grandes.length; i += 1) {
    const c = reste[i * pas];
    if (c) autres.push(c);
  }
  return [...grandes, ...autres].map((c) => ({
    nom: c.nom, code: c.code, cp: c.codesPostaux[0],
    lon: c.centre.coordinates[0], lat: c.centre.coordinates[1],
    population: c.population,
    /* LE RAYON D'UNE COMMUNE, tiré de sa SURFACE (en hectares).
       POURQUOI CE CHAMP EXISTE : la première mesure comptait « Marseille »
       comme ABSENTE alors que le service rendait « Marseille » en tête — le
       banc exigeait deux cents mètres entre deux définitions du « centre »
       d'une ville de 238 km². Une commune n'est pas un point ; sa tolérance
       est sa taille. Deux kilomètres au minimum, parce qu'un village tient
       dans deux kilomètres et que sa mairie n'est pas son barycentre. */
    rayonM: Math.max(2000, Math.round(Math.sqrt((c.surface ?? 100) * 10_000 / Math.PI))),
  }));
}

/* ------------------------------------------------------- vérités de terrain */

/** Une VOIE réelle de la commune, telle que la Base Adresse Nationale la nomme. */
async function voieReelle(commune) {
  /* ON CHERCHE DANS LA COMMUNE, PAS PAR SON NOM. La première version demandait
     « rue <commune> » et n'obtenait rien à Paris : le service comprenait une
     voie NOMMÉE d'après la ville. Le code INSEE borne la recherche là où l'on
     veut, et rend une voie qui existe vraiment. */
  const d = await json('https://api-adresse.data.gouv.fr/search/'
    + `?q=rue&citycode=${commune.code}&type=street&limit=5&autocomplete=0`);
  for (const f of d?.features ?? []) {
    const p = f.properties ?? {};
    const g = f.geometry;
    if (!g?.coordinates || !p.name || !p.postcode) continue;
    /* CE QUI DOIT DISTINGUER, C'EST LE NOM — PAS LE TYPE DE VOIE. Une
       première version comptait les lettres de « Rue Haxo » (sept) et
       rejetait une voie parfaitement valable ; elle gardait en revanche
       « Rue nau », qui n'est le nom de personne. On retire donc le type
       d'abord, et l'on juge ce qui reste. */
    const propre = sansAccents(p.name)
      .replace(/^(rue|avenue|boulevard|place|impasse|allee|chemin|route|quai|cours|square|passage|voie)\s+/i, '')
      .replace(/^(de|du|des|la|le|les|d|l)[\s']+/i, '')
      .replace(/[^a-zA-Z]/g, '');
    if (propre.length < 4) continue;
    return { nom: p.name, cp: p.postcode, ville: p.city ?? commune.nom,
      label: p.label, lon: g.coordinates[0], lat: g.coordinates[1] };
  }
  return null;
}

/* LES NOMS QUI N'EN SONT PAS. « Église », « Mairie », « Cimetière » désignent
   des milliers d'objets identiques : une requête bâtie sur eux n'a AUCUNE
   réponse attendue identifiable, et la compter en échec accuserait le service
   d'une faute qui est celle du banc. Trouvé du premier coup à Jouvençon, où
   la Géoplateforme rend « Eglise » tout court. */
const NOMS_GENERIQUES = new Set([
  'eglise', 'mairie', 'cimetiere', 'chapelle', 'ecole', 'college', 'lycee',
  'stade', 'gare', 'poste', 'pharmacie', 'chateau', 'chateau d eau', 'monument',
  'salle des fetes', 'terrain de sport', 'gymnase', 'mediatheque', 'bibliotheque',
  'presbytere', 'lavoir', 'fontaine', 'moulin', 'ferme', 'bois', 'foret', 'pont',
]);

/* LES MOTS QUI DISENT LE TYPE, ET NON LE NOM. « École primaire publique » est
   la CATÉGORIE d'un millier d'écoles, « Zone d'activité ou d'intérêt » celle
   d'autant de zones. Une première version les acceptait parce qu'elle comptait
   les MOTS — trois mots, donc distinctif — et le banc accusait ensuite le
   service de ne pas deviner LEQUEL on visait. Six des dix échecs de la
   deuxième mesure étaient exactement cela. */
const MOTS_DE_TYPE = new Set([
  'ecole', 'primaire', 'elementaire', 'maternelle', 'publique', 'public',
  'privee', 'prive', 'college', 'lycee', 'groupe', 'scolaire', 'annexe',
  'zone', 'activite', 'activites', 'interet', 'espace', 'lieu', 'dit',
  'eglise', 'chapelle', 'mairie', 'cimetiere', 'stade', 'gare', 'poste',
  'salle', 'fetes', 'terrain', 'sport', 'gymnase', 'monument', 'chateau',
  'eau', 'bois', 'foret', 'pont', 'moulin', 'ferme', 'lavoir', 'fontaine',
  'de', 'du', 'des', 'la', 'le', 'les', 'ou', 'et', 'aux', 'au', 'sur',
]);

/**
 * Un nom DISTINGUE-t-il vraiment un lieu ? — sinon la requête est mal posée.
 *
 * ON RETIRE CE QUI DIT LE TYPE, ET L'ON JUGE CE QUI RESTE — le même geste que
 * pour les voies, où compter les lettres de « RueHaxo » rejetait une voie
 * parfaitement valable. « École primaire publique » ne laisse rien : ce n'est
 * pas un nom. « École Primaire Yves Duteil » laisse « yves duteil » : c'en est
 * un.
 */
function nomDistinctif(nom) {
  const nu = sansAccents(nom).toLowerCase().replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (nu.length < 5) return false;
  if (NOMS_GENERIQUES.has(nu)) return false;
  const propres = nu.split(' ').filter((m) => m.length > 2 && !MOTS_DE_TYPE.has(m));
  /* Il faut qu'il reste de quoi nommer : deux mots propres, ou un seul mais
     qui porte — « Saint-Vaast » nomme, « les » ne nomme pas. */
  if (propres.length >= 2) return true;
  return (propres[0]?.length ?? 0) >= 5;
}

/** Un LIEU NOMMÉ réel, vu par l'index de la Géoplateforme. */
async function lieuReel(commune) {
  const d = await json('https://data.geopf.fr/geocodage/search'
    + `?q=${encodeURIComponent(commune.nom)}&index=poi&limit=10`);
  for (const f of d?.features ?? []) {
    const p = f.properties ?? {};
    const villes = [p.city].flat().filter(Boolean);
    const nom = [p.toponym].flat().filter(Boolean)[0];
    if (!nom || !f.geometry?.coordinates) continue;
    if (!villes.includes(commune.nom)) continue;
    /* UN NOM QUI EST CELUI DE LA COMMUNE NE PROUVE RIEN : « Melun » à Melun
       ne mesure aucune recherche. On veut un lieu qui porte son propre nom. */
    if (sansAccents(nom).toLowerCase() === sansAccents(commune.nom).toLowerCase()) continue;
    if (!nomDistinctif(nom)) continue;
    return { nom, ville: villes[0], lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
  }
  return null;
}

/**
 * Un ÉTABLISSEMENT SCOLAIRE réel, vu par l'annuaire de l'Éducation nationale.
 *
 * POURQUOI L'ÉCOLE ET NON L'ENTREPRISE. La première version tirait ses
 * établissements du registre des entreprises, et fabriquait des requêtes
 * comme « BOULANGERIES DESIGN IMPLANTATIONS MARSEILLE » : une RAISON SOCIALE,
 * que personne ne tape jamais. On mesurait « retrouver une société par sa
 * dénomination légale », qui n'est pas une tâche d'usager — 5,9 % de Top-1, et
 * ce chiffre ne voulait rien dire.
 *
 * Un nom d'école, lui, est CELUI QU'ON DIT : « Collège Albert Camus ». C'est
 * même le cas exact d'Armelin, le 01/09 — « Je n'ai toujours pas le collège de
 * ma fille visible ». La famille mesure donc quelque chose qui compte.
 */
async function etablissementReel(commune) {
  const d = await json('https://data.education.gouv.fr/api/explore/v2.1/catalog'
    + '/datasets/fr-en-annuaire-education/records'
    + `?where=${encodeURIComponent(`nom_commune="${commune.nom}"`)}&limit=5`
    + '&select=nom_etablissement,nom_commune,latitude,longitude');
  for (const r of d?.results ?? []) {
    const nom = r.nom_etablissement;
    if (!nom || r.latitude == null || r.longitude == null) continue;
    if (!nomDistinctif(nom)) continue;
    return { nom, ville: commune.nom, lon: Number(r.longitude), lat: Number(r.latitude) };
  }
  return null;
}

/**
 * Le nom, tapé SEUL, désigne-t-il un seul lieu en France ?
 *
 * POURQUOI CETTE VÉRIFICATION EXISTE. La première mesure jugeait « Église
 * Saint-Martin » sans commune, et comptait un échec parce que le service
 * rendait celle de Baume-les-Dames au lieu de celle qu'on visait. Le service
 * avait raison : la question n'avait pas de réponse. Une requête sans réponse
 * identifiable ne mesure pas un service, elle mesure un banc mal fait.
 *
 * ON NE GARDE DONC « le lieu seul » QUE POUR LES NOMS QUI TRANCHENT : le
 * premier résultat est bien le nôtre, et le deuxième est ailleurs — à plus de
 * cinq kilomètres, donc ce n'est pas le même objet vu deux fois.
 *
 * CE QUE CELA COÛTE EN HONNÊTETÉ, et il faut l'écrire : cette porte est tenue
 * par l'index de la Géoplateforme, qui est AUSSI l'une des cinq sources
 * mesurées. La famille est donc partiellement circulaire pour cette
 * source-là. Ce qu'elle éprouve reste réel : un nom unique peut être chassé
 * du premier rang par une entreprise ou un objet OpenStreetMap au moment de
 * la FUSION — c'est exactement le défaut que RECHERCHE-10 a corrigé le 04/09.
 */
async function nomTrancheSeul(lieu) {
  const d = await json('https://data.geopf.fr/geocodage/search'
    + `?q=${encodeURIComponent(lieu.nom)}&index=poi&limit=3`);
  const f = d?.features ?? [];
  if (f.length === 0) return false;
  const p0 = f[0]?.geometry?.coordinates;
  if (!p0) return false;
  const premier = { lon: p0[0], lat: p0[1] };
  if (distanceKm(premier, lieu) * 1000 > 200) return false;
  const p1 = f[1]?.geometry?.coordinates;
  if (!p1) return true;
  return distanceKm({ lon: p1[0], lat: p1[1] }, lieu) > 5;
}

/* ------------------------------------------------------------------ familles */

/**
 * LES FAMILLES DE REQUÊTES, et pourquoi chacune est là.
 *
 * Une moyenne unique sur deux cent cinquante requêtes ne dit rien : elle
 * mélange ce qui marche déjà avec ce qui ne marche pas, et le chiffre bouge
 * sans qu'on sache pourquoi. Chaque famille répond à une question distincte,
 * et se lit séparément.
 */
function requetesPour(commune, voie, lieu, etab, lieuTranche) {
  const q = [];
  const vt = (t) => ({ lon: t.lon, lat: t.lat });
  /* ON NE RÉPÈTE PAS LA COMMUNE QUE LE NOM PORTE DÉJÀ : « BOULANGERIE PARIS &
     CO Paris » n'est la requête de personne. Même règle qu'à l'affichage des
     suggestions (A11Y-LECTEUR-1). */
  const avecCommune = (nom, ville) => (
    sansAccents(nom).toLowerCase().includes(sansAccents(ville).toLowerCase())
      ? nom : `${nom} ${ville}`);

  if (voie) {
    // 1. L'adresse ÉCRITE EN ENTIER : le cas facile, celui qui doit être parfait.
    q.push({ famille: 'adresse-complete', requete: voie.label, attendu: vt(voie),
      pipeline: 'adresse', origine: 'BAN', reference: voie.label });
    // 2. SANS LE CODE POSTAL — comme on tape vraiment.
    q.push({ famille: 'adresse-sans-code', requete: `${voie.nom} ${voie.ville}`,
      attendu: vt(voie), pipeline: 'adresse', origine: 'BAN', reference: voie.label });
    /* 3. SANS LES ACCENTS — l'usage le plus répandu, et il ne coûte aucune
          requête à bâtir : on écrit « Rue Sainte-Genevieve », pas
          « Geneviève ». Une famille qui échouerait ici toucherait presque
          tout le monde. */
    if (sansAccents(voie.nom) !== voie.nom) {
      q.push({ famille: 'adresse-sans-accents',
        requete: `${sansAccents(voie.nom)} ${voie.cp} ${voie.ville}`,
        attendu: vt(voie), pipeline: 'adresse', origine: 'BAN', reference: voie.label });
    }
    // 4. AVEC UNE FAUTE — une suppression, la plus dure des quatre (89 % mesuré).
    const mot = motPorteur(voie.nom);
    const faux = mot ? avecUneFaute(mot) : null;
    if (faux) {
      q.push({ famille: 'adresse-faute',
        requete: `${voie.nom.replace(mot, faux)} ${voie.cp} ${voie.ville}`,
        attendu: vt(voie), pipeline: 'adresse', origine: 'BAN', reference: voie.label });
    }
  }

  if (lieu) {
    // 4. UN LIEU NOMMÉ AVEC SA COMMUNE : l'usage courant.
    q.push({ famille: 'lieu-commune', requete: avecCommune(lieu.nom, lieu.ville),
      attendu: vt(lieu), pipeline: 'nom', origine: 'Géoplateforme POI', reference: lieu.nom });
    // 6. LE LIEU SANS SES ACCENTS, avec sa commune.
    if (sansAccents(lieu.nom) !== lieu.nom) {
      q.push({ famille: 'lieu-sans-accents',
        requete: avecCommune(sansAccents(lieu.nom), lieu.ville), attendu: vt(lieu),
        pipeline: 'nom', origine: 'Géoplateforme POI', reference: lieu.nom });
    }
    /* 5. LE LIEU SEUL — seulement si son nom tranche à lui seul. Sinon la
          question n'a pas de réponse, et l'on ne pose pas de question sans
          réponse à un service pour ensuite lui compter un échec. */
    if (lieuTranche) {
      q.push({ famille: 'lieu-seul', requete: lieu.nom, attendu: vt(lieu),
        pipeline: 'nom', origine: 'Géoplateforme POI', reference: lieu.nom });
    }
  }

  if (etab) {
    // 6. UN ÉTABLISSEMENT + SA COMMUNE : le « Castorama Ormesson » d'Armelin.
    /* CINQ CENTS METRES POUR UNE ECOLE, ET C'EST MESURE. Deux sources
       OFFICIELLES ne placent pas le meme etablissement au meme endroit :
       le college Robert-Cellerier de Saint-Savinien est a 363 m de
       lui-meme entre l'annuaire de l'Education et celui des entreprises.
       Deux cents metres comptaient donc en echec une reponse juste. Cinq
       cents, c'est 1,4 fois l'ecart releve : assez pour reconnaitre le meme
       etablissement, trop peu pour en confondre deux. */
    q.push({ famille: 'ecole-commune', requete: avecCommune(etab.nom, etab.ville),
      attendu: vt(etab), pipeline: 'nom', origine: 'Annuaire de l’Éducation',
      reference: etab.nom, rayonM: 500 });
  }

  // 7. LA COMMUNE SEULE : le plus simple, et il doit être sans faute.
  q.push({ famille: 'commune-seule', requete: commune.nom,
    attendu: { lon: commune.lon, lat: commune.lat }, pipeline: 'adresse',
    origine: 'geo.api.gouv.fr', reference: commune.nom, rayonM: commune.rayonM });

  /* CHAQUE ENTRÉE PORTE SA TOLÉRANCE, et c'est le banc qui la déclare plutôt
     que le mesureur qui la devine : deux cents mètres pour un objet ponctuel —
     un pâté de maisons, assez pour reconnaître le lieu sans confondre deux
     commerces d'une même rue — et la taille de la commune pour une commune. */
  return q.map((e) => ({
    rayonM: 200, ...e, commune: commune.nom, codeInsee: commune.code,
  }));
}

/* ---------------------------------------------------------------------- main */

const communes = await echantillonCommunes(COMMUNES);
console.log(`${communes.length} communes tirées, de ${communes[0].nom}`
  + ` (${communes[0].population} hab.) à ${communes[communes.length - 1].nom}`
  + ` (${communes[communes.length - 1].population} hab.)`);

const entrees = [];
let n = 0;
for (const c of communes) {
  n += 1;
  const [voie, lieu, etab] = [await voieReelle(c), await lieuReel(c), await etablissementReel(c)];
  const tranche = lieu ? await nomTrancheSeul(lieu) : false;
  const q = requetesPour(c, voie, lieu, etab, tranche);
  entrees.push(...q);
  process.stdout.write(`\r  ${n}/${communes.length} ${c.nom.padEnd(24).slice(0, 24)}`
    + ` → ${q.length} requêtes (total ${entrees.length})   `);
}
console.log('');

const parFamille = {};
for (const e of entrees) parFamille[e.famille] = (parFamille[e.famille] ?? 0) + 1;

mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, `${JSON.stringify({
  batiLe: new Date().toISOString().slice(0, 10),
  comment: 'Corpus annoté de recherche. Chaque réponse attendue vient d’une '
    + 'source publique, aucune n’est écrite de mémoire. La vérité de terrain '
    + 'est la COORDONNÉE ; le libellé change d’une source à l’autre.',
  communes: communes.length,
  parFamille,
  entrees,
}, null, 1)}\n`, 'utf-8');

console.log(`\n${entrees.length} requêtes écrites dans ${SORTIE}`);
for (const [f, c] of Object.entries(parFamille).sort()) console.log(`  ${f.padEnd(24)} ${c}`);
