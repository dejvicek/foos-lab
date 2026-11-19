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

describe('cvičení v rozpisu: admin / organizátor zapisuje jen celkový výsledek (18. 11. 2026)', () => {
  it('bez ✓ / ✗ a bez stopek; zapsáním výsledku všech hráčů stůl skončí', async () => {
    window.location.hash = '#/trainings/t1';
    const repo = memoryRepository({ players, trainings: [t] });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(screen.getByRole('button', { name: 'Zapsat: 1. kolo, stůl 1' }));
    const card = screen.getByRole('group', { name: '1. kolo, stůl 1' });
    expect(within(card).queryByRole('button', { name: 'Zahájit' })).toBeNull();
    expect(within(card).queryByRole('button', { name: /^Potvrdit/ })).toBeNull();
    expect(within(card).queryByRole('button', { name: /povedená/ })).toBeNull();
    const [a, b] = within(card).getAllByRole('spinbutton');
    await user.type(a, '14');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].playTimes ?? {}).toEqual({}));
    await user.type(b, '9');
    await vi.waitFor(() => {
      const s = repo.snapshot().trainings[0];
      expect(Object.values(s.soloResults).map((r) => Object.values(r)[0]).sort()).toEqual([14, 9].sort());
      const ended = Object.values(s.playTimes ?? {}).filter((x) => x.endedAt !== undefined);
      expect(ended).toHaveLength(1);
    });
  });
});

describe('Rozcvička v rozpisu (notebook)', () => {
  it('karta stolu bez zápisu, kompaktní timer; tužka otevře jen ten stůl', async () => {
    window.location.hash = '#/trainings/tw';
    const p9: Player[] = Array.from({ length: 9 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
    const tw: Training = { ...t, id: 'tw', tables: 4, attendees: p9.map((p) => p.id), plan: { warmup: 2, normal: 1 } };
    render(<App repo={memoryRepository({ players: p9, trainings: [tw] })} />);
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(within(table).getByRole('button', { name: 'Zapsat: 1. kolo, stůl 1' }));
    const card = screen.getByRole('group', { name: '1. kolo, stůl 1' });
    expect(within(card).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(card).queryAllByRole('spinbutton')).toHaveLength(0);
    expect(within(card).queryByRole('button', { name: /povedená/ })).toBeNull();
    expect(card).toHaveTextContent('Rozcvička – 7 fází, 8:35');
    expect(screen.queryByRole('group', { name: '1. kolo, stůl 2' })).toBeNull();
    expect(screen.queryByText(/^Počítá: /)).toBeNull();
  });
});
