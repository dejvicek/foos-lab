import { currentRow, defaultOpenRow, firstIncomplete, liveTag, minutesSinceStart } from './now';
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

describe('štítek tréninku v seznamu', () => {
  const t = training('t1', '2026-10-31', 'team', H(8));
  it('jiný den nic; dnes před začátkem, během kola a po konci', () => {
    expect(liveTag(t, 'H1', new Date(2026, 9, 30, 19, 21))).toBeNull();
    expect(liveTag(t, 'H1', new Date(2026, 9, 31, 17, 30))).toBe('Hraješ, začátek v 18:00');
    expect(liveTag(t, 'X', new Date(2026, 9, 31, 17, 30))).toBe('Dnes v 18:00');
    expect(liveTag(t, 'H1', new Date(2026, 9, 31, 19, 21))).toBe('Hraješ – 3. kolo právě běží');
    expect(liveTag(t, null, new Date(2026, 9, 31, 19, 21))).toBe('3. kolo právě běží');
    expect(liveTag(t, 'H1', new Date(2026, 9, 31, 23, 50))).toBe('Dnes, dohráno');
  });
});
