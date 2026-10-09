// Lot 144 (09/10/2026) — extrait Wikidata (CC0) des lieux notables de France, par tuiles (wikibase:box).
// Un appel a la fois (2 en parallele au plus), User-Agent explicite, reprise possible (tuiles deja faites sautees).
import { writeFileSync, existsSync, appendFileSync } from 'node:fs';
const ICI = 'C:/Dev/_lot144-wikidata/';
const SEUIL = Number(process.env.SEUIL ?? 8);
const UA = 'InfonoviceMaps-extrait/1.0 (https://maps.infonovice.fr; contact@infonovice.fr) lot144';
const tuiles = [];
for (let lon = -6; lon < 10; lon += 1) for (let lat = 41; lat < 52; lat += 1) tuiles.push([lon, lat, lon + 1, lat + 1]);
// Outre-mer (DROM, SPM, Saint-Martin, Saint-Barthelemy)
tuiles.push([-61.9, 15.8, -60.9, 16.6], [-61.3, 14.3, -60.7, 14.95], [-54.7, 2.0, -51.5, 6.0], [55.1, -21.5, 56.0, -20.8],
  [44.9, -13.1, 45.4, -12.5], [-56.5, 46.7, -56.0, 47.2], [-63.2, 17.8, -62.7, 18.2]);
function requete([w, s, e, n]) {
  return `SELECT ?item ?itemLabel ?coord ?sl ?type ?typeLabel ?communeLabel WHERE {
  SERVICE wikibase:box { ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(${w} ${s})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${e} ${n})"^^geo:wktLiteral . }
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${SEUIL})
  ?item wdt:P17 wd:Q142 .
  OPTIONAL { ?item wdt:P31 ?type . }
  OPTIONAL { ?item wdt:P131 ?commune . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}`;
}
const journal = (t) => appendFileSync(ICI + 'journal.txt', `${new Date().toISOString()} ${t}\n`);
async function une(t) {
  const nom = t.join('_');
  const f = `${ICI}tuiles/${nom}.json`;
  if (existsSync(f)) return;
  for (let essai = 1; essai <= 3; essai += 1) {
    const t0 = Date.now();
    try {
      const r = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'query=' + encodeURIComponent(requete(t)),
      });
      const texte = await r.text();
      if (r.status === 200) {
        writeFileSync(f, texte);
        const n = (JSON.parse(texte).results?.bindings ?? []).length;
        journal(`${nom} 200 ${Date.now() - t0}ms ${n} lignes`);
        return;
      }
      journal(`${nom} ${r.status} ${Date.now() - t0}ms essai ${essai} ${texte.slice(0, 120).replace(/\s+/g, ' ')}`);
      await new Promise((ok) => setTimeout(ok, r.status === 429 ? 20000 : 5000));
    } catch (e) {
      journal(`${nom} ERREUR essai ${essai} ${String(e).slice(0, 120)}`);
      await new Promise((ok) => setTimeout(ok, 5000));
    }
  }
}
journal(`debut ${tuiles.length} tuiles seuil ${SEUIL}`);
let i = 0;
async function ouvrier() { while (i < tuiles.length) { const t = tuiles[i++]; await une(t); await new Promise((ok) => setTimeout(ok, 500)); } }
await Promise.all([ouvrier(), ouvrier()]);
journal('fin');
