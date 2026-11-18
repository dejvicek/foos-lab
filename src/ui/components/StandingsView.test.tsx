import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrainingSummary } from './StandingsView';
import { buildSchedule } from '../../domain/schedule';
import { matchState } from '../../domain/matchFormat';
import type { Score, Training } from '../../domain/types';
import { H } from '../../test/fixtures';

const custom = (plan: Training['plan']): Training => ({
  id: 'c', date: '2026-11-18', startTime: '18:00', mode: 'team', tables: 4, attendees: H(8), scores: {}, soloResults: {},
  simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan, lockedRounds: [],
});
const names = Object.fromEntries(H(8).map((p) => [p, p]));

describe('Souhrn tréninku nahoře (19. 11. 2026)', () => {
  it('bez nadpisu; přepínač Pořadí / Simulace, když trénink simulaci má; Simulace = stav týmů a výhry hráčů', async () => {
    const t = custom({ normal: 1, sim: 1 });
    const s = buildSchedule(t);
    const sim = s.matches.find((m) => m.block === 'sim')!;
    const normal = s.matches.find((m) => m.block !== 'sim')!;
    // Dohrát první zápas simulace pro tým A (po legech podle formátu).
    const scores: Record<string, Score> = { [normal.id]: { ga: 6, gb: 2 } };
    for (let n = 1; !matchState(sim, scores).over && n < 6; n++) scores[n === 1 ? sim.id : `${sim.id}#${n}`] = { ga: 6, gb: 1 };
    render(<TrainingSummary schedule={s} scores={scores} attendees={t.attendees} names={names} delays={[]} />);
    const box = screen.getByRole('region', { name: 'Souhrn' });
    expect(within(box).queryByRole('heading', { name: 'Souhrn' })).toBeNull();
    const seg = within(box).getByRole('group', { name: 'Souhrn' });
    expect(within(seg).getAllByRole('button').map((b) => b.textContent)).toEqual(['Pořadí', 'Simulace']);
    expect(within(box).getByRole('table', { name: 'Souhrn tréninku' })).not.toHaveTextContent('Simulace');
    await userEvent.setup().click(within(seg).getByRole('button', { name: 'Simulace' }));
    // ligový zápis: skóre týmů nahoře, řádek na zápas s Body a Hrami, vítěz tučně, Celkově
    expect(within(box).getByText('1 : 0')).toBeInTheDocument();
    const table = within(box).getByRole('table', { name: 'Simulace' });
    expect(within(table).getByText('1. vlna')).toBeInTheDocument();
    const first = within(table).getAllByRole('row')[2];
    expect(first.querySelector('.sim-no')).toHaveAttribute('title', 'Dvojice');
    expect(first).toHaveTextContent(`1${sim.sideA.join(', ')}A,B:1,2${sim.sideB.join(', ')}1:02:06:1 · 6:11:0`);
    expect(first.querySelector('.win.a')).toHaveTextContent(sim.sideA.join(', '));
    expect(within(table).getAllByRole('row').at(-1)).toHaveTextContent('Celkově1:02:0');
  });

  it('bez simulace a bez čekání: jen pořadí, bez přepínače', () => {
    const t = custom({ normal: 1 });
    const s = buildSchedule(t);
    render(<TrainingSummary schedule={s} scores={{ [s.matches[0].id]: { ga: 6, gb: 2 } }} attendees={t.attendees} names={names} delays={[]} />);
    expect(screen.queryByRole('group', { name: 'Souhrn' })).toBeNull();
    expect(screen.getByRole('table', { name: 'Souhrn tréninku' })).toBeInTheDocument();
  });
});
