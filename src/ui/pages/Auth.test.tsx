import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { memoryAuth } from '../../storage/auth';
import { autoPlan } from '../../domain/plan';
import type { Player, Training } from '../../domain/types';

const roster: Player[] = ['Dejv', 'Milan', 'David K', 'Lavi', 'Luky', 'Osky', 'Denys', 'Ondra'].map((name, order) => ({
  id: `id${order + 1}`, name, order, archived: false,
}));
const authPlayers = roster.map((p) => ({ id: p.id, name: p.name, isAdmin: p.name === 'Dejv' }));
const training: Training = {
  id: 't1', date: '2026-11-05', startTime: '18:00', mode: 'team', tables: 4,
  attendees: roster.map((p) => p.id), scores: {}, soloResults: {}, simSplit: 'order', simTeams: null,
  format: 'custom', durationMin: 120, plan: autoPlan(['setShooting', 'normal', 'wall'], 120, 8, 4), lockedRounds: [],
};

async function login(nick: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Přezdívka'), nick);
  await user.type(screen.getByLabelText('Heslo'), password);
  await user.click(screen.getByRole('button', { name: 'Přihlásit' }));
  return user;
}

beforeEach(() => {
  window.location.hash = '#/trenink';
});

describe('přihlášení', () => {
  it('bez přihlášení jen přihlašovací obrazovka; první heslo = přezdívka; vynucená změna hesla', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: null });
    render(<App repo={memoryRepository({ players: roster, trainings: [training] })} auth={auth} />);
    expect(await screen.findByRole('heading', { name: 'Přihlášení' })).toBeInTheDocument();
    expect(screen.queryByText('Trénink', { selector: 'nav button' })).toBeNull();

    let user = await login('Milan', 'spatne');
    expect(await screen.findByText('Špatné heslo.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Heslo'));
    await user.type(screen.getByLabelText('Heslo'), 'Milan');
    await user.click(screen.getByRole('button', { name: 'Přihlásit' }));

    expect(await screen.findByRole('heading', { name: 'Nastav si heslo' })).toBeInTheDocument();
    user = userEvent.setup();
    await user.type(screen.getByLabelText('Nové heslo'), 'tajne123');
    await user.type(screen.getByLabelText('Nové heslo znovu'), 'tajne123');
    await user.click(screen.getByRole('button', { name: 'Uložit heslo' }));
    expect(await screen.findByRole('button', { name: 'Odhlásit' })).toBeInTheDocument();
    expect(auth.passwords.get('id2')).toBe('tajne123');
  });

  it('hráč v cizím tréninku: žádné nastavení; „Můj stůl“; zapisuje jen své zápasy', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    window.location.hash = '#/trenink';
    render(<App repo={memoryRepository({ players: roster, trainings: [training] })} auth={auth} />);
    await screen.findByRole('list', { name: 'Uložené tréninky' });
    await userEvent.setup().click(screen.getByRole('list', { name: 'Uložené tréninky' }).querySelector('button')!);
    expect(await screen.findByRole('tab', { name: 'Můj stůl', selected: true })).toBeInTheDocument();
    expect(screen.queryByLabelText('Délka tréninku')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Smazat trénink' })).toBeNull();
    const mine = screen.getByRole('region', { name: 'Moje kolo' });
    expect(mine).toHaveTextContent('Milan');

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Celý rozpis' }));
    const rowToggles = screen.getAllByRole('button').filter((b) => /^Kolo \d+$/.test(b.textContent ?? ''));
    // v zápasovém kole: vlastní zápas zapisovatelný, cizí jen ke čtení
    const matchRound = rowToggles.find((b) => b.closest('tr')?.textContent?.includes('Normální leg'))!;
    await userEvent.setup().click(matchRound);
    const groups = screen.getAllByRole('group').filter((g) => /^Kolo \d+, stůl \d$/.test(g.getAttribute('aria-label') ?? ''));
    for (const g of groups) {
      const inputs = within(g).getAllByRole('spinbutton');
      const mineCard = g.textContent?.includes('Milan');
      for (const i of inputs) expect((i as HTMLInputElement).disabled).toBe(!mineCard);
    }
  });

  it('hráč ťuká v „Můj stůl“: gól se přičte, kolo se zamkne, výsledek se uloží', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    const repo = memoryRepository({ players: roster, trainings: [training] });
    render(<App repo={repo} auth={auth} />);
    await screen.findByRole('list', { name: 'Uložené tréninky' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('list', { name: 'Uložené tréninky' }).querySelector('button')!);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    expect(within(mine).queryByRole('spinbutton')).toBeNull(); // žádná klávesnice
    while (!within(mine).queryByRole('button', { name: /^Gól vlevo/ }))
      await user.click(within(mine).getByRole('button', { name: 'Další kolo' }));
    await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    expect(within(mine).getByRole('button', { name: /^Gól vlevo/ })).toHaveTextContent('2');
    await vi.waitFor(() => {
      const t = repo.snapshot().trainings[0];
      expect(Object.values(t.scores)).toEqual([{ ga: 2, gb: 0 }]);
      expect(t.lockedRounds.length).toBeGreaterThan(0);
    });
  });

  it('admin: resetuje heslo hráče na přezdívku', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: null });
    await auth.signIn('Milan', 'Milan');
    await auth.changePassword('jine');
    await auth.signOut();
    await auth.signIn('Dejv', 'Dejv');
    await auth.changePassword('admin1');
    window.location.hash = '#/hraci';
    render(<App repo={memoryRepository({ players: roster, trainings: [training] })} auth={auth} />);
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(await screen.findByRole('button', { name: 'Resetovat heslo Milan' }));
    expect(await screen.findByText('Heslo hráče Milan je zase jeho přezdívka.')).toBeInTheDocument();
    expect(auth.passwords.get('id2')).toBe('Milan');
    vi.restoreAllMocks();
  });

  it('hráč založí trénink a jako zakladatel ho spravuje; cizí trénink ne', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    const repo = memoryRepository({ players: roster, trainings: [{ ...training, createdBy: 'id1' }] });
    window.location.hash = '#/trenink';
    render(<App repo={repo} auth={auth} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nový trénink' }));
    expect(await screen.findByLabelText('Délka tréninku')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Smazat trénink' })).toBeInTheDocument();
    await vi.waitFor(() => expect(repo.snapshot().trainings.find((t) => t.id !== 't1')?.createdBy).toBe('id2'));

    window.location.hash = '#/trenink/t1';
    await vi.waitFor(() => expect(screen.queryByLabelText('Délka tréninku')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Smazat trénink' })).toBeNull();
  });
});
