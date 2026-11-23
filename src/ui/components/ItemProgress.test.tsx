import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemProgress } from './BlockEntry';
import type { GameEvent, Match, Training } from '../../domain/types';

const names = { a1: 'Novák', b1: 'Svoboda' };
const goal = (item: string, i: number, side: 'A' | 'B'): GameEvent => ({ id: `${item}-${i}`, itemId: item, at: 1000 + i * 1000, kind: 'goal', side, delta: 1 });
const goals = (item: string, a: number, b: number) => [
  ...Array.from({ length: a }, (_, i) => goal(item, i, 'A')),
  ...Array.from({ length: b }, (_, i) => goal(item, a + i, 'B')),
];
const match = (bestOf?: number): Match => ({ id: 'm', kind: 'singles', block: 'league', round: 1, table: 1, sideA: ['a1'], sideB: ['b1'], ...(bestOf ? { bestOf } : {}) }) as Match;
const training = (scores: Training['scores'], events: GameEvent[]) => ({ id: 't', scores, soloResults: {}, playTimes: {}, events }) as unknown as Training;

describe('Průběh zápasu na víc legů (21. 11. 2026)', () => {
  it('BO3: přepínač legů, vždy jen jeden graf; začíná prvním legem', async () => {
    const t = training({ m: { ga: 6, gb: 4 }, 'm#2': { ga: 3, gb: 6 } }, [...goals('m', 6, 4), ...goals('m#2', 3, 6)]);
    render(<ItemProgress itemId="m" match={match(3)} players={['a1', 'b1']} training={t} names={names} />);
    const legs = screen.getByRole('group', { name: 'Leg průběhu' });
    expect(within(legs).getAllByRole('button').map((b) => b.textContent)).toEqual(['Leg 1 · 6:4', 'Leg 2 · 3:6']);
    expect(screen.getAllByRole('img', { name: /Křivka vedení/ })).toHaveLength(1);
    expect(screen.getByRole('img', { name: /konečný stav 6:4/ })).toBeInTheDocument();
    expect(within(legs).getByRole('button', { name: 'Leg 1 · 6:4' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.setup().click(within(legs).getByRole('button', { name: 'Leg 2 · 3:6' }));
    expect(screen.getAllByRole('img', { name: /Křivka vedení/ })).toHaveLength(1);
    expect(screen.getByRole('img', { name: /konečný stav 3:6/ })).toBeInTheDocument();
  });

  it('BO1 (jeden leg s průběhem): jen graf, bez přepínače', () => {
    render(<ItemProgress itemId="m" match={match()} players={['a1', 'b1']} training={training({ m: { ga: 6, gb: 2 } }, goals('m', 6, 2))} names={names} />);
    expect(screen.queryByRole('group', { name: 'Leg průběhu' })).toBeNull();
    expect(screen.getAllByRole('img', { name: /Křivka vedení/ })).toHaveLength(1);
  });
});
