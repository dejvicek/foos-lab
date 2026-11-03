import { fireEvent, render, screen } from '@testing-library/react';
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
