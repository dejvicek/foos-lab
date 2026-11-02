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

describe('ScorePicker – předvyplnění vítěze', () => {
  it('klik na číslo jedné strany doplní prázdné druhé straně 6; vyplněnou nepřepíše', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    render(<Harness saved={saved} />);
    await user.click(btn('S: góly vlevo 3'));
    expect(saved.at(-1)).toEqual({ ga: 3, gb: 6 });
    await user.click(btn('S: góly vpravo 4'));
    await user.click(btn('S: góly vlevo 6'));
    expect(saved.at(-1)).toEqual({ ga: 6, gb: 4 });
  });

  it('klik na 6 nic nedoplní (poraženého neznáme)', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    render(<Harness saved={saved} />);
    await user.click(btn('S: góly vpravo 6'));
    expect(saved.at(-1)).toEqual({ gb: 6 });
  });

  it('start 5:5: 7 → soupeř 9, 9 → soupeř 10 (uloží se odehrané góly)', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    const { unmount } = render(<Harness match={{ ...base, start: [5, 5] }} saved={saved} />);
    await user.click(btn('S: góly vlevo 7'));
    expect(saved.at(-1)).toEqual({ ga: 2, gb: 4 });
    expect(screen.getByText('7 : 9')).toBeInTheDocument();
    unmount();
    render(<Harness match={{ ...base, start: [5, 5] }} saved={saved} />);
    await user.click(btn('S: góly vpravo 9'));
    expect(saved.at(-1)).toEqual({ ga: 5, gb: 4 });
  });

  it('start 0:3: soupeři se doplní 6 na stole', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    render(<Harness match={{ ...base, start: [0, 3] }} saved={saved} />);
    await user.click(btn('S: góly vpravo 4'));
    expect(saved.at(-1)).toEqual({ ga: 6, gb: 1 });
  });
});

describe('ScorePicker – Daň za ztrátu', () => {
  const tax: Match = { ...base, lossTax: true, trackLosses: true };
  const chips = (side: string) => within(screen.getByRole('group', { name: `S: ztráty ${side}` })).getAllByRole('button').map((b) => b.textContent);

  it('za stavu 0:0 jde zadat 6 ztrát; ztráta je hned gól soupeře', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    render(<Harness match={tax} initial={{ ga: 0, gb: 0 }} saved={saved} />);
    expect(chips('vlevo')).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    await user.click(btn('S: ztráty vlevo 2'));
    expect(saved.at(-1)).toEqual({ ga: 0, gb: 2, la: 2, lb: 0 });
    expect(screen.getByText('0 : 2')).toBeInTheDocument();
    await user.click(btn('S: ztráty vlevo 1'));
    expect(saved.at(-1)).toEqual({ ga: 0, gb: 1, la: 1, lb: 0 });
  });

  it('nabídne jen tolik ztrát, kolik soupeři zbývá gólů; bez „+“', () => {
    render(<Harness match={tax} initial={{ ga: 6, gb: 2, la: 0, lb: 0 }} />);
    expect(chips('vlevo')).toEqual(['0', '1', '2', '3', '4']);
    expect(chips('vpravo')).toEqual(['0']);
  });

  it('snížení gólů soupeře pod ztráty srovná ztráty', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    render(<Harness match={tax} initial={{ ga: 0, gb: 4, la: 4, lb: 0 }} saved={saved} />);
    await user.click(btn('S: góly vpravo 3'));
    expect(saved.at(-1)).toMatchObject({ gb: 3, la: 3 });
  });
});
