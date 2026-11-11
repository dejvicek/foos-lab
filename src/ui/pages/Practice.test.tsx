import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryAuth } from '../../storage/auth';
import { memoryRepository } from '../../storage/memoryRepository';
import { newPractice } from '../../domain/practice';
import { setSolo } from '../../domain/training';
import { loadPracticeDrills } from '../../storage/prefs';
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
const practiceOf = (repo: ReturnType<typeof memoryRepository>) => repo.snapshot().trainings.find((t) => t.format === 'practice')!;

beforeEach(() => localStorage.clear());

describe('vlastní trénink (PRD 5.11)', () => {
  it('hráč bez role organizátora sestaví plán a projde kola: varianty po sobě, dál po všech pokusech', async () => {
    window.location.hash = '#/trainings';
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const repo = memoryRepository({ players, trainings: [club] });
    render(<App repo={repo} auth={asPlayer()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Začít vlastní trénink' }));

    // Sám: cvičení s bránícím se nenabízí; výchozí výběr = cvičení pro jednoho.
    const list = screen.getByRole('list', { name: 'Cvičení' });
    expect(within(list).queryByRole('checkbox', { name: /^Přihrávky na pětce/ })).toBeNull();
    expect(within(list).getByRole('checkbox', { name: /^Penalta z místa bez brankáře/ })).toBeChecked();
    await user.click(within(list).getByRole('checkbox', { name: /^Přihrávky ke zdi/ }));
    await user.click(within(list).getByRole('checkbox', { name: /^Střela z dvojky/ }));
    await user.click(screen.getByRole('button', { name: 'Posunout Penalta z místa bez brankáře nahoru' }));
    const order = screen.getByRole('list', { name: 'Pořadí cvičení' });
    expect(within(order).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Penalta z místa bez brankáře2× 4 min'),
      expect.stringContaining('Udržení míče na pětce8 min'),
    ]);
    expect(screen.getByRole('status', { name: 'Naplánováno' })).toHaveTextContent('0:18'); // 4 + 4 + 8 + 2× přechod

    await user.click(screen.getByRole('button', { name: 'Začít vlastní trénink' }));
    expect(window.location.hash).toMatch(/^#\/practice\/[^/]+$/);
    expect(loadPracticeDrills()).toEqual(['penaltySolo', 'fiveBarControl']); // zařízení si výběr pamatuje
    const round = screen.getByRole('region', { name: '1. kolo' });
    expect(round).toHaveTextContent('1. kolo z 3');
    expect(round).toHaveTextContent('Varianta 1');
    const next = within(round).getByRole('button', { name: 'Další kolo: Penalta z místa bez brankáře – varianta 2' });
    expect(next).toBeDisabled(); // pevný plán: až po čase nebo po všech pokusech
    for (let i = 0; i < 10; i++) await user.click(within(round).getByRole('button', { name: i < 7 ? 'gól: H1' : 'vedle: H1' }));
    expect(next).toBeEnabled();
    await user.click(next);

    const round2 = screen.getByRole('region', { name: '2. kolo' });
    expect(round2).toHaveTextContent('Varianta 2');
    expect(within(screen.getByRole('region', { name: 'Plán' })).getAllByRole('listitem')[0]).toHaveTextContent('7 / 10');
    await user.click(within(round2).getByRole('button', { name: 'gól: H1' }));
    await user.click(screen.getByRole('button', { name: 'Ukončit' }));

    const results = screen.getByRole('region', { name: 'Výsledky' });
    expect(results).toHaveTextContent('Penalta z místa bez brankáře – varianta 17 / 10');
    expect(results).toHaveTextContent('Penalta z místa bez brankáře – varianta 21 z 1 pokusu');
    await vi.waitFor(() => {
      const p = practiceOf(repo);
      expect(p).toMatchObject({ attendees: ['id1'], createdBy: 'id1', date: today(), disciplineOrder: ['penaltySolo', 'fiveBarControl'], plan: { penaltySolo: 2, fiveBarControl: 1 } });
      expect(p.soloResults.id1).toEqual({ 'penaltySolo@1': 7, 'penaltySolo@2': 1 });
      expect(p.playTimes?.['round|1']?.endedAt).toBeDefined();
      expect(p.playTimes?.['round|2']?.endedAt).toBeDefined();
      expect(p.playTimes?.['round|3']).toBeUndefined();
      expect(p.playTimes?.training?.endedAt).toBeDefined();
    });
  });

  it('ve dvou: nabídka i se soupeřem, bez spoluhráče nejde začít, zapisuje se za oba', async () => {
    window.location.hash = '#/practice/new';
    const repo = memoryRepository({ players, trainings: [] });
    render(<App repo={repo} auth={asPlayer()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ve dvou' }));
    const list = screen.getByRole('list', { name: 'Cvičení' });
    for (const cb of within(list).getAllByRole('checkbox')) if ((cb as HTMLInputElement).checked) await user.click(cb);
    await user.click(within(list).getByRole('checkbox', { name: /^Přihrávky na pětce/ }));
    expect(screen.getByRole('button', { name: 'Začít vlastní trénink' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Spoluhráč'), 'id3');
    await user.click(screen.getByRole('button', { name: 'Začít vlastní trénink' }));
    await user.click(screen.getByRole('button', { name: 'povedená: H3' }));
    await user.click(screen.getByRole('button', { name: 'povedená: H1' }));
    await vi.waitFor(() => {
      const p = practiceOf(repo);
      expect(p.attendees).toEqual(['id1', 'id3']);
      expect(p.soloResults).toEqual({ id1: { 'warmupPasses@1': 1 }, id3: { 'warmupPasses@1': 1 } });
    });
    expect(screen.getByText(/^s H3 · běží 0 min/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dokončit trénink' })).toBeDisabled();
  });

  it('vlastní trénink není v klubových trénincích; seznam Moje vlastní tréninky', async () => {
    window.location.hash = '#/trainings';
    const p = { ...setSolo(newPractice('p1', '2026-11-05', '17:00', 'id1', null, ['penaltySolo']), 'id1', 'penaltySolo@1', 7), playTimes: { training: { startedAt: 1, endedAt: 1 + 35 * 60_000 } } };
    render(<App repo={memoryRepository({ players, trainings: [club, p] })} auth={asPlayer()} />);
    const mine = await screen.findByRole('list', { name: 'Vlastní tréninky' });
    expect(mine).toHaveTextContent('sám · 35 min · 1 série');
    const clubList = screen.getByRole('list', { name: 'Uložené tréninky' });
    expect(within(clubList).getAllByRole('listitem')).toHaveLength(1);
  });

  it('žebříček Vlastní: jen vlastní tréninky, sloupec Pokusy', async () => {
    window.location.hash = '#/ladder';
    const d = today();
    const ps = ['a', 'b', 'c'].map((id, i) => setSolo(newPractice(id, d, `1${i}:00`, 'id2', null, ['penaltySolo']), 'id2', 'penaltySolo@1', 6 + i));
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
