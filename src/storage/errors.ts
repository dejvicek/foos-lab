/** Chyba úložiště: `permanent` = opakování nepomůže (omezení DB, oprávnění, neplatná data). */
export class StorageError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    readonly userMessage: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Uložení nastavení tréninku vycházelo ze stavu, který mezitím změnilo jiné zařízení (migrace 25). */
export const STALE_TRAINING = 'FL409';

function describe(code: string, status: number): string {
  if (code === STALE_TRAINING) return 'trénink mezitím změnil někdo jiný';
  if (code === '23505') return 'jméno hráče už existuje';
  if (code === '23503') return 'trénink už neexistuje';
  if (code.startsWith('22')) return 'neplatná hodnota';
  if (code === '42501' || status === 401 || status === 403) return 'chybí oprávnění';
  return 'server změnu odmítl';
}

export function fromPostgrest(err: { message: string; code?: string }, status: number): Error {
  const code = err.code ?? '';
  const permanent =
    code === STALE_TRAINING || /^(22|23|42)/.test(code) || (status >= 400 && status < 500 && status !== 408 && status !== 429);
  return new StorageError(err.message, permanent, describe(code, status), code || undefined);
}

export const isPermanent = (e: unknown): boolean => e instanceof StorageError && e.permanent;

export const userMessageOf = (e: unknown): string =>
  e instanceof StorageError ? e.userMessage : 'neznámá chyba';
