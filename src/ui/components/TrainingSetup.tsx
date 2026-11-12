import { useMemo, useState } from 'react';
import { alphabetical, type RosterError } from '../../domain/roster';
import { MAX_PLAYERS, MIN_CLUB_PLAYERS, minPlayers } from '../../domain/schedule';
import { toggleAttendee, withAttendees } from '../../domain/training';
import { attendance, lastTraining } from '../../domain/attendance';
import { formatDayMonth } from '../dates';
import { AttendanceMeta } from './AttendanceMeta';
import { randomTeams } from '../../domain/simulation';
import type { Mode, Player, SimSplit, SimTeams, TableCount, Training } from '../../domain/types';
import { MODE_OPTION, plural } from '../format';
import { DurationSelect } from './DisciplinePicker';
import { ROSTER_ERRORS } from '../pages/PlayersPage';

interface PartProps {
  training: Training;
  onChange(next: Training): void;
}

/** Kdy a kde: datum, začátek (orientační), délka / typ, počet stolů. Šablona je v záložkách nad disciplínami. */
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
      <TablesField name={`tables-${training.id}`} value={training.tables} onChange={(n) => onChange({ ...training, tables: n })} />
    </div>
  );
}

/** Počet stolů 1–4 jako linka s tečkami (průvodce, šablony). */
export function TablesField({ name, value, onChange, label = 'Počet stolů' }: { name: string; value: number; onChange(n: TableCount): void; label?: string }) {
  const labelId = `${name}-label`;
  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <div className="dot-line" role="radiogroup" aria-labelledby={labelId} style={{ ['--fill' as string]: String((value - 1) / 3) }}>
        {([1, 2, 3, 4] as TableCount[]).map((n) => (
          <label key={n} className={n <= value ? 'dot-step on' : 'dot-step'}>
            <input type="radio" name={name} value={n} checked={value === n} aria-label={`${n} ${plural(n, 'stůl', 'stoly', 'stolů')}`} onChange={() => onChange(n)} />
            <span className="dot" aria-hidden="true" />
            <span className="dot-num" aria-hidden="true">
              {n}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Krok „Přítomní“ (10. 11. 2026, varianta C): hledání, „Jako minule“ / „Nikdo“, skupiny Minule byli a Ostatní,
 * u jména docházka; přidat nového hráče do soupisky; dole počet a jména vybraných.
 */
export function AttendanceFields({
  training,
  players,
  trainings,
  today,
  onChange,
  onAddPlayer,
}: PartProps & { players: Player[]; trainings: Training[]; today: string; onAddPlayer(name: string): { id: string } | { error: RosterError } }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const n = training.attendees.length;
  const min = Math.max(minPlayers(training), MIN_CLUB_PLAYERS);
  const att = useMemo(() => attendance(trainings, today, training.id), [trainings, today, training.id]);
  const last = useMemo(() => lastTraining(trainings, today, training.id), [trainings, today, training.id]);
  const lastIds = new Set(last?.attendees ?? []);
  // Aktivní hráči + archivovaní, kteří už v tréninku jsou. Podle abecedy (pořadí v rozpisu řídí soupiska).
  const q = query.trim().toLocaleLowerCase('cs');
  const shown = alphabetical(players).filter((p) => (!p.archived || training.attendees.includes(p.id)) && (!q || p.name.toLocaleLowerCase('cs').includes(q)));
  const lastActive = players.filter((p) => lastIds.has(p.id) && !p.archived).length;
  const byId = new Map(players.map((p) => [p.id, p.name]));
  const add = () => {
    const r = onAddPlayer(name);
    if ('error' in r) return setError(ROSTER_ERRORS[r.error]);
    setName('');
    setError(null);
  };
  const rows = (list: Player[]) => (
    <ul className="att-rows">
      {list.map((p) => (
        <li key={p.id}>
          <label>
            <input
              type="checkbox"
              aria-label={p.name}
              checked={training.attendees.includes(p.id)}
              onChange={() => onChange(toggleAttendee(training, p.id, players))}
            />
            <span className="att-name">
              {p.name}
              {p.archived && <span className="archived-tag"> (archiv)</span>}
            </span>
            <AttendanceMeta a={att.get(p.id)} />
          </label>
        </li>
      ))}
    </ul>
  );
  const groupLast = shown.filter((p) => lastIds.has(p.id));
  const groupRest = shown.filter((p) => !lastIds.has(p.id));
  return (
    <div className="attendance-fields">
      <div className="att-tools">
        <input type="search" aria-label="Hledat hráče" placeholder="Hledat hráče" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="att-quick">
          {last && lastActive > 0 && (
            <button type="button" className="pill primary" onClick={() => onChange(withAttendees(training, last.attendees, players))}>
              Jako minule ({lastActive})
            </button>
          )}
          <button type="button" className="pill" disabled={!n} onClick={() => onChange(withAttendees(training, [], players))}>
            Nikdo
          </button>
        </span>
      </div>
      {!shown.length && <p className="note">Nikdo neodpovídá hledání „{query.trim()}“.</p>}
      {last && groupLast.length > 0 && (
        <section className="att-group" aria-label="Minule byli">
          <h3>
            Minule byli · {formatDayMonth(last.date)}
            <span>{groupLast.length}</span>
          </h3>
          {rows(groupLast)}
        </section>
      )}
      {groupRest.length > 0 && (
        <section className="att-group" aria-label={last ? 'Ostatní' : 'Hráči'}>
          {last && (
            <h3>
              Ostatní<span>{groupRest.length}</span>
            </h3>
          )}
          {rows(groupRest)}
        </section>
      )}
      <form
        className="add-form att-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="t-new-player" className="visually-hidden">
          Jméno nového hráče
        </label>
        <div className="add-row">
          <input id="t-new-player" value={name} placeholder="Jméno nového hráče" onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <button type="submit" className="ghost">
            Přidat a zaškrtnout
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
      <div className="att-bar" role="status" aria-label="Přítomní">
        <span className="att-count">
          <b>{n}</b> {plural(n, 'přítomný', 'přítomní', 'přítomných')}
        </span>
        <span className="att-names">{n ? training.attendees.map((p) => byId.get(p) ?? '?').join(', ') : 'nikdo vybraný'}</span>
        {n < min && (
          <span className="att-warn">
            Ještě chybí {min - n} {plural(min - n, 'hráč', 'hráči', 'hráčů')} do minima {min}. Méně hráčů si zacvičí ve vlastním tréninku.
          </span>
        )}
        {n > MAX_PLAYERS && <span className="att-warn">Moc hráčů: rozpis umí nejvýš {MAX_PLAYERS}.</span>}
      </div>
    </div>
  );
}

/** Simulace se hraje? (bez ní nemá smysl rozdělení týmů) */
export const simOn = (t: Training) => (t.format === 'custom' ? (t.plan.sim ?? 0) > 0 && t.attendees.length >= 4 : t.mode === 'team');

export const SPLIT_TEXT: Record<SimSplit, string> = { performance: 'vyrovnaně podle výkonu', order: 'podle nominačního pořadí', manual: 'ručně' };

/**
 * Týmy pro simulaci (panel u sekce simulace): vždy oba týmy a dvě možnosti. Vyrovnaně podle výkonu
 * je pevné (dopočítá se z výsledků scénářové ligy); ručně jde hráče přesouvat a rozházet Náhodně.
 */
export function SimTeamsFields({ training, currentTeams, players, onChange }: PartProps & { currentTeams: SimTeams | null; players: Player[] }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  if (!simOn(training)) return <p className="note">Simulace se v tomhle tréninku nehraje, týmy není potřeba dělit.</p>;
  const pickSplit = (simSplit: SimSplit) =>
    // Ručně: začni od týmů, které jsou právě vidět.
    onChange({ ...training, simSplit, simTeams: simSplit === 'manual' ? currentTeams : null });
  return (
    <div className="order-fields">
      <div className="split-options" role="radiogroup" aria-label="Týmy pro simulaci">
        {(
          [
            ['performance', 'Vyrovnaně podle výkonu v tréninku'],
            ['manual', 'Ručně'],
          ] as const
        ).map(([value, text]) => (
          <label key={value} className="split-option">
            <input type="radio" name={`split-${training.id}`} value={value} checked={training.simSplit === value} onChange={() => pickSplit(value)} />
            {text}
          </label>
        ))}
      </div>
      {currentTeams &&
        (training.simSplit === 'manual' ? (
          <>
            <button type="button" className="ghost" onClick={() => onChange({ ...training, simTeams: randomTeams(currentTeams, Math.random) })}>
              Náhodně
            </button>
            <SimTeamsEditor teams={currentTeams} byId={byId} onChange={(t) => onChange({ ...training, simTeams: t })} />
          </>
        ) : (
          <>
            <TeamsView teams={currentTeams} byId={byId} />
            <p className="note">Týmy se vyrovnají podle výsledků scénářové ligy v tomhle tréninku a zamknou se prvním výsledkem simulace.</p>
          </>
        ))}
    </div>
  );
}

/** Oba týmy jen ke čtení (vyrovnaně podle výkonu). */
function TeamsView({ teams, byId }: { teams: SimTeams; byId: Map<string, Player> }) {
  return (
    <div className="teams-editor">
      {(['A', 'B'] as const).map((side) => (
        <div key={side} className="team-col">
          <h3>
            Tým {side} <span className="muted">({teams[side].length})</span>
          </h3>
          <ol className="order-list" aria-label={`Tým ${side}`}>
            {teams[side].map((id, i) => (
              <li key={id}>
                <span className="pos">{i + 1}.</span>
                <span className="nm">{byId.get(id)?.name ?? '?'}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
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
          <ol className="order-list" aria-label={`Tým ${side}`}>
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
