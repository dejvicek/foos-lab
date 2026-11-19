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
    window.location.hash = '#/trainings/t1';
    render(<App repo={memoryRepository({ players, trainings: [training] })} />);
    const cards = await screen.findByLabelText('Rozpis tréninku');
    expect(screen.queryByRole('table', { name: 'Rozpis tréninku' })).toBeNull();
    // dlaždice kola ukazuje vždy všechny stoly (19. 11. 2026)
    const tile = within(cards).getByRole('article', { name: /^1\. kolo, / });
    expect(tile).toHaveTextContent('Stůl 1');
    expect(tile).toHaveTextContent('Stůl 2');
  });
});

describe('telefon – žebříček', () => {
  it('žebříček jen to hlavní (19. 11. 2026): #, hráč, G± a Výhry %; v Celkem G±, L+ a L−', async () => {
    const t: Training = { ...training, date: '2026-11-01', scores: { 'league|1|1|id1+id2vid3+id4': { ga: 6, gb: 2 } } };
    window.location.hash = '#/ladder';
    render(<App repo={memoryRepository({ players, trainings: [t] })} />);
    const table = await screen.findByRole('table', { name: 'Žebříček' });
    expect(screen.getByText(/Pro umístění je potřeba zúčastnit se aspoň 3 tréninků/)).toBeInTheDocument();
    const heads = () => within(screen.getByRole('table', { name: 'Žebříček' })).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[↕▲▼]/g, '').trim());
    expect(heads()).toEqual(['#', 'Hráč', 'G±', 'Výhry %']);
    const row = within(table).getAllByRole('row')[1];
    expect(within(row).getByTitle('1 ze 3 tréninků')).toBeInTheDocument(); // 1 trénink → pod čárou
    await userEvent.setup().click(screen.getByRole('button', { name: 'Celkem' }));
    expect(heads()).toEqual(['#', 'Hráč', 'G±', 'L+', 'L−']);
  });
});

describe('telefon – nastavení tréninku', () => {
  it('nastavení je průvodce v krocích „Krok N z 2“; úprava otevře plán', async () => {
    const custom: Training = { ...training, format: 'custom', durationMin: 180, plan: { normal: 4, sim: 1 } };
    window.location.hash = '#/trainings/t1';
    render(<App repo={memoryRepository({ players, trainings: [custom] })} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Upravit nastavení' }));
    expect(screen.getByText('Krok 2 z 2 · Kdy, kde a disciplíny')).toBeInTheDocument();
    expect(screen.getByLabelText('Začátek')).toHaveValue('18:00');
    await user.click(screen.getByRole('button', { name: '‹ Zpět' }));
    expect(screen.getByText('Krok 1 z 2 · Přítomní')).toBeInTheDocument();
  });
});
