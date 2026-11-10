import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player } from '../../domain/types';
import { discView, next, stepButton } from '../../test/wizard';
import { DEFAULT_CATALOG } from '../../test/fixtures';

const players = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));

/** Nový trénink průvodcem: n přítomných; `stop` = zůstat na kroku Disciplíny, jinak zahájit. */
async function newTraining(n = 8, stop?: 'disc') {
  const user = userEvent.setup();
  const repo = memoryRepository({ players: players(n), trainings: [], catalog: DEFAULT_CATALOG });
  window.location.hash = '#/trainings';
  render(<App repo={repo} />);
  await user.click(await screen.findByRole('button', { name: 'Nový trénink' }));
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
    expect(screen.getByRole('heading', { name: 'Kdy, kde a disciplíny' })).toBeInTheDocument();
    expect(screen.getByText(/^Naplánováno \d:\d\d z 3:00$/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Řetězec' })).not.toBeChecked(); // volitelná (10. 11. 2026)
    expect(screen.queryByRole('checkbox', { name: 'Rozehrávka ze zadních tyčí' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Penalta z místa proti brankáři' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Penalta z místa (20 střel)' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Zeď' })).toBeChecked();
    // náhled plánu (Kolo po kole): kolo = jedna disciplína
    await discView(user, 'Kolo po kole');
    expect(within(preview()).getAllByRole('listitem')[0]).toHaveTextContent('1. koloPřihrávky na pětce');
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
    await discView(user, 'Kolo po kole');
    expect(preview()).toHaveTextContent('1. vlna');
    await discView(user, 'Plán disciplín');
    await user.click(screen.getByRole('checkbox', { name: 'Simulace ligového kola' }));
    await discView(user, 'Kolo po kole');
    expect(preview()).not.toHaveTextContent('1. vlna');
    const rows = within(preview()).getAllByRole('listitem').length;
    await discView(user, 'Plán disciplín');
    const before = screen.getByText(/^Naplánováno/).textContent;
    const count = () => Number(screen.getByRole('status', { name: 'Počet kol: Zeď' }).textContent!.replace('×', ''));
    const n = count();
    await user.click(screen.getByRole('button', { name: 'Přidat kolo: Zeď' }));
    expect(screen.getByText(/^Naplánováno/).textContent).not.toBe(before);
    expect(count()).toBe(n + 2); // Zeď po dvou kolech (obě strany)
    await discView(user, 'Kolo po kole');
    expect(within(preview()).getAllByRole('listitem').length).toBe(rows + 2); // náhled se přepočítá
  });

  it('zápis výsledku zamkne kola; nastavení běžícího tréninku jde otevřít (uložení přegeneruje rozpis)', async () => {
    const { user, repo } = await newTraining(8);
    await user.click(screen.getByRole('button', { name: '6. kolo' }));
    const card = screen.getAllByRole('group').find((g) => g.getAttribute('aria-label')?.startsWith('6. kolo, stůl 1'))!;
    fireEvent.click(within(card).getByRole('button', { name: '6. kolo, stůl 1: góly vlevo 6' }));
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].lockedRounds).toHaveLength(6));
    expect(screen.getByRole('button', { name: 'Upravit nastavení' })).toBeInTheDocument();
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
    const repo = memoryRepository({ players: players(4), trainings: [], catalog: DEFAULT_CATALOG });
    window.location.hash = '#/trainings';
    render(<App repo={repo} />);
    await user.click(await screen.findByRole('button', { name: 'Nový trénink' }));
    await user.click(screen.getByRole('checkbox', { name: 'H1' }));
    expect(screen.queryByText(/Ještě chybí/)).toBeNull(); // jde i trénink pro 1 hráče
    await user.click(screen.getByRole('checkbox', { name: 'H2' }));
    await next(user);
    const sim = screen.getByRole('checkbox', { name: 'Simulace ligového kola' });
    expect(sim).toBeDisabled();
    expect(sim).not.toBeChecked();
    expect(screen.getByText('potřebuje aspoň 4 hráče')).toBeInTheDocument();
    await discView(user, 'Kolo po kole');
    expect(preview()).not.toHaveTextContent('1. vlna');
    await user.click(stepButton('Přítomní'));
    await user.click(screen.getByRole('checkbox', { name: 'H3' }));
    await user.click(screen.getByRole('checkbox', { name: 'H4' }));
    await next(user);
    expect(screen.getByRole('checkbox', { name: 'Simulace ligového kola' })).toBeChecked();
    await discView(user, 'Kolo po kole');
    expect(preview()).toHaveTextContent('1. vlna');
  });
});
