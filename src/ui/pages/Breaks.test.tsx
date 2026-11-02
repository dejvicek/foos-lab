import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { autoPlan, DEFAULT_SELECTION } from '../../domain/plan';
import type { Player, Training } from '../../domain/types';
import { openSettings, openTeams, saveSettings } from '../../test/wizard';

const players = (n: number): Player[] => Array.from({ length: n }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const custom = (n: number, tables: 2 | 3 | 4, over: Partial<Training> = {}): Training => ({
  id: 't1', date: '2026-11-05', startTime: '18:00', mode: 'team', tables, attendees: players(n).map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120,
  plan: autoPlan(DEFAULT_SELECTION, 120, n, tables), lockedRounds: [], ...over,
});
const setup = async (t: Training, n = 8) => {
  window.location.hash = '#/trenink/t1';
  const repo = memoryRepository({ players: players(n), trainings: [t] });
  render(<App repo={repo} />);
  await screen.findByRole('table', { name: 'Rozpis tréninku' });
  return { repo, user: userEvent.setup() };
};
const rowOf = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}$`) }).closest('tr')!;
const pauseRows = () => screen.getAllByRole('row').filter((r) => r.textContent?.includes('Pauza'));
const saved = (repo: ReturnType<typeof memoryRepository>) => repo.snapshot().trainings[0].breaks;

describe('pauzy v rozpisu (notebook, správce)', () => {
  it('délka pauzy jde změnit, časy dalších kol se posunou', async () => {
    const { repo, user } = await setup(custom(8, 4));
    const [p] = pauseRows();
    const sel = within(p).getByRole('combobox', { name: 'Délka pauzy' });
    expect(sel).toHaveValue('10');
    const next = p.nextElementSibling as HTMLElement;
    const before = within(next).getAllByRole('cell')[0].textContent;
    await user.selectOptions(sel, '20');
    await vi.waitFor(() => expect(saved(repo)?.[0].min).toBe(20));
    expect(within(pauseRows()[0].nextElementSibling as HTMLElement).getAllByRole('cell')[0].textContent).not.toBe(before);
  });

  it('přidat a odebrat pauzu', async () => {
    const { repo, user } = await setup(custom(8, 4, { breaks: [] }));
    expect(pauseRows()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '+ Přidat pauzu' }));
    expect(pauseRows()).toHaveLength(1);
    await user.click(within(pauseRows()[0]).getByRole('button', { name: 'Odebrat pauzu' }));
    expect(pauseRows()).toHaveLength(0);
    await vi.waitFor(() => expect(saved(repo)).toEqual([]));
  });

  it('přetažením se pauza přesune před cílové kolo', async () => {
    const { repo } = await setup(custom(8, 4, { breaks: [{ after: 5, min: 10 }] }));
    const handle = within(pauseRows()[0]).getByRole('button', { name: 'Přesunout pauzu' });
    fireEvent.dragStart(handle, { dataTransfer: { setData() {}, effectAllowed: '' } });
    fireEvent.dragOver(rowOf('3. kolo'), { clientY: 0 });
    expect(rowOf('3. kolo')).toHaveClass('drop-before');
    fireEvent.drop(rowOf('3. kolo'), { clientY: 0 });
    await vi.waitFor(() => expect(saved(repo)).toEqual([{ after: 2, min: 10 }]));
    expect(rowOf('3. kolo').previousElementSibling).toHaveTextContent('Pauza');
  });

  it('prázdné sloupce stolů se nezobrazují', async () => {
    await setup(custom(4, 4), 4);
    const head = screen.getByRole('table', { name: 'Rozpis tréninku' }).querySelector('thead')!;
    expect(head).toHaveTextContent('Stůl 1');
    expect(head).toHaveTextContent('Stůl 2');
    expect(head).not.toHaveTextContent('Stůl 3');
    expect(head).not.toHaveTextContent('Stůl 4');
  });
});

describe('pauzy na telefonu', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it('šipkami se pauza posune o kolo', async () => {
    window.location.hash = '#/trenink/t1';
    const repo = memoryRepository({ players: players(8), trainings: [custom(8, 4, { breaks: [{ after: 5, min: 10 }] })] });
    render(<App repo={repo} />);
    const cards = await screen.findByLabelText('Rozpis tréninku');
    await userEvent.setup().click(within(cards).getByRole('button', { name: 'Pauzu o kolo dřív' }));
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].breaks).toEqual([{ after: 4, min: 10 }]));
  });
});

describe('náhodné pořadí', () => {
  it('tlačítko v panelu Týmy pro simulaci zamíchá přítomné', async () => {
    const { repo, user } = await setup(custom(8, 4));
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    await openTeams(user);
    await user.click(screen.getByRole('button', { name: 'Náhodné pořadí' }));
    spy.mockRestore();
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].attendees).not.toEqual(players(8).map((p) => p.id)));
    expect([...repo.snapshot().trainings[0].attendees].sort()).toEqual(players(8).map((p) => p.id).sort());
  });
});

describe('pauzy v průvodci (krok Disciplíny)', () => {
  it('přidat, délka, šipky, přetažení a odebrání pauzy v náhledu plánu; uloží se se změnami', async () => {
    const { repo, user } = await setup(custom(8, 4, { breaks: [] }));
    await openSettings(user, 'Disciplíny');
    const plan = () => screen.getByRole('list', { name: 'Náhled plánu' });
    const pauses = () => within(plan()).queryAllByRole('listitem').filter((li) => li.textContent?.includes('Pauza'));
    expect(pauses()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '+ Přidat pauzu' }));
    expect(pauses()).toHaveLength(1);
    await user.selectOptions(within(pauses()[0]).getByRole('combobox', { name: 'Délka pauzy' }), '15');
    const before = within(plan()).getAllByRole('listitem').indexOf(pauses()[0]);
    await user.click(within(pauses()[0]).getByRole('button', { name: 'Pauzu o kolo dřív' }));
    expect(within(plan()).getAllByRole('listitem').indexOf(pauses()[0])).toBe(before - 1);
    // přetažení před 3. kolo
    const third = within(plan()).getAllByRole('listitem').find((li) => li.textContent?.includes('3. kolo'))!;
    fireEvent.dragStart(pauses()[0], { dataTransfer: { setData() {}, effectAllowed: '' } });
    fireEvent.dragOver(third, { clientY: 0 });
    fireEvent.drop(third, { clientY: 0 });
    const thirdNow = within(plan()).getAllByRole('listitem').find((li) => li.textContent?.includes('3. kolo'))!;
    expect(thirdNow.previousElementSibling).toHaveTextContent('Pauza');
    await saveSettings(user);
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].breaks).toEqual([{ after: 2, min: 15 }]));
    await openSettings(user, 'Disciplíny');
    await user.click(within(pauses()[0]).getByRole('button', { name: 'Odebrat pauzu' }));
    expect(pauses()).toHaveLength(0);
  });
});
