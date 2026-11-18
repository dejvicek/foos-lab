import { useState, type ReactNode } from 'react';

/**
 * Řazení tabulek žebříčku podle libovolného sloupce (18. 11. 2026, *rozhodnutí uživatele*). Je to jen pohled:
 * oficiální pořadí (medaile, šnek Zdržovačů) se nemění a hráči pod čárou („málo dat“) zůstávají pod čárou,
 * řadí se zvlášť. Klik na záhlaví seřadí, další klik otočí směr, „#“ vrátí oficiální pořadí.
 */
export type SortDir = 'asc' | 'desc';
export interface Sort {
  key: string;
  dir: SortDir;
}

export interface SortCol<T> {
  key: string;
  label: ReactNode;
  /** Hodnota pro řazení; null (chybí, „–“) je vždy na konci. */
  value(r: T): number | string | null;
  /** Směr po prvním kliknutí: čísla od největšího, jméno a čas od nejmenšího. */
  first?: SortDir;
  className?: string;
}

/** Řádek s oficiálním místem (1 = první) a příznakem, jestli je nad čarou. */
export interface Placed<T> {
  r: T;
  place: number;
  ranked: boolean;
}

export function useSort(): [Sort | null, (col: { key: string; first?: SortDir } | null) => void] {
  const [sort, setSort] = useState<Sort | null>(null);
  const toggle = (col: { key: string; first?: SortDir } | null) =>
    setSort((cur) => (!col ? null : cur?.key === col.key ? { key: col.key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: col.first ?? 'desc' }));
  return [sort, toggle];
}

const cmp = (a: number | string | null, b: number | string | null, dir: SortDir): number => {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const d = typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b), 'cs') : a - b;
  return dir === 'asc' ? d : -d;
};

/**
 * Oficiální pořadí → řádky s místem, seřazené podle zvoleného sloupce; nad čarou a pod čarou zvlášť
 * (stabilně: při shodě oficiální pořadí).
 */
export function placeAndSort<T>(ranked: T[], lowData: T[], cols: SortCol<T>[], sort: Sort | null): Placed<T>[] {
  const placed = [...ranked.map((r, i) => ({ r, place: i + 1, ranked: true })), ...lowData.map((r, i) => ({ r, place: ranked.length + i + 1, ranked: false }))];
  const col = sort && cols.find((c) => c.key === sort.key);
  if (!col || !sort) return placed;
  const by = (xs: Placed<T>[]) => [...xs].sort((a, b) => cmp(col.value(a.r), col.value(b.r), sort.dir) || a.place - b.place);
  return [...by(placed.filter((x) => x.ranked)), ...by(placed.filter((x) => !x.ranked))];
}

const ariaSort = (sort: Sort | null, key: string): 'ascending' | 'descending' | undefined =>
  sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;

/** Záhlaví sloupce s tlačítkem řazení (aria-sort, šipka u zvoleného). */
export function SortTh<T>({ col, sort, onSort }: { col: SortCol<T>; sort: Sort | null; onSort(col: SortCol<T>): void }) {
  const on = sort?.key === col.key;
  return (
    <th className={col.className} aria-sort={ariaSort(sort, col.key)}>
      <button type="button" className={on ? 'th-sort on' : 'th-sort'} onClick={() => onSort(col)} title="Seřadit podle sloupce">
        {col.label}
        <span className="th-arrow" aria-hidden="true">
          {on ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

/** Záhlaví „#“: vrátí oficiální pořadí. */
export function RankTh({ sort, onReset }: { sort: Sort | null; onReset(): void }) {
  return (
    <th className="n rank" aria-sort={sort ? undefined : 'ascending'}>
      <button type="button" className={sort ? 'th-sort' : 'th-sort on'} onClick={onReset} title="Oficiální pořadí" aria-label="Oficiální pořadí">
        #
      </button>
    </th>
  );
}
