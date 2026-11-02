import { fairness } from '../../domain/fairness';
import type { PlayerId, Schedule } from '../../domain/types';

/**
 * Pomocná kontrola pro admina: kolikrát spolu dva hráči hráli ve dvojici, kolikrát proti sobě,
 * počet zápasů a kol mimo stůl. Simulace se nepočítá (pevné týmy).
 */
export function FairnessPanel({ schedule, players, names }: { schedule: Schedule; players: PlayerId[]; names: Record<PlayerId, string> }) {
  const f = fairness(schedule, players);
  const nm = (p: PlayerId) => names[p] ?? '?';
  const matrix = (label: string, value: (a: PlayerId, b: PlayerId) => number, max: number) => (
    <div className="fairness-wrap">
      <table className="fairness-table" aria-label={label}>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th />
            {players.map((p) => (
              <th key={p} scope="col">
                {nm(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((a) => (
            <tr key={a}>
              <th scope="row">{nm(a)}</th>
              {players.map((b) => {
                if (a === b) return <td key={b} className="self">–</td>;
                const v = value(a, b);
                const cls = v === 0 ? 'never' : v > 1 && v === max ? 'hot' : undefined;
                return (
                  <td key={b} className={cls} title={`${nm(a)} a ${nm(b)}: ${v}×`}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <details className="fairness no-print">
      <summary>Kontrola rozpisu: kdo s kým kolikrát</summary>
      <p className="note">
        Počítají se zápasy v kolech (bez simulace, ta má pevné týmy). <span className="never-key">0</span> = nikdy, <span className="hot-key">n</span> = nejčastěji.
        Párová kola (Zeď, Start 0:3, Start 4:5) hrají stejné zápasy dvakrát s prohozenými stranami. Vidí jen admin.
      </p>
      <div className="fairness-grid">
        {matrix('Spoluhráči: kolikrát spolu ve dvojici', f.together, f.maxTogether)}
        {matrix('Soupeři: kolikrát proti sobě', f.against, f.maxAgainst)}
        <div className="fairness-wrap">
          <table className="fairness-table" aria-label="Zápasy a mimo stůl">
            <caption>Zápasy a mimo stůl</caption>
            <thead>
              <tr>
                <th />
                <th scope="col">Zápasy</th>
                <th scope="col">Mimo stůl</th>
              </tr>
            </thead>
            <tbody>
              {players.map((a) => (
                <tr key={a}>
                  <th scope="row">{nm(a)}</th>
                  <td>{f.games.get(a) ?? 0}</td>
                  <td>{f.sits.get(a) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
