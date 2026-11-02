import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player, Training } from '../../domain/types';

const players: Player[] = Array.from({ length: 8 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const training: Training = {
  id: 't1', date: '2026-10-31', startTime: '18:00', mode: 'team', tables: 4,
  attendees: players.map((p) => p.id), scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [],
};

const original = window.matchMedia;
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: q.includes('max-width: 767px'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = original;
});

describe('telefon', () => {
  it('celý rozpis jsou karty kol místo široké tabulky', async () => {
    window.location.hash = '#/trenink/t1';
    render(<App repo={memoryRepository({ players, trainings: [training] })} />);
    const cards = await screen.findByLabelText('Rozpis tréninku');
    expect(screen.queryByRole('table', { name: 'Rozpis tréninku' })).toBeNull();
    await userEvent.setup().click(within(cards).getByRole('button', { name: /^19:00 Kolo 1/ }));
    expect(within(cards).getAllByRole('button', { name: /^Stůl \d/ })).toHaveLength(2);
  });
});
