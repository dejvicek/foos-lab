import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { memoryRepository } from '../storage/memoryRepository';

type Repo = ReturnType<typeof memoryRepository>;

/**
 * Připravenost (18. 11. 2026): po vlastním „Připraven“ se přihlásí i druhá strana z jiného telefonu – utkání
 * začne. Najde utkání, kde je připravená jen část, a doplní zbytek (stejně jako živá změna ze serveru).
 */
export async function othersReady(repo: Repo): Promise<void> {
  let found: { tid: string; item: string; keys: string[]; missing: string[] } | null = null;
  await vi.waitFor(() => {
    for (const t of repo.snapshot().trainings)
      for (const [item, pt] of Object.entries(t.playTimes ?? {})) {
        if (!pt.ready || pt.startedAt !== undefined) continue;
        // cvičení: hráči skupiny z ID (drill|kolo|stůl|hráči), zápas: strany
        const keys = item.startsWith('drill|') ? item.split('|')[3].split('+') : ['A', 'B'];
        found = { tid: t.id, item, keys, missing: keys.filter((k) => pt.ready![k] === undefined) };
      }
    expect(found).not.toBeNull();
  });
  const { tid, item, keys, missing } = found!;
  let pt;
  for (const k of missing) pt = await repo.readyItem(tid, item, k, true, keys, Date.now());
  await act(async () => repo.emit().playTime(tid, item, pt!));
}
