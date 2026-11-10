import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildSchedule } from '../../domain/schedule';
import { lockThrough } from '../../domain/customSchedule';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player, Training } from '../../domain/types';
import { stepButton } from '../../test/wizard';

const players: Player[] = Array.from({ length: 4 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const players5: Player[] = [...players, { id: 'id5', name: 'H5', order: 4, archived: false }];
const t: Training = {
  id: 't1', date: '2026-11-03', startTime: '18:00', mode: 'team', tables: 1, attendees: players.map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'performance', simTeams: null, format: 'custom', durationMin: 60,
  plan: { normal: 3 }, lockedRounds: [], breaks: [],
};

describe('běžící trénink jde upravit – rozpis se přegeneruje (10. 11. 2026)', () => {
  const running = (extra: Partial<Training> = {}): Training => ({ ...t, playTimes: { training: { startedAt: 1 } }, ...extra });
  const open = async (tr: Training) => {
    window.location.hash = '#/trainings/t1/settings';
    const repo = memoryRepository({ players: players5, trainings: [tr] });
    render(<App repo={repo} />);
    await screen.findByRole('heading', { name: 'Kdy, kde a disciplíny' });
    return { repo, user: userEvent.setup() };
  };
  afterEach(() => vi.restoreAllMocks());

  it('po zahájení je „Upravit nastavení“ a v průvodci upozornění na přegenerování', async () => {
    window.location.hash = '#/trainings/t1';
    render(<App repo={memoryRepository({ players, trainings: [running()] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Upravit nastavení' }));
    expect(await screen.findByRole('note')).toHaveTextContent('Trénink běží – uložením změny se celý rozpis přegeneruje od začátku.');
    expect(screen.getByRole('button', { name: 'Uložit změny' })).toBeEnabled();
  });

  it('změna přítomných: po potvrzení zahodí zamčená kola, nesedící skóre a časy; zahájení tréninku zůstane', async () => {
    const s = buildSchedule(t);
    const [m1] = s.matches;
    const tr = running({
      scores: { [m1.id]: { ga: 6, gb: 2 } },
      lockedRounds: lockThrough(s, [], 1),
      playTimes: { training: { startedAt: 1 }, [m1.id]: { startedAt: 2, endedAt: 3 } },
    });
    const { repo, user } = await open(tr);
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(stepButton('Přítomní'));
    await user.click(screen.getByRole('checkbox', { name: 'H5' }));
    await user.click(screen.getByRole('button', { name: 'Uložit změny' }));
    expect(ask).toHaveBeenCalledWith('Trénink běží – celý rozpis se přegeneruje. Smaže se skóre u 1 zápasu a změřené časy u 1 utkání. Pokračovat?');
    await vi.waitFor(() => {
      const saved = repo.snapshot().trainings[0];
      expect(saved.attendees).toHaveLength(5);
      expect(saved.lockedRounds).toEqual([]);
      expect(saved.scores).toEqual({});
      expect(saved.playTimes).toEqual({ training: { startedAt: 1 } });
    });
  });

  it('zrušené potvrzení nic nezmění', async () => {
    const { repo, user } = await open(running());
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(stepButton('Přítomní'));
    await user.click(screen.getByRole('checkbox', { name: 'H5' }));
    await user.click(screen.getByRole('button', { name: 'Uložit změny' }));
    expect(screen.getByRole('button', { name: 'Uložit změny' })).toBeInTheDocument(); // zůstává v průvodci
    expect(repo.snapshot().trainings[0].attendees).toHaveLength(4);
  });

  it('beze změny rozpisu se uloží bez ptaní a zamčená kola zůstanou', async () => {
    const locked = lockThrough(buildSchedule(t), [], 1);
    const { repo, user } = await open(running({ lockedRounds: locked }));
    const ask = vi.spyOn(window, 'confirm');
    await user.click(screen.getByRole('button', { name: 'Uložit změny' }));
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(ask).not.toHaveBeenCalled();
    expect(repo.snapshot().trainings[0].lockedRounds).toEqual(locked);
  });

  it('nezahájený trénink upravit jde, bez upozornění', async () => {
    window.location.hash = '#/trainings/t1/settings';
    render(<App repo={memoryRepository({ players, trainings: [t] })} />);
    await screen.findByRole('heading', { name: 'Kdy, kde a disciplíny' });
    expect(screen.queryByRole('note')).toBeNull();
  });
});

it('Moje hry bez odkazu „celý rozpis“ (stačí Trénink ve spodní liště); Živě ho má', async () => {
  window.location.hash = '#/my-games';
  const players4 = Array.from({ length: 4 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
  const { memoryAuth } = await import('../../storage/auth');
  const auth = memoryAuth({ players: players4.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
  render(
    <App
      repo={memoryRepository({ players: players4, trainings: [{ ...t, date: new Date().toISOString().slice(0, 10), createdBy: 'id1', playTimes: { training: { startedAt: Date.now() } } }] })}
      auth={auth}
    />,
  );
  await screen.findByRole('heading', { name: 'Moje hry' });
  expect(screen.queryByRole('button', { name: 'celý rozpis ›' })).toBeNull();
  window.location.hash = '#/live';
  expect(await screen.findByRole('button', { name: 'celý rozpis ›' })).toBeInTheDocument();
});
