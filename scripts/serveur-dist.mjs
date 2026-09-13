/* LE SERVEUR DE LA SONDE — port dédié, aucun cache, et l'empreinte de TOUT ce
 * qui sort (SONDE-VRAIE-1, 13/09/2026).
 *
 * EXTRAIT DE LA SONDE POUR POUVOIR ÊTRE ÉPROUVÉ. Le contrôle « servi contre
 * dist/ » est le troisième piège déjà payé, et la contre-mesure du 13/09 a
 * montré qu'il ne regardait pas le fichier qui compte. Tant qu'il vivait dans
 * le corps de la sonde, il ne pouvait être essayé qu'en lançant une campagne —
 * or la garde de charge refuse de mesurer sur ce poste. Ici, il s'essaie avec
 * `fetch`, sur les vrais octets de `dist/`, sans navigateur et sans campagne.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

export const empreinte = (octets) => createHash('sha256').update(octets).digest('hex').slice(0, 16);

/**
 * Sert `dist/` sur un port dédié et tient le registre des empreintes servies.
 *
 * @param {string} dist  racine servie
 * @param {?string} divergenceSur  motif de chemin dont les octets seront
 *   ALTÉRÉS à la volée — l'essai qui montre que le contrôle mord. Ce n'est pas
 *   une porte dérobée : c'est le seul moyen de voir se déclencher une garde
 *   qu'on ne verrait sinon jamais, et elle est passée explicitement par
 *   `--essai-divergence=…` sur la ligne de commande.
 */
export async function servirDist(dist, divergenceSur = null) {
  const servi = new Map();
  const serveur = createServer((req, res) => {
    const chemin = decodeURIComponent(req.url.split('?')[0]);
    const fichier = chemin === '/' ? join(dist, 'index.html') : join(dist, chemin);
    if (!fichier.startsWith(dist) || !existsSync(fichier)) {
      res.writeHead(404); res.end('non trouvé'); return;
    }
    let octets = readFileSync(fichier);
    if (divergenceSur && chemin.includes(divergenceSur)) {
      /* UN COMMENTAIRE AJOUTÉ EN QUEUE : le fichier reste du JavaScript
         valide, donc la page continue de fonctionner. On éprouve le CONTRÔLE,
         pas la résistance du navigateur à un fichier cassé. */
      octets = Buffer.concat([octets, Buffer.from('\n/*essai de divergence*/\n')]);
    }
    if (chemin.startsWith('/assets/')) servi.set(chemin, empreinte(octets));
    /* AUCUN CACHE : le contexte est déjà neuf, mais on ne laisse pas un
       en-tête décider à notre place de ce que le navigateur relit. */
    res.writeHead(200, {
      'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream',
      'cache-control': 'no-store, max-age=0',
    });
    res.end(octets);
  });
  const port = 41000 + Math.floor(Math.random() * 3000);
  await new Promise((ok, ko) => { serveur.once('error', ko); serveur.listen(port, '127.0.0.1', ok); });
  return {
    port,
    servi,
    fermer: () => new Promise((ok) => { serveur.close(ok); }),
  };
}
