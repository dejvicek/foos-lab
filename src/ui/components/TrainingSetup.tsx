import { useState } from 'react';
import { sortedRoster, type RosterError } from '../../domain/roster';
import { MAX_PLAYERS, minPlayers } from '../../domain/schedule';
import { moveAttendee, shuffleAttendees, toggleAttendee } from '../../domain/training';
import type { Mode, Player, SimSplit, SimTeams, TableCount, Training } from '../../domain/types';
import { MODE_OPTION, plural } from '../format';
import { DurationSelect } from './DisciplinePicker';
import { ROSTER_ERRORS } from '../pages/PlayersPage';

interface PartProps {
  training: Training;
  onChange(next: Training): void;
}

/** Krok „Kdy a kde“: datum, začátek (orientační), délka / typ, počet stolů. */
export function WhenFields({ training, onChange }: PartProps) {
  return (
    <div className="setup">
      <div className="field">
        <label htmlFor="t-date">Datum</label>
        <input id="t-date" type="date" value={training.date} onChange={(e) => e.target.value && onChange({ ...training, date: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="t-start">Začátek</label>
        <input
          id="t-start"
          type="time"
          value={training.startTime}
          onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && onChange({ ...training, startTime: e.target.value })}
        />
      </div>
      {training.format === 'custom' ? (
        <DurationSelect training={training} onChange={onChange} />
      ) : (
        <div className="field">
          <label htmlFor="t-mode">Typ tréninku</label>
          <select id="t-mode" value={training.mode} onChange={(e) => onChange({ ...training, mode: e.target.value as Mode })}>
            <option value="team">{MODE_OPTION.team}</option>
            <option value="single">{MODE_OPTION.single}</option>
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="t-tables">Počet stolů</label>
        <select id="t-tables" value={training.tables} onChange={(e) => onChange({ ...training, tables: Number(e.target.value) as TableCount })}>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
      </div>
    </div>
  );
}

/** Krok „Přítomní“: zaškrtnout hráče, přidat nového do soupisky. */
export function AttendanceFields({
  training,
  players,
  onChange,
  onAddPlayer,
}: PartProps & { players: Player[]; onAddPlayer(name: string): { id: string } | { error: RosterError } }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const n = training.attendees.length;
  const min = minPlayers(training);
  // Aktivní hráči + archivovaní, kteří už v tréninku jsou.
  const shown = sortedRoster(players).filter((p) => !p.archived || training.attendees.includes(p.id));
  const add = () => {
    const r = onAddPlayer(name);
    if ('error' in r) return setError(ROSTER_ERRORS[r.error]);
    setName('');
    setError(null);
  };
  return (
    <div className="attendance-fields">
      <p className="count-line">
        <span className="count-badge">Přítomno: {n}</span>
        {n < min && (
          <span className="note">
            {' '}
            Ještě chybí {min - n} {plural(min - n, 'hráč', 'hráči', 'hráčů')} do minima {min}.
          </span>
        )}
      </p>
      {n > MAX_PLAYERS && <p className="error">Moc hráčů: rozpis umí nejvýš {MAX_PLAYERS}.</p>}
      <ul className="check-list">
        {shown.map((p) => (
          <li key={p.id}>
            <label>
              <input type="checkbox" checked={training.attendees.includes(p.id)} onChange={() => onChange(toggleAttendee(training, p.id, players))} />
              <span>
                {p.name}
                {p.archived && <span className="archived-tag"> (archiv)</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="t-new-player">Jméno nového hráče</label>
        <div className="add-row">
          <input id="t-new-player" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <button type="submit">Přidat a zaškrtnout</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

/** Simulace se hraje? (bez ní nemá smysl rozdělení týmů) */
export const simOn = (t: Training) => (t.format === 'custom' ? (t.plan.sim ?? 0) > 0 && t.attendees.length >= 4 : t.mode === 'team');

export const SPLIT_TEXT: Record<SimSplit, string> = { performance: 'vyrovnaně podle výkonu', order: 'podle nominačního pořadí', manual: 'ručně' };

/** Krok „Pořadí a týmy“: týmy pro simulaci a nominační pořadí (↑ ↓, náhodně). */
export function OrderTeamsFields({ training, currentTeams, players, onChange }: PartProps & { currentTeams: SimTeams | null; players: Player[] }) {
  const n = training.attendees.length;
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <div className="order-fields">
      {simOn(training) ? (
        <div className="setup">
          <div className="field">
            <label htmlFor="t-split">Týmy pro simulaci</label>
            <select
              id="t-split"
              value={training.simSplit}
              onChange={(e) => {
                const simSplit = e.target.value as SimSplit;
                // Ručně: začni od týmů, které jsou právě vidět.
                onChange({ ...training, simSplit, simTeams: simSplit === 'manual' ? currentTeams : null });
              }}
            >
              <option value="performance">Vyrovnaně podle výkonu v tréninku</option>
              <option value="order">Podle nominačního pořadí</option>
              <option value="manual">Ručně</option>
            </select>
          </div>
        </div>
      ) : (
        <p className="note">Simulace se v tomhle tréninku nehraje, týmy není potřeba dělit.</p>
      )}
      {training.simSplit === 'manual' && currentTeams && (
        <SimTeamsEditor teams={currentTeams} byId={byId} onChange={(t) => onChange({ ...training, simTeams: t })} />
      )}
      {n > 1 && (
        <>
          <h3>Pořadí</h3>
          <p className="note">
            Pořadí je nominační pořadí pro simulaci kola: první polovina je tým A, druhá tým B, a kdo je v týmu výš, jde dřív do singlu.
          </p>
          <button type="button" className="ghost" onClick={() => onChange(shuffleAttendees(training, Math.random))}>
            Náhodné pořadí
          </button>
          <ol className="order-list">
            {training.attendees.map((id, i) => {
              const nm = byId.get(id)?.name ?? '?';
              return (
                <li key={id}>
                  <span className="pos">{i + 1}.</span>
                  <span className="nm">{nm}</span>
                  <button type="button" className="icon" aria-label={`Posunout ${nm} v pořadí nahoru`} disabled={i === 0} onClick={() => onChange(moveAttendee(training, id, -1))}>
                    ↑
                  </button>
                  <button type="button" className="icon" aria-label={`Posunout ${nm} v pořadí dolů`} disabled={i === n - 1} onClick={() => onChange(moveAttendee(training, id, 1))}>
                    ↓
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

function SimTeamsEditor({
  teams,
  byId,
  onChange,
}: {
  teams: SimTeams;
  byId: Map<string, Player>;
  onChange(t: SimTeams): void;
}) {
  const name = (id: string) => byId.get(id)?.name ?? '?';
  const move = (from: 'A' | 'B', id: string) => {
    const to = from === 'A' ? 'B' : 'A';
    onChange({ ...teams, [from]: teams[from].filter((p) => p !== id), [to]: [...teams[to], id] } as SimTeams);
  };
  const shift = (side: 'A' | 'B', i: number, dir: -1 | 1) => {
    const list = [...teams[side]];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    onChange({ ...teams, [side]: list } as SimTeams);
  };
  return (
    <div className="teams-editor">
      {(['A', 'B'] as const).map((side) => (
        <div key={side} className="team-col">
          <h3>
            Tým {side} <span className="muted">({teams[side].length})</span>
          </h3>
          <ol className="order-list">
            {teams[side].map((id, i) => (
              <li key={id}>
                <span className="pos">{i + 1}.</span>
                <span className="nm">{name(id)}</span>
                <button type="button" className="icon" aria-label={`Posunout ${name(id)} v týmu nahoru`} disabled={i === 0} onClick={() => shift(side, i, -1)}>
                  ↑
                </button>
                <button type="button" className="icon" aria-label={`Posunout ${name(id)} v týmu dolů`} disabled={i === teams[side].length - 1} onClick={() => shift(side, i, 1)}>
                  ↓
                </button>
                <button type="button" className="ghost" aria-label={`Přesunout ${name(id)} do týmu ${side === 'A' ? 'B' : 'A'}`} onClick={() => move(side, id)}>
                  {side === 'A' ? 'do B →' : '← do A'}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <p className="note">Kdo je v týmu výš, jde dřív do singlu. Levá strana zápasu je vždy tým A.</p>
    </div>
  );
}
