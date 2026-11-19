import { useState, type ReactNode } from 'react';
import { computeStandings } from '../../domain/standings';
import { simSheet, type SimSheet, type SimSheetRow } from '../../domain/simSheet';
import type { DelayRow } from '../../domain/queue';
import type { MatchId, PlayerId, Schedule, Score } from '../../domain/types';
import { signed } from '../format';
import { Seg } from './Seg';
import { DelayTable } from './Timing';

interface Props {
  schedule: Schedule;
  scores: Record<MatchId, Score>;
  attendees: PlayerId[];
  names: Record<PlayerId, string>;
}

type Part = 'standings' | 'delays' | 'sim';

/**
 * Souhrn tréninku nahoře nad rozpisem (19. 11. 2026, *rozhodnutí uživatele*): bez nadpisu, přepínač
 * Pořadí / Zdržovači (když někdo čekal) / Simulace (když ji trénink má). Dokud není co ukázat, se nezobrazuje.
 */
export function TrainingSummary({ delays, ...props }: Props & { delays: DelayRow[] }) {
  const [part, setPart] = useState<Part>('standings');
  const { legsDone, sim } = computeStandings(props.schedule, props.scores, props.attendees);
  const hasSim = props.schedule.matches.some((m) => m.block === 'sim');
  const empty = legsDone === 0 && (!sim || sim.played === 0);
  if (empty && !delays.length) return null;
  const options: [Part, string][] = [['standings', 'Pořadí']];
  if (delays.length) options.push(['delays', 'Zdržovači']);
  if (hasSim) options.push(['sim', 'Simulace']);
  const shown: Part = options.some(([v]) => v === part) ? part : 'standings';
  return (
    <section className="summary" aria-label="Souhrn">
      {options.length > 1 && <Seg<Part> value={shown} label="Souhrn" options={options} onChange={setPart} />}
      {shown === 'standings' && <StandingsView {...props} />}
      {shown === 'delays' && (
        <div className="delays">
          <DelayTable rows={delays} names={props.names} compact />
          <How>Čekání = od chvíle, kdy hráč mohl hrát (volní hráči i stůl), do zahájení utkání. Připisuje se všem hráčům utkání.</How>
        </div>
      )}
      {shown === 'sim' && <SimView {...props} />}
    </section>
  );
}

const pair = (x: [number, number] | null) => (x ? `${x[0]}:${x[1]}` : null);

/**
 * Simulace kola jako ligový zápis (19. 11. 2026, *rozhodnutí uživatele*, návrh B): nahoře skóre týmů se sestavami,
 * řádek na zápas po vlnách – Domácí : Hosté (vítěz tučně s linkou v barvě týmu), Body, Hry s legy, průběžný Stav.
 */
function SimView({ schedule, scores, attendees, names }: Props) {
  const sh = simSheet(schedule, scores, attendees);
  if (!sh) return null;
  const nm = (id: PlayerId) => names[id] ?? '?';
  const codeOf = new Map([...sh.teamA, ...sh.teamB].map((x) => [x.id, x.code]));
  const side = (cls: 'a' | 'b', label: string, team: SimSheet['teamA']) => (
    <div className={`sim-side ${cls}`}>
      <span className="sim-k">{cls === 'a' ? 'domácí' : 'hosté'}</span>
      <span className="sim-team">
        <i className={`tl-dot side-${cls}`} />
        {label}
      </span>
      <span className="sim-members">
        {team.map((x) => (
          <span key={x.id}>
            <b>{x.code}</b>
            {nm(x.id)}
          </span>
        ))}
      </span>
    </div>
  );
  const who = (r: SimSheetRow, s: 'a' | 'b') => {
    const ids = s === 'a' ? r.sideA : r.sideB;
    const won = !!r.points && r.points[s === 'a' ? 0 : 1] > r.points[s === 'a' ? 1 : 0];
    const codes = r.kind === 'doubles' ? <code>{ids.map((p) => codeOf.get(p)).join(',')}</code> : null;
    return (
      <span className={won ? `win ${s}` : undefined} data-codes={r.kind === 'doubles' && s === 'b' ? ids.map((p) => codeOf.get(p)).join(',') : undefined}>
        {s === 'b' && codes}
        {ids.map(nm).join(', ')}
        {s === 'a' && codes}
      </span>
    );
  };
  const rows: ReactNode[] = [];
  let wave = 0;
  for (const r of sh.rows) {
    if (r.wave !== wave) {
      wave = r.wave;
      rows.push(
        <tr key={`w${wave}`} className="sim-wave">
          <td colSpan={5}>{wave}. vlna</td>
        </tr>,
      );
    }
    rows.push(
      <tr key={r.no}>
        <td className="sim-no" title={r.kind === 'doubles' ? 'Dvojice' : 'Jednotlivci'}>
          {r.no}
        </td>
        <td>
          <div className="sim-ppl">
            {who(r, 'a')}
            <span className="sim-c">:</span>
            {who(r, 'b')}
          </div>
        </td>
        <td className="n sim-pts">{r.points ? pair(r.points) : r.state === 'playing' ? <span className="sim-live">hraje se</span> : <span className="muted">–</span>}</td>
        <td className="n">
          <b>{pair(r.games) ?? <span className="muted">–</span>}</b>
          {r.legs.length > 0 && (
            <span className="sim-legs" aria-label={`Legy ${r.legs.map((l) => `${l[0]}:${l[1]}`).join(', ')}`}>
              {r.legs.map((l, i) => (
                <span key={i}>
                  {l[0]}:{l[1]}
                </span>
              ))}
            </span>
          )}
        </td>
        <td className="n sim-run">{pair(r.running)}</td>
      </tr>,
    );
  }
  return (
    <div className="sim-sheet">
      <div className="sim-head">
        {side('a', 'Tým A', sh.teamA)}
        <div className="sim-big">
          <div className="sim-score">
            {sh.points[0]} : {sh.points[1]}
          </div>
          <div className="sim-sub">
            {sh.played === sh.rows.length ? 'dohráno' : `odehráno ${sh.played} z ${sh.rows.length}`}
          </div>
        </div>
        {side('b', 'Tým B', sh.teamB)}
      </div>
      <div className="wrap">
        <table aria-label="Simulace" className="sim-table">
          <thead>
            <tr>
              <th className="sim-no" title="Zápas">#</th>
              <th className="sim-mid">Domácí : Hosté</th>
              <th className="n">Body</th>
              <th className="n">Hry</th>
              <th className="n">Stav</th>
            </tr>
          </thead>
          <tbody>
            {rows}
            <tr className="sim-total">
              <td colSpan={2}>Celkově</td>
              <td className="n">{pair(sh.points)}</td>
              <td className="n">{pair(sh.games)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Vysvětlivka pod tabulkou souhrnu – sbalená, ať tabulka zabírá málo místa (19. 11. 2026). */
const How = ({ children }: { children: ReactNode }) => (
  <details className="summary-how">
    <summary>Jak se počítá</summary>
    <p>{children}</p>
  </details>
);

/**
 * Pořadí v rámci jednoho tréninku (PRD 5.5). Kompaktně (19. 11. 2026): góly zvlášť G+ / G−,
 * bez ztrát (*rozhodnutí uživatele*), vysvětlivka sbalená.
 */
export function StandingsView({ schedule, scores, attendees, names }: Props) {
  const { rows, legsDone, sim } = computeStandings(schedule, scores, attendees);
  const empty = legsDone === 0 && (!sim || sim.played === 0);
  return (
    <div className="standings">
      {empty ? (
        <p className="note">Zatím žádné skóre. Pořadí se objeví po prvních zapsaných výsledcích.</p>
      ) : (
        <>
          <div className="wrap">
            <table aria-label="Souhrn tréninku" className="summary-table">
              <thead>
                <tr>
                  <th className="n" title="Pořadí">#</th>
                  <th>Hráč</th>
                  <th className="n">Legy</th>
                  <th className="n">Výhry</th>
                  <th className="n" title="Góly vstřelené">G+</th>
                  <th className="n" title="Góly obdržené">G−</th>
                  <th className="n">Rozdíl</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x, i) => (
                  <tr key={x.playerId}>
                    <td className="n">{i + 1}.</td>
                    <td className="name">{names[x.playerId] ?? '?'}</td>
                    <td className="n">{x.legs}</td>
                    <td className="n">{x.wins}</td>
                    <td className="n">{x.gf}</td>
                    <td className="n">{x.gc}</td>
                    <td className={x.diff > 0 ? 'n pos' : x.diff < 0 ? 'n neg' : 'n'}>{signed(x.diff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <How>
            Pořadí dělá rozdíl skóre ze scénářové ligy (pravidlo Každý gól se počítá), pak výhry. U scénářových startů jde do skóre jen to, co se v kole odehrálo. Při úplné shodě rozhodují výhry v simulaci.
          </How>
        </>
      )}
    </div>
  );
}
