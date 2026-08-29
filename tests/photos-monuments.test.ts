import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fichierDepuisFilePath, texteNu, fichierDeLaReference, vignetteEtCredit,
  photoDuMonument, ErreurPhotos,
} from '../src/lib/photos-monuments';

/* LES PHOTOS DES LIEUX (PHOTO-1, décision d'Armelin du 29/08 : « OK pour
 * Wikimedia »). Le réseau est simulé : ce qui se teste ici, c'est la
 * FRONTIÈRE — une référence qui n'entre pas dans la requête, du HTML tiers
 * qui ne devient jamais du balisage, une absence de photo qui rend `null`
 * plutôt que de casser la fiche. */

const filePath = (nom: string): string =>
  `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(nom)}`;

function simulerReseau(reponses: Record<string, unknown>): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    for (const [motif, corps] of Object.entries(reponses)) {
      if (url.includes(motif)) {
        if (corps === 'ERREUR') return { ok: false, status: 503 } as Response;
        return { ok: true, status: 200, json: async () => corps } as Response;
      }
    }
    throw new Error(`appel imprévu : ${url}`);
  }));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('fichierDepuisFilePath', () => {
  it('rend le nom du fichier, décodé et sans tirets bas', () => {
    expect(fichierDepuisFilePath(filePath('Tour Eiffel Wikimedia Commons.jpg')))
      .toBe('Tour Eiffel Wikimedia Commons.jpg');
    expect(fichierDepuisFilePath(
      'http://commons.wikimedia.org/wiki/Special:FilePath/Ch%C3%A2teau_de_Foix.jpg',
    )).toBe('Château de Foix.jpg');
  });

  it('rend une chaîne vide sur une URL qui n’en est pas une', () => {
    for (const u of ['', 'https://example.org/photo.jpg', 'Special:FilePath/']) {
      expect(fichierDepuisFilePath(u), u).toBe('');
    }
  });
});

describe('texteNu', () => {
  it('ne garde que le TEXTE du HTML rendu par l’API', () => {
    // La forme MESURÉE le 29/08 sur la tour Eiffel.
    expect(texteNu('<a href="//commons.wikimedia.org/wiki/User:Benh">Benh LIEU SONG</a>'))
      .toBe('Benh LIEU SONG');
  });

  it('DÉSAMORCE le balisage : rien de tiers n’entre dans la page', () => {
    const hostile = '<img src=x onerror="alert(1)">Auteur<script>alert(2)</script>';
    const nu = texteNu(hostile);
    expect(nu).not.toContain('<');
    expect(nu).not.toContain('onerror');
    expect(nu).toContain('Auteur');
  });

  it('rend une chaîne vide sur une entrée vide', () => {
    expect(texteNu('')).toBe('');
  });
});

describe('fichierDeLaReference', () => {
  it('interroge Wikidata et rend le fichier trouvé', async () => {
    simulerReseau({ 'query.wikidata.org': {
      results: { bindings: [{ img: { value: filePath('Château de Foix.jpg') } }] },
    } });
    expect(await fichierDeLaReference('PA00093887')).toBe('Château de Foix.jpg');
  });

  it('N’APPELLE PAS avec une référence hors motif — elle entre dans la requête', async () => {
    /* Une référence relue d'un index altéré écrirait sinon ce qu'elle veut
       dans le SPARQL. Le contrôle est le MÊME que celui du lien vers
       pop.culture.gouv.fr (monuments.ts). */
    const appels = vi.fn();
    vi.stubGlobal('fetch', appels);
    for (const mauvaise of ['', 'PA1', '" } UNION { ?m ?p ?o', 'pa00093887-bis']) {
      expect(await fichierDeLaReference(mauvaise), mauvaise).toBe('');
    }
    expect(appels).not.toHaveBeenCalled();
  });

  it('rend une chaîne vide quand Wikidata ne connaît pas le monument', async () => {
    simulerReseau({ 'query.wikidata.org': { results: { bindings: [] } } });
    expect(await fichierDeLaReference('PA00093887')).toBe('');
  });
});

describe('vignetteEtCredit', () => {
  const reponseCommons = {
    query: { pages: { '123': { imageinfo: [{
      thumburl: 'https://upload.wikimedia.org/…/480px-Foix.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Foix.jpg',
      extmetadata: {
        Artist: { value: '<a href="//x">Jean Photographe</a>' },
        LicenseShortName: { value: 'CC BY-SA 4.0' },
      },
    }] } } },
  };

  it('rend la vignette ET son attribution, en texte nu', async () => {
    simulerReseau({ 'commons.wikimedia.org': reponseCommons });
    const photo = await vignetteEtCredit('Foix.jpg');
    expect(photo).toEqual({
      vignette: 'https://upload.wikimedia.org/…/480px-Foix.jpg',
      auteur: 'Jean Photographe',
      licence: 'CC BY-SA 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Foix.jpg',
    });
  });

  it('NOMME l’absence d’auteur au lieu de la taire', async () => {
    simulerReseau({ 'commons.wikimedia.org': { query: { pages: { '1': { imageinfo: [{
      thumburl: 'https://upload.wikimedia.org/x.jpg', extmetadata: {},
    }] } } } } });
    const photo = await vignetteEtCredit('x.jpg');
    expect(photo?.auteur).toBe('Auteur non précisé');
    expect(photo?.licence).toBe('licence non précisée');
  });

  it('rend null sans vignette, et ne demande rien sans fichier', async () => {
    const appels = vi.fn();
    vi.stubGlobal('fetch', appels);
    expect(await vignetteEtCredit('')).toBeNull();
    expect(appels).not.toHaveBeenCalled();

    simulerReseau({ 'commons.wikimedia.org': { query: { pages: {} } } });
    expect(await vignetteEtCredit('inconnu.jpg')).toBeNull();
  });

  it('lève une erreur nommée quand le service refuse', async () => {
    simulerReseau({ 'commons.wikimedia.org': 'ERREUR' });
    await expect(vignetteEtCredit('Foix.jpg')).rejects.toBeInstanceOf(ErreurPhotos);
  });
});

describe('photoDuMonument', () => {
  it('enchaîne les deux services, et n’appelle Commons QUE s’il y a un fichier', async () => {
    simulerReseau({
      'query.wikidata.org': { results: { bindings: [] } },
    });
    // Aucune image chez Wikidata : Commons n'est jamais sollicité — le
    // simulateur lèverait sur un appel imprévu.
    expect(await photoDuMonument('PA00093887')).toBeNull();
  });
});
