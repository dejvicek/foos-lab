import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player, Training } from '../../domain/types';
import { next, openSettings, saveSettings } from '../../test/wizard';

const NAMES = ['Ada', 'Bára', 'Cyril', 'Dan', 'Eva', 'Filip', 'Gita', 'Hugo'];
const players = (n: number): Player[] => NAMES.slice(0, n).map((name, order) => ({ id: `p${order + 1}`, name, order, archived: false }));
const checkbox = (name: string) => screen.getByRole('checkbox', { name });

afterEach(() => vi.restoreAllMocks());

describe('stránka Trénink', () => {
  it('Přítomní při zakládání: hráči podle abecedy, ne podle pořadí v soupisce', async () => {
    const roster: Player[] = ['Filip', 'Čeněk', 'Ada', 'Bára'].map((name, order) => ({ id: `q${order}`, name, order, archived: false }));
    window.location.hash = '#/trenink/novy';
    render(<App repo={memoryRepository({ players: roster, trainings: [] })} />);
    await screen.findByRole('heading', { name: 'Přítomní' });
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Ada', 'Bára', 'Čeněk', 'Filip']);
  });

  it('nový trénink: začátek předvyplněný podle aktuálního času zaokrouhleného na 30 min nahoru; jde i na 1 stůl', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 2, 18, 7));
    const user = userEvent.setup();
    const repo = memoryRepository({ players: players(6), trainings: [] });
    window.location.hash = '#/trenink/novy';
    render(<App repo={repo} />);
    await user.click(await screen.findByRole('checkbox', { name: 'Ada' }));
    await next(user);
    expect(screen.getByLabelText('Začátek')).toHaveValue('18:30');
    await user.click(screen.getByRole('radio', { name: '1 stůl' }));
    expect(screen.getByRole('radio', { name: '1 stůl' })).toBeChecked();
    vi.useRealTimers();
  });

  it('nový trénink v krocích: přítomní (přidat hráče), kdy, kde a disciplíny, Zahájit trénink; další převezme stoly, délku dá šablona', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players: players(6), trainings: [] });
    window.location.hash = '#/trenink';
    render(<App repo={repo} />);

    expect(await screen.findByText('Zatím žádný trénink. Začni tlačítkem Nový trénink.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nový trénink' }));
    expect(screen.getByRole('heading', { name: 'Přítomní' })).toBeInTheDocument();
    const bar = () => screen.getByRole('status', { name: 'Přítomní' });
    expect(bar()).toHaveTextContent(/^0 přítomných/);
    for (const n of NAMES.slice(0, 6)) expect(checkbox(n)).not.toBeChecked();
    expect(screen.getByText(/Ještě chybí 1 hráč do minima 1./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Další:/ })).toBeDisabled(); // bez hráčů dál nejde

    for (const n of ['Ada', 'Bára', 'Cyril', 'Dan']) await user.click(checkbox(n));
    expect(bar()).toHaveTextContent('4 přítomníAda, Bára, Cyril, Dan');
    expect(screen.queryByText(/Ještě chybí/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Jméno nového hráče'), 'Nový');
    await user.click(screen.getByRole('button', { name: 'Přidat a zaškrtnout' }));
    expect(checkbox('Nový')).toBeChecked();
    expect(repo.snapshot().trainings).toEqual([]); // zatím nic uloženo
    await next(user);

    expect(screen.getByRole('heading', { name: 'Kdy, kde a disciplíny' })).toBeInTheDocument();
    // délka posuvníkem, stoly linkou se 4 tečkami (1–4)
    fireEvent.change(screen.getByRole('slider', { name: 'Délka tréninku' }), { target: { value: '120' } });
    expect(screen.getByText('2:00', { selector: 'output' })).toBeInTheDocument();
    const tables = within(screen.getByRole('radiogroup', { name: 'Počet stolů' })).getAllByRole('radio');
    expect(tables.map((r) => r.getAttribute('value'))).toEqual(['1', '2', '3', '4']);
    await user.click(screen.getByRole('radio', { name: '2 stoly' }));

    while (screen.queryByRole('button', { name: /^Další:/ })) await next(user);
    expect(screen.getByRole('button', { name: /Přítomní \(5\)/ })).toBeInTheDocument(); // v liště kroků
    await user.click(screen.getByRole('button', { name: 'Zahájit trénink' }));
    expect(await screen.findByRole('table', { name: 'Rozpis tréninku' })).toBeInTheDocument();
    await vi.waitFor(() => {
      const [t] = repo.snapshot().trainings;
      expect(t).toMatchObject({ durationMin: 120, tables: 2 });
      expect(t.attendees).toHaveLength(5);
      expect(t.playTimes?.training?.startedAt).toBeTypeOf('number'); // trénink rovnou zahájený
    });

    await user.click(screen.getByRole('button', { name: 'Hráči' }));
    expect(within(screen.getByRole('list', { name: 'Aktivní hráči' })).getByText('Nový')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trénink' }));
    await user.click(screen.getByRole('button', { name: 'Nový trénink' }));
    await user.click(checkbox('Ada'));
    await next(user);
    expect(screen.getByRole('slider', { name: 'Délka tréninku' })).toHaveValue('180'); // délka ze šablony (9. 11. 2026)
    expect(screen.getByRole('radio', { name: '2 stoly' })).toBeChecked();
  });

  it('změna přítomných, která smaže skóre, se při uložení ptá; při zrušení se nic nezmění', async () => {
    const user = userEvent.setup();
    const t: Training = {
      id: 't1',
      date: '2026-10-31', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [],
      mode: 'team',
      tables: 4,
      attendees: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      scores: { 'league|1|1|p1+p2vp3+p4': { ga: 6, gb: 2 } },
    };
    const repo = memoryRepository({ players: players(8), trainings: [t] });
    window.location.hash = '#/trenink/t1';
    render(<App repo={repo} />);

    await openSettings(user, 'Přítomní');
    await user.click(checkbox('Ada'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await saveSettings(user);
    expect(confirmSpy).toHaveBeenCalledWith('Změna smaže skóre u 1 zápasu. Pokračovat?');
    expect(repo.snapshot().trainings[0].attendees).toContain('p1');

    confirmSpy.mockReturnValue(true);
    await saveSettings(user);
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].scores).toEqual({}));
    expect(repo.snapshot().trainings[0].attendees).not.toContain('p1');
    expect(screen.getByRole('button', { name: 'Upravit nastavení' })).toBeInTheDocument(); // zpět na tréninku
  });

  it('archivovaný hráč zůstane ve starém tréninku zaškrtnutý', async () => {
    const ps = players(4);
    ps[0].archived = true;
    const t: Training = { id: 't1', date: '2026-10-31', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [], mode: 'team', tables: 4, attendees: ['p1', 'p2', 'p3', 'p4'], scores: {} };
    window.location.hash = '#/trenink/t1';
    render(<App repo={memoryRepository({ players: ps, trainings: [t] })} />);
    await openSettings(userEvent.setup(), 'Přítomní');
    expect(screen.getByRole('checkbox', { name: /Ada/ })).toBeChecked();
  });

  it('neexistující trénink', async () => {
    window.location.hash = '#/trenink/nic';
    render(<App repo={memoryRepository()} />);
    expect(await screen.findByText('Trénink nenalezen.')).toBeInTheDocument();
  });
});

describe('Přítomní a docházka (10. 11. 2026)', () => {
  const roster = players(6);
  const past = (id: string, date: string, attendees: string[]): Training => ({
    id, date, startTime: '18:00', mode: 'team', tables: 4, attendees, scores: {}, soloResults: {}, simSplit: 'order', simTeams: null,
    format: 'custom', durationMin: 120, plan: { normal: 2 }, lockedRounds: [],
  });
  // dnes 10. 11. 2026; poslední trénink 4. 11. (Ada, Bára, Cyril, Dan)
  const trainings = [past('t1', '2026-10-01', ['p1', 'p5']), past('t2', '2026-10-28', ['p1', 'p2']), past('t3', '2026-11-04', ['p1', 'p2', 'p3', 'p4'])];
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 10, 17, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('skupiny Minule byli / Ostatní, docházka u jména, Jako minule, Nikdo, hledání', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/trenink/novy';
    render(<App repo={memoryRepository({ players: roster, trainings })} />);
    const lastGroup = await screen.findByRole('region', { name: 'Minule byli' });
    expect(within(lastGroup).getByRole('heading')).toHaveTextContent('Minule byli · 4. 11.4');
    expect(within(lastGroup).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Ada', 'Bára', 'Cyril', 'Dan']);
    const rest = screen.getByRole('region', { name: 'Ostatní' });
    expect(within(rest).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Eva', 'Filip']);
    // docházka: Ada 3× celkem, za 28 dní 2× (28. 10. a 4. 11.); Eva naposledy 1. 10.; Filip nikdy
    expect(checkbox('Ada').closest('label')).toHaveTextContent('naposledy 4. 11. · 2× za 28 dní');
    expect(checkbox('Eva').closest('label')).toHaveTextContent('naposledy 1. 10. · 0× za 28 dní');
    expect(checkbox('Filip').closest('label')).toHaveTextContent('zatím nebyl');
    const bar = () => screen.getByRole('status', { name: 'Přítomní' });
    await user.click(screen.getByRole('button', { name: 'Jako minule (4)' }));
    expect(bar()).toHaveTextContent('4 přítomníAda, Bára, Cyril, Dan');
    await user.click(checkbox('Filip'));
    expect(bar()).toHaveTextContent('5 přítomnýchAda, Bára, Cyril, Dan, Filip');
    await user.click(screen.getByRole('button', { name: 'Nikdo' }));
    expect(bar()).toHaveTextContent(/^0 přítomných/);
    await user.type(screen.getByRole('searchbox', { name: 'Hledat hráče' }), 'ev');
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Eva']);
  });

  it('stránka Hráči ukazuje docházku: naposledy, za 28 dní, celkem', async () => {
    window.location.hash = '#/hraci';
    render(<App repo={memoryRepository({ players: roster, trainings })} />);
    const list = await screen.findByRole('list', { name: 'Aktivní hráči' });
    const row = (name: string) => within(list).getByText(name).closest('li')!;
    expect(row('Ada')).toHaveTextContent('naposledy 4. 11. · 2× za 28 dní · celkem 3×');
    expect(row('Eva')).toHaveTextContent('naposledy 1. 10. · 0× za 28 dní · celkem 1×');
    expect(row('Filip')).toHaveTextContent('zatím nebyl');
  });
});
