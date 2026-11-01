import { exportJson } from './backup';

describe('exportJson', () => {
  it('pojmenuje soubor podle data a obsahuje hráče, tréninky i skóre', () => {
    const { filename, json } = exportJson(
      {
        players: [{ id: 'a', name: 'A', archived: false, order: 0 }],
        trainings: [{ id: 't', date: '2026-10-31', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [], mode: 'team', tables: 4, attendees: ['a'], scores: { m: { ga: 1, gb: 0 } } }],
      },
      '2026-10-31',
    );
    expect(filename).toBe('foosball-zaloha-2026-10-31.json');
    const parsed = JSON.parse(json);
    expect(parsed).toMatchObject({ version: 1, exportedAt: '2026-10-31' });
    expect(parsed.players).toHaveLength(1);
    expect(parsed.trainings[0].scores.m).toEqual({ ga: 1, gb: 0 });
  });
});
