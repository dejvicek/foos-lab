import { MAX_ROUND, MIN_ROUND } from '../../domain/catalog';

/** Délka kola tlačítky − / + (1–60 min); volitelně počet kol před ní („2×“). */
export function MinStepper({ value, label, rounds, onChange }: { value: number; label: string; rounds?: number; onChange(v: number): void }) {
  return (
    <span className="min-stepper">
      {rounds !== undefined && <span className="ms-rounds">{rounds}×</span>}
      <button type="button" className="icon" aria-label={`Kratší kolo: ${label}`} disabled={value <= MIN_ROUND} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output aria-label={`Délka kola: ${label}`}>{value} min</output>
      <button type="button" className="icon" aria-label={`Delší kolo: ${label}`} disabled={value >= MAX_ROUND} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}
