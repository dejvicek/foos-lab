import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { memoryAuth } from '../../storage/auth';
import type { Player, Training } from '../../domain/types';

const players: Player[] = Array.from({ length: 4 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
// organizátor (id9) nehraje; 4 hráči na 2 stolech: 1. kolo cvičení (dvě skupiny), 2. kolo zápas
const roster: Player[] = [...players, { id: 'id9', name: 'Org', order: 9, archived: false }];
const t: Training = {
  id: 't1', date: '2026-11-03', startTime: '18:00', mode: 'team', tables: 2, attendees: players.map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'performance', simTeams: null, format: 'custom', durationMin: 60,
  plan: { warmupPasses: 1, normal: 1 }, lockedRounds: [], breaks: [], createdBy: 'id9', playTimes: { training: { startedAt: Date.now() } },
};
const auth = () => memoryAuth({ players: roster.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id9', isAdmin: false, mustChangePassword: false } });

it('Živě: organizátor zadá nahlášený výsledek cvičení (počty hráčů) a potvrdí konec', async () => {
  window.location.hash = '#/zive';
  const repo = memoryRepository({ players: roster, trainings: [t] });
  render(<App repo={repo} auth={auth()} />);
  const user = userEvent.setup();
  const board = await screen.findByRole('region', { name: 'Aktivní utkání' });
  const t1 = within(board).getByRole('group', { name: 'Stůl 1' });
  await user.click(within(t1).getByRole('button', { name: 'Zadat výsledek' }));
  const inputs = within(t1).getAllByRole('spinbutton');
  expect(inputs).toHaveLength(2);
  await user.type(inputs[0], '12');
  await user.type(inputs[1], '15');
  await vi.waitFor(() => expect(Object.values(repo.snapshot().trainings[0].soloResults).map((r) => r['warmupPasses@1']).sort()).toEqual([12, 15]));
  await user.click(within(t1).getByRole('button', { name: 'Potvrdit konec' }));
  await vi.waitFor(() => expect(Object.values(repo.snapshot().trainings[0].playTimes ?? {}).filter((p) => p.endedAt !== undefined)).toHaveLength(1));
});
