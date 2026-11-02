import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
  window.location.hash = '#/hraci';
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
});
