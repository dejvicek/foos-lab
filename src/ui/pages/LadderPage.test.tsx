import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player } from '../../domain/types';
import { scoreFor, training } from '../../test/fixtures';

const ids = ['X', 'Y', 'P2', 'P3', 'P4', 'Q2', 'Q3', 'Q4', 'R2', 'R3', 'R4'];
const players: Player[] = ids.map((id, order) => ({
  id,
  name: id === 'X' ? 'Xaver' : id === 'Y' ? 'Yvona' : id,
  order,
  archived: false,
}));
const t1 = scoreFor(training('t1', '2026-10-20', 'team', ['X', 'P2', 'P3', 'P4']), 'X', [
  [6, 1], [6, 3], [6, 4], [6, 5], [3, 6], [5, 6], [5, 6],
]);
const t2 = scoreFor(training('t2', '2026-10-25', 'single', ['X', 'Q2', 'Q3', 'Q4'], 2), 'X', [
  [6, 4], [6, 5], [5, 6],
]);
const t2b = scoreFor(training('t2b', '2026-10-27', 'single', ['X', 'Q2', 'Q3', 'Q4'], 2), 'X', [
  [5, 6], [4, 6],
]);
const t3 = scoreFor(training('t3', '2026-10-28', 'team', ['Y', 'R2', 'R3', 'R4']), 'Y', [
  [6, 0], [6, 1], [6, 4], [4, 6], [5, 6], [5, 6], [6, 5],
]);
const repo = () => memoryRepository({ players, trainings: [t1, t2, t2b, t3] });
const rowOf = (table: HTMLElement, name: string) =>
  within(table).getAllByRole('row').findIndex((r) => r.textContent?.includes(name));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T12:00:00'));
  window.location.hash = '#/zebricek';
});
afterEach(() => vi.useRealTimers());

describe('stránka Žebříček', () => {
  it('Forma + Průměr: X s +0,4 a 50 %, Y pod čárou (bez pořadí, tečky 1 ze 3) v Průměru i Celkem', async () => {
    const user = userEvent.setup();
    render(<App repo={repo()} />);
    const table = await screen.findByRole('table', { name: 'Žebříček' });
    expect(screen.getByText('4. 10. – 31. 10. 2026')).toBeInTheDocument();
    const xRow = within(table).getAllByRole('row')[rowOf(table, 'Xaver')];
    expect(xRow).toHaveTextContent('+0,4');
    expect(xRow).toHaveTextContent('50 %');
    // jedna tabulka: X s medailí, Y pod čárou s tečkami postupu; pravidlo je jednou pod obdobím
    expect(screen.getAllByText(/Pro umístění je potřeba zúčastnit se aspoň 3 tréninků/)).toHaveLength(1);
    expect(rowOf(table, 'Xaver')).toBeLessThan(rowOf(table, 'Yvona'));
    const yRow = within(table).getAllByRole('row')[rowOf(table, 'Yvona')];
    expect(yRow).not.toHaveTextContent('chybí');
    expect(within(yRow).getByTitle('1 ze 3 tréninků')).toBeInTheDocument();
    expect(within(yRow).queryByTitle(/místo/)).not.toBeInTheDocument();
    expect(within(xRow).getByTitle('1. místo')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Celkem' }));
    const total = screen.getByRole('table', { name: 'Žebříček' });
    expect(within(within(total).getAllByRole('row')[rowOf(total, 'Yvona')]).getByTitle('1 ze 3 tréninků')).toBeInTheDocument();
  });

  it('volby se pamatují po novém otevření', async () => {
    const user = userEvent.setup();
    const r = repo();
    const { unmount } = render(<App repo={r} />);
    await screen.findByRole('table', { name: 'Žebříček' });
    await user.click(screen.getByRole('button', { name: 'Celkově' }));
    await user.click(screen.getByRole('button', { name: 'Celkem' }));
    unmount();
    render(<App repo={r} />);
    await screen.findByRole('table', { name: 'Žebříček' });
    expect(screen.getByRole('button', { name: 'Celkově' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Celkem' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('vlastní období od–do', async () => {
    const user = userEvent.setup();
    render(<App repo={repo()} />);
    await screen.findByRole('table', { name: 'Žebříček' });
    await user.click(screen.getByRole('button', { name: 'Od–do' }));
    fireEvent.change(screen.getByLabelText('Od'), { target: { value: '2026-10-21' } });
    // t1 (20. 10.) vypadne → X má jen 2 tréninky → pod čárou, tečky 2 ze 3
    const table = screen.getByRole('table', { name: 'Žebříček' });
    expect(within(within(table).getAllByRole('row')[rowOf(table, 'Xaver')]).getByTitle('2 ze 3 tréninků')).toBeInTheDocument();
  });

  it('detail hráče: tréninky nejnovější první, odkaz na trénink', async () => {
    const user = userEvent.setup();
    render(<App repo={repo()} />);
    await screen.findByRole('table', { name: 'Žebříček' });
    await user.click(screen.getByRole('button', { name: 'Xaver' }));
    expect(await screen.findByRole('heading', { name: 'Xaver' })).toBeInTheDocument();
    const rows = within(screen.getByRole('table', { name: 'Tréninky hráče' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('27. 10. 2026');
    expect(rows[2]).toHaveTextContent('+6');
    await user.click(rows[0]);
    expect(window.location.hash).toBe('#/trenink/t2b');
  });

  it('prázdné období', async () => {
    window.location.hash = '#/zebricek';
    render(<App repo={memoryRepository()} />);
    expect(await screen.findByText('V tomhle období zatím nejsou žádné zapsané legy.')).toBeInTheDocument();
  });
});

describe('žebříček stanovišť', () => {
  const H8 = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8'];
  const ps: Player[] = H8.map((id, order) => ({ id, name: `Hráč ${id}`, order, archived: false }));
  const withSolo = (id: string, date: string, a: number, b: number) => ({
    ...training(id, date, 'team', H8, 4),
    soloResults: { H1: { fiveBarControl: a }, H2: { fiveBarControl: b } },
  });
  const repo2 = () => memoryRepository({ players: ps, trainings: [withSolo('s1', '2026-10-20', 2, 5), withSolo('s2', '2026-10-25', 4, 5)] });

  it('kritérium 16: Průměr „3,0 / 10“, Celkem „6 / 20“, méně ztrát je výš; volba se pamatuje', async () => {
    const user = userEvent.setup();
    const r = repo2();
    const { unmount } = render(<App repo={r} />);
    await screen.findByRole('button', { name: 'Stanoviště' });
    await user.click(screen.getByRole('button', { name: 'Stanoviště' }));
    // 2 tréninky: oba pod čárou (pořadí od 3 tréninků), hodnota a pořadí se ukazují
    const table = screen.getByRole('table', { name: 'Udržení míče na pětce' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Hráč H1');
    expect(rows[0]).toHaveTextContent('3,0 / 10');
    expect(within(rows[0]).getByTitle('2 ze 3 tréninků')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Celkem' }));
    expect(within(screen.getByRole('table', { name: 'Udržení míče na pětce' })).getAllByRole('row')[1]).toHaveTextContent('6 / 20');
    unmount();
    render(<App repo={r} />);
    expect(await screen.findByRole('table', { name: 'Udržení míče na pětce' })).toBeInTheDocument();
  });

  it('prázdné období', async () => {
    const user = userEvent.setup();
    render(<App repo={repo()} />);
    await screen.findByRole('button', { name: 'Stanoviště' });
    await user.click(screen.getByRole('button', { name: 'Stanoviště' }));
    expect(screen.getByText('V tomhle období zatím nejsou žádné výsledky ze sólové části.')).toBeInTheDocument();
  });
});
