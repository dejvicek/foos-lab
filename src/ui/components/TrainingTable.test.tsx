import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Mode, Player, TableCount, Training } from '../../domain/types';

const players = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const training = (n: number, mode: Mode, tables: TableCount): Training => ({
  id: 't1', date: '2026-10-31', startTime: '18:00', mode, tables,
  attendees: players(n).map((p) => p.id), scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [],
});
const rowOf = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) }).closest('tr')!;

afterEach(() => vi.useRealTimers());

describe('tabulka tréninku', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 5, 12, 0)); // jiný den než trénink
    window.location.hash = '#/trenink/t1';
  });

  it('skutečné časy, rozbalení kola a zápis skóre', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] });
    render(<App repo={repo} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(within(rowOf('Kolo 1')).getByText('19:00')).toBeInTheDocument();
    expect(rowOf('Kolo 1')).toHaveTextContent('H1 + H2 vs H3 + H4');

    // jiný den → rozbalený je první blok s chybějícím zápisem (rozehrání)
    expect(screen.getByLabelText('Rozehrání s počítáním, stůl 1: H1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Kolo 1/ }));
    const cell = screen.getByRole('group', { name: 'Kolo 1, stůl 1' });
    await user.type(within(cell).getByLabelText('Kolo 1, stůl 1: góly vlevo'), '6');
    await user.type(within(cell).getByLabelText('Kolo 1, stůl 1: góly vpravo'), '2');
    expect(rowOf('Kolo 1')).toHaveTextContent('6:2');
    const first = within(screen.getByRole('table', { name: 'Souhrn tréninku' })).getAllByRole('row')[1];
    expect(first).toHaveTextContent('H1');
    expect(first).toHaveTextContent('+4');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].scores['league|1|1|id1+id2vid3+id4']).toEqual({ ga: 6, gb: 2 }));
  });

  it('zápis stanoviště: rotace 2, stůl 1 = H4 na pětce; nad max se nepřijme', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] });
    render(<App repo={repo} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(screen.getByRole('button', { name: /^Stanoviště, rotace 2/ }));
    const input = screen.getByLabelText('Stanoviště, rotace 2, stůl 1: H4');
    await user.type(input, '3');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].soloResults).toEqual({ id4: { fiveBarControl: 3 } }));
    await user.clear(input);
    await user.type(input, '11');
    expect(input).toHaveValue(1);
    expect(rowOf('Stanoviště, rotace 2')).toHaveTextContent('zapsáno 1 z 8');
  });

  it('změna začátku posune časy', async () => {
    render(<App repo={memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    fireEvent.change(screen.getByLabelText('Začátek'), { target: { value: '17:30' } });
    expect(within(rowOf('Kolo 1')).getByText('18:30')).toBeInTheDocument();
  });

  it('vymazání skóre nechá výsledky sólové části', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const t = { ...training(8, 'team', 4), scores: { 'league|1|1|id1+id2vid3+id4': { ga: 6, gb: 2 } }, soloResults: { id1: { warmupPasses: 15 } } };
    const repo = memoryRepository({ players: players(8), trainings: [t] });
    render(<App repo={repo} />);
    await user.click(await screen.findByRole('button', { name: 'Vymazat všechna skóre tohoto tréninku' }));
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].scores).toEqual({}));
    expect(repo.snapshot().trainings[0].soloResults).toEqual({ id1: { warmupPasses: 15 } });
    vi.restoreAllMocks();
  });

  it('po změně typu tréninku je zase rozbalený výchozí blok', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(screen.getByRole('button', { name: /^Kolo 2/ }));
    await user.selectOptions(screen.getByLabelText('Typ tréninku'), 'single');
    expect(screen.getByLabelText('Rozehrání: rozehrávka ze zadku, stůl 1: H1')).toBeInTheDocument();
  });

  it('Zeď: v kole 3 hraje zeď levá strana, v kole 4 pravá', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(screen.getByRole('button', { name: /^Kolo 3/ }));
    const c3 = screen.getByRole('group', { name: 'Kolo 3, stůl 1' });
    const sides3 = c3.querySelectorAll('.result-side');
    expect(sides3[0]).toHaveTextContent('Zeď');
    expect(sides3[1]).toHaveTextContent('Láme zeď');
    await user.click(screen.getByRole('button', { name: /^Kolo 4/ }));
    const sides4 = screen.getByRole('group', { name: 'Kolo 4, stůl 1' }).querySelectorAll('.result-side');
    expect(sides4[0]).toHaveTextContent('Láme zeď');
    expect(sides4[1]).toHaveTextContent('Zeď');
  });

  it('start 0:3: zapisuje se stav na stole, uloží se odehrané góly', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] });
    render(<App repo={repo} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(screen.getByRole('button', { name: /^Kolo 5/ }));
    const card = screen.getByRole('group', { name: 'Kolo 5, stůl 1' });
    expect(card).toHaveTextContent('začíná 0');
    expect(card).toHaveTextContent('začíná 3');
    const right = within(card).getByLabelText('Kolo 5, stůl 1: góly vpravo');
    await user.type(right, '2'); // méně než start 3 → nepřijme se
    expect(right).toHaveValue(null);
    await user.type(within(card).getByLabelText('Kolo 5, stůl 1: góly vlevo'), '6');
    await user.clear(right);
    await user.type(right, '4');
    expect(card).toHaveTextContent('Odehráno 6 : 1');
    const id = repo.snapshot().trainings[0].attendees;
    await vi.waitFor(() => {
      const sc = Object.entries(repo.snapshot().trainings[0].scores).find(([k]) => k.startsWith('league|5|1|'));
      expect(sc?.[1]).toEqual({ ga: 6, gb: 1 });
    });
    expect(id).toHaveLength(8);
  });

  it('ztráty jen u stolu s rozhodčím a mimo Daň', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players: players(9), trainings: [training(9, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(screen.getByRole('button', { name: /^Kolo 1/ }));
    const t1 = screen.getByRole('group', { name: 'Kolo 1, stůl 1' });
    const t2 = screen.getByRole('group', { name: 'Kolo 1, stůl 2' });
    expect(within(t1).getByLabelText('Kolo 1, stůl 1: ztráty vlevo')).toBeInTheDocument();
    expect(t1).toHaveTextContent('Rozhodčí: H9');
    expect(within(t2).queryByLabelText('Kolo 1, stůl 2: ztráty vlevo')).toBeNull();
    expect(t2).toHaveTextContent('Bez rozhodčího, ztráty se nezapisují');
    await user.click(screen.getByRole('button', { name: /^Kolo 2/ }));
    const d = screen.getByRole('group', { name: 'Kolo 2, stůl 1' });
    expect(within(d).queryByLabelText('Kolo 2, stůl 1: ztráty vlevo')).toBeNull();
    expect(d).toHaveTextContent('Ztráty jsou v gólech');
  });

  it('týmy simulace: výchozí podle výkonu, zamknou se prvním výsledkem simulace', async () => {
    const user = userEvent.setup();
    const t = { ...training(8, 'team', 4), simSplit: 'performance' as const };
    const repo = memoryRepository({ players: players(8), trainings: [t] });
    render(<App repo={repo} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.getByLabelText('Týmy pro simulaci')).toHaveValue('performance');
    expect(screen.getByText('Tým A: H1, H4, H5, H8. Tým B: H2, H3, H6, H7.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^1\. vlna/ }));
    const sim = screen.getByRole('group', { name: '1. vlna, stůl 1' });
    await user.type(within(sim).getByLabelText('1. vlna, stůl 1: góly vlevo'), '2');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].simTeams).toEqual({ A: ['id1', 'id4', 'id5', 'id8'], B: ['id2', 'id3', 'id6', 'id7'] }));

    // výsledek ve scénářové lize už týmy nepřehází
    await user.click(screen.getByRole('button', { name: /^Kolo 1/ }));
    await user.type(screen.getByLabelText('Kolo 1, stůl 2: góly vlevo'), '0');
    await user.type(screen.getByLabelText('Kolo 1, stůl 2: góly vpravo'), '6');
    expect(screen.getByText('Tým A: H1, H4, H5, H8. Tým B: H2, H3, H6, H7.')).toBeInTheDocument();
  });

  it('přepnutí na nominační pořadí', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players: players(8), trainings: [{ ...training(8, 'team', 4), simSplit: 'performance' as const }] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.selectOptions(screen.getByLabelText('Týmy pro simulaci'), 'order');
    expect(screen.getByText('Tým A: H1, H2, H3, H4. Tým B: H5, H6, H7, H8.')).toBeInTheDocument();
  });

  it('ruční týmy: převezmou se zobrazené a jde přesouvat hráče', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players: players(8), trainings: [{ ...training(8, 'team', 4), simSplit: 'performance' as const }] });
    render(<App repo={repo} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.selectOptions(screen.getByLabelText('Týmy pro simulaci'), 'manual');
    expect(screen.getByText('Tým A: H1, H4, H5, H8. Tým B: H2, H3, H6, H7.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Přesunout H1 do týmu B' }));
    expect(screen.getByText('Tým A: H4, H5, H8. Tým B: H2, H3, H6, H7, H1.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Posunout H1 v týmu nahoru' }));
    expect(screen.getByText('Tým A: H4, H5, H8. Tým B: H2, H3, H6, H1, H7.')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(repo.snapshot().trainings[0]).toMatchObject({ simSplit: 'manual', simTeams: { A: ['id4', 'id5', 'id8'] } }),
    );
  });

  it('nápověda je všude stejná a sbalená: jedna rozbalovací „Nápověda“ pod kartami', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.queryByText('Vysvětlivky: stanoviště, pravidla a scénáře')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Stanoviště, rotace 1/ }));
    let entry = screen.getByRole('group', { name: 'Stanoviště, rotace 1, stůl 1' }).closest<HTMLElement>('.block-entry')!;
    let help = entry.querySelector<HTMLDetailsElement>('details.help')!;
    expect(help.open).toBe(false);
    expect(help.querySelector('summary')).toHaveTextContent('Nápověda ke stanovištím');
    expect(entry.querySelector('.entry-card .help-item')).toBeNull();
    expect([...help.querySelectorAll('.help-item h4')].map((h) => h.textContent)).toEqual([
      'Stůl 1: Udržení míče na pětce',
      'Stůl 2: Střelba jen z nastavení',
      'Stůl 3: Obrana do držení',
      'Stůl 4: Rozehrávka ze zadních tyčí',
    ]);
    expect(help).toHaveTextContent('Teprve po třetím zastavení smí přihrát na trojku');

    await user.click(screen.getByRole('button', { name: /^Kolo 1/ }));
    entry = screen.getByRole('group', { name: 'Kolo 1, stůl 1' }).closest<HTMLElement>('.block-entry')!;
    help = entry.querySelector<HTMLDetailsElement>('details.help')!;
    expect(help.open).toBe(false);
    expect(help.querySelector('summary')).toHaveTextContent('Nápověda: Normální leg, každý gól se počítá, role rozhodčího');
    expect([...help.querySelectorAll('.help-item h4')].map((h) => h.textContent)).toEqual([
      'Normální leg',
      'Každý gól se počítá',
      'Role rozhodčího',
    ]);
    expect(entry.querySelectorAll('details')).toHaveLength(1);
  });

  it('jedničky n=5: v kole 1 počítá H5', async () => {
    render(<App repo={memoryRepository({ players: players(5), trainings: [training(5, 'single', 2)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(rowOf('Kolo 1')).toHaveTextContent('H5');
  });

  it('n=8, t=4: kolo 1 má volné stoly 3 a 4', async () => {
    render(<App repo={memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(within(rowOf('Kolo 1')).getAllByText('volný')).toHaveLength(2);
  });
});

describe('tabulka tréninku – dnes', () => {
  it('v 19:21 je zvýrazněné a rozbalené Kolo 3', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 31, 19, 21));
    window.location.hash = '#/trenink/t1';
    render(<App repo={memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(rowOf('Kolo 3')).toHaveClass('current');
    expect(rowOf('Kolo 2')).toHaveClass('past');
    const entry = screen.getByRole('group', { name: 'Kolo 3, stůl 1' }).closest<HTMLElement>('.block-entry')!;
    expect(within(entry).getByText(/Jeden tým má celý leg zakázáno riskovat/)).toBeInTheDocument();
  });
});
