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
    window.location.hash = '#/trainings/t1';
    const repo = memoryRepository({ players, trainings: [t] });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    const card = screen.getByRole('group', { name: '1. kolo, stůl 1' });
    expect(within(card).queryByRole('button', { name: 'Zahájit' })).toBeNull(); // organizátor nezahajuje, píše rovnou
    await user.click(within(card).getByRole('button', { name: 'povedená: H2' }));
    await user.click(within(card).getByRole('button', { name: 'povedená: H2' }));
    await user.click(within(card).getByRole('button', { name: 'nepovedená: H2' }));
    expect(card).toHaveTextContent('2 (pokus 3 / 20)');
    await user.click(within(card).getByRole('button', { name: 'Zpět: H2' }));
    expect(card).toHaveTextContent('2 (pokus 2 / 20)');
    // průběh: řada pokusů po hráči (✓ ✓, ✗ vrácený)
    const marks = within(card).getByRole('list', { name: 'Pokusy: H2' });
    expect(within(marks).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['✓', '✓']);
    await vi.waitFor(() => {
      const s = repo.snapshot().trainings[0];
      expect(s.soloResults.id2).toEqual({ 'warmupPasses@1': 2 });
      expect(s.soloAttempts?.id2).toEqual({ 'warmupPasses@1': 2 });
      expect(s.events?.map((e) => [e.kind, e.playerId, e.delta])).toEqual([['hit', 'id2', 1], ['hit', 'id2', 1], ['miss', 'id2', 1], ['miss', 'id2', -1]]);
    });
  });
});

describe('Rozcvička v rozpisu (notebook)', () => {
  it('karta stolu bez zápisu, kompaktní timer, mimo stůl „Čeká“; rozbalený je zápas s chybějícím zápisem', async () => {
    window.location.hash = '#/trainings/tw';
    const p9: Player[] = Array.from({ length: 9 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
    const tw: Training = { ...t, id: 'tw', tables: 4, attendees: p9.map((p) => p.id), plan: { warmup: 2, normal: 1 } };
    render(<App repo={memoryRepository({ players: p9, trainings: [tw] })} />);
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: 'Rozpis tréninku' });
    // výchozí rozbalený blok = první s chybějícím zápisem → zápas (Rozcvička nic nezapisuje)
    expect(screen.getByRole('group', { name: '3. kolo, stůl 1' })).toBeInTheDocument();
    await user.click(within(table).getByText('1. kolo'));
    const card = screen.getByRole('group', { name: '1. kolo, stůl 1' });
    expect(within(card).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(card).queryAllByRole('spinbutton')).toHaveLength(0);
    expect(within(card).queryByRole('button', { name: /povedená/ })).toBeNull();
    expect(card).toHaveTextContent('Rozcvička – 7 fází, 8:35');
    expect(screen.getByText(/^Čeká: /)).toBeInTheDocument();
    expect(screen.queryByText(/^Počítá: /)).toBeNull();
  });
});
