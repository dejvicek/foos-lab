import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player, Training } from '../../domain/types';

const players: Player[] = Array.from({ length: 4 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const t: Training = {
  id: 't1', date: '2026-11-02', startTime: '18:00', mode: 'team', tables: 2, attendees: players.map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 60, plan: { warmupPasses: 1 }, lockedRounds: [], breaks: [],
};

describe('cvičení na notebooku: ✓ / ✗ po pokusech', () => {
  it('pokusy se počítají, výsledek je počet povedených; ↶ vrátí poslední', async () => {
    window.location.hash = '#/trenink/t1';
    const repo = memoryRepository({ players, trainings: [t] });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    const card = screen.getByRole('group', { name: '1. kolo, stůl 1' });
    expect(within(card).getByRole('button', { name: 'povedená: H2' })).toBeDisabled(); // až po zahájení
    await user.click(within(card).getByRole('button', { name: 'Zahájit' }));
    await user.click(within(card).getByRole('button', { name: 'povedená: H2' }));
    await user.click(within(card).getByRole('button', { name: 'povedená: H2' }));
    await user.click(within(card).getByRole('button', { name: 'nepovedená: H2' }));
    expect(card).toHaveTextContent('2 (pokus 3 / 20)');
    await user.click(within(card).getByRole('button', { name: 'Zpět: H2' }));
    expect(card).toHaveTextContent('2 (pokus 2 / 20)');
    await vi.waitFor(() => {
      const s = repo.snapshot().trainings[0];
      expect(s.soloResults.id2).toEqual({ 'warmupPasses@1': 2 });
      expect(s.soloAttempts?.id2).toEqual({ 'warmupPasses@1': 2 });
    });
  });
});
