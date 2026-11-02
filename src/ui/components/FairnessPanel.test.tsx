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
  it('admin: spoluhráči a soupeři ve dvou tabulkách (nula = nikdy, zvýrazněná), zápasy a mimo stůl', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players, trainings: [t] })} auth={auth(true)} />);
    const summary = await screen.findByText('Kontrola rozpisu: kdo s kým kolikrát');
    // na začátku, před rozpisem (před cvičeními)
    const schedule = screen.getByRole('table', { name: 'Rozpis tréninku' });
    expect(summary.compareDocumentPosition(schedule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(summary);
    // dvě oddělené tabulky, ať se čísla nepletou: spoluhráči a soupeři
    const mates = screen.getByRole('table', { name: 'Spoluhráči: kolikrát spolu ve dvojici' });
    const opps = screen.getByRole('table', { name: 'Soupeři: kolikrát proti sobě' });
    for (const table of [mates, opps]) {
      expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['', 'H1', 'H2', 'H3', 'H4', 'H5']);
      expect(within(table).getAllByRole('row').slice(1)).toHaveLength(5);
      expect(within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[0]).toHaveTextContent('–'); // sám se sebou
    }
    // nikdy = zvýrazněná nula
    const zeros = [...mates.querySelectorAll('td.never'), ...opps.querySelectorAll('td.never')];
    expect(zeros.every((z) => z.textContent === '0')).toBe(true);
    // zápasy a mimo stůl: 3 kola, každý buď hraje, nebo je mimo stůl
    const games = screen.getByRole('table', { name: 'Zápasy a mimo stůl' });
    const rows = within(games).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell').reduce((sum, c) => sum + Number(c.textContent), 0))).toEqual([3, 3, 3, 3, 3]);
  });

  it('organizátor, který není admin, ani hráč ji nevidí', async () => {
    render(<App repo={memoryRepository({ players, trainings: [t] })} auth={auth(false, 'id2')} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.queryByText('Kontrola rozpisu: kdo s kým kolikrát')).toBeNull();
  });
});
