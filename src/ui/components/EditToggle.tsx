/**
 * Tužka – rozbalí kolo k zápisu (admin / organizátor, 19. 11. 2026, *rozhodnutí uživatele*): stejně jako ikonka
 * grafu bez rámečku, šedá, otevřená zlatá. Nahrazuje tlačítko „zapsat / opravit / zavřít“; název zůstává v aria-label.
 */
export function EditToggle({ open, done, label, onToggle }: { open: boolean; done: boolean; label: string; onToggle(): void }) {
  const what = open ? 'Zavřít' : done ? 'Opravit' : 'Zapsat';
  return (
    <button
      type="button"
      className="pr-ic edit-ic"
      aria-expanded={open}
      aria-label={`${what}: ${label}`}
      title={open ? 'Zavřít zápis' : done ? 'Opravit výsledek' : 'Zapsat výsledek'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M13.5 3.5l3 3L7 16H4v-3z" />
        <path d="M11.5 5.5l3 3" />
      </svg>
    </button>
  );
}
