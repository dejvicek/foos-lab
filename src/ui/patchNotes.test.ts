import { compareVersions, notesSince, parseChangelog } from './patchNotes';
import changelog from '../../CHANGELOG.md?raw';

const md = `# Změny

Úvod, který se neukazuje.

## 1.2.0 – 12. 11. 2026

Shrnutí.

- **Nové**: věc

## 1.1.0 – 11. 11. 2026

- jedna

## 1.0.0 – 10. 11. 2026

- první
`;

describe('patch notes z CHANGELOG.md (20. 11. 2026)', () => {
  it('rozdělí záznamy podle verzí s datem, bez úvodu', () => {
    const e = parseChangelog(md);
    expect(e.map((x) => [x.version, x.date])).toEqual([
      ['1.2.0', '12. 11. 2026'],
      ['1.1.0', '11. 11. 2026'],
      ['1.0.0', '10. 11. 2026'],
    ]);
    expect(e[0].body).toBe('Shrnutí.\n\n- **Nové**: věc');
  });

  it('porovnání verzí po číslech, ne jako text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0);
  });

  it('od naposledy viděné verze: všechny novější až po běžící, nejnovější nahoře', () => {
    const e = parseChangelog(md);
    expect(notesSince(e, '1.0.0', '1.2.0').map((x) => x.version)).toEqual(['1.2.0', '1.1.0']);
    expect(notesSince(e, '1.1.0', '1.1.0')).toEqual([]); // už viděl
    expect(notesSince(e, '1.2.0', '1.1.0')).toEqual([]); // zařízení se vrátilo ke starší verzi
    // Nevydané změny (běžící verze bez záznamu) se nepřeskočí, ale nic neukazují.
    expect(notesSince(e, '1.0.0', '1.1.0').map((x) => x.version)).toEqual(['1.1.0']);
  });

  it('zařízení, které ještě nic nevidělo: jen záznam běžící verze', () => {
    const e = parseChangelog(md);
    expect(notesSince(e, null, '1.2.0').map((x) => x.version)).toEqual(['1.2.0']);
    expect(notesSince(e, null, '1.3.0')).toEqual([]);
  });

  it('skutečný CHANGELOG.md: každá vydaná verze má datum', () => {
    const e = parseChangelog(changelog);
    expect(e.length).toBeGreaterThanOrEqual(4);
    for (const x of e) {
      expect(x.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(x.date).toMatch(/^\d{1,2}\. \d{1,2}\. \d{4}$/);
      expect(x.body.length).toBeGreaterThan(0);
    }
    expect(e.map((x) => x.version)).toContain('1.0.0');
  });
});
