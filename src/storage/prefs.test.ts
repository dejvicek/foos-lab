import { defaultPrefs, loadPrefs, loadTimelineView, savePrefs, saveTimelineView, subscribeTimelineView } from './prefs';

describe('prefs', () => {
  beforeEach(() => localStorage.clear());
  it('výchozí: forma + průměr', () => {
    expect(loadPrefs()).toEqual({ ladderRange: { kind: 'form' }, ladderView: 'avg', ladderPart: 'matches' });
  });
  it('uloží a načte', () => {
    savePrefs({ ladderRange: { kind: 'custom', from: '2026-10-01', to: '2026-10-31' }, ladderView: 'total', ladderPart: 'solo' });
    expect(loadPrefs()).toEqual({ ladderRange: { kind: 'custom', from: '2026-10-01', to: '2026-10-31' }, ladderView: 'total', ladderPart: 'solo' });
  });
  it('nečitelná data → výchozí', () => {
    localStorage.setItem('foosball-practice.prefs.v1', '{rozbité');
    expect(loadPrefs()).toEqual(defaultPrefs());
  });
  it('zobrazení Průběhu: výchozí sloupec, volba se pamatuje a ohlásí', () => {
    expect(loadTimelineView()).toBe('column');
    const seen: string[] = [];
    const off = subscribeTimelineView(() => seen.push(loadTimelineView()));
    saveTimelineView('curve');
    expect(loadTimelineView()).toBe('curve');
    off();
    saveTimelineView('column');
    expect(seen).toEqual(['curve']);
    localStorage.setItem('foosball-practice.timeline-view.v1', 'nesmysl');
    expect(loadTimelineView()).toBe('column');
  });
});
