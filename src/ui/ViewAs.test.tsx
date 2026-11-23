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
  it('Hráč: zmizí adminské věci, v liště štítek Hráč; ťuknutí na něj vše vrátí; zařízení si volbu pamatuje', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App repo={memoryRepository({ players, trainings: [] })} auth={auth()} />);
    const nav = await screen.findByRole('navigation', { name: 'Hlavní navigace' });
    expect(await screen.findByRole('button', { name: /Klubový trénink/ })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Hráči' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Hráč' }));
    expect(within(nav).queryByRole('button', { name: 'Hráči' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Klubový trénink/ })).toBeNull();
    // nenápadný štítek v liště místo pruhu (23. 11. 2026)
    expect(screen.getByRole('button', { name: 'Pohled: hráč – zpět na admina' })).toHaveTextContent('Hráč');

    // po znovuotevření appky pořád pohled hráče
    unmount();
    render(<App repo={memoryRepository({ players, trainings: [] })} auth={auth()} />);
    await user.click(await screen.findByRole('button', { name: 'Pohled: hráč – zpět na admina' }));
    expect(screen.queryByRole('button', { name: /^Pohled: / })).toBeNull();
    expect(within(screen.getByRole('navigation', { name: 'Hlavní navigace' })).getByRole('button', { name: 'Hráči' })).toBeInTheDocument();
  });

  it('Organizátor: smí založit trénink, ale nemá Hráče', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players, trainings: [] })} auth={auth()} />);
    const nav = await screen.findByRole('navigation', { name: 'Hlavní navigace' });
    await screen.findByRole('button', { name: /Klubový trénink/ });
    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Organizátor' }));
    expect(screen.getByRole('button', { name: 'Pohled: organizátor – zpět na admina' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Hráči' })).toBeNull();
    expect(screen.getByRole('button', { name: /Klubový trénink/ })).toBeInTheDocument();
  });
});
