import { DURATION_OPTIONS } from '../../domain/plan';
import type { Training } from '../../domain/types';

export const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

/**
 * Posuvník s hodnotou vedle a popisky pod ním (délka tréninku, počet hráčů v šabloně).
 * Popisky sedí pod středem jezdce (ten jde od půlky jeho šířky po druhou půlku).
 */
export function RangeField({
  id,
  label,
  min,
  max,
  step = 1,
  value,
  ticks,
  format = String,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  ticks: number[];
  format?(v: number): string;
  onChange(v: number): void;
}) {
  return (
    <div className="field range-field">
      <label htmlFor={id}>{label}</label>
      <div className="range-row">
        <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={format(value)} onChange={(e) => onChange(Number(e.target.value))} />
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <div className="range-ticks" aria-hidden="true">
        {ticks.map((m) => (
          <span key={m} style={{ left: `calc(var(--thumb) / 2 + ${(m - min) / (max - min)} * (100% - var(--thumb)))` }}>
            {format(m)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** PRD 4.6 / 7: délka tréninku posuvníkem (1:00–4:00 po 15 min); hodnota vedle, pod ním orientační hodiny. */
export function DurationSelect({ training, onChange }: { training: Training; onChange(next: Training): void }) {
  return (
    <RangeField
      id="t-duration"
      label="Délka tréninku"
      min={DURATION_OPTIONS[0]}
      max={DURATION_OPTIONS[DURATION_OPTIONS.length - 1]}
      step={DURATION_OPTIONS[1] - DURATION_OPTIONS[0]}
      value={training.durationMin}
      ticks={DURATION_OPTIONS.filter((m) => m % 60 === 0)}
      format={hm}
      onChange={(v) => onChange({ ...training, durationMin: v })}
    />
  );
}
