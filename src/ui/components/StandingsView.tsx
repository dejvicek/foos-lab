import { useState, type ReactNode } from 'react';
import { computeStandings } from '../../domain/standings';
import { simSheet, type SimSheet, type SimSheetRow } from '../../domain/simSheet';
import type { DelayRow } from '../../domain/queue';
import type { MatchId, PlayerId, Schedule, Score } from '../../domain/types';
import { diffCls, signed, STRONG_PER_TRAINING } from '../format';
import { Seg } from './Seg';
import { Medal, podiumRow } from './Rank';
import { placeAndSort, RankTh, SortTh, sortedCls, useSort, type SortCol } from './SortTable';
import { DelayTable } from './Timing';

interface Props {
  schedule: Schedule;
  scores: Record<MatchId, Score>;
  attendees: PlayerId[];
  names: Record<PlayerId, string>;
  /** Přihlášený hráč – v Pořadí a Zdržovačích jméno zlatě (20. 11. 2026). */
  me?: PlayerId | null;
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
          <DelayTable rows={delays} names={props.names} me={props.me} compact />
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
 * řádek na zápas po vlnách – Domácí : Hosté (vítěz tučně s linkou v barvě týmu), Hry s legy, Body, průběžný Stav.
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
        <td className="n sim-pts">{r.points ? pair(r.points) : r.state === 'playing' ? <span className="sim-live">hraje se</span> : <span className="muted">–</span>}</td>
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
              <th className="n">Hry</th>
              <th className="n">Body</th>
              <th className="n">Stav</th>
            </tr>
          </thead>
          <tbody>
            {rows}
            <tr className="sim-total">
              <td colSpan={2}>Celkově</td>
              <td className="n">{pair(sh.games)}</td>
              <td className="n">{pair(sh.points)}</td>
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
 * Pořadí v rámci jednoho tréninku (PRD 5.5). Kompaktně a jednotně se Zdržovači (19. 11. 2026, *rozhodnutí uživatele*):
 * hned za jménem to, podle čeho se řadí: Rozdíl, L+ / L− (vyhrané / prohrané legy, od 19. 11. 2026 místo Výher
 * a Legů), G+ / G−; řadit jde klikem na záhlaví, „#“ vrátí oficiální pořadí. Bez ztrát.
 */
export function StandingsView({ schedule, scores, attendees, names, me = null }: Props) {
  const [sort, setSort] = useSort();
  const { rows, legsDone, sim } = computeStandings(schedule, scores, attendees);
  const empty = legsDone === 0 && (!sim || sim.played === 0);
  type Row = (typeof rows)[number];
  const cols: SortCol<Row>[] = [
    { key: 'name', label: 'Hráč', value: (r) => names[r.playerId] ?? '?', first: 'asc' },
    // G± = rozdíl skóre (19. 11. 2026, *rozhodnutí uživatele*: krátce jako G+ / G−).
    { key: 'diff', label: <span title="Rozdíl skóre (G+ − G−)">G±</span>, className: 'n', value: (r) => r.diff },
    { key: 'wins', label: <span title="Vyhrané legy">L+</span>, className: 'n', value: (r) => r.wins },
    { key: 'lost', label: <span title="Prohrané legy">L−</span>, className: 'n', value: (r) => r.legs - r.wins, first: 'asc' },
    { key: 'gf', label: <span title="Góly vstřelené">G+</span>, className: 'n', value: (r) => r.gf },
    { key: 'gc', label: <span title="Góly obdržené">G−</span>, className: 'n', value: (r) => r.gc, first: 'asc' },
  ];
  const items = placeAndSort(rows, [], cols, sort);
  const played = (r: Row) => r.legs > 0 || r.simM > 0;
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
                  <RankTh sort={sort} onReset={() => setSort(null)} />
                  {cols.map((c) => (
                    <SortTh key={c.key} col={c} sort={sort} onSort={setSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(({ r: x, place }) => (
                  // Medaile pro první tři jako v žebříčku (19. 11. 2026); kdo nic neodehrál, medaili nedostane.
                  <tr key={x.playerId} className={podiumRow(place, played(x))}>
                    <td className="n rank">
                      <Medal place={place} ranked={played(x)} />
                    </td>
                    <td className={sortedCls(sort, 'name', 'name')}>{x.playerId === me ? <b className="me-name">{names[x.playerId] ?? '?'}</b> : (names[x.playerId] ?? '?')}</td>
                    <td className={sortedCls(sort, 'diff', diffCls(x.diff, x.diff >= STRONG_PER_TRAINING))}>{signed(x.diff)}</td>
                    <td className={sortedCls(sort, 'wins', 'n')}>{x.wins}</td>
                    <td className={sortedCls(sort, 'lost', 'n')}>{x.legs - x.wins}</td>
                    <td className={sortedCls(sort, 'gf', 'n')}>{x.gf}</td>
                    <td className={sortedCls(sort, 'gc', 'n')}>{x.gc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <How>
            Pořadí dělá rozdíl skóre ze scénářové ligy (pravidlo Každý gól se počítá), pak vyhrané legy (L+) a vstřelené góly (G+).
            L− jsou prohrané legy. U scénářových startů jde do skóre jen to, co se v kole
            odehrálo. Při úplné shodě rozhodují výhry v simulaci.
          </How>
        </>
      )}
    </div>
  );
}
