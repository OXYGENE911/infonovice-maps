import { describe, it, expect } from 'vitest';
import { choisirVoix } from '../src/carte/voix';

/* LE CHOIX DE LA VOIX (VOIX-1, 30/08). Ce qui se teste à sec, c'est la
 * RÈGLE DE SOUVERAINETÉ : une voix de serveur enverrait chaque phrase — donc
 * chaque rue et chaque sortie de l'usager — à l'éditeur du navigateur. Le
 * projet promet que rien ne quitte l'appareil. */

const voix = (lang: string, name: string, localService: boolean) =>
  ({ lang, name, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

describe('choisirVoix', () => {
  it('préfère une voix LOCALE à une voix de serveur, même mieux placée', () => {
    const choisie = choisirVoix([
      voix('fr-FR', 'Serveur premium', false),
      voix('fr-FR', 'Locale', true),
    ]);
    expect(choisie?.name).toBe('Locale');
  });

  it('accepte les autres français : fr-CA, fr-BE valent mieux que rien', () => {
    expect(choisirVoix([voix('fr-CA', 'Canada', true)])?.name).toBe('Canada');
  });

  it('se rabat sur une voix distante quand l’appareil n’en a pas d’autre', () => {
    /* Se taire serait pire : l'usager a demandé la voix, et la page « Vie
       privée » dit ce qu'il en est. */
    expect(choisirVoix([voix('fr-FR', 'Distante', false)])?.name).toBe('Distante');
  });

  it('REFUSE une voix qui ne parle pas français', () => {
    expect(choisirVoix([voix('en-US', 'Anglaise', true)])).toBeNull();
    expect(choisirVoix([])).toBeNull();
  });
});
