import { Fragment, useState, type ReactNode } from 'react';
import changelog from '../../../CHANGELOG.md?raw';
import { APP_VERSION } from '../../storage/appVersion';
import { parseChangelog, type PatchEntry } from '../patchNotes';

/** Všechny vydané verze z CHANGELOG.md (nejnovější nahoře). */
export const PATCH_NOTES: PatchEntry[] = parseChangelog(changelog);

/** **tučně** v řádku. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>));
}

type Block = { kind: 'p'; text: string } | { kind: 'group'; title: string | null; items: string[] };

/** Záznam verze: první odstavec = shrnutí, dál skupiny odrážek (nadpis „**U stolu**“ na samostatném řádku) a odstavce. */
function blocks(md: string): { lead: string | null; rest: Block[] } {
  const out: Block[] = [];
  for (const raw of md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
    const lines = raw.split('\n');
    const title = /^\*\*[^*]+\*\*$/.test(lines[0]) ? lines[0].slice(2, -2) : null;
    const rest = title ? lines.slice(1) : lines;
    if (rest.length && rest.every((l) => l.startsWith('- '))) out.push({ kind: 'group', title, items: rest.map((l) => l.slice(2)) });
    else {
      if (title) out.push({ kind: 'group', title, items: [] });
      if (rest.length) out.push({ kind: 'p', text: rest.join(' ') });
    }
  }
  const lead = out[0]?.kind === 'p' ? out[0].text : null;
  return { lead, rest: lead ? out.slice(1) : out };
}

function Entry({ e, fresh, initiallyOpen }: { e: PatchEntry; fresh: boolean; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const { lead, rest } = blocks(e.body);
  const current = e.version === APP_VERSION;
  const id = `pn-${e.version.replace(/\./g, '-')}`;
  return (
    <li className={['pn-entry', current ? 'is-current' : '', fresh ? 'is-fresh' : ''].filter(Boolean).join(' ')} aria-labelledby={`${id}-h`}>
      <span className="pn-node" aria-hidden="true" />
      <h2 id={`${id}-h`} className="pn-version">
        <span className="pn-num">{e.version}</span>
        <span className="pn-date">{e.date}</span>
        {fresh && !current && <span className="pn-flag">Nové pro tebe</span>}
      </h2>
      {lead && <p className="pn-lead">{inline(lead)}</p>}
      {rest.length > 0 && (
        <>
          {open && (
            <div id={`${id}-body`} className="pn-body">
              {rest.map((b, i) =>
                b.kind === 'p' ? (
                  <p key={i}>{inline(b.text)}</p>
                ) : (
                  <Fragment key={i}>
                    {b.title && <h3>{b.title}</h3>}
                    {b.items.length > 0 && (
                      <ul>
                        {b.items.map((it, j) => (
                          <li key={j}>{inline(it)}</li>
                        ))}
                      </ul>
                    )}
                  </Fragment>
                ),
              )}
            </div>
          )}
          <button type="button" className="pn-more" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
            {open ? 'Skrýt podrobnosti' : 'Celý záznam'}
          </button>
        </>
      )}
    </li>
  );
}

/**
 * Stránka Co je nového (`#/patch-notes`, 20. 11. 2026, *rozhodnutí uživatele*): vydané verze na ose jako kola
 * v rozpisu, nejnovější nahoře. Běžící verze má plný zlatý uzel (bez štítku); verze, které zařízení ještě nevidělo, jsou
 * „Nové pro tebe“ a rozbalené, starší jen se shrnutím.
 */
export function PatchNotesPage({ entries = PATCH_NOTES, fresh = [] }: { entries?: PatchEntry[]; fresh?: string[] }) {
  return (
    <section className="pn-page" aria-labelledby="pn-title">
      <header className="pn-top">
        <h1 id="pn-title">Co je nového</h1>
        <p>Změny ve Foos Lab po verzích, nejnovější nahoře.</p>
      </header>
      {entries.length === 0 ? (
        <p className="note">Zatím tu žádná vydaná verze není.</p>
      ) : (
        <ol className="pn-rail">
          {entries.map((e, i) => (
            <Entry key={e.version} e={e} fresh={fresh.includes(e.version)} initiallyOpen={i === 0 || fresh.includes(e.version)} />
          ))}
        </ol>
      )}
    </section>
  );
}
