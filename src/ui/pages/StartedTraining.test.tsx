import { render, screen } from '@testing-library/react';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player, Training } from '../../domain/types';

const players: Player[] = Array.from({ length: 4 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const t: Training = {
  id: 't1', date: '2026-11-03', startTime: '18:00', mode: 'team', tables: 1, attendees: players.map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'performance', simTeams: null, format: 'custom', durationMin: 60,
  plan: { normal: 3 }, lockedRounds: [], breaks: [],
};

describe('zahájený trénink nejde upravovat', () => {
  it('po zahájení není „Upravit nastavení“; místo toho poznámka', async () => {
    window.location.hash = '#/trenink/t1';
    render(<App repo={memoryRepository({ players, trainings: [{ ...t, playTimes: { training: { startedAt: 1 } } }] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.queryByRole('button', { name: 'Upravit nastavení' })).toBeNull();
    expect(screen.getByText('Trénink běží – nastavení už nejde měnit.')).toBeInTheDocument();
  });

  it('ani přímým odkazem na nastavení', async () => {
    window.location.hash = '#/trenink/t1/nastaveni';
    render(<App repo={memoryRepository({ players, trainings: [{ ...t, playTimes: { training: { startedAt: 1 } } }] })} />);
    expect(await screen.findByText('Trénink běží – nastavení už nejde měnit.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Uložit změny' })).toBeNull();
  });

  it('nezahájený trénink upravit jde', async () => {
    window.location.hash = '#/trenink/t1';
    render(<App repo={memoryRepository({ players, trainings: [t] })} />);
    expect(await screen.findByRole('button', { name: 'Upravit nastavení' })).toBeInTheDocument();
  });
});

it('Moje hry bez odkazu „celý rozpis“ (stačí Trénink ve spodní liště); Živě ho má', async () => {
  window.location.hash = '#/moje-hry';
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
  window.location.hash = '#/zive';
  expect(await screen.findByRole('button', { name: 'celý rozpis ›' })).toBeInTheDocument();
});

it('ukončený trénink bez časů jednotlivých utkání: u zápasu „dohráno“, žádné Potvrdit ani „není na řadě“', async () => {
  const user = (await import('@testing-library/user-event')).default.setup();
  window.location.hash = '#/trenink/t1';
  render(<App repo={memoryRepository({ players, trainings: [{ ...t, playTimes: { training: { startedAt: 1, endedAt: 2 } } }] })} />);
  await screen.findByRole('table', { name: 'Rozpis tréninku' });
  const r1 = screen.getByRole('button', { name: /^1\. kolo$/ });
  if (r1.getAttribute('aria-expanded') !== 'true') await user.click(r1);
  const card = screen.getAllByRole('group').find((g) => g.getAttribute('aria-label')?.startsWith('1. kolo, stůl 1'))!;
  expect(card).toHaveTextContent('dohráno');
  expect(card).not.toHaveTextContent('není na řadě');
  expect(screen.queryByRole('button', { name: 'Potvrdit' })).toBeNull();
});
