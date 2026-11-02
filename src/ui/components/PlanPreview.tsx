import { useState, type DragEvent } from 'react';
import { addBreak, BREAK_OPTIONS, breakMovable, breaksOf, freeSlots, moveBreak, removeBreak, setBreakMin, stepTarget } from '../../domain/breaks';
import { buildSchedule, canBuildSchedule } from '../../domain/schedule';
import { clockAt } from '../../domain/solo';
import type { Training } from '../../domain/types';

/**
 * Krok Disciplíny: jak zhruba bude vypadat plán (kola, časy, pauzy) – přepočítá se s každou změnou.
 * S `onChange` jdou pauzy přidat, odebrat, přetáhnout / posunout šipkami a nastavit jim délku.
 */
export function PlanPreview({ training, onChange }: { training: Training; onChange?(t: Training): void }) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ i: number; pos: 'before' | 'after'; after: number } | null>(null);
  if (!canBuildSchedule(training)) return <p className="note">Náhled plánu se ukáže, až bude dost přítomných.</p>;
  const rows = buildSchedule(training).sections.flatMap((s) => s.rows);
  const editable = !!onChange && training.format === 'custom';
  const list = editable ? breaksOf(training) : [];
  const dropAt = (e: DragEvent<HTMLLIElement>, i: number, roundNo: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    const pos = e.clientY > r.top + r.height / 2 ? 'after' : 'before';
    return { i, pos, after: pos === 'after' ? roundNo : roundNo - 1 } as const;
  };
  const canDrop = (after: number) => dragging !== null && breakMovable(training, dragging) && freeSlots(training, dragging).includes(after);

  return (
    <section className="plan-preview">
      <h3>Náhled plánu</h3>
      <ol aria-label="Náhled plánu">
        {rows.map((r, i) => {
          const bi = r.breakIndex;
          const time = <span className="pp-time">{clockAt(training.startTime, r.time)}</span>;
          if (editable && bi !== undefined && list[bi]) {
            const movable = breakMovable(training, bi);
            return (
              <li
                key={i}
                className={['brk', 'pp-break', dragging === bi ? 'dragging' : ''].filter(Boolean).join(' ')}
                draggable={movable}
                onDragStart={(e) => {
                  e.dataTransfer?.setData?.('text/plain', 'pauza');
                  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                  setDragging(bi);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDrop(null);
                }}
              >
                {time}
                <span className="pp-label">
                  {movable && <span className="drag-handle" aria-hidden="true">⠿</span>}
                  Pauza
                </span>
                <span className="pp-break-edit">
                  <select aria-label="Délka pauzy" value={list[bi].min} onChange={(e) => onChange!(setBreakMin(training, bi, Number(e.target.value)))}>
                    {BREAK_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                  {movable && (
                    <>
                      <button type="button" className="icon" aria-label="Pauzu o kolo dřív" disabled={stepTarget(training, bi, -1) === null} onClick={() => onChange!(moveBreak(training, bi, stepTarget(training, bi, -1)!))}>
                        ↑
                      </button>
                      <button type="button" className="icon" aria-label="Pauzu o kolo později" disabled={stepTarget(training, bi, 1) === null} onClick={() => onChange!(moveBreak(training, bi, stepTarget(training, bi, 1)!))}>
                        ↓
                      </button>
                      <button type="button" className="link" aria-label="Odebrat pauzu" onClick={() => onChange!(removeBreak(training, bi))}>
                        odebrat
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          }
          const droppable = editable && dragging !== null && r.roundNo !== undefined;
          return (
            <li
              key={i}
              className={[r.kind === 'break' ? 'brk' : '', drop?.i === i ? `drop-${drop.pos}` : ''].filter(Boolean).join(' ') || undefined}
              onDragOver={
                droppable
                  ? (e) => {
                      const d = dropAt(e, i, r.roundNo!);
                      if (!canDrop(d.after)) return setDrop(null);
                      e.preventDefault();
                      if (drop?.i !== d.i || drop.pos !== d.pos) setDrop(d);
                    }
                  : undefined
              }
              onDrop={
                droppable
                  ? (e) => {
                      e.preventDefault();
                      const d = dropAt(e, i, r.roundNo!);
                      if (canDrop(d.after)) onChange!(moveBreak(training, dragging!, d.after));
                      setDragging(null);
                      setDrop(null);
                    }
                  : undefined
              }
            >
              {time}
              <span className="pp-label">{r.label}</span>
              <span className="pp-rule">{r.rule ?? ''}</span>
            </li>
          );
        })}
      </ol>
      {editable && (
        <button type="button" className="ghost pp-add" disabled={!freeSlots(training).length} onClick={() => onChange!(addBreak(training))}>
          + Přidat pauzu
        </button>
      )}
      <p className="note">Časy jsou orientační. Pauzu přetáhni za ⠿ (nebo šipkami) mezi jiná kola.</p>
    </section>
  );
}
