import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { buildSchedule } from '../../domain/schedule';
import { queueOf } from '../../domain/queue';
import type { Player, Training } from '../../domain/types';
import { memoryAuth } from '../../storage/auth';

const players: Player[] = Array.from({ length: 4 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
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
  it('Živě je v navigaci až po zahájení tréninku; stůl s vypsaným utkáním, Zahájit → hraje, Ukončit → další z fronty', async () => {
    window.location.hash = '#/trenink/t1';
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
    await user.click(within(t1).getByRole('button', { name: 'Zahájit' }));
    expect(t1).toHaveTextContent('hraje');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].playTimes?.[ids[0]]?.startedAt).toBe(at(18, 3)));
    vi.setSystemTime(new Date(2026, 10, 2, 18, 11));
    await user.click(within(t1).getByRole('button', { name: 'Ukončit' }));
    expect(within(board).getByRole('group', { name: 'Stůl 1' })).toHaveTextContent('2. kolo');
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
    window.location.hash = '#/trenink/t1';
    render(<App repo={memoryRepository({ players, trainings: [timed] })} />);
    const table = await screen.findByRole('table', { name: 'Zdržovači' });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('1:00'); // průměrné čekání (0 + 2:00) / 2
    expect(row).toHaveTextContent('7:30'); // průměrná hra (8 + 7) / 2
  });

  it('v žebříčku jako třetí část', async () => {
    window.location.hash = '#/zebricek';
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

  it('skóre jde ťukat až po Zahájit; dohraný leg utkání ukončí', async () => {
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    window.location.hash = ''; // otevření appky: jsem na řadě → rovnou Moje hra
    const repo = memoryRepository({ players, trainings: [{ ...t, playTimes: { training: { startedAt: at(18, 0) } } }] });
    render(<App repo={repo} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    expect(screen.getByRole('button', { name: 'Moje hra – jsi na řadě' })).toHaveAttribute('aria-current', 'page');
    const user = userEvent.setup();
    expect(within(mine).getByRole('button', { name: /^Gól vlevo/ })).toBeDisabled();
    expect(mine).toHaveTextContent('Skóre jde zapsat po zahájení utkání.');
    await user.click(within(mine).getByRole('button', { name: 'Zahájit' }));
    expect(within(mine).getByRole('button', { name: 'Ukončit' })).toBeInTheDocument();
    expect(within(mine).queryByLabelText('Zahájeno')).toBeNull(); // časy se ručně neupravují
    for (let i = 0; i < 6; i++) await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    await vi.waitFor(() => {
      const pt = repo.snapshot().trainings[0].playTimes?.[ids[0]];
      expect(pt?.startedAt).toBe(at(18, 3));
      expect(pt?.endedAt).toBe(at(18, 3));
    });
  });
});

describe('pauza řízená organizátorem', () => {
  it('po kole před pauzou: Zahájit pauzu → odpočet; Spustit další kolo hned → další utkání na řadě', async () => {
    const paused: Training = {
      ...t,
      breaks: [{ after: 1, min: 10 }],
      playTimes: { training: { startedAt: at(18, 0) }, [ids[0]]: { startedAt: at(18, 0), endedAt: at(18, 2) } },
    };
    window.location.hash = '#/zive';
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
