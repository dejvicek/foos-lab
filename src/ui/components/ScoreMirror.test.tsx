import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { DrillMirror, ScoreMirror } from './ScoreMirror';
import { bump } from '../../domain/legState';
import { soloMetric } from '../../domain/solo';
import type { Match, Score } from '../../domain/types';

const names = { a: 'Milan', b: 'David K', c: 'Lavi', d: 'Luky', r: 'Osky' };
const base: Match = { id: 'league|7|2|a+bvc+d', block: 'league', round: 7, table: 2, kind: 'doubles', sideA: ['a', 'b'], sideB: ['c', 'd'] };

function Harness({ match = base, initial = {}, disabled = false, log = [] as [keyof Score, number][] }) {
  const [s, setS] = useState<Score>(initial);
  return (
    <ScoreMirror
      match={match}
      score={s}
      names={names}
      me="a"
      disabled={disabled}
      onBump={(f, d) => {
        log.push([f, d]);
        setS((cur) => bump(match, cur, f, d));
      }}
    />
  );
}

const goal = (side: 'vlevo' | 'vpravo') => screen.getByRole('button', { name: new RegExp(`^Gól ${side}`) });

describe('ScoreMirror', () => {
  it('ťuknutí do pole strany přičte gól, strany jsou levá a pravá jako u stolu', async () => {
    const user = userEvent.setup();
    const log: [keyof Score, number][] = [];
    render(<Harness log={log} />);
    expect(screen.getByText('Milan + David K')).toBeInTheDocument();
    await user.click(goal('vlevo'));
    await user.click(goal('vlevo'));
    await user.click(goal('vpravo'));
    expect(log).toEqual([['ga', 1], ['ga', 1], ['gb', 1]]);
    expect(goal('vlevo')).toHaveTextContent('2');
    expect(goal('vpravo')).toHaveTextContent('1');
  });

  it('ztráty jen u stolu, kde se zapisují', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    expect(screen.queryByRole('button', { name: /^Ztráta vlevo/ })).toBeNull();
    unmount();
    const log: [keyof Score, number][] = [];
    render(<Harness match={{ ...base, trackLosses: true, referee: 'r' }} log={log} />);
    await user.click(screen.getByRole('button', { name: /^Ztráta vpravo/ }));
    expect(log).toEqual([['lb', 1]]);
    expect(screen.getByRole('button', { name: /^Ztráta vpravo/ })).toHaveTextContent('1');
  });

  it('Zpět vrátí poslední vlastní ťuknutí', async () => {
    const user = userEvent.setup();
    const log: [keyof Score, number][] = [];
    render(<Harness match={{ ...base, trackLosses: true }} log={log} />);
    const undo = screen.getByRole('button', { name: /Zpět/ });
    expect(undo).toBeDisabled();
    await user.click(goal('vlevo'));
    await user.click(screen.getByRole('button', { name: /^Ztráta vpravo/ }));
    await user.click(undo);
    await user.click(undo);
    expect(log).toEqual([['ga', 1], ['lb', 1], ['lb', -1], ['ga', -1]]);
    expect(undo).toBeDisabled();
  });

  it('scénářový start: pole ukazují stav na stole, ukládají se odehrané góly', async () => {
    const user = userEvent.setup();
    const log: [keyof Score, number][] = [];
    render(<Harness match={{ ...base, start: [0, 3] }} log={log} />);
    expect(goal('vlevo')).toHaveTextContent('0');
    expect(goal('vpravo')).toHaveTextContent('3');
    await user.click(goal('vpravo'));
    expect(goal('vpravo')).toHaveTextContent('4');
    expect(log).toEqual([['gb', 1]]);
  });

  it('konec legu: ukáže výsledek, další góly nejdou, Opravit zápis odemkne', async () => {
    const user = userEvent.setup();
    const log: [keyof Score, number][] = [];
    render(<Harness initial={{ ga: 5, gb: 4 }} log={log} />);
    await user.click(goal('vlevo'));
    expect(screen.getByText(/Leg dohrán 6 : 4/)).toBeInTheDocument();
    expect(goal('vlevo')).toBeDisabled();
    expect(goal('vpravo')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Opravit' }));
    await user.click(screen.getByRole('button', { name: 'Ubrat gól vpravo' }));
    expect(log).toEqual([['ga', 1], ['gb', -1]]);
    expect(goal('vpravo')).not.toBeDisabled();
  });

  it('5:5 končí až při rozdílu 2', async () => {
    const user = userEvent.setup();
    render(<Harness match={{ ...base, start: [5, 5] }} initial={{ ga: 1 }} />);
    expect(screen.queryByText(/Leg dohrán/)).toBeNull();
    await user.click(goal('vlevo'));
    expect(screen.getByText(/Leg dohrán 7 : 5/)).toBeInTheDocument();
  });

  it('simulace: ťuknutí = set, konec při 2 setech', async () => {
    const user = userEvent.setup();
    render(<Harness match={{ ...base, id: 'sim|1|1|x', block: 'sim' }} />);
    expect(screen.getAllByText('ťukni = set')).toHaveLength(2);
    await user.click(goal('vpravo'));
    await user.click(goal('vpravo'));
    expect(screen.getByText(/dohrán 0 : 2/)).toBeInTheDocument();
  });

  it('kdo u stolu není, vidí stav jen ke čtení', () => {
    render(<Harness disabled initial={{ ga: 2 }} />);
    expect(goal('vlevo')).toBeDisabled();
    expect(goal('vlevo')).toHaveTextContent('2');
    expect(screen.getByText(/Zapisují hráči a rozhodčí/)).toBeInTheDocument();
  });
});

describe('DrillMirror', () => {
  const def = soloMetric('blockToControl');
  function DrillHarness({ log = [] as [string, number][], disabledFor = [] as string[] }) {
    const [v, setV] = useState<Record<string, number | undefined>>({ a: 9 });
    return (
      <DrillMirror
        players={['a', 'c', 'd']}
        def={def}
        values={v}
        names={names}
        canSolo={(p) => !disabledFor.includes(p)}
        onBump={(p, d) => {
          log.push([p, d]);
          setV((cur) => ({ ...cur, [p]: Math.min(def.max, Math.max(0, (cur[p] ?? 0) + d)) }));
        }}
      />
    );
  }

  it('pole pro každého hráče skupiny (i trojice), ťuknutí = +1 do jeho metriky', async () => {
    const user = userEvent.setup();
    const log: [string, number][] = [];
    render(<DrillHarness log={log} />);
    expect(screen.getAllByRole('button', { name: /^Přičíst/ })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: /^Přičíst Lavi/ }));
    await user.click(screen.getByRole('button', { name: /Zpět/ }));
    expect(log).toEqual([['c', 1], ['c', -1]]);
  });

  it('na maximu metriky další ťuknutí nejde', async () => {
    const user = userEvent.setup();
    render(<DrillHarness />);
    const milan = screen.getByRole('button', { name: /^Přičíst Milan/ });
    await user.click(milan);
    expect(milan).toHaveTextContent('10');
    expect(milan).toBeDisabled();
  });

  it('za hráče, za kterého nesmím, je pole jen ke čtení', () => {
    render(<DrillHarness disabledFor={['d']} />);
    expect(screen.getByRole('button', { name: /^Přičíst Luky/ })).toBeDisabled();
  });
});
