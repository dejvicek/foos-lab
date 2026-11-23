import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MainNav } from './MainNav';

beforeEach(() => localStorage.clear());

const nav = (admin: boolean, navigate = vi.fn(), onSignOut = vi.fn(), onChangePassword = vi.fn()) =>
  render(<MainNav route={{ page: 'trainings' }} navigate={navigate} myName="Adam" myId="p1" admin={admin} onSignOut={onSignOut} onChangePassword={onChangePassword} />);

describe('menu účtu v liště (21. 11. 2026)', () => {
  it('hráč: Můj profil, Návod, Tmavý režim, Změnit heslo, Odhlásit; Šablony ne a v hlavní navigaci nejsou', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    nav(false, navigate);
    expect(screen.queryByRole('button', { name: 'Šablony' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    const menu = screen.getByRole('menu', { name: 'Účet' });
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Můj profil', 'Návod', 'Změnit heslo', 'Odhlásit']);
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Tmavý režim' })).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Můj profil' }));
    expect(navigate).toHaveBeenCalledWith({ page: 'player', id: 'p1' });
    expect(screen.queryByRole('menu')).toBeNull(); // výběr menu zavře
  });

  it('admin má v menu Šablony; přepnutí režimu menu nechá otevřené; Esc zavře', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    nav(true, navigate);
    expect(screen.queryByRole('button', { name: 'Šablony' })).toBeNull(); // ne v hlavní navigaci
    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    const dark = screen.getByRole('menuitemcheckbox', { name: 'Tmavý režim' });
    const before = dark.getAttribute('aria-checked');
    await user.click(dark);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Tmavý režim' }).getAttribute('aria-checked')).not.toBe(before);
    await user.click(screen.getByRole('menuitem', { name: 'Administrace' })); // Šablony v podmenu (23. 11. 2026)
    await user.click(screen.getByRole('menuitem', { name: 'Šablony' }));
    expect(navigate).toHaveBeenCalledWith({ page: 'templates' });
    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Odhlásit a Změnit heslo volají akce', async () => {
    const user = userEvent.setup();
    const out = vi.fn();
    const pw = vi.fn();
    nav(false, vi.fn(), out, pw);
    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    await user.click(screen.getByRole('menuitem', { name: 'Změnit heslo' }));
    expect(pw).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    await user.click(screen.getByRole('menuitem', { name: 'Odhlásit' }));
    expect(out).toHaveBeenCalled();
  });

  it('Administrace (23. 11. 2026): jen pro admina; Zobrazit jako Admin / Organizátor / Hráč', async () => {
    const user = userEvent.setup();
    const onViewAs = vi.fn();
    render(<MainNav route={{ page: 'trainings' }} navigate={vi.fn()} myName="Adam" myId="p1" admin realAdmin viewAs="admin" onViewAs={onViewAs} onSignOut={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    expect(screen.queryByRole('menuitemradio')).toBeNull(); // podmenu je sbalené
    await user.click(screen.getByRole('menuitem', { name: 'Administrace' }));
    const radios = screen.getAllByRole('menuitemradio');
    expect(radios.map((r) => r.textContent)).toEqual(['Admin', 'Organizátor', 'Hráč']);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('menuitemradio', { name: 'Hráč' }));
    expect(onViewAs).toHaveBeenCalledWith('player');
  });

  it('admin v pohledu hráče: Administrace zůstává (jde přepnout zpět), Šablony ne; hráč Administraci nemá', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MainNav route={{ page: 'trainings' }} navigate={vi.fn()} myName="Adam" myId="p1" admin={false} realAdmin viewAs="player" onViewAs={vi.fn()} onSignOut={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    expect(screen.getByRole('menu', { name: 'Účet' })).toHaveTextContent('admin · jako hráč');
    await user.click(screen.getByRole('menuitem', { name: 'Administrace' }));
    expect(screen.queryByRole('menuitem', { name: 'Šablony' })).toBeNull();
    expect(screen.getByRole('menuitemradio', { name: 'Hráč' })).toHaveAttribute('aria-checked', 'true');
    unmount();
    nav(false);
    await user.click(screen.getByRole('button', { name: 'Účet: Adam' }));
    expect(screen.queryByRole('menuitem', { name: 'Administrace' })).toBeNull();
  });
});
