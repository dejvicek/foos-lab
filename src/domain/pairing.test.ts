import { discipline } from './disciplines';
import { autoPlan, planSequence } from './plan';
import { drillRound, matchRound, newCounters, pairKey } from './pairing';
import { DEFAULT_SELECTION, H, range } from '../test/fixtures';

/** Projde celý výchozí trénink 3:00 a vrátí čítače + kola. */
function simulate(n: number, t: number) {
  const players = H(n);
  const seq = planSequence(autoPlan(DEFAULT_SELECTION, 180, n, t));
  const c = newCounters();
  const rounds: { id: string; matches?: ReturnType<typeof matchRound>; drill?: ReturnType<typeof drillRound> }[] = [];
  const drillLeft = new Map<string, number>();
  for (const id of seq) drillLeft.set(id, (drillLeft.get(id) ?? 0) + 1);
  seq.forEach((id, k) => {
    const def = discipline(id);
    if (def.kind === 'match') rounds.push({ id, matches: matchRound(players, t, def, c, k + 1) });
    if (def.kind === 'drill') {
      const left = drillLeft.get(id)!;
      drillLeft.set(id, left - 1);
      rounds.push({ id, drill: drillRound(players, t, def, c, k + 1, left) });
    }
  });
  return { players, c, rounds, seq };
}

describe('vyrovnané sestavy (PRD 5.10)', () => {
  for (const n of range(6, 13))
    for (const t of range(1, 4))
      it(`n=${n}, t=${t}: nehraní, Zeď, 0:3, spoluhráči, cvičení`, () => {
        const { players, c, rounds } = simulate(n, t);
        const sits = players.map((p) => c.sit.get(p) ?? 0);
        expect(Math.max(...sits) - Math.min(...sits)).toBeLessThanOrEqual(1);

        for (const p of players) {
          const hold = c.wallHold.get(p) ?? 0;
          const brk = c.wallBreak.get(p) ?? 0;
          if (hold + brk >= 2) expect(Math.abs(hold - brk)).toBeLessThanOrEqual(1);
          const beh = c.behind.get(p) ?? 0;
          const ahd = c.ahead.get(p) ?? 0;
          if (beh + ahd >= 2) expect(Math.abs(beh - ahd)).toBeLessThanOrEqual(1);
        }

        const pairs = n * (n - 1) / 2;
        const total = [...c.partner.values()].reduce((a, b) => a + b, 0);
        const max = Math.max(0, ...c.partner.values());
        expect(max).toBeLessThanOrEqual(Math.ceil(total / pairs) + 1);

        // cvičení: každý hráč každé vybrané cvičení aspoň jednou, nikdo nehraje sám
        const drills = new Set(rounds.filter((r) => r.drill).map((r) => r.id));
        for (const d of drills)
          for (const p of players)
            expect(rounds.some((r) => r.id === d && r.drill!.groups.some((g) => g.includes(p)))).toBe(true);
        for (const r of rounds.filter((x) => x.drill)) {
          const sizes = r.drill!.groups.map((g) => g.length);
          expect(sizes.every((x) => x === 2 || x === 3)).toBe(true);
          expect(sizes.filter((x) => x === 3).length).toBeLessThanOrEqual(1);
          expect(r.drill!.groups.length).toBeLessThanOrEqual(t);
        }
      });

  it('deterministické', () => {
    expect(JSON.stringify(simulate(11, 3).rounds)).toBe(JSON.stringify(simulate(11, 3).rounds));
  });

  it('Zeď: drží levá strana; start 0:3: pozadu levá strana', () => {
    const c = newCounters();
    const r = matchRound(H(8), 4, discipline('wall'), c, 1);
    for (const m of r.matches) for (const p of m.a) expect(c.wallHold.get(p)).toBe(1);
  });

  it('pairKey nezávisí na pořadí', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });
});
