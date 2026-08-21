// Référencement — les métadonnées se vérifient sur les FICHIERS du dépôt :
// une page qui naît sans canonical, sans image de partage ou hors du sitemap
// fait échouer la CI. C'est le seul moyen que le sitemap reste vrai : personne
// ne pense à le rouvrir six mois plus tard.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// fileURLToPath, pas `.pathname` : sous Windows ce dernier rend « /C:/… »,
// que fs interprète en « C:\C:\… ».
const RACINE = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin: string) => readFileSync(RACINE + chemin, 'utf8');

const PAGES = readdirSync(RACINE).filter((f) => f.endsWith('.html'));
const SITEMAP = lire('public/sitemap.xml');
const BASE = 'https://maps.infonovice.fr/';

describe('pages HTML', () => {
  test('le dépôt sert bien les quatre pages attendues', () => {
    expect(PAGES.sort()).toEqual(
      ['a-propos.html', 'index.html', 'mentions-legales.html', 'vie-privee.html'],
    );
  });

  test.each(PAGES)('%s porte canonical, Open Graph et JSON-LD valides', (page) => {
    const html = lire(page);
    const url = page === 'index.html' ? BASE : BASE + page;

    expect(html, 'lang français').toContain('<html lang="fr">');
    expect(html).toContain(`<link rel="canonical" href="${url}">`);
    expect(html).toContain(`<meta property="og:url" content="${url}">`);
    expect(html).toMatch(/<meta property="og:title" content="[^"]{10,}">/);
    expect(html).toMatch(/<meta property="og:description" content="[^"]{40,}">/);
    expect(html).toContain(`<meta property="og:image" content="${BASE}partage-social.png">`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toMatch(/<title>[^<]{10,70}<\/title>/);

    // Le JSON-LD doit être du JSON — un bloc cassé est invisible et muet.
    const bloc = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(bloc, 'aucun bloc JSON-LD').not.toBeNull();
    const donnees = JSON.parse(bloc![1]!) as Record<string, unknown>;
    expect(donnees['@context']).toBe('https://schema.org');
    expect(donnees['url']).toBe(url);
    expect(donnees['inLanguage']).toBe('fr-FR');
  });
});

describe('sitemap et robots', () => {
  test('CHAQUE page du dépôt figure dans le sitemap — et rien de plus', () => {
    const declarees = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!).sort();
    const attendues = PAGES
      .map((p) => (p === 'index.html' ? BASE : BASE + p))
      .sort();
    expect(declarees).toEqual(attendues);
  });

  test('robots.txt autorise tout et désigne le sitemap', () => {
    const robots = lire('public/robots.txt');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain(`Sitemap: ${BASE}sitemap.xml`);
    expect(robots, 'aucune interdiction inattendue').not.toContain('Disallow: /');
  });
});
