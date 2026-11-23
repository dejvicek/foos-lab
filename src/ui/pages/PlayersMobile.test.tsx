import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player } from '../../domain/types';

const players: Player[] = [
  { id: 'a', name: 'Adam', archived: false, order: 0 },
  { id: 'm', name: 'Míra Novotný', archived: false, order: 1, organizer: true },
];

const original = window.matchMedia;
beforeEach(() => {
  window.location.hash = '#/players';
  window.matchMedia = ((q: string) => ({ matches: q.includes('max-width: 767px'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = original;
});

const rowOf = (name: string) => within(screen.getByRole('list', { name: 'Aktivní hráči' })).getAllByRole('listitem').find((li) => li.getAttribute('data-name') === name)!;

describe('Hráči na telefonu – menu ⋯ u hráče (23. 11. 2026, varianta A)', () => {
  it('řádek: jméno, štítek organizátor a docházka; žádná tlačítka kromě ⋯', async () => {
    render(<App repo={memoryRepository({ players, trainings: [] })} />);
    await screen.findByRole('heading', { name: 'Hráči' });
    const mira = rowOf('Míra Novotný');
    expect(within(mira).getByText('organizátor')).toBeInTheDocument();
    expect(within(mira).getByText('zatím nebyl')).toBeInTheDocument();
    expect(within(mira).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Akce: Míra Novotný']);
    expect(screen.getByText('2 aktivní')).toBeInTheDocument();
  });

  it('+ Přidat otevře pole pro jméno a přidá hráče', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players, trainings: [] })} />);
    await screen.findByRole('heading', { name: 'Hráči' });
    expect(screen.queryByLabelText('Jméno nového hráče')).toBeNull();
    await user.click(screen.getByRole('button', { name: '+ Přidat' }));
    await user.type(screen.getByLabelText('Jméno nového hráče'), 'Bára');
    await user.click(screen.getByRole('button', { name: 'Přidat' }));
    expect(rowOf('Bára')).toBeInTheDocument();
  });

  it('menu: Organizátor přepne a nechá menu otevřené; Esc zavře; Přejmenovat a Archivovat', async () => {
    const user = userEvent.setup();
    const repo = memoryRepository({ players, trainings: [] });
    render(<App repo={repo} />);
    await screen.findByRole('heading', { name: 'Hráči' });

    await user.click(within(rowOf('Adam')).getByRole('button', { name: 'Akce: Adam' }));
    const menu = screen.getByRole('menu', { name: 'Adam' });
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Přejmenovat', 'Resetovat heslo', 'Profil a fotka', 'Archivovat']);
    const org = within(menu).getByRole('menuitemcheckbox', { name: 'Organizátor' });
    expect(org).toHaveAttribute('aria-checked', 'false');
    await user.click(org);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Organizátor' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(repo.snapshot().players.find((p) => p.id === 'a')?.organizer).toBe(true));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(within(rowOf('Adam')).getByRole('button', { name: 'Akce: Adam' }));
    await user.click(screen.getByRole('menuitem', { name: 'Přejmenovat' }));
    const input = screen.getByLabelText('Nové jméno pro Adam');
    await user.clear(input);
    await user.type(input, 'Adámek');
    await user.click(screen.getByRole('button', { name: 'Uložit' }));
    expect(rowOf('Adámek')).toBeInTheDocument();

    await user.click(within(rowOf('Adámek')).getByRole('button', { name: 'Akce: Adámek' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archivovat' }));
    expect(screen.getByText('Archivovaní (1)')).toBeInTheDocument();
  });

  it('Profil a fotka otevře stránku hráče', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository({ players, trainings: [] })} />);
    await screen.findByRole('heading', { name: 'Hráči' });
    await user.click(within(rowOf('Adam')).getByRole('button', { name: 'Akce: Adam' }));
    await user.click(screen.getByRole('menuitem', { name: 'Profil a fotka' }));
    expect(window.location.hash).toBe('#/ladder/player/a');
  });
});
