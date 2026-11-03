import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Mode, Player, TableCount, Training } from '../../domain/types';
import { openSettings, openTeams, saveSettings } from '../../test/wizard';
import { buildSchedule } from '../../domain/schedule';
import { queueOf, TRAINING_ITEM } from '../../domain/queue';

const players = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const training = (n: number, mode: Mode, tables: TableCount): Training => ({
  id: 't1', date: '2026-10-31', startTime: '18:00', mode, tables,
  attendees: players(n).map((p) => p.id), scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [],
});
const rowOf = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}$`) }).closest('tr')!;

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
    expect(within(rowOf('1. kolo')).getByText('19:00')).toBeInTheDocument();
    expect(rowOf('1. kolo')).toHaveTextContent('H1 + H2 vs H3 + H4');

    // jiný den → rozbalený je první blok s chybějícím zápisem (rozehrání)
    expect(screen.getByLabelText('Rozehrání s počítáním, stůl 1: H1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^1. kolo$/ }));
    const cell = screen.getByRole('group', { name: '1. kolo, stůl 1' });
    // organizátor utkání nezahajuje (to jde jen v Moje hry), zapíše skóre rovnou a potvrdí
    expect(within(cell).queryByRole('button', { name: 'Zahájit' })).toBeNull();
    expect(within(cell).getByRole('button', { name: 'Potvrdit' })).toBeInTheDocument();
    await user.click(within(cell).getByRole('button', { name: '1. kolo, stůl 1: góly vlevo 6' }));
    await user.click(within(cell).getByRole('button', { name: '1. kolo, stůl 1: góly vpravo 2' }));
    expect(rowOf('1. kolo')).toHaveTextContent('6:2');
    const first = within(screen.getByRole('table', { name: 'Souhrn tréninku' })).getAllByRole('row')[1];
    expect(first).toHaveTextContent('H1');
    expect(first).toHaveTextContent('+4');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].scores['league|1|1|id1+id2vid3+id4']).toEqual({ ga: 6, gb: 2 }));
  });

  it('zápis stanoviště: rotace 2, stůl 1 = H3 na pětce; nad max se nepřijme', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] });
    render(<App repo={repo} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(screen.getByRole('button', { name: /^Stanoviště, rotace 2/ }));
    const input = screen.getByLabelText('Stanoviště, rotace 2, stůl 1: H3');
    await user.type(input, '3');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].soloResults).toEqual({ id3: { fiveBarControl: 3 } }));
    await user.clear(input);
    await user.type(input, '11');
    expect(input).toHaveValue(1);
    expect(rowOf('Stanoviště, rotace 2')).toHaveTextContent('zapsáno 1 z 8');
  });

  it('změna začátku posune časy', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await openSettings(user, 'Kdy a kde');
    fireEvent.change(screen.getByLabelText('Začátek'), { target: { value: '17:30' } });
    await saveSettings(user);
    expect(within(rowOf('1. kolo')).getByText('18:30')).toBeInTheDocument();
  });

  it('tlačítko na vymazání všech skóre už není (2. 11. 2026)', async () => {
    const t = { ...training(8, 'team', 4), scores: { 'league|1|1|id1+id2vid3+id4': { ga: 6, gb: 2 } } };
    render(<App repo={memoryRepository({ players: players(8), trainings: [t] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.queryByRole('button', { name: /Vymazat všechna skóre/ })).toBeNull();
  });

  it('po změně typu tréninku je zase rozbalený výchozí blok', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(screen.getByRole('button', { name: /^2. kolo$/ }));
    await openSettings(user, 'Kdy a kde');
    await user.selectOptions(screen.getByLabelText('Typ tréninku'), 'single');
    await saveSettings(user);
    expect(screen.getByLabelText('Rozehrání: rozehrávka ze zadku, stůl 1: H1')).toBeInTheDocument();
  });

  it('Zeď: v kole 3 hraje zeď levá strana, v kole 4 pravá', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(screen.getByRole('button', { name: /^3. kolo$/ }));
    const c3 = screen.getByRole('group', { name: '3. kolo, stůl 1' });
    const sides3 = c3.querySelectorAll('.pick-a, .pick-b');
    expect(sides3[0]).toHaveTextContent('Zeď');
    expect(sides3[1]).toHaveTextContent('Láme zeď');
    await user.click(screen.getByRole('button', { name: /^4. kolo$/ }));
    const sides4 = screen.getByRole('group', { name: '4. kolo, stůl 1' }).querySelectorAll('.pick-a, .pick-b');
    expect(sides4[0]).toHaveTextContent('Láme zeď');
    expect(sides4[1]).toHaveTextContent('Zeď');
  });

  it('start 0:3: zapisuje se stav na stole, uloží se odehrané góly', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] });
    render(<App repo={repo} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(screen.getByRole('button', { name: /^5. kolo$/ }));
    const card = screen.getByRole('group', { name: '5. kolo, stůl 1' });
    expect(card).toHaveTextContent('začíná 0');
    expect(card).toHaveTextContent('začíná 3');
    // méně než start 3 nejde kliknout
    expect(within(card).getByRole('button', { name: '5. kolo, stůl 1: góly vpravo 2' })).toBeDisabled();
    await user.click(within(card).getByRole('button', { name: '5. kolo, stůl 1: góly vlevo 6' }));
    await user.click(within(card).getByRole('button', { name: '5. kolo, stůl 1: góly vpravo 4' }));
    expect(card).toHaveTextContent('odehráno 6 : 1');
    const id = repo.snapshot().trainings[0].attendees;
    await vi.waitFor(() => {
      const sc = Object.entries(repo.snapshot().trainings[0].scores).find(([k]) => k.startsWith('league|5|1|'));
      expect(sc?.[1]).toEqual({ ga: 6, gb: 1 });
    });
    expect(id).toHaveLength(8);
  });

  it('ztráty u každého stolu, i bez rozhodčího a v Dani', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players: players(9), trainings: [training(9, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await user.click(screen.getByRole('button', { name: /^1. kolo$/ }));
    const t1 = screen.getByRole('group', { name: '1. kolo, stůl 1' });
    const t2 = screen.getByRole('group', { name: '1. kolo, stůl 2' });
    expect(within(t1).getByLabelText('1. kolo, stůl 1: ztráty vlevo')).toBeInTheDocument();
    expect(t1).toHaveTextContent('Rozhodčí: H9');
    expect(within(t2).getByLabelText('1. kolo, stůl 2: ztráty vlevo')).toBeInTheDocument();
    expect(t2).toHaveTextContent('Bez rozhodčího, ztráty zapisují hráči');
    await user.click(screen.getByRole('button', { name: /^2. kolo$/ }));
    const d = screen.getByRole('group', { name: '2. kolo, stůl 1' });
    expect(within(d).getByLabelText('2. kolo, stůl 1: ztráty vlevo')).toBeInTheDocument();
    expect(d).toHaveTextContent('Daň za ztrátu: ztráta se hned počítá jako gól soupeře.');
  });

  it('týmy simulace: výchozí podle výkonu, zamknou se prvním výsledkem simulace', async () => {
    const user = userEvent.setup();
    const t = { ...training(8, 'team', 4), simSplit: 'performance' as const };
    const repo = memoryRepository({ players: players(8), trainings: [t] });
    render(<App repo={repo} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.getByText('Tým A: H1, H4, H5, H8. Tým B: H2, H3, H6, H7.')).toBeInTheDocument();
    await openTeams(user);
    expect(screen.getByRole('radio', { name: 'Vyrovnaně podle výkonu v tréninku' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: /^1\. vlna/ }));
    const sim = screen.getByRole('group', { name: '1. vlna, stůl 1' });
    await user.click(within(sim).getByRole('button', { name: '1. vlna, stůl 1: góly vlevo 2' }));
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].simTeams).toEqual({ A: ['id1', 'id4', 'id5', 'id8'], B: ['id2', 'id3', 'id6', 'id7'] }));
    expect(screen.queryByText('Týmy pro simulaci', { selector: 'strong' })).toBeNull(); // simulace začala → týmy zamčené

    // výsledek ve scénářové lize už týmy nepřehází
    await user.click(screen.getByRole('button', { name: /^1. kolo$/ }));
    await user.click(screen.getByRole('button', { name: '1. kolo, stůl 2: góly vlevo 0' }));
    await user.click(screen.getByRole('button', { name: '1. kolo, stůl 2: góly vpravo 6' }));
    expect(screen.getByText('Tým A: H1, H4, H5, H8. Tým B: H2, H3, H6, H7.')).toBeInTheDocument();
  });

  it('panel vždy ukáže oba týmy a dvě možnosti; vyrovnaně podle výkonu je pevné (bez úprav a bez Náhodně)', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players: players(8), trainings: [{ ...training(8, 'team', 4), simSplit: 'performance' as const }] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    // panel je v rozpisu u sekce Simulace ligového kola
    expect(screen.getByText('Týmy pro simulaci', { selector: 'strong' }).closest('tr')).toHaveClass('sim-setup-row');
    expect(screen.getByText('Týmy pro simulaci', { selector: 'strong' }).closest('tr')!.previousElementSibling).toHaveTextContent('Simulace ligového kola');
    await openTeams(user);
    const options = within(screen.getByRole('radiogroup', { name: 'Týmy pro simulaci' })).getAllByRole('radio');
    expect(options.map((o) => o.getAttribute('aria-label') ?? o.closest('label')?.textContent)).toEqual(['Vyrovnaně podle výkonu v tréninku', 'Ručně']);
    const a = screen.getByRole('list', { name: 'Tým A' });
    const b = screen.getByRole('list', { name: 'Tým B' });
    expect(within(a).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1.H1', '2.H4', '3.H5', '4.H8']);
    expect(within(b).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /Přesunout H1/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Náhodně' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Náhodné pořadí' })).toBeNull();
  });

  it('ruční týmy: převezmou se zobrazené a jde přesouvat hráče', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players: players(8), trainings: [{ ...training(8, 'team', 4), simSplit: 'performance' as const }] });
    render(<App repo={repo} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await openTeams(user);
    await user.click(screen.getByRole('radio', { name: 'Ručně' }));
    // ruční sestavení začne od týmů, které byly v rozpisu
    expect(screen.getByRole('button', { name: 'Přesunout H1 do týmu B' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Přesunout H1 do týmu B' }));
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
      'Stůl 2: Penalta z místa',
      'Stůl 3: Rozehrávka ze zadních tyčí',
    ]);
    expect(help).toHaveTextContent('Teprve po třetím zastavení smí přihrát na trojku');

    await user.click(screen.getByRole('button', { name: /^1. kolo$/ }));
    entry = screen.getByRole('group', { name: '1. kolo, stůl 1' }).closest<HTMLElement>('.block-entry')!;
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
    expect(rowOf('1. kolo')).toHaveTextContent('H5');
  });

  it('n=8, t=4: kolo 1 má volné stoly 3 a 4', async () => {
    render(<App repo={memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(within(rowOf('1. kolo')).getAllByText('volný')).toHaveLength(2);
  });
});

describe('tabulka tréninku – stav kol podle skutečnosti', () => {
  const T0 = new Date(2026, 9, 31, 18, 0).getTime();
  const at = (min: number) => T0 + min * 60_000;
  /** ID utkání kola (fronta z rozpisu). */
  const idsOf = (t: Training, label: string) =>
    queueOf(buildSchedule(t)).flatMap((e) => (e.kind === 'item' && e.label === label ? [e.id] : []));

  it('podle hodin se nic nezvýrazňuje – trénink nezačal', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 31, 19, 21));
    window.location.hash = '#/trenink/t1';
    render(<App repo={memoryRepository({ players: players(8), trainings: [training(8, 'team', 4)] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(rowOf('3. kolo')).not.toHaveClass('rail');
    expect(screen.queryByRole('img', { name: 'Hraje se' })).toBeNull();
  });

  it('odehraná kola, hrané kolo (rozbalené, s dohranými stoly) a kola, která přijdou', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(30));
    window.location.hash = '#/trenink/t1';
    const base = training(8, 'team', 4);
    const playTimes: Training['playTimes'] = { [TRAINING_ITEM]: { startedAt: at(0) } };
    for (const label of ['Rozehrání s počítáním', 'Stanoviště, rotace 1', 'Stanoviště, rotace 2', 'Stanoviště, rotace 3', 'Stanoviště, rotace 4', '1. kolo'])
      for (const id of idsOf(base, label)) playTimes[id] = { startedAt: at(1), endedAt: at(2) };
    const [a, b] = idsOf(base, '2. kolo');
    playTimes[a] = { startedAt: at(20), endedAt: at(26) };
    playTimes[b] = { startedAt: at(21) };
    render(<App repo={memoryRepository({ players: players(8), trainings: [{ ...base, playTimes }] })} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(rowOf('1. kolo')).toHaveClass('st-done');
    expect(within(rowOf('1. kolo')).getByRole('img', { name: 'Odehráno' })).toBeInTheDocument();
    expect(rowOf('2. kolo')).toHaveClass('st-playing');
    expect(rowOf('2. kolo')).toHaveTextContent('hraje se 10 min · 1 z 2 stolů hotovo');
    expect(rowOf('2. kolo').querySelectorAll('td.cell-done')).toHaveLength(1);
    expect(rowOf('2. kolo').querySelectorAll('td.cell-live')).toHaveLength(1);
    expect(rowOf('3. kolo')).toHaveClass('st-upcoming');
    expect(screen.getByRole('group', { name: '2. kolo, stůl 1' })).toBeInTheDocument();
  });
});

it('nápověda kola ukazuje, co disciplína trénuje (štítky)', async () => {
  const user = userEvent.setup();
  const t = { ...training(8, 'team', 4), format: 'custom' as const, plan: { penaltyKeeper: 2 } };
  window.location.hash = '#/trenink/t1';
  render(<App repo={memoryRepository({ players: players(8), trainings: [t] })} />);
  await screen.findByRole('table', { name: 'Rozpis tréninku' });
  const r1 = screen.getByRole('button', { name: /^1\. kolo$/ });
  if (r1.getAttribute('aria-expanded') !== 'true') await user.click(r1); // bývá rozbalené jako výchozí
  const help = document.querySelector<HTMLDetailsElement>('details.help')!;
  expect(within(help).getByRole('list', { name: 'Trénuje' })).toHaveTextContent('Střela z trojkyObrana zadkuČtení soupeře');
});
