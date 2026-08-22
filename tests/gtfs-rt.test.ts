// Le décodeur GTFS-RT, éprouvé sur du RÉEL et sur de l'hostile.
//
// Les deux premiers cas sont des captures authentiques, relevées le
// 22/08/2026 à 03 h 57 (heure de Paris) sur le proxy CORS de
// transport.data.gouv.fr — d'où leur petite taille : à cette heure-là, deux
// bus roulaient dans toute la France proxifiée. Elles sont en base64 plutôt
// qu'en fichiers binaires : on peut les relire, les commenter, et voir en
// revue ce qu'elles contiennent.
//
// Les cas suivants sont FABRIQUÉS avec un mini-encodeur local, parce qu'un
// flux public ne fournit jamais les octets tordus qui font tomber un
// décodeur : varint sans fin, longueur mensongère, champ de type inconnu.
import { describe, expect, it } from 'vitest';
import {
  decoderFlux, ErreurTransports, PLAFOND_OCTETS, PLAFOND_VEHICULES,
} from '../src/lib/gtfs-rt';

/** Aléop (Pays de la Loire) — ligne 206, Malicorne-sur-Sarthe. */
const ALEOP = 'Cg0KAzIuMBAAGI+EpNQGEosBChFSVFZQOlQ6MjY0NDM3NzQwMiJ2Ch0KCjI2NDQzNzc0MDIaCDIwMj'
  + 'YwODIxKgMyMDYwARIUDUFBP0IVanOyvR0VfJTBLfrTzTwYDyAAKIeEpNQGOgs3Mk1BTEltYWlyUkIoChA3ZmIx'
  + 'OTNlMDU4MWIzNDZlEhRNYWxpY29ybmUtc3VyLVNhcnRoZQ==';
/** Divia (Dijon Métropole) — véhicule 3631, ligne 4-93. */
const DIVIA = 'Cg0KAzIuMBAAGJKEpNQGElsKBDM2MzEiUwocChAyMS05My0xLUEtMDM1NTAwIAAqBDQtOTMwABIUDY9'
  + 'EPUIVcmSiQB0AgKFDLQAAiEEgAiiGhKTUBjoHNC0xMDA2NEIMCgQzNjMxEgQzNjMx';

const depuisBase64 = (b: string): Uint8Array =>
  Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

/* ---- Mini-encodeur, pour fabriquer l'hostile ---- */

const varint = (n: number): number[] => {
  const o: number[] = [];
  let v = n;
  do { const c = v % 128; v = Math.floor(v / 128); o.push(v > 0 ? c | 0x80 : c); } while (v > 0);
  return o;
};
const cle = (numero: number, type: number): number[] => varint(numero * 8 + type);
const bloc = (numero: number, contenu: number[]): number[] =>
  [...cle(numero, 2), ...varint(contenu.length), ...contenu];
const texte = (numero: number, s: string): number[] =>
  bloc(numero, [...new TextEncoder().encode(s)]);
const flottant = (numero: number, v: number): number[] => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, v, true);
  return [...cle(numero, 5), ...b];
};
const position = (lat: number, lon: number): number[] =>
  bloc(2, [...flottant(1, lat), ...flottant(2, lon)]);
const entite = (id: string, corps: number[]): number[] =>
  bloc(2, [...texte(1, id), ...bloc(4, corps)]);
const entete = (horodate: number): number[] =>
  bloc(1, [...texte(1, '2.0'), ...cle(3, 0), ...varint(horodate)]);

describe('décodeur GTFS-RT — sur des flux réels', () => {
  it('lit la position, la ligne et l’étiquette d’un bus Aléop', () => {
    const f = decoderFlux(depuisBase64(ALEOP));
    expect(f.vehicules).toHaveLength(1);
    const v = f.vehicules[0]!;
    expect(v.id).toBe('RTVP:T:2644377402');
    expect(v.lat).toBeCloseTo(47.8137, 3);
    expect(v.lon).toBeCloseTo(-0.0871, 3);
    expect(v.ligne).toBe('206');
    expect(v.etiquette).toBe('Malicorne-sur-Sarthe');
    // 22/08/2026 01:57 UTC — l'horodate de l'en-tête et celle du véhicule.
    expect(f.horodate).toBeGreaterThan(1_787_000_000);
    expect(v.horodate).toBeGreaterThan(1_787_000_000);
    expect(f.tronque).toBe(false);
  });

  it('lit un véhicule Divia avec son cap et sa vitesse', () => {
    const f = decoderFlux(depuisBase64(DIVIA));
    expect(f.vehicules).toHaveLength(1);
    const v = f.vehicules[0]!;
    expect(v.lat).toBeCloseTo(47.3170, 3);
    expect(v.lon).toBeCloseTo(5.0748, 3);
    expect(v.ligne).toBe('4-93');
    expect(v.cap).toBeCloseTo(323, 0);
    expect(v.vitesse).toBeCloseTo(17, 0);
    expect(v.etiquette).toBe('3631');
  });

  it('accepte un flux vide — la nuit, les bus dorment', () => {
    const f = decoderFlux(depuisBase64(ALEOP).subarray(0, 15));
    expect(f.vehicules).toEqual([]);
    expect(f.horodate).toBeGreaterThan(1_787_000_000);
  });
});

describe('décodeur GTFS-RT — sur des octets hostiles', () => {
  it('refuse un varint de plus de dix octets, AVANT la fin du flux', () => {
    /* Douze octets à bit de continuation levé, suivis d'un flux parfaitement
       valide : sans la borne à dix octets, le décodeur avalerait le tout et
       `facteur` finirait à l'infini. La borne doit se déclencher d'elle-même,
       pas parce que les octets viennent à manquer — d'où le message exigé. */
    const octets = new Uint8Array([
      ...new Array<number>(12).fill(0xff), 0x00,
      ...entete(1_787_000_000),
      ...entite('bus-1', position(48.85, 2.35)),
    ]);
    expect(() => decoderFlux(octets)).toThrow(/hors bornes/);
  });

  it('refuse un flux tronqué en plein message', () => {
    const complet = new Uint8Array([
      ...entete(1_787_000_000),
      ...entite('bus-1', position(48.85, 2.35)),
    ]);
    expect(() => decoderFlux(complet.subarray(0, complet.length - 3)))
      .toThrow(ErreurTransports);
  });

  it('refuse une longueur qui dépasse le flux', () => {
    // Un bloc annoncé à 9000 octets dans un message qui en compte dix.
    const octets = new Uint8Array([...cle(2, 2), ...varint(9000), 1, 2, 3]);
    expect(() => decoderFlux(octets)).toThrow(ErreurTransports);
  });

  it('refuse un champ de type inconnu au lieu de deviner', () => {
    /* Le message est exigé, et pas seulement le type d'erreur : un « saut »
       qui n'avance pas relit indéfiniment la même clé. Sans cette exigence,
       remplacer le refus par un simple retour laissait la suite verte —
       vérifié par mutation — alors que le décodeur pouvait tourner en rond. */
    const octets = new Uint8Array([...cle(3, 6), 1, 2, 3]);
    expect(() => decoderFlux(octets)).toThrow(/type inconnu/);
  });

  it('refuse le champ 0, que la spécification interdit', () => {
    expect(() => decoderFlux(new Uint8Array([0x00, 0x01]))).toThrow(ErreurTransports);
  });

  it('refuse un flux anormalement volumineux sans même le lire', () => {
    const enorme = { length: PLAFOND_OCTETS + 1 } as unknown as Uint8Array;
    expect(() => decoderFlux(enorme)).toThrow(/volumineux/);
  });

  it('saute les champs qu’il ne connaît pas sans perdre le fil', () => {
    // Des champs inconnus AVANT, ENTRE et APRÈS ce qui nous intéresse.
    const octets = new Uint8Array([
      ...cle(9, 0), ...varint(12345),
      ...entete(1_787_000_000),
      ...texte(7, 'rembourrage'),
      ...entite('bus-1', [...position(48.85, 2.35), ...bloc(1, texte(5, 'C1'))]),
      ...cle(12, 5), 0, 0, 0, 0,
    ]);
    const f = decoderFlux(octets);
    expect(f.vehicules).toHaveLength(1);
    expect(f.vehicules[0]!.ligne).toBe('C1');
    expect(f.vehicules[0]!.lat).toBeCloseTo(48.85, 2);
  });
});

describe('décodeur GTFS-RT — ce qu’il refuse d’afficher', () => {
  it('écarte le point (0, 0), qui n’a jamais transporté personne', () => {
    const octets = new Uint8Array([
      ...entete(1_787_000_000),
      ...entite('au-depot', position(0, 0)),
      ...entite('en-ligne', position(48.85, 2.35)),
    ]);
    const f = decoderFlux(octets);
    expect(f.vehicules.map((v) => v.id)).toEqual(['en-ligne']);
  });

  it('écarte une entité sans position du tout', () => {
    const octets = new Uint8Array([
      ...entete(1_787_000_000),
      ...entite('sans-gps', bloc(1, texte(5, '42'))),
    ]);
    expect(decoderFlux(octets).vehicules).toEqual([]);
  });

  it('écarte des coordonnées hors du globe', () => {
    const octets = new Uint8Array([
      ...entete(1_787_000_000),
      ...entite('mars', position(91.5, 200)),
    ]);
    expect(decoderFlux(octets).vehicules).toEqual([]);
  });

  it('s’arrête au plafond de véhicules et le DIT', () => {
    const corps: number[] = [...entete(1_787_000_000)];
    for (let i = 0; i < PLAFOND_VEHICULES + 25; i += 1) {
      corps.push(...entite(`bus-${i}`, position(48.85, 2.35)));
    }
    const f = decoderFlux(new Uint8Array(corps));
    expect(f.vehicules).toHaveLength(PLAFOND_VEHICULES);
    expect(f.tronque).toBe(true);
  });
});
