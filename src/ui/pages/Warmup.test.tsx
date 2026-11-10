import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { memoryAuth } from '../../storage/auth';
import { buildSchedule } from '../../domain/schedule';
import { drillItemId } from '../../domain/queue';
import type { Player, Training } from '../../domain/types';

const players: Player[] = Array.from({ length: 4 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const roster: Player[] = [...players, { id: 'id9', name: 'Org', order: 9, archived: false, organizer: true }];
const base: Training = {
  id: 't1', date: new Date().toISOString().slice(0, 10), startTime: '18:00', mode: 'team', tables: 2, attendees: players.map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'performance', simTeams: null, format: 'custom', durationMin: 60,
  plan: { warmup: 1, normal: 1 }, lockedRounds: [], breaks: [], createdBy: 'id9',
};
/** ID utkání Rozcvičky, kde cvičí daný hráč. */
function warmupItemOf(playerId: string): string {
  const row = buildSchedule(base).sections[0].rows[0];
  const j = row.cells.findIndex((c) => c?.type === 'group' && c.players.includes(playerId));
  const c = row.cells[j]!;
  return drillItemId(row, j + 1, c.type === 'group' ? c.players : []);
}
const authAs = (playerId: string) =>
  memoryAuth({ players: roster.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId, isAdmin: false, mustChangePassword: false } });
const ended = (repo: ReturnType<typeof memoryRepository>, id: string) => repo.snapshot().trainings[0].playTimes?.[id]?.endedAt;

afterEach(() => vi.restoreAllMocks());

it('Moje hry: Ukončit běžící Rozcvičky se zeptá; Zrušit nic nezapíše, OK ukončí', async () => {
  window.location.hash = '#/moje-hry';
  const id = warmupItemOf('id1');
  const repo = memoryRepository({ players: roster, trainings: [{ ...base, playTimes: { training: { startedAt: Date.now() - 120_000 }, [id]: { startedAt: Date.now() - 60_000 } } }] });
  render(<App repo={repo} auth={authAs('id1')} />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Moje hry' });
  expect(screen.getByRole('timer')).toHaveTextContent('fáze 1 / 7');
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await user.click(screen.getByRole('button', { name: 'Potvrdit konec' }));
  expect(ask).toHaveBeenCalledWith('Rozcvička ještě běží – opravdu ukončit?');
  expect(ended(repo, id)).toBeUndefined();
  ask.mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: 'Potvrdit konec' }));
  await vi.waitFor(() => expect(ended(repo, id)).toBeDefined());
});

it('Moje hry: po doběhnutí timeru se Ukončit už neptá', async () => {
  window.location.hash = '#/moje-hry';
  const id = warmupItemOf('id1');
  const repo = memoryRepository({ players: roster, trainings: [{ ...base, playTimes: { training: { startedAt: Date.now() - 700_000 }, [id]: { startedAt: Date.now() - 600_000 } } }] });
  render(<App repo={repo} auth={authAs('id1')} />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Moje hry' });
  const ask = vi.spyOn(window, 'confirm');
  await user.click(screen.getByRole('button', { name: 'Potvrdit konec' }));
  expect(ask).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(ended(repo, id)).toBeDefined());
});

it('Živě: u Rozcvičky organizátor nezadává výsledek, jen potvrdí konec; běžící ukazuje fázi', async () => {
  window.location.hash = '#/zive';
  const id = warmupItemOf('id1');
  const repo = memoryRepository({ players: roster, trainings: [{ ...base, playTimes: { training: { startedAt: Date.now() - 120_000 }, [id]: { startedAt: Date.now() - 70_000 } } }] });
  render(<App repo={repo} auth={authAs('id9')} />);
  const user = userEvent.setup();
  const board = await screen.findByRole('region', { name: 'Aktivní utkání' });
  const tables = within(board).getAllByRole('group', { name: /^Stůl / });
  for (const tb of tables) expect(within(tb).queryByRole('button', { name: 'Zadat výsledek' })).toBeNull();
  const running = tables.find((tb) => tb.textContent?.includes('H1'))!;
  expect(running).toHaveTextContent(/Rozcvička – fáze 2 \/ 7, zbývá/);
  const idle = tables.find((tb) => tb !== running)!;
  expect(within(idle).getByRole('button', { name: 'Potvrdit konec' })).toBeInTheDocument();
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await user.click(within(running).getByRole('button', { name: 'Potvrdit konec' }));
  expect(ask).toHaveBeenCalledWith('Rozcvička ještě běží – opravdu ukončit?');
  expect(ended(repo, id)).toBeUndefined();
});

it('Moje hry: u Rozcvičky jen odpočet (bez stopek „Doba hry“) a po konci bez „zkontroluj výsledek“', async () => {
  window.location.hash = '#/moje-hry';
  const id = warmupItemOf('id1');
  const repo = memoryRepository({ players: roster, trainings: [{ ...base, playTimes: { training: { startedAt: Date.now() - 700_000 }, [id]: { startedAt: Date.now() - 600_000 } } }] });
  render(<App repo={repo} auth={authAs('id1')} />);
  await screen.findByRole('heading', { name: 'Moje hry' });
  expect(screen.queryByLabelText('Doba hry')).toBeNull();
  expect(screen.queryByText(/zkontroluj výsledek/)).toBeNull();
  expect(screen.getByText('Hotovo – Rozcvička skončila.')).toBeInTheDocument();
});
