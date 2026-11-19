import { render, screen } from '@testing-library/react';
import { CompactCell } from './TrainingTable';
import type { Match, Training } from '../../domain/types';

const names = { a1: 'Ondra', a2: 'Pepa', b1: 'Dejv', b2: 'Milan', r: 'Kuba' };
const t = (extra: Partial<Training> = {}) => ({ scores: {}, soloResults: {}, playTimes: {}, ...extra }) as unknown as Training;
const m = (extra: Partial<Match> = {}): Match => ({ id: 'm', kind: 'doubles', block: 'league', round: 1, table: 1, sideA: ['a1', 'a2'], sideB: ['b1', 'b2'], ...extra }) as Match;
const cell = (x: Match) => ({ type: 'match' as const, match: x });

describe('zápas na stole jako výsledková tabule (19. 11. 2026)', () => {
  it('strana na řádek, výsledek za čarou, vítěz tučně, poražený šedě', () => {
    const { container } = render(<CompactCell cell={cell(m())} t={t({ scores: { m: { ga: 6, gb: 3 } } })} names={names} me="b1" />);
    expect(screen.getByRole('group', { name: 'Ondra + Pepa vs Dejv + Milan 6:3' })).toBeInTheDocument();
    expect([...container.querySelectorAll('.mb-nm')].map((x) => x.textContent)).toEqual(['Ondra + Pepa', 'Dejv + Milan']);
    expect(container.querySelector('.mb-nm.win')).toHaveTextContent('Ondra + Pepa');
    expect(container.querySelector('b.lose')).toHaveTextContent('3');
    expect(container.querySelector('.me-name')).toHaveTextContent('Dejv');
  });

  it('start 4:5 a rozhodčí pod zápasem; výsledek včetně startu; nehraný start ukáže výchozí stav', () => {
    const x = m({ start: [4, 5], referee: 'r' });
    const { container, rerender } = render(<CompactCell cell={cell(x)} t={t({ scores: { m: { ga: 2, gb: 0 } } })} names={names} />);
    expect(screen.getByRole('group', { name: /6:5$/ })).toBeInTheDocument();
    expect(container.querySelector('.mb-foot')).toHaveTextContent('start 4:5 · rozhodčí Kuba');
    rerender(<CompactCell cell={cell(x)} t={t()} names={names} />);
    expect([...container.querySelectorAll('.mb-sc b')].map((b) => b.textContent)).toEqual(['4', '5']);
  });

  it('rozehrané utkání (zahájené, neukončené): „hraje se“, rozehraný leg zlatě, bez vítěze', () => {
    const x = m({ bestOf: 3 });
    const { container } = render(
      <CompactCell cell={cell(x)} t={t({ scores: { m: { ga: 6, gb: 4 }, 'm#2': { ga: 3, gb: 2 } }, playTimes: { m: { startedAt: 1 } } })} names={names} />,
    );
    expect(container.querySelector('.mb-foot')).toHaveTextContent('hraje se');
    expect(container.querySelectorAll('.mb-sc span.run')).toHaveLength(2);
    expect(container.querySelector('.mb-nm.win')).toBeNull();
  });
});
