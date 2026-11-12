import { BEST_OF_OPTIONS, fixedLegRule, MAX_LEG_TO, minLegTo, normalizeFormat, type MatchFormat } from '../../domain/matchFormat';
import type { DisciplineId } from '../../domain/types';

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

/**
 * BO formát zápasové disciplíny (12. 11. 2026): BO1 / BO2 / BO3 / BO5, gólů na leg a rozhodující
 * leg o 2 góly se stropem. Výběry místo políček – hodnota je vždy platná.
 */
export function MatchFormatPicker({ id, name, value, onChange }: { id: DisciplineId; name: string; value: MatchFormat; onChange(f: MatchFormat): void }) {
  const f = normalizeFormat(id, value);
  const set = (p: Partial<MatchFormat>) => onChange(normalizeFormat(id, { ...f, ...p }));
  const fixed = fixedLegRule(id);
  return (
    <span className="mf" role="group" aria-label={`Formát: ${name}`}>
      <select aria-label={`Počet legů: ${name}`} value={f.bestOf} onChange={(e) => set({ bestOf: Number(e.target.value) })}>
        {BEST_OF_OPTIONS.map((n) => (
          <option key={n} value={n}>
            BO{n}
          </option>
        ))}
      </select>
      {fixed ? (
        <span className="mf-note">o 2 góly, strop 10</span>
      ) : (
        <>
          <label>
            do{' '}
            <select aria-label={`Gólů na leg: ${name}`} value={f.legTo} onChange={(e) => set({ legTo: Number(e.target.value) })}>
              {range(minLegTo(id), MAX_LEG_TO).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {f.bestOf !== 2 && (
            <label className="mf-check">
              <input type="checkbox" checked={!!f.finalWinBy2} onChange={(e) => set({ finalWinBy2: e.target.checked })} />
              {f.bestOf > 1 ? 'rozhodující leg o 2' : 'o 2 góly'}
            </label>
          )}
          {f.finalWinBy2 && (
            <label>
              strop{' '}
              <select aria-label={`Strop: ${name}`} value={f.cap} onChange={(e) => set({ cap: Number(e.target.value) })}>
                {range(f.legTo + 1, MAX_LEG_TO + 5).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
    </span>
  );
}
