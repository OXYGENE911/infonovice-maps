// Digital Asset Links : le fichier qui fait la difference entre une
// application et un onglet Chrome deguise.
//
// Une Trusted Web Activity n'a le droit de masquer la barre d'adresse que si
// le domaine declare, publiquement, qu'il autorise CETTE application signee par
// CETTE cle a parler en son nom. La declaration vit dans
// /.well-known/assetlinks.json. Si elle manque, si le paquet ne correspond pas,
// ou si l'empreinte est fausse, Chrome ne bloque rien : il ouvre simplement un
// onglet avec la barre d'adresse visible. La panne est donc silencieuse et ne
// se voit qu'a l'oeil, sur un telephone. D'ou ce test.
//
// DEUX EMPREINTES A TERME, PAS UNE. Aujourd'hui le fichier ne porte que la cle
// d'envoi d'Armelin, celle qui signe les APK installes a la main pour les
// essais. Des le premier envoi sur le Play Store, Google re-signe l'application
// avec SA propre cle (Play App Signing) et l'empreinte ci-dessous ne
// correspondra plus a ce que les utilisateurs installent. Il faudra AJOUTER
// l'empreinte lue dans la Play Console (Release > Setup > App Integrity) sans
// retirer celle-ci : la documentation Chrome recommande de lister les deux, ce
// qui garde les installations manuelles fonctionnelles.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const CHEMIN = 'public/.well-known/assetlinks.json';
const PAQUET = 'fr.infonovice.maps';

// Empreinte SHA-256 du certificat de la cle d'envoi, relevee le 18/09/2026 par
// `apksigner verify --print-certs app-release-signed.apk`. Ce n'est pas un
// secret : c'est l'empreinte d'un certificat public embarque dans chaque APK.
const EMPREINTE_ENVOI =
  'A3:56:CD:41:75:5A:59:4E:39:9F:29:C4:55:5B:FE:A7:4E:5C:25:D9:9B:FA:74:E6:C2:1F:BE:33:17:B3:A5:6A';

// LE .nojekyll EST AUSSI OBLIGATOIRE, ET C'EST LE PIEGE LE PLUS COUTEUX.
// maps.infonovice.fr est servi par GitHub Pages. Sans un fichier `.nojekyll` a
// la racine du site, Pages passe le dossier dans son filtre Jekyll, qui ECARTE
// SILENCIEUSEMENT tout chemin commencant par un point. Le deploiement reussit,
// le journal d'action est vert, et `/.well-known/assetlinks.json` repond 404.
// Mesure du 18/09/2026 : deploiement "success" en 40 s, puis 404 sur le fichier
// et `ERROR_CODE_FETCH_ERROR` cote API Google. Le test ci-dessous existe pour
// que personne ne reperde cette demi-heure.
describe('.nojekyll', () => {
  it('existe, sinon GitHub Pages n exposera jamais /.well-known/', () => {
    expect(existsSync('public/.nojekyll')).toBe(true);
  });
});

// ET LE WORKFLOW DOIT DEMANDER LES FICHIERS CACHES.
// `actions/upload-pages-artifact` empaquette par defaut avec
// `tar --exclude=.[^/]*` : tout chemin commencant par un point a la racine du
// site est jete, /.well-known/ compris, sans rien dans le journal. Le drapeau
// `include-hidden-files: true` retire cet exclude. Ce test garde le drapeau :
// le supprimer casserait l'application Android sans casser aucun autre test.
describe('workflow de deploiement', () => {
  it('demande include-hidden-files, sinon /.well-known/ est jete a l empaquetage', () => {
    const y = readFileSync('.github/workflows/deploiement.yml', 'utf8');
    expect(y).toMatch(/include-hidden-files:\s*true/);
  });
});

describe('assetlinks.json', () => {
  const doc = JSON.parse(readFileSync(CHEMIN, 'utf8'));

  it('est une liste non vide de declarations', () => {
    expect(Array.isArray(doc)).toBe(true);
    expect(doc.length).toBeGreaterThan(0);
  });

  it('delegue la prise en charge de toutes les URL', () => {
    for (const d of doc) {
      expect(d.relation).toContain('delegate_permission/common.handle_all_urls');
    }
  });

  it('designe le bon paquet Android', () => {
    for (const d of doc) {
      expect(d.target.namespace).toBe('android_app');
      expect(d.target.package_name).toBe(PAQUET);
    }
  });

  it('porte l empreinte de la cle d envoi', () => {
    const toutes = doc.flatMap(
      (d: { target: { sha256_cert_fingerprints: string[] } }) =>
        d.target.sha256_cert_fingerprints,
    );
    expect(toutes).toContain(EMPREINTE_ENVOI);
  });

  it('n a que des empreintes au format attendu', () => {
    // 32 octets en hexadecimal majuscule separes par des deux-points. Une
    // empreinte en minuscules ou sans separateurs est refusee par Chrome sans
    // le moindre message : le format fait partie du contrat.
    const forme = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
    const toutes = doc.flatMap(
      (d: { target: { sha256_cert_fingerprints: string[] } }) =>
        d.target.sha256_cert_fingerprints,
    );
    for (const e of toutes) expect(e).toMatch(forme);
  });
});
