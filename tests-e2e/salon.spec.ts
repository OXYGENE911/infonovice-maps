import { test, expect } from '@playwright/test';

/* LA PAGE DU STAND (SALON-1, 11/09/2026) — voir
 * docs/infonovice-maps/spec-accueil-salon.md §8. On y arrive par le QR du
 * stand ou en tapant l'adresse, jamais par un lien de l'application : ce
 * parcours vérifie qu'elle tient TOUTE SEULE, sans JavaScript, sans
 * origine tierce, sans cookie — comme les six autres pages vitrines. */

test('LA PAGE SALON SE LIT SANS SCRIPT et n’appelle aucun tiers', async ({ browser }) => {
  const contexte = await browser.newContext({ javaScriptEnabled: false });
  const page = await contexte.newPage();

  const scripts: string[] = [];
  const origines = new Set<string>();
  page.on('request', (r) => {
    origines.add(new URL(r.url()).hostname);
    if (r.resourceType() === 'script') scripts.push(r.url());
  });

  const reponse = await page.goto('/salon.html');
  expect(reponse?.status()).toBe(200);

  await expect(page.locator('h1')).toHaveText(
    'La carte française qui planifie votre recharge sans vous suivre.',
  );

  // Le PREMIER bouton d'action ramène à la carte, sans rien installer.
  const boutons = page.locator('a.page-action');
  await expect(boutons.first()).toHaveAttribute('href', '/');

  // Le QR : visible, décrit, et il MÈNE quelque part pour un lecteur d'écran.
  const qr = page.locator('.salon-qr-code');
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute('role', 'img');
  await expect(qr).toHaveAttribute('aria-label', /maps\.infonovice\.fr/);

  // PLACEHOLDER DE LA PR A : PAS de <video> — voir spec §9. La géométrie
  // (960×540) est posée par la balise <img>, pas par un script.
  await expect(page.locator('video')).toHaveCount(0);
  const image = page.locator('.salon-lecteur img');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('width', '960');
  await expect(image).toHaveAttribute('height', '540');

  // AUCUN <form> — cette page interdit l'envoi de formulaire dans sa propre
  // CSP (form-action 'none') ; le contact passe par un mailto:.
  await expect(page.locator('form')).toHaveCount(0);
  const attente = page.locator('#prevenez-moi a.page-action');
  const lienAttente = await attente.getAttribute('href');
  expect(lienAttente, 'le lien de la liste d’attente doit être un mailto: ou un https:')
    .toMatch(/^(mailto:|https:)/);

  await expect(page.locator('.page-retour')).toHaveAttribute('href', '/');

  // ZÉRO script, ZÉRO origine tierce, ZÉRO cookie — la promesse de la CSP,
  // prouvée et non affirmée.
  expect(scripts, `scripts chargés : ${scripts.join(', ')}`).toHaveLength(0);
  expect([...origines].filter((h) => h !== 'localhost'),
    'origine tierce contactée par la page salon').toHaveLength(0);
  expect(await contexte.cookies()).toHaveLength(0);

  await contexte.close();
});

test('CHAQUE BOUTON D’ACTION TIENT LA CIBLE TACTILE (44 px), au pouce, debout', async ({ browser }) => {
  /* La règle d'Armelin : « toute fonction cachée à l'utilisateur est une
     fonction inutilisable » — appliquée ici au stand, où l'on tape avec le
     pouce (accueil.spec.ts l. 1921-1926 fait la même mesure sur /). */
  const contexte = await browser.newContext({ javaScriptEnabled: false });
  const page = await contexte.newPage();
  await page.goto('/salon.html');

  const boutons = page.locator('a.page-action');
  const total = await boutons.count();
  expect(total).toBeGreaterThanOrEqual(3); // carte, Android, liste d'attente
  for (let i = 0; i < total; i++) {
    const cadre = await boutons.nth(i).boundingBox();
    expect(cadre, `bouton ${i} invisible`).not.toBeNull();
    expect(cadre!.height, `bouton ${i} sous 44 px`).toBeGreaterThanOrEqual(44);
  }

  await contexte.close();
});

test('LA CSP DE /salon.html EST CELLE DES AUTRES PAGES VITRINES', async ({ browser }) => {
  const contexte = await browser.newContext({ javaScriptEnabled: false });
  const page = await contexte.newPage();
  await page.goto('/salon.html');

  const contenu = await page.content();
  const bloc = /<meta http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/s.exec(contenu);
  expect(bloc, 'aucune CSP trouvée sur /salon.html').not.toBeNull();

  await page.goto('/a-propos.html');
  const contenuAPropos = await page.content();
  const blocAPropos = /<meta http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/s
    .exec(contenuAPropos);

  // COMPARAISON STRICTE, SANS NORMALISATION (revue Codex, 11/09) : un
  // `.replace(/\s+/g, ' ')` aurait laissé passer un octet différent (un CRLF
  // à la place d'un LF, une espace en trop) sous couvert d'« espaces » —
  // exactement ce que « caractère pour caractère » interdit. Le seul
  // nettoyage légitime est celui que fait le NAVIGATEUR lui-même en HTML
  // (§13.2.3.5 : tout CRLF/CR isolé d'un attribut devient LF avant même la
  // tokenisation) — donc les deux valeurs qu'on compare ici sont déjà
  // celles vues par un lecteur, sans normalisation ajoutée par le test.
  expect(bloc![1]).toBe(blocAPropos![1]);

  await contexte.close();
});
