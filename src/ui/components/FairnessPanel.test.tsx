import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { memoryAuth } from '../../storage/auth';
import type { Player, Training } from '../../domain/types';
import { discView, openSettings, saveSettings } from '../../test/wizard';

// H2 je organizátor a zakladatel tréninku.
const players: Player[] = Array.from({ length: 6 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false, ...(i === 1 ? { organizer: true } : {}) }));
const t: Training = {
  id: 't1', date: '2026-11-03', startTime: '18:00', mode: 'team', tables: 4, attendees: players.map((p) => p.id),
  scores: {}, soloResults: {}, simSplit: 'performance', simTeams: null, format: 'custom', durationMin: 180,
  plan: { normal: 1, wall: 2, start03: 2 }, lockedRounds: [], breaks: [], createdBy: 'id2',
};
const auth = (isAdmin: boolean, playerId = 'id1') =>
  memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name, isAdmin: p.id === playerId && isAdmin })), signedIn: { playerId, isAdmin, mustChangePassword: false } });

beforeEach(() => {
  window.location.hash = '#/trenink/t1';
});

describe('kontrola rozpisu v nastavení tréninku', () => {
  it('v kroku Disciplíny spoluhráči a soupeři, nápověda kolik kol přidat a tlačítko, které je přidá', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players, trainings: [t] });
    render(<App repo={repo} auth={auth(true)} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.queryByText('Kontrola rozpisu: kdo s kým kolikrát')).toBeNull(); // už ne v rozpisu
    await openSettings(user, 'Kdy, kde a disciplíny');
    await discView(user, 'Kdo s kým');
    const mates = screen.getByRole('table', { name: 'Spoluhráči: kolikrát spolu ve dvojici' });
    expect(within(mates).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    expect(screen.getByRole('table', { name: 'Soupeři: kolikrát proti sobě' })).toBeInTheDocument();
    const hint = screen.getByRole('region', { name: 'Co přidat, aby hrál každý s každým' });
    expect(hint).toHaveTextContent(/dvojic\w? spolu nehraj/);
    const add = within(hint).getByRole('button', { name: /^Přidat \d+× Normální leg \(spolu\)$/ });
    const k = Number(add.textContent!.match(/\d+/)![0]);
    await user.click(add);
    expect(screen.getByRole('region', { name: 'Co přidat, aby hrál každý s každým' })).toHaveTextContent('Spolu: každý s každým hraje aspoň jednou.');
    await saveSettings(user);
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].plan.normal).toBe(1 + k));
  });

  it('vidí ji i organizátor (kdo trénink zakládá): souhrn nahoře v kroku Disciplíny, klik otevře Kdo s kým', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players, trainings: [t] })} auth={auth(false, 'id2')} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await openSettings(user, 'Kdy, kde a disciplíny');
    const gauges = screen.getByRole('group', { name: 'Kontrola rozpisu' });
    const picker = screen.getByRole('checkbox', { name: 'Normální leg' });
    expect(gauges.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 6 hráčů = 15 dvojic; souhrn odpovídá tabulkám
    const together = within(gauges).getByRole('button', { name: /^Spolu: \d+ z 15 dvojic$/ });
    expect(within(gauges).getByRole('button', { name: /^Proti sobě: \d+ z 15 dvojic$/ })).toBeInTheDocument();
    await user.click(together);
    expect(screen.getByRole('tab', { name: /^Kdo s kým/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('table', { name: 'Spoluhráči: kolikrát spolu ve dvojici' })).toBeInTheDocument();
    expect(screen.queryByText(/Vidí jen admin/)).toBeNull();
  });

  it('náhled plánu ukazuje, kdo proti komu hraje (u cvičení skupiny) a kdo je mimo stůl', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players, trainings: [{ ...t, plan: { warmupPasses: 1, normal: 1 } }] })} auth={auth(true)} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await openSettings(user, 'Kdy, kde a disciplíny');
    await discView(user, 'Kolo po kole');
    const items = () => within(screen.getByRole('list', { name: 'Náhled plánu' })).getAllByRole('listitem');
    // ve výchozím stavu bez hráčů (náhled nepřehlcený); klik na kolo je ukáže jen u něj
    expect(screen.getByRole('list', { name: 'Náhled plánu' }).querySelector('.pp-who')).toBeNull();
    const round = (label: string) => items().find((li) => li.textContent?.includes(label))!;
    await user.click(within(round('Normální leg')).getByRole('button', { name: /kolo$/ }));
    expect(round('Normální leg').querySelector('.pp-who')).not.toBeNull();
    expect(round('Přihrávky na pětce').querySelector('.pp-who')).toBeNull();
    await user.click(within(round('Normální leg')).getByRole('button', { name: /kolo$/ }));
    expect(round('Normální leg').querySelector('.pp-who')).toBeNull();
    // přepínač pro všechna kola
    await user.click(screen.getByRole('button', { name: 'Ukázat hráče u všech kol' }));
    const match = round('Normální leg');
    expect(match.querySelector('.pp-who')!.textContent).toMatch(/^H\d \+ H\d vs H\d \+ H\d · H\d vs H\d$/);
    const drill = round('Přihrávky na pětce');
    expect(drill.querySelector('.pp-who')!.textContent).toMatch(/^H\d, H\d · H\d, H\d · H\d, H\d$/);
  });

  it('najetí myší na jméno hráče zvýrazní jeho jméno v náhledu plánu i v tabulkách kontroly', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players, trainings: [{ ...t, plan: { warmupPasses: 1, normal: 2 } }] })} auth={auth(true)} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await openSettings(user, 'Kdy, kde a disciplíny');
    await discView(user, 'Kdo s kým');
    const rowHead = () => within(screen.getByRole('table', { name: 'Spoluhráči: kolikrát spolu ve dvojici' })).getByRole('rowheader', { name: 'H5' });
    fireEvent.mouseEnter(rowHead());
    expect(rowHead()).toHaveClass('hl');
    fireEvent.mouseLeave(rowHead());
    expect(rowHead()).not.toHaveClass('hl');
    await discView(user, 'Kolo po kole');
    await user.click(screen.getByRole('button', { name: 'Ukázat hráče u všech kol' }));
    const preview = screen.getByRole('list', { name: 'Náhled plánu' });
    const lit = () => [...preview.querySelectorAll('.pp-p.hl')].map((x) => x.textContent);
    const h3 = [...preview.querySelectorAll('.pp-p')].filter((x) => x.textContent === 'H3');
    expect(h3.length).toBeGreaterThan(1);
    fireEvent.mouseEnter(h3[0]);
    expect(lit().length).toBe(h3.length);
    expect(new Set(lit())).toEqual(new Set(['H3']));
    fireEvent.mouseLeave(h3[0]);
    expect(lit()).toEqual([]);
    // kliknutí zvýraznění připne (zůstane i po odjetí myší); nad náhledem je štítek, kterým jde zrušit
    expect(screen.getByText(/Klikni na jméno, ať zůstane zvýrazněné/)).toBeInTheDocument();
    fireEvent.click(h3[0]);
    fireEvent.mouseLeave(h3[0]);
    expect(new Set(lit())).toEqual(new Set(['H3']));
    expect(screen.getByRole('status', { name: 'Zvýrazněný hráč' })).toHaveTextContent('Zvýrazněno: H3');
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit zvýraznění' }));
    expect(lit()).toEqual([]);
    expect(screen.queryByRole('status', { name: 'Zvýrazněný hráč' })).toBeNull();
    // druhé kliknutí na totéž jméno také zruší
    fireEvent.click(h3[0]);
    fireEvent.click(h3[0]);
    expect(lit()).toEqual([]);
  });

  it('připnutý hráč z kontroly rozpisu ukáže hráče u všech kol; po zrušení se zase schovají', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players, trainings: [{ ...t, plan: { warmupPasses: 1, normal: 2 } }] })} auth={auth(true)} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await openSettings(user, 'Kdy, kde a disciplíny');
    await discView(user, 'Kolo po kole');
    expect(screen.getByRole('list', { name: 'Náhled plánu' }).querySelector('.pp-who')).toBeNull();
    await discView(user, 'Kdo s kým');
    await user.click(within(screen.getByRole('table', { name: 'Soupeři: kolikrát proti sobě' })).getByRole('rowheader', { name: 'H2' }));
    await discView(user, 'Kolo po kole');
    const preview = screen.getByRole('list', { name: 'Náhled plánu' });
    expect(preview.querySelectorAll('.pp-who').length).toBeGreaterThan(1);
    expect(new Set([...preview.querySelectorAll('.pp-p.hl')].map((x) => x.textContent))).toEqual(new Set(['H2']));
    await user.click(screen.getByRole('button', { name: 'Zrušit zvýraznění' }));
    expect(preview.querySelector('.pp-who')).toBeNull();
  });
});

