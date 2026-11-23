import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { memoryRepository } from '../storage/memoryRepository';
import { memoryAuth } from '../storage/auth';
import type { Player } from '../domain/types';

const players: Player[] = [
  { id: 'a', name: 'Adam', archived: false, order: 0 },
  { id: 'b', name: 'Bára', archived: false, order: 1 },
];
const auth = () => memoryAuth({ players: players.map((p) => ({ id: p.id, name: p.name, isAdmin: p.id === 'a' })), signedIn: { playerId: 'a', isAdmin: true, mustChangePassword: false } });

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#/trainings';
});

describe('admin se dívá jako jiná role (23. 11. 2026)', () => {
  it('Hráč: zmizí adminské věci, lišta nahoře; Zpět na admina vše vrátí; zařízení si volbu pamatuje', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App repo={memoryRepository({ players, trainings: [] })} auth={auth()} />);
    const nav = await screen.findByRole('navigation', { name: 'Hlavní navigace' });
    expect(await screen.findByRole('button', { name: /Klubový trénink/ })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Hráči' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Hráč' }));
    expect(within(nav).queryByRole('button', { name: 'Hráči' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Klubový trénink/ })).toBeNull();
    expect(screen.getByText(/Díváš se jako hráč/)).toBeInTheDocument();

    // po znovuotevření appky pořád pohled hráče
    unmount();
    render(<App repo={memoryRepository({ players, trainings: [] })} auth={auth()} />);
    expect(await screen.findByText(/Díváš se jako hráč/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zpět na admina' }));
    expect(screen.queryByText(/Díváš se jako/)).toBeNull();
    expect(within(screen.getByRole('navigation', { name: 'Hlavní navigace' })).getByRole('button', { name: 'Hráči' })).toBeInTheDocument();
  });

  it('Organizátor: smí založit trénink, ale nemá Hráče', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players, trainings: [] })} auth={auth()} />);
    const nav = await screen.findByRole('navigation', { name: 'Hlavní navigace' });
    await screen.findByRole('button', { name: /Klubový trénink/ });
    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Organizátor' }));
    expect(screen.getByText(/Díváš se jako organizátor/)).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Hráči' })).toBeNull();
    expect(screen.getByRole('button', { name: /Klubový trénink/ })).toBeInTheDocument();
  });
});
