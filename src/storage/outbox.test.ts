import { freshOnly, localOutbox, memoryOutbox, OUTBOX_MAX_AGE_MS, type Queued } from './outbox';

const q = (at: number, id = 'a'): Queued => ({ at, op: { kind: 'deletePlayer', id } });

describe('odkládací fronta zápisů v zařízení', () => {
  beforeEach(() => localStorage.clear());

  it('uloží a načte frontu; prázdná fronta po sobě nic nenechá', () => {
    const box = localOutbox('hrac-1');
    box.save([q(1), q(2, 'b')]);
    expect(localOutbox('hrac-1').load()).toEqual([q(1), q(2, 'b')]);
    box.save([]);
    expect(localOutbox('hrac-1').load()).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it('každý přihlášený hráč má svou frontu', () => {
    localOutbox('hrac-1').save([q(1)]);
    expect(localOutbox('hrac-2').load()).toEqual([]);
  });

  it('nečitelný nebo cizí obsah se bere jako prázdná fronta', () => {
    localOutbox('x').save([q(1)]);
    const key = localStorage.key(0)!;
    localStorage.setItem(key, '{rozbité');
    expect(localOutbox('x').load()).toEqual([]);
    localStorage.setItem(key, JSON.stringify([{ at: 1 }, { op: { kind: 'deletePlayer', id: 'a' } }, q(3), 'x', null]));
    expect(localOutbox('x').load()).toEqual([q(3)]);
  });

  it('freshOnly oddělí zápisy starší než den', () => {
    const now = 10 * OUTBOX_MAX_AGE_MS;
    expect(freshOnly([q(now - OUTBOX_MAX_AGE_MS - 1), q(now - 1000, 'b'), q(now, 'c')], now)).toEqual({ fresh: [q(now - 1000, 'b'), q(now, 'c')], stale: 1 });
  });

  it('memoryOutbox drží kopie', () => {
    const box = memoryOutbox();
    const list = [q(1)];
    box.save(list);
    list.push(q(2));
    expect(box.load()).toEqual([q(1)]);
  });
});
