import { APP_VERSION } from '../../storage/appVersion';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { memoryAuth } from '../../storage/auth';
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
  window.location.hash = '#/ladder';
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

  it('barva rozdílu: zelená jen výrazný náskok (+1,5 / leg, v Celkem už ne – barva ze součtu, 20. 11. 2026), zlatá plus, červená minus', async () => {
    const user = userEvent.setup();
    render(<App repo={repo()} />);
    const table = await screen.findByRole('table', { name: 'Žebříček' });
    const diffCell = (t: HTMLElement, name: string) => {
      const col = within(t).getAllByRole('columnheader').findIndex((h) => /^G±/.test(h.textContent ?? ''));
      return within(within(t).getAllByRole('row')[rowOf(t, name)]).getAllByRole('cell')[col];
    };
    // Průměr: X +0,4 a Y +1,4 / leg → zlatá; kdo je v minusu → červená
    expect(diffCell(table, 'Xaver')).toHaveClass('pos');
    expect(diffCell(table, 'Yvona')).toHaveClass('pos');
    expect(table.querySelector('td.neg')).toHaveTextContent(/^−/);
    expect(table.querySelector('td.great')).toBeNull();
    // Celkem: barva ze stejného čísla, podle kterého se řadí (součet) – jen plus zlatě, minus červeně, zelená ne
    await user.click(screen.getByRole('button', { name: 'Celkem' }));
    const total = screen.getByRole('table', { name: 'Žebříček' });
    expect(diffCell(total, 'Yvona')).toHaveClass('pos');
    expect(total.querySelector('td.great')).toBeNull();
    expect(diffCell(total, 'Xaver')).toHaveClass('pos');
    // Celkem: místo Legů a Výher vyhrané / prohrané legy L+ · L− (na notebooku zvlášť, 20. 11. 2026); Průměr má dál Legy a Výhry %
    const heads = (t: HTMLElement) => within(t).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[↕▲▼]/g, '').trim());
    // Tréninky jen v hlavní tabulce; rozhodující sloupec G± poslední (20. 11. 2026)
    expect(heads(total)).toEqual(['#', 'Hráč', 'Tréninky', 'L+', 'L−', 'G+', 'G−', 'Ztráty\u00a0⌀', 'Sim.', 'G±']);
    await user.click(screen.getByRole('button', { name: 'Průměr' }));
    expect(heads(screen.getByRole('table', { name: 'Žebříček' }))).toEqual(['#', 'Hráč', 'Tréninky', 'Legy', 'Výhry %', 'G+\u00a0⌀', 'G−\u00a0⌀', 'Ztráty\u00a0⌀', 'Sim. %', 'G±\u00a0⌀']); // Průměr: „/leg“ v záhlaví (20. 11. 2026)
  });

  it('stará česká adresa: Stránka nenalezena, tlačítko vede na úvod', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/zebricek';
    render(<App repo={repo()} />);
    expect(await screen.findByRole('heading', { name: 'Stránka nenalezena' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Žebříček' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Na úvodní stránku' }));
    expect(window.location.hash).toBe('#/trainings');
    expect(await screen.findByRole('heading', { name: 'Tréninky' })).toBeInTheDocument();
  });

  it('logo s nápisem Foos Lab vede na úvodní stránku', async () => {
    const user = userEvent.setup();
    render(<App repo={repo()} />);
    await screen.findByRole('table', { name: 'Žebříček' });
    const logo = within(screen.getByRole('navigation', { name: 'Hlavní navigace' })).getByRole('link', { name: 'Foos Lab – úvodní stránka' });
    expect(logo).toHaveAttribute('href', '#/trainings');
    expect(logo).toHaveTextContent(`Foos Lab${APP_VERSION}`); // verze vedle názvu
    // na telefonu je logo nahoře zvlášť a vede taky na úvod (19. 11. 2026)
    const mobile = document.querySelector('a.nav-brand-mobile');
    expect(mobile).toHaveAttribute('href', '#/trainings');
    await user.click(logo);
    expect(window.location.hash).toBe('#/trainings');
    expect(await screen.findByRole('heading', { name: 'Tréninky' })).toBeInTheDocument();
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
    const ladder = await screen.findByRole('table', { name: 'Žebříček' });
    // Xaver je i v tabulce Zápasy 1 na 1 (singly klasického tréninku, 19. 11. 2026) – klik v hlavním žebříčku
    await user.click(within(ladder).getByRole('button', { name: 'Xaver' }));
    expect(await screen.findByRole('heading', { name: 'Xaver' })).toBeInTheDocument();
    const own = screen.getByRole('table', { name: 'Tréninky hráče' });
    // Rozdíl, pak L+ / L− jako v souhrnu tréninku (19. 11. 2026)
    expect(within(own).getAllByRole('columnheader').map((h) => h.textContent).slice(2, 5)).toEqual(['G±', 'L+', 'L−']);
    const rows = within(own).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('27. 10. 2026');
    expect(rows[2]).toHaveTextContent('+6');
    await user.click(rows[0]);
    expect(window.location.hash).toBe('#/trainings/t2b');
  });

  it('prázdné období', async () => {
    window.location.hash = '#/ladder';
    render(<App repo={memoryRepository()} />);
    expect(await screen.findByText('V tomhle období zatím nejsou žádné zapsané legy.')).toBeInTheDocument();
  });
});

describe('řazení podle sloupce (18. 11. 2026)', () => {
  it('klik na záhlaví seřadí, další otočí směr, # vrátí oficiální pořadí; nad čarou a pod čarou zvlášť, medaile zůstávají', async () => {
    const user = userEvent.setup();
    render(<App repo={repo()} />);
    const table = await screen.findByRole('table', { name: 'Žebříček' });
    const names = () => within(table).getAllByRole('row').slice(1).map((r) => r.querySelector('.player-link')?.textContent ?? '—');
    const official = names();
    expect(official[0]).toBe('Xaver');
    // oficiální pořadí: zvýrazněný je sloupec G±, podle kterého se řadí (20. 11. 2026)
    const g = within(table).getAllByRole('columnheader').find((h) => /^G±/.test(h.textContent ?? ''))!;
    expect(g).toHaveClass('sorted');
    expect(g).toHaveAttribute('aria-sort', 'descending');
    await user.click(within(table).getByRole('button', { name: 'Legy' }));
    expect(within(table).getByRole('columnheader', { name: 'Legy' })).toHaveAttribute('aria-sort', 'descending');
    // zvýrazněný sloupec: záhlaví i všechny buňky Legy, nic jiného
    expect(within(table).getByRole('columnheader', { name: 'Legy' })).toHaveClass('sorted');
    const dataRows = within(table).getAllByRole('row').slice(1).filter((r) => r.querySelector('.player-link')) as HTMLTableRowElement[];
    expect(dataRows.every((r) => r.cells[3].classList.contains('sorted'))).toBe(true);
    expect(table.querySelectorAll('.sorted')).toHaveLength(dataRows.length + 1);
    const legs = () => within(table).getAllByRole('row').slice(1).filter((r) => r.querySelector('.player-link')).map((r) => Number((r as HTMLTableRowElement).cells[3].textContent));
    // X je jediný nad čarou → zůstává nahoře s medailí; pod čarou od nejvíc legů
    expect(names()[0]).toBe('Xaver');
    expect(within(within(table).getAllByRole('row')[1]).getByTitle('1. místo')).toBeInTheDocument();
    const low = legs().slice(1);
    expect(low).toEqual([...low].sort((a, b) => b - a));
    await user.click(within(table).getByRole('button', { name: 'Legy' }));
    expect(within(table).getByRole('columnheader', { name: 'Legy' })).toHaveAttribute('aria-sort', 'ascending');
    const lowAsc = legs().slice(1);
    expect(lowAsc).toEqual([...lowAsc].sort((a, b) => a - b));
    await user.click(within(table).getByRole('button', { name: 'Oficiální pořadí' }));
    expect(names()).toEqual(official);
    expect(table.querySelectorAll('.sorted')).toHaveLength(dataRows.length + 1);
    expect(g).toHaveClass('sorted');
    expect(within(table).getByRole('columnheader', { name: 'Legy' })).not.toHaveAttribute('aria-sort');
  });

  it('Hráč řadí podle jména od A', async () => {
    const user = userEvent.setup();
    render(<App repo={repo()} />);
    const table = await screen.findByRole('table', { name: 'Žebříček' });
    await user.click(within(table).getByRole('button', { name: 'Hráč' }));
    const low = within(table).getAllByRole('row').slice(1).filter((r) => r.classList.contains('low-data')).map((r) => r.querySelector('.player-link')!.textContent!);
    expect(low).toEqual([...low].sort((a, b) => a.localeCompare(b, 'cs')));
  });
});

describe('žebříček stanovišť', () => {
  const H8 = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8'];
  const ps: Player[] = H8.map((id, order) => ({ id, name: `Hráč ${id}`, order, archived: false }));
  const withSolo = (id: string, date: string, a: number, b: number) => ({
    ...training(id, date, 'team', H8, 4),
    soloResults: { H1: { fiveBarControl: a }, H2: { fiveBarControl: b } },
    // starší výsledky z 10 sérií (po migraci 27 nesou počet pokusů), od 12. 11. 2026 góly (migrace 29)
    soloAttempts: { H1: { fiveBarControl: 10 }, H2: { fiveBarControl: 10 } },
  });
  const repo2 = () => memoryRepository({ players: ps, trainings: [withSolo('s1', '2026-10-20', 8, 5), withSolo('s2', '2026-10-25', 6, 5)] });

  it('kritérium 16: Průměr na plnou sérii (7 z 10 = „14,0 / 20“), Celkem „14 / 20“, víc gólů je výš (od 12. 11. 2026); volba se pamatuje', async () => {
    const user = userEvent.setup();
    const r = repo2();
    const { unmount } = render(<App repo={r} />);
    await screen.findByRole('button', { name: 'Cvičení' });
    await user.click(screen.getByRole('button', { name: 'Cvičení' }));
    // 2 tréninky: oba pod čárou (pořadí od 3 tréninků), hodnota a pořadí se ukazují
    const table = screen.getByRole('table', { name: 'Udržení míče na pětce' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Hráč H1');
    expect(rows[0]).toHaveTextContent('14,0 / 20');
    expect(within(rows[0]).getByTitle('2 ze 3 tréninků')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Celkem' }));
    expect(within(screen.getByRole('table', { name: 'Udržení míče na pětce' })).getAllByRole('row')[1]).toHaveTextContent('14 / 20');
    unmount();
    render(<App repo={r} />);
    expect(await screen.findByRole('table', { name: 'Udržení míče na pětce' })).toBeInTheDocument();
  });

  it('prázdné období', async () => {
    const user = userEvent.setup();
    render(<App repo={repo()} />);
    await screen.findByRole('button', { name: 'Cvičení' });
    await user.click(screen.getByRole('button', { name: 'Cvičení' }));
    expect(screen.getByText('V tomhle období zatím nejsou žádné výsledky týmových cvičení.')).toBeInTheDocument();
  });

  it('části Zápasy · Cvičení · Zdržovači; Cvičení má Týmové / Solo/Duo a pamatuje si poslední (18. 11. 2026)', async () => {
    const user = userEvent.setup();
    render(<App repo={repo()} />);
    const parts = await screen.findByRole('group', { name: 'Část' });
    expect(within(parts).getAllByRole('button').map((b) => b.textContent)).toEqual(['Zápasy', 'Cvičení', 'Zdržovači']);
    expect(screen.queryByRole('group', { name: 'Cvičení' })).toBeNull();
    await user.click(within(parts).getByRole('button', { name: 'Cvičení' }));
    const sub = screen.getByRole('group', { name: 'Cvičení' });
    expect(within(sub).getByRole('button', { name: 'Týmové' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(sub).getByRole('button', { name: 'Solo/Duo' }));
    expect(screen.getByText('V tomhle období zatím nejsou žádné výsledky solo cvičení ani Čisté desítky.')).toBeInTheDocument();
    await user.click(within(parts).getByRole('button', { name: 'Zdržovači' }));
    expect(screen.queryByRole('group', { name: 'Cvičení' })).toBeNull();
    await user.click(within(parts).getByRole('button', { name: 'Cvičení' }));
    expect(within(screen.getByRole('group', { name: 'Cvičení' })).getByRole('button', { name: 'Solo/Duo' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('posun v pořadí a moje jméno (20. 11. 2026)', () => {
  it('po posledním tréninku: nově nad čarou „nový“, kdo klesl ▼; přihlášený hráč má jméno zlatě', async () => {
    // Q2–Q4 mají po tréninku 30. 10. třetí trénink → poprvé nad čarou; Q2 vysoko vyhrává
    const t4 = scoreFor(training('t4', '2026-10-30', 'single', ['Q2', 'Q3', 'Q4', 'P2'], 2), 'Q2', [[6, 0], [6, 0]]);
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'X', isAdmin: false, mustChangePassword: false } });
    render(<App repo={memoryRepository({ players, trainings: [t1, t2, t2b, t3, t4] })} auth={auth} />);
    const table = await screen.findByRole('table', { name: 'Žebříček' });
    expect(screen.getByText(/Šipky ▲▼ ukazují posun v pořadí po posledním tréninku \(30\. 10\.\)/)).toBeInTheDocument();
    const row = (name: string) => within(table).getAllByRole('row')[rowOf(table, name)];
    expect(within(row('Q2')).getByText('nový')).toBeInTheDocument();
    // X byl jediný v pořadí; Q2 a další nově před ním → X o 2 místa níž
    expect(rowOf(table, 'Xaver')).toBe(3);
    expect(within(row('Xaver')).getByTitle('O 2 místa níž po tréninku 30. 10.')).toHaveTextContent('▼2');
    expect(row('Xaver')).not.toHaveTextContent('nový');
    // moje jméno zlatě, ostatní ne
    expect(within(row('Xaver')).getByRole('button', { name: 'Xaver' })).toHaveClass('me-name');
    expect(table.querySelectorAll('.me-name')).toHaveLength(1);
  });
});
