/* RENDU 360 — la coquille WebGL. Toutes les décisions vivent dans
 * lib/panorama.ts, testé à sec ; ce fichier ne fait qu'appliquer ses nombres.
 *
 * POURQUOI ÉCRIT À LA MAIN plutôt qu'importé : un visualiseur du commerce
 * pèse deux cents kilo-octets pour dessiner une sphère texturée. Celui-ci en
 * coûte quelques-uns. C'est le même arbitrage que le décodeur protobuf de la
 * PR #16 — 2 Ko à la main contre 120 Ko de bibliothèque — et le budget de ce
 * projet (300 Ko hors MapLibre) ne se dépense pas deux fois.
 *
 * IL DOIT POUVOIR ÉCHOUER SANS RIEN CASSER. WebGL manque sur certaines
 * machines, et une texture de 8192 pixels dépasse ce que de vieux appareils
 * acceptent. Dans ce cas, `demarrer` rend `null` et la visionneuse retombe sur
 * l'image à plat — dégradée, mais présente.
 */
import { sphere, deplacer, VUE_INITIALE, type Vue } from '../lib/panorama';

const SOMMET = `
attribute vec3 position;
attribute vec2 uv;
uniform mat4 vueProjection;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vueProjection * vec4(position, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D image;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(image, vUv); }`;

function compiler(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
  return s;
}

/* La matrice vue-projection, écrite à la main : importer une bibliothèque
   d'algèbre pour six lignes serait absurde. Perspective simple, puis rotation
   par le lacet et le tangage. */
function matrice(vue: Vue, aspect: number): Float32Array {
  const fov = (75 * Math.PI) / 180;
  const f = 1 / Math.tan(fov / 2);
  const proche = 0.1;
  const loin = 10;
  const p = [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (loin + proche) / (proche - loin), -1,
    0, 0, (2 * loin * proche) / (proche - loin), 0,
  ];

  const l = (vue.lacet * Math.PI) / 180;
  const t = (vue.tangage * Math.PI) / 180;
  const cl = Math.cos(l); const sl = Math.sin(l);
  const ct = Math.cos(t); const st = Math.sin(t);
  // Rotation Y (lacet) puis X (tangage), transposée : on tourne le monde.
  const v = [
    cl, sl * st, -sl * ct, 0,
    0, ct, st, 0,
    sl, -cl * st, cl * ct, 0,
    0, 0, 0, 1,
  ];

  const m = new Float32Array(16);
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      let somme = 0;
      for (let k = 0; k < 4; k += 1) somme += (p[k * 4 + j] ?? 0) * (v[i * 4 + k] ?? 0);
      m[i * 4 + j] = somme;
    }
  }
  return m;
}

export interface Panorama { detruire(): void }

/**
 * Démarre le rendu 360 sur un canevas. Rend `null` si WebGL est indisponible —
 * l'appelant retombe alors sur l'image à plat.
 */
export function demarrer(canevas: HTMLCanvasElement, image: HTMLImageElement): Panorama | null {
  const gl = canevas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) return null;

  const vs = compiler(gl, gl.VERTEX_SHADER, SOMMET);
  const fs = compiler(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const maillage = sphere();
  const poser = (donnees: Float32Array, nom: string, taille: number): void => {
    const tampon = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
    gl.bufferData(gl.ARRAY_BUFFER, donnees, gl.STATIC_DRAW);
    const emplacement = gl.getAttribLocation(prog, nom);
    gl.enableVertexAttribArray(emplacement);
    gl.vertexAttribPointer(emplacement, taille, gl.FLOAT, false, 0, 0);
  };
  poser(maillage.positions, 'position', 3);
  poser(maillage.uvs, 'uv', 2);

  const indices = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, maillage.indices, gl.STATIC_DRAW);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  /* UNE IMAGE D'UNE AUTRE ORIGINE CONTAMINE LE CANEVAS, et WebGL refuse alors
     de s'en servir : « The image element contains cross-origin data, and may
     not be loaded ». C'est pourquoi la visionneuse demande l'image en mode
     anonyme — Panoramax répond bien `Access-Control-Allow-Origin: *`
     (vérifié le 26/08/2026). Si malgré tout la texture est refusée, on rend
     `null` plutôt que de laisser l'exception fuir : l'appelant retombe sur
     l'image à plat, et l'usager voit quelque chose. */
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  } catch {
    gl.deleteTexture(texture);
    gl.deleteProgram(prog);
    return null;
  }
  /* CLAMP EN VERTICAL, RÉPÉTITION EN HORIZONTAL : le panorama fait le tour en
     longitude mais pas en latitude. Et LINEAR sans mipmap — une image de
     4096×2048 n'est pas forcément une puissance de deux, et WebGL 1 refuse
     alors les mipmaps. */
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const uVueProjection = gl.getUniformLocation(prog, 'vueProjection');
  // On regarde la sphère DE L'INTÉRIEUR : les faces avant tournent le dos.
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);

  let vue: Vue = { ...VUE_INITIALE };
  let vivant = true;

  const dessiner = (): void => {
    if (!vivant) return;
    const l = canevas.clientWidth || 1;
    const h = canevas.clientHeight || 1;
    if (canevas.width !== l || canevas.height !== h) { canevas.width = l; canevas.height = h; }
    gl.viewport(0, 0, canevas.width, canevas.height);
    gl.uniformMatrix4fv(uVueProjection, false, matrice(vue, l / h));
    gl.drawElements(gl.TRIANGLES, maillage.indices.length, gl.UNSIGNED_SHORT, 0);
  };

  /* LE GLISSEMENT. `setPointerCapture` garde le suivi même quand le doigt
     sort du canevas — sans lui, un mouvement rapide laisse la vue figée à
     mi-course. */
  let dernier: { x: number; y: number } | null = null;
  const surAppui = (e: PointerEvent): void => {
    dernier = { x: e.clientX, y: e.clientY };
    canevas.setPointerCapture(e.pointerId);
  };
  const surGlissement = (e: PointerEvent): void => {
    if (!dernier) return;
    vue = deplacer(vue, e.clientX - dernier.x, e.clientY - dernier.y, canevas.clientWidth || 1);
    dernier = { x: e.clientX, y: e.clientY };
    dessiner();
  };
  const surRelachement = (e: PointerEvent): void => {
    dernier = null;
    if (canevas.hasPointerCapture(e.pointerId)) canevas.releasePointerCapture(e.pointerId);
  };

  /* ET AU CLAVIER. Un panorama qu'on ne peut explorer qu'à la souris exclut
     ceux qui n'en ont pas — le projet exige une navigation clavier complète. */
  const surTouche = (e: KeyboardEvent): void => {
    const pas = 40;
    const gestes: Record<string, [number, number]> = {
      ArrowLeft: [pas, 0], ArrowRight: [-pas, 0],
      ArrowUp: [0, pas], ArrowDown: [0, -pas],
    };
    const g = gestes[e.key];
    if (!g) return;
    e.preventDefault();
    vue = deplacer(vue, g[0], g[1], canevas.clientWidth || 1);
    dessiner();
  };

  canevas.addEventListener('pointerdown', surAppui);
  canevas.addEventListener('pointermove', surGlissement);
  canevas.addEventListener('pointerup', surRelachement);
  canevas.addEventListener('pointercancel', surRelachement);
  canevas.addEventListener('keydown', surTouche);
  const surRedimension = (): void => { dessiner(); };
  window.addEventListener('resize', surRedimension);

  dessiner();

  return {
    detruire(): void {
      vivant = false;
      canevas.removeEventListener('pointerdown', surAppui);
      canevas.removeEventListener('pointermove', surGlissement);
      canevas.removeEventListener('pointerup', surRelachement);
      canevas.removeEventListener('pointercancel', surRelachement);
      canevas.removeEventListener('keydown', surTouche);
      window.removeEventListener('resize', surRedimension);
      // La texture d'un panorama pèse plusieurs mégaoctets en mémoire vidéo :
      // une modale fermée ne doit pas la garder.
      gl.deleteTexture(texture);
      gl.deleteProgram(prog);
    },
  };
}
