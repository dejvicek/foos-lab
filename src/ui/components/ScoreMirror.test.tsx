import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { DrillMirror, ScoreMirror } from './ScoreMirror';
import { bump } from '../../domain/legState';
import { tapDrill, type DrillValue } from '../../domain/drillTap';
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

  it('ztráta na stropu 30 nejde ťuknout a nepřidá se do Zpět', () => {
    render(<Harness match={{ ...base, trackLosses: true }} initial={{ la: 30 }} />);
    expect(screen.getByRole('button', { name: /^Ztráta vlevo/ })).toBeDisabled();
  });

  it('po Opravit se Zpět vynuluje (nevrátí víc, než bylo ťuknuto)', async () => {
    const user = userEvent.setup();
    const log: [keyof Score, number][] = [];
    render(<Harness initial={{ ga: 3, gb: 1 }} log={log} />);
    await user.click(goal('vlevo'));
    await user.click(screen.getByRole('button', { name: 'Opravit' }));
    expect(screen.getByRole('button', { name: /Zpět/ })).toBeDisabled();
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

describe('DrillMirror – pokusy', () => {
  const def = soloMetric('blockToControl'); // bloky do držení z 10
  function DrillHarness({ log = [] as [string, boolean, number][], disabledFor = [] as string[], init = { a: { value: 7, attempts: 9 } } as Record<string, DrillValue> }) {
    const [v, setV] = useState<Record<string, DrillValue>>(init);
    return (
      <DrillMirror
        players={['a', 'c', 'd']}
        def={def}
        values={v}
        names={names}
        canSolo={(p) => !disabledFor.includes(p)}
        onTap={(p, ok, d) => {
          log.push([p, ok, d]);
          setV((cur) => {
            const next = tapDrill(cur[p] ?? {}, def, ok, d);
            return next ? { ...cur, [p]: next } : cur;
          });
        }}
      />
    );
  }

  it('každý hráč skupiny (i trojice) má ✓ a ✗; ťuknutí přičte pokus, Zpět ho vrátí', async () => {
    const user = userEvent.setup();
    const log: [string, boolean, number][] = [];
    render(<DrillHarness log={log} />);
    expect(screen.getAllByRole('button', { name: /^do držení:/ })).toHaveLength(3);
    const lavi = screen.getByRole('group', { name: 'Lavi' });
    expect(lavi).toHaveTextContent('pokus 0 / 10');
    await user.click(within(lavi).getByRole('button', { name: 'do držení: Lavi' }));
    await user.click(within(lavi).getByRole('button', { name: 'nechytil: Lavi' }));
    expect(lavi).toHaveTextContent('pokus 2 / 10');
    expect(lavi).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: /Zpět/ }));
    expect(log).toEqual([['c', true, 1], ['c', false, 1], ['c', false, -1]]);
  });

  it('po posledním pokusu Hotovo a tlačítka zmizí', async () => {
    const user = userEvent.setup();
    render(<DrillHarness />);
    const milan = screen.getByRole('group', { name: 'Milan' });
    await user.click(within(milan).getByRole('button', { name: 'do držení: Milan' }));
    expect(milan).toHaveTextContent('Hotovo 8 z 10');
    expect(within(milan).queryByRole('button', { name: /: Milan$/ })).toBeNull();
  });

  it('za hráče, za kterého nesmím, jen ke čtení', () => {
    render(<DrillHarness disabledFor={['d']} />);
    expect(within(screen.getByRole('group', { name: 'Luky' })).getByRole('button', { name: 'do držení: Luky' })).toBeDisabled();
  });
});
