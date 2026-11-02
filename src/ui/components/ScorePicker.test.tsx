import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ScorePicker } from './ScorePicker';
import type { Match, Score } from '../../domain/types';

const base: Match = { id: 'm', block: 'league', round: 1, table: 1, kind: 'doubles', sideA: ['a', 'b'], sideB: ['c', 'd'] };
const names = { a: 'Milan', b: 'David K', c: 'Lavi', d: 'Luky' };

function Harness({ match = base, initial = {}, disabled = false, saved = [] as Score[] }) {
  const [s, setS] = useState<Score>(initial);
  return (
    <ScorePicker
      label="S"
      match={match}
      score={s}
      names={names}
      disabled={disabled}
      onChange={(x) => {
        saved.push(x);
        setS(x);
      }}
    />
  );
}
const btn = (name: string) => screen.getByRole('button', { name });

describe('ScorePicker – zápis kliknutím na notebooku', () => {
  it('levá strana 0→6, pravá 6→0; kliknutí uloží skóre hned, uprostřed stav', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    render(<Harness saved={saved} />);
    const left = within(screen.getByRole('group', { name: 'S: góly vlevo' })).getAllByRole('button').map((b) => b.textContent);
    const right = within(screen.getByRole('group', { name: 'S: góly vpravo' })).getAllByRole('button').map((b) => b.textContent);
    expect(left).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    expect(right).toEqual(['6', '5', '4', '3', '2', '1', '0']);
    await user.click(btn('S: góly vlevo 6'));
    await user.click(btn('S: góly vpravo 3'));
    expect(saved.at(-1)).toEqual({ ga: 6, gb: 3 });
    expect(btn('S: góly vlevo 6')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('6 : 3')).toBeInTheDocument();
  });

  it('start 0:3: kliká se stav na stole, hodnoty pod startem nejdou, uloží se odehrané', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    render(<Harness match={{ ...base, start: [0, 3] }} saved={saved} />);
    expect(btn('S: góly vpravo 2')).toBeDisabled();
    await user.click(btn('S: góly vlevo 4'));
    await user.click(btn('S: góly vpravo 6'));
    expect(saved.at(-1)).toEqual({ ga: 4, gb: 3 });
    expect(screen.getByText('odehráno 4 : 3')).toBeInTheDocument();
  });

  it('start 5:5: čísla 5–10, jde zapsat 10', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    render(<Harness match={{ ...base, start: [5, 5] }} saved={saved} />);
    const left = within(screen.getByRole('group', { name: 'S: góly vlevo' })).getAllByRole('button').map((b) => b.textContent);
    expect(left).toEqual(['5', '6', '7', '8', '9', '10']);
    await user.click(btn('S: góly vlevo 10'));
    await user.click(btn('S: góly vpravo 8'));
    expect(saved.at(-1)).toEqual({ ga: 5, gb: 3 });
  });

  it('simulace: sety 0–2', () => {
    render(<Harness match={{ ...base, block: 'sim' }} />);
    expect(within(screen.getByRole('group', { name: 'S: góly vlevo' })).getAllByRole('button')).toHaveLength(3);
  });

  it('ztráty jako řada 0–8, „+“ přidá nad 8; jen u stolu se ztrátami', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    const { unmount } = render(<Harness />);
    expect(screen.queryByRole('group', { name: 'S: ztráty vlevo' })).toBeNull();
    unmount();
    render(<Harness match={{ ...base, trackLosses: true }} saved={saved} />);
    await user.click(btn('S: ztráty vlevo 2'));
    expect(saved.at(-1)).toEqual({ la: 2, lb: 0 });
    await user.click(btn('S: ztráty vpravo 8'));
    await user.click(btn('S: ztráty vpravo víc'));
    expect(saved.at(-1)).toEqual({ la: 2, lb: 9 });
    expect(btn('S: ztráty vpravo 9')).toHaveAttribute('aria-pressed', 'true');
  });

  it('vymazat smaže celý zápis stolu', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    render(<Harness initial={{ ga: 6, gb: 2 }} saved={saved} />);
    await user.click(btn('S: vymazat'));
    expect(saved.at(-1)).toEqual({});
  });

  it('bez práva zapisovat jen ke čtení', () => {
    render(<Harness disabled initial={{ ga: 6, gb: 2 }} />);
    expect(btn('S: góly vlevo 6')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'S: vymazat' })).toBeNull();
  });
});
