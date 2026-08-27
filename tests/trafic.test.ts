// Info trafic — reprojection Lambert-93, composition du chemin d'itération et
// analyse défensive, à sec. Les fixtures reprennent la FORME RÉELLE de Bison
// Futé (vérifiée le 22/08/2026) : GeoJSON en Lambert-93, propriétés
// techniques, détail en tableau imbriqué contenant du HTML.
import { versWGS84, dansEmpriseFrance } from '../src/lib/lambert93';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  dossierIteration, urlEvenements, versEvenements, versDetail, chargerTrafic,
  evenementsDuTrajet,
  libelleType, couleurType, ErreurTrafic,
} from '../src/lib/trafic';

describe('Lambert-93 → WGS84', () => {
  test('l’ORIGINE CONVENTIONNELLE tombe exactement sur 3° E, 46,5° N', () => {
    // Point de contrôle publié par l'IGN : si la constante de projection est
    // fausse d'un chiffre, ce test le dit tout de suite.
    const p = versWGS84({ x: 700000, y: 6600000 })!;
    expect(p.lon).toBeCloseTo(3, 6);
    expect(p.lat).toBeCloseTo(46.5, 6);
  });

  test('des points réels tombent dans le BON DÉPARTEMENT', () => {
    // Coordonnées relevées dans le flux réel, avec le département donné par
    // le détail de l'événement — la vérification sémantique du 22/08.
    const a5 = versWGS84({ x: 695546.6, y: 6813337.5 })!;   // A5 (77)
    expect(a5.lat).toBeCloseTo(48.42, 1);
    expect(a5.lon).toBeCloseTo(2.94, 1);
    const n20 = versWGS84({ x: 597000, y: 6212000 })!;      // Ariège, grossièrement
    expect(n20.lat).toBeGreaterThan(42);
    expect(n20.lat).toBeLessThan(44);
  });

  test('refuse les entrées difformes plutôt que de rendre NaN', () => {
    expect(versWGS84({ x: Number.NaN, y: 6600000 })).toBeNull();
    expect(versWGS84({ x: 700000, y: Number.POSITIVE_INFINITY })).toBeNull();
    expect(versWGS84({} as never)).toBeNull();
  });

  test('l’emprise France écarte ce qui n’y est pas', () => {
    expect(dansEmpriseFrance(2.35, 48.85)).toBe(true);
    expect(dansEmpriseFrance(9.1, 41.5)).toBe(true);   // Corse du Sud
    expect(dansEmpriseFrance(-74, 40.7)).toBe(false);  // New York
    expect(dansEmpriseFrance(0, 0)).toBe(false);       // au large de l’Afrique
  });
});

describe('dossierIteration', () => {
  test('compose le chemin en heure de PARIS, pas en heure du visiteur', () => {
    // 22 août 2026, 01:05:03 à Paris = 23:05:03 UTC la veille (UTC+2 en été).
    const ms = Date.parse('2026-08-21T23:05:03Z');
    expect(dossierIteration(ms)).toBe('data-20260822-010503');
  });

  test('l’heure d’HIVER (UTC+1) est gérée par le fuseau, pas par un décalage figé', () => {
    // 15 janvier 2026, 09:30:00 UTC = 10:30:00 à Paris.
    const ms = Date.parse('2026-01-15T09:30:00Z');
    expect(dossierIteration(ms)).toBe('data-20260115-103000');
  });

  test('minuit s’écrit 00, jamais 24', () => {
    const ms = Date.parse('2026-08-21T22:00:00Z'); // minuit à Paris
    expect(dossierIteration(ms)).toBe('data-20260822-000000');
  });

  test('l’URL des événements se compose sur le dossier', () => {
    const u = urlEvenements('data-20260822-010503');
    expect(u).toContain('www1.bison-fute.gouv.fr');
    expect(u).toContain('data-20260822-010503');
    expect(u).toContain('evenementsOL6.json');
  });
});

describe('versEvenements', () => {
  const feature = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
    geometry: { type: 'Point', coordinates: [x, y] },
    properties: {
      type: 'TRAVAUX', etat_evenement: 'EFFECTIF',
      urlcpc: '/data/data-20260822-010503/evenementsOL6/maintenant/cpc/1.json',
      dateCreation: '21/08/2026 05:48:17',
      ...extra,
    },
  });

  test('reprojette et garde les événements en cours', () => {
    const e = versEvenements({ features: [feature(695546.6, 6813337.5)] });
    expect(e).toHaveLength(1);
    expect(e[0]!.lat).toBeCloseTo(48.42, 1);
    expect(e[0]!.type).toBe('TRAVAUX');
    expect(e[0]!.detail).toContain('/cpc/1.json');
  });

  test('ÉCARTE les événements TERMINÉS — un accident dégagé n’est pas une info', () => {
    const e = versEvenements({ features: [
      feature(695546.6, 6813337.5, { etat_evenement: 'TERMINE' }),
      feature(700000, 6600000, { etat_evenement: 'EFFECTIF' }),
      feature(700000, 6600001, { etat_evenement: '' }),          // état vide : gardé
      feature(700000, 6600002, { etat_evenement: 'PREVISIONNEL' }),
    ] });
    expect(e).toHaveLength(3);
  });

  test('écarte les entrées difformes et les points hors de France', () => {
    const e = versEvenements({ features: [
      feature(700000, 6600000),
      { geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      { geometry: { type: 'Point', coordinates: ['x', 'y'] }, properties: {} },
      { geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }, // hors emprise
      {},
      null,
    ] });
    expect(e).toHaveLength(1);
  });

  test('n’accepte QUE les chemins de détail du service', () => {
    const e = versEvenements({ features: [
      feature(700000, 6600000, { urlcpc: 'https://ailleurs.example/vol.json' }),
    ] });
    expect(e[0]!.detail).toBeNull();
  });

  test('refuse une réponse difforme, en français', () => {
    expect(() => versEvenements({})).toThrow(ErreurTrafic);
    expect(() => versEvenements({ features: 'non' })).toThrow('exploitables');
  });
});

describe('versDetail', () => {
  test('réduit le HTML du service en TEXTE lisible', () => {
    // Forme réelle relevée le 22/08 : tableau imbriqué, HTML échappé dedans.
    const brut = [[
      "N24 (35) Travaux d'élargissement", 'travaux', [],
      ["Travaux d'élargissement",
        '<br/>prévu jusqu&#39;au 30/03/2028 à 6h<br/> N24 (deux sens)<br/>entre les PR 2+500 et 3+300<br/>'],
      '', 'EFFECTIF',
    ]];
    const d = versDetail(brut)!;
    expect(d.titre).toBe("N24 (35) Travaux d'élargissement");
    expect(d.texte).toContain('N24 (deux sens)');
    expect(d.texte).toContain('PR 2+500');
    // AUCUNE balise ne survit : ce texte ira dans un textContent, mais on ne
    // laisse pas passer de balises pour autant.
    expect(d.texte).not.toContain('<br');
    expect(d.texte).not.toMatch(/<[a-z]/i);
  });

  test('les entités HTML se lisent en clair, NUMÉRIQUES comprises', () => {
    const d = versDetail([['t', 'c', [], ['o', 'A &amp; B &lt;test&gt; jusqu&#39;au 30/03 &#x41;'], '', '']])!;
    expect(d.texte).toContain('A & B');
    expect(d.texte).toContain('<test>');
    // Le service écrit réellement « jusqu&#39;au » : sans décodage numérique,
    // l'usager lisait le code de l'entité (relevé en E2E le 22/08).
    expect(d.texte).toContain("jusqu'au 30/03");
    expect(d.texte).toContain('A'); // &#x41;
    expect(d.texte).not.toContain('&#');
  });

  test('une entité DOUBLEMENT échappée ne se décode pas deux fois', () => {
    // « &amp;#39; » doit rester « &#39; » en texte, sinon on inventerait un
    // caractère que le service n'a pas écrit.
    const d = versDetail([['t', 'c', [], ['litt&amp;#39;ral'], '', '']])!;
    expect(d.texte).toBe('litt&#39;ral');
  });

  test('un détail vide ou difforme rend null, sans lever', () => {
    expect(versDetail(null)).toBeNull();
    expect(versDetail([])).toBeNull();
    expect(versDetail([[]])).toBeNull();
    expect(versDetail('non')).toBeNull();
  });
});

describe('libellés et couleurs', () => {
  test('chaque type observé dans le flux réel a un libellé français', () => {
    for (const t of ['TRAVAUX', 'ACCIDENT', 'BOUCHON', 'COUPURE', 'OBSTACLE',
      'RESTRICTION', 'MESURE_GESTION_TRAFIC', 'INTEMPERIES', 'INFORMATION', 'INTERDICTION_PL']) {
      expect(libelleType(t), t).not.toBe('Événement routier');
    }
    expect(libelleType('TYPE_INCONNU_2030')).toBe('Événement routier');
  });

  test('le rouge est réservé à ce qui bloque ou blesse', () => {
    expect(couleurType('ACCIDENT')).toBe(couleurType('COUPURE'));
    expect(couleurType('ACCIDENT')).not.toBe(couleurType('TRAVAUX'));
    expect(couleurType('TYPE_INCONNU')).toBe('#5F5E5A');
  });
});


describe('versDetail — l’assainisseur, FALSIFIÉ', () => {
  // La revue du 22/08 a prouvé par mutation que les tests précédents
  // passaient MÊME sans le retrait des balises : ils vérifiaient l'absence
  // d'exécution (garantie par textContent), pas le nettoyage lui-même.
  test('AUCUNE balise ne survit à versDetail — sur du texte, pas dans le DOM', () => {
    const brut = [['T', 'c', [],
      ['<img src=x onerror=alert(1)> <b>gras</b> <script>vol()</script> fin'], '', '']];
    const d = versDetail(brut)!;
    expect(d.texte).not.toContain('<img');
    expect(d.texte).not.toContain('<b>');
    expect(d.texte).not.toContain('<script');
    expect(d.texte).not.toMatch(/<\/?[a-z][^>]*>/i);
    // Le texte utile survit, lui.
    expect(d.texte).toContain('gras');
    expect(d.texte).toContain('fin');
  });

  test('un point de code HORS LIMITES ne fait plus tomber le bulletin', () => {
    // String.fromCodePoint lève au-delà de 0x10FFFF : une entité fantaisiste
    // coûtait tout le détail (revue du 22/08).
    for (const entite of ['&#1114112;', '&#x110000;', '&#99999999999999;', '&#xD800;']) {
      const d = versDetail([['T', 'c', [], [`A25 fermée ${entite} sens Lille`], '', '']]);
      expect(d, entite).not.toBeNull();
      expect(d!.texte).toContain('A25 fermée');
      expect(d!.texte).toContain('sens Lille');
      // L'entité douteuse reste en clair plutôt que de tout emporter.
      expect(d!.texte).toContain(entite);
    }
  });
});

describe('chargerTrafic — les gardes de la chaîne', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const EVENEMENT = {
    type: 'FeatureCollection',
    features: [{
      geometry: { type: 'Point', coordinates: [695546.6, 6813337.5] },
      properties: { type: 'TRAVAUX', etat_evenement: 'EFFECTIF', urlcpc: '/data/x/cpc/1.json' },
    }],
  };
  const reponse = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

  test('UNE LISTE NATIONALE VIDE est traitée comme une panne, pas comme une vérité', async () => {
    // Le cas réel : un dossier d'itération périmé rend un fichier VIDE, sans
    // erreur HTTP. L'accepter afficherait « 0 événement » pour toute la France.
    const f = vi.fn(async (u: string) => (String(u).includes('date.json')
      ? reponse([Date.now()])
      : reponse({ type: 'FeatureCollection', features: [] })));
    vi.stubGlobal('fetch', f);
    const erreur = await chargerTrafic().catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurTrafic);
    expect((erreur as Error).message).toContain('données conservées');
  });

  test('une horodate DIFFORME est refusée avant de composer un chemin de 1970', async () => {
    for (const mauvaise of [null, '', [], [0], ['non'], [-1], [12345]]) {
      const f = vi.fn().mockResolvedValue(reponse(mauvaise));
      vi.stubGlobal('fetch', f);
      await expect(chargerTrafic(), JSON.stringify(mauvaise)).rejects.toThrow('horodate');
      // La deuxième requête ne part JAMAIS sur une horodate absurde.
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  test('une horodate plausible enchaîne bien sur la couche', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(reponse([Date.parse('2026-08-21T23:05:03Z')]))
      .mockResolvedValueOnce(reponse(EVENEMENT));
    vi.stubGlobal('fetch', f);
    const e = await chargerTrafic();
    expect(e).toHaveLength(1);
    expect(String(f.mock.calls[1]?.[0])).toContain('data-20260822-010503');
  });
});

/* LES ÉVÉNEMENTS DU CORRIDOR — la candidate de l'étude du 27/08 : la barre
   de fluidité est écartée (données ponctuelles seulement), on ANNONCE. */
describe('evenementsDuTrajet', () => {
  const trace: [number, number][] =
    Array.from({ length: 101 }, (_, i) => [3 + i * 0.01, 47] as [number, number]);
  const evt = (lon: number, lat: number, type: string, etat = 'EFFECTIF') => ({
    id: `${lon}`, lon, lat, type, etat, detail: null, cree: null,
  });

  test('retient les EFFECTIFS du corridor, triés par avancement', () => {
    const l = evenementsDuTrajet([
      evt(3.5, 47.01, 'ACCIDENT'),
      evt(3.2, 47.005, 'TRAVAUX'),
      evt(3.4, 47.5, 'COUPURE'),          // à ~40 km du tracé : dehors
    ], trace);
    expect(l.map((x) => x.libelle)).toEqual(['Travaux', 'Accident']);
    expect(l[0]!.avancementM).toBeLessThan(l[1]!.avancementM);
  });

  test('les PRÉVISIONNELS sont tus — les travaux de mardi ne sont pas ceux du volant', () => {
    const l = evenementsDuTrajet([evt(3.2, 47.005, 'TRAVAUX', 'PREVISIONNEL')], trace);
    expect(l).toEqual([]);
  });
});
