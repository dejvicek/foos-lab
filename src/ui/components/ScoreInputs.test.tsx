import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ScoreInputs } from './ScoreInputs';
import type { Score } from '../../domain/types';

function Harness({ maxGoals }: { maxGoals: number }) {
  const [s, setS] = useState<Score>({});
  return <ScoreInputs label="Z" score={s} maxGoals={maxGoals} withLosses onChange={setS} />;
}

describe('ScoreInputs', () => {
  it('hodnota nad maximum se nepřijme (překlep 66 zůstane 6)', async () => {
    const user = userEvent.setup();
    render(<Harness maxGoals={10} />);
    await user.type(screen.getByLabelText('Z: góly vlevo'), '66');
    expect(screen.getByLabelText('Z: góly vlevo')).toHaveValue(6);
    await user.type(screen.getByLabelText('Z: ztráty vlevo'), '31');
    expect(screen.getByLabelText('Z: ztráty vlevo')).toHaveValue(3);
  });
  it('u simulace jsou sety nejvýš 2', async () => {
    const user = userEvent.setup();
    render(<Harness maxGoals={2} />);
    await user.type(screen.getByLabelText('Z: góly vlevo'), '3');
    expect(screen.getByLabelText('Z: góly vlevo')).toHaveValue(null);
  });
});

describe('ScoreInputs – scénářový start', () => {
  function StartHarness({ start, onScore }: { start: [number, number]; onScore(s: Score): void }) {
    const [s, setS] = useState<Score>({});
    return <ScoreInputs label="S" score={s} maxGoals={10} withLosses={false} start={start} onChange={(x) => (setS(x), onScore(x))} />;
  }

  it('start 5:5: jde zapsat 10 (stav na stolu), uloží se odehrané góly', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    render(<StartHarness start={[5, 5]} onScore={(x) => saved.push(x)} />);
    await user.type(screen.getByLabelText('S: góly vlevo'), '10');
    await user.type(screen.getByLabelText('S: góly vpravo'), '8');
    expect(screen.getByLabelText('S: góly vlevo')).toHaveValue(10);
    expect(saved.at(-1)).toEqual({ ga: 5, gb: 3 });
  });

  it('hodnota pod startem se neuloží a po opuštění políčka se vrátí', async () => {
    const user = userEvent.setup();
    const saved: Score[] = [];
    render(<StartHarness start={[0, 3]} onScore={(x) => saved.push(x)} />);
    const right = screen.getByLabelText('S: góly vpravo');
    await user.type(right, '2');
    expect(saved).toEqual([]);
    expect(right).toHaveAttribute('aria-invalid', 'true');
    await user.tab();
    expect(right).toHaveValue(null);
  });
});
