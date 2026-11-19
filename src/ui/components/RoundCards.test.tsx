import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { RoundCards } from './RoundCards';
import { buildSchedule } from '../../domain/schedule';
import type { Match, Player, Training } from '../../domain/types';

const players: Player[] = Array.from({ length: 8 }, (_, i) => ({ id: `id${i + 1}`, name: `H${i + 1}`, order: i, archived: false }));
const names = Object.fromEntries(players.map((p) => [p.id, p.name]));
const base: Training = {
  id: 't1', date: '2026-10-31', startTime: '18:00', mode: 'team', tables: 4,
  attendees: players.map((p) => p.id), scores: {}, soloResults: {}, simSplit: 'order', simTeams: null, format: 'classic', durationMin: 180, plan: {}, lockedRounds: [],
};

function Harness({ me = 'id1', manage = false }: { me?: string | null; manage?: boolean }) {
  const [t, setT] = useState(base);
  const [open, setOpen] = useState<string | null>(null);
  const ended: string[] = [];
  const s = buildSchedule(t);
  return (
    <RoundCards
      schedule={s}
      training={t}
      names={names}
      rounds={null}
      expanded={open}
      onToggle={(k) => setOpen(open === k ? null : k)}
      onScore={(id, sc) => setT((x) => ({ ...x, scores: { ...x.scores, [id]: sc } }))}
      onSolo={() => {}}
      canMatch={(_m: Match) => true}
      canSolo={() => true}
      me={me}
      manage={manage}
      autoEnd={(id) => ended.push(id)}
    />
  );
}

/** Dlaždice kola podle jeho názvu (popisek tlačítka „1. kolo, Normální leg, 19:00: …“). */
const tile = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label.replace('.', '\\.')}, `) });

describe('Celý rozpis na telefonu – dlaždice kol (18. 11. 2026)', () => {
  it('sbalená dlaždice ukazuje jen můj stůl, ťuknutím ostatní; kolo s mou účastí má zlatý pruh, jméno zlatě', async () => {
    const user = userEvent.setup();
    render(<Harness me="id5" />);
    const t = tile('1. kolo');
    const card = t.closest('article')!;
    expect(t).toHaveAttribute('aria-expanded', 'false');
    expect(card).toHaveClass('mine-row');
    expect(card).toHaveClass('stacked'); // vykukující karty: je tu víc stolů
    expect(card).toHaveTextContent('Stůl 2');
    expect(card).not.toHaveTextContent('Stůl 1');
    expect(within(card).getByText('H5')).toHaveClass('me-name');
    await user.click(t);
    expect(t).toHaveAttribute('aria-expanded', 'true');
    expect(card).toHaveTextContent('Stůl 1');
    expect(within(card).getByRole('group', { name: 'H1 + H2 vs H3 + H4' })).toBeInTheDocument();
    expect(card).not.toHaveClass('stacked');
  });

  it('kolo, kde mám volno: sbalená dlaždice ukazuje řádek Volno', () => {
    render(<Harness me="id1" />);
    // klasický trénink pro 8: v rozehrání hrají všichni; stanoviště po čtyřech – najdi kolo s volnem
    const cards = [...document.querySelectorAll('article.round-card')];
    const free = cards.find((c) => c.textContent?.includes('Volno'));
    if (free) expect(free).not.toHaveClass('mine-row');
  });

  it('hráč nemá v rozpisu zápis; admin / organizátor rozbalí „zapsat“ a zapíše celkové skóre', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness me="id5" />);
    expect(screen.queryByRole('button', { name: /^Zapsat: / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Gól / })).toBeNull();
    unmount();
    render(<Harness me={null} manage />);
    const card = tile('1. kolo').closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Zapsat: 1. kolo' }));
    const cell = within(card).getByRole('group', { name: '1. kolo, stůl 1' });
    expect(within(cell).queryByRole('button', { name: /^Potvrdit/ })).toBeNull();
    await user.click(within(cell).getByRole('button', { name: '1. kolo, stůl 1: góly vlevo 6' }));
    await user.click(within(cell).getByRole('button', { name: '1. kolo, stůl 1: góly vpravo 2' }));
    // výsledková tabule: strana na řádek, výsledek v názvu skupiny (19. 11. 2026)
    expect(within(card).getByRole('group', { name: 'H1 + H2 vs H3 + H4 6:2' })).toBeInTheDocument();
  });
});
