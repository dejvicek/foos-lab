import { render, screen } from '@testing-library/react';
import { DrillTimeline, MatchTimeline } from './GameTimeline';
import type { GameEvent, Match } from '../../domain/types';

beforeEach(() => localStorage.clear());

const ev = (i: number, kind: GameEvent['kind'], extra: Partial<GameEvent>): GameEvent => ({ id: `e${i}`, itemId: 'm', at: 1000 + i * 1000, kind, delta: 1, ...extra });
const names = { a1: 'Novák', a2: 'Dvořák', b1: 'Svoboda', b2: 'Černý' };
const match = (extra: Partial<Match> = {}): Match => ({ id: 'm', kind: 'doubles', block: 'league', sideA: ['a1', 'a2'], sideB: ['b1', 'b2'], ...extra }) as Match;

it('zápas: jen křivka vedení (Sloupec zrušen 18. 11. 2026), bez přepínače; krátká legenda stran', () => {
  const events = [ev(1, 'goal', { side: 'B' }), ev(3, 'goal', { side: 'A' })];
  const { container } = render(<MatchTimeline match={match()} events={events} from={0} to={5000} names={names} />);
  expect(screen.getByRole('img', { name: 'Křivka vedení, konečný stav 1:1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Sloupec|Křivka/ })).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
  expect(container.querySelector('.tl-legend')).toHaveTextContent('Novák + DvořákSvoboda + Černý');
  expect(screen.queryByText(/vede/)).toBeNull();
  expect([...container.querySelectorAll('.tl-pt')].map((c) => c.getAttribute('class'))).toEqual(['tl-pt side-b', 'tl-pt side-a']);
  expect([...container.querySelectorAll('.tl-pt title')].map((t) => t.textContent)).toEqual(['Gól: Svoboda + Černý v 0:02 → 0:1', 'Gól: Novák + Dvořák v 0:04 → 1:1']);
  expect(container.querySelector('.tl-tax-step')).toBeNull();
  // čas po čtvrtinách celku (5 s): 0:00 · 0:01 · 0:02 · 0:04 · 0:05
  expect([...container.querySelectorAll('svg text.tl-time')].slice(-5).map((x) => x.textContent)).toHaveLength(5);
});

it('zápas: obrat se nevyznačuje – jen křivka (19. 11. 2026)', () => {
  const events = [ev(1, 'goal', { side: 'B' }), ev(2, 'goal', { side: 'A' }), ev(3, 'goal', { side: 'A' })];
  const { container } = render(<MatchTimeline match={match()} events={events} from={0} to={5000} names={names} />);
  expect(container.querySelector('.tl-turn')).toBeNull();
  expect(container).not.toHaveTextContent('obrat');
});

it('Daň (19. 11. 2026): gól ze ztráty soupeře má čárkovaný schod a kroužek; legenda jen jména', () => {
  const events = [ev(1, 'goal', { side: 'B' }), ev(2, 'loss', { side: 'B' }), ev(2.01, 'goal', { side: 'A' }), ev(3, 'goal', { side: 'A' })];
  const { container } = render(<MatchTimeline match={match({ lossTax: true, trackLosses: true })} events={events} from={0} to={5000} names={names} />);
  expect(container.querySelectorAll('.tl-tax-step')).toHaveLength(1);
  expect(container.querySelectorAll('.tl-tax-ring')).toHaveLength(1);
  expect(container.querySelectorAll('.tl-loss-pt')).toHaveLength(0); // ztráta je vidět na gólu, ne zvlášť
  expect(container.querySelector('.tl-legend')).toHaveTextContent(/^Novák \+ DvořákSvoboda \+ Černý$/);
  expect([...container.querySelectorAll('.tl-pt title')].map((t) => t.textContent)).toEqual([
    'Gól: Svoboda + Černý v 0:02 → 0:1',
    'Gól ze ztráty soupeře: Novák + Dvořák v 0:03 → 1:1',
    'Gól: Novák + Dvořák v 0:04 → 2:1',
  ]);
});

it('ztráta bez gólu soupeře hned po ní (starší data): značka na ose', () => {
  const events = [ev(1, 'goal', { side: 'B' }), ev(2, 'loss', { side: 'A' }), ev(3, 'goal', { side: 'A' })];
  const { container } = render(<MatchTimeline match={match({ trackLosses: true })} events={events} from={0} to={5000} names={names} />);
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
  expect(screen.getByText('pokus')).toBeInTheDocument();
  expect(container.querySelectorAll('.tl-loss-pt')).toHaveLength(1);
  // povedené pokusy jako tečky v barvě hráče; bez legendy pod grafem
  expect(container.querySelectorAll('circle.tl-pt.pl-0')).toHaveLength(1);
  expect(container.querySelector('circle.tl-pt title')).toHaveTextContent('1. pokus povedený');
  expect(container.querySelector('.tl-sums')).toBeNull();
});

it('krátký scénář (23. 11. 2026): místo křivky řada stavů gól po gólu s časem, bez věty', () => {
  const events = [ev(37, 'goal', { side: 'B' }), ev(60, 'goal', { side: 'A' }), ev(101, 'goal', { side: 'A' })];
  const { container } = render(<MatchTimeline match={match({ start: [4, 4] })} events={events} from={1000} to={110_000} names={names} />);
  expect(screen.queryByRole('img', { name: /Křivka vedení/ })).toBeNull();
  const seq = screen.getByRole('list', { name: 'Gól po gólu, konečný stav 6:5' });
  const items = [...seq.querySelectorAll('li')];
  expect(items.map((li) => li.querySelector('.gs-sc')?.textContent)).toEqual(['4:4', '4:5', '5:5', '6:5']);
  expect(items.map((li) => li.querySelector('small')?.textContent)).toEqual(['start', '0:37', '1:00', '1:41']);
  expect(items.map((li) => li.className)).toEqual(['gs-start', 'side-b', 'side-a', 'side-a last']);
  // legenda stran zůstává
  expect(container.querySelector('.tl-legend')).toHaveTextContent('Novák + DvořákSvoboda + Černý');
});
