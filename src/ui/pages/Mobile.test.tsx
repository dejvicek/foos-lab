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
    await userEvent.setup().click(within(cards).getByRole('button', { name: /^19:00 1. kolo/ }));
    expect(within(cards).getAllByRole('button', { name: /^Stůl \d/ })).toHaveLength(2);
  });
});

describe('telefon – žebříček', () => {
  it('žebříček je seznam: pořadí, jméno, legy a výhry, hlavní číslo vpravo', async () => {
    const t: Training = { ...training, date: '2026-11-01', scores: { 'league|1|1|id1+id2vid3+id4': { ga: 6, gb: 2 } } };
    window.location.hash = '#/zebricek';
    render(<App repo={memoryRepository({ players, trainings: [t] })} />);
    const list = (await screen.findAllByRole('list', { name: /^(Žebříček|Málo dat)$/ }))[0];
    expect(screen.queryByRole('table', { name: /^(Žebříček|Málo dat)$/ })).toBeNull();
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveTextContent(/1 leg/);
  });
});

describe('telefon – nastavení tréninku', () => {
  it('nastavení je průvodce v krocích „Krok N z 4“ se shrnutím na konci', async () => {
    const custom: Training = { ...training, format: 'custom', durationMin: 180, plan: { normal: 4, sim: 1 } };
    window.location.hash = '#/trenink/t1';
    render(<App repo={memoryRepository({ players, trainings: [custom] })} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Upravit nastavení' }));
    expect(screen.getByText('Krok 4 z 4 · Shrnutí')).toBeInTheDocument();
    expect(screen.getByText(/18:00, 3:00, 4 stoly/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Upravit: Přítomní' }));
    expect(screen.getByText('Krok 2 z 4 · Přítomní')).toBeInTheDocument();
  });
});
