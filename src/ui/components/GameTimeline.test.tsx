import { render, screen } from '@testing-library/react';
import { DrillMarks } from './GameTimeline';
import type { GameEvent } from '../../domain/types';

it('průběh cvičení: srozumitelný souhrn – nejdelší série a poloviny pokusů', () => {
  const marks = [true, true, true, false, true, false, false, false];
  const events: GameEvent[] = marks.map((ok, i) => ({ id: `e${i}`, itemId: 'd', at: 1000 + i, kind: ok ? 'hit' : 'miss', playerId: 'a', delta: 1 }));
  render(<DrillMarks players={['a']} events={events} names={{ a: 'Dejv' }} />);
  expect(screen.getByText('4/8 · nejdelší série 3 · 1. půlka 3, 2. půlka 1')).toBeInTheDocument();
});
