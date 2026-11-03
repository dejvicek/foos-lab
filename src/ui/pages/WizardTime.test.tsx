import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { Player } from '../../domain/types';
import { next } from '../../test/wizard';

const players: Player[] = ['Ada', 'Bára', 'Cyril', 'Dan'].map((name, order) => ({ id: `p${order + 1}`, name, order, archived: false }));

async function wizard(names: string[], minutes: number) {
  const user = userEvent.setup();
  window.location.hash = '#/trenink/novy';
  render(<App repo={memoryRepository({ players, trainings: [] })} />);
  await screen.findByRole('heading', { name: 'Kdy a kde' });
  fireEvent.change(screen.getByRole('slider', { name: 'Délka tréninku' }), { target: { value: String(minutes) } });
  await user.click(screen.getByRole('radio', { name: '1 stůl' }));
  await next(user);
  for (const n of names) await user.click(screen.getByRole('checkbox', { name: n }));
  await next(user);
  return user;
}

describe('čas plánu v průvodci', () => {
  it('plán delší než trénink: ve Shrnutí varování, zahájit jde i tak (časy jsou orientační)', async () => {
    const user = await wizard(['Ada', 'Bára', 'Cyril', 'Dan'], 60);
    await next(user);
    expect(screen.getByRole('alert')).toHaveTextContent(/Plán \(\d:\d\d\) je delší než trénink \(1:00\)/);
    expect(screen.getByRole('button', { name: 'Zahájit trénink' })).toBeEnabled();
  });

  it('zbývá čas: v kroku Disciplíny nabídne doplnit kola, po doplnění se plán prodlouží', async () => {
    const user = await wizard(['Ada'], 60); // trénink pro 1 hráče: 0:49 z 1:00
    const badge = () => screen.getByText(/^Naplánováno/).textContent;
    const before = badge();
    const fill = screen.getByRole('button', { name: /^Doplnit kola/ });
    expect(screen.getByText(/Zbývá 0:11/)).toBeInTheDocument();
    await user.click(fill);
    expect(badge()).not.toBe(before);
  });
});

it('štítky dovedností: u disciplín v kroku Disciplíny', async () => {
  const user = userEvent.setup();
  window.location.hash = '#/trenink/novy';
  render(<App repo={memoryRepository({ players, trainings: [] })} />);
  await screen.findByRole('heading', { name: 'Kdy a kde' });
  await next(user);
  for (const n of ['Ada', 'Bára', 'Cyril', 'Dan']) await user.click(screen.getByRole('checkbox', { name: n }));
  await next(user);
  const penalty = screen.getByRole('group', { name: 'Penalta z místa proti brankáři' });
  expect(within(penalty).getByRole('list', { name: 'Trénuje' })).toHaveTextContent('Střela z trojkyObranaČtení soupeře');
  // barva podle sekce, žádné zvýraznění „hlavního“; nad seznamem legenda sekcí
  const tags = within(penalty).getAllByRole('listitem');
  expect(tags.map((li) => li.className)).toEqual(['g-attack', 'g-defense', 'g-tactics']);
  expect(screen.getByRole('list', { name: 'Sekce dovedností' })).toHaveTextContent('ÚtokObranaTechnikaTaktikaHlavaZápas');
});

it('filtrování disciplín podle štítků: sekce v legendě i konkrétní štítek; zrušit filtr', async () => {
  const user = userEvent.setup();
  window.location.hash = '#/trenink/novy';
  render(<App repo={memoryRepository({ players, trainings: [] })} />);
  await screen.findByRole('heading', { name: 'Kdy a kde' });
  await next(user);
  for (const n of ['Ada', 'Bára', 'Cyril', 'Dan']) await user.click(screen.getByRole('checkbox', { name: n }));
  await next(user);
  const shown = () => screen.getAllByRole('group').filter((g) => g.closest('.disc-list')).map((g) => g.getAttribute('aria-label'));
  const all = shown().length;
  // konkrétní štítek Clearing (u disciplíny Clearing)
  await user.click(within(screen.getByRole('group', { name: 'Clearing' })).getByRole('button', { name: 'Clearing' }));
  expect(shown()).toEqual(expect.arrayContaining(['Clearing', 'Daň za ztrátu']));
  expect(shown()).not.toContain('Normální leg');
  expect(screen.getByText(/zobrazeno \d+ z \d+/)).toBeInTheDocument();
  // + sekce Útok (sčítá se)
  await user.click(within(screen.getByRole('list', { name: 'Sekce dovedností' })).getByRole('button', { name: 'Útok' }));
  expect(shown()).toEqual(expect.arrayContaining(['Clearing', 'Daň za ztrátu', 'Penalta z místa proti brankáři', 'Přihrávky ke zdi a po lajně']));
  expect(shown()).not.toContain('Normální leg');
  await user.click(screen.getByRole('button', { name: 'Zrušit filtr' }));
  expect(shown()).toHaveLength(all);
});
