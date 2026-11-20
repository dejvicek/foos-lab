import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { buildSchedule } from '../../domain/schedule';
import { queueOf } from '../../domain/queue';
import type { Player, Training } from '../../domain/types';
import { othersReady } from '../../test/ready';
import { memoryAuth } from '../../storage/auth';

// H1 je organizátor (zakládá a řídí tréninky v testech).
const players: Player[] = Array.from({ length: 4 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false, ...(i === 0 ? { organizer: true } : {}) }));
// 4 hráči, 2 stoly: kolo = 1 zápas dvojic na stole 1
const t: Training = {
  id: 't1', date: '2026-11-02', startTime: '18:00', mode: 'team', tables: 2, attendees: players.map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 60, plan: { normal: 3 }, lockedRounds: [], breaks: [],
};
const ids = queueOf(buildSchedule(t)).flatMap((e) => (e.kind === 'item' ? [e.id] : []));
/** Přihlášený H1 – hraje a trénink založil (organizátor). */
const organizer = () =>
  memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
const at = (h: number, m: number, s = 0) => new Date(2026, 10, 2, h, m, s).getTime();

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 18, 3));
});
afterEach(() => vi.useRealTimers());

describe('bez záložky Živě (19. 11. 2026)', () => {
  it('Živě v navigaci není; po zahájení otevře „Trénink“ probíhající trénink', async () => {
    window.location.hash = '#/ladder';
    const repo = memoryRepository({ players, trainings: [{ ...t, createdBy: 'id1', playTimes: { training: { startedAt: at(18, 0) } } }] });
    render(<App repo={repo} auth={organizer()} />);
    const user = userEvent.setup();
    const nav = await screen.findByRole('navigation', { name: 'Hlavní navigace' });
    expect(within(nav).queryByRole('button', { name: 'Živě' })).toBeNull();
    await user.click(within(nav).getByRole('button', { name: 'Tréninky' }));
    expect(window.location.hash).toBe('#/trainings/t1');
    expect(await screen.findByRole('table', { name: 'Rozpis tréninku' })).toBeInTheDocument();
    // stará adresa Živě vede na probíhající trénink
    act(() => {
      window.location.hash = '#/live';
    });
    expect(await screen.findByRole('table', { name: 'Rozpis tréninku' })).toBeInTheDocument();
  });

  it('nic neprobíhá: „Trénink“ otevře seznam tréninků', async () => {
    window.location.hash = '#/ladder';
    render(<App repo={memoryRepository({ players, trainings: [t] })} auth={organizer()} />);
    const user = userEvent.setup();
    const nav = await screen.findByRole('navigation', { name: 'Hlavní navigace' });
    await user.click(within(nav).getByRole('button', { name: 'Tréninky' }));
    expect(await screen.findByRole('list', { name: 'Uložené tréninky' })).toBeInTheDocument();
  });
});

describe('Zdržovači', () => {
  const timed: Training = {
    ...t,
    playTimes: {
      [ids[0]]: { startedAt: at(18, 2), endedAt: at(18, 10) }, // první zahájení = začátek tréninku → čekání 0, hra 8:00
      [ids[1]]: { startedAt: at(18, 12), endedAt: at(18, 19) }, // aktivní 18:10 → čekání 2:00, hra 7:00
    },
  };

  it('v tréninku: čekání a hra na hráče – v Souhrnu nahoře přepínačem Pořadí / Zdržovači (19. 11. 2026)', async () => {
    window.location.hash = '#/trainings/t1';
    render(<App repo={memoryRepository({ players, trainings: [timed] })} />);
    const summary = await screen.findByRole('region', { name: 'Souhrn' });
    expect(within(summary).getByRole('button', { name: 'Pořadí' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(summary).queryByRole('table', { name: 'Zdržovači' })).toBeNull();
    // Souhrn je nad rozpisem
    expect(summary.compareDocumentPosition(screen.getByRole('table', { name: /rozpis/i })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.setup().click(within(summary).getByRole('button', { name: 'Zdržovači' }));
    const table = screen.getByRole('table', { name: 'Zdržovači' });
    // sloupec, podle kterého se řadí, je poslední jako v ostatních žebříčcích (20. 11. 2026)
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[↕↑↓▲▼]/g, '').trim())).toEqual(['#', 'Hráč', 'Celkem', 'Hra ⌀', 'Utkání', 'Čekání ⌀']);
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('1:00'); // průměrné čekání (0 + 2:00) / 2
    expect(row).toHaveTextContent('7:30'); // průměrná hra (8 + 7) / 2
    // jen první Zdržovač: červený kroužek, šnek a „Brzda“; druhý už bez (18. 11. 2026)
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Brzda');
    expect(within(rows[1]).getByTitle('1. nejdelší čekání')).toBeInTheDocument();
    expect(rows[2]).not.toHaveTextContent('Brzda');
    expect(within(rows[2]).queryByTitle(/nejdelší čekání/)).not.toBeInTheDocument();
    expect(table.querySelectorAll('tr.shame')).toHaveLength(1);
  });

  it('v žebříčku jako třetí část', async () => {
    window.location.hash = '#/ladder';
    render(<App repo={memoryRepository({ players, trainings: [timed] })} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Zdržovači' }));
    const table = screen.getByRole('table', { name: 'Zdržovači' });
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    expect(table).toHaveTextContent('H1');
    // Tréninky jen v hlavní tabulce Zápasů (20. 11. 2026)
    expect(within(table).queryByRole('columnheader', { name: /Tréninky/ })).toBeNull();
  });

  it('řazení podle sloupce (18. 11. 2026): Brzda zůstává u oficiálního prvního, # vrátí pořadí', async () => {
    window.location.hash = '#/trainings/t1';
    render(<App repo={memoryRepository({ players, trainings: [timed] })} />);
    const user = userEvent.setup();
    await user.click(within(await screen.findByRole('region', { name: 'Souhrn' })).getByRole('button', { name: 'Zdržovači' }));
    const table = screen.getByRole('table', { name: 'Zdržovači' });
    const rows = () => within(table).getAllByRole('row').slice(1);
    const who = (r: HTMLElement) => r.querySelector('.player-link, .delay-who')!.textContent!.replace('Brzda', '');
    const brzda = rows()[0].textContent;
    const brzdaWho = who(rows()[0]);
    expect(brzda).toContain('Brzda');
    await user.click(within(table).getByRole('button', { name: 'Hráč' }));
    expect(within(table).getByRole('columnheader', { name: 'Hráč' })).toHaveAttribute('aria-sort', 'ascending');
    await user.click(within(table).getByRole('button', { name: 'Hráč' }));
    expect(within(table).getByRole('columnheader', { name: 'Hráč' })).toHaveAttribute('aria-sort', 'descending');
    const order = rows().map(who);
    expect(order).toEqual([...order].sort((x, y) => y.localeCompare(x, 'cs')));
    // Brzda je pořád u toho, kdo je oficiálně první
    expect(rows().filter((r) => r.textContent!.includes('Brzda')).map(who)).toEqual([brzdaWho]);
    await user.click(within(table).getByRole('button', { name: 'Oficiální pořadí' }));
    const first = () => rows()[0];
    expect(first().textContent).toBe(brzda);
  });
});

describe('Můj stůl: zahájení a konec ťukáním', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  const openMine = async () => {
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    window.location.hash = ''; // otevření appky: jsem na řadě → rovnou Moje hry
    // Soupeři (strana A) jsou už připravení; H1 hraje za stranu B.
    const repo = memoryRepository({ players, trainings: [{ ...t, playTimes: { training: { startedAt: at(18, 0) }, [ids[0]]: { ready: { A: at(18, 1) } } } }] });
    render(<App repo={repo} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    return { repo, mine, user: userEvent.setup() };
  };

  it('skóre jde ťukat až po připravenosti obou stran; dohraný leg čeká na potvrzení (odpočet 15 s)', async () => {
    const { repo, mine, user } = await openMine();
    expect(screen.getByRole('button', { name: 'Moje hry – jsi na řadě' })).toHaveAttribute('aria-current', 'page');
    // před zahájením jen velké Připraven a stav stran, bez zrcadla skóre (19. 11. 2026)
    const card = () => mine.querySelector('.my-card') as HTMLElement;
    // před zahájením (19. 11. 2026): v kartě „● Na řadě“, v akční zóně jen Připraven (za soupeře ne)
    expect(within(mine).queryByRole('button', { name: /^Gól vlevo/ })).toBeNull();
    expect(within(card()).getByRole('status')).toHaveTextContent('● Na řadě');
    expect(within(mine).queryByRole('button', { name: /^Potvrdit/ })).toBeNull();
    expect(within(mine).queryByRole('button', { name: /^Připraven: / })).toBeNull();
    expect(mine).not.toHaveTextContent('aktivní od');
    await user.click(within(mine).getByRole('button', { name: 'Připraven' }));
    // hraje se: v kartě „● Hraje se“ a čas, zrcadlo; konec jde potvrdit i předčasně
    expect(within(card()).getByRole('status')).toHaveTextContent('● Hraje se');
    expect(within(mine).getByRole('button', { name: 'Potvrdit konec' })).toBeInTheDocument();
    expect(within(mine).queryByLabelText('Zahájeno')).toBeNull(); // časy se ručně neupravují
    for (let i = 0; i < 6; i++) await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    // dohráno: v kartě „Dohráno“ + Opravit, v zóně jen Potvrdit konec s odpočtem
    expect(within(card()).getByRole('status')).toHaveTextContent(/^DohránoOpravit$/);
    expect(mine).toHaveTextContent('Utkání skončí samo za 15 s.');
    expect(within(mine).getAllByRole('button', { name: 'Potvrdit konec' })).toHaveLength(1);
    expect(within(mine).queryByRole('button', { name: /^Gól vlevo/ })).toBeNull();
    expect(repo.snapshot().trainings[0].playTimes?.[ids[0]]?.endedAt).toBeUndefined();
    await user.click(within(mine).getByRole('button', { name: 'Potvrdit konec' }));
    await vi.waitFor(() => {
      const pt = repo.snapshot().trainings[0].playTimes?.[ids[0]];
      expect(pt?.startedAt).toBe(at(18, 3)); // začátek = připravenost poslední strany
      expect(pt?.ready).toEqual({ A: at(18, 1), B: at(18, 3) });
      expect(pt?.endedAt).toBe(at(18, 3));
    });
  });

  it('vlastní strana připravená, soupeř ne: skóre ještě nejde, připravenost jde zrušit', async () => {
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    window.location.hash = '';
    const repo = memoryRepository({ players, trainings: [{ ...t, playTimes: { training: { startedAt: at(18, 0) } } }] });
    render(<App repo={repo} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    const user = userEvent.setup();
    await user.click(within(mine).getByRole('button', { name: 'Připraven' }));
    // v kartě „● Na řadě · čeká se na soupeře (jména)“ a ✓ zrušit; akční zóna prázdná (19. 11. 2026)
    expect(within(mine.querySelector('.my-card') as HTMLElement).getByRole('status')).toHaveTextContent(/^● Na řadě · čeká se na soupeře \(H\d \+ H\d\)✓ zrušit$/);
    expect(within(mine).queryByRole('button', { name: /^Připraven/ })).toBeNull();
    expect(within(mine).queryByRole('button', { name: /^Gól vlevo/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Moje hry' })).toBeInTheDocument(); // tečka zmizela, čeká se na soupeře
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].playTimes?.[ids[0]]).toEqual({ ready: { B: at(18, 3) } }));
    await user.click(within(mine).getByRole('button', { name: 'Zrušit připravenost: H4 + H1' }));
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].playTimes?.[ids[0]]).toBeUndefined());
  });

  it('dohraný leg bez potvrzení skončí sám 15 s po posledním ťuknutí; oprava výsledku odpočet zastaví (10. 11. 2026)', async () => {
    const { repo, mine, user } = await openMine();
    await user.click(within(mine).getByRole('button', { name: 'Připraven' }));
    for (let i = 0; i < 6; i++) await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    // oprava přes „Opravit“ v kartě (19. 11. 2026), −1 gól přes Zpět: leg už není dohraný, odpočet zmizí
    await user.click(within(mine.querySelector('.my-card') as HTMLElement).getByRole('button', { name: 'Opravit' }));
    await user.click(within(mine).getAllByRole('button', { name: /^Ubrat gól/ })[0]); // levá strana
    expect(mine).not.toHaveTextContent('skončí samo');
    vi.setSystemTime(at(18, 4)); // poslední ťuknutí v 18:04
    await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    expect(mine).toHaveTextContent('Utkání skončí samo za 15 s');
    vi.setSystemTime(at(18, 4) + 16_000);
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].playTimes?.[ids[0]]?.endedAt).toBe(at(18, 4) + 15_000), { timeout: 6000 });
    // utkání skončilo → Moje hry přejde na další kolo, odpočet zmizí
    await vi.waitFor(() => expect(screen.getByRole('region', { name: 'Moje kolo' })).not.toHaveTextContent('skončí samo'));
  });

  it('před zahájením jen Připraven (19. 11. 2026); po připravenosti zrcadlo skóre; nadpis kola s průběhem a startem', async () => {
    const { mine, user } = await openMine();
    const tl = within(mine).getByRole('group', { name: 'Kolo 1 z 3, 0 odehraných, zbývá 2 kola, žádná další pauza' });
    expect(within(mine).getByRole('heading', { level: 2 })).toHaveTextContent('Normální leg');
    expect(mine.querySelector('.my-card')).not.toHaveTextContent(/Kolo \d+ z/); // jen na časové ose (19. 11. 2026)
    expect(mine.querySelector('.tile-goal')).toHaveTextContent('do 6'); // do kolika se hraje: v hlavičce vpravo (19. 11. 2026)
    expect(mine).not.toHaveTextContent('Hraje se do 6');
    // jako dlaždice v Rozpisu (19. 11. 2026): stůl jen jednou – velké číslo u zápasu
    expect(mine.textContent).not.toMatch(/stůl \d/); // dřív „ZÁPAS · STŮL 1“ a „H1: stůl 1, s … proti …“
    expect(within(mine).getByRole('group', { name: /^H2 \+ H3 vs H4 \+ H1/ })).toBeInTheDocument();
    // klik na kolo v časové ose ho otevře
    await user.click(within(tl).getByRole('button', { name: /^3\. kolo:/ }));
    expect(within(mine).getByRole('group', { name: /^Kolo 3 z 3,/ })).toBeInTheDocument();
    await user.click(within(mine).getByRole('button', { name: /^1\. kolo:/ }));
    expect(mine.querySelector('.mirror-stage')).toBeNull();
    expect(within(mine).queryByRole('group', { name: 'Průběh' })).toBeNull();
    // nápověda: otazník v hlavičce karty, obsah pod řádkem se stolem; sbalená nápověda pod zápisem není (19. 11. 2026)
    expect(mine.querySelector('details.help')).toBeNull();
    const q = within(mine).getByRole('button', { name: 'Nápověda' });
    expect(q).toHaveAttribute('aria-expanded', 'false');
    await user.click(q);
    const helpBox = within(mine.querySelector('.my-card') as HTMLElement).getByRole('region', { name: 'Nápověda' });
    expect(helpBox).toHaveTextContent('Leg do 6 bez dalších pravidel.');
    expect(within(helpBox).queryByRole('heading', { name: 'Normální leg' })).toBeNull(); // název je v hlavičce karty
    expect(within(helpBox).getByRole('heading', { name: 'Role rozhodčího' })).toBeInTheDocument();
    await user.click(q);
    expect(within(mine).queryByRole('region', { name: 'Nápověda' })).toBeNull();
    await user.click(within(mine).getByRole('button', { name: 'Připraven' }));
    expect(within(mine).getByRole('button', { name: /^Gól vlevo/ })).toBeEnabled();
  });

  it('po konci zůstane dohrané kolo (výsledek, Průběh) a lišta Další kolo nabídne Otevřít (19. 11. 2026)', async () => {
    const { mine, user } = await openMine();
    // osa: barva podle skutečnosti, vyšší dílek = kolo, které hraju / je na řadě, zobrazené kolo jen ▼
    const seg = (n: number) => within(mine).getByRole('button', { name: new RegExp(`^${n}\\. kolo:`) });
    const cls = () => [1, 2, 3].map((n) => ['done', 'cur', 'live'].filter((c) => seg(n).classList.contains(c)).join('+'));
    await user.click(within(mine).getByRole('button', { name: 'Připraven' }));
    expect(cls()).toEqual(['cur+live', '', '']);
    for (let i = 0; i < 6; i++) await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    await user.click(within(mine).getByRole('button', { name: 'Potvrdit konec' }));
    expect(cls()).toEqual(['done+cur', 'live', '']);
    await user.click(seg(3));
    expect(cls()).toEqual(['done', 'live', 'cur']);
    await user.click(seg(1));
    const card = () => mine.querySelector('.my-card') as HTMLElement;
    expect(within(card()).getByRole('status')).toHaveTextContent('✓ Dohráno · prohráli jste'); // H1 hraje vpravo
    expect(within(mine).getByRole('group', { name: /^Kolo 1 z 3,/ })).toBeInTheDocument();
    // lišta Další kolo pod osou: na řadě → Otevřít
    const bar = mine.querySelector('.next-bar.ready') as HTMLElement;
    expect(bar).toHaveTextContent('Na řadě');
    const open = within(bar).getByRole('button', { name: /^Otevřít 2\. kolo: Normální leg/ });
    expect(open).toHaveTextContent(/^Otevřít$/);
    expect(open).toHaveClass('link');
    // nápověda dalšího kola: otazník v hlavičce karty
    await user.click(within(bar).getByRole('button', { name: /nápověd/i }));
    expect(within(bar).getByRole('region', { name: 'Nápověda: Další kolo' })).toBeInTheDocument();
    expect(within(mine).queryByRole('button', { name: /^Gól vlevo/ })).toBeNull();
    // Průběh dohrané hry rovnou rozbalený, jen křivka
    const prog = within(mine).getByRole('group', { name: 'Průběh' });
    expect(within(prog).getByRole('img', { name: 'Křivka vedení, konečný stav 6:0' })).toBeInTheDocument();
    // Opravit v kartě ukáže zrcadlo; lišta zůstává
    await user.click(within(card()).getByRole('button', { name: 'Opravit' }));
    expect(within(mine).getByRole('button', { name: /^Gól vlevo/ })).toBeInTheDocument();
    expect(within(mine).getByRole('button', { name: /^Otevřít 2\. kolo/ })).toBeInTheDocument();
    await user.click(within(mine).getByRole('button', { name: /^Otevřít 2\. kolo/ }));
    expect(within(mine).getByRole('group', { name: /^Kolo 2 z 3,/ })).toBeInTheDocument();
    expect(within(mine).getByRole('button', { name: 'Připraven' })).toBeInTheDocument();
    expect(mine.querySelector('.next-bar')).toBeNull();
    // šipkou zpět: dohrané kolo s výsledkem a Průběhem; lišta ukazuje kolo na řadě
    await user.click(within(mine).getByRole('button', { name: 'Předchozí kolo' }));
    expect(within(mine).getByRole('group', { name: /^Kolo 1 z 3,/ })).toBeInTheDocument();
    expect(within(mine).getByRole('group', { name: 'Průběh' })).toBeInTheDocument();
    expect(within(card()).getByRole('status')).toHaveTextContent('✓ Dohráno');
  });
});

describe('pauza v Trénink tabu', () => {
  const paused: Training = {
    ...t,
    breaks: [{ after: 1, min: 10 }],
    playTimes: { training: { startedAt: at(18, 0) }, [ids[0]]: { startedAt: at(18, 0), endedAt: at(18, 2) } },
  };

  it('Zahájit pauzu / Spustit další kolo jsou v řádku pauzy, ne v liště nahoře', async () => {
    window.location.hash = '#/trainings/t1';
    const repo = memoryRepository({ players, trainings: [{ ...paused, createdBy: 'id1' }] });
    render(<App repo={repo} auth={organizer()} />);
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.queryByRole('status')).toBeNull();
    const start = screen.getByRole('button', { name: 'Zahájit pauzu' });
    const row = start.closest('tr')!;
    expect(row).toHaveClass('break-row');
    expect(within(row).getByRole('button', { name: 'Spustit další kolo' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Odebrat pauzu' })).toBeInTheDocument();
    await user.click(start);
    const running = screen.getByRole('button', { name: 'Spustit další kolo hned' }).closest('tr')!;
    expect(running).toHaveTextContent('zbývá 10:00');
    // zahájená pauza: délka jde změnit, přesun ani odebrání ne
    expect(within(running).queryByRole('button', { name: 'Odebrat pauzu' })).toBeNull();
    expect(within(running).queryByRole('button', { name: 'Přesunout pauzu' })).toBeNull();
    expect(running).not.toHaveAttribute('draggable', 'true');
    await user.selectOptions(within(running).getByRole('combobox', { name: 'Délka pauzy' }), '15');
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].breaks).toEqual([{ after: 1, min: 15 }]));
    expect(screen.getByRole('button', { name: 'Spustit další kolo hned' }).closest('tr')).toHaveTextContent('zbývá 15:00');
    await user.click(screen.getByRole('button', { name: 'Spustit další kolo hned' }));
    // (čekání na uložení délky výše posunulo falešné hodiny o pár ms)
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].playTimes?.['pause|0']).toEqual({ startedAt: at(18, 3), endedAt: expect.any(Number) }));
    expect(screen.queryByRole('button', { name: /Spustit další kolo/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Odebrat pauzu' })).toBeNull();
  });

  it('hráč (ne organizátor) vidí u pauzy, že další kolo spustí organizátor', async () => {
    window.location.hash = '#/trainings/t1';
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    render(<App repo={memoryRepository({ players, trainings: [{ ...paused, createdBy: 'id1' }] })} auth={auth} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.queryByRole('button', { name: 'Zahájit pauzu' })).toBeNull();
    expect(screen.getByText(/další kolo spustí organizátor/).closest('tr')).toHaveClass('break');
  });
});

describe('otevření appky', () => {
  it('běží trénink, ale nejsem na řadě (pauza) → rozpis probíhajícího tréninku; nic neběží → seznam tréninků', async () => {
    const paused: Training = {
      ...t,
      breaks: [{ after: 1, min: 10 }],
      playTimes: { training: { startedAt: at(18, 0) }, [ids[0]]: { startedAt: at(18, 0), endedAt: at(18, 2) } },
    };
    window.location.hash = '';
    const { unmount } = render(<App repo={memoryRepository({ players, trainings: [paused] })} auth={organizer()} />);
    expect(await screen.findByRole('table', { name: 'Rozpis tréninku' })).toBeInTheDocument();
    unmount();
    window.location.hash = '';
    render(<App repo={memoryRepository({ players, trainings: [t] })} auth={organizer()} />);
    expect(await screen.findByRole('list', { name: 'Uložené tréninky' })).toBeInTheDocument();
  });
});

describe('organizátor, který nehraje', () => {
  it('po otevření appky vidí rozpis probíhajícího tréninku a zapisuje tužkou; Moje hry v navigaci nemá', async () => {
    const auth = memoryAuth({ players: [{ id: 'org', name: 'Org' }], signedIn: { playerId: 'org', isAdmin: false, mustChangePassword: false } });
    const run: Training = { ...t, createdBy: 'org', playTimes: { training: { startedAt: at(18, 0) } } };
    window.location.hash = '';
    render(<App repo={memoryRepository({ players: [...players, { id: 'org', name: 'Org', order: 9, archived: false, organizer: true }], trainings: [run] })} auth={auth} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    const nav = screen.getByRole('navigation', { name: 'Hlavní navigace' });
    expect(within(nav).getByRole('button', { name: 'Tréninky' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('button', { name: /^Moje hry/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Zapsat: 1\. kolo, stůl 1$/ })).toBeInTheDocument();
  });
});

describe('hráč hlásí připravenost jen v Moje hry', () => {
  it('v rozpisu Připraven není; v Moje hry ano', async () => {
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id2', isAdmin: false, mustChangePassword: false } });
    const run: Training = { ...t, createdBy: 'id1', playTimes: { training: { startedAt: at(18, 0) } } };
    window.location.hash = '#/trainings/t1';
    render(<App repo={memoryRepository({ players, trainings: [run] })} auth={auth} />);
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    // rozpis je pro hráče jen ke čtení: bez zápisu i bez Připraven
    expect(screen.queryByRole('button', { name: /^(Zapsat|Opravit|Zavřít): / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Připraven/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Moje hry/ }));
    const mine = screen.getByRole('region', { name: 'Moje kolo' });
    await user.click(within(mine).getByRole('button', { name: 'Připraven' }));
    expect(within(mine.querySelector('.my-card') as HTMLElement).getByRole('status')).toHaveTextContent('čeká se na soupeře');
  });
});

describe('připravenost u cvičení (18. 11. 2026)', () => {
  it('admin hlásí za oba: po prvním proužek ukáže, na koho se čeká, a zrušení u připraveného (19. 11. 2026)', async () => {
    const auth = memoryAuth({ players: players.map((p, i) => ({ id: p.id, name: p.name, isAdmin: i === 0 })), signedIn: { playerId: 'id1', isAdmin: true, mustChangePassword: false } });
    const drill: Training = { ...t, plan: { warmupPasses: 1 }, playTimes: { training: { startedAt: at(18, 0) } } };
    window.location.hash = '#/my-games';
    render(<App repo={memoryRepository({ players, trainings: [drill] })} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    const user = userEvent.setup();
    const btns = within(mine).getAllByRole('button', { name: /^Připraven: / });
    expect(btns).toHaveLength(2);
    const other = btns.map((b) => b.getAttribute('aria-label')!.slice('Připraven: '.length)).find((n) => n !== 'H1')!;
    await user.click(within(mine).getByRole('button', { name: 'Připraven: H1' }));
    const status = within(mine.querySelector('.my-card') as HTMLElement).getByRole('status');
    expect(status).toHaveTextContent(`● Na řadě · čeká se na hráče (${other})✓ zrušit H1`);
    expect(within(mine).getByRole('button', { name: `Připraven: ${other}` })).toBeInTheDocument();
  });

  it('každý hráč skupiny se hlásí sám za sebe; cvičení začne, až jsou připravení všichni', async () => {
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    const drill: Training = { ...t, plan: { warmupPasses: 1 }, playTimes: { training: { startedAt: at(18, 0) } } };
    const repo = memoryRepository({ players, trainings: [drill] });
    window.location.hash = '#/my-games';
    render(<App repo={repo} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    const user = userEvent.setup();
    expect(within(mine).getAllByRole('button', { name: /^Připraven/ })).toHaveLength(1); // jen za sebe
    await user.click(within(mine).getByRole('button', { name: 'Připraven' }));
    // cvičení: čeká se na ostatní hráče jménem (19. 11. 2026)
    expect(within(mine.querySelector('.my-card') as HTMLElement).getByRole('status')).toHaveTextContent(/^● Na řadě · čeká se na hráče \(H\d\)✓ zrušit$/);
    await othersReady(repo);
    await vi.waitFor(() => expect(within(mine.querySelector('.my-card') as HTMLElement).getByRole('status')).toHaveTextContent('● Hraje se'));
    expect(within(mine).getByRole('button', { name: 'Potvrdit konec' })).toBeInTheDocument();
  });
});

describe('Moje hry otevře rozehranou hru', () => {
  it('1. kolo dohrané → otevře se 2. kolo, které je na řadě', async () => {
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    const run: Training = { ...t, playTimes: { training: { startedAt: at(18, 0) }, [ids[0]]: { startedAt: at(18, 0), endedAt: at(18, 2) } } };
    window.location.hash = '#/my-games';
    render(<App repo={memoryRepository({ players, trainings: [run] })} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    expect(within(mine).getByRole('group', { name: /^Kolo 2 z/ })).toBeInTheDocument();
    expect(within(mine).getByRole('button', { name: 'Připraven' })).toBeInTheDocument();
  });

  it('nic není na řadě (pauza), podle hodin po konci: otevře se poslední dohrané kolo a lišta Další kolo čeká na pauzu (19. 11. 2026)', async () => {
    vi.setSystemTime(new Date(2026, 10, 2, 21, 30)); // plánovaný rozpis dávno skončil, reálně se hraje pozadu
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    const paused: Training = {
      ...t,
      breaks: [{ after: 1, min: 10 }],
      playTimes: { training: { startedAt: at(21, 0) }, [ids[0]]: { startedAt: at(21, 0), endedAt: at(21, 8) } },
    };
    window.location.hash = '#/my-games';
    render(<App repo={memoryRepository({ players, trainings: [paused] })} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    expect(within(mine).getByRole('group', { name: /^Kolo 1 z 3/ })).toBeInTheDocument();
    expect(mine.querySelector('.next-bar.wait')).toHaveTextContent('Čeká se na pauzu – spustí ji organizátor');
    // další kolo čeká: vyšší dílek má ono (světle, „waits“), dohrané kolo 1 jen plnou barvou; přepnutí posune jen šipku
    const seg = (n: number) => within(mine).getByRole('button', { name: new RegExp(`^${n}\\. kolo:`) });
    expect(seg(1)).toHaveClass('done', 'cur');
    expect(seg(1)).not.toHaveClass('live');
    expect(seg(2)).toHaveClass('live', 'waits');
    await userEvent.setup().click(seg(2));
    expect(seg(1)).not.toHaveClass('cur');
    expect(seg(2)).toHaveClass('cur', 'live', 'waits');
  });
});

describe('osa v Moje hry: odehrané kolo (19. 11. 2026)', () => {
  it('moje utkání skončilo, na druhém stole se ještě hraje: kolo je na ose plné (v Tréninku ne)', async () => {
    const eight: Player[] = Array.from({ length: 8 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
    const base: Training = { ...t, attendees: eight.map((p) => p.id), plan: { normal: 2 } };
    const row = buildSchedule(base).sections.flatMap((x) => x.rows).find((r) => r.kind !== 'break')!;
    const ms = row.cells.flatMap((c) => (c?.type === 'match' ? [c.match] : []));
    expect(ms).toHaveLength(2);
    const mine = ms.find((m) => [...m.sideA, ...m.sideB].includes('id1'))!;
    const other = ms.find((m) => m !== mine)!;
    const tr: Training = {
      ...base,
      scores: { [mine.id]: { ga: 6, gb: 2 } },
      playTimes: { training: { startedAt: at(18, 0) }, [mine.id]: { startedAt: at(18, 0), endedAt: at(18, 2) }, [other.id]: { startedAt: at(18, 0) } },
    };
    const auth = memoryAuth({ players: eight.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    window.location.hash = '#/my-games';
    render(<App repo={memoryRepository({ players: eight, trainings: [tr] })} auth={auth} />);
    const region = await screen.findByRole('region', { name: 'Moje kolo' });
    expect(within(region).getByRole('button', { name: /^1\. kolo:/ })).toHaveClass('done');
    expect(within(region).getByRole('button', { name: /^2\. kolo:/ })).not.toHaveClass('done');
  });
});

describe('průběh hry', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it('ťukání se ukládá jako události; Průběh ukáže góly v pořadí, Zpět událost zruší', async () => {
    const auth = memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name })), signedIn: { playerId: 'id1', isAdmin: false, mustChangePassword: false } });
    const repo = memoryRepository({ players, trainings: [{ ...t, playTimes: { training: { startedAt: at(18, 0) }, [ids[0]]: { ready: { A: at(18, 1) } } } }] });
    window.location.hash = '#/my-games';
    render(<App repo={repo} auth={auth} />);
    const mine = await screen.findByRole('region', { name: 'Moje kolo' });
    const user = userEvent.setup();
    await user.click(within(mine).getByRole('button', { name: 'Připraven' }));
    await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    await user.click(within(mine).getByRole('button', { name: /^Gól vpravo/ }));
    await user.click(within(mine).getByRole('button', { name: /^Gól vlevo/ }));
    await user.click(within(mine).getByRole('button', { name: /Zpět/ }));
    // Moje hry: během hry bez grafu – Průběh až po dohrání (19. 11. 2026)
    expect(within(mine).queryByRole('group', { name: 'Průběh' })).toBeNull();
    // Trénink: ikonka u stolu s ťukanými góly, Průběh pod kolem
    act(() => {
      window.location.hash = '#/trainings/t1';
    });
    await user.click(await screen.findByRole('button', { name: /^Průběh hry: 1\. kolo, stůl 1$/ }));
    expect(screen.getByRole('img', { name: 'Křivka vedení, konečný stav 1:1' })).toBeInTheDocument();
    // křivka: góly v pořadí (zrušený třetí gól tam není)
    expect([...document.querySelectorAll('.tl-pt title')].map((x) => x.textContent?.replace(/ v \d+:\d+/, ''))).toEqual(['Gól: H2 + H3 → 1:0', 'Gól: H4 + H1 → 1:1']);
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].events?.map((e) => [e.kind, e.side, e.delta])).toEqual([
      ['goal', 'A', 1], ['goal', 'B', 1], ['goal', 'A', 1], ['goal', 'A', -1],
    ]));
  });
});
