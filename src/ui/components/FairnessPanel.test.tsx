import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { memoryAuth } from '../../storage/auth';
import type { Player, Training } from '../../domain/types';
import { openSettings, saveSettings } from '../../test/wizard';

const players: Player[] = Array.from({ length: 6 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
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
  it('admin: v kroku Disciplíny spoluhráči a soupeři, nápověda kolik kol přidat a tlačítko, které je přidá', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players, trainings: [t] });
    render(<App repo={repo} auth={auth(true)} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    expect(screen.queryByText('Kontrola rozpisu: kdo s kým kolikrát')).toBeNull(); // už ne v rozpisu
    await openSettings(user, 'Disciplíny');
    await user.click(screen.getByText('Kontrola rozpisu: kdo s kým kolikrát'));
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

  it('organizátor, který není admin, ji v nastavení nevidí', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players, trainings: [t] })} auth={auth(false, 'id2')} />);
    await screen.findByRole('table', { name: 'Rozpis tréninku' });
    await openSettings(user, 'Disciplíny');
    expect(screen.queryByText('Kontrola rozpisu: kdo s kým kolikrát')).toBeNull();
  });
});
