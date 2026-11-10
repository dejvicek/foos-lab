import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { memoryRepository } from '../storage/memoryRepository';
import { cachedMe, memoryAuth, rememberMe, type AuthService, type Me } from '../storage/auth';
import { memorySnapshot } from '../storage/snapshot';
import type { Training } from '../domain/types';

const t: Training = { id: 't1', date: '2026-11-10', startTime: '18:00', soloResults: {}, simSplit: 'order', simTeams: null, format: 'custom', durationMin: 120, plan: {}, lockedRounds: [], mode: 'team', tables: 2, attendees: [], scores: {} };
const me: Me = { playerId: 'p1', isAdmin: false, mustChangePassword: false };
const players = [{ id: 'p1', name: 'Petr', archived: false, order: 0 }];

/** Přihlášení, které si zařízení pamatuje; ověření na serveru se chová podle `current`. */
const auth = (current: () => Promise<Me | null>): AuthService => ({ ...memoryAuth({ signedIn: me }), cached: () => me, current });

beforeEach(() => {
  window.location.hash = '#/trenink';
  localStorage.clear();
});

describe('App – rychlý start z uloženého stavu', () => {
  it('s uloženým přihlášením a stavem je appka na obrazovce hned, než cokoli odpoví', async () => {
    const repo = memoryRepository({ players, trainings: [t] });
    repo.hold(); // data ze serveru ještě nedorazila
    const snapshot = memorySnapshot({ data: { players, trainings: [t] }, cursor: null, savedAt: 1 });
    render(<App repo={repo} auth={auth(() => new Promise(() => {}))} snapshotFor={() => snapshot} />);
    expect(await screen.findByRole('list', { name: 'Uložené tréninky' })).toBeInTheDocument();
  });

  it('když se přihlášení nejde ověřit kvůli spojení, hráč zůstává přihlášený', async () => {
    const repo = memoryRepository({ players, trainings: [t] });
    render(<App repo={repo} auth={auth(() => Promise.reject(new Error('bez spojení')))} />);
    expect(await screen.findByRole('heading', { name: 'Trénink' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Přezdívka')).toBeNull();
  });

  it('když server řekne, že přihlášení už neplatí, ukáže se přihlášení', async () => {
    const repo = memoryRepository({ players, trainings: [t] });
    render(<App repo={repo} auth={auth(async () => null)} />);
    expect(await screen.findByLabelText('Přezdívka')).toBeInTheDocument();
  });

  it('po odhlášení se uložený stav hráče ze zařízení smaže', async () => {
    const repo = memoryRepository({ players, trainings: [t] });
    const snapshot = memorySnapshot({ data: { players, trainings: [t] }, cursor: null, savedAt: 1 });
    const asked: string[] = [];
    render(<App repo={repo} auth={memoryAuth({ signedIn: me })} snapshotFor={(id) => (asked.push(id), snapshot)} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Odhlásit' }));
    await waitFor(async () => expect(await snapshot.load()).toBeNull());
    expect(new Set(asked)).toEqual(new Set(['p1']));
  });
});

describe('přihlášení zapamatované v zařízení', () => {
  it('rememberMe / cachedMe: uloží, načte, null smaže; nečitelné = nic', () => {
    expect(cachedMe()).toBeNull();
    rememberMe(me);
    expect(cachedMe()).toEqual(me);
    localStorage.setItem(localStorage.key(0)!, '{rozbité');
    expect(cachedMe()).toBeNull();
    rememberMe(me);
    rememberMe(null);
    expect(cachedMe()).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
