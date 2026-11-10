import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { autoPlan } from '../../domain/plan';
import type { BreakDef, Player, Training } from '../../domain/types';
import { discView, openSettings, openTeams, saveSettings } from '../../test/wizard';
import { DEFAULT_SELECTION } from '../../test/fixtures';

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
const saved = (repo: ReturnType<typeof memoryRepository>) => repo.snapshot().trainings[0].breaks as BreakDef[] | null | undefined;

describe('pauzy v rozpisu (notebook, správce)', () => {
  it('délka pauzy jde změnit, časy dalších kol se posunou', async () => {
    const { repo, user } = await setup(custom(8, 4));
    const [p] = pauseRows();
    const sel = within(p).getByRole('combobox', { name: 'Délka pauzy' });
    expect(sel).toHaveValue('10');
    // první kolo za pauzou (pauza je po cvičeních, mezi nimi nadpis sekce)
    const roundAfter = (row: Element) => {
      let x = row.nextElementSibling;
      while (x && !x.querySelector('td.c-time')) x = x.nextElementSibling;
      return x as HTMLElement;
    };
    const before = within(roundAfter(p)).getAllByRole('cell')[0].textContent;
    await user.selectOptions(sel, '20');
    await vi.waitFor(() => expect(saved(repo)?.[0].min).toBe(20));
    expect(within(roundAfter(pauseRows()[0])).getAllByRole('cell')[0].textContent).not.toBe(before);
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
  it('ručně: tlačítko Náhodně rozhází hráče do týmů (stejné velikosti, nikdo se neztratí)', async () => {
    const { repo, user } = await setup(custom(8, 4));
    await openTeams(user);
    await user.click(screen.getByRole('radio', { name: 'Ručně' }));
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].simSplit).toBe('manual'));
    const before = repo.snapshot().trainings[0].simTeams!;
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    await user.click(screen.getByRole('button', { name: 'Náhodně' }));
    spy.mockRestore();
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].simTeams).not.toEqual(before));
    const after = repo.snapshot().trainings[0].simTeams!;
    expect(after.A).toHaveLength(before.A.length);
    expect([...after.A, ...after.B].sort()).toEqual([...before.A, ...before.B].sort());
    expect(repo.snapshot().trainings[0].attendees).toEqual(players(8).map((p) => p.id)); // pořadí přítomných se nemění
  });
});

describe('pauzy v průvodci (krok Disciplíny)', () => {
  it('přidat, délka, šipky, přetažení a odebrání pauzy v náhledu plánu; uloží se se změnami', async () => {
    const { repo, user } = await setup(custom(8, 4, { breaks: [] }));
    await openSettings(user, 'Kdy, kde a disciplíny');
    await discView(user, 'Kolo po kole');
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
    await openSettings(user, 'Kdy, kde a disciplíny');
    await discView(user, 'Kolo po kole');
    await user.click(within(pauses()[0]).getByRole('button', { name: 'Odebrat pauzu' }));
    expect(pauses()).toHaveLength(0);
  });
});

describe('pauzy a pořadí v tabulce disciplín (průvodce, 10. 11. 2026)', () => {
  const small = (over: Partial<Training> = {}) =>
    custom(8, 4, { plan: { warmupPasses: 2, normal: 3, start44: 2 }, disciplineOrder: ['warmupPasses', 'normal', 'start44'], breaks: [], ...over });
  const tableRows = () => screen.getAllByRole('listitem').filter((li) => li.classList.contains('tt-row'));

  it('pauza za disciplínu, šipky ji posunou o disciplínu; po změně kol zůstane za svou disciplínou', async () => {
    const { repo, user } = await setup(small());
    await openSettings(user, 'Kdy, kde a disciplíny');
    await user.click(screen.getByRole('button', { name: 'Přidat pauzu po: Přihrávky na pětce' }));
    const pause = () => screen.getByRole('listitem', { name: /^Pauza po:/ });
    expect(pause()).toHaveAccessibleName('Pauza po: Přihrávky na pětce');
    expect(within(pause()).getByRole('button', { name: 'Pauzu o disciplínu dřív' })).toBeDisabled();
    await user.click(within(pause()).getByRole('button', { name: 'Pauzu o disciplínu později' }));
    expect(pause()).toHaveAccessibleName('Pauza po: Normální leg');
    // v tabulce je pauza hned pod svou disciplínou
    const rows = tableRows();
    expect(rows[rows.indexOf(pause()) - 1]).toHaveTextContent('Normální leg');
    await user.selectOptions(within(pause()).getByRole('combobox', { name: 'Délka pauzy' }), '15');
    // + kolo Normální leg: pauza se posune s koncem disciplíny
    await user.click(screen.getByRole('button', { name: 'Přidat kolo: Normální leg' }));
    expect(pause()).toHaveAccessibleName('Pauza po: Normální leg');
    await saveSettings(user);
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].plan.normal).toBe(4));
    const t = repo.snapshot().trainings[0];
    expect(t.breaks).toEqual({ afterDisciplines: [{ after: 'normal', min: 15 }] });
  });

  it('pořadí disciplín šipkou; pauza jde s disciplínou', async () => {
    // pauza po Normálním legu (po 5. kole), za zápasy je ještě simulace
    const t = small({ plan: { warmupPasses: 2, normal: 3, start44: 2, sim: 1 }, disciplineOrder: ['warmupPasses', 'normal', 'start44', 'sim'], breaks: [{ after: 5, min: 10 }] });
    const { repo, user } = await setup(t);
    await openSettings(user, 'Kdy, kde a disciplíny');
    await user.click(screen.getByRole('button', { name: 'Dřív: Start 4:4' }));
    const order = within(screen.getByRole('list', { name: 'Pořadí: Zápasy a scénáře' }))
      .getAllByRole('checkbox')
      .map((c) => c.closest('label')!.textContent);
    expect(order).toEqual(['Start 4:4', 'Normální leg']);
    const pause = screen.getByRole('listitem', { name: /^Pauza po:/ });
    expect(pause).toHaveAccessibleName('Pauza po: Normální leg');
    const rows = tableRows();
    expect(rows[rows.indexOf(pause) - 1]).toHaveTextContent('Normální leg');
    await saveSettings(user);
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].disciplineOrder).toEqual(['warmupPasses', 'start44', 'normal', 'sim']));
    expect(repo.snapshot().trainings[0].breaks).toEqual({ afterDisciplines: [{ after: 'normal', min: 10 }] });
  });
});
