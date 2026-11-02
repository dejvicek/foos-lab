import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player } from '../../domain/types';

const players = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));

async function newTraining(n = 8) {
  const user = userEvent.setup();
  const repo = memoryRepository({ players: players(n), trainings: [] });
  window.location.hash = '#/trenink';
  render(<App repo={repo} />);
  await user.click(await screen.findByRole('button', { name: 'Nový trénink' }));
  for (let i = 1; i <= n; i++) await user.click(screen.getByRole('checkbox', { name: `H${i}` }));
  return { user, repo };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 5, 12, 0));
});
afterEach(() => vi.useRealTimers());

describe('konfigurovatelný trénink v UI', () => {
  it('nový trénink: délka, disciplíny, naplánovaný čas; kolo = jedna disciplína', async () => {
    const { repo } = await newTraining(8);
    expect(screen.getByLabelText('Délka tréninku')).toHaveValue('180');
    expect(screen.queryByLabelText('Typ tréninku')).toBeNull();
    expect(screen.getByText(/^Naplánováno \d:\d\d z 3:00$/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Řetězec' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Zeď' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Kolo 1' }).closest('tr')).toHaveTextContent('Přihrávky na pětce');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0]).toMatchObject({ format: 'custom', durationMin: 180 }));
  });

  it('odškrtnutí disciplíny a +/− mění plán a čas', async () => {
    const { user } = await newTraining(8);
    await user.click(screen.getByRole('checkbox', { name: 'Simulace ligového kola' }));
    expect(screen.queryByRole('button', { name: /^1\. vlna/ })).toBeNull();
    const before = screen.getByText(/^Naplánováno/).textContent;
    const count = () => Number(within(screen.getByRole('group', { name: 'Zeď' })).getByText(/×$/).textContent!.replace(' ×', ''));
    const n = count();
    await user.click(screen.getByRole('button', { name: 'Přidat kolo: Zeď' }));
    expect(screen.getByText(/^Naplánováno/).textContent).not.toBe(before);
    expect(count()).toBe(n + 1);
  });

  it('zápis výsledku zamkne kola; pozdní hráč je nezmění', async () => {
    const { user, repo } = await newTraining(8);
    await user.click(screen.getByRole('button', { name: 'Kolo 6' }));
    const card = screen.getAllByRole('group').find((g) => g.getAttribute('aria-label')?.startsWith('Kolo 6, stůl 1'))!;
    fireEvent.click(within(card).getByRole('button', { name: 'Kolo 6, stůl 1: góly vlevo 6' }));
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].lockedRounds).toHaveLength(6));
    const before = screen.getAllByRole('group').find((g) => g.getAttribute('aria-label')?.startsWith('Kolo 6, stůl 1'))!.textContent;
    // pozdní příchod: nový hráč
    await user.type(screen.getByLabelText('Jméno nového hráče'), 'Pozdní');
    await user.click(screen.getByRole('button', { name: 'Přidat a zaškrtnout' }));
    if (screen.getByRole('button', { name: 'Kolo 6' }).getAttribute('aria-expanded') !== 'true')
      await user.click(screen.getByRole('button', { name: 'Kolo 6' }));
    const again = screen.getAllByRole('group').find((g) => g.getAttribute('aria-label')?.startsWith('Kolo 6, stůl 1'))!;
    expect(again.textContent).toBe(before);
    expect(again.textContent).not.toContain('Pozdní');
  });

  it('první výsledek simulace zamkne kola i týmy jedním uložením', async () => {
    const { user, repo } = await newTraining(8);
    await user.click(screen.getByRole('button', { name: '1. vlna' }));
    fireEvent.click(screen.getByRole('button', { name: '1. vlna, stůl 1: góly vlevo 2' }));
    await vi.waitFor(() => {
      const t = repo.snapshot().trainings[0];
      expect(t.simTeams).not.toBeNull();
      expect(t.lockedRounds.at(-1)?.discipline).toBe('sim');
    });
  });

  it('trénink pro 2 hráče: rozpis bez simulace, simulace vypnutá; při 4 hráčích se vrátí', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players: players(4), trainings: [] });
    window.location.hash = '#/trenink';
    render(<App repo={repo} />);
    await user.click(await screen.findByRole('button', { name: 'Nový trénink' }));
    await user.click(screen.getByRole('checkbox', { name: 'H1' }));
    expect(screen.getByText('Ještě chybí 1 hráč do minima 2.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'H2' }));
    expect(screen.getByRole('table', { name: 'Rozpis tréninku' })).toBeInTheDocument();
    const sim = screen.getByRole('checkbox', { name: 'Simulace ligového kola' });
    expect(sim).toBeDisabled();
    expect(sim).not.toBeChecked();
    expect(screen.getByText('potřebuje aspoň 4 hráče')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1. vlna' })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'H3' }));
    await user.click(screen.getByRole('checkbox', { name: 'H4' }));
    expect(screen.getByRole('checkbox', { name: 'Simulace ligového kola' })).toBeChecked();
    expect(screen.getByRole('button', { name: '1. vlna' })).toBeInTheDocument();
  });
});
