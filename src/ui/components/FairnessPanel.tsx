import { fairness } from '../../domain/fairness';
import type { PlayerId, Schedule } from '../../domain/types';

/**
 * Pomocná kontrola pro admina: kolikrát spolu hráli dva hráči ve dvojici a kolikrát proti sobě,
 * počet zápasů a kol mimo stůl. Simulace se nepočítá (pevné týmy).
 */
export function FairnessPanel({ schedule, players, names }: { schedule: Schedule; players: PlayerId[]; names: Record<PlayerId, string> }) {
  const f = fairness(schedule, players);
  const nm = (p: PlayerId) => names[p] ?? '?';
  return (
    <details className="fairness no-print">
      <summary>Kontrola rozpisu: kdo s kým kolikrát</summary>
      <p className="note">
        V buňce <b>spolu</b> / <b>proti</b> – kolikrát hráli ve dvojici a kolikrát proti sobě (bez simulace). Zvýrazněné jsou nejčastější dvojice. Vidí jen admin.
      </p>
      <div className="fairness-wrap">
        <table className="fairness-table" aria-label="Kdo s kým kolikrát">
          <thead>
            <tr>
              <th />
              {players.map((p) => (
                <th key={p} scope="col">
                  {nm(p)}
                </th>
              ))}
              <th scope="col">Zápasy</th>
              <th scope="col">Mimo stůl</th>
            </tr>
          </thead>
          <tbody>
            {players.map((a) => (
              <tr key={a}>
                <th scope="row">{nm(a)}</th>
                {players.map((b) => {
                  if (a === b) return <td key={b} className="self">–</td>;
                  const t = f.together(a, b);
                  const v = f.against(a, b);
                  const hot = t > 1 && t === f.maxTogether;
                  return (
                    <td key={b} className={[hot ? 'hot' : '', t + v === 0 ? 'zero' : ''].filter(Boolean).join(' ') || undefined} title={`${nm(a)} a ${nm(b)}: spolu ${t}×, proti ${v}×`}>
                      <span className="tg">{t}</span>
                      <span className="sep">/</span>
                      <span className="vs">{v}</span>
                    </td>
                  );
                })}
                <td className="num">{f.games.get(a) ?? 0}</td>
                <td className="num">{f.sits.get(a) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
