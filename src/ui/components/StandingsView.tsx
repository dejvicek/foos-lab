import { useState } from 'react';
import { computeStandings } from '../../domain/standings';
import type { DelayRow } from '../../domain/queue';
import type { MatchId, PlayerId, Schedule, Score } from '../../domain/types';
import { dec1, signed } from '../format';
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
          <DelayTable rows={delays} names={props.names} />
          <p className="note">Čekání = od chvíle, kdy hráč mohl hrát (volní hráči i stůl), do zahájení utkání. Připisuje se všem hráčům utkání.</p>
        </div>
      )}
      {shown === 'sim' && <SimView {...props} />}
    </section>
  );
}

/** Simulace kola (PRD 5.3, 5.5): stav utkání týmů a vyhrané zápasy hráčů. */
function SimView({ schedule, scores, attendees, names }: Props) {
  const { rows, sim } = computeStandings(schedule, scores, attendees);
  const sims = schedule.matches.filter((m) => m.block === 'sim');
  const team = (side: 'sideA' | 'sideB') => [...new Set(sims.flatMap((m) => m[side]))];
  const teamA = team('sideA'), teamB = team('sideB');
  const nm = (ids: PlayerId[]) => ids.map((p) => names[p] ?? '?').join(', ');
  const byTeam = (ids: PlayerId[]) => rows.filter((r) => ids.includes(r.playerId)).sort((a, b) => b.simW - a.simW || a.simM - b.simM);
  if (!sim || sim.played === 0) return <p className="note">Simulace se zatím nehrála.</p>;
  return (
    <div className="sim-summary">
      <p className="teams">
        Tým A <b>{sim.teamA} : {sim.teamB}</b> tým B
        <span className="rule">
          odehráno {sim.played} z {sims.length} zápasů
        </span>
      </p>
      <p className="note">
        Tým A: {nm(teamA)} · Tým B: {nm(teamB)}
      </p>
      <div className="wrap">
        <table aria-label="Simulace">
          <thead>
            <tr>
              <th>Hráč</th>
              <th>Tým</th>
              <th className="n">Zápasy</th>
              <th className="n">Výhry</th>
            </tr>
          </thead>
          <tbody>
            {[...byTeam(teamA).map((r) => ['A', r] as const), ...byTeam(teamB).map((r) => ['B', r] as const)].map(([t, r]) => (
              <tr key={r.playerId}>
                <td>{names[r.playerId] ?? '?'}</td>
                <td>{t}</td>
                <td className="n">{r.simM}</td>
                <td className="n">{r.simW}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Ze simulace se počítají vyhrané zápasy, ne góly. V Pořadí rozhodují výhry v simulaci až při shodě rozdílu, výher a gólů.</p>
    </div>
  );
}

/** Pořadí v rámci jednoho tréninku (PRD 5.5). */
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
            <table aria-label="Souhrn tréninku">
              <thead>
                <tr>
                  <th>Pořadí</th>
                  <th>Hráč</th>
                  <th className="n">Legy</th>
                  <th className="n">Výhry</th>
                  <th className="n">Góly +</th>
                  <th className="n">Góly −</th>
                  <th className="n">Rozdíl</th>
                  <th className="n">Ztráty / leg</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x, i) => (
                  <tr key={x.playerId}>
                    <td className="n">{i + 1}.</td>
                    <td>{names[x.playerId] ?? '?'}</td>
                    <td className="n">{x.legs}</td>
                    <td className="n">{x.wins}</td>
                    <td className="n">{x.gf}</td>
                    <td className="n">{x.gc}</td>
                    <td className={x.diff > 0 ? 'n pos' : x.diff < 0 ? 'n neg' : 'n'}>{signed(x.diff)}</td>
                    <td className="n">{x.lossLegs ? dec1(x.loss / x.lossLegs) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Pořadí dělá rozdíl skóre ze scénářové ligy (pravidlo Každý gól se počítá), pak výhry. Ztráty na leg se počítají jen z legů Daně za ztrátu, kde byly zapsané. U scénářových startů jde do skóre jen to, co se v kole odehrálo. Při úplné shodě rozhodují výhry v simulaci.
          </p>
        </>
      )}
    </div>
  );
}
