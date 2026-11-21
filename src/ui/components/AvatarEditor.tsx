import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { clampView, cropRect, encodeAvatar, fitView, MAX_ZOOM, panView, zoomView, type CropView } from '../avatarImage';

export interface LoadedImage {
  source: CanvasImageSource;
  w: number;
  h: number;
}

interface Props {
  image: LoadedImage;
  /** Čí fotka – u cizího hráče (admin) v nadpisu. */
  title: string;
  onSave(dataUrl: string): void;
  onClose(): void;
}

/** Nakreslí výřez do plátna (náhled ve velikosti plátna). */
function paint(c: HTMLCanvasElement | null, img: LoadedImage, v: CropView) {
  const ctx = c?.getContext('2d');
  if (!c || !ctx) return;
  const r = cropRect(img.w, img.h, v);
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img.source, r.sx, r.sy, r.size, r.size, 0, 0, c.width, c.height);
}

/**
 * Výběr výřezu profilové fotky (21. 11. 2026): tah myší / prstem posouvá, posuvník, kolečko nebo dva prsty
 * přibližují, na klávesnici šipky a + / −. Uloží se jen výřez zmenšený na 160 × 160.
 */
export function AvatarEditor({ image, title, onSave, onClose }: Props) {
  const [view, setView] = useState<CropView>(() => fitView(image.w, image.h));
  const [error, setError] = useState<string | null>(null);
  const stage = useRef<HTMLCanvasElement>(null);
  const small = useRef<HTMLCanvasElement>(null);
  const mid = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useLayoutEffect(() => {
    const c = stage.current;
    if (c) {
      const px = Math.round(c.clientWidth * (window.devicePixelRatio || 1)) || 600;
      if (c.width !== px) c.width = c.height = px;
    }
    paint(stage.current, image, view);
    paint(small.current, image, view);
    paint(mid.current, image, view);
  }, [image, view]);

  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const viewPx = () => stage.current?.clientWidth || 300;
  const pan = (dx: number, dy: number) => setView((v) => panView(image.w, image.h, v, dx, dy, viewPx()));
  const zoomTo = (z: number) => setView((v) => zoomView(image.w, image.h, v, z));

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.zoom };
    }
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomTo((pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist);
    } else pan(e.clientX - prev.x, e.clientY - prev.y);
  };
  const up = (e: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const wheel = (e: WheelEvent<HTMLCanvasElement>) => zoomTo(view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  const keys = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const step = e.shiftKey ? 40 : 10;
    const act: Record<string, () => void> = {
      ArrowLeft: () => pan(step, 0),
      ArrowRight: () => pan(-step, 0),
      ArrowUp: () => pan(0, step),
      ArrowDown: () => pan(0, -step),
      '+': () => zoomTo(view.zoom * 1.1),
      '=': () => zoomTo(view.zoom * 1.1),
      '-': () => zoomTo(view.zoom / 1.1),
    };
    if (act[e.key]) {
      e.preventDefault();
      act[e.key]();
    }
  };
  const save = () => {
    try {
      onSave(encodeAvatar(image.source, cropRect(image.w, image.h, clampView(image.w, image.h, view))));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fotku se nepodařilo uložit.');
    }
  };

  return createPortal(
    <div className="avx-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="avx" role="dialog" aria-modal="true" aria-labelledby="avx-title">
        <h2 id="avx-title">{title}</h2>
        <p className="note">Posuň a přibliž fotku, aby v kroužku bylo, co chceš.</p>
        <div className="avx-stage">
          <canvas
            ref={stage}
            tabIndex={0}
            aria-label="Výřez fotky – šipky posouvají, plus a mínus přibližují"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onWheel={wheel}
            onKeyDown={keys}
          />
          <span className="avx-mask" aria-hidden="true" />
        </div>
        <label className="avx-zoom">
          <span aria-hidden="true">−</span>
          <input
            type="range"
            aria-label="Přiblížení"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            onChange={(e) => zoomTo(Number(e.target.value))}
          />
          <span aria-hidden="true">+</span>
        </label>
        <div className="avx-preview">
          <span>Takhle to uvidí ostatní:</span>
          <canvas ref={small} width={48} height={48} className="avx-p s" aria-hidden="true" />
          <canvas ref={mid} width={80} height={80} className="avx-p l" aria-hidden="true" />
        </div>
        {error && (
          <p className="avx-error" role="alert">
            {error}
          </p>
        )}
        <div className="avx-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Zrušit
          </button>
          <button type="button" onClick={save}>
            Uložit
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
