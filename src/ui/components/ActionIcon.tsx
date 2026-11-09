import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  rename: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
    </>
  ),
  restore: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" />
      <path d="M4 4v5h5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </>
  ),
};

export type ActionIconName = keyof typeof PATHS;

/** Akční tlačítko jako ikona; `label` je popisek pro čtečky i bublina při najetí myší. */
export function ActionIconButton({ icon, label, onClick, danger }: { icon: ActionIconName; label: string; onClick(): void; danger?: boolean }) {
  return (
    <button type="button" className={`icon action-icon${danger ? ' danger' : ''}`} aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {PATHS[icon]}
      </svg>
    </button>
  );
}
