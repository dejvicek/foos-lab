/**
 * Ikonka grafu – rozbalí Průběh hry (18. 11. 2026, *rozhodnutí uživatele*): bez rámečku, šedá, otevřená zlatá.
 * V Živě u rozehraných stolů, v Tréninku u stolů s ťukanými událostmi.
 */
export function ProgressToggle({ open, onToggle, label }: { open: boolean; onToggle(): void; label: string }) {
  return (
    <button
      type="button"
      className="pr-ic"
      aria-expanded={open}
      aria-label={`Průběh hry: ${label}`}
      title={open ? 'Skrýt průběh' : 'Průběh hry'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 3v14h14" />
        <path d="M5.5 13l3.5-4 3 2.5 4.5-6" />
      </svg>
    </button>
  );
}
