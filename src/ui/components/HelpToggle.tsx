/** Otazník nápovědy kola (Moje hry i Rozpis, 19. 11. 2026): bez rámečku, otevřený zlatě; obsah pod řádkem se stoly. */
export function HelpToggle({ open, onToggle, label }: { open: boolean; onToggle(): void; label?: string }) {
  return (
    <button
      type="button"
      className="help-ic"
      aria-label={label ? `Nápověda: ${label}` : 'Nápověda'}
      aria-expanded={open}
      title="Nápověda"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      ?
    </button>
  );
}
