import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { buildSchedule } from '../../domain/schedule';
import { queueOf } from '../../domain/queue';
import type { Player, Training } from '../../domain/types';
import { memoryAuth } from '../../storage/auth';

// H1 je organizátor (zakládá a řídí tréninky v testech).
const players: Player[] = Array.from({ length: 4 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false, ...(i === 0 ? { organizer: true } : {}) }));
// 4 hráči, 2 stoly: kolo = 1 zápas dvojic na stole 1
const t: Training = {
  id: 't1', date: '2026-11-02', startTime: '18:00', mode: 'team', tables: 2, attendees: players.map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 60, plan: { normal: 3 }, lockedRounds: [], breaks: [],
};
const ids = queueOf(buildSchedule(t)).flatMap((e) => (e.kind === 'item' ? [e.id] : []));
/** Přihlášený H1 – hraje a trénink založil (organizátor). */
const organizer = () =>
  memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
const at = (h: number, m: number, s = 0) => new Date(2026, 10, 2, h, m, s).getTime();

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 18, 3));
});
afterEach(() => vi.useRealTimers());

describe('Živě', () => {
  it('Živě je v navigaci až po zahájení tréninku; organizátor nezahajuje, zadá nahlášený výsledek a potvrdí konec → čas od vypsání, na stůl jde další', async () => {
    window.location.hash = '#/trainings/t1';
    const repo = memoryRepository({ players, trainings: [{ ...t, createdBy: 'id1' }] });
    render(<App repo={repo} auth={organizer()} />);
    const user = userEvent.setup();
    const nav = await screen.findByRole('navigation', { name: 'Hlavní navigace' });
    expect(within(nav).queryByRole('button', { name: 'Živě' })).toBeNull(); // trénink ještě nezačal
    expect(within(nav).queryByRole('button', { name: 'Hráči' })).toBeNull(); // jen pro admina
    await user.click(await screen.findByRole('button', { name: 'Zahájit trénink' }));
    await user.click(within(nav).getByRole('button', { name: 'Živě' }));
    const board = screen.getByRole('region', { name: 'Aktivní utkání' });
    const t1 = within(board).getByRole('group', { name: 'Stůl 1' });
    expect(t1).toHaveTextContent('1. kolo');
    expect(t1).toHaveTextContent('čeká na zahájení'); // plánovaný začátek 18:00 nehraje roli
    expect(within(board).getByRole('list', { name: 'Další v pořadí' })).toHaveTextContent('2. kolo');
    expect(within(t1).queryByRole('button', { name: 'Zahájit' })).toBeNull(); // zahájit jde jen v Moje hry
    vi.setSystemTime(new Date(2026, 10, 2, 18, 11));
    // hráči výsledek jen nahlásí: organizátor ho zadá v Živě a potvrdí konec
    expect(within(t1).queryByRole('button', { name: 'Potvrdit' })).toBeNull();
    await user.click(within(t1).getByRole('button', { name: 'Zadat výsledek' }));
    await user.click(within(t1).getByRole('button', { name: '1. kolo, stůl 1: góly vlevo 6' }));
    await user.click(within(t1).getByRole('button', { name: '1. kolo, stůl 1: góly vpravo 3' }));
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].scores[ids[0]]).toMatchObject({ ga: 6, gb: 3 }));
    await user.click(within(t1).getByRole('button', { name: 'Potvrdit konec' }));
    expect(within(board).getByRole('group', { name: 'Stůl 1' })).toHaveTextContent('2. kolo');
    // potvrzeno organizátorem bez zahájení: čas od vypsání (zahájení tréninku 18:03) do potvrzení
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].playTimes?.[ids[0]]?.startedAt).toBe(at(18, 3)));
    expect(repo.snapshot().trainings[0].playTimes?.[ids[0]]?.endedAt).toBeGreaterThanOrEqual(at(18, 11)); // (falešné hodiny při čekání na uložení kousek poběží)
  });
});

describe('Zdržovači', () => {
  const timed: Training = {
    ...t,
    playTimes: {
      [ids[0]]: { startedAt: at(18, 2), endedAt: at(18, 10) }, // první zahájení = začátek tréninku → čekání 0, hra 8:00
      [ids[1]]: { startedAt: at(18, 12), endedAt: at(18, 19) }, // aktivní 18:10 → čekání 2:00, hra 7:00
    },
  };

  it('v tréninku: čekání a hra na hráče', async () => {
    window.location.hash = '#/trainings/t1';
    render(<App repo={memoryRepository({ players, trainings: [timed] })} />);
    const table = await screen.findByRole('table', { name: 'Zdržovači' });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('1:00'); // průměrné čekání (0 + 2:00) / 2
    expect(row).toHaveTextContent('7:30'); // průměrná hra (8 + 7) / 2
    // první tři Zdržovači: červený kroužek a šnek, první „Brzda“; čtvrtý bez
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Brzda');
    expect(within(rows[3]).getByTitle('3. nejdelší čekání')).toBeInTheDocument();
    expect(rows[3]).not.toHaveTextContent('Brzda');
    expect(within(rows[4]).queryByTitle(/nejdelší čekání/)).not.toBeInTheDocument();
  });

  it('v žebříčku jako třetí část', async () => {
    window.location.hash = '#/ladder';
    render(<App repo={memoryRepository({ players, trainings: [timed] })} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Zdržovači' }));
    const table = screen.getByRole('table', { name: 'Zdržovači' });
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    expect(table).toHaveTextContent('H1');
  });
});

describe('Můj stůl: zahájení a konec ťukáním', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  const openMine = async () => {
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    window.location.hash = ''; // otevření appky: jsem na řadě → rovnou Moje hry
    const repo = memoryRepository({ players, trainings: [{ ...t, playTimes: { training: { startedAt: at(18, 0) } } }] });
    render(<App repo={repo} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    return { repo, mine, user: userEvent.setup() };
  };

  it('skóre jde ťukat až po Zahájit; dohraný leg čeká na potvrzení (odpočet 15 s), potvrdit jde hned', async () => {
    const { repo, mine, user } = await openMine();
    expect(screen.getByRole('button', { name: 'Moje hry – jsi na řadě' })).toHaveAttribute('aria-current', 'page');
    expect(within(mine).getByRole('button', { name: /^Gól vlevo/ })).toBeDisabled();
    expect(mine).toHaveTextContent('Skóre jde zapsat po zahájení utkání.');
    await user.click(within(mine).getByRole('button', { name: 'Zahájit' }));
    expect(within(mine).getByRole('button', { name: 'Potvrdit konec' })).toBeInTheDocument();
    expect(within(mine).queryByLabelText('Zahájeno')).toBeNull(); // časy se ručně neupravují
    for (let i = 0; i < 6; i++) await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    expect(mine).toHaveTextContent('Utkání skončí samo za 15 s, potvrdit jde hned');
    expect(repo.snapshot().trainings[0].playTimes?.[ids[0]]?.endedAt).toBeUndefined();
    await user.click(within(mine).getByRole('button', { name: 'Potvrdit konec' }));
    await vi.waitFor(() => {
      const pt = repo.snapshot().trainings[0].playTimes?.[ids[0]];
      expect(pt?.startedAt).toBe(at(18, 3));
      expect(pt?.endedAt).toBe(at(18, 3));
    });
  });

  it('dohraný leg bez potvrzení skončí sám 15 s po posledním ťuknutí; oprava výsledku odpočet zastaví (10. 11. 2026)', async () => {
    const { repo, mine, user } = await openMine();
    await user.click(within(mine).getByRole('button', { name: 'Zahájit' }));
    for (let i = 0; i < 6; i++) await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    // oprava (−1 gól přes Zpět): leg už není dohraný, odpočet zmizí
    await user.click(within(mine).getByRole('button', { name: '↶ Zpět' }));
    expect(mine).not.toHaveTextContent('skončí samo');
    vi.setSystemTime(at(18, 4)); // poslední ťuknutí v 18:04
    await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    expect(mine).toHaveTextContent('Utkání skončí samo za 15 s');
    vi.setSystemTime(at(18, 4) + 16_000);
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].playTimes?.[ids[0]]?.endedAt).toBe(at(18, 4) + 15_000), { timeout: 6000 });
    // utkání skončilo → Moje hry přejde na další kolo, odpočet zmizí
    await vi.waitFor(() => expect(screen.getByRole('region', { name: 'Moje kolo' })).not.toHaveTextContent('skončí samo'));
  });
});

describe('pauza řízená organizátorem', () => {
  it('po kole před pauzou: Zahájit pauzu → odpočet; Spustit další kolo hned → další utkání na řadě', async () => {
    const paused: Training = {
      ...t,
      breaks: [{ after: 1, min: 10 }],
      playTimes: { training: { startedAt: at(18, 0) }, [ids[0]]: { startedAt: at(18, 0), endedAt: at(18, 2) } },
    };
    window.location.hash = '#/live';
    const repo = memoryRepository({ players, trainings: [{ ...paused, createdBy: 'id1' }] });
    render(<App repo={repo} auth={organizer()} />);
    const user = userEvent.setup();
    await screen.findByRole('region', { name: 'Aktivní utkání' });
    const bar = screen.getByRole('status');
    expect(bar).toHaveTextContent('Pauza 10 min');
    expect(within(screen.getByRole('region', { name: 'Aktivní utkání' })).getByRole('group', { name: 'Stůl 1' })).toHaveTextContent('pauza');
    await user.click(within(bar).getByRole('button', { name: 'Zahájit pauzu' }));
    expect(screen.getByRole('status')).toHaveTextContent('zbývá 10:00');
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Spustit další kolo hned' }));
    expect(within(screen.getByRole('region', { name: 'Aktivní utkání' })).getByRole('group', { name: 'Stůl 1' })).toHaveTextContent('2. kolo');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].playTimes?.['pause|0']).toEqual({ startedAt: at(18, 3), endedAt: at(18, 3) }));
  });
});

describe('pauza v Trénink tabu', () => {
  const paused: Training = {
    ...t,
    breaks: [{ after: 1, min: 10 }],
    playTimes: { training: { startedAt: at(18, 0) }, [ids[0]]: { startedAt: at(18, 0), endedAt: at(18, 2) } },
  };

  it('Zahájit pauzu / Spustit další kolo jsou v řádku pauzy, ne v liště nahoře', async () => {
    window.location.hash = '#/trainings/t1';
    const repo = memoryRepository({ players, trainings: [{ ...paused, createdBy: 'id1' }] });
    render(<App repo={repo} auth={organizer()} />);
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.queryByRole('status')).toBeNull();
    const start = screen.getByRole('button', { name: 'Zahájit pauzu' });
    const row = start.closest('tr')!;
    expect(row).toHaveClass('break-row');
    expect(within(row).getByRole('button', { name: 'Spustit další kolo' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Odebrat pauzu' })).toBeInTheDocument();
    await user.click(start);
    const running = screen.getByRole('button', { name: 'Spustit další kolo hned' }).closest('tr')!;
    expect(running).toHaveTextContent('zbývá 10:00');
    // zahájená pauza: délka jde změnit, přesun ani odebrání ne
    expect(within(running).queryByRole('button', { name: 'Odebrat pauzu' })).toBeNull();
    expect(within(running).queryByRole('button', { name: 'Přesunout pauzu' })).toBeNull();
    expect(running).not.toHaveAttribute('draggable', 'true');
    await user.selectOptions(within(running).getByRole('combobox', { name: 'Délka pauzy' }), '15');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].breaks).toEqual([{ after: 1, min: 15 }]));
    expect(screen.getByRole('button', { name: 'Spustit další kolo hned' }).closest('tr')).toHaveTextContent('zbývá 15:00');
    await user.click(screen.getByRole('button', { name: 'Spustit další kolo hned' }));
    // (čekání na uložení délky výše posunulo falešné hodiny o pár ms)
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].playTimes?.['pause|0']).toEqual({ startedAt: at(18, 3), endedAt: expect.any(Number) }));
    expect(screen.queryByRole('button', { name: /Spustit další kolo/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Odebrat pauzu' })).toBeNull();
  });

  it('hráč (ne organizátor) vidí u pauzy, že další kolo spustí organizátor', async () => {
    window.location.hash = '#/trainings/t1';
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    render(<App repo={memoryRepository({ players, trainings: [{ ...paused, createdBy: 'id1' }] })} auth={auth} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.queryByRole('button', { name: 'Zahájit pauzu' })).toBeNull();
    expect(screen.getByText(/další kolo spustí organizátor/).closest('tr')).toHaveClass('break');
  });
});

describe('otevření appky', () => {
  it('běží trénink, ale nejsem na řadě (pauza) → Živě; nic neběží → Trénink bez Živě', async () => {
    const paused: Training = {
      ...t,
      breaks: [{ after: 1, min: 10 }],
      playTimes: { training: { startedAt: at(18, 0) }, [ids[0]]: { startedAt: at(18, 0), endedAt: at(18, 2) } },
    };
    window.location.hash = '';
    const { unmount } = render(<App repo={memoryRepository({ players, trainings: [paused] })} auth={organizer()} />);
    expect(await screen.findByRole('region', { name: 'Aktivní utkání' })).toBeInTheDocument();
    unmount();
    window.location.hash = '';
    render(<App repo={memoryRepository({ players, trainings: [t] })} auth={organizer()} />);
    expect(await screen.findByRole('list', { name: 'Uložené tréninky' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Živě' })).toBeNull();
  });
});

describe('organizátor, který nehraje', () => {
  it('po otevření appky vidí Živě a ovládá trénink; Moje hry v navigaci nemá', async () => {
    const auth = memoryAuth({ players: [{ id: 'org', name: 'Org' }], signedIn: { playerId: 'org', isAdmin: false, mustChangePassword: false } });
    const run: Training = { ...t, createdBy: 'org', playTimes: { training: { startedAt: at(18, 0) } } };
    window.location.hash = '';
    render(<App repo={memoryRepository({ players: [...players, { id: 'org', name: 'Org', order: 9, archived: false, organizer: true }], trainings: [run] })} auth={auth} />);
    const board = await screen.findByRole('region', { name: 'Aktivní utkání' });
    const nav = screen.getByRole('navigation', { name: 'Hlavní navigace' });
    expect(within(nav).getByRole('button', { name: 'Živě' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('button', { name: /^Moje hry/ })).toBeNull();
    expect(within(within(board).getByRole('group', { name: 'Stůl 1' })).getByRole('button', { name: 'Zadat výsledek' })).toBeInTheDocument();
    expect(within(board).queryByRole('button', { name: 'Zahájit' })).toBeNull();
  });
});

describe('hráč zahajuje jen v Moje hry', () => {
  it('v rozpisu ani v Živě Zahájit není; z Živě odkaz „Zahájit v Moje hry“, tam teprve Zahájit', async () => {
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    const run: Training = { ...t, createdBy: 'id1', playTimes: { training: { startedAt: at(18, 0) } } };
    window.location.hash = '#/trainings/t1';
    render(<App repo={memoryRepository({ players, trainings: [run] })} auth={auth} />);
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    const toggle = screen.getByRole('button', { name: /^1\. kolo$/ });
    if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle);
    expect(within(screen.getByRole('group', { name: '1. kolo, stůl 1' })).queryByRole('button', { name: 'Zahájit' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Živě' }));
    const board = screen.getByRole('region', { name: 'Aktivní utkání' });
    expect(within(board).queryByRole('button', { name: 'Zahájit' })).toBeNull();
    await user.click(within(board).getByRole('button', { name: 'Zahájit v Moje hry' }));
    const mine = screen.getByRole('region', { name: 'Moje kolo' });
    expect(within(mine).getByRole('button', { name: 'Zahájit' })).toBeInTheDocument();
  });
});

describe('Moje hry otevře rozehranou hru', () => {
  it('1. kolo dohrané → otevře se 2. kolo, které je na řadě', async () => {
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    const run: Training = { ...t, playTimes: { training: { startedAt: at(18, 0) }, [ids[0]]: { startedAt: at(18, 0), endedAt: at(18, 2) } } };
    window.location.hash = '#/my-games';
    render(<App repo={memoryRepository({ players, trainings: [run] })} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    expect(within(mine).getByRole('heading', { level: 2 })).toHaveTextContent('2. kolo');
    expect(within(mine).getByRole('button', { name: 'Zahájit' })).toBeInTheDocument();
  });
});

describe('průběh hry', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it('ťukání se ukládá jako události; Průběh ukáže dvě dráhy, Zpět událost zruší', async () => {
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    const repo = memoryRepository({ players, trainings: [{ ...t, playTimes: { training: { startedAt: at(18, 0) } } }] });
    window.location.hash = '#/my-games';
    render(<App repo={repo} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    const user = userEvent.setup();
    await user.click(within(mine).getByRole('button', { name: 'Zahájit' }));
    await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    await user.click(within(mine).getByRole('button', { name: /^Gól vpravo/ }));
    await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    await user.click(within(mine).getByRole('button', { name: /Zpět/ }));
    const lanes = within(mine).getByRole('group', { name: 'Průběh' });
    expect(within(lanes).getAllByRole('listitem', { name: /^Gól/ })).toHaveLength(2);
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].events?.map((e) => [e.kind, e.side, e.delta])).toEqual([
      ['goal', 'A', 1], ['goal', 'B', 1], ['goal', 'A', 1], ['goal', 'A', -1],
    ]));
  });
});
