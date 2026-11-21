/**
 * Patch notes (20. 11. 2026, *rozhodnutí uživatele*): co je nového, přímo z CHANGELOG.md – záznam `## X.Y.Z – datum`
 * vzniká při každém vydání, takže se poznámky v appce doplní samy. Klik na číslo verze ukáže všechny;
 * po aktualizaci se jednou ukážou ty, které zařízení ještě nevidělo.
 */

export interface PatchEntry {
  version: string;
  /** „19. 11. 2026“ */
  date: string;
  /** Text záznamu (markdown: odstavce, odrážky, **tučně**). */
  body: string;
}

const HEAD = /^## (\d+\.\d+\.\d+)\s+[–-]\s+(.+?)\s*$/;

/** Záznamy verzí z CHANGELOG.md, v pořadí souboru (nejnovější nahoře); úvod před první verzí se vynechá. */
export function parseChangelog(md: string): PatchEntry[] {
  const out: PatchEntry[] = [];
  let cur: { version: string; date: string; lines: string[] } | null = null;
  const flush = () => cur && out.push({ version: cur.version, date: cur.date, body: cur.lines.join('\n').trim() });
  for (const line of md.split(/\r?\n/)) {
    const m = HEAD.exec(line);
    if (m) {
      flush();
      cur = { version: m[1], date: m[2], lines: [] };
    } else if (cur) cur.lines.push(line);
  }
  flush();
  return out;
}

/** Porovnání verzí X.Y.Z po číslech: kladné = a je novější. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/**
 * Co ukázat po spuštění: záznamy novější než naposledy viděná verze, nejvýš po běžící verzi (nejnovější nahoře).
 * Zařízení bez viděné verze (poprvé s touhle funkcí) dostane jen záznam běžící verze.
 */
export function notesSince(entries: PatchEntry[], seen: string | null, current: string): PatchEntry[] {
  const upTo = entries.filter((e) => compareVersions(e.version, current) <= 0);
  if (seen === null) return upTo.filter((e) => e.version === current);
  return upTo.filter((e) => compareVersions(e.version, seen) > 0);
}
