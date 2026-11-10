import { attendance, lastTraining } from './attendance';
import type { Training } from './types';
import { training } from '../test/fixtures';

const t = (id: string, date: string, attendees: string[]): Training => ({ ...training(id, date, 'team', attendees) });

describe('docházka (10. 11. 2026)', () => {
  const ts = [
    t('a', '2026-10-01', ['x', 'y']),
    t('b', '2026-10-14', ['x']),
    t('c', '2026-11-04', ['x', 'z']),
    t('d', '2026-11-20', ['x', 'y', 'z']), // budoucí – nepočítá se
  ];

  it('naposledy, za 28 dní (včetně dneška), celkem; budoucí tréninky se nepočítají', () => {
    const a = attendance(ts, '2026-11-10');
    expect(a.get('x')).toEqual({ last: '2026-11-04', recent: 2, total: 3 }); // 14. 10. a 4. 11. jsou v okně 14. 10. – 10. 11.
    expect(a.get('y')).toEqual({ last: '2026-10-01', recent: 0, total: 1 });
    expect(a.get('z')).toEqual({ last: '2026-11-04', recent: 1, total: 1 });
    expect(a.get('nikdo')).toBeUndefined();
    // hranice okna: 28 dní včetně dneška
    expect(attendance(ts, '2026-11-11').get('x')!.recent).toBe(1);
  });

  it('upravovaný trénink se nepočítá; hráč dvakrát v přítomných jen jednou', () => {
    expect(attendance(ts, '2026-11-10', 'c').get('z')).toBeUndefined();
    expect(attendance([t('e', '2026-11-01', ['x', 'x'])], '2026-11-10').get('x')!.total).toBe(1);
  });

  it('poslední trénink pro „Jako minule“: podle data, bez budoucích a bez upravovaného', () => {
    expect(lastTraining(ts, '2026-11-10')?.id).toBe('c');
    expect(lastTraining(ts, '2026-11-10', 'c')?.id).toBe('b');
    expect(lastTraining([], '2026-11-10')).toBeNull();
  });
});
