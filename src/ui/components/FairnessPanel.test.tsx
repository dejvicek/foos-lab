import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { memoryAuth } from '../../storage/auth';
import type { Player, Training } from '../../domain/types';

const players: Player[] = Array.from({ length: 5 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const t: Training = {
  id: 't1', date: '2026-11-03', startTime: '18:00', mode: 'team', tables: 2, attendees: players.map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'performance', simTeams: null, format: 'custom', durationMin: 60,
  plan: { normal: 3 }, lockedRounds: [], breaks: [], createdBy: 'id2',
};
const auth = (isAdmin: boolean, playerId = 'id1') =>
  memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name, isAdmin: p.id === playerId && isAdmin })), signedIn: { playerId, isAdmin, mustChangePassword: false } });

beforeEach(() => {
  window.location.hash = '#/trenink/t1';
});

describe('kontrola spravedlnosti rozpisu', () => {
  it('admin: rozbalovací tabulka kdo s kým kolikrát (spolu / proti), zápasy a mimo stůl', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players, trainings: [t] })} auth={auth(true)} />);
    const summary = await screen.findByText('Kontrola rozpisu: kdo s kým kolikrát');
    await user.click(summary);
    const table = screen.getByRole('table', { name: 'Kdo s kým kolikrát' });
    const head = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(head).toEqual(['', 'H1', 'H2', 'H3', 'H4', 'H5', 'Zápasy', 'Mimo stůl']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    // každý hráč: 3 kola × 5 hráčů na 1 dvojici (4 hrají, 1 mimo stůl)
    const total = rows.map((r) => Number(within(r).getAllByRole('cell').at(-2)!.textContent) + Number(within(r).getAllByRole('cell').at(-1)!.textContent));
    expect(total).toEqual([3, 3, 3, 3, 3]);
    expect(within(rows[0]).getAllByRole('cell')[0]).toHaveTextContent('–'); // sám se sebou
  });

  it('organizátor, který není admin, ani hráč ji nevidí', async () => {
    render(<App repo={memoryRepository({ players, trainings: [t] })} auth={auth(false, 'id2')} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.queryByText('Kontrola rozpisu: kdo s kým kolikrát')).toBeNull();
  });
});
