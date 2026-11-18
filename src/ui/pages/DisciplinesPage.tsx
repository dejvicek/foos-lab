import { useEffect, useState, type ReactNode } from 'react';
import { catalogForm, helpOwner, resetDiscipline, saveDiscipline, saveSkills, validateDisciplineForm, validateSkills, type CatalogData, type DisciplineForm } from '../../domain/catalog';
import { disciplineDuration, disciplineFacts, disciplineHelp, disciplinePlaces, disciplineWho, MATCH_GENERAL_HELP, offeredDisciplines, PLACE_KEYS, PLACE_LABEL, placesText } from '../../domain/disciplineInfo';
import type { Places } from '../../domain/disciplines';
import { discipline, DISCIPLINES, drillSections, type DisciplineDef } from '../../domain/disciplines';
import { bySkillGroup, DEFAULT_SKILLS, matchesSkillFilter, SKILL_GROUPS, skillGroup, skillName, SKILLS, skillsIn, type Skill, type SkillDef, type SkillFilter, type SkillGroupId } from '../../domain/skills';
import type { DisciplineId } from '../../domain/types';
import type { AppStore } from '../useAppState';
import { MinStepper } from '../components/MinStepper';
import { ballSecOf, CATALOG_FORMAT, catalogSimMins, defaultBallSec, drillBalls, drillRoundMin, goalRoundMin, isStreakDrill, MAX_BALL_SEC, maxGoals, MIN_BALL_SEC, usesBalls } from '../../domain/ballTime';
import { ballAverages, type BallAverage, type BallAverages } from '../../domain/ballStats';
import { fixedLegRule, SIM_FORMATS, type MatchFormat } from '../../domain/matchFormat';

/** Reálná doba míčku z průběhu her (jen admin; průběh se stahuje celý jako pro zálohu). */
type RealBalls = BallAverages | 'loading' | 'error';

const sec = (x: number) => `${Math.round(x)} s`;
/** „BO3 do 6, rozhodující o 2, strop 10“ */
const simName = (f: MatchFormat) => `BO${f.bestOf} do ${f.legTo}, rozhodující o 2, strop ${f.cap}`;
const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
/** „3:12“ – celkový čas Čisté desítky. */
const mmss = (x: number) => `${Math.floor(Math.round(x) / 60)}:${String(Math.round(x) % 60).padStart(2, '0')}`;
/**
 * Reálná hodnota s počtem měření: zápas „40 s (2 zápasy)“, cvičení „18 s (3 kola)“, Čistá desítka celkový
 * čas „3:12 (5 splnění)“; bez dat „zatím nic změřeno“.
 */
function realText(a: BallAverage | null | undefined, id: DisciplineId | 'match' | 'drill'): string {
  if (!a) return 'zatím nic změřeno';
  const kind = id === 'match' || id === 'drill' ? id : discipline(id).kind === 'drill' ? (isStreakDrill(discipline(id)) ? 'streak' : 'drill') : 'match';
  if (kind === 'streak') return `${mmss(a.sec)} (${a.n} splnění)`;
  const unit = kind === 'drill' ? plural(a.n, 'kolo', 'kola', 'kol') : plural(a.n, 'zápas', 'zápasy', 'zápasů');
  return `${sec(a.sec)} (${a.n} ${unit})`;
}

const KIND_TITLE = { drill: 'Cvičení', match: 'Zápasy a scénáře', sim: 'Simulace' } as const;
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/** Ikony: kde se hraje (panáčci – 12. 11. 2026: skupina = klub, jeden = sám, dva = ve dvou) a párový zápas. */
const ICON: Record<'club' | 'solo' | 'duo' | 'swap', ReactNode> = {
  club: (
    <>
      <circle cx="12" cy="6.8" r="2.5" />
      <circle cx="5.3" cy="9.3" r="2.1" />
      <circle cx="18.7" cy="9.3" r="2.1" />
      <path d="M7.6 18.8c0-2.8 1.9-4.6 4.4-4.6s4.4 1.8 4.4 4.6M2 17.6c0-2.2 1.4-3.7 3.3-3.7M22 17.6c0-2.2-1.4-3.7-3.3-3.7" />
    </>
  ),
  solo: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5c0-3.4 2.9-5.5 6.5-5.5s6.5 2.1 6.5 5.5" />
    </>
  ),
  duo: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13 14.5c.9-.3 1.9-.5 3-.5 3 0 5.5 2 5.5 5" />
    </>
  ),
  swap: <path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" />,
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
  // Filtr „Hraje se“ (12. 11. 2026): klubový / vlastní sám / vlastní ve dvou.
  const [place, setPlace] = useState<keyof Places | null>(null);
  const offered = offeredDisciplines();
  const visible = offered.filter((d) => matchesSkillFilter(d.skills, filter) && (!place || disciplinePlaces(d.id)[place]));
  const filtering = filter.skills.length + filter.groups.length > 0 || place !== null;
  const hit = (s: Skill) => filtering && (filter.skills.includes(s) || filter.groups.includes(skillGroup(s).id));
  const toggleOpen = (id: DisciplineId) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const save = (c: CatalogData) => store.saveCatalog(c);
  // Admin: reálná doba míčku ze všech klubových tréninků s průběhem (18. 11. 2026).
  const [real, setReal] = useState<RealBalls>('loading');
  const loadBackup = store.loadBackup;
  useEffect(() => {
    if (!admin) return;
    let live = true;
    setReal('loading');
    loadBackup().then(
      (d) => live && setReal(ballAverages(d.trainings)),
      () => live && setReal('error'),
    );
    return () => {
      live = false;
    };
  }, [admin, loadBackup]);

  return (
    <section className="disciplines-page">
      <h1>Disciplíny</h1>
      <p className="lead">Co se na tréninku hraje a co která disciplína trénuje. Klikni na řádek pro popis, na štítek nebo panáčka pro filtr.</p>
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
            Filtr:{' '}
            <b>
              {[...(place ? [PLACE_LABEL[place]] : []), ...filter.groups.map((g) => SKILL_GROUPS.find((x) => x.id === g)!.name), ...filter.skills.map(skillName)].join(', ')}
            </b>{' '}
            · {visible.length} z {offered.length}
            <button type="button" className="link" onClick={() => (setFilter({ skills: [], groups: [] }), setPlace(null))}>
              Zrušit filtr
            </button>
          </p>
        )}
      </div>
      {admin && tagsOpen && <SkillsEditor catalog={catalog} newId={store.newId} onSave={(c) => (save(c), setTagsOpen(false))} onCancel={() => setTagsOpen(false)} />}
      <p className="dp-legend" aria-label="Vysvětlivky ikon">
        <span>
          <Icon name="club" /> klubový trénink
        </span>
        <span>
          <Icon name="solo" /> solo
        </span>
        <span>
          <Icon name="duo" /> duo
        </span>
        <span>
          <Icon name="swap" /> 2 kola, strany si prohodí role
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
              {kind === 'drill' && (
                <p className="note dp-format-note">
                  Délky kol cvičení s pokusy: doba míčku × míčky v kole – ve dvojici 2 × 20 pokusů (každý hráč 20, pak se vystřídáte), sólové
                  cvičení 20. Rozcvička a Čistá desítka mají pevnou délku kola.
                </p>
              )}
              {kind !== 'drill' && (
                <p className="note dp-format-note">
                  {kind === 'match'
                    ? 'Délky kol jsou spočítané, jako by se hrálo BO1 do 6 (scénáře od svého startu): doba míčku × nejvíc možných gólů. V tréninku se přepočítají podle zvoleného formátu (BO2, BO3…).'
                    : `Délka podle formátu simulace v tréninku: ${catalogSimMins()
                        .map((x) => `${simName(x.format)} = 2 vlny po ${x.wave} min (${x.min} min)`)
                        .join('; ')}. Vlna = doba míčku × nejvíc možných gólů jednoho zápasu.`}
                </p>
              )}
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
                        place={place}
                        onPlace={(k) => setPlace(place === k ? null : k)}
                      >
                        {editing === d.id ? (
                          <DisciplineEditor
                            id={d.id}
                            catalog={catalog}
                            real={real}
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
                            {admin && (usesBalls(d.id) || isStreakDrill(d)) && <BallLine id={d.id} real={real} />}
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
  place,
  onPlace,
  children,
}: {
  d: DisciplineDef;
  open: boolean;
  onToggle(): void;
  hit(s: Skill): boolean;
  onTag(s: Skill): void;
  /** Filtr „kde se hraje“ – kliknutí na panáčka (12. 11. 2026). */
  place: keyof Places | null;
  onPlace(k: keyof Places): void;
  children: ReactNode;
}) {
  const dur = disciplineDuration(d.id);
  const sim = d.kind === 'sim' ? catalogSimMins() : null;
  const who = disciplineWho(d.id);
  const places = disciplinePlaces(d.id);
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
        <span className="dp-dur" title={sim ? sim.map((x) => `${simName(x.format)}: 2 vlny po ${x.wave} min = ${x.min} min`).join('\n') : dur.rounds === 2 ? `2 kola po ${dur.min} min` : undefined}>
          {sim ? (
            // Simulace (18. 11. 2026): čas pro BO3 i BO5.
            sim.map((x) => (
              <span key={x.format.bestOf}>
                BO{x.format.bestOf} <b>{x.min}</b> min
              </span>
            ))
          ) : (
            <span>
              {dur.rounds === 2 && '2× '}
              <b>{dur.min}</b> min
            </span>
          )}
          {/* Zápas a simulace: délka kola z doby míčku (18. 11. 2026) – doba míčku hned v řádku. */}
          {usesBalls(d.id) && (
            <small className="dp-ballsec" aria-label={`Doba míčku ${ballSecOf(d.id)} s`} title="Doba míčku – délka kola = doba míčku × nejvíc míčků v kole">
              {ballSecOf(d.id)} s / míček
            </small>
          )}
        </span>
        <span className="dp-places" role="group" aria-label={`Hraje se: ${placesText(places)}`}>
          {PLACE_KEYS.map((k) =>
            places[k] ? (
              <button
                key={k}
                type="button"
                className={`dp-place on${place === k ? ' hit' : ''}`}
                aria-pressed={place === k}
                aria-label={`Filtrovat: ${PLACE_LABEL[k]}`}
                title={`${PLACE_LABEL[k]} – filtrovat`}
                onClick={(e) => (e.stopPropagation(), onPlace(k))}
              >
                <Icon name={k} />
              </button>
            ) : (
              <span key={k} className="dp-place off" aria-hidden="true">
                <Icon name={k} />
              </span>
            ),
          )}
        </span>
        <span className="dp-who" title={who?.label} aria-label={who?.label} role={who ? 'img' : undefined}>
          {who && <Icon name={who.icon} />}
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

/** Admin u zápasu / simulace: doba míčku, z níž se počítá délka kola, a reálná doba míčku z průběhu her. */
function BallLine({ id, real }: { id: DisciplineId; real: RealBalls }) {
  const own = discipline(id).ballSec;
  const value = real === 'loading' ? 'počítám…' : real === 'error' ? 'nejde načíst' : <b>{realText(real.by[id], id)}</b>;
  // Čistá desítka: jen celkový čas (průměr časů splnění).
  if (isStreakDrill(discipline(id)))
    return (
      <p className="dp-ball" aria-label="Celkový čas">
        Celkový čas reálně: {value}
      </p>
    );
  return (
    <p className="dp-ball" aria-label="Doba míčku">
      Doba míčku <b>{sec(ballSecOf(id))}</b> {own === undefined ? '(výchozí)' : '(zadaná)'} · reálně {value}
    </p>
  );
}

/** Admin: úprava disciplíny (název, délka kola nebo doba míčku, štítky, nápověda). */
function DisciplineEditor({ id, catalog, real, onSave, onCancel }: { id: DisciplineId; catalog: CatalogData; real: RealBalls; onSave(c: CatalogData): void; onCancel(): void }) {
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
        {usesBalls(id) ? (
          <BallField id={id} name={form.name || discipline(id).name} value={form.ballSec} real={real} onChange={(ballSec) => set({ ballSec })} />
        ) : (
          <>
            <span className="dp-editor-label">Délka kola</span>
            <div>
              <MinStepper value={form.min} label={form.name || discipline(id).name} onChange={(v) => set({ min: v })} />
              <p className="note">Platí pro nové tréninky a pro nezahájený trénink, když ho upravíš. Běžící a odehrané tréninky si nechají své časy.</p>
              {isStreakDrill(discipline(id)) && (
                <p className="note" aria-label="Reálný celkový čas">
                  Reálně (průměr časů splnění):{' '}
                  {real === 'loading' ? 'počítám…' : real === 'error' ? 'průběh her nejde načíst' : <b>{realText(real.by[id], id)}</b>}
                </p>
              )}
            </div>
          </>
        )}
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

/**
 * Doba míčku (18. 11. 2026): délka kola = doba míčku × nejvíc míčků v kole (gólů ve formátu, pokusů ve
 * cvičení), nahoru na minuty. Prázdné = výchozí (zápasy 40 s, cvičení 20 s). Vedle reálný průměr z průběhu her.
 */
function BallField({ id, name, value, real, onChange }: { id: DisciplineId; name: string; value: number | null; real: RealBalls; onChange(v: number | null): void }) {
  // Délka v katalogu vždy pro BO1 do 6 (18. 11. 2026); v tréninku podle jeho formátu.
  const f = CATALOG_FORMAT;
  const d = discipline(id);
  const def = defaultBallSec(id);
  const s = value ?? def;
  const valid = Number.isInteger(s) && s >= MIN_BALL_SEC && s <= MAX_BALL_SEC;
  const mine = typeof real === 'object' ? real.by[id] : undefined;
  const drill = d.kind === 'drill';
  const sim = d.kind === 'sim';
  // „BO1 do 6“, „BO1, ze 4:4 do 6“, „BO1, ze 5:5 o 2, strop 10“.
  const rule = `BO1${d.start ? `, ze ${d.start.join(':')}` : ''} ${fixedLegRule(id) ? 'o 2, strop 10' : 'do 6'}`;
  const balls = drillBalls(id);
  const all = typeof real === 'object' ? (drill ? real.drills : real.matches) : null;
  return (
    <>
      <label className="dp-editor-label" htmlFor={`dp-ball-${id}`}>
        Doba míčku
      </label>
      <div>
        <span className="dp-ball-input">
          <input
            id={`dp-ball-${id}`}
            type="number"
            inputMode="numeric"
            min={MIN_BALL_SEC}
            max={MAX_BALL_SEC}
            step={1}
            aria-label={`Doba míčku v sekundách: ${name}`}
            placeholder={String(def)}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />{' '}
          s
        </span>
        {value !== null && (
          <button type="button" className="link" onClick={() => onChange(null)}>
            Výchozí ({def} s)
          </button>
        )}
        <p className="note">
          {!valid ? (
            `Doba míčku musí být ${MIN_BALL_SEC}–${MAX_BALL_SEC} s.`
          ) : drill ? (
            <>
              Délka kola: {s} s × {balls} míčků ({d.needsPartner ? `2 × ${balls / 2} pokusů – každý hráč ${balls / 2}, pak se vystřídáte` : `${balls} pokusů`}) ={' '}
              <b>{drillRoundMin(id, s)} min</b>.
            </>
          ) : sim ? (
            SIM_FORMATS.map((sf) => (
              <span key={sf.bestOf} className="dp-ball-calc">
                {simName(sf)}: vlna {s} s × nejvíc {maxGoals(id, sf)} gólů = <b>{goalRoundMin(id, sf, s) / 2} min</b>, simulace 2 vlny ={' '}
                <b>{goalRoundMin(id, sf, s)} min</b>.
              </span>
            ))
          ) : (
            <>
              Délka kola: {s} s × nejvíc {maxGoals(id, f)} gólů ({rule}) = <b>{goalRoundMin(id, f, s)} min</b>. V tréninku se délka přepočítá podle
              zvoleného formátu (BO2, BO3…).
            </>
          )}{' '}
          Prázdné = výchozí {def} s (stejná pro všechn{drill ? 'a cvičení' : 'y zápasy'}). Platí pro nové tréninky a pro nezahájený trénink, když ho
          upravíš.
        </p>
        <p className="note" aria-label="Reálná doba míčku">
          Reálně ({drill ? 'od prvního pokusu do ukončení kola / pokusy' : 'od prvního gólu do ukončení utkání / góly'}):{' '}
          {real === 'loading' ? 'počítám…' : real === 'error' ? 'průběh her nejde načíst' : <b>{realText(mine, id)}</b>}
          {all && (
            <>
              {' '}
              · všechn{drill ? 'a cvičení' : 'y zápasy'} {realText(all, drill ? 'drill' : 'match')}
            </>
          )}
          {mine && Math.round(mine.sec) >= MIN_BALL_SEC && Math.round(mine.sec) <= MAX_BALL_SEC && Math.round(mine.sec) !== value && (
            <>
              {' '}
              <button type="button" className="link" onClick={() => onChange(Math.round(mine.sec))}>
                Použít {sec(mine.sec)}
              </button>
            </>
          )}
        </p>
      </div>
    </>
  );
}
