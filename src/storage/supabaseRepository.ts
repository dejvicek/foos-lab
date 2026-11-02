import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isEmptyScore } from '../domain/training';
import {
  playerFromRow,
  playerToRow,
  scoreToRow,
  soloRow,
  trainingFromRow,
  trainingToRow,
  type PlayerRow,
  type ScoreRow,
  type SoloRow,
  type TrainingRow,
} from './mapping';
import { parseSoloKey, soloKey } from '../domain/solo';
import type { SoloMetric } from '../domain/types';
import { fromPostgrest } from './errors';
import type { Repository } from './repository';

const PAGE = 1000; // PostgREST vrací nejvýš 1000 řádků na dotaz

function check<T>(res: { data: T | null; error: { message: string; code?: string } | null; status: number }): T {
  if (res.error) throw fromPostgrest(res.error, res.status);
  return res.data as T;
}

async function selectAll<T>(client: SupabaseClient, table: string, orderBy: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select('*');
    for (const col of orderBy) q = q.order(col);
    const rows = check<T[]>(await q.range(from, from + PAGE - 1));
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Jeden klient pro data i přihlášení; přihlášení se pamatuje v prohlížeči. */
export const createSupabase = (url: string, anonKey: string): SupabaseClient =>
  createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

export function supabaseRepository(client: SupabaseClient): Repository {

  return {
    async loadAll() {
      const [players, trainings, scores, solo] = await Promise.all([
        selectAll<PlayerRow>(client, 'players', ['id']),
        selectAll<TrainingRow>(client, 'trainings', ['id']),
        selectAll<ScoreRow>(client, 'scores', ['training_id', 'match_id']),
        selectAll<SoloRow>(client, 'solo_results', ['training_id', 'player_id', 'metric', 'round']),
      ]);
      return {
        players: players.map(playerFromRow),
        trainings: trainings.map((t) => trainingFromRow(t, scores, solo)),
      };
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
