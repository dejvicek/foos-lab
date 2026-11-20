import { roundRule } from './RoundHeader';
import type { Assignment } from '../../domain/my';
import type { Match, ScheduleRow } from '../../domain/types';

const row = { kind: 'matches', label: '5. kolo', time: 0, cells: [], waiting: [] } as unknown as ScheduleRow;
const match = (x: Partial<Match>): Match => ({ id: 'm', block: 'league', round: 5, table: 1, kind: 'doubles', sideA: ['a', 'b'], sideB: ['c', 'd'], ...x });
const play = (m: Match): Assignment => ({ row, role: 'play', table: 1, match: m });

describe('roundRule – pravidlo kola z pohledu hráče', () => {
  it('scénářový start: kdo začíná s kolika, se neříká – je to vidět ze skóre (20. 11. 2026)', () => {
    expect(roundRule(play(match({ start: [0, 3] })), 'a')).toBe('');
    expect(roundRule(play(match({ start: [4, 5] })), 'c')).toBe('');
  });

  it('Zeď a Daň za ztrátu dál z pohledu hráče', () => {
    expect(roundRule(play(match({ wall: 'A' })), 'a')).toBe('Vaše strana drží zeď.');
    expect(roundRule(play(match({ wall: 'A' })), 'c')).toBe('Soupeř drží zeď, vy ji lámete.');
    expect(roundRule(play(match({ lossTax: true })), 'a')).toBe('Ztráta = gól soupeře, ztráty čárkuje rozhodčí.');
  });
});
