import { currentRow, defaultOpenRow, firstIncomplete, minutesSinceStart } from './now';
import { liveTag } from './liveTag';
import { queueOf } from '../domain/queue';
import type { Training } from '../domain/types';
import { buildSchedule } from '../domain/schedule';
import { training } from '../test/fixtures';
import { H } from '../test/fixtures';

describe('now', () => {
  it('minuty od začátku jen v den tréninku', () => {
    expect(minutesSinceStart('2026-10-31', '18:00', new Date(2026, 9, 31, 19, 21))).toBe(81);
    expect(minutesSinceStart('2026-10-30', '18:00', new Date(2026, 9, 31, 19, 21))).toBeNull();
  });

  it('v 19:21 běží 3. kolo; před začátkem nic', () => {
    const s = buildSchedule({ mode: 'team', tables: 4, attendees: H(8) });
    const ref = currentRow(s, 81)!;
    expect(s.sections[ref.section].rows[ref.row].label).toBe('3. kolo');
    expect(currentRow(s, -5)).toBeNull();
    expect(currentRow(s, null)).toBeNull();
  });

  it('první blok s chybějícím zápisem', () => {
    const t = training('t', '2026-10-31', 'team', H(8));
    const s = buildSchedule(t);
    const ref = firstIncomplete(s, t)!;
    expect(s.sections[ref.section].rows[ref.row].label).toBe('Rozehrání s počítáním');
  });
});

describe('výchozí rozbalený blok', () => {
  const s = buildSchedule({ mode: 'team', tables: 4, attendees: H(8) });
  const t = training('t', '2026-10-31', 'team', H(8));
  const label = (ref: ReturnType<typeof defaultOpenRow>) => (ref ? s.sections[ref.section].rows[ref.row].label : null);

  it('když se nic nehraje (před zahájením, o pauze, po konci), rozbalí se první nevyplněný blok', () => {
    expect(label(defaultOpenRow(s, t, null))).toBe('Rozehrání s počítáním');
  });
  it('během hraní je rozbalené hrané kolo (podle skutečnosti, ne hodin)', () => {
    expect(label(defaultOpenRow(s, t, currentRow(s, 81)))).toBe('3. kolo');
  });
});

describe('štítek tréninku v seznamu (podle skutečnosti, ne hodin)', () => {
  const at = (h: number, m: number) => new Date(2026, 10, 3, h, m);
  const base: Training = {
    ...training('t1', '2026-11-03', 'team', H(4)), tables: 1, format: 'custom', durationMin: 60, plan: { normal: 3 }, lockedRounds: [], breaks: [],
  };
  const ids = queueOf(buildSchedule(base)).flatMap((e) => (e.kind === 'item' ? [e.id] : []));

  it('nezahájený: jiný den nic, dnes plánovaný začátek', () => {
    expect(liveTag(base, 'H1', new Date(2026, 10, 2, 19, 0))).toBeNull();
    expect(liveTag(base, 'H1', at(17, 30))).toBe('Hraješ, začátek v 18:00');
    expect(liveTag(base, 'X', at(17, 30))).toBe('Dnes v 18:00');
    // hodiny nerozhodují: po plánovaném začátku, ale nezahájený → pořád „začátek v“
    expect(liveTag(base, 'X', at(19, 30))).toBe('Dnes v 18:00');
  });

  it('zahájený: hrané kolo podle zahájených utkání; dohraný → dohráno', () => {
    const running = { ...base, playTimes: { training: { startedAt: at(18, 5).getTime() }, [ids[0]]: { startedAt: at(18, 6).getTime(), endedAt: at(18, 14).getTime() }, [ids[1]]: { startedAt: at(18, 15).getTime() } } };
    expect(liveTag(running, 'H1', at(18, 20))).toBe('Hraješ – běží 2. kolo');
    expect(liveTag(running, 'X', at(18, 20))).toBe('Běží 2. kolo');
    // klidně i před plánovaným začátkem
    const early = { ...base, playTimes: { training: { startedAt: at(17, 40).getTime() } } };
    expect(liveTag(early, 'X', at(17, 45))).toBe('Běží 1. kolo');
    const done = { ...base, playTimes: Object.fromEntries([['training', { startedAt: at(18, 0).getTime() }], ...ids.map((id) => [id, { startedAt: at(18, 1).getTime(), endedAt: at(18, 2).getTime() }])]) };
    expect(liveTag(done, 'H1', at(19, 0))).toBe('Dnes, dohráno');
  });
});
