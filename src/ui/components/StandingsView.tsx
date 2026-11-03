import { computeStandings } from '../../domain/standings';
import type { MatchId, PlayerId, Schedule, Score } from '../../domain/types';
import { dec1, signed } from '../format';

interface Props {
  schedule: Schedule;
  scores: Record<MatchId, Score>;
  attendees: PlayerId[];
  names: Record<PlayerId, string>;
}

export function StandingsView({ schedule, scores, attendees, names }: Props) {
  const { rows, legsDone, sim } = computeStandings(schedule, scores, attendees);
  const hasSim = sim !== null;
  const empty = legsDone === 0 && (!sim || sim.played === 0);
  return (
    <section className="standings">
      <h2>Souhrn: kdo si jak vede</h2>
      {empty ? (
        <p className="note">Zatím žádné skóre. Zapiš výsledky u zápasů výš a pořadí se objeví tady.</p>
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
            Pořadí dělá rozdíl skóre ze scénářové ligy (pravidlo Každý gól se počítá), pak výhry. Ztráty na leg se počítají jen z legů, kde byly zapsané. U scénářových startů jde do skóre jen to, co se v kole odehrálo. Při simulaci kola se počítají výhry, ne góly, protože se hraje na sety.
          </p>
        </>
      )}
    </section>
  );
}
