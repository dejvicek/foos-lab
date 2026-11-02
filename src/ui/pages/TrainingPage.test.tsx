import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player, Training } from '../../domain/types';

const NAMES = ['Ada', 'Bára', 'Cyril', 'Dan', 'Eva', 'Filip', 'Gita', 'Hugo'];
const players = (n: number): Player[] => NAMES.slice(0, n).map((name, order) => ({ id: `p${order + 1}`, name, order, archived: false }));
const checkbox = (name: string) => screen.getByRole('checkbox', { name });

afterEach(() => vi.restoreAllMocks());

describe('stránka Trénink', () => {
  it('nový trénink: jen zaškrtnout přítomné, přidat hráče, převzít délku a stoly', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players: players(6), trainings: [] });
    window.location.hash = '#/trenink';
    render(<App repo={repo} />);

    expect(await screen.findByText('Zatím žádný trénink. Začni tlačítkem Nový trénink.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nový trénink' }));

    expect(await screen.findByText('Přítomno: 0')).toBeInTheDocument();
    for (const n of NAMES.slice(0, 6)) expect(checkbox(n)).not.toBeChecked();
    expect(screen.getByText('Ještě chybí 2 hráči do minima 2.')).toBeInTheDocument();

    for (const n of ['Ada', 'Bára', 'Cyril', 'Dan']) await user.click(checkbox(n));
    expect(screen.getByText('Přítomno: 4')).toBeInTheDocument();
    expect(screen.queryByText(/Ještě chybí/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Jméno nového hráče'), 'Nový');
    await user.click(screen.getByRole('button', { name: 'Přidat a zaškrtnout' }));
    expect(checkbox('Nový')).toBeChecked();
    expect(screen.getByText('Přítomno: 5')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Délka tréninku'), '120');
    await user.selectOptions(screen.getByLabelText('Počet stolů'), '2');

    await user.click(screen.getByRole('button', { name: 'Hráči' }));
    expect(within(screen.getByRole('list', { name: 'Aktivní hráči' })).getByText('Nový')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trénink' }));
    await user.click(screen.getByRole('button', { name: 'Nový trénink' }));
    expect(screen.getByLabelText('Délka tréninku')).toHaveValue('120');
    expect(screen.getByLabelText('Počet stolů')).toHaveValue('2');
  });

  it('změna přítomných, která smaže skóre, se ptá; při zrušení se nic nezmění', async () => {
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

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(await screen.findByRole('checkbox', { name: 'Ada' }));
    expect(confirmSpy).toHaveBeenCalledWith('Změna smaže skóre u 1 zápasu. Pokračovat?');
    expect(checkbox('Ada')).toBeChecked();

    confirmSpy.mockReturnValue(true);
    await user.click(checkbox('Ada'));
    expect(checkbox('Ada')).not.toBeChecked();
    await vi.waitFor(() => expect(repo.snapshot().trainings[0].scores).toEqual({}));
    expect(repo.snapshot().trainings[0].attendees).not.toContain('p1');
  });

  it('archivovaný hráč zůstane ve starém tréninku zaškrtnutý', async () => {
    const ps = players(4);
    ps[0].archived = true;
    const t: Training = { id: 't1', date: '2026-10-31', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [], mode: 'team', tables: 4, attendees: ['p1', 'p2', 'p3', 'p4'], scores: {} };
    window.location.hash = '#/trenink/t1';
    render(<App repo={memoryRepository({ players: ps, trainings: [t] })} />);
    expect(await screen.findByRole('checkbox', { name: /Ada/ })).toBeChecked();
  });

  it('neexistující trénink', async () => {
    window.location.hash = '#/trenink/nic';
    render(<App repo={memoryRepository()} />);
    expect(await screen.findByText('Trénink nenalezen.')).toBeInTheDocument();
  });
});
