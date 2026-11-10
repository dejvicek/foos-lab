import { catalogMins, DISCIPLINES } from './disciplines';
import { currentTemplates, templateBreaks, type TrainingTemplate } from './catalog';
import { sortedRoster } from './roster';
import { DEFAULT_START, parseSoloKey, soloSlots, type SoloSlot } from './solo';
import { DEFAULT_DURATION, manualPlan, orderedDisciplines, SOLO_SELECTION } from './plan';
import { anchorBreaks, breaksOf } from './breaks';
import { roundSequence } from './customSchedule';
import { buildSchedule, canBuildSchedule } from './schedule';
import type { DisciplineId, MatchId, Player, PlayerId, Score, SoloKey, SoloResults, TemplateBreak, Training } from './types';

export function newTraining(
  id: string,
  today: string,
  last: Training | null,
  createdBy: PlayerId | null = null,
  template: TrainingTemplate | undefined = currentTemplates()[0],
): Training {
  const tables = last?.tables ?? 4;
  // Výběr a délka podle šablony (9. 11. 2026, dřív z posledního tréninku). Vyřazené disciplíny se
  // nepřebírají; vyřazená s nástupcem (stará Penalta z místa → proti brankáři) se nahradí nástupcem.
  // Bez šablony nic vybráno není (10. 11. 2026).
  const selection = [...new Set((template?.selection ?? []).flatMap((id) => {
    const d = DISCIPLINES.find((x) => x.id === id);
    if (!d) return [];
    return d.retired ? (d.successor ? [d.successor] : []) : [id];
  }))];
  const durationMin = template?.durationMin ?? DEFAULT_DURATION;
  // Délky kol podle aktuálního katalogu – trénink si je nese, pozdější změna katalogu jeho časy nehne.
  const disciplineMin = catalogMins();
  const breaks = template ? templateBreaks(template) : [];
  return {
    id,
    date: today,
    startTime: last?.startTime ?? DEFAULT_START,
    mode: 'team', // konfigurovatelný trénink: jedničky jsou disciplína, ne typ tréninku
    tables,
    attendees: [],
    scores: {},
    soloResults: {},
    simSplit: 'performance', // výchozí: vyrovnaně podle výkonu v tréninku
    simTeams: null,
    format: 'custom',
    durationMin,
    // Přesně kola ze šablony (cvičení se dopočítají podle přítomných), nic se nedoplňuje.
    plan: manualPlan(selection, 0, tables, template?.rounds),
    lockedRounds: [],
    createdBy,
    disciplineMin,
    // Pořadí disciplín ze šablony.
    disciplineOrder: selection,
    // Pauzy po sekcích podle šablony, jinak žádné (9. 11. 2026); další jde přidat v náhledu plánu.
    breaks,
  };
}

/** Použije šablonu na trénink v průvodci: délka a výběr disciplín (kola rozloží replan). */
export function withTemplate(t: Training, template: TrainingTemplate): Training {
  return {
    ...t,
    durationMin: template.durationMin,
    breaks: templateBreaks(template),
    disciplineOrder: [...template.selection],
    plan: manualPlan(template.selection, t.attendees.length, t.tables, template.rounds, lockedCounts(t), new Set(t.lockedRounds.map((l) => l.discipline))),
  };
}

/**
 * Zaškrtnutí / odškrtnutí přítomného. Nový hráč se vloží hned za posledního
 * přítomného, který je na soupisce před ním (jinak na začátek) – přítomní
 * v pořadí soupisky v něm zůstanou.
 */
export function toggleAttendee(t: Training, playerId: PlayerId, players: Player[]): Training {
  if (t.attendees.includes(playerId)) {
    return { ...t, attendees: t.attendees.filter((p) => p !== playerId) };
  }
  const order = sortedRoster(players).map((p) => p.id);
  const before = new Set(order.slice(0, Math.max(0, order.indexOf(playerId))));
  let insertAt = 0;
  t.attendees.forEach((p, i) => {
    if (before.has(p)) insertAt = i + 1;
  });
  const attendees = [...t.attendees];
  attendees.splice(insertAt, 0, playerId);
  return { ...t, attendees };
}

export function moveAttendee(t: Training, playerId: PlayerId, dir: -1 | 1): Training {
  const i = t.attendees.indexOf(playerId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= t.attendees.length) return t;
  const attendees = [...t.attendees];
  [attendees[i], attendees[j]] = [attendees[j], attendees[i]];
  return { ...t, attendees };
}

/**
 * Náhodné pořadí přítomných (Fisher–Yates). Generátor dodává UI – doména zůstává deterministická
 * a rozpis je dál čistá funkce uloženého pořadí.
 */
export function shuffleAttendees(t: Training, rand: () => number): Training {
  const attendees = [...t.attendees];
  for (let i = attendees.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [attendees[i], attendees[j]] = [attendees[j], attendees[i]];
  }
  return { ...t, attendees };
}

export function isEmptyScore(s: Score | undefined): boolean {
  return !s || [s.ga, s.gb, s.la, s.lb].every((v) => v === null || v === undefined);
}

function built(t: Training) {
  return canBuildSchedule(t) ? buildSchedule(t) : null;
}

const slotKey = (playerId: PlayerId, key: SoloKey) => `${playerId}::${key}`;

function soloKeys(t: Training): Set<string> {
  const s = built(t);
  return new Set(s ? soloSlots(s).map((x) => slotKey(x.playerId, x.key)) : []);
}

function matchIds(t: Training): Set<MatchId> {
  const s = built(t);
  return new Set(s ? s.matches.map((m) => m.id) : []);
}

function filledSolo(t: Training): SoloSlot[] {
  const out: SoloSlot[] = [];
  for (const [playerId, metrics] of Object.entries(t.soloResults))
    for (const [metric, v] of Object.entries(metrics))
      if (v !== null && v !== undefined) out.push({ playerId, key: metric, metric: parseSoloKey(metric).metric });
  return out;
}

export interface LostEntries {
  scores: MatchId[];
  solo: SoloSlot[];
}

/** Zapsané skóre a výsledky sólové části z `before`, které v rozpisu `after` nemají místo. */
export function lostEntries(before: Training, after: Training): LostEntries {
  const ids = matchIds(after);
  const keys = soloKeys(after);
  return {
    scores: Object.entries(before.scores)
      .filter(([id, s]) => !isEmptyScore(s) && !ids.has(id))
      .map(([id]) => id),
    solo: filledSolo(before).filter((x) => !keys.has(slotKey(x.playerId, x.key))),
  };
}

/** Nechá jen skóre a výsledky, které v rozpisu tréninku mají místo. */
export function pruneEntries(t: Training): Training {
  const ids = matchIds(t);
  const keys = soloKeys(t);
  const scores = Object.fromEntries(Object.entries(t.scores).filter(([id]) => ids.has(id)));
  const soloResults: SoloResults = {};
  for (const [p, metrics] of Object.entries(t.soloResults)) {
    const kept = Object.fromEntries(Object.entries(metrics).filter(([k]) => keys.has(slotKey(p, k))));
    if (Object.keys(kept).length) soloResults[p] = kept;
  }
  return { ...t, scores, soloResults };
}

export function setSolo(t: Training, playerId: PlayerId, key: SoloKey, value: number | null): Training {
  const mine = { ...t.soloResults[playerId] };
  if (value === null) delete mine[key];
  else mine[key] = value;
  const soloResults = { ...t.soloResults };
  if (Object.keys(mine).length) soloResults[playerId] = mine;
  else delete soloResults[playerId];
  return { ...t, soloResults };
}

/** Odehrané pokusy cvičení (null = smazat → výsledek zapsaný číslem = plný počet). */
export function setAttempts(t: Training, playerId: PlayerId, key: SoloKey, attempts: number | null): Training {
  const all = { ...t.soloAttempts };
  const mine = { ...all[playerId] };
  if (attempts === null) delete mine[key];
  else mine[key] = attempts;
  if (Object.keys(mine).length) all[playerId] = mine;
  else delete all[playerId];
  const { soloAttempts: _, ...rest } = t;
  return Object.keys(all).length ? { ...rest, soloAttempts: all } : rest;
}

export function setScore(t: Training, id: MatchId, field: keyof Score, value: number | null): Training {
  return { ...t, scores: { ...t.scores, [id]: { ...t.scores[id], [field]: value } } };
}

export function sortTrainings(ts: Training[]): Training[] {
  return [...ts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export const selectedDisciplines = (plan: Partial<Record<DisciplineId, number>>): DisciplineId[] =>
  (Object.entries(plan) as [DisciplineId, number][]).filter(([, n]) => n > 0).map(([id]) => id);

export function lockedCounts(t: Training): Partial<Record<DisciplineId, number>> {
  const out: Partial<Record<DisciplineId, number>> = {};
  for (const l of t.lockedRounds) out[l.discipline] = (out[l.discipline] ?? 0) + 1;
  return out;
}

/**
 * Konfigurovatelný trénink: změna výběru disciplín, přítomných nebo stolů přepočítá kola cvičení
 * (aby se vystřídali všichni); zápasy si nechají počet kol a čas se nedoplňuje (9. 11. 2026, PRD 4.6).
 */
export function replan(before: Training, after: Training): Training {
  if (after.format !== 'custom') return after;
  const sel = (t: Training) => selectedDisciplines(t.plan).sort().join();
  const changed =
    sel(before) !== sel(after) ||
    before.durationMin !== after.durationMin ||
    before.attendees.length !== after.attendees.length ||
    before.tables !== after.tables;
  if (!changed) return after;
  // Přechod na trénink pro 1 hráče: přidají se sólová cvičení (ostatní zůstanou vybraná, jen se nehrají).
  // Zpátky na víc hráčů: volitelná sólová cvičení zase odeberou (pokud se už nehrála).
  const toSolo = after.attendees.length === 1 && before.attendees.length !== 1;
  const fromSolo = before.attendees.length === 1 && after.attendees.length > 1;
  const played = lockedCounts(after);
  let selection = selectedDisciplines(after.plan);
  if (toSolo) selection = [...new Set([...selection, ...SOLO_SELECTION])];
  // Vrátí se výběr šablony (disciplineOrder); sólová cvičení mimo ni (a u tréninku bez pořadí všechna) se odeberou.
  const order = after.disciplineOrder ?? [];
  const added = (id: DisciplineId) => !order.includes(id);
  if (fromSolo) selection = selection.filter((id) => !(SOLO_SELECTION.includes(id) && added(id) && !played[id]));
  return {
    ...after,
    // Bez doplňování (9. 11. 2026): cvičení podle přítomných, zápasy s počtem kol, jak jsou.
    plan: manualPlan(selection, after.attendees.length, after.tables, after.plan, lockedCounts(after), new Set(after.lockedRounds.map((l) => l.discipline))),
  };
}

/**
 * Přeřadí vybranou disciplínu na pozici `to` mezi vybranými disciplínami stejného druhu (tabulka v průvodci,
 * 10. 11. 2026). Uloží pořadí vybraných; pauza za disciplínou se přesune s ní. Mimo rozsah = beze změny.
 */
export function moveDiscipline(t: Training, id: DisciplineId, to: number): Training {
  const kind = DISCIPLINES.find((d) => d.id === id)?.kind;
  const selected = orderedDisciplines(t.disciplineOrder).filter((x) => (t.plan[x] ?? 0) > 0);
  const same = selected.filter((x) => DISCIPLINES.find((d) => d.id === x)?.kind === kind);
  const from = same.indexOf(id);
  if (from < 0 || to < 0 || to >= same.length || to === from) return t;
  const moved = [...same];
  moved.splice(from, 1);
  moved.splice(to, 0, id);
  let k = 0;
  const order = selected.map((x) => (same.includes(x) ? moved[k++] : x));
  return { ...t, disciplineOrder: order, breaks: anchorBreaks(t) };
}

/**
 * Nastavení disciplín tréninku jako šablona (10. 11. 2026, admin v průvodci): délka, vybrané disciplíny
 * v pořadí, počty kol zápasů a pauzy po disciplínách. Cvičení mají v šabloně kola „podle hráčů“ a simulace 1,
 * takže se jejich počty neukládají; pauza uprostřed disciplíny se uloží za tu disciplínu.
 */
export function templateFromTraining(t: Training, id: string, name: string): TrainingTemplate {
  const kindAt = (x: DisciplineId) => ['drill', 'match', 'sim'].indexOf(DISCIPLINES.find((d) => d.id === x)?.kind ?? 'sim');
  const selection = orderedDisciplines(t.disciplineOrder)
    .filter((x) => (t.plan[x] ?? 0) > 0)
    .sort((a, b) => kindAt(a) - kindAt(b));
  const rounds = Object.fromEntries(selection.filter((x) => kindAt(x) === 1).map((x) => [x, t.plan[x]!]));
  const seq = roundSequence(t);
  const breaks: TemplateBreak[] = [];
  for (const b of breaksOf(t)) {
    const after = seq[b.after - 1];
    if (after && !breaks.some((x) => x.after === after)) breaks.push({ after, min: b.min });
  }
  return { id, name: name.trim(), durationMin: t.durationMin, selection, rounds, breaks };
}

/** Nastaví přítomné najednou („Jako minule“, „Nikdo“): v pořadí soupisky, jen aktivní hráči ze soupisky. */
export function withAttendees(t: Training, ids: PlayerId[], players: Player[]): Training {
  const want = new Set(ids);
  return { ...t, attendees: sortedRoster(players).filter((p) => want.has(p.id) && !p.archived).map((p) => p.id) };
}
