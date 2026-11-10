import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

it('zápas – sloupec (výchozí): obě strany v jednom pořadí se stavem skóre od scénářového startu', () => {
  const events = [ev(1, 'goal', { side: 'B' }), ev(2, 'loss', { side: 'A' }), ev(3, 'goal', { side: 'A' })];
  render(<MatchTimeline match={match({ start: [4, 4] })} events={events} from={0} to={5000} names={names} />);
  expect(screen.getByRole('button', { name: 'Sloupec' })).toHaveAttribute('aria-pressed', 'true');
  const rows = within(screen.getByRole('table', { name: 'Průběh po událostech' })).getAllByRole('row').slice(1);
  expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
    'Start 4:4',
    'Gól: Svoboda + Černý, 4:5 v 0:02',
    'Ztráta: Novák + Dvořák v 0:03',
    'Gól: Novák + Dvořák, 5:5 v 0:04',
  ]);
  // podbarvení podle vedoucí strany: 4:5 vede pravá, ztráta to nemění, 5:5 nikdo
  expect(rows.map((r) => r.querySelector('.tl-col-s')!.className)).toEqual(['tl-col-s', 'tl-col-s lead-b', 'tl-col-s lead-b', 'tl-col-s']);
});

it('simulace: místo gólů sety', () => {
  render(<MatchTimeline match={match({ block: 'sim' })} events={[ev(1, 'goal', { side: 'A' })]} from={0} to={3000} names={names} />);
  expect(screen.getByRole('row', { name: 'Set: Novák + Dvořák, 1:0 v 0:02' })).toBeInTheDocument();
});

it('přepínač Křivka platí pro zápasy i cvičení a zařízení si ho pamatuje', async () => {
  const user = userEvent.setup();
  const drill = [ev(1, 'hit', { playerId: 'a1' }), ev(2, 'miss', { playerId: 'b1' })];
  render(
    <>
      <MatchTimeline match={match()} events={[ev(1, 'goal', { side: 'A' })]} from={0} to={3000} names={names} />
      <DrillTimeline players={['a1', 'b1']} events={drill} names={names} />
    </>,
  );
  await user.click(screen.getAllByRole('button', { name: 'Křivka' })[0]);
  expect(screen.getByRole('img', { name: 'Křivka vedení, konečný stav 1:0' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Povedené pokusy po pokusech' })).toBeInTheDocument();
  expect(screen.queryByRole('table')).toBeNull();
  expect(localStorage.getItem('foosball-practice.timeline-view.v1')).toBe('curve');
  await act(async () => user.click(screen.getAllByRole('button', { name: 'Sloupec' })[1]));
  expect(screen.getAllByRole('table')).toHaveLength(2);
});

it('cvičení – sloupec: řádek = pokus, sloupec = hráč; nad 10 pokusů dvě půlky s počtem povedených', () => {
  const seq = '++-+++++--+++-++-+++';
  const events = [...seq].map((c, i) => ev(i, c === '+' ? 'hit' : 'miss', { playerId: 'a1' }));
  render(<DrillTimeline players={['a1']} events={events} names={names} />);
  const first = screen.getByRole('table', { name: 'Pokusy 1–10' });
  expect(within(first).getByRole('cell', { name: 'Novák, 3. pokus nepovedený' })).toHaveTextContent('✗');
  expect(within(first).getByRole('cell', { name: 'Novák, 4. pokus povedený' })).toHaveTextContent('3');
  expect(within(screen.getByRole('table', { name: 'Pokusy 11–20' })).getByText('8/10')).toBeInTheDocument();
});
