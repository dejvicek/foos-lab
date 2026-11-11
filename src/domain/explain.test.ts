import { explanationsFor } from './explain';
import { EXPLANATIONS } from './content';
import { buildSchedule } from './schedule';
import { H } from '../test/fixtures';

const team = buildSchedule({ mode: 'team', tables: 4, attendees: H(13) });
const custom = buildSchedule({ mode: 'team', tables: 4, attendees: H(8), format: 'custom', plan: { warmupPasses: 1, chain: 1, start03: 1, singles: 1 }, lockedRounds: [] });
const single = buildSchedule({ mode: 'single', tables: 2, attendees: H(5) });
const drills = buildSchedule({ mode: 'team', tables: 2, attendees: H(4), format: 'custom', plan: { warmup: 1, passWallLane: 2, penaltyKeeper: 2, penaltySolo: 2, backShotKeeper: 2, backShotSolo: 2, clearing: 2, looseBall: 2, streakShot3: 1, streakPass5: 1, streakShot2: 1, streakPass2: 1 }, lockedRounds: [] });
const ending = buildSchedule({ mode: 'team', tables: 2, attendees: H(4), format: 'custom', plan: { start45: 2 }, lockedRounds: [] });
const rowByLabel = (s: typeof team, label: string) => s.sections.flatMap((x) => x.rows).find((r) => r.label === label)!;
const names = (items: { name: string }[]) => items.map((i) => i.name);

describe('vysvětlivky u bloků', () => {
  it('kolo 3: Zeď; obecně Každý gól se počítá a Role rozhodčího', () => {
    const e = explanationsFor(rowByLabel(team, '3. kolo'));
    expect(names(e.main)).toEqual(['Zeď']);
    expect(names(e.general)).toEqual(['Každý gól se počítá', 'Role rozhodčího']);
  });
  it('kolo 5: Start 0:3 a Daň za ztrátu', () => {
    expect(names(explanationsFor(rowByLabel(team, '5. kolo')).main)).toEqual(['Start 0:3', 'Daň za ztrátu']);
  });
  it('stanoviště: u každého stolu jeho stanoviště', () => {
    const e = explanationsFor(rowByLabel(team, 'Stanoviště, rotace 1'));
    expect(e.perTable.map((x) => x?.name)).toEqual(['Udržení míče na pětce', 'Penalta z místa', 'Rozehrávka ze zadních tyčí', undefined]);
  });
  it('jedničky: rozehrání a řetězec', () => {
    expect(names(explanationsFor(rowByLabel(single, 'Rozehrání: rozehrávka z dvojky')).main)).toEqual(['Rozehrávka ze zadních tyčí']);
    expect(names(explanationsFor(rowByLabel(single, 'Řetězec (střídání po 10 pokusech)')).main)).toEqual(['Řetězec (trénink jedniček)']);
  });
  it('konfigurovatelný trénink: nápověda podle disciplíny kola, cvičení jednou za kolo', () => {
    const r = custom.sections.flatMap((x) => x.rows).filter((x) => x.kind !== 'break');
    expect(names(explanationsFor(r[0]).main)).toEqual(['Přihrávky na pětce']);
    expect(explanationsFor(r[0]).perTable.every((x) => x === null)).toBe(true);
    expect(names(explanationsFor(r[1]).main)).toEqual(['Řetězec']);
    expect(names(explanationsFor(r[2]).main)).toEqual(['Start 0:3', 'Daň za ztrátu']);
    expect(names(explanationsFor(r[3]).main)).toEqual(['Normální leg']);
  });

  it('Start 4:5: u kola jeho pravidlo', () => {
    const r = ending.sections.flatMap((x) => x.rows).filter((x) => x.kind !== 'break');
    expect(names(explanationsFor(r[0]).main)).toEqual(['Start 4:5']);
  });

  it('kritérium 8: každý text vysvětlivek je u nějakého bloku', () => {
    const shown = new Set<string>();
    for (const s of [team, single, custom, ending, drills])
      for (const row of s.sections.flatMap((x) => x.rows)) {
        const e = explanationsFor(row);
        [...e.main, ...e.general, ...e.perTable].forEach((i) => i && shown.add(i.name));
      }
    expect([...shown].sort()).toEqual(EXPLANATIONS.flatMap((g) => g.items.map((i) => i.name)).sort());
  });
});
