import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isEmptyScore } from '../domain/training';
import {
  playerFromRow,
  playerToRow,
  scoreToRow,
  scoreFromRowPublic,
  soloRow,
  trainingFromRow,
  playTimeFromRow,
  eventFromRow,
  type EventRow,
  scoreTapToJson,
  drillTapToJson,
  playTimeToRow,
  type PlayTimeRow,
  trainingToRow,
  type PlayerRow,
  type ScoreRow,
  type SoloRow,
  type TrainingRow,
} from './mapping';
import { parseSoloKey, soloKey } from '../domain/solo';
import type { SoloMetric } from '../domain/types';
import type { CatalogData } from '../domain/catalog';
import { fromPostgrest } from './errors';
import type { AppData, Repository } from './repository';

const PAGE = 1000; // PostgREST vrací nejvýš 1000 řádků na dotaz

function check<T>(res: { data: T | null; error: { message: string; code?: string } | null; status: number }): T {
  if (res.error) throw fromPostgrest(res.error, res.status);
  return res.data as T;
}

async function selectAll<T>(client: SupabaseClient, table: string, orderBy: string[], only?: { column: string; value: string }): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select('*');
    if (only) q = q.eq(only.column, only.value);
    for (const col of orderBy) q = q.order(col);
    const rows = check<T[]>(await q.range(from, from + PAGE - 1));
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/**
 * Nejdelší čekání na odpověď databáze. Bez limitu by jeden zaseknutý dotaz na špatném spojení
 * zablokoval celou frontu zápisů; po vypršení se zápis opakuje (zápisy jdou opakovat bezpečně).
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Jeden klient pro data i přihlášení; přihlášení se pamatuje v prohlížeči. */
export const createSupabase = (url: string, anonKey: string): SupabaseClient =>
  createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true }, db: { timeout: REQUEST_TIMEOUT_MS } });

let channelSeq = 0;

export function supabaseRepository(client: SupabaseClient): Repository {
  /** Průběh her (game_events) je největší tabulka – načítá se jen do zálohy; jinak po trénincích (loadEvents). */
  async function load(withEvents: boolean): Promise<AppData> {
    const [players, trainings, scores, solo, times, events, catalogRes] = await Promise.all([
      selectAll<PlayerRow>(client, 'players', ['id']),
      selectAll<TrainingRow>(client, 'trainings', ['id']),
      selectAll<ScoreRow>(client, 'scores', ['training_id', 'match_id']),
      selectAll<SoloRow>(client, 'solo_results', ['training_id', 'player_id', 'metric', 'round']),
      selectAll<PlayTimeRow>(client, 'play_times', ['training_id', 'item_id']),
      withEvents ? selectAll<EventRow>(client, 'game_events', ['training_id', 'at', 'id']) : Promise.resolve([]),
      client.from('catalog').select('data').eq('id', 1).maybeSingle(),
    ]);
    check(catalogRes);
    const catalog = catalogRes.data as { data: CatalogData } | null;
    return {
      players: players.map(playerFromRow),
      trainings: trainings.map((t) => trainingFromRow(t, scores, solo, times, events)),
      catalog: catalog?.data ?? {},
    };
  }

  return {
    loadAll: () => load(false),
    loadBackup: () => load(true),
    async loadEvents(trainingId) {
      const rows = await selectAll<EventRow>(client, 'game_events', ['at', 'id'], { column: 'training_id', value: trainingId });
      return rows.map(eventFromRow);
    },
    async saveCatalog(c) {
      check(await client.from('catalog').upsert({ id: 1, data: c, updated_at: new Date().toISOString() }));
    },
    async savePlayer(p) {
      check(await client.from('players').upsert(playerToRow(p)));
    },
    async deletePlayer(id) {
      check(await client.from('players').delete().eq('id', id));
    },
    async saveTraining(t) {
      check(await client.from('trainings').upsert(trainingToRow(t)));
    },
    async deleteTraining(id) {
      check(await client.from('trainings').delete().eq('id', id));
    },
    async saveScore(trainingId, matchId, s) {
      if (isEmptyScore(s)) {
        check(await client.from('scores').delete().eq('training_id', trainingId).eq('match_id', matchId));
      } else {
        const row = { ...scoreToRow(trainingId, matchId, s), updated_at: new Date().toISOString() };
        check(await client.from('scores').upsert(row, { onConflict: 'training_id,match_id' }));
      }
    },
    async saveSolo(trainingId, playerId, key, value) {
      const { metric, round } = parseSoloKey(key);
      if (value === null) {
        check(
          await client
            .from('solo_results')
            .delete()
            .eq('training_id', trainingId)
            .eq('player_id', playerId)
            .eq('metric', metric)
            .eq('round', round),
        );
      } else {
        const row = { ...soloRow(trainingId, playerId, key, value), updated_at: new Date().toISOString() };
        check(await client.from('solo_results').upsert(row, { onConflict: 'training_id,player_id,metric,round' }));
      }
    },
    async replaceSolo(trainingId, keep) {
      const rows = check<{ player_id: string; metric: SoloMetric; round: number }[]>(
        await client.from('solo_results').select('player_id,metric,round').eq('training_id', trainingId),
      );
      const k = new Set(keep.map((x) => `${x.playerId}::${x.key}`));
      for (const r of rows.filter((x) => !k.has(`${x.player_id}::${soloKey(x.metric, x.round)}`)))
        check(
          await client
            .from('solo_results')
            .delete()
            .eq('training_id', trainingId)
            .eq('player_id', r.player_id)
            .eq('metric', r.metric)
            .eq('round', r.round),
        );
    },
    async tapScore(trainingId, matchId, taps) {
      const res = await client.rpc('tap_score', { p_training: trainingId, p_match: matchId, p_taps: taps.map(scoreTapToJson) });
      return scoreFromRowPublic(check<ScoreRow>(res));
    },
    async tapDrill(trainingId, playerId, key, max, taps) {
      const { metric, round } = parseSoloKey(key);
      const res = await client.rpc('tap_drill', {
        p_training: trainingId, p_player: playerId, p_metric: metric, p_round: round, p_max: max, p_taps: taps.map(drillTapToJson),
      });
      const row = check<SoloRow>(res);
      return { value: row.value, attempts: row.attempts ?? null };
    },
    async savePlayTime(trainingId, itemId, p) {
      if (!p || (p.startedAt === undefined && p.endedAt === undefined))
        check(await client.from('play_times').delete().eq('training_id', trainingId).eq('item_id', itemId));
      else check(await client.from('play_times').upsert(playTimeToRow(trainingId, itemId, p), { onConflict: 'training_id,item_id' }));
    },
    async startItem(trainingId, itemId, at) {
      const res = await client.rpc('start_item', { p_training: trainingId, p_item: itemId, p_at: new Date(at).toISOString() });
      return playTimeFromRow(check<PlayTimeRow>(res));
    },
    async endItem(trainingId, itemId, startedAt, endedAt) {
      const res = await client.rpc('end_item', {
        p_training: trainingId,
        p_item: itemId,
        p_started: startedAt === undefined ? null : new Date(startedAt).toISOString(),
        p_ended: new Date(endedAt).toISOString(),
      });
      return playTimeFromRow(check<PlayTimeRow>(res));
    },
    subscribe(h) {
      const ch = client
        // Jedinečné jméno: StrictMode / rychlé znovupřihlášení jinak dostane odcházející kanál.
        .channel(`training-live-${++channelSeq}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, (p) => {
          const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as ScoreRow;
          if (!row?.training_id) return;
          const gone = p.eventType === 'DELETE';
          h.score(row.training_id, row.match_id, gone ? null : scoreFromRowPublic(row));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'solo_results' }, (p) => {
          const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as SoloRow;
          if (!row?.training_id) return;
          const gone = p.eventType === 'DELETE';
          h.solo(row.training_id, row.player_id, soloKey(row.metric, row.round ?? 0), gone ? null : row.value, gone ? null : (row.attempts ?? null));
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_events' }, (p) => {
          const row = p.new as EventRow;
          if (row?.training_id) h.event(row.training_id, eventFromRow(row));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'play_times' }, (p) => {
          const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as PlayTimeRow;
          if (!row?.training_id) return;
          h.playTime(row.training_id, row.item_id, p.eventType === 'DELETE' ? null : playTimeFromRow(row));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trainings' }, (p) => {
          if (p.eventType === 'DELETE') return h.training(null, (p.old as TrainingRow).id);
          const row = p.new as TrainingRow;
          h.training(trainingFromRow(row, [], []), row.id);
        })
        .subscribe((status) => {
          // Při každém (znovu)připojení dočíst, co mezitím proběhlo (i mezera mezi načtením a odběrem).
          if (status === 'SUBSCRIBED') h.resync();
        });
      return () => {
        void client.removeChannel(ch);
      };
    },
    async lockRounds(trainingId, locked, simTeams) {
      const { error, status } = await client.rpc('lock_rounds', { p_training: trainingId, p_locked: locked, p_sim_teams: simTeams });
      if (error) throw fromPostgrest(error, status);
    },
    async replaceScores(trainingId, keep) {
      const rows = check<{ match_id: string }[]>(
        await client.from('scores').select('match_id').eq('training_id', trainingId),
      );
      const k = new Set(keep);
      const drop = rows.map((r) => r.match_id).filter((id) => !k.has(id));
      if (drop.length) check(await client.from('scores').delete().eq('training_id', trainingId).in('match_id', drop));
    },
  };
}
