import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { memoryRepository } from '../storage/memoryRepository';
import { memoryAuth } from '../storage/auth';
import { memoryOutbox } from '../storage/outbox';
import type { Training } from '../domain/types';

const t: Training = { id: 't1', date: '2026-11-10', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: {}, lockedRounds: [], mode: 'team', tables: 2, attendees: [], scores: {} };

describe('App – fronta zápisů v zařízení', () => {
  it('zápis, který minule nestihl odejít, se po spuštění odešle – z fronty přihlášeného hráče', async () => {
    window.location.hash = '#/trenink';
    const repo = memoryRepository({ players: [{ id: 'p1', name: 'Petr', archived: false, order: 0 }], trainings: [t] });
    const mine = memoryOutbox([{ at: Date.now(), op: { kind: 'tapScore', trainingId: 't1', matchId: 'm1', taps: [{ id: 'e1', at: Date.now(), field: 'ga', delta: 1, max: 6 }] } }]);
    const asked: string[] = [];
    render(
      <App
        repo={repo}
        auth={memoryAuth({ signedIn: { playerId: 'p1', isAdmin: false, mustChangePassword: false } })}
        outboxFor={(playerId) => {
          asked.push(playerId);
          return mine;
        }}
      />,
    );
    await screen.findByRole('heading', { name: 'Trénink' });
    await waitFor(() => expect(repo.snapshot().trainings[0].scores).toEqual({ m1: { ga: 1, gb: 0 } }));
    expect(new Set(asked)).toEqual(new Set(['p1']));
    expect(mine.load()).toEqual([]);
  });
});
