import { compareVersion, fetchLatestVersion } from './appVersion';

const mine = { build: 'abc1234', compat: 3 };
const reply = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe('verze appky', () => {
  it('stejné sestavení = aktuální; nezjištěná verze appku neomezuje', () => {
    expect(compareVersion(mine, { build: 'abc1234', compat: 3 })).toBe('current');
    expect(compareVersion(mine, null)).toBe('current');
  });

  it('novější sestavení se stejnou kompatibilitou = stačí obnovit při příležitosti', () => {
    expect(compareVersion(mine, { build: 'def5678', compat: 3 })).toBe('update');
  });

  it('novější sestavení s vyšší kompatibilitou = bez obnovení nejde pokračovat', () => {
    expect(compareVersion(mine, { build: 'def5678', compat: 4 })).toBe('required');
  });

  it('starší nasazení (návrat k předchozí verzi) nikoho nezablokuje', () => {
    expect(compareVersion(mine, { build: 'old0000', compat: 2 })).toBe('update');
  });

  it('fetchLatestVersion čte version.json mimo mezipaměť; cokoli nečitelného je null', async () => {
    const seen: [string, RequestInit | undefined][] = [];
    const ok = (async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      return { ok: true, json: async () => ({ build: 'def5678', compat: 4 }) };
    }) as unknown as typeof fetch;
    expect(await fetchLatestVersion(ok)).toEqual({ build: 'def5678', compat: 4 });
    expect(seen[0][0]).toMatch(/^version\.json\?/);
    expect(seen[0][1]).toMatchObject({ cache: 'no-store' });
    expect(await fetchLatestVersion(reply({ build: 'x' }))).toBeNull();
    expect(await fetchLatestVersion(reply('<!doctype html>'))).toBeNull();
    expect(await fetchLatestVersion(reply({}, false))).toBeNull();
    expect(
      await fetchLatestVersion((async () => {
        throw new Error('bez spojení');
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
});
