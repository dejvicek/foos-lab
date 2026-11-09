import type { AppData } from './repository';

export function exportJson(data: AppData, today: string): { filename: string; json: string } {
  return {
    filename: `foosball-zaloha-${today}.json`,
    json: JSON.stringify({ version: 1, exportedAt: today, players: data.players, trainings: data.trainings, catalog: data.catalog ?? {} }, null, 2),
  };
}
