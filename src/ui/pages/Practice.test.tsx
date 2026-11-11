import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryAuth } from '../../storage/auth';
import { memoryRepository } from '../../storage/memoryRepository';
import { newPractice } from '../../domain/practice';
import { setSolo } from '../../domain/training';
import type { Player, Training } from '../../domain/types';

const players: Player[] = Array.from({ length: 4 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const club: Training = {
  id: 'club', date: '2026-11-02', startTime: '18:00', mode: 'team', tables: 2, attendees: players.map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 60, plan: { warmupPasses: 1 }, lockedRounds: [], breaks: [],
};
/** Běžný hráč (ne organizátor, ne admin). */
const asPlayer = (id = 'id1') => memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: id, isAdmin: false, mustChangePassword: false } });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('vlastní trénink (PRD 5.11)', () => {
  it('hráč bez role organizátora začne sám: jen cvičení bez soupeře, série se uloží jako metrika@1', async () => {
    window.location.hash = '#/trainings';
    const repo = memoryRepository({ players, trainings: [club] });
    render(<App repo={repo} auth={asPlayer()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Začít vlastní trénink' }));
    const drills = screen.getByRole('list', { name: 'Cvičení' });
    expect(within(drills).queryByText('Přihrávky na pětce')).toBeNull(); // s bránícím soupeřem – sám ne
    await user.click(within(drills).getByText('Penalta z místa bez brankáře'));

    expect(window.location.hash).toMatch(/^#\/practice\/[^/]+$/);
    expect(screen.getByText('Varianta 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'gól: H1' }));
    await user.click(screen.getByRole('button', { name: 'gól: H1' }));
    await user.click(screen.getByRole('button', { name: 'vedle: H1' }));
    await vi.waitFor(() => {
      const p = repo.snapshot().trainings.find((t) => t.format === 'practice')!;
      expect(p).toMatchObject({ attendees: ['id1'], createdBy: 'id1', date: today() });
      expect(p.soloResults.id1).toEqual({ 'penaltySolo@1': 2 });
      expect(p.soloAttempts?.id1).toEqual({ 'penaltySolo@1': 3 });
      expect(p.playTimes?.training?.startedAt).toBeDefined();
    });

    await user.click(screen.getByRole('button', { name: 'Ukončit' }));
    const results = screen.getByRole('region', { name: 'Výsledky' });
    expect(results).toHaveTextContent('Penalta z místa bez brankáře – varianta 1');
    expect(results).toHaveTextContent('2 z 3 pokusů');
    await vi.waitFor(() => expect(repo.snapshot().trainings.find((t) => t.format === 'practice')?.playTimes?.training?.endedAt).toBeDefined());
  });

  it('ve dvou: nabídka i se soupeřem, zapisuje se za oba', async () => {
    window.location.hash = '#/practice/new';
    const repo = memoryRepository({ players, trainings: [] });
    render(<App repo={repo} auth={asPlayer()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ve dvou' }));
    const drills = screen.getByRole('list', { name: 'Cvičení' });
    expect(within(drills).getByText('Přihrávky na pětce').closest('button')).toBeDisabled(); // bez spoluhráče ne
    await user.selectOptions(screen.getByLabelText('Spoluhráč'), 'id3');
    await user.click(within(drills).getByText('Přihrávky na pětce'));
    await user.click(screen.getByRole('button', { name: 'povedená: H3' }));
    await user.click(screen.getByRole('button', { name: 'povedená: H1' }));
    await vi.waitFor(() => {
      const p = repo.snapshot().trainings[0];
      expect(p.attendees).toEqual(['id1', 'id3']);
      expect(p.soloResults).toEqual({ id1: { 'warmupPasses@1': 1 }, id3: { 'warmupPasses@1': 1 } });
    });
    expect(screen.getByText('s H3 · běží 0 min')).toBeInTheDocument();
  });

  it('vlastní trénink není v klubových trénincích; seznam Moje vlastní tréninky', async () => {
    window.location.hash = '#/trainings';
    const p = { ...setSolo(newPractice('p1', '2026-11-05', '17:00', 'id1'), 'id1', 'penaltySolo@1', 7), playTimes: { training: { startedAt: 1, endedAt: 1 + 35 * 60_000 } } };
    render(<App repo={memoryRepository({ players, trainings: [club, p] })} auth={asPlayer()} />);
    const mine = await screen.findByRole('list', { name: 'Vlastní tréninky' });
    expect(mine).toHaveTextContent('sám · 35 min · 1 série');
    const clubList = screen.getByRole('list', { name: 'Uložené tréninky' });
    expect(within(clubList).getAllByRole('listitem')).toHaveLength(1);
  });

  it('žebříček Vlastní: jen vlastní tréninky, sloupec Pokusy', async () => {
    window.location.hash = '#/ladder';
    const d = today();
    const ps = ['a', 'b', 'c'].map((id, i) => setSolo(newPractice(id, d, `1${i}:00`, 'id2'), 'id2', 'penaltySolo@1', 6 + i));
    const clubWithSolo = setSolo(club, 'id1', 'warmupPasses@1', 15);
    render(<App repo={memoryRepository({ players, trainings: [clubWithSolo, ...ps] })} auth={asPlayer()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Vlastní' }));
    const table = screen.getByRole('table', { name: 'Penalta z místa bez brankáře' });
    expect(within(table).getByRole('columnheader', { name: 'Pokusy' })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /H2/ })).toHaveTextContent('7,0 / 10');
    expect(screen.queryByRole('table', { name: 'Přihrávky na pětce' })).toBeNull(); // klubový trénink ne
  });
});
