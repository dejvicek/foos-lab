/**
 * Profilová fotka (21. 11. 2026): výřez z libovolně velké fotky, zmenšený v zařízení na 160 × 160.
 * Ukládá se jen výsledek jako data URL (WebP, kde ho prohlížeč neumí vytvořit, JPEG), originál nikam neodchází.
 */

/** Strana uloženého obrázku (px) – ostrý i na profilu (~84 px) na displeji s dvojnásobnou hustotou. */
export const AVATAR_PX = 160;
/** Nejdelší uložená data URL – stejný limit hlídá databáze (set_avatar). */
export const AVATAR_MAX = 20000;
export const MAX_ZOOM = 4;

/** Výřez: zoom 1 = čtverec přes celou kratší stranu fotky; cx, cy = střed čtverce v pixelech fotky. */
export interface CropView {
  zoom: number;
  cx: number;
  cy: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Výřez přes celou kratší stranu, vycentrovaný. */
export const fitView = (w: number, h: number): CropView => ({ zoom: 1, cx: w / 2, cy: h / 2 });

/** Zoom 1–4 a střed tak, aby čtverec ležel celý ve fotce. */
export function clampView(w: number, h: number, v: CropView): CropView {
  const zoom = clamp(v.zoom, 1, MAX_ZOOM);
  const half = Math.min(w, h) / zoom / 2;
  return { zoom, cx: clamp(v.cx, half, w - half), cy: clamp(v.cy, half, h - half) };
}

/** Zdrojový čtverec ve fotce (pixely fotky). */
export function cropRect(w: number, h: number, v: CropView): { sx: number; sy: number; size: number } {
  const c = clampView(w, h, v);
  const size = Math.min(w, h) / c.zoom;
  return { sx: c.cx - size / 2, sy: c.cy - size / 2, size };
}

/** Posun tahem o (dx, dy) px obrazovky, když je výřez na obrazovce `viewPx` px velký. */
export function panView(w: number, h: number, v: CropView, dx: number, dy: number, viewPx: number): CropView {
  const scale = Math.min(w, h) / v.zoom / viewPx;
  return clampView(w, h, { ...v, cx: v.cx - dx * scale, cy: v.cy - dy * scale });
}

/** Zoom se zachovaným středem. */
export const zoomView = (w: number, h: number, v: CropView, zoom: number): CropView => clampView(w, h, { ...v, zoom });

/** Je to obrázek, který přijme databáze? */
export const isAvatarData = (s: string): boolean =>
  s.length <= AVATAR_MAX && (s.startsWith('data:image/webp;base64,') || s.startsWith('data:image/jpeg;base64,'));

/** Načte vybraný soubor jako obrázek (se správnou orientací z EXIF). */
export async function loadImage(file: Blob): Promise<{ source: CanvasImageSource; w: number; h: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: b, w: b.width, h: b.height };
    } catch {
      /* starší prohlížeč – přes <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Prohlížeč neumí kreslit obrázky.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return [c, ctx];
}

/**
 * Vyřízne a zmenší na 160 × 160 a vrátí data URL. Velkou fotku zmenšuje po polovinách (ostřejší výsledek
 * než jeden velký skok). Když by výsledek přesáhl limit, sníží kvalitu.
 */
export function encodeAvatar(source: CanvasImageSource, rect: { sx: number; sy: number; size: number }): string {
  // Nejvýš 1280 px (= 160 × 8): plátno pro 48Mpx fotku by na telefonu přesáhlo limit prohlížeče.
  let size = Math.max(AVATAR_PX, Math.min(1280, Math.round(rect.size)));
  let [c, ctx] = canvas(size);
  ctx.drawImage(source, rect.sx, rect.sy, rect.size, rect.size, 0, 0, c.width, c.height);
  while (size / 2 >= AVATAR_PX) {
    size = Math.round(size / 2);
    const [n, nctx] = canvas(size);
    nctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, size, size);
    [c, ctx] = [n, nctx];
  }
  if (c.width !== AVATAR_PX) {
    const [n, nctx] = canvas(AVATAR_PX);
    nctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, AVATAR_PX, AVATAR_PX);
    c = n;
  }
  const webp = c.toDataURL('image/webp', 0.8);
  const type = webp.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  for (const q of type === 'image/webp' ? [0.8, 0.7, 0.6, 0.5, 0.4] : [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const url = type === 'image/webp' && q === 0.8 ? webp : c.toDataURL(type, q);
    if (isAvatarData(url)) return url;
  }
  throw new Error('Fotku se nepodařilo zmenšit.');
}
