import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* LA CSP DOIT CONNAÎTRE TOUS LES SERVICES QU'ON APPELLE (RECHERCHE-8, 03/09).
 *
 * LE DÉFAUT QUE CE FICHIER EXISTE POUR FERMER, ET IL A FAILLI PARTIR EN
 * PRODUCTION. En branchant l'annuaire des entreprises, j'ai ajouté un hôte
 * neuf — `recherche-entreprises.api.gouv.fr` — sans l'inscrire dans la
 * `connect-src` de `index.html`. Le navigateur bloque alors la requête AVANT
 * de l'émettre : aucun échec réseau ne paraît, `page.on('requestfailed')` ne
 * voit rien, et l'application affiche « Failed to fetch ». J'ai cherché la
 * cause dans mes simulations de test pendant un moment, parce que le symptôme
 * ressemble à une panne de mock.
 *
 * CE TEST LIT LE CODE ET LA PAGE, et compare. Le jour où quelqu'un ajoute une
 * source sans toucher à la CSP, il tombe ici — pas chez l'usager. */

const RACINE = join(import.meta.dirname ?? __dirname, '..');

/** Les hôtes que la page autorise à être appelés. */
function hotesAutorises(): Set<string> {
  const html = readFileSync(join(RACINE, 'index.html'), 'utf8');
  const m = /connect-src([^;]*);/.exec(html);
  if (m === null) throw new Error('index.html ne déclare aucune connect-src');
  const hotes = new Set<string>();
  for (const jeton of (m[1] ?? '').split(/\s+/)) {
    const t = jeton.trim();
    if (t === '' || !t.startsWith('https://')) continue;
    hotes.add(t.replace(/^https:\/\//, '').replace(/\/$/, ''));
  }
  return hotes;
}

/** Les hôtes que le code appelle vraiment. */
function hotesAppeles(): Map<string, string[]> {
  const trouves = new Map<string, string[]>();
  const parcourir = (dossier: string): void => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) { parcourir(chemin); continue; }
      if (!e.name.endsWith('.ts')) continue;
      const source = readFileSync(chemin, 'utf8');
      for (const m of source.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
        const hote = (m[1] ?? '').toLowerCase();
        trouves.set(hote, [...(trouves.get(hote) ?? []), chemin]);
      }
    }
  };
  parcourir(join(RACINE, 'src'));
  return trouves;
}

/* CE QU'ON NE FAIT QUE MONTRER, JAMAIS APPELER. Ces adresses paraissent dans
   des liens, des mentions de licence ou des en-têtes `User-Agent` : elles ne
   passent par aucun `fetch`, et n'ont donc rien à faire dans la connect-src.
   Toute nouvelle entrée ici DOIT être justifiée — c'est la porte par laquelle
   on pourrait faire taire ce test au lieu de le satisfaire. */
const NON_APPELES = new Set([
  // Liens affichés à l'usager (attribution, mentions légales, aide).
  'www.openstreetmap.org', 'openstreetmap.org', 'www.etalab.gouv.fr',
  'geoservices.ign.fr', 'www.geoportail.gouv.fr', 'maps.infonovice.fr',
  'infonovice.fr', 'www.infonovice.fr', 'creativecommons.org',
  'spdx.org', 'www.gnu.org', 'schema.org', 'www.w3.org', 'wiki.openstreetmap.org',
  'transport.data.gouv.fr', 'www.data.gouv.fr', 'data.gouv.fr',
  'github.com', 'www.legifrance.gouv.fr', 'legifrance.gouv.fr',
  'operations.osmfoundation.org', 'www.service-public.fr',
  /* La notice Mérimée s'OUVRE dans un onglet (`a.href` dans fiche-lieu.ts) :
     l'historique d'un monument vit chez le ministère, on ne le télécharge
     pas. Et l'attribution IGN exigée par la Géoplateforme est un lien. */
  'www.pop.culture.gouv.fr', 'www.ign.fr',
  /* Le signalement d'une erreur de carte (SENS-1, 05/09) S'OUVRE dans un
     onglet : une note OSM et le visualiseur cartes.gouv.fr, centrés sur la
     position. On n'y envoie rien — c'est l'usager qui écrit là-bas. */
  'cartes.gouv.fr',
]);

describe('la CSP et le code disent la même chose', () => {
  it('CHAQUE SERVICE APPELÉ EST DÉCLARÉ dans connect-src', () => {
    const autorises = hotesAutorises();
    const manquants: string[] = [];
    for (const [hote, fichiers] of hotesAppeles()) {
      if (NON_APPELES.has(hote) || autorises.has(hote)) continue;
      manquants.push(`${hote} (${[...new Set(fichiers)].join(', ')})`);
    }
    expect(manquants,
      'ces hôtes sont appelés par le code mais absents de la connect-src d’index.html :'
      + ' le navigateur bloquera la requête AVANT de l’émettre, et l’application'
      + ' dira « Failed to fetch » sans qu’aucun échec réseau ne paraisse')
      .toEqual([]);
  });

  it('LES SOURCES DE LA RECHERCHE y sont nommément', () => {
    /* Les cinq services dont dépend la recherche depuis RECHERCHE-8. Les
       nommer ici fait que leur retrait se voie. */
    const autorises = hotesAutorises();
    for (const h of [
      'data.geopf.fr', 'api-adresse.data.gouv.fr',
      'recherche-entreprises.api.gouv.fr', 'overpass.openstreetmap.fr',
      'data.education.gouv.fr',
    ]) {
      expect(autorises, `${h} doit être autorisé`).toContain(h);
    }
  });
});
