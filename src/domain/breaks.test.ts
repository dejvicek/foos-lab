import { addBreak, breaksOf, BREAK_OPTIONS, moveBreak, removeBreak, setBreakMin } from './breaks';
import { buildSchedule } from './schedule';
import { autoPlan, DEFAULT_SELECTION, planTimeline } from './plan';
import { shuffleAttendees } from './training';
import type { LockedRound, Training } from './types';
import { H } from '../test/fixtures';

const custom = (over: Partial<Training> = {}): Training => ({
  id: 'c', date: '2026-11-02', startTime: '18:00', mode: 'team', tables: 4, attendees: H(8), scores: {}, soloResults: {},
  simSplit: 'order', simTeams: null, format: 'custom', durationMin: 180, plan: autoPlan(DEFAULT_SELECTION, 180, 8, 4), lockedRounds: [],
  ...over,
});
const breakRows = (t: Training) => buildSchedule(t).sections.flatMap((s) => s.rows).filter((r) => r.label === 'Pauza');
const roundTime = (t: Training, n: number) => buildSchedule(t).sections.flatMap((s) => s.rows).find((r) => r.roundNo === n)!.time;
const locked = (n: number, t: Training): LockedRound[] =>
  buildSchedule(t).sections.flatMap((s) => s.rows).filter((r) => r.roundNo && r.roundNo <= n)
    .map((r) => ({ discipline: r.discipline!, rows: [r] }) as LockedRound);

describe('pauzy (PRD 4.6)', () => {
  it('bez vlastního nastavení jako dřív: 10 min po každé hodině', () => {
    const t = custom();
    const b = breaksOf(t);
    expect(b.length).toBeGreaterThan(0);
    expect(b.every((x) => x.min === 10)).toBe(true);
    expect(breakRows(t).map((r) => r.rule)).toEqual(b.map(() => '10 min'));
  });

  it('časová osa s vlastními pauzami: pozice po kole, délka, přepočet časů', () => {
    const tl = planTimeline(['normal', 'normal', 'normal'], [{ after: 1, min: 15 }]);
    expect(tl.items.map((i) => i.kind)).toEqual(['round', 'break', 'round', 'round', 'final']);
    expect(tl.items[2].start).toBe(8 + 1 + 15);
    expect(tl.total).toBe(3 * 9 + 15 + 10);
    // pozice mimo rozsah se srovná, stejná pozice dvakrát jen jednou
    expect(planTimeline(['normal', 'normal'], [{ after: 5, min: 5 }, { after: 1, min: 10 }]).items.filter((i) => i.kind === 'break')).toHaveLength(1);
    expect(planTimeline(['normal', 'normal'], []).items.some((i) => i.kind === 'break')).toBe(false);
  });

  it('přidat, odebrat, změnit délku, přesunout; časy kol se posunou', () => {
    let t = custom({ breaks: [] });
    expect(breakRows(t)).toHaveLength(0);
    t = addBreak(t);
    expect(breaksOf(t)).toHaveLength(1);
    const at = breaksOf(t)[0].after;
    const before = roundTime(t, at + 1);
    t = setBreakMin(t, 0, 20);
    expect(roundTime(t, at + 1)).toBe(before + 10);
    t = moveBreak(t, 0, 2);
    expect(breaksOf(t)).toEqual([{ after: 2, min: 20 }]);
    expect(breakRows(t)[0].time).toBe(roundTime(t, 3) - 20);
    t = addBreak(t);
    expect(breaksOf(t)).toHaveLength(2);
    expect(moveBreak(t, 1, 2)).toBe(t); // na obsazené místo ne
    t = removeBreak(t, 0);
    expect(breaksOf(t)).toHaveLength(1);
    expect(BREAK_OPTIONS).toEqual([5, 10, 15, 20, 25, 30]);
  });

  it('první úprava převezme automatické pauzy a pak už se nemění samy', () => {
    const t = custom();
    const auto = breaksOf(t);
    const next = setBreakMin(t, 0, 15);
    expect(next.breaks).toEqual([{ ...auto[0], min: 15 }, ...auto.slice(1)]);
  });

  it('odehraná kola: pauzu mezi ně nejde přesunout ani ji odtud odebrat', () => {
    let t = custom({ breaks: [{ after: 2, min: 10 }, { after: 6, min: 10 }] });
    t = { ...t, lockedRounds: locked(4, t) };
    expect(moveBreak(t, 1, 3)).toBe(t); // do odehrané části
    expect(moveBreak(t, 0, 5)).toBe(t); // pauza v odehrané části
    expect(removeBreak(t, 0)).toBe(t);
    expect(moveBreak(t, 1, 4).breaks).toEqual([{ after: 2, min: 10 }, { after: 4, min: 10 }]); // hned za odehranými ano
    expect(setBreakMin(t, 0, 15).breaks![0].min).toBe(15); // délku opravit jde
  });

  it('pauzy se počítají do naplánovaného času', () => {
    const t = custom({ breaks: [] });
    const withBreak = setBreakMin(addBreak(t), 0, 30);
    const end = (x: Training) => buildSchedule(x).sections.at(-1)!.rows.at(-1)!.time;
    expect(end(withBreak) - end(t)).toBe(30);
  });
});

describe('náhodné pořadí přítomných', () => {
  it('zamíchá přítomné podle dodaného generátoru; nikoho neztratí', () => {
    const t = custom();
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const next = shuffleAttendees(t, rand);
    expect([...next.attendees].sort()).toEqual([...t.attendees].sort());
    expect(next.attendees).not.toEqual(t.attendees);
    expect(shuffleAttendees(t, () => 0.999999).attendees).toEqual(t.attendees);
  });
});
