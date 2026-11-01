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
    const before = card.textContent;
    fireEvent.change(within(card).getByLabelText('Kolo 6, stůl 1: góly vlevo'), { target: { value: '6' } });
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].lockedRounds).toHaveLength(6));
    // pozdní příchod: nový hráč
    await user.type(screen.getByLabelText('Jméno nového hráče'), 'Pozdní');
    await user.click(screen.getByRole('button', { name: 'Přidat a zaškrtnout' }));
    if (screen.getByRole('button', { name: 'Kolo 6' }).getAttribute('aria-expanded') !== 'true')
      await user.click(screen.getByRole('button', { name: 'Kolo 6' }));
    const again = screen.getAllByRole('group').find((g) => g.getAttribute('aria-label')?.startsWith('Kolo 6, stůl 1'))!;
    expect(again.textContent).toBe(before);
    expect(again.textContent).not.toContain('Pozdní');
  });
});
