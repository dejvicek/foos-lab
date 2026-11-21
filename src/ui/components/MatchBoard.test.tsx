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
    // nerovný start bez štítků „začíná N“ (20. 11. 2026): výchozí stav je ve skóre
    expect(container.querySelector('.mb-badge')).toBeNull();
    expect(container.querySelector('.mb-foot')).toHaveTextContent(/^rozhodčí Kuba$/);
    rerender(<CompactCell cell={cell(x)} t={t()} names={names} />);
    expect([...container.querySelectorAll('.mb-sc b')].map((b) => b.textContent)).toEqual(['4', '5']);
  });

  it('Zeď: štítek Zeď jen u strany, která ji hraje (Láme zeď od 20. 11. 2026 ne); start 0:3 a rovný start bez štítků i bez řádku pod zápasem', () => {
    const { container, rerender } = render(<CompactCell cell={cell(m({ wall: 'B' }))} t={t()} names={names} />);
    expect([...container.querySelectorAll('.mb-badge')].map((b) => b.textContent)).toEqual(['Zeď']);
    // start 0:3: kdo je pozadu, je vidět ze skóre (20. 11. 2026)
    rerender(<CompactCell cell={cell(m({ start: [0, 3] }))} t={t()} names={names} />);
    expect(container.querySelector('.mb-badge')).toBeNull();
    expect(container.querySelector('.mb-foot')).toBeNull();
    rerender(<CompactCell cell={cell(m({ start: [5, 5] }))} t={t()} names={names} />);
    expect(container.querySelector('.mb-badge')).toBeNull();
    expect(container.querySelector('.mb-foot')).toBeNull(); // „start 5:5“ je v názvu kola
    expect([...container.querySelectorAll('.mb-sc b')].map((b) => b.textContent)).toEqual(['5', '5']);
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

  it('stanoviště se stejným názvem jako kolo (i s variantou) se pod hráči neopakuje; jiné ano (19. 11. 2026)', () => {
    const g = { type: 'group' as const, players: ['a1', 'b1'], station: 'Clearing' } as never;
    const { container, rerender } = render(<CompactCell cell={g} t={t()} names={names} roundName="Clearing – varianta 1" />);
    expect(container).not.toHaveTextContent('Clearing');
    rerender(<CompactCell cell={g} t={t()} names={names} roundName="Clearing" />);
    expect(container).not.toHaveTextContent('Clearing');
    rerender(<CompactCell cell={g} t={t()} names={names} roundName="Stanoviště, rotace 1" />);
    expect(container).toHaveTextContent('Clearing');
  });
});

describe('skončené cvičení jako tabule (19. 11. 2026)', () => {
  const g = { type: 'group' as const, players: ['a1', 'b1'], metric: 'warmupPasses' as const };
  it('po potvrzeném konci: hráč na řádek, vpravo povedené z pokusů', () => {
    const res = { soloResults: { a1: { warmupPasses: 15 }, b1: { warmupPasses: 12 } }, soloAttempts: { a1: { warmupPasses: 20 }, b1: { warmupPasses: 20 } } };
    const { container, rerender } = render(<CompactCell cell={g} t={t({ ...res, playTimes: { d: { startedAt: 1, endedAt: 2 } } } as Partial<Training>)} names={names} itemId="d" />);
    expect(screen.getByRole('group', { name: 'Ondra 15/20, Dejv 12/20' })).toBeInTheDocument();
    expect([...container.querySelectorAll('.mb-sc b')].map((b) => b.textContent)).toEqual(['15/20', '12/20']);
    // ještě se cvičí: jen jména
    rerender(<CompactCell cell={g} t={t({ ...res, playTimes: { d: { startedAt: 1 } } } as Partial<Training>)} names={names} itemId="d" />);
    expect(container.querySelector('.mb')).toBeNull();
    expect(container).toHaveTextContent('Ondra, Dejv');
  });
});
