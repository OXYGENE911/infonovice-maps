// Lot 144 : la commune (P131+ jusqu'a une commune de France, Q484170) des lieux retenus de l'extrait.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const ICI = 'C:/Dev/_lot144-wikidata/';
const UA = 'InfonoviceMaps-extrait/1.0 (https://maps.infonovice.fr; contact@infonovice.fr) lot144';
const qids = JSON.parse(readFileSync(ICI + 'choisis.json', 'utf8'));
const sortie = {};
const journal = (t) => appendFileSync(ICI + 'journal-communes.txt', `${new Date().toISOString()} ${t}\n`);
for (let i = 0; i < qids.length; i += 200) {
  const lot = qids.slice(i, i + 200);
  const q = `SELECT ?item ?communeLabel WHERE { VALUES ?item { ${lot.map((x) => 'wd:' + x).join(' ')} }
  { ?item wdt:P131 ?commune . } UNION { ?item wdt:P131/wdt:P131 ?commune . } UNION { ?item wdt:P131/wdt:P131/wdt:P131 ?commune . } ?commune wdt:P31 wd:Q484170 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }`;
  for (let essai = 1; essai <= 3; essai += 1) {
    const t0 = Date.now();
    try {
      const r = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'query=' + encodeURIComponent(q) });
      const texte = await r.text();
      if (r.status !== 200) { journal(`${i} ${r.status} essai ${essai}`); await new Promise((ok) => setTimeout(ok, 5000)); continue; }
      const b = JSON.parse(texte).results.bindings;
      for (const x of b) { const id = x.item.value.split('/').pop(); if (!sortie[id]) sortie[id] = x.communeLabel?.value ?? ''; }
      journal(`${i} 200 ${Date.now() - t0}ms ${b.length}`);
      break;
    } catch (e) { journal(`${i} ERREUR ${String(e).slice(0, 100)}`); await new Promise((ok) => setTimeout(ok, 5000)); }
  }
  await new Promise((ok) => setTimeout(ok, 700));
}
writeFileSync(ICI + 'communes.json', JSON.stringify(sortie));
journal('fin ' + Object.keys(sortie).length);
