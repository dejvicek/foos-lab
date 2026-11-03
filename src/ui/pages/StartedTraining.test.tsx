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
