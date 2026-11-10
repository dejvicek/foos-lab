import { useState } from 'react';
import type { RosterError } from '../../domain/roster';
import { canBuildSchedule } from '../../domain/schedule';
import { toggleAttendee } from '../../domain/training';
import type { Player, PlayerId, Training } from '../../domain/types';
import { prepareEdit } from '../trainingEdit';
import { todayIso } from '../dates';
import { DisciplineStep } from './DisciplineStep';
import type { Highlight } from './PlanPreview';
import { AttendanceFields, WhenFields } from './TrainingSetup';

type StepId = 'when' | 'who' | 'plan';
const TITLES: Record<StepId, string> = { when: 'Kdy a kde', who: 'Přítomní', plan: 'Kdy, kde a disciplíny' };

interface Props {
  initial: Training;
  /** new = nový trénink (Zahájit trénink), edit = úprava (Uložit změny kdykoli). */
  mode: 'new' | 'edit';
  /** Trénink běží: uložení přegeneruje celý rozpis (10. 11. 2026). */
  running?: boolean;
  players: Player[];
  /** Uložené tréninky – docházka a „Jako minule“ v kroku Přítomní. */
  trainings: Training[];
  /** Přidá hráče do soupisky; vrací jeho ID a novou soupisku, nebo chybu. */
  onAddPlayer(name: string): { id: PlayerId; players: Player[] } | { error: RosterError };
  onFinish(t: Training): void;
  onCancel(): void;
  /** Admin: uloží nastavení disciplín tréninku jako novou šablonu; vrací chybu, nebo null. */
  onSaveTemplate?(name: string, t: Training): string | null;
}

/**
 * PRD 7: založení / úprava tréninku v krocích Přítomní → Kdy, kde a disciplíny (10. 11. 2026: plán až po
 * přítomných, ať sedí kola cvičení i kontrola rozpisu; Shrnutí už není). Starší pevný trénink: Kdy a kde → Přítomní.
 */
export function TrainingWizard({ initial, mode, running, players, trainings, onAddPlayer, onFinish, onCancel, onSaveTemplate }: Props) {
  const [draft, setDraft] = useState(initial);
  // Týmy pro simulaci a pořadí se nastavují v tréninku před zahájením simulace.
  const steps: StepId[] = draft.format === 'custom' ? ['who', 'plan'] : ['when', 'who'];
  // Úprava otevře hlavní nastavení: plán (konfigurovatelný trénink), u pevného Kdy a kde.
  const [stepId, setStepId] = useState<StepId>(mode === 'new' ? steps[0] : draft.format === 'custom' ? 'plan' : 'when');
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
  const hl: Highlight = {
    lit: hover ?? pin,
    pinned: pin,
    enter: setHover,
    leave: () => setHover(null),
    toggle: (p) => setPin((x) => (x === p ? null : p)),
    clear: () => setPin(null),
  };
  const n = draft.attendees.length;
  const finishLabel = mode === 'new' ? 'Zahájit trénink' : 'Uložit změny';

  const body = (() => {
    switch (stepId) {
      case 'when':
        return <WhenFields training={draft} onChange={change} />;
      case 'who':
        return <AttendanceFields training={draft} players={players} trainings={trainings} today={todayIso()} onChange={change} onAddPlayer={addPlayer} />;
      case 'plan':
        return (
          <>
            <WhenFields training={draft} onChange={change} />
            <DisciplineStep
              training={draft}
              names={Object.fromEntries(byId)}
              hl={hl}
              onChange={change}
              onSaveTemplate={onSaveTemplate && ((name) => onSaveTemplate(name, draft))}
            />
          </>
        );
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
      {running && (
        <p className="wizard-running" role="note">
          Trénink běží – uložením změny se celý rozpis přegeneruje od začátku. Skóre, výsledky a změřené časy, které do nového rozpisu nesedí,
          se smažou (appka se před uložením zeptá).
        </p>
      )}
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
