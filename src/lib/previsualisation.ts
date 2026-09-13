/* L'ENVIRONNEMENT DE PRÉVISUALISATION (STAGING-1, 13/09/2026).
   ------------------------------------------------------------------
   POURQUOI CE FICHIER EXISTE. La branche `staging` est déployée sur une URL
   publique pour que le CEO et les testeurs de l'AFUVE essaient l'application
   sur un vrai téléphone, sans tunnel depuis un poste de développement. Deux
   dangers viennent avec cette URL, et ce module les traite tous les deux :

   1. QU'UN TESTEUR CROIE ÊTRE EN PRODUCTION. Un bogue signalé « sur le site »
      alors qu'il vient d'une préversion fait perdre le bénéfice du retour :
      on cherche en production un défaut qui n'y est pas, ou on corrige deux
      fois. La préversion se DIT donc, sur chaque page, et elle le dit avant
      le JavaScript — le marquage est posé dans le HTML à la construction.
   2. QUE LA PRÉVERSION SOIT INDEXÉE. Une URL de préversion qui remonte dans
      les résultats de recherche à trois semaines du Mondial de l'Auto est un
      dégât lent à réparer. D'où DEUX verrous côté serveur, et non un : le
      fichier `robots.txt` (que respecte un robot qui vient le lire) ET
      l'en-tête `X-Robots-Tag` (qui s'applique même à une URL atteinte par un
      lien fuité, sans passage par `robots.txt`), plus une balise `meta` dans
      chaque page. Le fichier seul ne suffit pas.

   POURQUOI DES FONCTIONS PURES DANS `src/lib/`. Elles sont appelées par
   `vite.config.ts` au moment de la construction — comme `tuiles-en-cache.ts`
   — et elles sont testées par Vitest sans lancer ni navigateur ni build. Un
   marquage qu'on ne peut pas tester est un marquage dont on découvre l'absence
   en production. */

/** Valeur attendue dans `INFONOVICE_ENVIRONNEMENT` pour bâtir une préversion. */
export const ENVIRONNEMENT_PREVISUALISATION = 'previsualisation';

/** Le mot qui doit sauter aux yeux, repris à l'identique partout. */
export const MENTION_PREVISUALISATION = 'PRÉVISUALISATION';

/** Ce qui précède le titre de chaque page (onglet, favori, capture d'écran). */
export const PREFIXE_TITRE = `${MENTION_PREVISUALISATION} — `;

/** La phrase du bandeau. Elle nomme ce que le site N'EST PAS : c'est cela
    qu'un testeur doit retenir, pas le nom de la branche. */
export const PHRASE_BANDEAU = `${MENTION_PREVISUALISATION} — ce site n’est pas la production`;

/** Nom du fichier de style émis à côté des pages, et lié depuis chacune. */
export const FICHIER_FEUILLE = 'previsualisation.css';

/* LA PLACE QUE LE BANDEAU PREND, IL LA RÉSERVE — ET C'EST MESURÉ.
   Premier jet : la pastille était posée à `bottom: 0` et recouvrait, sur un
   écran de 390 px, l'attribution MapLibre (x 356, y 810) et l'échelle
   (x 10, y 812). Relevé au navigateur avant d'écrire ces lignes. Cacher
   l'attribution des données IGN et OSM n'est pas une coquetterie d'affichage :
   c'est la mention que ces licences imposent.
   LA BONNE PRISE EXISTAIT DÉJÀ : `--sur-barre-basse` est la variable par
   laquelle toute l'application réserve le bas de l'écran (barre système,
   encoche). Le bandeau s'y ajoute au lieu de se poser par-dessus : contrôles
   MapLibre, pied de carte, volets et bandeaux remontent tous ensemble, sans
   qu'une seule règle les nomme un par un. Après correction, mesuré à nouveau :
   attribution à y 780, échelle à y 782, pastille à y 817 — plus aucun
   recouvrement. Sur les pages de texte, c'est un simple `padding-bottom`.
   30 px = 24 px de pastille + 4 px de liseré + 2 px d'air. */
export const RESERVE_BANDEAU_PX = 30;

/* UNE FEUILLE DE STYLE, ET SURTOUT PAS DU STYLE EN LIGNE — CORRIGÉ APRÈS
   CAPTURE D'ÉCRAN. Le premier jet portait tout en attributs `style=`. Sur
   index.html cela marchait (`style-src 'self' 'unsafe-inline'`), mais les six
   pages de texte ont une CSP PLUS STRICTE — `style-src 'self'` — et le
   navigateur a purement et simplement jeté le bandeau : la phrase s'affichait
   en haut à gauche, en texte nu, sans liseré. Une préversion dont le marquage
   ne tient que sur une page sur sept ne remplit pas son office.
   ON NE TOUCHE PAS À LA CSP DES PAGES pour faire passer un bandeau : une
   feuille servie par le même domaine est autorisée par `'self'`, et c'est la
   solution qui ne coûte rien à la sécurité.
   LE CHEMIN EST RELATIF, comme les icônes du manifeste : il suit la base du
   site sans qu'on le retouche si le site repassait un jour sous un
   sous-chemin. */
export const FEUILLE_PREVISUALISATION = `/* Infonovice Maps — marquage de PRÉVISUALISATION (STAGING-1).
   Ce fichier n'existe QUE dans la construction de préversion. */

/* Le bandeau réserve sa place au lieu de la prendre : toute l'application
   lit déjà cette variable pour se tenir au-dessus de la barre système.
   \`html:root\` ET NON \`:root\` — MESURÉ, PAS SUPPOSÉ. Avec \`:root\` (même
   spécificité que tokens.css), la règle qui l'emporte est la DERNIÈRE du
   document : sur les pages de texte la nôtre gagnait, sur index.html elle
   perdait, et l'attribution MapLibre repassait sous la pastille. Un point de
   spécificité de plus met fin au débat, quel que soit l'ordre d'injection des
   feuilles — et l'ordre d'injection, lui, dépend de Vite. */
html:root { --sur-barre-basse: calc(env(safe-area-inset-bottom, 0px) + ${RESERVE_BANDEAU_PX}px); }

/* Les pages de texte défilent : on leur ajoute la même réserve en bas, sinon
   la pastille recouvrirait la dernière ligne. */
body.page { padding-bottom: ${RESERVE_BANDEAU_PX}px; }

/* UN CADRE PLUTÔT QU'UNE BARRE EN HAUT : une barre horizontale en haut
   recouvrirait la barre de recherche, qui est le plus grand élément peint de
   la page et le premier geste de l'usager. Un liseré de 4 px sur les quatre
   bords se voit d'un coup d'œil sans rien masquer.
   \`pointer-events: none\` : le marquage ne doit JAMAIS intercepter un clic, un
   geste de carte ou une tabulation. Vérifié au navigateur —
   \`elementFromPoint\` au centre de la pastille rend le canevas de la carte. */
.previsualisation-cadre {
  position: fixed; inset: 0;
  border: 4px solid #FFB300;
  pointer-events: none;
  z-index: 2147483000;
}

/* Ambre sur presque noir : contraste très au-delà du AA exigé par le projet,
   et la même couleur d'accent que la marque. */
.previsualisation-pastille {
  position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
  max-width: calc(100% - 8px); box-sizing: border-box; overflow: hidden;
  margin: 0; padding: 2px 10px; border-radius: 6px 6px 0 0;
  background: #FFB300; color: #1A1200;
  font: 700 13px/1.5 system-ui, -apple-system, sans-serif;
  letter-spacing: .03em; white-space: nowrap; text-overflow: ellipsis;
}
`;

/* LA CONSTRUCTION NE DEVINE PAS L'ENVIRONNEMENT, ON LE LUI DIT. Pas de
   déduction depuis le nom de la branche ni depuis une variable de GitHub
   Actions : une variable explicite se lit, se journalise, et se reproduit à
   l'identique sur un poste de développement (`INFONOVICE_ENVIRONNEMENT=
   previsualisation npm run build`). */
export function estPrevisualisation(env: Record<string, string | undefined>): boolean {
  return (env.INFONOVICE_ENVIRONNEMENT ?? '').trim().toLowerCase() === ENVIRONNEMENT_PREVISUALISATION;
}

/* LE `robots.txt` DE LA PRÉVERSION. Il remplace celui de `public/`, qui ouvre
   tout et annonce le sitemap de la production. Aucune ligne `Sitemap:` ici :
   on n'offre pas une carte du site qu'on demande de ne pas lire.

   LA LIMITE, ÉCRITE PLUTÔT QUE TUE (revue Codex, 13/09). `Disallow: /` et
   `noindex` se gênent l'un l'autre, et c'est documenté par Google : un robot
   qui n'a pas le droit d'EXPLORER une URL ne lit ni sa balise `robots` ni son
   en-tête `X-Robots-Tag`. Si un lien fuite, l'URL peut donc apparaître en
   résultat « nu » — sans titre ni extrait, mais présente.
   ON GARDE QUAND MÊME LES DEUX, et c'est un choix : la consigne du CEO demande
   les deux, les robots qui ignorent `robots.txt` (ils existent) butent alors
   sur l'en-tête, et un résultat sans titre ni extrait vaut mieux qu'une page
   de préversion indexée en entier.
   LE VRAI REMÈDE N'EST PAS UN FICHIER, c'est une porte — mais elle n'est PAS
   posable aujourd'hui : la cible est `maps-staging.pages.dev`, et la
   documentation Cloudflare dit que la politique d'accès des déploiements de
   préversion ne couvre ni le `*.pages.dev` du projet ni un domaine
   personnalisé. Une application Access, elle, exige un nom d'hôte d'une zone
   de NOTRE compte : `pages.dev` n'en est pas une. La porte redevient possible
   le jour où `maps-staging.infonovice.fr` existe — décision du CEO, écrite
   comme telle dans docs/DEPLOIEMENT.md §3 et §4 bis. D'ici là, les trois
   filets sont tout ce qu'il y a, et c'est pour cela qu'on n'en retire aucun. */
export const ROBOTS_PREVISUALISATION = `# Infonovice Maps — PRÉVISUALISATION.
# Rien de ce qui vit ici ne doit être indexé : la production est sur
# https://maps.infonovice.fr/ et c'est elle qui porte le robots.txt ouvert.
User-agent: *
Disallow: /
`;

/* LE SECOND VERROU, CÔTÉ SERVEUR. Format `_headers` de Cloudflare Pages :
   une ligne de motif d'URL, puis les en-têtes indentés. `/*` couvre le domaine
   personnalisé ET les URL `*.pages.dev` de chaque déploiement, qui sont
   publiques elles aussi et que personne ne pense à protéger.
   `noarchive` en plus de `noindex` : sans lui, un moteur peut continuer à
   servir une copie en cache d'une page vue avant la consigne. */
export const ENTETES_PREVISUALISATION = `# Infonovice Maps — PRÉVISUALISATION (voir docs/DEPLOIEMENT.md).
# Ce fichier est lu par Cloudflare Pages, il n'est pas servi comme une page.
/*
  X-Robots-Tag: noindex, nofollow, noarchive
`;

/* PAS D'`aria-hidden` : un usager de lecteur d'écran a le même droit de savoir
   qu'il n'est pas en production. Pas d'`aria-live` non plus : le texte est là
   au chargement, il n'a rien à annoncer plus tard. */
export const BANDEAU_PREVISUALISATION =
  '<div class="previsualisation-cadre" data-previsualisation="cadre">' +
  `<p class="previsualisation-pastille">${PHRASE_BANDEAU}</p>` +
  '</div>';

/** La balise `robots` posée dans chaque page. Troisième filet, côté HTML :
    il suit la page si elle est copiée ailleurs, là où ni `robots.txt` ni
    l'en-tête ne la suivraient. */
export const META_ROBOTS_PREVISUALISATION =
  '<meta name="robots" content="noindex, nofollow, noarchive">';

/** Le lien vers la feuille, en chemin relatif (voir FEUILLE_PREVISUALISATION). */
export const LIEN_FEUILLE_PREVISUALISATION =
  `<link rel="stylesheet" href="${FICHIER_FEUILLE}">`;

/* LA PRÉVERSION DOIT AUSSI SE DIRE QUAND ON PARTAGE SON LIEN (défaut trouvé
   par le vérificateur indépendant, 13/09).
   Le marquage ci-dessus se voit quand on OUVRE la page. Mais les sept pages
   portent des métadonnées qui affirment, en toutes lettres, être la
   production : `<link rel="canonical" href="https://maps.infonovice.fr/">`,
   `<meta property="og:url">` sur le même hôte, et un bloc JSON-LD dont le
   champ `url` désigne la production. Un testeur de l'AFUVE qui colle l'URL de
   préversion dans une messagerie produit donc une vignette qui annonce le site
   de production : le destinataire croit voir la production, et c'est
   exactement le dégât n° 1 que ce module existe pour empêcher — déplacé du
   navigateur vers la messagerie.
   CE QU'ON FAIT, ET POURQUOI CHAQUE GESTE :
   - `canonical` RETIRÉ. Une préversion n'a pas de version canonique d'
     elle-même, et désigner la production reviendrait à demander à un moteur de
     créditer la production pour une page qui n'est pas elle.
   - `og:url` RETIRÉ, et non réécrit : l'URL de déploiement n'est pas connue à
     la construction (elle dépend du projet Cloudflare). Absent, le lecteur de
     vignette retombe sur l'URL RÉELLEMENT partagée — qui, elle, est vraie.
   - `og:title` et `og:site_name` PRÉFIXÉS. C'est la ligne que lit un humain
     dans la vignette ; sans elle, le titre de la vignette est celui de la
     production mot pour mot.
   - le bloc JSON-LD RETIRÉ. Chacun de ses champs est une affirmation lisible
     par une machine à propos de la production, et une préversion qu'on demande
     de ne pas indexer n'a aucun usage pour des données structurées.
   CE QU'ON NE TOUCHE PAS : `og:image`, qui reste l'image de partage servie par
   la production. C'est le même dessin, ce n'est pas une affirmation d'être la
   production, et la préversion n'a pas d'image à elle. */
const RETRAITS_PARTAGE: readonly RegExp[] = [
  /[ \t]*<link[^>]+rel="canonical"[^>]*>\r?\n?/gi,
  /[ \t]*<meta[^>]+property="og:url"[^>]*>\r?\n?/gi,
  /[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>\r?\n?/gi,
];

export function neutraliserMetadonneesProduction(html: string): string {
  let sortie = html;
  for (const motif of RETRAITS_PARTAGE) sortie = sortie.replace(motif, '');
  return sortie
    .replace(/(<meta[^>]+property="og:title"[^>]+content=")/gi, `$1${PREFIXE_TITRE}`)
    .replace(
      /(<meta[^>]+property="og:site_name"[^>]+content="[^"]*)"/gi,
      `$1 — ${MENTION_PREVISUALISATION}"`,
    );
}

/* PAS DE REPLI SILENCIEUX (même règle que la version dans `vite.config.ts`) :
   une page sans `<head>`, sans `<body>` ou sans `<title>` ARRÊTE la
   construction. Le contraire — déployer une page non marquée en écrivant un
   avertissement que personne ne lit — est exactement le scénario qu'on veut
   rendre impossible. */
export function marquerHtmlPrevisualisation(html: string, nomPage: string): string {
  if (html.includes('data-previsualisation="cadre"')) return html; // déjà marqué

  const tete = /<head(\s[^>]*)?>/i;
  const finTete = /<\/head>/i;
  const corps = /<body(\s[^>]*)?>/i;
  const titre = /<title>([\s\S]*?)<\/title>/i;
  for (const [quoi, motif] of [
    ['<head>', tete], ['</head>', finTete], ['<body>', corps], ['<title>', titre],
  ] as const) {
    if (!motif.test(html)) {
      throw new Error(`previsualisation : ${quoi} introuvable dans ${nomPage}`);
    }
  }

  return neutraliserMetadonneesProduction(html)
    /* L'ATTRIBUT SUR <html> EST LE POINT D'ANCRAGE DES TESTS. Un parcours E2E
       ou une sonde de la CI l'interroge sans dépendre de la mise en forme du
       bandeau, qui, elle, a le droit de changer. */
    .replace(/<html(\s[^>]*)?>/i, (balise) =>
      balise.replace(/>$/, ` data-environnement="${ENVIRONNEMENT_PREVISUALISATION}">`))
    .replace(tete, (balise) => `${balise}\n  ${META_ROBOTS_PREVISUALISATION}`)
    /* LA FEUILLE EN DERNIER DANS LE <head>, et pas juste après son ouverture :
       Vite y injecte les feuilles de l'application, et une règle de même
       spécificité perd contre celle qui vient après elle. Ceinture (ici) et
       bretelles (`html:root` dans la feuille) : ni l'une ni l'autre ne suffit
       à elle seule à rendre le résultat indifférent à l'ordre d'injection. */
    .replace(finTete, `  ${LIEN_FEUILLE_PREVISUALISATION}\n</head>`)
    .replace(titre, (_t, texte: string) => `<title>${PREFIXE_TITRE}${texte.trim()}</title>`)
    .replace(corps, (balise) => `${balise}\n${BANDEAU_PREVISUALISATION}`);
}
