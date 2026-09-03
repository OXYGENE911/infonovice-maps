// MESURE DES SOURCES DE RECHERCHE (RECHERCHE-8, 03/09).
//
// Armelin, 03/09 : « je veux surtout pouvoir rechercher les mots clés suivants
// en jeu de tests et je ne veux pas avoir à écrire les mots exacts dans la
// barre de recherche mais avoir plus de souplesse même si les mots sont
// incomplets ».
//
// CE SCRIPT NE DEVINE RIEN : il interroge chaque source avec chacune de ses
// douze requêtes et écrit ce qui revient. Le choix des sources qui entreront
// dans l'application se fait APRÈS, sur ces chiffres.
//
//   node scripts/mesure-recherche.mjs

const UA = 'infonovice-maps/1.0 (https://maps.infonovice.fr; contact@infonovice.fr)';

const REQUETES = [
  'Castorama Ormesson',
  'Leroy Merlin Lognes',
  'Carrefour Pincevent',
  'Collège Albert Camus Plessis-Trévise',
  'Disneyland Paris',
  'INRAE BEAUCOUZE',
  'Gare Saint Lazare',
  'Tour Effeil',
  'Tour Effeil Paris',
  'Musée du Louvre',
  'Stade de France',
  'FnacDarty Siège Ivry sur Seine',
];

const dors = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  const rep = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!rep.ok) return { erreur: `HTTP ${rep.status}` };
  try { return await rep.json(); } catch { return { erreur: 'JSON illisible' }; }
}

/* --- LES SOURCES CANDIDATES, toutes françaises et sans clé --- */

const SOURCES = {
  // L'index POI de la Géoplateforme : BD TOPO + BD NYME. Toponymes, monuments,
  // gares, équipements — et TOLÉRANT AUX FAUTES (« Tour Effeil » → Tour Eiffel).
  'geopf-poi': async (q) => {
    const d = await json(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&index=poi&limit=5`);
    return (d.features ?? []).map((f) => ({
      nom: f.properties?.toponym ?? f.properties?.label,
      ou: [f.properties?.city].flat().filter(Boolean).join(', '),
      cp: [f.properties?.postcode].flat().filter(Boolean).join(', '),
      lonlat: f.geometry?.coordinates,
    }));
  },
  // Le même service, index adresse — c'est celui que l'application utilise déjà
  // via la BAN, repris ici pour comparaison.
  'geopf-adresse': async (q) => {
    const d = await json(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&index=address&limit=5`);
    return (d.features ?? []).map((f) => ({
      nom: f.properties?.label, ou: f.properties?.city, cp: f.properties?.postcode,
      lonlat: f.geometry?.coordinates,
    }));
  },
  ban: async (q) => {
    const d = await json(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`);
    return (d.features ?? []).map((f) => ({
      nom: f.properties?.label, ou: f.properties?.city, cp: f.properties?.postcode,
      lonlat: f.geometry?.coordinates,
    }));
  },
  // L'annuaire des entreprises de la DINUM : tous les établissements de France,
  // avec leur adresse. Sans clé, 7 requêtes/seconde.
  entreprises: async (q) => {
    const d = await json('https://recherche-entreprises.api.gouv.fr/search?q='
      + `${encodeURIComponent(q)}&per_page=5&limite_matching_etablissements=3`);
    const sortie = [];
    for (const r of d.results ?? []) {
      for (const e of (r.matching_etablissements ?? []).slice(0, 2)) {
        sortie.push({
          nom: e.enseigne ?? e.nom_commercial ?? r.nom_complet,
          ou: e.libelle_commune, cp: e.code_postal,
          lonlat: e.longitude ? [Number(e.longitude), Number(e.latitude)] : null,
        });
      }
    }
    return sortie.slice(0, 5);
  },
  // Nominatim, instance OSM-France. Un req/s maximum : c'est un bien commun.
  'nominatim-fr': async (q) => {
    const d = await json('https://nominatim.openstreetmap.fr/search?format=json'
      + `&q=${encodeURIComponent(q)}&countrycodes=fr&limit=5`);
    if (d.erreur) return d;
    return (Array.isArray(d) ? d : []).map((x) => ({
      nom: (x.display_name ?? '').split(',').slice(0, 2).join(','),
      ou: '', cp: '', lonlat: [Number(x.lon), Number(x.lat)],
    }));
  },
  // L'annuaire de l'éducation : tous les établissements scolaires, avec GPS.
  education: async (q) => {
    const d = await json('https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/'
      + `fr-en-annuaire-education/records?where=${encodeURIComponent(`search(nom_etablissement,"${q}")`)}&limit=5`);
    return (d.results ?? []).map((r) => ({
      nom: r.nom_etablissement, ou: r.nom_commune, cp: r.code_postal,
      lonlat: r.longitude ? [Number(r.longitude), Number(r.latitude)] : null,
    }));
  },
};

const ORDRE = ['geopf-poi', 'entreprises', 'nominatim-fr', 'education', 'geopf-adresse', 'ban'];

const tableau = {};
for (const q of REQUETES) {
  tableau[q] = {};
  for (const nom of ORDRE) {
    const t0 = Date.now();
    let res;
    try { res = await SOURCES[nom](q); } catch (e) { res = { erreur: String(e).slice(0, 60) }; }
    const ms = Date.now() - t0;
    tableau[q][nom] = { ms, res };
    // ON NE MARTÈLE PAS : Nominatim-FR tolère une requête par seconde.
    await dors(nom === 'nominatim-fr' ? 1200 : 250);
  }
  console.log(`\n${'='.repeat(70)}\n### ${q}`);
  for (const nom of ORDRE) {
    const { ms, res } = tableau[q][nom];
    if (res?.erreur) { console.log(`  ${nom.padEnd(14)} ${String(ms).padStart(5)}ms  ERREUR ${res.erreur}`); continue; }
    const l = res.length;
    console.log(`  ${nom.padEnd(14)} ${String(ms).padStart(5)}ms  ${l} résultat(s)`);
    for (const r of res.slice(0, 3)) {
      console.log(`      · ${r.nom ?? '?'} — ${r.ou ?? ''} ${r.cp ?? ''} ${r.lonlat ? `[${r.lonlat.map((n) => Number(n).toFixed(4)).join(', ')}]` : 'SANS POSITION'}`);
    }
  }
}
