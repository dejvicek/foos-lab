import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { RoundCards } from './RoundCards';
import { buildSchedule } from '../../domain/schedule';
import { bump } from '../../domain/legState';
import type { Match, Player, Score, Training } from '../../domain/types';

const players: Player[] = Array.from({ length: 8 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const names = Object.fromEntries(players.map((p) => [p.id, p.name]));
const base: Training = {
  id: 't1', date: '2026-10-31', startTime: '18:00', mode: 'team', tables: 4,
  attendees: players.map((p) => p.id), scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [],
};

function Harness({ me = 'id1', canMatch = () => true }: { me?: string; canMatch?(m: Match): boolean }) {
  const [t, setT] = useState(base);
  const [open, setOpen] = useState<string | null>(null);
  const s = buildSchedule(t);
  return (
    <RoundCards
      schedule={s}
      training={t}
      names={names}
      current={null}
      expanded={open}
      onToggle={(k) => setOpen(open === k ? '' : k)}
      canMatch={canMatch}
      canSolo={() => true}
      tap={{
        me,
        onBumpScore: (m: Match, f: keyof Score, d: number) => setT((x) => ({ ...x, scores: { ...x.scores, [m.id]: bump(m, x.scores[m.id] ?? {}, f, d) } })),
        onBumpSolo: () => {},
      }}
    />
  );
}

describe('Celý rozpis na telefonu – karty kol', () => {
  it('kolo je karta s časem a pravidlem; rozbalená ukáže stoly, můj stůl podbarvený', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const kolo1 = screen.getByRole('button', { name: /^19:00 Kolo 1/ });
    expect(kolo1).toHaveAttribute('aria-expanded', 'false');
    await user.click(kolo1);
    const card = kolo1.closest('article')!;
    const tables = within(card).getAllByRole('button', { name: /^Stůl \d/ });
    expect(tables).toHaveLength(2); // n=8, t=4: 2 dvojice
    expect(tables[0]).toHaveTextContent('H1 + H2 vs H3 + H4');
    expect(tables[0]).toHaveClass('mine');
    expect(tables[1]).not.toHaveClass('mine');
  });

  it('ťuknutí na stůl otevře zrcadlo stolu, góly se ťukají', async () => {
    const user = userEvent.setup();
    render(<Harness me="id5" />);
    await user.click(screen.getByRole('button', { name: /^19:00 Kolo 1/ }));
    const card = screen.getByRole('button', { name: /^19:00 Kolo 1/ }).closest('article')!;
    // můj stůl (2) je otevřený rovnou
    expect(within(card).getByRole('button', { name: /^Gól vlevo \(H5 \+ H6\)/ })).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: /^Stůl 1/ }));
    await user.click(within(card).getByRole('button', { name: /^Gól vpravo \(H3 \+ H4\)/ }));
    expect(within(card).getByRole('button', { name: /^Stůl 1/ })).toHaveTextContent('0:1');
    expect(card).toHaveTextContent('0/2');
    for (let i = 0; i < 5; i++) await user.click(within(card).getByRole('button', { name: /^Gól vpravo \(H3 \+ H4\)/ }));
    expect(within(card).getByRole('button', { name: /^Stůl 1/ })).toHaveTextContent('0:6');
    expect(card).toHaveTextContent('1/2'); // dohraný leg se počítá
  });

  it('cizí stůl jde otevřít jen ke čtení', async () => {
    const user = userEvent.setup();
    render(<Harness me="id5" canMatch={(m) => m.sideA.includes('id5') || m.sideB.includes('id5')} />);
    await user.click(screen.getByRole('button', { name: /^19:00 Kolo 1/ }));
    const card = screen.getByRole('button', { name: /^19:00 Kolo 1/ }).closest('article')!;
    await user.click(within(card).getByRole('button', { name: /^Stůl 1/ }));
    expect(within(card).getByRole('button', { name: /^Gól vlevo/ })).toBeDisabled();
  });
});
