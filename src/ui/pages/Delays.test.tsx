import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { buildSchedule } from '../../domain/schedule';
import { queueOf } from '../../domain/queue';
import type { Player, Training } from '../../domain/types';

const players: Player[] = Array.from({ length: 4 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
// 4 hráči, 2 stoly: kolo = 1 zápas dvojic na stole 1
const t: Training = {
  id: 't1', date: '2026-11-02', startTime: '18:00', mode: 'team', tables: 2, attendees: players.map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 60, plan: { normal: 3 }, lockedRounds: [], breaks: [],
};
const ids = queueOf(buildSchedule(t)).flatMap((e) => (e.kind === 'item' ? [e.id] : []));
const at = (h: number, m: number, s = 0) => new Date(2026, 10, 2, h, m, s).getTime();

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 18, 3));
});
afterEach(() => vi.useRealTimers());

describe('Aktivní utkání', () => {
  it('stůl s vypsaným utkáním, Zahájit → hraje, Ukončit → na stůl jde další z fronty', async () => {
    window.location.hash = '#/trenink/t1';
    const repo = memoryRepository({ players, trainings: [t] });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Aktivní utkání' }));
    const board = screen.getByRole('region', { name: 'Aktivní utkání' });
    const t1 = within(board).getByRole('group', { name: 'Stůl 1' });
    expect(t1).toHaveTextContent('Kolo 1');
    expect(t1).toHaveTextContent('čeká na zahájení 3:00');
    expect(within(board).getByRole('list', { name: 'Další v pořadí' })).toHaveTextContent('Kolo 2');
    await user.click(within(t1).getByRole('button', { name: 'Zahájit' }));
    expect(t1).toHaveTextContent('hraje');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].playTimes?.[ids[0]]?.startedAt).toBe(at(18, 3)));
    vi.setSystemTime(new Date(2026, 10, 2, 18, 11));
    await user.click(within(t1).getByRole('button', { name: 'Ukončit' }));
    expect(within(board).getByRole('group', { name: 'Stůl 1' })).toHaveTextContent('Kolo 2');
  });
});

describe('Zdržovači', () => {
  const timed: Training = {
    ...t,
    playTimes: {
      [ids[0]]: { startedAt: at(18, 2), endedAt: at(18, 10) }, // čekání 2:00, hra 8:00
      [ids[1]]: { startedAt: at(18, 11), endedAt: at(18, 18) }, // aktivní 18:10 → čekání 1:00
    },
  };

  it('v tréninku: čekání a hra na hráče', async () => {
    window.location.hash = '#/trenink/t1';
    render(<App repo={memoryRepository({ players, trainings: [timed] })} />);
    const table = await screen.findByRole('table', { name: 'Zdržovači' });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('1:30'); // průměrné čekání (2:00 + 1:00) / 2
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

  it('první gól utkání zahájí, dohraný leg ho ukončí', async () => {
    const { memoryAuth } = await import('../../storage/auth');
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    window.location.hash = '#/trenink/t1';
    const repo = memoryRepository({ players, trainings: [t] });
    render(<App repo={repo} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    const user = userEvent.setup();
    expect(within(mine).getByRole('button', { name: 'Zahájit' })).toBeInTheDocument();
    await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    expect(within(mine).getByRole('button', { name: 'Ukončit' })).toBeInTheDocument();
    for (let i = 0; i < 5; i++) await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    await vi.waitFor(() => {
      const pt = repo.snapshot().trainings[0].playTimes?.[ids[0]];
      expect(pt?.startedAt).toBe(at(18, 3));
      expect(pt?.endedAt).toBe(at(18, 3));
    });
  });
});
