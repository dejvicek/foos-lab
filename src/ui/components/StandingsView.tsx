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

type Part = 'standings' | 'delays';

/**
 * Souhrn tréninku nahoře nad rozpisem (19. 11. 2026, *rozhodnutí uživatele*): přepínač Pořadí / Zdržovači.
 * Dokud není co ukázat (žádné skóre ani čekání), se nezobrazuje.
 */
export function TrainingSummary({ delays, ...props }: Props & { delays: DelayRow[] }) {
  const [part, setPart] = useState<Part>('standings');
  const { legsDone, sim } = computeStandings(props.schedule, props.scores, props.attendees);
  const empty = legsDone === 0 && (!sim || sim.played === 0);
  if (empty && !delays.length) return null;
  const shown: Part = delays.length ? part : 'standings';
  return (
    <section className="summary" aria-label="Souhrn">
      <div className="summary-head">
        <h2>Souhrn</h2>
        {delays.length > 0 && (
          <Seg<Part> value={shown} label="Souhrn" options={[['standings', 'Pořadí'], ['delays', 'Zdržovači']]} onChange={setPart} />
        )}
      </div>
      {shown === 'standings' ? (
        <StandingsView {...props} />
      ) : (
        <div className="delays">
          <DelayTable rows={delays} names={props.names} />
          <p className="note">Čekání = od chvíle, kdy hráč mohl hrát (volní hráči i stůl), do zahájení utkání. Připisuje se všem hráčům utkání.</p>
        </div>
      )}
    </section>
  );
}

/** Pořadí v rámci jednoho tréninku (PRD 5.5). */
export function StandingsView({ schedule, scores, attendees, names }: Props) {
  const { rows, legsDone, sim } = computeStandings(schedule, scores, attendees);
  const hasSim = sim !== null;
  const empty = legsDone === 0 && (!sim || sim.played === 0);
  return (
    <div className="standings">
      {empty ? (
        <p className="note">Zatím žádné skóre. Pořadí se objeví po prvních zapsaných výsledcích.</p>
      ) : (
        <>
          {sim && (
            <div className="teams">
              Simulace kola: tým A {sim.teamA} : {sim.teamB} tým B
              {sim.played > 0 && <span className="rule">odehráno {sim.played} zápasů</span>}
            </div>
          )}
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
                  {hasSim && <th className="n">Simulace (výhry / zápasy)</th>}
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
                    {hasSim && (
                      <td className="n">
                        {x.simW} / {x.simM}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Pořadí dělá rozdíl skóre ze scénářové ligy (pravidlo Každý gól se počítá), pak výhry. Ztráty na leg se počítají jen z legů Daně za ztrátu, kde byly zapsané. U scénářových startů jde do skóre jen to, co se v kole odehrálo. Ze simulace kola se počítají vyhrané zápasy, ne góly.
          </p>
        </>
      )}
    </div>
  );
}
