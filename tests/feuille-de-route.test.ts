// Feuille de route — traduction des codes OSRM et lecture des noms BD TOPO,
// testées à sec sur des fixtures AU FORMAT RÉEL du service (vérifié par
// appels réels le 21/08/2026, docs/apis.md).
import { afterEach, describe, expect, test, vi } from 'vitest';
import { traduireInstruction, libelleVoie, versEtapes, etapesItineraire, manoeuvreDe, ErreurFeuille } from '../src/lib/feuille-de-route';

describe('traduireInstruction', () => {
  test('couvre les manœuvres courantes en français', () => {
    expect(traduireInstruction({ type: 'depart', modifier: 'left' })).toBe('Départ');
    expect(traduireInstruction({ type: 'arrive' })).toBe('Vous êtes arrivé');
    expect(traduireInstruction({ type: 'turn', modifier: 'right' })).toBe('Tournez à droite');
    expect(traduireInstruction({ type: 'turn', modifier: 'sharp left' })).toBe('Tournez franchement à gauche');
    expect(traduireInstruction({ type: 'turn', modifier: 'uturn' })).toBe('Faites demi-tour');
    expect(traduireInstruction({ type: 'new name', modifier: 'slight left' })).toBe('Continuez légèrement à gauche');
    expect(traduireInstruction({ type: 'continue', modifier: 'straight' })).toBe('Continuez tout droit');
    expect(traduireInstruction({ type: 'end of road', modifier: 'left' })).toBe('Au bout de la voie, tournez à gauche');
    expect(traduireInstruction({ type: 'off ramp' })).toBe('Prenez la sortie');
    expect(traduireInstruction({ type: 'roundabout', exit: 3 })).toBe('Au rond-point, prenez la 3ᵉ sortie');
  });

  test('un code inconnu reste une consigne, pas une erreur', () => {
    expect(traduireInstruction({ type: 'code-de-2030', modifier: 'right' })).toBe('Tournez à droite');
    expect(traduireInstruction({})).toBe('Continuez tout droit');
  });

  test('les combinaisons piégeuses ne produisent jamais de phrase absurde', () => {
    // Chacune de ces sorties a été fautive un jour (« Continuez demi-tour »,
    // « tournez tout droit », « la 1ᵉ sortie ») — revue adverse du 21/08.
    expect(traduireInstruction({ type: 'continue', modifier: 'uturn' })).toBe('Faites demi-tour');
    expect(traduireInstruction({ type: 'new name', modifier: 'uturn' })).toBe('Faites demi-tour');
    expect(traduireInstruction({ type: 'end of road', modifier: 'straight' })).toBe('Au bout de la voie, continuez tout droit');
    expect(traduireInstruction({ type: 'end of road', modifier: 'uturn' })).toBe('Au bout de la voie, faites demi-tour');
    expect(traduireInstruction({ type: 'fork', modifier: 'straight' })).toBe('À l’embranchement, continuez tout droit');
    expect(traduireInstruction({ type: 'roundabout', exit: 1 })).toBe('Au rond-point, prenez la 1ʳᵉ sortie');
  });

  test('les branches restantes du service sont couvertes', () => {
    expect(traduireInstruction({ type: 'merge', modifier: 'slight left' })).toBe('Rejoignez la voie légèrement à gauche');
    expect(traduireInstruction({ type: 'merge', modifier: 'straight' })).toBe('Rejoignez la voie');
    expect(traduireInstruction({ type: 'fork', modifier: 'slight right' })).toBe('À l’embranchement, restez légèrement à droite');
    expect(traduireInstruction({ type: 'on ramp' })).toBe('Prenez la bretelle d’accès');
    expect(traduireInstruction({ type: 'rotary', exit: 2 })).toBe('Au rond-point, prenez la 2ᵉ sortie');
    expect(traduireInstruction({ type: 'roundabout' })).toBe('Au rond-point, suivez la direction indiquée');
    expect(traduireInstruction({ type: 'exit roundabout' })).toBe('Sortez du rond-point');
    expect(traduireInstruction({ type: 'exit rotary' })).toBe('Sortez du rond-point');
  });
});

describe('libelleVoie', () => {
  test('déplie les abréviations BD TOPO et remet la casse', () => {
    expect(libelleVoie('R DE RIVOLI')).toBe('Rue de Rivoli');
    /* L'ÉLISION SE RECOLLE (TERRAIN-1, 30/08) : le service livre les noms
       sans apostrophe, et « Rue du Chateau D Eau » se lisait tel quel au
       premier plan du panneau — vu sur capture. */
    /* LES ACCENTS SONT RENDUS DEPUIS ACCENTS-1 (31/08) : la source les a
       perdus, et la synthèse vocale prononçait « Proph-eu-te ». Ces deux
       libellés attendaient l'ancienne sortie sans accents — la nouvelle est
       à la fois plus juste à l'écran et mieux dite à voix haute. */
    expect(libelleVoie('R DU CHATEAU D EAU')).toBe('Rue du Château d’Eau');
    expect(libelleVoie('R DE L EGLISE')).toBe('Rue de l’Église');
    expect(libelleVoie('AV VICTORIA')).toBe('Avenue Victoria');
    expect(libelleVoie('BD DU MONTPARNASSE')).toBe('Boulevard du Montparnasse');
    expect(libelleVoie('R SAINT-MARTIN')).toBe('Rue Saint-Martin');
    expect(libelleVoie('QU DES ORFEVRES')).toBe('Quai des Orfevres');
  });

  test('respecte l’élision : la particule reste basse, le nom reprend sa majuscule', () => {
    expect(libelleVoie("R DE L'EGLISE")).toBe("Rue de l'Église");
    expect(libelleVoie("R D'ALSACE")).toBe("Rue d'Alsace");
    expect(libelleVoie("PL DE L'HOTEL DE VILLE")).toBe("Place de l'Hôtel de Ville");
  });

  test('reste défensive : vide, null, type inattendu', () => {
    expect(libelleVoie('')).toBe('');
    expect(libelleVoie('   ')).toBe('');
    expect(libelleVoie(null)).toBe('');
    expect(libelleVoie(42)).toBe('');
  });
});

describe('versEtapes', () => {
  const etape = (type: string, modifier: string, nom: string, distance: number, numero = '') => ({
    instruction: { type, modifier },
    attributes: { name: { nom_1_gauche: nom, nom_1_droite: nom, cpx_numero: numero, cpx_toponyme: '' } },
    distance, duration: distance / 10,
    geometry: { type: 'LineString', coordinates: [[2, 48], [2.1, 48]] },
  });

  test('lit les portions du service et privilégie le numéro de route', () => {
    const e = versEtapes({ portions: [{ steps: [
      etape('depart', 'left', 'R DE RIVOLI', 98.2),
      etape('on ramp', 'slight right', '', 312, 'A6'),
      etape('arrive', 'straight', '', 0),
    ] }] });
    expect(e).toHaveLength(3);
    expect(e[0]).toEqual({ texte: 'Départ', voie: 'Rue de Rivoli', distance: 98.2, manoeuvre: 'straight' });
    expect(e[1]!.voie).toBe('A6');
    expect(e[2]!.texte).toBe('Vous êtes arrivé');
  });

  test('refuse une réponse sans étapes, en français', () => {
    expect(() => versEtapes({})).toThrow(ErreurFeuille);
    expect(() => versEtapes({ portions: [{ steps: [] }] })).toThrow('étapes exploitables');
  });

  test('replis et défenses : toponyme, étape difforme, distance non finie', () => {
    const e = versEtapes({ portions: [{ steps: [
      { instruction: { type: 'depart', modifier: 'left' },
        attributes: { name: { nom_1_gauche: '', cpx_numero: '', cpx_toponyme: 'PONT DE SEVRES' } },
        distance: Number.NaN },
      null,
      'pas-un-objet',
      { instruction: { type: 'arrive' } },
    ] }] });
    expect(e).toHaveLength(2);
    expect(e[0]).toEqual({ texte: 'Départ', voie: 'Pont de Sevres', distance: 0, manoeuvre: 'straight' });
    expect(e[1]).toEqual({ texte: 'Vous êtes arrivé', voie: '', distance: 0, manoeuvre: 'arrivee' });
  });
});

describe('etapesItineraire (fetch simulé)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  const CORPS_OK = JSON.stringify({ portions: [{ steps: [
    { instruction: { type: 'depart', modifier: 'left' }, distance: 10,
      attributes: { name: { nom_1_gauche: 'R DE RIVOLI', cpx_numero: '', cpx_toponyme: '' } } },
    { instruction: { type: 'arrive' }, distance: 0,
      attributes: { name: { nom_1_gauche: '', cpx_numero: '', cpx_toponyme: '' } } },
  ] }] });
  const A = { lon: 2.3522, lat: 48.8566 };
  const B = { lon: 4.8357, lat: 45.764 };

  test('l’URL fige getSteps, waysAttributes=name et le profil demandé', async () => {
    const appels: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      appels.push(url);
      return new Response(CORPS_OK, { status: 200 });
    }));
    const e = await etapesItineraire(A, B, 'pedestrian');
    expect(e).toHaveLength(2);
    expect(appels).toHaveLength(1);
    expect(appels[0]).toContain('getSteps=true');
    expect(appels[0]).toContain('waysAttributes=name');
    expect(appels[0]).toContain('profile=pedestrian');
    expect(appels[0]).toContain('start=2.3522,48.8566');
  });

  test('une panne réseau se rejoue UNE fois, puis parle français', async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => { throw new TypeError('failed to fetch'); });
    vi.stubGlobal('fetch', f);
    const promesse = etapesItineraire(A, B, 'car').catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const erreur = await promesse;
    expect(f).toHaveBeenCalledTimes(2);
    expect(erreur).toBeInstanceOf(ErreurFeuille);
    expect((erreur as Error).message).toContain('momentanément indisponible');
  });

  test('le 404 est une réponse : aucune reprise, message dédié', async () => {
    const f = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', f);
    await expect(etapesItineraire(A, B, 'car')).rejects.toThrow('Aucun itinéraire trouvé');
    expect(f).toHaveBeenCalledTimes(1);
  });

  test('une réponse 200 difforme ne consomme pas de seconde requête', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await expect(etapesItineraire(A, B, 'car')).rejects.toThrow('étapes exploitables');
    expect(f).toHaveBeenCalledTimes(1);
  });
});

/* LA MANŒUVRE À DESSINER — la flèche du suivi (PR C du cadrage navigation
   mobile). La phrase reste la vérité ; ceci ne décide que du dessin. */
describe('manoeuvreDe', () => {
  test('les huit directions passent telles quelles', () => {
    expect(manoeuvreDe({ type: 'turn', modifier: 'right' })).toBe('right');
    expect(manoeuvreDe({ type: 'turn', modifier: 'sharp left' })).toBe('sharp left');
    expect(manoeuvreDe({ type: 'turn', modifier: 'uturn' })).toBe('uturn');
  });

  test('rond-point et arrivée ont leur propre glyphe, quel que soit le modifier', () => {
    expect(manoeuvreDe({ type: 'roundabout', modifier: 'right' })).toBe('rond-point');
    expect(manoeuvreDe({ type: 'rotary' })).toBe('rond-point');
    expect(manoeuvreDe({ type: 'arrive' })).toBe('arrivee');
  });

  test('un code inconnu retombe sur tout droit — jamais une flèche au hasard', () => {
    expect(manoeuvreDe({ type: 'continue', modifier: 'sideways' })).toBe('straight');
    expect(manoeuvreDe({})).toBe('straight');
  });
});
