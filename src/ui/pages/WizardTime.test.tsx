import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import type { DisciplineId, Player } from '../../domain/types';
import { applyCatalog } from '../../domain/catalog';
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
    const user = await wizard(['Ada'], 60); // trénink pro 1 hráče: sólová cvičení, zbývá čas
    const badge = () => screen.getByText(/^Naplánováno/).textContent;
    const before = badge();
    const fill = screen.getByRole('button', { name: /^Doplnit kola/ });
    expect(screen.getByText(/Zbývá \d:\d\d/)).toBeInTheDocument();
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
  // výchozí stav: štítky schované
  expect(screen.queryByRole('list', { name: 'Trénuje' })).toBeNull();
  expect(screen.queryByRole('list', { name: 'Sekce dovedností' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Ukázat štítky' }));
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
  await user.click(screen.getByRole('button', { name: 'Ukázat štítky' }));
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
  // skrytí štítků zruší i filtr
  await user.click(within(screen.getByRole('list', { name: 'Sekce dovedností' })).getByRole('button', { name: 'Útok' }));
  await user.click(screen.getByRole('button', { name: 'Skrýt štítky' }));
  expect(shown()).toHaveLength(all);
  expect(screen.queryByRole('list', { name: 'Trénuje' })).toBeNull();
});

it('šablona v kroku Disciplíny: nový trénink začne první, výběr jiné změní délku i disciplíny', async () => {
  const user = userEvent.setup();
  window.location.hash = '#/trenink/novy';
  const catalog = {
    templates: [
      { id: 'k', name: 'Krátký', durationMin: 60, selection: ['warmupPasses', 'normal'] as DisciplineId[] },
      { id: 'd', name: 'Dlouhý', durationMin: 180, selection: ['normal', 'wall', 'sim'] as DisciplineId[] },
    ],
  };
  render(<App repo={memoryRepository({ players, trainings: [], catalog })} />);
  await screen.findByRole('heading', { name: 'Kdy a kde' });
  expect(screen.getByRole('slider', { name: 'Délka tréninku' })).toHaveValue('60');
  await next(user);
  for (const n of ['Ada', 'Bára', 'Cyril', 'Dan']) await user.click(screen.getByRole('checkbox', { name: n }));
  await next(user);
  const pick = screen.getByRole('combobox', { name: 'Šablona' });
  await user.selectOptions(pick, 'd');
  expect(pick).toHaveValue('d');
  expect(screen.getByText(/^Naplánováno .* z 3:00/)).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Simulace ligového kola' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Přihrávky na pětce' })).not.toBeChecked();
  await user.selectOptions(pick, 'k');
  expect(pick).toHaveValue('k');
  expect(screen.getByText(/^Naplánováno .* z 1:00/)).toBeInTheDocument();
  applyCatalog({});
});
