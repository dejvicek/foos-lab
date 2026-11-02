import { nextHalfHour } from './dates';

describe('začátek nového tréninku', () => {
  it('aktuální čas zaokrouhlený na 30 min nahoru', () => {
    expect(nextHalfHour(new Date(2026, 10, 2, 18, 7))).toBe('18:30');
    expect(nextHalfHour(new Date(2026, 10, 2, 18, 30))).toBe('18:30');
    expect(nextHalfHour(new Date(2026, 10, 2, 18, 31))).toBe('19:00');
    expect(nextHalfHour(new Date(2026, 10, 2, 9, 0))).toBe('09:00');
    expect(nextHalfHour(new Date(2026, 10, 2, 23, 45))).toBe('23:30'); // přes půlnoc ne – datum je dnešek
  });
});
