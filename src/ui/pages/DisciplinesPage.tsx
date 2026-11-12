import { useState, type ReactNode } from 'react';
import { catalogForm, helpOwner, resetDiscipline, saveDiscipline, saveSkills, validateDisciplineForm, validateSkills, type CatalogData, type DisciplineForm } from '../../domain/catalog';
import { disciplineDuration, disciplineFacts, disciplineHelp, disciplineScope, disciplineWho, MATCH_GENERAL_HELP, offeredDisciplines, SCOPE_LABEL } from '../../domain/disciplineInfo';
import { discipline, DISCIPLINES, drillSections, type DisciplineDef } from '../../domain/disciplines';
import { bySkillGroup, DEFAULT_SKILLS, matchesSkillFilter, SKILL_GROUPS, skillGroup, skillName, SKILLS, skillsIn, type Skill, type SkillDef, type SkillFilter, type SkillGroupId } from '../../domain/skills';
import type { DisciplineId } from '../../domain/types';
import type { AppStore } from '../useAppState';
import { MinStepper } from '../components/MinStepper';

const KIND_TITLE = { drill: 'Cvičení', match: 'Zápasy a scénáře', sim: 'Simulace' } as const;
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

const ICON: Record<'pair' | 'solo' | 'swap' | 'practice' | 'club', ReactNode> = {
  pair: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13 14.5c.9-.3 1.9-.5 3-.5 3 0 5.5 2 5.5 5" />
    </>
  ),
  solo: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5c0-3.4 2.9-5.5 6.5-5.5s6.5 2.1 6.5 5.5" />
    </>
  ),
  swap: <path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" />,
  // Kde se hraje (12. 11. 2026): domeček = jen vlastní trénink, štít = jen klubový trénink.
  practice: (
    <>
      <path d="M4 11.5L12 5l8 6.5" />
      <path d="M6.5 10v9h11v-9" />
      <path d="M10.5 19v-4.5h3V19" />
    </>
  ),
  club: (
    <>
      <path d="M12 3.5l7 2.5v5.5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
};
const Icon = ({ name }: { name: keyof typeof ICON }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {ICON[name]}
  </svg>
);

/** Disciplíny: kompaktní seznam (název, délka, kdo hraje, štítky), řádek se rozbalí na popis. Admin upravuje katalog. */
export function DisciplinesPage({ store, admin }: { store: AppStore; admin: boolean }) {
  const catalog = store.data.catalog ?? {};
  const [filter, setFilter] = useState<SkillFilter>({ skills: [], groups: [] });
  const [open, setOpen] = useState<Set<DisciplineId>>(new Set());
  const [editing, setEditing] = useState<DisciplineId | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [general, setGeneral] = useState(false);
  const offered = offeredDisciplines();
  const visible = offered.filter((d) => matchesSkillFilter(d.skills, filter));
  const filtering = filter.skills.length + filter.groups.length > 0;
  const hit = (s: Skill) => filtering && (filter.skills.includes(s) || filter.groups.includes(skillGroup(s).id));
  const toggleOpen = (id: DisciplineId) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const save = (c: CatalogData) => store.saveCatalog(c);

  return (
    <section className="disciplines-page">
      <h1>Disciplíny</h1>
      <p className="lead">Co se na tréninku hraje a co která disciplína trénuje. Klikni na řádek pro popis.</p>
      <div className="dp-filter">
        <span className="dp-filter-label">Trénuje:</span>
        <ul className="dp-chips" aria-label="Sekce dovedností">
          {SKILL_GROUPS.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                className={`dp-chip g-${g.id}`}
                aria-pressed={filter.groups.includes(g.id)}
                title={skillsIn(g.id).map((s) => s.name).join(', ')}
                onClick={() => setFilter((f) => ({ ...f, groups: toggle(f.groups, g.id) }))}
              >
                {g.name}
              </button>
            </li>
          ))}
        </ul>
        {admin && (
          <span className="dp-admin">
            <button type="button" className="ghost" aria-expanded={tagsOpen} onClick={() => setTagsOpen(!tagsOpen)}>
              Upravit štítky
            </button>
          </span>
        )}
        {filtering && (
          <p className="dp-filter-status">
            Filtr: <b>{[...filter.groups.map((g) => SKILL_GROUPS.find((x) => x.id === g)!.name), ...filter.skills.map(skillName)].join(', ')}</b> · {visible.length} z {offered.length}
            <button type="button" className="link" onClick={() => setFilter({ skills: [], groups: [] })}>
              Zrušit filtr
            </button>
          </p>
        )}
      </div>
      {admin && tagsOpen && <SkillsEditor catalog={catalog} newId={store.newId} onSave={(c) => (save(c), setTagsOpen(false))} onCancel={() => setTagsOpen(false)} />}
      <p className="dp-legend" aria-label="Vysvětlivky ikon">
        <span>
          <Icon name="pair" /> s bránícím soupeřem
        </span>
        <span>
          <Icon name="solo" /> jde i sám
        </span>
        <span>
          <Icon name="swap" /> 2 kola, strany si prohodí role
        </span>
        <span>
          <Icon name="practice" /> {SCOPE_LABEL.practice}
        </span>
        <span>
          <Icon name="club" /> {SCOPE_LABEL.club}
        </span>
      </p>
      {!visible.length && <p className="muted">Žádná disciplína neodpovídá filtru.</p>}
      {(['drill', 'match', 'sim'] as const)
        .filter((kind) => visible.some((d) => d.kind === kind))
        .map((kind) => {
          const list = visible.filter((d) => d.kind === kind);
          return (
            <section key={kind} className="dp-section" aria-labelledby={`dp-${kind}`}>
              <div className="dp-section-head">
                <h2 id={`dp-${kind}`}>{KIND_TITLE[kind]}</h2>
                <span className="dp-count">{list.length}</span>
                {kind === 'match' && (
                  <button type="button" className="link dp-general-toggle" aria-expanded={general} onClick={() => setGeneral(!general)}>
                    Obecná pravidla zápasů
                  </button>
                )}
              </div>
              {kind === 'match' && general && (
                <div className="dp-general">
                  {MATCH_GENERAL_HELP.map((it) => (
                    <div key={it.name}>
                      <h4>{it.name}</h4>
                      {it.parts.map((p, i) => (
                        <p key={i}>{p.text}</p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {(kind === 'drill' ? drillSections(list) : [{ area: null, name: null, drills: list }]).map((g) => (
                <div key={g.area ?? 'none'} className="dp-area" role={g.name ? 'group' : undefined} aria-label={g.name ?? undefined}>
                  {g.name && <h3 className="dp-area-head">{g.name}</h3>}
                  <ul className="dp-rows">
                    {g.drills.map((d) => (
                      <DisciplineRow
                        key={d.id}
                        d={d}
                        open={open.has(d.id)}
                        onToggle={() => toggleOpen(d.id)}
                        hit={hit}
                        onTag={(s) => setFilter((f) => ({ ...f, skills: toggle(f.skills, s) }))}
                      >
                        {editing === d.id ? (
                          <DisciplineEditor
                            id={d.id}
                            catalog={catalog}
                            onSave={(c) => (save(c), setEditing(null))}
                            onCancel={() => setEditing(null)}
                          />
                        ) : (
                          <>
                            <HelpList id={d.id} />
                            <div className="dp-facts">
                              {disciplineFacts(d.id).map((f) => (
                                <span key={f}>{f}</span>
                              ))}
                            </div>
                            {admin && (
                              <button type="button" className="ghost dp-edit" onClick={() => setEditing(d.id)}>
                                Upravit
                              </button>
                            )}
                          </>
                        )}
                      </DisciplineRow>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          );
        })}
    </section>
  );
}

function DisciplineRow({
  d,
  open,
  onToggle,
  hit,
  onTag,
  children,
}: {
  d: DisciplineDef;
  open: boolean;
  onToggle(): void;
  hit(s: Skill): boolean;
  onTag(s: Skill): void;
  children: ReactNode;
}) {
  const dur = disciplineDuration(d.id);
  const who = disciplineWho(d.id);
  const scope = disciplineScope(d.id);
  return (
    <li className={`dp-row${open ? ' open' : ''}`} aria-label={d.name}>
      {/* Kliknutí kamkoli do řádku rozbalí; pro klávesnici je přepínač u názvu. */}
      <div className="dp-head" onClick={onToggle}>
        <button type="button" className="dp-toggle" aria-expanded={open} aria-controls={`dp-detail-${d.id}`} onClick={(e) => (e.stopPropagation(), onToggle())}>
          <svg className="dp-chev" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
          <span className="dp-name">{d.name}</span>
        </button>
        <span className="dp-dur" title={dur.rounds === 2 ? `2 kola po ${dur.min} min` : undefined}>
          {dur.rounds === 2 && '2× '}
          <b>{dur.min}</b> min
        </span>
        <span className="dp-who" title={who?.label} aria-label={who?.label} role={who ? 'img' : undefined}>
          {who && <Icon name={who.icon} />}
        </span>
        <span className="dp-who dp-where" title={scope ? SCOPE_LABEL[scope] : undefined} aria-label={scope ? SCOPE_LABEL[scope] : undefined} role={scope ? 'img' : undefined}>
          {scope && <Icon name={scope} />}
        </span>
        <ul className="dp-tags" aria-label="Trénuje">
          {bySkillGroup(d.skills).map((s) => (
            <li key={s}>
              <button
                type="button"
                className={`dp-tag g-${skillGroup(s).id}${hit(s) ? ' hit' : ''}`}
                title={`Filtrovat: ${skillName(s)}`}
                onClick={(e) => (e.stopPropagation(), onTag(s))}
              >
                {skillName(s)}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {open && (
        <div className="dp-detail" id={`dp-detail-${d.id}`}>
          {children}
        </div>
      )}
    </li>
  );
}

/** Nápověda disciplíny: Cíl / Provedení / Počítá se ve dvou sloupcích. */
function HelpList({ id }: { id: DisciplineId }) {
  const help = disciplineHelp(id);
  return (
    <>
      {help.map((it) => (
        <div key={it.name}>
          {help.length > 1 && <h4>{it.name === discipline(id).explain ? discipline(id).name : it.name}</h4>}
          <dl className="dp-help">
            {it.parts.map((p, i) => (
              <div key={i}>
                <dt>{p.label ? p.label.replace(/:$/, '') : 'Pravidlo'}</dt>
                <dd>{p.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </>
  );
}

/** Admin: úprava disciplíny (název, délka kola, volitelnost, štítky, nápověda). */
function DisciplineEditor({ id, catalog, onSave, onCancel }: { id: DisciplineId; catalog: CatalogData; onSave(c: CatalogData): void; onCancel(): void }) {
  const [form, setForm] = useState<DisciplineForm>(() => catalogForm(id, catalog));
  const error = validateDisciplineForm(form);
  const owner = helpOwner(id);
  const edited = !!catalog.disciplines?.[id];
  const set = (patch: Partial<DisciplineForm>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <form
      className="dp-editor"
      aria-label={`Upravit ${discipline(id).name}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!error) onSave(saveDiscipline(catalog, id, form));
      }}
    >
      <div className="dp-editor-grid">
        <label htmlFor={`dp-name-${id}`}>Název</label>
        <input id={`dp-name-${id}`} type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        <span className="dp-editor-label">Délka kola</span>
        <div>
          <MinStepper value={form.min} label={form.name || discipline(id).name} onChange={(v) => set({ min: v })} />
          <p className="note">Platí pro nové tréninky a pro nezahájený trénink, když ho upravíš. Běžící a odehrané tréninky si nechají své časy.</p>
        </div>
        <span className="dp-editor-label">Štítky</span>
        <div className="dp-pick" role="group" aria-label="Štítky">
          {SKILL_GROUPS.map((g) => (
            <div key={g.id} className="dp-pick-group">
              <span className="dp-pick-title">{g.name}</span>
              {skillsIn(g.id).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`dp-chip small g-${g.id}`}
                  aria-pressed={form.skills.includes(s.id)}
                  onClick={() => set({ skills: toggle(form.skills, s.id) })}
                >
                  {s.name}
                </button>
              ))}
            </div>
          ))}
        </div>
        <span className="dp-editor-label">Nápověda</span>
        <div>
          {owner !== id && <p className="note">Text je společný s disciplínou {discipline(owner).name} – změna se projeví u obou.</p>}
          {form.help.map((p, i) => (
            <div key={i} className="dp-help-field">
              <label htmlFor={`dp-help-${id}-${i}`}>{p.label ? p.label.replace(/:$/, '') : 'Pravidlo'}</label>
              <textarea
                id={`dp-help-${id}-${i}`}
                rows={Math.min(8, Math.max(2, Math.ceil(p.text.length / 90)))}
                value={p.text}
                onChange={(e) => set({ help: form.help.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
              />
            </div>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions-row">
        <button type="submit" disabled={!!error}>
          Uložit
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Zrušit
        </button>
        {edited && (
          <button type="button" className="link" onClick={() => onSave(resetDiscipline(catalog, id))}>
            Obnovit výchozí
          </button>
        )}
      </div>
    </form>
  );
}

/** Admin: správa sady štítků (přejmenovat, přesunout do sekce, přidat, smazat). */
function SkillsEditor({ catalog, newId, onSave, onCancel }: { catalog: CatalogData; newId(): string; onSave(c: CatalogData): void; onCancel(): void }) {
  const [draft, setDraft] = useState<SkillDef[]>(() => SKILLS.map((s) => ({ ...s })));
  const error = validateSkills(draft);
  const uses = (id: Skill) => DISCIPLINES.filter((d) => !d.retired && d.skills?.includes(id)).length;
  const set = (id: Skill, patch: Partial<SkillDef>) => setDraft((xs) => xs.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  return (
    <form
      className="dp-skills-editor"
      aria-label="Upravit štítky"
      onSubmit={(e) => {
        e.preventDefault();
        if (!error) onSave(saveSkills(catalog, draft));
      }}
    >
      <h2>Štítky</h2>
      <p className="note">Přejmenování se projeví u všech disciplín. Smazaný štítek z disciplín zmizí.</p>
      <div className="dp-skills-groups">
        {SKILL_GROUPS.map((g) => (
          <fieldset key={g.id} className={`g-${g.id}`}>
            <legend>{g.name}</legend>
            {draft
              .filter((s) => s.group === g.id)
              .map((s) => (
                <div key={s.id} className="dp-skill-row">
                  <input type="text" aria-label={`Název štítku ${s.name || '(nový)'}`} value={s.name} onChange={(e) => set(s.id, { name: e.target.value })} />
                  <select aria-label={`Sekce štítku ${s.name || '(nový)'}`} value={s.group} onChange={(e) => set(s.id, { group: e.target.value as SkillGroupId })}>
                    {SKILL_GROUPS.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon"
                    aria-label={`Smazat štítek ${s.name || '(nový)'}`}
                    title={uses(s.id) ? `Je u ${uses(s.id)} disciplín – zmizí jim.` : 'Smazat'}
                    onClick={() => setDraft((xs) => xs.filter((x) => x.id !== s.id))}
                  >
                    ×
                  </button>
                </div>
              ))}
            <button type="button" className="link" onClick={() => setDraft((xs) => [...xs, { id: newId(), name: '', group: g.id }])}>
              + Přidat štítek
            </button>
          </fieldset>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions-row">
        <button type="submit" disabled={!!error}>
          Uložit štítky
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Zrušit
        </button>
        {catalog.skills && (
          <button type="button" className="link" onClick={() => setDraft(DEFAULT_SKILLS.map((s) => ({ ...s })))}>
            Vrátit výchozí sadu
          </button>
        )}
      </div>
    </form>
  );
}
