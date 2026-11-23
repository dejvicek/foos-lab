import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { memoryAuth } from '../../storage/auth';
import { applyCatalog } from '../../domain/catalog';
import { offeredDisciplines } from '../../domain/disciplineInfo';
import type { Player, Training } from '../../domain/types';
import { buildSchedule } from '../../domain/schedule';
import { DEFAULT_CATALOG } from '../../test/fixtures';

const roster: Player[] = ['Dejv', 'Milan', 'Lavi', 'Luky'].map((name, order) => ({ id: `id${order + 1}`, name, order, archived: false }));
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
    expect(r).toHaveTextContent('2× 14 min20 s / míček'); // ve dvojici 20 s × 40 pokusů
    // panáčci: kde se hraje (klub a vlastní ve dvou)
    expect(within(r).getByRole('group', { name: 'Hraje se: klubový trénink, duo' })).toBeInTheDocument();
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
    // šablony jsou jen pro admina: hráč je v navigaci ani v menu účtu nemá a na adrese dostane jen informaci
    expect(within(nav).queryByRole('button', { name: 'Šablony' })).toBeNull();
    await userEvent.setup().click(within(nav).getByRole('button', { name: /^Účet: / }));
    expect(screen.getByRole('menu', { name: 'Účet' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Šablony' })).toBeNull();
    window.location.hash = '#/templates';
    expect(await screen.findByText('Šablony tréninku spravuje admin.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Šablony tréninku' })).toBeNull();
    window.location.hash = '#/disciplines';
    await screen.findByRole('heading', { level: 1, name: 'Disciplíny' });

    expect(rows()).toHaveLength(26);
    // kde se hraje: Čistá desítka jen vlastní trénink, simulace jen klubový
    expect(within(row('Čistá desítka – střela z trojky')).getByRole('group', { name: 'Hraje se: solo, duo' })).toBeInTheDocument();
    expect(within(row('Penalta z místa bez brankáře')).getByRole('group', { name: 'Hraje se: solo' })).toBeInTheDocument();
    expect(within(row('Jedničky')).getByRole('group', { name: 'Hraje se: klubový trénink, duo' })).toBeInTheDocument();
    expect(within(row('Normální leg')).getByRole('group', { name: 'Hraje se: klubový trénink' })).toBeInTheDocument();
    expect(within(row('Přihrávky ke zdi a po lajně')).getByRole('group', { name: 'Hraje se: solo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Vysvětlivky ikon')).toHaveTextContent(/klubový trénink.*solo.*duo/);
    // filtr Hraje se: solo
    // filtr kliknutím na panáčka (solo) v řádku; zvýrazní se ve všech řádcích, druhé kliknutí ho zruší
    expect(screen.queryByRole('list', { name: 'Kde se hraje' })).toBeNull();
    await user.click(within(row('Přihrávky ke zdi a po lajně')).getByRole('button', { name: 'Filtrovat: solo' }));
    expect(within(row('Rozcvička')).getByRole('button', { name: 'Filtrovat: solo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Filtr:/)).toHaveTextContent('solo');
    expect(rows().map((a) => a.getAttribute('aria-label'))).toEqual([
      'Rozcvička', 'Střela z dvojky bez brankáře', 'Čistá desítka – střela z dvojky', 'Čistá desítka – přihrávka z dvojky',
      'Přihrávky ke zdi a po lajně', 'Čistá desítka – přihrávka na pětce',
      'Penalta z místa bez brankáře', 'Čistá desítka – střela z trojky',
    ]);
    await user.click(screen.getByRole('button', { name: 'Zrušit filtr' }));
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

  it('admin upraví disciplínu: název, doba míčku, štítky, nápověda; Obnovit výchozí', async () => {
    window.location.hash = '#/disciplines';
    const repo = memoryRepository({ players: roster, trainings: [] });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Zeď' }));
    // délky zápasů a simulace pro BO1 do 6 – poznámka u sekce
    expect(screen.getByText(/Délky kol jsou spočítané, jako by se hrálo BO1 do 6/)).toBeInTheDocument();
    // simulace: čas pro BO3 do 6 (strop 10) i BO5 do 5 (strop 8) při 40 s na gól
    expect(screen.getByText(/Délka podle formátu simulace v tréninku/)).toHaveTextContent(
      'BO3 do 6, rozhodující o 2, strop 10 = 2 vlny po 28 min (56 min); BO5 do 5, rozhodující o 2, strop 8 = 2 vlny po 34 min (68 min)',
    );
    expect(row('Simulace ligového kola')).toHaveTextContent('BO3 56 minBO5 68 min');
    // u zápasu doba míčku (výchozí) a reálná z průběhu her
    expect(within(row('Zeď')).getByLabelText('Doba míčku')).toHaveTextContent('Doba míčku 40 s (výchozí) · reálně zatím nic změřeno');
    await user.click(within(row('Zeď')).getByRole('button', { name: 'Upravit' }));
    const form = screen.getByRole('form', { name: 'Upravit Zeď' });
    await user.clear(within(form).getByLabelText('Název'));
    await user.type(within(form).getByLabelText('Název'), 'Betonová zeď');
    expect(within(form).queryByRole('button', { name: 'Delší kolo: Betonová zeď' })).toBeNull(); // délka z doby míčku
    expect(form).toHaveTextContent('Délka kola: 40 s × nejvíc 11 gólů (BO1 do 6) = 8 min');
    await user.type(within(form).getByRole('spinbutton', { name: 'Doba míčku v sekundách: Betonová zeď' }), '50');
    expect(form).toHaveTextContent('Délka kola: 50 s × nejvíc 11 gólů (BO1 do 6) = 10 min');
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
        disciplines: { wall: { name: 'Betonová zeď', ballSec: 50, skills: ['tempo', 'control', 'comeback'], help: [{ text: 'Jeden tým drží míč.' }] } },
      }),
    );

    await user.click(within(r).getByRole('button', { name: 'Upravit' }));
    await user.click(screen.getByRole('button', { name: 'Obnovit výchozí' }));
    expect(row('Zeď')).toHaveTextContent('2× 8 min');
    await vi.waitFor(() => expect(repo.snapshot().catalog).toEqual({}));
  });

  it('admin vidí reálnou dobu míčku z průběhu her a může ji použít; hráč ne (18. 11. 2026)', async () => {
    const T0 = Date.UTC(2026, 10, 17, 17, 0);
    const base: Training = {
      id: 'r', date: '2026-11-17', startTime: '18:00', mode: 'team', tables: 2, attendees: roster.map((p) => p.id), scores: {}, soloResults: {},
      simSplit: 'order', simTeams: null, format: 'custom', durationMin: 60, plan: { normal: 1 }, lockedRounds: [], breaks: [], disciplineMin: { normal: 8 },
    };
    const [m] = buildSchedule(base).matches;
    const t: Training = {
      ...base,
      scores: { [m.id]: { ga: 6, gb: 4 } },
      events: [{ id: 'e', itemId: m.id, at: T0, kind: 'goal', side: 'A', delta: 1 }],
      playTimes: { [m.id]: { startedAt: T0 - 5000, endedAt: T0 + 420_000 } }, // 420 s / 10 gólů = 42 s
    };
    window.location.hash = '#/disciplines';
    const repo = memoryRepository({ players: roster, trainings: [t] });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Normální leg' }));
    await vi.waitFor(() => expect(within(row('Normální leg')).getByLabelText('Doba míčku')).toHaveTextContent('reálně 42 s (1 zápas)'));
    await user.click(within(row('Normální leg')).getByRole('button', { name: 'Upravit' }));
    const form = screen.getByRole('form', { name: 'Upravit Normální leg' });
    expect(within(form).getByLabelText('Reálná doba míčku')).toHaveTextContent('42 s (1 zápas) · všechny zápasy 42 s (1 zápas)');
    await user.click(within(form).getByRole('button', { name: 'Použít 42 s' }));
    expect(within(form).getByRole('spinbutton', { name: 'Doba míčku v sekundách: Normální leg' })).toHaveValue(42);
    expect(form).toHaveTextContent('42 s × nejvíc 11 gólů (BO1 do 6) = 8 min');
    await user.click(within(form).getByRole('button', { name: 'Uložit' }));
    await vi.waitFor(() => expect(repo.snapshot().catalog).toEqual({ disciplines: { normal: { ballSec: 42 } } }));
    expect(within(row('Normální leg')).getByLabelText('Doba míčku')).toHaveTextContent('Doba míčku 42 s (zadaná)');
  });

  it('cvičení: doba míčku 20 s × míčky v kole; Čistá desítka jen celkový čas (18. 11. 2026)', async () => {
    window.location.hash = '#/disciplines';
    const repo = memoryRepository({ players: roster, trainings: [] });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Clearing', expanded: false })); // „Clearing“ je i štítek
    expect(screen.getByText(/Délky kol cvičení s pokusy: doba míčku × míčky v kole/)).toBeInTheDocument();
    expect(row('Clearing')).toHaveTextContent('2× 14 min20 s / míček');
    expect(within(row('Clearing')).getByLabelText('Doba míčku')).toHaveTextContent('Doba míčku 20 s (výchozí) · reálně zatím nic změřeno');
    await user.click(within(row('Clearing')).getByRole('button', { name: 'Upravit' }));
    const form = screen.getByRole('form', { name: 'Upravit Clearing' });
    expect(form).toHaveTextContent('Délka kola: 20 s × 40 míčků (2 × 20 pokusů – každý hráč 20, pak se vystřídáte) = 14 min');
    expect(within(form).queryByRole('button', { name: 'Delší kolo: Clearing' })).toBeNull();
    await user.type(within(form).getByRole('spinbutton', { name: 'Doba míčku v sekundách: Clearing' }), '15');
    expect(form).toHaveTextContent('= 10 min');
    await user.click(within(form).getByRole('button', { name: 'Uložit' }));
    await vi.waitFor(() => expect(repo.snapshot().catalog).toEqual({ disciplines: { clearing: { ballSec: 15 } } }));
    expect(row('Clearing')).toHaveTextContent('2× 10 min15 s / míček');

    // Čistá desítka: pevná délka kola, reálně celkový čas
    const streak = 'Čistá desítka – střela z trojky';
    await user.click(screen.getByRole('button', { name: streak }));
    expect(row(streak)).toHaveTextContent('10 min');
    expect(row(streak)).not.toHaveTextContent('s / míček');
    expect(within(row(streak)).getByLabelText('Celkový čas')).toHaveTextContent('Celkový čas reálně: zatím nic změřeno');
    await user.click(within(row(streak)).getByRole('button', { name: 'Upravit' }));
    expect(within(screen.getByRole('form', { name: `Upravit ${streak}` })).getByRole('button', { name: `Delší kolo: ${streak}` })).toBeInTheDocument();
  });

  it('admin nastaví délku každé disciplíny zvlášť: dobu míčku, nebo délku kola (Rozcvička, Čistá desítka)', async () => {
    window.location.hash = '#/disciplines';
    const repo = memoryRepository({ players: roster, trainings: [] });
    render(<App repo={repo} />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 1, name: 'Disciplíny' });
    const offered = offeredDisciplines();
    expect(offered.length).toBe(26);
    for (const d of offered) {
      await user.click(screen.getByRole('button', { name: d.name, expanded: false }));
      await user.click(within(row(d.name)).getByRole('button', { name: 'Upravit' }));
      const form = screen.getByRole('form', { name: `Upravit ${d.name}` });
      const ball = within(form).queryByRole('spinbutton', { name: `Doba míčku v sekundách: ${d.name}` });
      const longer = within(form).queryByRole('button', { name: `Delší kolo: ${d.name}` });
      // právě jedno: doba míčku, nebo délka kola v minutách
      expect([d.id, !!ball !== !!longer]).toEqual([d.id, true]);
      if (ball) {
        await user.clear(ball);
        await user.type(ball, '11');
      } else await user.click(longer!);
      await user.click(within(form).getByRole('button', { name: 'Uložit' }));
      await user.click(screen.getByRole('button', { name: d.name, expanded: true })); // sbalit
    }
    await vi.waitFor(() => {
      const c = repo.snapshot().catalog!.disciplines!;
      expect(Object.keys(c).sort()).toEqual(offered.map((d) => d.id).sort());
      expect(c.warmup).toEqual({ min: 10 });
      expect(c.streakShot3).toEqual({ min: 11 });
      expect(c.chain).toEqual({ ballSec: 11 });
      expect(c.normal).toEqual({ ballSec: 11 });
      expect(c.sim).toEqual({ ballSec: 11 });
    });
    // délky v řádcích se přepočítaly z nové doby míčku: Řetězec 11 s × 40 = 8 min, Normální leg 11 s × 11 = 3 min
    expect(row('Řetězec')).toHaveTextContent('8 min11 s / míček');
    expect(row('Normální leg')).toHaveTextContent('3 min11 s / míček');
    expect(row('Rozcvička')).toHaveTextContent('10 min');
    // prochází všechny disciplíny – na pomalejším CI trvá víc než výchozích 5 s
  }, 20_000);

  it('hráč dobu míčku ani reálný průměr nevidí', async () => {
    const auth = memoryAuth({ players: authPlayers, signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    window.location.hash = '#/disciplines';
    render(<App repo={memoryRepository({ players: roster, trainings: [] })} auth={auth} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Normální leg' }));
    expect(within(row('Normální leg')).queryByLabelText('Doba míčku')).toBeNull();
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
    // Šablony jsou od 21. 11. 2026 v menu účtu, ne v hlavní navigaci
    expect(within(nav).queryByRole('button', { name: 'Šablony' })).toBeNull();
    await user.click(within(nav).getByRole('button', { name: /^Účet: / }));
    await user.click(screen.getByRole('menuitem', { name: 'Šablony' }));
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
    expect(status()).toMatch(/Naplánováno \d:\d\d z 1:00.*přes o/);
    for (const name of ['Penalta z místa proti brankáři', 'Zeď', 'Start 0:3', 'Start 5:5, o 2 góly, strop 10', 'Jedničky', 'Simulace ligového kola'])
      await user.click(within(form).getByRole('checkbox', { name }));
    // 8 hráčů / 4 stoly, z doby míčku: Přihrávky 15 + Udržení 15 (20 s × 40) + Normální 9 + Daň 9 (40 s × 11) + 4:4 3 = 51; nic se nedoplňuje
    expect(status()).toBe('Naplánováno 0:51 z 1:00zbývá 9 min');
    expect(within(form).queryByRole('button', { name: 'Delší kolo: Normální leg' })).toBeNull();
    expect(within(form).queryByRole('button', { name: 'Delší kolo: Přihrávky na pětce' })).toBeNull();
    const rows = (name: string) => within(within(form).getByRole('list', { name: `Pořadí: ${name}` })).getAllByRole('listitem');
    expect(rows('Cvičení')[1]).toHaveTextContent(/0:15.*0:30.*Udržení míče na pětce/);
    // délka kola jen u Rozcvičky (a Čisté desítky); nevybraná čas šablony nemění
    await user.click(within(form).getByRole('button', { name: 'Delší kolo: Rozcvička' }));
    expect(status()).toMatch(/^Naplánováno 0:51 z 1:00/);
    // počet kol zápasu
    await user.click(within(form).getByRole('button', { name: 'Víc kol: Normální leg' }));
    expect(within(form).getByRole('status', { name: 'Počet kol: Normální leg' })).toHaveTextContent('2×');
    expect(status()).toMatch(/^Naplánováno 1:00 z 1:00/);
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
    expect(status()).toMatch(/^Naplánováno 1:10 z 1:00.*přes o 0:10/);
    const pause = within(form).getByRole('listitem', { name: 'Pauza po: Udržení míče na pětce' });
    expect(pause).toHaveTextContent(/0:30.*0:40/);
    await user.selectOptions(within(pause).getByRole('combobox', { name: 'Délka pauzy' }), '5');
    expect(status()).toBe('Naplánováno 1:05 z 1:00přes o 0:05');
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
      expect(c.disciplines).toEqual({ warmup: { min: 10 } });
    });

    // nový trénink: první šablona (1:00), přesně její kola
    window.location.hash = '#/trainings/new';
    await screen.findByRole('heading', { name: 'Přítomní' });
    for (const n of ['Dejv', 'Milan', 'Lavi', 'Luky']) await user.click(screen.getByRole('checkbox', { name: n })); // aspoň 4 hráči
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
    await user.click(within(fresh).getByRole('button', { name: 'Delší kolo: Rozcvička' }));
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
