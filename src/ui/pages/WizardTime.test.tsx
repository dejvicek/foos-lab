import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { memoryAuth } from '../../storage/auth';
import type { DisciplineId, Player } from '../../domain/types';
import { applyCatalog, type CatalogData } from '../../domain/catalog';
import { next } from '../../test/wizard';

/** Nevybrané disciplíny, které tabulka ukazuje (seznamy „Další: …“). */
const shownRest = () =>
  screen
    .getAllByRole('list')
    .filter((l) => l.getAttribute('aria-label')?.startsWith('Další:'))
    .flatMap((l) => within(l).getAllByRole('checkbox').filter((c) => !c.closest('.mf')).map((c) => c.closest('label')!.textContent!));
const rowOf = (name: string) => screen.getByRole('checkbox', { name }).closest('li')!;
import { DEFAULT_CATALOG } from '../../test/fixtures';

const players: Player[] = ['Ada', 'Bára', 'Cyril', 'Dan'].map((name, order) => ({ id: `p${order + 1}`, name, order, archived: false }));

async function wizard(names: string[], minutes: number) {
  const user = userEvent.setup();
  window.location.hash = '#/trainings/new';
  render(<App repo={memoryRepository({ players, trainings: [], catalog: DEFAULT_CATALOG })} />);
  await screen.findByRole('heading', { name: 'Přítomní' });
  for (const n of names) await user.click(screen.getByRole('checkbox', { name: n }));
  await next(user);
  fireEvent.change(screen.getByRole('slider', { name: 'Délka tréninku' }), { target: { value: String(minutes) } });
  await user.click(screen.getByRole('radio', { name: '1 stůl' }));
  return user;
}

describe('čas plánu v průvodci', () => {
  it('plán delší než trénink: v plánu varování, zahájit jde i tak (časy jsou orientační)', async () => {
    await wizard(['Ada', 'Bára', 'Cyril', 'Dan'], 60);
    expect(screen.getByRole('alert')).toHaveTextContent(/Plán \(\d:\d\d\) je delší než trénink \(1:00\)/);
    expect(screen.getByRole('button', { name: 'Zahájit trénink' })).toBeEnabled();
  });

  it('zbývá čas: v kroku Kdy, kde a disciplíny nabídne doplnit kola, po doplnění se plán prodlouží', async () => {
    const user = await wizard(['Ada'], 90); // trénink pro 1 hráče: sólová cvičení (1:11), zbývá čas
    const status = () => screen.getByRole('status', { name: 'Naplánováno' }).textContent;
    const before = status();
    expect(before).toMatch(/zbývá \d+ min/);
    await user.click(screen.getByRole('button', { name: 'Doplnit kola' }));
    expect(status()).not.toBe(before);
  });
});

it('štítky dovedností: u disciplín v kroku Kdy, kde a disciplíny', async () => {
  const user = userEvent.setup();
  window.location.hash = '#/trainings/new';
  render(<App repo={memoryRepository({ players, trainings: [], catalog: DEFAULT_CATALOG })} />);
  await screen.findByRole('heading', { name: 'Přítomní' });
  for (const n of ['Ada', 'Bára', 'Cyril', 'Dan']) await user.click(screen.getByRole('checkbox', { name: n }));
  await next(user);
  // Čistá desítka je jen ve vlastním tréninku (12. 11. 2026)
  expect(screen.queryByRole('checkbox', { name: /^Čistá desítka/ })).toBeNull();
  expect(screen.getByRole('checkbox', { name: 'Goalie war' })).toBeInTheDocument();
  // výchozí stav: štítky schované
  expect(screen.queryByRole('list', { name: 'Trénuje' })).toBeNull();
  expect(screen.queryByRole('list', { name: 'Sekce dovedností' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Ukázat štítky' }));
  const penalty = rowOf('Penalta z místa proti brankáři');
  expect(within(penalty).getByRole('list', { name: 'Trénuje' })).toHaveTextContent('Střela z trojkyObranaČtení soupeře');
  // barva podle sekce, žádné zvýraznění „hlavního“; nad seznamem legenda sekcí
  const tags = within(penalty).getAllByRole('listitem');
  expect(tags.map((li) => li.className)).toEqual(['g-attack', 'g-defense', 'g-tactics']);
  expect(screen.getByRole('list', { name: 'Sekce dovedností' })).toHaveTextContent('ÚtokObranaTechnikaTaktikaHlavaZápas');
});

it('filtrování disciplín podle štítků: sekce v legendě i konkrétní štítek; zrušit filtr', async () => {
  const user = userEvent.setup();
  window.location.hash = '#/trainings/new';
  render(<App repo={memoryRepository({ players, trainings: [], catalog: DEFAULT_CATALOG })} />);
  await screen.findByRole('heading', { name: 'Přítomní' });
  for (const n of ['Ada', 'Bára', 'Cyril', 'Dan']) await user.click(screen.getByRole('checkbox', { name: n }));
  await next(user);
  // filtr skrývá jen nevybrané disciplíny; vybrané (v plánu) zůstávají vidět
  const shown = shownRest;
  const all = shown().length;
  await user.click(screen.getByRole('button', { name: 'Ukázat štítky' }));
  // konkrétní štítek Clearing (u disciplíny Clearing)
  await user.click(within(rowOf('Clearing')).getByRole('button', { name: 'Clearing' }));
  expect(shown()).toEqual(['Clearing']);
  expect(screen.getByRole('checkbox', { name: 'Daň za ztrátu' })).toBeChecked();
  expect(screen.getByText(/zobrazeno 1 z \d+/)).toBeInTheDocument();
  // + sekce Útok (sčítá se)
  await user.click(within(screen.getByRole('list', { name: 'Sekce dovedností' })).getByRole('button', { name: 'Útok' }));
  expect(shown()).toEqual(expect.arrayContaining(['Clearing', 'Penalta z místa bez brankáře', 'Přihrávky ke zdi a po lajně']));
  expect(shown()).not.toContain('Zachycení volného míče');
  await user.click(screen.getByRole('button', { name: 'Zrušit filtr' }));
  expect(shown()).toHaveLength(all);
  // skrytí štítků zruší i filtr
  await user.click(within(screen.getByRole('list', { name: 'Sekce dovedností' })).getByRole('button', { name: 'Útok' }));
  await user.click(screen.getByRole('button', { name: 'Skrýt štítky' }));
  expect(shown()).toHaveLength(all);
  expect(screen.queryByRole('list', { name: 'Trénuje' })).toBeNull();
});

/** Nový trénink: Přítomní (4 hráči) → krok Kdy, kde a disciplíny. */
async function toPlan(catalog?: CatalogData) {
  const user = userEvent.setup();
  window.location.hash = '#/trainings/new';
  render(<App repo={memoryRepository({ players, trainings: [], catalog })} />);
  await screen.findByRole('heading', { name: 'Přítomní' });
  for (const n of ['Ada', 'Bára', 'Cyril', 'Dan']) await user.click(screen.getByRole('checkbox', { name: n }));
  await next(user);
  expect(screen.getByRole('heading', { name: 'Kdy, kde a disciplíny' })).toBeInTheDocument();
  return user;
}

it('šablona v kroku Kdy, kde a disciplíny: předvybraná první, jiná změní délku i disciplíny; úprava = Vlastní výběr', async () => {
  const user = await toPlan({
    templates: [
      { id: 'k', name: 'Krátký', durationMin: 60, selection: ['warmupPasses', 'normal'] as DisciplineId[] },
      { id: 'd', name: 'Dlouhý', durationMin: 180, selection: ['normal', 'wall', 'sim'] as DisciplineId[] },
    ],
  });
  const tab = (name: RegExp) => screen.getByRole('tab', { name });
  expect(tab(/^Krátký/)).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('slider', { name: 'Délka tréninku' })).toHaveValue('60');
  await user.click(tab(/^Dlouhý/));
  expect(tab(/^Dlouhý/)).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('slider', { name: 'Délka tréninku' })).toHaveValue('180');
  expect(screen.getByText(/^Naplánováno .* z 3:00/)).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Simulace ligového kola' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Přihrávky na pětce' })).not.toBeChecked();
  // úprava výběru = Vlastní výběr
  await user.click(screen.getByRole('checkbox', { name: 'Zeď' }));
  expect(tab(/^Vlastní výběr/)).toHaveAttribute('aria-selected', 'true');
  expect(tab(/^Dlouhý/)).toHaveAttribute('aria-selected', 'false');
  await user.click(tab(/^Krátký/));
  expect(tab(/^Krátký/)).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('tab', { name: /^Vlastní výběr/ })).toBeNull();
  expect(screen.getByText(/^Naplánováno .* z 1:00/)).toBeInTheDocument();
  applyCatalog({});
});

it('jediná šablona: je vidět jako zvolená záložka', async () => {
  await toPlan(DEFAULT_CATALOG);
  const tabs = within(screen.getByRole('tablist', { name: 'Šablona' })).getAllByRole('tab');
  expect(tabs.map((x) => x.textContent)).toEqual(['Výchozí3:00výchozí']);
  expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  applyCatalog({});
});

it('bez šablon: výběr šablony není a nic není zaškrtnuté (10. 11. 2026)', async () => {
  await toPlan();
  expect(screen.queryByRole('tablist', { name: 'Šablona' })).toBeNull();
  const boxes = screen.getAllByRole('checkbox').filter((c) => c.closest('.disc-table'));
  expect(boxes.length).toBeGreaterThan(10);
  expect(boxes.filter((c) => (c as HTMLInputElement).checked)).toEqual([]);
});

describe('uložit nastavení disciplín jako šablonu (admin, 10. 11. 2026)', () => {
  afterEach(() => applyCatalog({}));

  it('admin uloží nastavení jako novou šablonu; přidá se na konec a je hned zvolená; stejný název nejde', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/trainings/new';
    const repo = memoryRepository({ players, trainings: [], catalog: DEFAULT_CATALOG });
    render(<App repo={repo} />);
    await screen.findByRole('heading', { name: 'Přítomní' });
    for (const n of ['Ada', 'Bára', 'Cyril', 'Dan']) await user.click(screen.getByRole('checkbox', { name: n }));
    await next(user);
    await user.click(screen.getByRole('checkbox', { name: 'Simulace ligového kola' }));
    await user.click(screen.getByRole('button', { name: 'Přidat kolo: Normální leg' }));
    expect(screen.getByRole('tab', { name: /^Vlastní výběr/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: 'Uložit jako šablonu' }));
    const form = screen.getByRole('form', { name: 'Uložit jako šablonu' });
    // stejný název jako výchozí šablona → chyba, nic se neuloží
    await user.type(within(form).getByRole('textbox', { name: 'Název šablony' }), 'výchozí');
    await user.click(within(form).getByRole('button', { name: 'Uložit šablonu' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Šablona „výchozí“ už existuje.');
    expect(repo.snapshot().catalog?.templates).toHaveLength(1);
    await user.clear(within(form).getByRole('textbox', { name: 'Název šablony' }));
    await user.type(within(form).getByRole('textbox', { name: 'Název šablony' }), 'Bez simulace{Enter}');
    expect(screen.queryByRole('form', { name: 'Uložit jako šablonu' })).toBeNull();
    expect(screen.getByText('Uloženo jako šablona „Bez simulace“')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Bez simulace/ })).toHaveAttribute('aria-selected', 'true');
    await vi.waitFor(() => expect(repo.snapshot().catalog?.templates?.map((x) => x.name)).toEqual(['Výchozí', 'Bez simulace']));
    const saved = repo.snapshot().catalog!.templates![1];
    expect(saved.selection).not.toContain('sim');
    expect(saved.rounds?.normal).toBeGreaterThan(1);
    expect(saved.durationMin).toBe(180);
  });

  it('organizátor bez práv admina tlačítko nemá', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/trainings/new';
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'p1', isAdmin: false, mustChangePassword: false } });
    const roster = players.map((p) => (p.id === 'p1' ? { ...p, organizer: true } : p));
    render(<App repo={memoryRepository({ players: roster, trainings: [], catalog: DEFAULT_CATALOG })} auth={auth} />);
    await screen.findByRole('heading', { name: 'Přítomní' });
    for (const n of ['Ada', 'Bára']) await user.click(screen.getByRole('checkbox', { name: n }));
    await next(user);
    expect(screen.getByRole('tablist', { name: 'Šablona' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Uložit jako šablonu' })).toBeNull();
  });
});
