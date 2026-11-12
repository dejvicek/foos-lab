import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { memoryAuth } from '../../storage/auth';
import { applyCatalog } from '../../domain/catalog';
import type { Player } from '../../domain/types';
import { DEFAULT_CATALOG } from '../../test/fixtures';

const roster: Player[] = ['Dejv', 'Milan'].map((name, order) => ({ id: `id${order + 1}`, name, order, archived: false }));
const authPlayers = roster.map((p) => ({ id: p.id, name: p.name, isAdmin: p.name === 'Dejv' }));
const rows = () => screen.getAllByRole('listitem').filter((li) => li.classList.contains('dp-row'));
const row = (name: string) => screen.getByRole('listitem', { name });

beforeEach(() => {
  window.location.hash = '#/trainings';
});
afterEach(() => applyCatalog({}));

describe('stránka Disciplíny', () => {
  it('v navigaci i pro hráče; řádek s délkou, ikonou a štítky; popis sbalený; bez úprav; vyřazené chybí', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    render(<App repo={memoryRepository({ players: roster, trainings: [] })} auth={auth} />);
    const user = userEvent.setup();
    const nav = await screen.findByRole('navigation', { name: 'Hlavní navigace' });
    await user.click(within(nav).getByRole('button', { name: 'Disciplíny' }));
    expect(window.location.hash).toBe('#/disciplines');
    expect(screen.getByRole('heading', { level: 1, name: 'Disciplíny' })).toBeInTheDocument();

    const r = row('Penalta z místa proti brankáři');
    expect(r).toHaveTextContent('2× 8 min');
    expect(within(r).getByRole('img', { name: 's bránícím soupeřem' })).toBeInTheDocument();
    expect(within(within(r).getByRole('list', { name: 'Trénuje' })).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Střela z trojky', 'Obrana', 'Čtení soupeře',
    ]);
    const toggle = within(r).getByRole('button', { name: 'Penalta z místa proti brankáři' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(r).not.toHaveTextContent('střílet až z kontrolovaného míče');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(r).toHaveTextContent('Cílstřílet až z kontrolovaného míče');
    expect(r).toHaveTextContent('2 kola po 20 pokusech, variantu si určí hráč');
    expect(within(r).queryByRole('button', { name: 'Upravit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upravit štítky' })).toBeNull();
    // šablony jsou jen pro admina: hráč je v navigaci nemá a na adrese dostane jen informaci
    expect(within(nav).queryByRole('button', { name: 'Šablony' })).toBeNull();
    window.location.hash = '#/templates';
    expect(await screen.findByText('Šablony tréninku spravuje admin.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Šablony tréninku' })).toBeNull();
    window.location.hash = '#/disciplines';
    await screen.findByRole('heading', { level: 1, name: 'Disciplíny' });

    expect(rows()).toHaveLength(26);
    // cvičení po sekcích (12. 11. 2026): Rozcvička bez sekce, pak Obrana, Pětka, Trojka
    const drills = screen.getByRole('region', { name: /^Cvičení/ });
    expect(within(drills).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Obrana', 'Pětka', 'Trojka']);
    expect(within(within(drills).getByRole('group', { name: 'Pětka' })).getAllByRole('listitem').map((li) => li.getAttribute('aria-label')).filter(Boolean)).toEqual([
      'Přihrávky na pětce', 'Přihrávky ke zdi a po lajně', 'Udržení míče na pětce', 'Čistá desítka – přihrávka na pětce',
    ]);
    for (const retired of ['Penalta z místa (20 střel)', 'Rozehrávka ze zadních tyčí']) expect(screen.queryByRole('listitem', { name: retired })).toBeNull();
  });

  it('filtr podle sekce a štítku (OR), Zrušit filtr', async () => {
    window.location.hash = '#/disciplines';
    render(<App repo={memoryRepository({ players: roster, trainings: [] })} />);
    const user = userEvent.setup();
    const chips = await screen.findByRole('list', { name: 'Sekce dovedností' });
    await user.click(within(chips).getByRole('button', { name: 'Obrana' }));
    expect(rows().map((a) => a.getAttribute('aria-label'))).toEqual([
      'Střela z dvojky proti brankáři', 'Clearing', 'Zachycení volného míče', 'Penalta z místa proti brankáři', 'Daň za ztrátu', 'Jedničky', 'Goalie war', 'Penalty',
    ]); // cvičení po sekcích Obrana / Pětka / Trojka
    expect(screen.getByText(/· 8 z 26/)).toBeInTheDocument();
    await user.click(within(row('Jedničky')).getByRole('button', { name: 'Zápasová praxe' }));
    expect(row('Normální leg')).toBeInTheDocument();
    expect(row('Simulace ligového kola')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zrušit filtr' }));
    expect(rows()).toHaveLength(26);
  });

  it('admin upraví disciplínu: název, délka, štítky, nápověda; Obnovit výchozí', async () => {
    window.location.hash = '#/disciplines';
    const repo = memoryRepository({ players: roster, trainings: [] });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Zeď' }));
    await user.click(within(row('Zeď')).getByRole('button', { name: 'Upravit' }));
    const form = screen.getByRole('form', { name: 'Upravit Zeď' });
    await user.clear(within(form).getByLabelText('Název'));
    await user.type(within(form).getByLabelText('Název'), 'Betonová zeď');
    await user.click(within(form).getByRole('button', { name: 'Delší kolo: Betonová zeď' }));
    await user.click(within(form).getByRole('button', { name: 'Delší kolo: Betonová zeď' }));
    expect(within(form).getByRole('status', { name: 'Délka kola: Betonová zeď' })).toHaveTextContent('10 min');
    const tags = within(form).getByRole('group', { name: 'Štítky' });
    await user.click(within(tags).getByRole('button', { name: 'Čtení soupeře' })); // odebrat
    await user.click(within(tags).getByRole('button', { name: 'Dotahování' })); // přidat
    await user.clear(within(form).getByLabelText('Pravidlo'));
    await user.type(within(form).getByLabelText('Pravidlo'), 'Jeden tým drží míč.');
    await user.click(within(form).getByRole('button', { name: 'Uložit' }));

    const r = row('Betonová zeď');
    expect(r).toHaveTextContent('2× 10 min');
    expect(r).toHaveTextContent('Jeden tým drží míč.');
    // v pořadí legendy: Technika, Taktika, Hlava
    expect(within(within(r).getByRole('list', { name: 'Trénuje' })).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Kontrola míče', 'Tempo a trpělivost', 'Dotahování',
    ]);
    await vi.waitFor(() =>
      expect(repo.snapshot().catalog).toEqual({
        disciplines: { wall: { name: 'Betonová zeď', min: 10, skills: ['tempo', 'control', 'comeback'], help: [{ text: 'Jeden tým drží míč.' }] } },
      }),
    );

    await user.click(within(r).getByRole('button', { name: 'Upravit' }));
    await user.click(screen.getByRole('button', { name: 'Obnovit výchozí' }));
    expect(row('Zeď')).toHaveTextContent('2× 8 min');
    await vi.waitFor(() => expect(repo.snapshot().catalog).toEqual({}));
  });

  it('admin spravuje štítky: přejmenuje, přidá, smaže; disciplíny se přepíšou', async () => {
    window.location.hash = '#/disciplines';
    const repo = memoryRepository({ players: roster, trainings: [] });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Upravit štítky' }));
    const form = screen.getByRole('form', { name: 'Upravit štítky' });
    const name = within(form).getByRole('textbox', { name: 'Název štítku Obrana' });
    await user.clear(name);
    await user.type(name, 'Bránění');
    await user.click(within(form).getByRole('button', { name: 'Smazat štítek Čtení soupeře' }));
    const tactics = within(form).getByRole('group', { name: 'Taktika' });
    await user.click(within(tactics).getByRole('button', { name: '+ Přidat štítek' }));
    await user.click(within(form).getByRole('button', { name: 'Uložit štítky' }));
    expect(within(form).getByText('Štítek musí mít název.')).toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: 'Název štítku (nový)' }), 'Taktické fauly');
    await user.click(within(form).getByRole('button', { name: 'Uložit štítky' }));

    expect(screen.queryByRole('form', { name: 'Upravit štítky' })).toBeNull();
    const tags = within(within(row('Penalta z místa proti brankáři')).getByRole('list', { name: 'Trénuje' })).getAllByRole('button').map((b) => b.textContent);
    expect(tags).toEqual(['Střela z trojky', 'Bránění']);
    await vi.waitFor(() => {
      const skills = repo.snapshot().catalog?.skills ?? [];
      expect(skills.find((s) => s.id === 'defense')?.name).toBe('Bránění');
      expect(skills.some((s) => s.id === 'reading')).toBe(false);
      expect(skills.at(-1)).toMatchObject({ name: 'Taktické fauly', group: 'tactics' });
    });
  });

  it('Šablony bez uložených: začne jedna prázdná „Výchozí“, bez disciplín se neuloží (10. 11. 2026)', async () => {
    window.location.hash = '#/templates';
    render(<App repo={memoryRepository({ players: roster, trainings: [] })} />);
    const form = await screen.findByRole('form', { name: 'Šablony tréninku' });
    expect(within(form).getByRole('tab', { name: /Výchozí/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(form).getByRole('status', { name: 'Naplánováno' })).toHaveTextContent(/^Naplánováno 0:00 z 3:00/);
    expect(within(form).getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)).toEqual([]);
    expect(within(form).getByText('Šablona „Výchozí“ nemá žádnou disciplínu.')).toBeInTheDocument();
  });

  it('admin spravuje šablony na stránce Šablony: délka, výběr, počet kol, délky kol, pořadí, pauzy; nic se nedoplňuje', async () => {
    window.location.hash = '#/disciplines';
    const repo = memoryRepository({ players: roster, trainings: [], catalog: DEFAULT_CATALOG });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 1, name: 'Disciplíny' });
    expect(screen.queryByRole('button', { name: 'Šablony tréninku' })).toBeNull(); // šablony už nejsou na Disciplínách
    const nav = screen.getByRole('navigation', { name: 'Hlavní navigace' });
    await user.click(within(nav).getByRole('button', { name: 'Šablony' }));
    expect(window.location.hash).toBe('#/templates');
    expect(screen.getByRole('heading', { level: 1, name: 'Šablony' })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Šablony tréninku' });
    expect(within(form).getByRole('list', { name: 'Nápověda' })).toHaveTextContent('najeď myší na hranu mezi dvěma disciplínami');
    const status = () => within(form).getByRole('status', { name: 'Naplánováno' }).textContent;
    expect(within(form).getByRole('tab', { name: /Výchozí/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(form).queryByRole('region', { name: 'Náhled tréninku' })).toBeNull();
    await user.clear(within(form).getByRole('textbox', { name: 'Název' }));
    await user.type(within(form).getByRole('textbox', { name: 'Název' }), 'Krátký');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Délka' }), '60');
    expect(status()).toMatch(/Naplánováno 2:\d\d z 1:00.*přes o/);
    for (const name of ['Penalta z místa proti brankáři', 'Zeď', 'Start 0:3 + daň', 'Start 5:5, o 2 góly, strop 10', 'Jedničky', 'Simulace ligového kola'])
      await user.click(within(form).getByRole('checkbox', { name }));
    // 8 hráčů / 4 stoly: Přihrávky 9 + Udržení 17 + Normální 9 + Daň 9 + 4:4 6 = 50; nic se nedoplňuje
    expect(status()).toBe('Naplánováno 0:50 z 1:00zbývá 10 min');
    const rows = (name: string) => within(within(form).getByRole('list', { name: `Pořadí: ${name}` })).getAllByRole('listitem');
    expect(rows('Cvičení')[1]).toHaveTextContent(/0:09.*0:26.*Udržení míče na pětce/);
    await user.click(within(form).getByRole('button', { name: 'Delší kolo: Normální leg' }));
    await user.click(within(form).getByRole('button', { name: 'Delší kolo: Normální leg' }));
    expect(status()).toMatch(/^Naplánováno 0:52 z 1:00/);
    // počet kol zápasu
    await user.click(within(form).getByRole('button', { name: 'Víc kol: Normální leg' }));
    expect(within(form).getByRole('status', { name: 'Počet kol: Normální leg' })).toHaveTextContent('2×');
    expect(status()).toMatch(/^Naplánováno 1:03 z 1:00/);
    // pořadí uvnitř sekce
    const order = (name: string) => within(within(form).getByRole('list', { name: `Pořadí: ${name}` })).getAllByRole('checkbox').filter((c) => !c.closest('.mf')).map((c) => c.closest('label')!.textContent);
    expect(order('Zápasy a scénáře')).toEqual(['Normální leg', 'Daň za ztrátu', 'Start 4:4']);
    await user.click(within(form).getByRole('button', { name: 'Dřív: Start 4:4' }));
    await user.click(within(form).getByRole('button', { name: 'Dřív: Start 4:4' }));
    expect(order('Zápasy a scénáře')).toEqual(['Start 4:4', 'Normální leg', 'Daň za ztrátu']);
    await user.click(within(form).getByRole('checkbox', { name: 'Start 4:5' }));
    expect(order('Zápasy a scénáře')).toEqual(['Start 4:4', 'Normální leg', 'Daň za ztrátu', 'Start 4:5']);
    await user.click(within(form).getByRole('checkbox', { name: 'Start 4:5' }));
    // pauza jako řádek v tabulce
    await user.click(within(form).getByRole('button', { name: 'Přidat pauzu po: Udržení míče na pětce' }));
    expect(status()).toMatch(/^Naplánováno 1:13 z 1:00.*přes o 0:13/);
    const pause = within(form).getByRole('listitem', { name: 'Pauza po: Udržení míče na pětce' });
    expect(pause).toHaveTextContent(/0:26.*0:36/);
    await user.selectOptions(within(pause).getByRole('combobox', { name: 'Délka pauzy' }), '5');
    expect(status()).toBe('Naplánováno 1:08 z 1:00přes o 0:08');
    await user.click(within(form).getByRole('button', { name: 'Pauzu o disciplínu později' }));
    expect(within(form).getByRole('listitem', { name: 'Pauza po: Start 4:4' })).toBeInTheDocument();

    // nová šablona je prázdná; Označit vše / Odznačit vše
    await user.click(within(form).getByRole('button', { name: '+ Šablona' }));
    expect(within(form).getByRole('tab', { name: /Nová šablona/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(form).queryByRole('list', { name: /^Pořadí:/ })).toBeNull();
    // Čistá desítka je jen ve vlastním tréninku – šablona ji nenabízí
    expect(within(form).queryByRole('checkbox', { name: /^Čistá desítka/ })).toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Označit vše' }));
    expect(within(form).queryAllByRole('list', { name: /^Další:/ })).toEqual([]);
    expect(within(form).getByRole('list', { name: 'Pořadí: Simulace' })).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Odznačit vše' }));
    expect(within(form).queryByRole('list', { name: /^Pořadí:/ })).toBeNull();
    await user.click(within(form).getByRole('checkbox', { name: 'Normální leg' }));
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Délka' }), '180');
    await user.click(within(form).getByRole('button', { name: 'Uložit šablony' }));
    expect(within(form).getByText('Uloženo')).toBeInTheDocument();
    await vi.waitFor(() => {
      const c = repo.snapshot().catalog!;
      expect(c.templates?.map((t) => [t.name, t.durationMin, t.selection])).toEqual([['Krátký', 60, expect.any(Array)], ['Nová šablona', 180, ['normal']]]);
      expect(c.templates?.[0]).toMatchObject({
        selection: ['warmupPasses', 'fiveBarControl', 'start44', 'normal', 'lossTax'],
        rounds: { normal: 2 },
        breaks: [{ after: 'start44', min: 5 }],
      });
      expect(c.disciplines).toEqual({ normal: { min: 10 } });
    });

    // nový trénink: první šablona (1:00), přesně její kola
    window.location.hash = '#/trainings/new';
    await screen.findByRole('heading', { name: 'Přítomní' });
    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: /^Další:/ }));
    expect(screen.getByRole('slider', { name: 'Délka tréninku' })).toHaveValue('60');
  });
  it('Šablony: Zahodit změny vrátí neuložené úpravy; Uloženo zmizí po další změně', async () => {
    window.location.hash = '#/templates';
    const repo = memoryRepository({ players: roster, trainings: [], catalog: DEFAULT_CATALOG });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    const form = await screen.findByRole('form', { name: 'Šablony tréninku' });
    await user.clear(within(form).getByRole('textbox', { name: 'Název' }));
    await user.type(within(form).getByRole('textbox', { name: 'Název' }), 'Pokus');
    await user.click(within(form).getByRole('button', { name: 'Zahodit změny' }));
    const fresh = screen.getByRole('form', { name: 'Šablony tréninku' });
    expect(within(fresh).getByRole('textbox', { name: 'Název' })).toHaveValue('Výchozí');
    await user.click(within(fresh).getByRole('button', { name: 'Uložit šablony' }));
    expect(within(fresh).getByText('Uloženo')).toBeInTheDocument();
    await user.click(within(fresh).getByRole('button', { name: 'Delší kolo: Normální leg' }));
    expect(within(fresh).queryByText('Uloženo')).toBeNull();
    expect(repo.snapshot().catalog?.templates?.[0].name).toBe('Výchozí');
  });
  it('Šablony: odhad hráčů posuvníkem a stolů tečkami jako v průvodci; mění čas cvičení', async () => {
    window.location.hash = '#/templates';
    render(<App repo={memoryRepository({ players: roster, trainings: [], catalog: DEFAULT_CATALOG })} />);
    const user = userEvent.setup();
    const form = await screen.findByRole('form', { name: 'Šablony tréninku' });
    const status = () => within(form).getByRole('status', { name: 'Naplánováno' }).textContent;
    expect(within(form).getByRole('slider', { name: 'Odhad: hráčů' })).toHaveValue('8');
    expect(within(form).getByRole('radio', { name: '4 stoly' })).toBeChecked();
    const before = status();
    await user.click(within(form).getByRole('radio', { name: '2 stoly' }));
    expect(status()).not.toBe(before); // 8 hráčů na 2 stolech = 2 vystřídání ve cvičeních
    fireEvent.change(within(form).getByRole('slider', { name: 'Odhad: hráčů' }), { target: { value: '4' } });
    expect(status()).toBe(before); // 4 hráči na 2 stolech = zase 1 vystřídání
  });
});
