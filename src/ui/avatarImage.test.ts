import { AVATAR_MAX, AVATAR_PX, clampView, cropRect, fitView, isAvatarData, panView } from './avatarImage';

describe('výřez profilové fotky', () => {
  it('na začátku: celá kratší strana, vycentrováno', () => {
    expect(fitView(6000, 4000)).toEqual({ zoom: 1, cx: 3000, cy: 2000 });
    expect(cropRect(6000, 4000, fitView(6000, 4000))).toEqual({ sx: 1000, sy: 0, size: 4000 });
    // na výšku
    expect(cropRect(3000, 4000, fitView(3000, 4000))).toEqual({ sx: 0, sy: 500, size: 3000 });
  });

  it('zoom zmenší čtverec kolem středu', () => {
    expect(cropRect(6000, 4000, { zoom: 2, cx: 3000, cy: 2000 })).toEqual({ sx: 2000, sy: 1000, size: 2000 });
  });

  it('výřez nikdy nevyjede mimo fotku', () => {
    expect(clampView(6000, 4000, { zoom: 1, cx: 0, cy: 99999 })).toEqual({ zoom: 1, cx: 2000, cy: 2000 });
    expect(clampView(6000, 4000, { zoom: 2, cx: 99999, cy: -5 })).toEqual({ zoom: 2, cx: 5000, cy: 1000 });
    const r = cropRect(6000, 4000, { zoom: 3, cx: 6000, cy: 4000 });
    expect(r.sx + r.size).toBeLessThanOrEqual(6000);
    expect(r.sy + r.size).toBeLessThanOrEqual(4000);
  });

  it('zoom jen 1× až 4×', () => {
    expect(clampView(100, 100, { zoom: 0.5, cx: 50, cy: 50 }).zoom).toBe(1);
    expect(clampView(100, 100, { zoom: 9, cx: 50, cy: 50 }).zoom).toBe(4);
  });

  it('posun o pixely na obrazovce: tah doprava ukáže víc vlevo', () => {
    // čtverec 300 px na obrazovce, výřez 4000 px fotky → 1 px obrazovky = 13,33 px fotky
    const v = panView(6000, 4000, fitView(6000, 4000), 30, 0, 300);
    expect(v.cx).toBeCloseTo(3000 - 400);
    expect(v.cy).toBe(2000);
  });

  it('platná uložená fotka', () => {
    expect(AVATAR_PX).toBe(160);
    expect(isAvatarData('data:image/webp;base64,AA==')).toBe(true);
    expect(isAvatarData('data:image/jpeg;base64,AA==')).toBe(true);
    expect(isAvatarData('data:image/png;base64,AA==')).toBe(false);
    expect(isAvatarData('data:image/webp;base64,' + 'A'.repeat(AVATAR_MAX))).toBe(false);
  });
});
