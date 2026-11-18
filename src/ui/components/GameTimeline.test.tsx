import { render, screen } from '@testing-library/react';
import { DrillTimeline, MatchTimeline } from './GameTimeline';
import type { GameEvent, Match } from '../../domain/types';

beforeEach(() => localStorage.clear());

const ev = (i: number, kind: GameEvent['kind'], extra: Partial<GameEvent>): GameEvent => ({ id: `e${i}`, itemId: 'm', at: 1000 + i * 1000, kind, delta: 1, ...extra });
const names = { a1: 'Novák', a2: 'Dvořák', b1: 'Svoboda', b2: 'Černý' };
const match = (extra: Partial<Match> = {}): Match => ({ id: 'm', kind: 'doubles', block: 'league', sideA: ['a1', 'a2'], sideB: ['b1', 'b2'], ...extra }) as Match;

it('průběh cvičení: srozumitelný souhrn – nejdelší série a poloviny pokusů', () => {
  const marks = [true, true, true, false, true, false, false, false];
  const events: GameEvent[] = marks.map((ok, i) => ({ id: `e${i}`, itemId: 'd', at: 1000 + i, kind: ok ? 'hit' : 'miss', playerId: 'a', delta: 1 }));
  render(<DrillTimeline players={['a']} events={events} names={{ a: 'Dejv' }} />);
  expect(screen.getByText('4/8 · nejdelší série 3 · 1. půlka 3, 2. půlka 1')).toBeInTheDocument();
});

it('zápas: jen křivka vedení (Sloupec zrušen 18. 11. 2026), bez přepínače; krátká legenda stran', () => {
  const events = [ev(1, 'goal', { side: 'B' }), ev(3, 'goal', { side: 'A' })];
  const { container } = render(<MatchTimeline match={match({ start: [4, 4] })} events={events} from={0} to={5000} names={names} />);
  expect(screen.getByRole('img', { name: 'Křivka vedení, konečný stav 5:5' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Sloupec|Křivka/ })).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
  expect(container.querySelector('.tl-legend')).toHaveTextContent('Novák + DvořákSvoboda + Černý');
  expect(screen.queryByText(/vede/)).toBeNull();
  expect([...container.querySelectorAll('.tl-pt')].map((c) => c.getAttribute('class'))).toEqual(['tl-pt side-b', 'tl-pt side-a']);
  expect([...container.querySelectorAll('.tl-pt title')].map((t) => t.textContent)).toEqual(['Gól: Svoboda + Černý v 0:02 → 4:5', 'Gól: Novák + Dvořák v 0:04 → 5:5']);
  expect(container.querySelector('.tl-tax-step')).toBeNull();
});

it('zápas: obrat – první gól, po kterém vede strana, která prohrávala', () => {
  const events = [ev(1, 'goal', { side: 'B' }), ev(2, 'goal', { side: 'A' }), ev(3, 'goal', { side: 'A' })];
  const { container } = render(<MatchTimeline match={match()} events={events} from={0} to={5000} names={names} />);
  expect(container.querySelector('.tl-turn')).toHaveTextContent('obrat 2:1');
});

it('Daň (19. 11. 2026): gól ze ztráty soupeře má čárkovaný schod a kroužek, v legendě vysvětlení', () => {
  const events = [ev(1, 'goal', { side: 'B' }), ev(2, 'loss', { side: 'B' }), ev(2.01, 'goal', { side: 'A' }), ev(3, 'goal', { side: 'A' })];
  const { container } = render(<MatchTimeline match={match({ lossTax: true, trackLosses: true })} events={events} from={0} to={5000} names={names} />);
  expect(container.querySelectorAll('.tl-tax-step')).toHaveLength(1);
  expect(container.querySelectorAll('.tl-tax-ring')).toHaveLength(1);
  expect(container.querySelectorAll('.tl-loss-pt')).toHaveLength(0); // ztráta je vidět na gólu, ne zvlášť
  expect(container.querySelector('.tl-legend-tax')).toHaveTextContent('gól ze ztráty soupeře');
  expect([...container.querySelectorAll('.tl-pt title')].map((t) => t.textContent)).toEqual([
    'Gól: Svoboda + Černý v 0:02 → 0:1',
    'Gól ze ztráty soupeře: Novák + Dvořák v 0:03 → 1:1',
    'Gól: Novák + Dvořák v 0:04 → 2:1',
  ]);
});

it('ztráta bez gólu soupeře hned po ní (starší data): značka na ose', () => {
  const events = [ev(1, 'goal', { side: 'B' }), ev(2, 'loss', { side: 'A' }), ev(3, 'goal', { side: 'A' })];
  const { container } = render(<MatchTimeline match={match({ start: [4, 4], trackLosses: true })} events={events} from={0} to={5000} names={names} />);
  expect(container.querySelectorAll('.tl-loss-pt')).toHaveLength(1);
  expect(container.querySelector('.tl-tax-step')).toBeNull();
});

it('ztráty jen u Daně (18. 11. 2026): jinde se starší ťuknuté ztráty nezobrazí', () => {
  const events = [ev(1, 'goal', { side: 'B' }), ev(2, 'loss', { side: 'A' }), ev(3, 'goal', { side: 'A' })];
  const { container } = render(<MatchTimeline match={match()} events={events} from={0} to={5000} names={names} />);
  expect(screen.getByRole('img', { name: 'Křivka vedení, konečný stav 1:1' })).toBeInTheDocument();
  expect(container.querySelectorAll('.tl-loss-pt')).toHaveLength(0);
});

it('simulace: místo gólů sety', () => {
  const { container } = render(<MatchTimeline match={match({ block: 'sim' })} events={[ev(1, 'goal', { side: 'A' })]} from={0} to={3000} names={names} />);
  expect(container.querySelector('.tl-pt title')).toHaveTextContent('Set: Novák + Dvořák v 0:02 → 1:0');
});

it('cvičení: křivky povedených pokusů hráčů, nepovedené jako tečky; bez přepínače', () => {
  const drill = [ev(1, 'hit', { playerId: 'a1' }), ev(2, 'miss', { playerId: 'b1' })];
  const { container } = render(<DrillTimeline players={['a1', 'b1']} events={drill} names={names} />);
  expect(screen.getByRole('img', { name: 'Povedené pokusy po pokusech' })).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
  expect(container.querySelectorAll('.tl-pline')).toHaveLength(2);
  expect(container.querySelectorAll('.tl-loss-pt')).toHaveLength(1);
});
