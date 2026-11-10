import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';

async function addPlayer(name: string) {
  const user = userEvent.setup();
  const input = screen.getByLabelText('Jméno nového hráče');
  await user.clear(input);
  await user.type(input, name);
  await user.click(screen.getByRole('button', { name: 'Přidat' }));
}

const activeNames = () =>
  within(screen.getByRole('list', { name: 'Aktivní hráči' }))
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-name'));

beforeEach(() => {
  window.location.hash = '#/players';
});

describe('stránka Hráči', () => {
  it('přidání, duplicita, pořadí, archiv a perzistence', async () => {
    const repo = memoryRepository();
    const { unmount } = render(<App repo={repo} />);
    await screen.findByLabelText('Jméno nového hráče');

    await addPlayer('Petr');
    await addPlayer('Honza');
    await addPlayer('Čeněk');
    // podle abecedy, ne podle pořadí přidání; ruční posouvání už není
    expect(activeNames()).toEqual(['Čeněk', 'Honza', 'Petr']);
    expect(screen.queryByRole('button', { name: /^Posunout/ })).toBeNull();
    expect(screen.queryByText(/nominační pořadí/)).toBeNull(); // zastaralý text pryč

    await addPlayer('honza');
    expect(screen.getByText('Hráč s tímto jménem už je na soupisce')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Archivovat Čeněk' }));

    await userEvent.click(screen.getByRole('button', { name: 'Archivovat Petr' }));
    expect(activeNames()).toEqual(['Honza']);
    expect(screen.getByText('Archivovaní (2)')).toBeInTheDocument();

    await act(async () => {}); // dokončit frontu zápisů
    unmount();
    render(<App repo={repo} />);
    await screen.findByLabelText('Jméno nového hráče');
    expect(activeNames()).toEqual(['Honza']);
  });

  it('chyba načtení: hláška a žádný formulář', async () => {
    render(<App repo={memoryRepository(undefined, { failLoad: true })} />);
    expect(await screen.findByText('Nepodařilo se načíst data.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Jméno nového hráče')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zkusit znovu' })).toBeInTheDocument();
  });

  it('chyba uložení: pruh „Neuloženo“, po opakování zmizí a data jsou uložená', async () => {
    vi.useFakeTimers();
    try {
      const repo = memoryRepository(undefined, { failSaves: 1 });
      render(<App repo={repo} />);
      await act(async () => {});
      fireEvent.change(screen.getByLabelText('Jméno nového hráče'), { target: { value: 'Honza' } });
      fireEvent.click(screen.getByRole('button', { name: 'Přidat' }));
      await act(async () => {});
      expect(screen.getByText('Neuloženo – zkouším znovu')).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(screen.queryByText('Neuloženo – zkouším znovu')).not.toBeInTheDocument();
      expect(repo.snapshot().players.map((p) => p.name)).toEqual(['Honza']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('záloha obsahuje i průběh her, který appka jinak načítá jen u otevřeného tréninku', async () => {
    const repo = memoryRepository({
      players: [],
      trainings: [{ id: 't1', date: '2026-11-10', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: {}, lockedRounds: [], mode: 'team', tables: 2, attendees: [], scores: {} }],
    });
    await repo.tapScore('t1', 'm1', [{ id: 'e1', at: 1000, field: 'ga', delta: 1, max: 6 }]);
    const saved: string[] = [];
    const realBlob = globalThis.Blob;
    const urls = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const before = { create: urls.createObjectURL, revoke: urls.revokeObjectURL };
    // Zachytit obsah staženého souboru.
    globalThis.Blob = class extends realBlob {
      constructor(parts?: BlobPart[], o?: BlobPropertyBag) {
        super(parts, o);
        saved.push(String(parts?.[0]));
      }
    };
    urls.createObjectURL = () => 'blob:zaloha';
    urls.revokeObjectURL = () => {};
    try {
      render(<App repo={repo} />);
      await userEvent.click(await screen.findByRole('button', { name: 'Stáhnout zálohu' }));
      await waitFor(() => expect(saved).toHaveLength(1));
      const parsed = JSON.parse(saved[0]);
      expect(parsed.trainings[0].scores).toEqual({ m1: { ga: 1, gb: 0 } });
      expect(parsed.trainings[0].events).toEqual([{ id: 'e1', itemId: 'm1', at: 1000, kind: 'goal', side: 'A', delta: 1 }]);
    } finally {
      globalThis.Blob = realBlob;
      urls.createObjectURL = before.create;
      urls.revokeObjectURL = before.revoke;
    }
  });
});
