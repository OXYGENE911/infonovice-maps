import { describe, it, expect } from 'vitest';
import { aireADire, phraseAire, PALIER_AIRE_M, MemoireAnnonces } from '../src/lib/annonces';

/* LA VOIX QUI ANNONCE L'AIRE (AIRE-VOIX-1, 09/09/2026).
 *
 * Armelin, au moment où AIRES-1 a été livrée : « la voix pourrait dire "aire
 * dans 2 km" SUR DEMANDE ». Ces deux derniers mots portent tout le dessin, et
 * ce sont eux que ces tests défendent : une autoroute porte une aire tous les
 * dix à vingt kilomètres, et les annoncer toutes ferait de la voix un
 * bavardage qu'on finit par couper — en perdant du même geste les manœuvres,
 * qui sont, elles, une fonction de sécurité.
 */

const AIRES = [
  { id: 'a1', nom: 'Aire de Beaune-Tailly', avancementM: 100_000 },
  { id: 'a2', nom: 'Aire de Mâcon', avancementM: 180_000 },
];

/** Une manœuvre lointaine : rien ne s'oppose à ce qu'on parle. */
const LIBRE = 50_000;

describe('aireADire', () => {
  it('SANS DEMANDE, SILENCE — même à cent mètres de l’aire', () => {
    expect(aireADire(AIRES, 99_900, LIBRE, new Set())).toBeNull();
  });

  it('ne dit QUE l’aire demandée, jamais sa voisine', () => {
    const demandees = new Set(['a2']);
    // On est à deux kilomètres de la PREMIÈRE, qui n'a pas été demandée.
    expect(aireADire(AIRES, 98_500, LIBRE, demandees)).toBeNull();
    // À deux kilomètres de la seconde, qui l'a été.
    expect(aireADire(AIRES, 178_500, LIBRE, demandees)?.id).toBe('a2');
  });

  it('parle à deux kilomètres, pas avant', () => {
    const d = new Set(['a1']);
    expect(aireADire(AIRES, 100_000 - PALIER_AIRE_M - 1, LIBRE, d)).toBeNull();
    expect(aireADire(AIRES, 100_000 - PALIER_AIRE_M, LIBRE, d)?.id).toBe('a1');
  });

  it('se tait une fois l’aire dépassée : la sortie est passée', () => {
    expect(aireADire(AIRES, 100_000, LIBRE, new Set(['a1']))).toBeNull();
    expect(aireADire(AIRES, 100_500, LIBRE, new Set(['a1']))).toBeNull();
  });

  it('LA MANŒUVRE PASSE D’ABORD : on n’annonce pas une aire dans un virage', () => {
    /* Même garde que le trafic et la recharge. Couper une consigne de
       navigation pour signaler des toilettes serait un contresens. */
    expect(aireADire(AIRES, 98_500, 300, new Set(['a1']))).toBeNull();
  });

  it('rend la distance restante, pas la position de l’aire', () => {
    const a = aireADire(AIRES, 98_700, LIBRE, new Set(['a1']));
    expect(a?.distanceM).toBe(1_300);
    expect(a?.avancementM).toBe(100_000);
  });
});

describe('phraseAire', () => {
  it('nomme l’aire, puis dit quand', () => {
    expect(phraseAire({ id: 'a1', nom: 'Aire de Beaune-Tailly', avancementM: 100_000, distanceM: 2_000 }))
      .toBe('Aire de Beaune-Tailly dans 2 kilomètres');
  });

  it('« dans un kilomètre » — une voix qui épelle des décimales fatigue', () => {
    expect(phraseAire({ id: 'a', nom: 'Aire du Poulet', avancementM: 0, distanceM: 1_020 }))
      .toBe('Aire du Poulet dans un kilomètre');
  });

  it('une aire sans nom reste une aire, pas une phrase bancale', () => {
    expect(phraseAire({ id: 'a', nom: '   ', avancementM: 0, distanceM: 800 }))
      .toBe('Aire dans 800 mètres');
  });
});

describe('la mémoire des annonces accueille les aires', () => {
  it('une aire ne se dit pas deux fois', () => {
    const m = new MemoireAnnonces();
    expect(m.aDire(100_000, 'aire')).toBe(true);
    m.noter(100_000, 'aire');
    expect(m.aDire(100_000, 'aire')).toBe(false);
    // Une AUTRE aire, elle, se dit encore.
    expect(m.aDire(180_000, 'aire')).toBe(true);
  });

  it('un nouveau trajet efface tout', () => {
    const m = new MemoireAnnonces();
    m.noter(100_000, 'aire');
    m.vider();
    expect(m.aDire(100_000, 'aire')).toBe(true);
  });
});
