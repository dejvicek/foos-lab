import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player } from '../../domain/types';
import { next, openSettings, saveSettings, stepButton } from '../../test/wizard';

const players = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));

/** Nový trénink průvodcem: n přítomných; `stop` = zůstat na kroku Disciplíny, jinak zahájit. */
async function newTraining(n = 8, stop?: 'disc') {
  const user = userEvent.setup();
  const repo = memoryRepository({ players: players(n), trainings: [] });
  window.location.hash = '#/trenink';
  render(<App repo={repo} />);
  await user.click(await screen.findByRole('button', { name: 'Nový trénink' }));
  await next(user);
  for (let i = 1; i <= n; i++) await user.click(screen.getByRole('checkbox', { name: `H${i}` }));
  await next(user);
  if (stop) return { user, repo };
  while (screen.queryByRole('button', { name: /^Další:/ })) await next(user);
  await user.click(screen.getByRole('button', { name: 'Zahájit trénink' }));
  await screen.findByRole('table', { name: 'Rozpis tréninku' });
  return { user, repo };
}
const preview = () => screen.getByRole('list', { name: 'Náhled plánu' });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 5, 12, 0));
});
afterEach(() => vi.useRealTimers());

describe('konfigurovatelný trénink v UI', () => {
  it('nový trénink: délka, disciplíny, naplánovaný čas; kolo = jedna disciplína', async () => {
    const { user, repo } = await newTraining(8, 'disc');
    expect(screen.getByRole('heading', { name: 'Disciplíny' })).toBeInTheDocument();
    expect(screen.getByText(/^Naplánováno \d:\d\d z 3:00$/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Řetězec' })).toBeNull(); // vyřazená disciplína
    expect(screen.queryByRole('checkbox', { name: 'Rozehrávka ze zadních tyčí' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Penalta z místa' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Zeď' })).toBeChecked();
    // náhled plánu vedle výběru: kolo = jedna disciplína
    expect(within(preview()).getAllByRole('listitem')[0]).toHaveTextContent('1. koloPřihrávky na pětce');
    await user.click(stepButton('Kdy a kde'));
    expect(screen.getByLabelText('Délka tréninku')).toHaveValue('180');
    expect(screen.queryByLabelText('Typ tréninku')).toBeNull();
    while (screen.queryByRole('button', { name: /^Další:/ })) await next(user);
    await user.click(screen.getByRole('button', { name: 'Zahájit trénink' }));
    expect(await screen.findByRole('button', { name: '1. kolo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1. kolo' }).closest('tr')).toHaveTextContent('Přihrávky na pětce');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0]).toMatchObject({ format: 'custom', durationMin: 180 }));
  });

  it('odškrtnutí disciplíny a +/− mění plán a čas', async () => {
    const { user } = await newTraining(8, 'disc');
    expect(preview()).toHaveTextContent('1. vlna');
    await user.click(screen.getByRole('checkbox', { name: 'Simulace ligového kola' }));
    expect(preview()).not.toHaveTextContent('1. vlna');
    const rows = within(preview()).getAllByRole('listitem').length;
    const before = screen.getByText(/^Naplánováno/).textContent;
    const count = () => Number(within(screen.getByRole('group', { name: 'Zeď' })).getByText(/×$/).textContent!.replace(' ×', ''));
    const n = count();
    await user.click(screen.getByRole('button', { name: 'Přidat kolo: Zeď' }));
    expect(screen.getByText(/^Naplánováno/).textContent).not.toBe(before);
    expect(count()).toBe(n + 2); // Zeď po dvou kolech (obě strany)
    expect(within(preview()).getAllByRole('listitem').length).toBe(rows + 2); // náhled se přepočítá
  });

  it('zápis výsledku zamkne kola; pozdní hráč je nezmění', async () => {
    const { user, repo } = await newTraining(8);
    await user.click(screen.getByRole('button', { name: '6. kolo' }));
    const card = screen.getAllByRole('group').find((g) => g.getAttribute('aria-label')?.startsWith('6. kolo, stůl 1'))!;
    fireEvent.click(within(card).getByRole('button', { name: 'Zahájit' }));
    fireEvent.click(within(card).getByRole('button', { name: '6. kolo, stůl 1: góly vlevo 6' }));
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].lockedRounds).toHaveLength(6));
    // jen jména stran (karta obsahuje i běžící stopky)
    const before = screen.getAllByRole('group').find((g) => g.getAttribute('aria-label')?.startsWith('6. kolo, stůl 1'))!.querySelector('.pick-names')!.textContent;
    // pozdní příchod: nový hráč v nastavení
    await openSettings(user, 'Přítomní');
    await user.type(screen.getByLabelText('Jméno nového hráče'), 'Pozdní');
    await user.click(screen.getByRole('button', { name: 'Přidat a zaškrtnout' }));
    await saveSettings(user);
    if (screen.getByRole('button', { name: '6. kolo' }).getAttribute('aria-expanded') !== 'true')
      await user.click(screen.getByRole('button', { name: '6. kolo' }));
    const again = screen.getAllByRole('group').find((g) => g.getAttribute('aria-label')?.startsWith('6. kolo, stůl 1'))!;
    expect(again.querySelector('.pick-names')!.textContent).toBe(before);
    expect(again.textContent).not.toContain('Pozdní');
  });

  it('první výsledek simulace zamkne kola i týmy jedním uložením', async () => {
    const { user, repo } = await newTraining(8);
    await user.click(screen.getByRole('button', { name: '1. vlna' }));
    fireEvent.click(within(screen.getByRole('group', { name: '1. vlna, stůl 1' })).getByRole('button', { name: 'Zahájit' }));
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
    await next(user);
    await user.click(screen.getByRole('checkbox', { name: 'H1' }));
    expect(screen.getByText(/Ještě chybí 1 hráč do minima 2./)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'H2' }));
    await next(user);
    expect(preview()).toBeInTheDocument();
    const sim = screen.getByRole('checkbox', { name: 'Simulace ligového kola' });
    expect(sim).toBeDisabled();
    expect(sim).not.toBeChecked();
    expect(screen.getByText('potřebuje aspoň 4 hráče')).toBeInTheDocument();
    expect(preview()).not.toHaveTextContent('1. vlna');
    await user.click(stepButton('Přítomní'));
    await user.click(screen.getByRole('checkbox', { name: 'H3' }));
    await user.click(screen.getByRole('checkbox', { name: 'H4' }));
    await next(user);
    expect(screen.getByRole('checkbox', { name: 'Simulace ligového kola' })).toBeChecked();
    expect(preview()).toHaveTextContent('1. vlna');
  });
});
