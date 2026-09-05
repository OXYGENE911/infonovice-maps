/* <outil-partage> — partager sa position, en page plein écran.
 *
 * OUTILS-2 (06/09/2026). Armelin : « une icône pour partager sa
 * géolocalisation ». LA POSITION SE DEMANDE SUR UN GESTE (« Utiliser ma
 * position »), jamais à l'ouverture — contrainte 4. Ce qui part, et où, est
 * écrit sous le bouton : l'adresse vient de la BAN (les coordonnées lui sont
 * envoyées, comme pour toute adresse inverse), et le lien ne part QUE par le
 * partage du téléphone ou le presse-papiers, à la main. */
import { poserPositionConnue } from './recherche';
import { adresseInverse } from '../lib/adresse';
import { baseDuLien, lienPosition, textePartage } from '../lib/partage-position';

export class OutilPartage extends HTMLElement {
  connectedCallback(): void {
    if (this.firstElementChild) return;
    this.innerHTML = `
      <p class="outils-mot">Un lien vers l’endroit où vous êtes : qui l’ouvre
        voit le point sur la carte, sans compte. Votre position est demandée au
        bouton ci-dessous, ses coordonnées vont à la Base Adresse Nationale pour
        nommer la rue, et le lien ne part que si vous l’envoyez.</p>
      <button type="button" class="partage-position-obtenir">Utiliser ma position</button>
      <p class="partage-position-etat" role="status"></p>
      <div class="partage-position-resultat" hidden>
        <p class="partage-position-adresse"></p>
        <label class="partage-position-champ">Lien
          <input type="text" class="partage-position-lien" readonly aria-label="Lien vers ma position">
        </label>
        <div class="partage-position-actions">
          <button type="button" class="partage-position-partager">Partager…</button>
          <button type="button" class="partage-position-copier">Copier le lien</button>
        </div>
      </div>`;
    this.querySelector('.partage-position-obtenir')?.addEventListener('click', () => { this.#obtenir(); });
    this.querySelector('.partage-position-copier')?.addEventListener('click', () => { void this.#copier(); });
    this.querySelector('.partage-position-partager')?.addEventListener('click', () => { void this.#partager(); });
    if (typeof navigator.share !== 'function') {
      const b = this.querySelector<HTMLElement>('.partage-position-partager');
      if (b) b.hidden = true;
    }
  }

  #etat(texte: string): void {
    const e = this.querySelector<HTMLElement>('.partage-position-etat');
    if (e) e.textContent = texte;
  }

  #obtenir(): void {
    if (!('geolocation' in navigator)) {
      this.#etat('Ce navigateur ne sait pas donner votre position.');
      return;
    }
    this.#etat('Position en cours…');
    navigator.geolocation.getCurrentPosition(
      (p) => { void this.#poser(p.coords.longitude, p.coords.latitude); },
      (e) => {
        this.#etat(e.code === e.PERMISSION_DENIED
          ? 'Position refusée : autorisez-la dans le navigateur pour la partager.'
          : 'Position indisponible pour l’instant. Réessayez dehors, ou dans un instant.');
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }

  async #poser(lon: number, lat: number): Promise<void> {
    poserPositionConnue({ lon, lat });
    const resultat = this.querySelector<HTMLElement>('.partage-position-resultat');
    const lien = this.querySelector<HTMLInputElement>('.partage-position-lien');
    const adresse = this.querySelector<HTMLElement>('.partage-position-adresse');
    if (lien) lien.value = lienPosition(baseDuLien(location.href), lon, lat);
    if (adresse) adresse.textContent = textePartage(lon, lat, null);
    if (resultat) resultat.hidden = false;
    this.#etat('');
    /* LE NOM DE LA RUE ARRIVE APRÈS, s'il arrive : le lien est déjà là. */
    try {
      const r = await adresseInverse({ lon, lat });
      if (r && adresse) adresse.textContent = textePartage(lon, lat, r.libelle);
    } catch { /* sans adresse, les coordonnées suffisent */ }
  }

  async #copier(): Promise<void> {
    const lien = this.querySelector<HTMLInputElement>('.partage-position-lien');
    if (!lien?.value) return;
    try {
      await navigator.clipboard.writeText(lien.value);
      this.#etat('Lien copié.');
    } catch {
      lien.select();
      this.#etat('Copie impossible ici : le lien est sélectionné, copiez-le à la main.');
    }
  }

  async #partager(): Promise<void> {
    const lien = this.querySelector<HTMLInputElement>('.partage-position-lien');
    const adresse = this.querySelector<HTMLElement>('.partage-position-adresse');
    if (!lien?.value || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({ title: 'Ma position', text: adresse?.textContent ?? '', url: lien.value });
    } catch { /* partage annulé : rien à dire */ }
  }
}

customElements.define('outil-partage', OutilPartage);
