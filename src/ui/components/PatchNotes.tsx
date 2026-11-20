import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import changelog from '../../../CHANGELOG.md?raw';
import { parseChangelog, type PatchEntry } from '../patchNotes';

/** Všechny vydané verze z CHANGELOG.md (nejnovější nahoře). */
export const PATCH_NOTES: PatchEntry[] = parseChangelog(changelog);

/** **tučně** v řádku. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>));
}

/** Záznam verze: odstavce, odrážky a nadpisy skupin („**U stolu**“ na samostatném řádku). */
function Body({ md }: { md: string }) {
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        const head = /^\*\*[^*]+\*\*$/.test(lines[0]) ? lines[0].slice(2, -2) : null;
        const rest = head ? lines.slice(1) : lines;
        const items = rest.filter((l) => l.startsWith('- '));
        return (
          <Fragment key={i}>
            {head && <h4>{head}</h4>}
            {items.length === rest.length && items.length ? (
              <ul>
                {items.map((l, j) => (
                  <li key={j}>{inline(l.slice(2))}</li>
                ))}
              </ul>
            ) : (
              rest.length > 0 && <p>{inline(rest.join(' '))}</p>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Okno „Co je nového“ (20. 11. 2026): po kliknutí na číslo verze všechny verze, po aktualizaci jen ty,
 * které zařízení ještě nevidělo. Zavírá se tlačítkem, Escem nebo kliknutím mimo okno.
 */
export function PatchNotesDialog({ entries, title, onClose }: { entries: PatchEntry[]; title: string; onClose(): void }) {
  const close = useRef<HTMLButtonElement>(null);
  // Fokus na Zavřít jen při otevření (ne při každém překreslení appky).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Mimo navigaci (portál do body): jinak by tlačítka v okně převzala styl lišty.
  return createPortal(
    <div className="pn-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pn-dialog" role="dialog" aria-modal="true" aria-labelledby="pn-title">
        <header className="pn-head">
          <h2 id="pn-title">{title}</h2>
          <button ref={close} type="button" className="ghost" onClick={onClose}>
            Zavřít
          </button>
        </header>
        <div className="pn-body">
          {entries.length === 0 && <p className="note">Zatím tu nic není.</p>}
          {entries.map((e) => (
            <section key={e.version} className="pn-entry" aria-label={`Verze ${e.version}`}>
              <h3>
                {e.version} <small>{e.date}</small>
              </h3>
              <Body md={e.body} />
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
