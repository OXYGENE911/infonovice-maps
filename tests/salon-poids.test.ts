// Le budget de poids de la page salon (SALON-1) — voir
// docs/infonovice-maps/spec-accueil-salon.md §2 : le garde-fou du dépôt
// (.github/workflows/ci.yml) ne mesure que les `.js` de `dist/assets` — une
// page sans script lui est INVISIBLE. C'est le seul garde-fou de CETTE page.
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const octets = (chemin: string) => statSync(RACINE + chemin).size;

describe('budgets de poids — salon.html', () => {
  test('salon.html ≤ 12 000 octets bruts', () => {
    expect(octets('salon.html')).toBeLessThanOrEqual(12_000);
  });

  test('public/salon/qr-maps.svg ≤ 3 000 octets', () => {
    expect(octets('public/salon/qr-maps.svg')).toBeLessThanOrEqual(3_000);
  });

  test('public/salon/attente.png ≤ 60 000 octets', () => {
    expect(octets('public/salon/attente.png')).toBeLessThanOrEqual(60_000);
  });
});
