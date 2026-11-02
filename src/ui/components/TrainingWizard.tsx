import { useState } from 'react';
import type { RosterError } from '../../domain/roster';
import { buildSchedule, canBuildSchedule } from '../../domain/schedule';
import { toggleAttendee } from '../../domain/training';
import type { Player, PlayerId, Training } from '../../domain/types';
import { plannedMinutes } from '../../domain/plan';
import { formatDate } from '../dates';
import { MODE_LABEL, plural } from '../format';
import { prepareEdit } from '../trainingEdit';
import { DisciplinePicker, hm } from './DisciplinePicker';
import { FairnessPanel } from './FairnessPanel';
import { PlanPreview, type Highlight } from './PlanPreview';
import { AttendanceFields, WhenFields } from './TrainingSetup';

type StepId = 'when' | 'who' | 'disc' | 'sum';
const TITLES: Record<StepId, string> = { when: 'Kdy a kde', who: 'Přítomní', disc: 'Disciplíny', sum: 'Shrnutí' };

interface Props {
  initial: Training;
  /** new = nový trénink (Zahájit trénink), edit = úprava (Uložit změny kdykoli). */
  mode: 'new' | 'edit';
  players: Player[];
  /** Přidá hráče do soupisky; vrací jeho ID a novou soupisku, nebo chybu. */
  onAddPlayer(name: string): { id: PlayerId; players: Player[] } | { error: RosterError };
  onFinish(t: Training): void;
  onCancel(): void;
}

/** PRD 7: založení / úprava tréninku v krocích Kdy a kde → Přítomní → Disciplíny → Shrnutí. */
export function TrainingWizard({ initial, mode, players, onAddPlayer, onFinish, onCancel }: Props) {
  const [draft, setDraft] = useState(initial);
  // Týmy pro simulaci a pořadí se nastavují v tréninku před zahájením simulace.
  const steps: StepId[] = ['when', 'who', ...(draft.format === 'custom' ? (['disc'] as const) : []), 'sum'];
  const [stepId, setStepId] = useState<StepId>(mode === 'new' ? 'when' : 'sum');
  const [reached, setReached] = useState(mode === 'edit' ? steps.length - 1 : 0);
  const step = Math.max(0, steps.indexOf(stepId));
  const ready = canBuildSchedule(draft);
  // Za krok Přítomní se jde jen s dost hráči.
  const canGo = (i: number) => i <= steps.indexOf('who') || ready;
  const go = (i: number) => {
    if (i < 0 || i >= steps.length || !canGo(i)) return;
    setStepId(steps[i]);
    setReached((r) => Math.max(r, i));
  };
  const change = (input: Training) => setDraft((d) => prepareEdit(d, input));
  const addPlayer = (name: string) => {
    const r = onAddPlayer(name);
    if ('id' in r) setDraft((d) => prepareEdit(d, toggleAttendee(d, r.id, r.players)));
    return r;
  };
  const byId = new Map(players.map((p) => [p.id, p.name]));
  // Zvýraznění hráče v náhledu plánu: najetí myší, klepnutím se připne (telefon).
  const [hover, setHover] = useState<PlayerId | null>(null);
  const [pin, setPin] = useState<PlayerId | null>(null);
  const hl: Highlight = { lit: hover ?? pin, enter: setHover, leave: () => setHover(null), toggle: (p) => setPin((x) => (x === p ? null : p)) };
  const n = draft.attendees.length;
  const finishLabel = mode === 'new' ? 'Zahájit trénink' : 'Uložit změny';

  const body = (() => {
    switch (stepId) {
      case 'when':
        return <WhenFields training={draft} onChange={change} />;
      case 'who':
        return <AttendanceFields training={draft} players={players} onChange={change} onAddPlayer={addPlayer} />;
      case 'disc':
        return (
          <>
            <FairnessPanel
              hl={hl}
              training={draft}
              names={Object.fromEntries(byId)}
              onAddRounds={(id, k) => change({ ...draft, plan: { ...draft.plan, [id]: (draft.plan[id] ?? 0) + k } })}
            />
            <div className="wizard-disc">
              <DisciplinePicker training={draft} open bare onChange={change} />
              <PlanPreview training={draft} onChange={change} names={Object.fromEntries(byId)} hl={hl} />
            </div>
          </>
        );
      case 'sum': {
        const rounds = ready ? buildSchedule(draft).sections.flatMap((s) => s.rows).filter((r) => r.kind !== 'break').length : 0;
        const line = (id: StepId, text: string) => (
          <div className="sum-row" key={id}>
            <span className="sum-k">{TITLES[id]}</span>
            <span>{text}</span>
            <button type="button" className="link" aria-label={`Upravit: ${TITLES[id]}`} onClick={() => go(steps.indexOf(id))}>
              upravit
            </button>
          </div>
        );
        return (
          <div className="wizard-sum">
            {line(
              'when',
              `${formatDate(draft.date)}, ${draft.startTime}, ${draft.format === 'custom' ? hm(draft.durationMin) : MODE_LABEL[draft.mode]}, ${draft.tables} ${plural(draft.tables, 'stůl', 'stoly', 'stolů')}`,
            )}
            {line('who', `${n} ${plural(n, 'hráč', 'hráči', 'hráčů')}: ${draft.attendees.map((p) => byId.get(p) ?? '?').join(', ')}`)}
            {draft.format === 'custom' &&
              line('disc', `${rounds} ${plural(rounds, 'kolo', 'kola', 'kol')}, naplánováno ${hm(plannedMinutes(draft.plan, n, draft.breaks))} z ${hm(draft.durationMin)}`)}
          </div>
        );
      }
    }
  })();

  return (
    <section className="wizard" aria-label={mode === 'new' ? 'Nový trénink' : 'Nastavení tréninku'}>
      <ol className="wizard-steps" aria-label="Kroky">
        {steps.map((id, i) => (
          <li key={id} className={i === step ? 'on' : i <= reached ? 'done' : undefined}>
            <button type="button" aria-current={i === step ? 'step' : undefined} disabled={i > reached || !canGo(i)} onClick={() => go(i)}>
              <b>{i < step || (i <= reached && i !== step) ? '✓' : i + 1}</b>
              <span>
                {TITLES[id]}
                {id === 'who' && ` (${n})`}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="wizard-mobile-progress">
        Krok {step + 1} z {steps.length} · {TITLES[stepId]}
      </p>
      <div className="wizard-panel">
        <h2>{TITLES[stepId]}</h2>
        {body}
      </div>
      <div className="wizard-nav">
        <button type="button" className="ghost" onClick={step === 0 ? onCancel : () => go(step - 1)}>
          {step === 0 ? 'Zrušit' : '‹ Zpět'}
        </button>
        <span className="wizard-nav-right">
          {mode === 'edit' && step < steps.length - 1 && (
            <button type="button" className="ghost" disabled={!ready} onClick={() => onFinish(draft)}>
              {finishLabel}
            </button>
          )}
          {step < steps.length - 1 ? (
            <button type="button" disabled={!canGo(step + 1)} onClick={() => go(step + 1)}>
              Další: {TITLES[steps[step + 1]]} ›
            </button>
          ) : (
            <button type="button" disabled={!ready} onClick={() => onFinish(draft)}>
              {finishLabel}
            </button>
          )}
        </span>
      </div>
    </section>
  );
}
