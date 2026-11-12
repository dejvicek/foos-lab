import { render, screen, within } from '@testing-library/react';
import { onTestFinished } from 'vitest';
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

/** Trénink, který organizátor zahájil a začíná zápasem (hráč je hned na řadě). */
const started = (): Training => ({ ...training, plan: { normal: 2, wall: 1 }, playTimes: { training: { startedAt: Date.now() } } });

import { createTraining } from '../../test/wizard';

async function login(nick: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Přezdívka'), nick);
  await user.type(screen.getByLabelText('Heslo'), password);
  await user.click(screen.getByRole('button', { name: 'Přihlásit' }));
  return user;
}

beforeEach(() => {
  window.location.hash = '#/trainings';
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

  it('Enter v přezdívce skočí na heslo, Enter v hesle přihlásí (klávesnice mobilu: Další / Přejít)', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: null });
    render(<App repo={memoryRepository({ players: roster, trainings: [training] })} auth={auth} />);
    const user = userEvent.setup();
    const nick = await screen.findByLabelText('Přezdívka');
    const pw = screen.getByLabelText('Heslo');
    expect(nick).toHaveAttribute('enterkeyhint', 'next');
    expect(pw).toHaveAttribute('enterkeyhint', 'go');
    await user.type(nick, 'Milan{Enter}');
    expect(pw).toHaveFocus();
    await user.type(pw, 'Milan{Enter}');
    expect(await screen.findByRole('heading', { name: 'Nastav si heslo' })).toBeInTheDocument();

    const first = screen.getByLabelText('Nové heslo');
    const again = screen.getByLabelText('Nové heslo znovu');
    expect(first).toHaveAttribute('enterkeyhint', 'next');
    await user.type(first, 'tajne123{Enter}');
    expect(again).toHaveFocus();
    expect(screen.queryByText('Hesla se neshodují.')).toBeNull();
  });

  it('hráč v cizím tréninku: žádné nastavení; nezahájený trénink nemá Živě / Moje hry; nezapíše nic', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    window.location.hash = '#/trainings';
    render(<App repo={memoryRepository({ players: roster, trainings: [training] })} auth={auth} />);
    await screen.findByRole('list', { name: 'Uložené tréninky' });
    await userEvent.setup().click(screen.getByRole('list', { name: 'Uložené tréninky' }).querySelector('button')!);
    expect(await screen.findByRole('table', { name: 'Rozpis tréninku' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upravit nastavení' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Smazat trénink' })).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Hlavní navigace' });
    expect(within(nav).queryByRole('button', { name: /^(Živě|Moje hry)/ })).toBeNull();
    expect(within(nav).queryByRole('button', { name: 'Hráči' })).toBeNull();

    const rowToggles = screen.getAllByRole('button').filter((b) => /^\d+\. kolo$/.test(b.textContent ?? ''));
    // v zápasovém kole: vlastní zápas zapisovatelný, cizí jen ke čtení
    const matchRound = rowToggles.find((b) => b.closest('tr')?.textContent?.includes('Normální leg'))!;
    await userEvent.setup().click(matchRound);
    const groups = screen.getAllByRole('group').filter((g) => /^\d+\. kolo, stůl \d$/.test(g.getAttribute('aria-label') ?? ''));
    for (const g of groups) {
      // trénink nezahájil organizátor: hráč nezahájí ani nezapíše nic, ani u svého stolu
      expect(within(g).queryByRole('button', { name: 'Zahájit' })).toBeNull();
      const chips = within(g).getAllByRole('button', { name: /góly (vlevo|vpravo) \d+$/ });
      for (const c of chips) expect((c as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('notebook: „Moje hry“ zapisuje kliknutím na čísla', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    const repo = memoryRepository({ players: roster, trainings: [started()] });
    render(<App repo={repo} auth={auth} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Moje hry/ }));
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    while (!within(mine).queryAllByRole('button', { name: /góly vlevo 6$/ }).length)
      await user.click(within(mine).getByRole('button', { name: 'Další kolo' }));
    expect(within(mine).queryByRole('button', { name: /^Gól vlevo/ })).toBeNull();
    expect(within(mine).getAllByRole('button', { name: /góly vlevo 6$/ })[0]).toBeDisabled(); // až po zahájení
    await user.click(within(mine).getByRole('button', { name: 'Zahájit' }));
    await user.click(within(mine).getAllByRole('button', { name: /góly vlevo 6$/ })[0]);
    await user.click(within(mine).getAllByRole('button', { name: /góly vpravo 2$/ })[0]);
    await vi.waitFor(() => expect(Object.values(repo.snapshot().trainings[0].scores)).toEqual([{ ga: 6, gb: 2 }]));
  });

  it('telefon: hráč ťuká v „Můj stůl“: gól se přičte, kolo se zamkne, výsledek se uloží', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    onTestFinished(() => {
      window.matchMedia = original;
    });
    const auth = memoryAuth({ players: authPlayers, signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    const repo = memoryRepository({ players: roster, trainings: [started()] });
    render(<App repo={repo} auth={auth} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Moje hry/ }));
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    expect(within(mine).queryByRole('spinbutton')).toBeNull(); // žádná klávesnice
    while (!within(mine).queryByRole('button', { name: /^Gól vlevo/ }))
      await user.click(within(mine).getByRole('button', { name: 'Další kolo' }));
    await user.click(within(mine).getByRole('button', { name: 'Zahájit' }));
    await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    expect(within(mine).getByRole('button', { name: /^Gól vlevo/ })).toHaveTextContent('2');
    await vi.waitFor(() => {
      const t = repo.snapshot().trainings[0];
      expect(Object.values(t.scores)).toEqual([{ ga: 2, gb: 0 }]);
      expect(t.lockedRounds.length).toBeGreaterThan(0);
    });
    // dohraný leg nabídne další kolo
    expect(within(mine).queryByRole('button', { name: /Na další kolo/ })).toBeNull();
    for (let i = 0; i < 4; i++) await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    expect(within(mine).getByText(/Leg dohrán 6 : 0/)).toBeInTheDocument();
    expect(within(mine).queryByRole('button', { name: /Na další kolo/ })).toBeNull(); // nejdřív potvrdit konec
    await user.click(within(mine).getByRole('button', { name: 'Potvrdit konec' }));
    const title = within(mine).getByRole('heading', { level: 2 }).textContent;
    await user.click(within(mine).getByRole('button', { name: /Na další kolo/ }));
    expect(within(mine).getByRole('heading', { level: 2 }).textContent).not.toBe(title);
  });

  it('admin: resetuje heslo hráče na přezdívku', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: null });
    await auth.signIn('Milan', 'Milan');
    await auth.changePassword('jine');
    await auth.signOut();
    await auth.signIn('Dejv', 'Dejv');
    await auth.changePassword('admin1');
    window.location.hash = '#/players';
    render(<App repo={memoryRepository({ players: roster, trainings: [training] })} auth={auth} />);
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(await screen.findByRole('button', { name: 'Resetovat heslo Milan' }));
    expect(await screen.findByText('Heslo hráče Milan je zase jeho přezdívka.')).toBeInTheDocument();
    expect(auth.passwords.get('id2')).toBe('Milan');
    vi.restoreAllMocks();
  });

  it('hráč bez role organizátora trénink nezaloží (10. 11. 2026)', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    window.location.hash = '#/trainings';
    render(<App repo={memoryRepository({ players: roster, trainings: [] })} auth={auth} />);
    expect(await screen.findByText('Zatím žádný trénink. Zakládá je admin nebo organizátor.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nový trénink/ })).toBeNull();
    window.location.hash = '#/trainings/new'; // ani přímou adresou
    expect(await screen.findByText(/Zakládat tréninky smí jen admin a organizátoři/)).toBeInTheDocument();
  });

  it('admin udělá z hráče organizátora na stránce Hráči; organizátor založí trénink a spravuje ho; cizí trénink ne', async () => {
    const asAdmin = memoryAuth({ players: authPlayers, signedIn: { playerId: 'id1', isAdmin: true, mustChangePassword: false } });
    const repo = memoryRepository({ players: roster, trainings: [{ ...training, createdBy: 'id1' }] });
    window.location.hash = '#/players';
    const { unmount } = render(<App repo={repo} auth={asAdmin} />);
    const toggle = await screen.findByRole('button', { name: 'Organizátor: Milan' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.setup().click(toggle);
    expect(screen.getByRole('button', { name: 'Organizátor: Milan' })).toHaveAttribute('aria-pressed', 'true');
    await vi.waitFor(() => expect(repo.snapshot().players.find((p) => p.id === 'id2')?.organizer).toBe(true));
    unmount();

    const auth = memoryAuth({ players: authPlayers, signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    window.location.hash = '#/trainings';
    render(<App repo={repo} auth={auth} />);
    const user = userEvent.setup();
    await createTraining(user, ['Milan', 'Lavi', 'Luky', 'Osky']); // klubový trénink aspoň pro 4
    // zakladatel spravuje: nastavení (i běžícího tréninku) a mazání
    expect(await screen.findByRole('button', { name: 'Upravit nastavení' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Smazat trénink' })).toBeInTheDocument();
    await vi.waitFor(() => expect(repo.snapshot().trainings.find((t) => t.id !== 't1')?.createdBy).toBe('id2'));

    window.location.hash = '#/trainings/t1';
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Smazat trénink' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Upravit nastavení' })).toBeNull();
    window.location.hash = '#/trainings/t1/settings'; // ani přímou adresou
    expect(await screen.findByText(/Nastavení tréninku může měnit jen/)).toBeInTheDocument();
  });
});
