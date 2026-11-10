import { Fragment, useState } from 'react';
import { MIN_TRAININGS as MIN } from '../../domain/ladder';
import { isShamed, Medal, Progress, ShameRank, Snail } from '../components/Rank';
import { BrandMark, NAV_ICONS } from '../components/MainNav';
import { toHash } from '../useHashRoute';

/**
 * Návod pro hráče (landing page, 10. 11. 2026): jak s appkou pracovat na telefonu u stolu – od přihlášení
 * po žebříček, s ukázkou zápisu skóre a cvičení na zkoušku. Vidí ho i nepřihlášený (`#/guide`).
 * Jména jsou z klubu, čísla ukázková. Ukázky jsou jen v prohlížeči, nic se neukládá.
 */
export function GuidePage({ signedIn, onBack }: { signedIn: boolean; onBack(): void }) {
  return (
    <main className="guide" aria-label="Návod pro hráče">
      <div className="g-wrap">
        <header className="g-top">
          <a className="g-brand" href={toHash({ page: 'trainings' })} aria-label="Foos Lab – úvodní stránka">
            <BrandMark />
            Foos Lab
          </a>
          <span className="g-top-right">
            <span className="g-tag">Návod pro hráče · telefon u stolu</span>
            <button type="button" className="g-back" onClick={onBack}>
              {signedIn ? 'Zpět do appky' : 'Přihlásit se'}
            </button>
          </span>
        </header>

        <section className="g-hero" aria-labelledby="g-hero-title">
          <div>
            <p className="g-eyebrow">Trénink v telefonu</p>
            <h1 id="g-hero-title">
              Ťukni gól.
              <br />
              <em>Zbytek pohlídá appka.</em>
            </h1>
            <p className="g-lead">
              Foos Lab ti řekne, u kterého stolu hraješ, s kým a proti komu. Skóre a ztráty zapisuješ ťuknutím přímo u stolu a po tréninku vidíš, jak jsi
              na tom v žebříčku.
            </p>
            <div className="g-facts">
              <span className="g-fact">
                <b>leg</b> do 6 gólů
              </span>
              <span className="g-fact">
                <b>ztráta</b> se čárkuje zvlášť
              </span>
              <span className="g-fact">
                <b>forma</b> za 28 dní
              </span>
            </div>
          </div>
          <div>
            <MirrorDemo />
            <p className="g-hint">Vyzkoušej si to: ťukej do polí. Konec legu appka pozná sama.</p>
          </div>
        </section>

        <div className="g-steps">
          <Step n={1} label="Přihlášení" title="Přihlas se přezdívkou ze soupisky" phone={<LoginPhone />}>
            <p>Účet nezakládáš, už ho máš. Stačí znát svoji přezdívku přesně tak, jak je na soupisce klubu.</p>
            <ul className="g-list">
              <Li i="1">
                Napiš přezdívku a jako heslo <b>tu samou přezdívku</b>.
              </Li>
              <Li i="2">
                Appka tě hned požádá o <b>nové heslo</b>. Bez něj dál nepustí.
              </Li>
              <Li i="3">Zapomeneš heslo? Admin ho vrátí na přezdívku a ty si nastavíš nové.</Li>
            </ul>
          </Step>

          <Step n={2} label="Moje hry" title="Kde hraješ, s kým a proti komu" phone={<MyGamesPhone />}>
            <p>
              Když trénink běží a hraješ na něm, otevře se appka rovnou v <b>Moje hry</b>. Vidíš své aktuální kolo a pod ním další. Mezi koly listuješ,
              celý rozpis je v záložce Trénink.
            </p>
            <ul className="g-list">
              <Li i="●">
                <b>Červená tečka</b> u Moje hry znamená, že jsi na řadě. Volný stůl i hráči jsou připravení.
              </Li>
              <Li i="Z">
                U karty uvidíš i <b>roli</b>: kdo hraje Zeď, kdo začíná ze stavu 0:3, nebo že jsi <b>rozhodčí</b> a počítáš ztráty.
              </Li>
            </ul>
          </Step>

          <Step n={3} label="Hra" title="Zahájit, zapisovat, potvrdit konec" phone={<FinishPhone />}>
            <p>Každé utkání má stejný průběh. Když je výsledek dohraný, máš 15 s na kontrolu: potvrď konec hned, nebo výsledek oprav. Jinak utkání skončí samo.</p>
            <div className="g-flow">
              <div>
                <b>Zahájit</b>Jakmile stojíte u stolu. Rozjedou se stopky.
              </div>
              <div>
                <b>Ťukat</b>Góly a ztráty, kdo z vás zrovna má ruku volnou.
              </div>
              <div>
                <b>Potvrdit konec</b>Hned, nebo samo po 15 s.
              </div>
              <div>
                <b>Na další kolo</b>Až po potvrzeném konci.
              </div>
            </div>
            <ul className="g-list">
              <Li i="!" red>
                Čas od chvíle, kdy jsi na řadě, do <span className="g-kbd">Zahájit</span> se počítá do <b>Zdržovačů</b>. Nezdržuj, jdi hrát.
              </Li>
            </ul>
          </Step>

          <Step n={4} label="Cvičení" title="Po každém pokusu ✓ nebo ✗" phone={<DrillDemo />}>
            <p>U cvičení se nepočítají góly, ale pokusy. Po každém ťukneš, jestli se povedl. Appka hlídá, kolikátý pokus to je, a po posledním ukáže výsledek.</p>
            <ul className="g-list">
              <Li i="✓">Popisky se mění podle cvičení: přihrávka povedená / nepovedená, střela gól / vedle, udržení bez ztráty / ztráta.</Li>
              <Li i="↶">
                Ťukl jsi vedle? <b>Zpět</b> vrátí poslední vlastní ťuknutí.
              </Li>
              <Li i="2">Ve dvojici se rozdělí obrazovka na dvě poloviny, každý hráč má svou.</Li>
            </ul>
          </Step>

          <Step n={5} label="Rozcvička" title="Timer vede rozcvičku za tebe" phone={<WarmupPhone />}>
            <p>Po Zahájit běží odpočet 8:35 na všech telefonech stejně. Před každou ze sedmi fází máš 5 s na přípravu a appka ukáže, co přijde dál. Nic se nezapisuje.</p>
            <ul className="g-list">
              <Li i="1">Kroužení kolem míčku na dvojce: pravá a levá ruka, po směru i proti směru.</Li>
              <Li i="2">Na pětce absorbování, tic-tac nahrávky a postupka.</Li>
              <Li i="~">Na Androidu telefon na začátku fáze zavibruje. Safari na iPhonu vibrace neumí.</Li>
            </ul>
          </Step>

          <Step n={6} label="Živě" title="Co se hraje u všech stolů" phone={<LivePhone />}>
            <p>
              Záložka <b>Živě</b> ukazuje stoly a utkání na nich, se stopkami. Pod tím je „Další v pořadí“ a proč se na ně čeká: obsazený stůl, hráči, kteří
              ještě hrají, nebo pauza.
            </p>
            <ul className="g-list">
              <Li i="⏱">Plánované časy v rozpisu jsou jen orientační. Další utkání se pustí, jakmile jsou volní hráči i stůl.</Li>
              <Li i="Z">
                <b>Zdržovači</b> v žebříčku ukazují, kdo nejdéle čeká od vypsání utkání do Zahájit.
              </Li>
            </ul>
          </Step>

          <Step n={7} label="Trénink" title="Celý trénink na jedné stránce" phone={<TrainingPhone />}>
            <p>
              V záložce <b>Trénink</b> je seznam tréninků, dnešní nahoře se štítkem „Hraješ – kolo 3 právě běží“. Po otevření vidíš celý rozpis, pod ním
              souhrn tréninku a Zdržovače.
            </p>
            <ul className="g-list">
              <Li i="✓">
                <b>Časová osa kol:</b> plná tečka s ✓ je odehrané kolo, kroužek kolo, které se hraje („hraje se 7 min · 1 ze 2 stolů hotovo“), prázdná tečka
                kolo, které přijde.
              </Li>
              <Li i="▣">
                <b>Tvůj stůl</b> je podbarvený. Ťuknutím na stůl otevřeš zápis, u odehrané hry rozbalíš <b>Průběh</b>: kdy padly góly a ztráty a kdo vedl – jako sloupec, nebo křivka.
              </Li>
              <Li i="Σ">
                <b>Souhrn tréninku</b> řadí hráče jen podle tohoto tréninku: rozdíl skóre, pak výhry, góly a výhry v simulaci. Pod ním jsou Zdržovači.
              </Li>
            </ul>
          </Step>

          <Step n={8} label="Žebříček" title="Jak jsi na tom napříč tréninky" phone={<LadderPhone />}>
            <p>
              Žebříček má tři části: <b>Zápasy</b>, <b>Stanoviště</b> a <b>Zdržovači</b>. Výchozí období je <b>forma</b>: tréninky za posledních 28 dní.
            </p>
            <ul className="g-list">
              <Li i="1">
                <b>Zápasy</b> řadí rozdíl skóre, pak výhry, góly a výhry v simulaci. První tři mají zlatou, stříbrnou a bronzovou medaili.
              </Li>
              <Li i="Ø">
                <b>Průměr</b> přepočítá na leg (+0,4 / leg) a výhry na procenta, <b>Celkem</b> sčítá legy, rozdíl a výhry.
              </Li>
              <Li i={<Progress have={2} need={MIN} />}>
                Pořadí dostaneš, až se zúčastníš aspoň <b>3 tréninků</b> v období. Do té doby jsi šedě pod čárou a tečky ukazují, kolik už jich máš.
              </Li>
              <Li i="⌖">
                <b>Stanoviště</b> mají žebříček pro každé cvičení zvlášť.
              </Li>
            </ul>
            <h3 className="g-sub">Zdržovači</h3>
            <p>
              Měří, jak dlouho se čeká na zahájení utkání: od chvíle, kdy jsou volní hráči i stůl, do ťuknutí na <b>Zahájit</b>. Čekání se připíše všem
              hráčům utkání a řadí se od nejdelšího.
            </p>
            <ul className="g-list">
              <Li i={<Snail />} red>
                První tři dostanou červený kroužek a šneka, ten úplně první ještě štítek <b>Brzda</b>. Kdo nečekal vůbec, šneka nedostane.
              </Li>
              <Li i="⏱">
                Jak se šnekovi vyhnout: jakmile je tvoje utkání na řadě, jdi ke stolu a ťukni <b>Zahájit</b> v Moje hry.
              </Li>
            </ul>
          </Step>
        </div>

        <section className="g-faq" aria-labelledby="g-faq">
          <h2 id="g-faq">Když něco nejde</h2>
          <dl>
            <dt>Ťukl jsem gól na špatnou stranu.</dt>
            <dd>↶ Zpět vrátí tvoje poslední ťuknutí. Když už je leg dohraný, dej Opravit a zápis se znovu odemkne.</dd>
            <dt>Zapisujeme dva najednou, nepřepíšeme se?</dt>
            <dd>Ne. Každé ťuknutí se přičte, telefony se mezi sebou hned srovnají. Zapisovat smí kdokoli z hráčů u stolu i rozhodčí.</dd>
            <dt>Nevidím Moje hry.</dt>
            <dd>Moje hry se ukáže, jen když běží trénink a jsi mezi přítomnými. Trénink zahajuje organizátor.</dd>
            <dt>Jak funguje Daň za ztrátu a Zeď?</dt>
            <dd>U Daně je ztráta zároveň gól soupeře. U Zdi jedna strana nesmí riskovat. Pravidla každé disciplíny najdeš v záložce Disciplíny.</dd>
            <dt>Neznám svoji přezdívku.</dt>
            <dd>Zeptej se admina nebo organizátora tréninku. Přezdívka musí sedět přesně, i s velkými písmeny.</dd>
          </dl>
        </section>

        <footer className="g-foot">
          <span>Foos Lab · trénink, rozpis a žebříček klubu</span>
          <span>Jména z klubu, čísla jsou ukázková</span>
        </footer>
      </div>
    </main>
  );
}

function Step({ n, label, title, phone, children }: { n: number; label: string; title: string; phone: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="g-step" aria-labelledby={`g-s${n}`}>
      <div className="g-copy">
        <p className="g-num">
          {n} · {label}
        </p>
        <h2 id={`g-s${n}`}>{title}</h2>
        {children}
      </div>
      {phone}
    </section>
  );
}

function Li({ i, red, children }: { i: React.ReactNode; red?: boolean; children: React.ReactNode }) {
  return (
    <li>
      <i className={red ? 'g-r' : undefined}>{i}</i>
      <span>{children}</span>
    </li>
  );
}

type Tab = 'live' | 'my' | 'trainings' | 'ladder';
const TABS: [Tab, string][] = [
  ['live', 'Živě'],
  ['my', 'Moje hry'],
  ['trainings', 'Trénink'],
  ['ladder', 'Žebříček'],
];

/** Spodní lišta ukázkového telefonu se stejnými ikonami jako appka. */
function TabBar({ on, dot }: { on: Tab; dot?: boolean }) {
  return (
    <div className="g-tabbar" aria-hidden="true">
      {TABS.map(([k, label]) => (
        <span key={k} className={[k === on ? 'g-on' : '', dot && k === 'my' ? 'g-dot' : ''].filter(Boolean).join(' ') || undefined}>
          {NAV_ICONS[k]}
          {label}
        </span>
      ))}
    </div>
  );
}

function Phone({ time, title, sub, tab, dot, label, children }: { time: string; title: string; sub?: string; tab?: Tab; dot?: boolean; label?: string; children: React.ReactNode }) {
  return (
    <div className="g-phone" aria-label={label} aria-hidden={label ? undefined : true}>
      <div className="g-screen">
        <div className="g-sbar">
          <span>{time}</span>
          <span>{tab === 'my' && label ? 'Moje hry' : ''}</span>
        </div>
        <div className="g-shead">
          <b>{title}</b>
          {sub && <span>{sub}</span>}
        </div>
        <div className="g-sbody">{children}</div>
        {tab && <TabBar on={tab} dot={dot} />}
      </div>
    </div>
  );
}

/* ── Ukázka: zápis legu (zrcadlo stolu) ── */
type Scen = 'normal' | 's44' | 's55';
const SCEN: Record<Scen, { a: number; b: number; rule: string; label: string }> = {
  normal: { a: 0, b: 0, rule: 'Normální leg · do 6 gólů', label: 'Normální leg' },
  s44: { a: 4, b: 4, rule: 'Start 4:4 · do 6 gólů', label: 'Start 4:4' },
  s55: { a: 5, b: 5, rule: 'Start 5:5 · o 2 góly, strop 10', label: 'Start 5:5' },
};
type Key = 'a' | 'b' | 'la' | 'lb';

/** Konec legu v ukázce (stejná pravidla jako v appce: do 6; 5:5 o 2 góly nebo strop 10). */
const legDone = (scen: Scen, a: number, b: number) =>
  scen === 's55' ? a >= 10 || b >= 10 || (Math.max(a, b) >= 7 && Math.abs(a - b) >= 2) : a >= 6 || b >= 6;

function MirrorDemo() {
  const [scen, setScen] = useState<Scen>('normal');
  const fresh = (s: Scen) => ({ a: SCEN[s].a, b: SCEN[s].b, la: 0, lb: 0 });
  const [m, setM] = useState(fresh('normal'));
  const [hist, setHist] = useState<Key[]>([]);
  const [locked, setLocked] = useState(false);
  const reset = (s: Scen) => (setScen(s), setM(fresh(s)), setHist([]), setLocked(false));
  const tap = (k: Key) => {
    if (locked) return;
    const next = { ...m, [k]: m[k] + 1 };
    setM(next);
    setHist([...hist, k]);
    if (legDone(scen, next.a, next.b)) setLocked(true);
  };
  const undo = () => {
    const k = hist.at(-1);
    if (!k) return;
    setM({ ...m, [k]: m[k] - 1 });
    setHist(hist.slice(0, -1));
    setLocked(false);
  };
  return (
    <Phone time="18:42" title="3. kolo · stůl 2" sub={SCEN[scen].rule} tab="my" label="Ukázka: zápis zápasu na telefonu">
      <div className="g-scen" role="group" aria-label="Scénář">
        {(Object.keys(SCEN) as Scen[]).map((s) => (
          <button key={s} type="button" aria-pressed={s === scen} onClick={() => reset(s)}>
            {SCEN[s].label}
          </button>
        ))}
      </div>
      <div className="g-mirror">
        <div className="g-side g-l">
          <div className="g-who">
            Dejv + Milan
            <br />
            vlevo
          </div>
          <button type="button" className="g-goal" aria-label="Gól vlevo" disabled={locked} onClick={() => tap('a')}>
            <b>{m.a}</b>
            <small>+1 gól</small>
          </button>
          <button type="button" className="g-loss" aria-label="Ztráta vlevo" disabled={locked} onClick={() => tap('la')}>
            +1 ztráta<b>{m.la}</b>
          </button>
        </div>
        <div className="g-side g-r">
          <div className="g-who">
            Osky + Denys
            <br />
            vpravo
          </div>
          <button type="button" className="g-goal" aria-label="Gól vpravo" disabled={locked} onClick={() => tap('b')}>
            <b>{m.b}</b>
            <small>+1 gól</small>
          </button>
          <button type="button" className="g-loss" aria-label="Ztráta vpravo" disabled={locked} onClick={() => tap('lb')}>
            +1 ztráta<b>{m.lb}</b>
          </button>
        </div>
      </div>
      {locked && (
        <div className="g-done" role="status">
          Leg dohrán {m.a}:{m.b} · uloženo
        </div>
      )}
      <div className="g-mrow">
        {locked ? (
          <>
            <button type="button" onClick={undo}>
              Opravit
            </button>
            <button type="button" className="g-go" onClick={() => reset(scen)}>
              Na další kolo
            </button>
          </>
        ) : (
          <button type="button" disabled={!hist.length} onClick={undo}>
            ↶ Zpět
          </button>
        )}
      </div>
    </Phone>
  );
}

/* ── Ukázka: cvičení 20 pokusů ✓ / ✗ ── */
const TRIES = 20;
function DrillDemo() {
  const [tries, setTries] = useState<boolean[]>([true, true, false, true, true, false, true, true, true, false, true, true]);
  const ok = tries.filter(Boolean).length;
  const end = tries.length >= TRIES;
  const add = (v: boolean) => !end && setTries([...tries, v]);
  return (
    <Phone time="18:14" title="Penalta proti brankáři" sub="stůl 3 · varianta 1" label="Ukázka: zápis cvičení">
      <div className="g-card">
        <div className="g-att">
          <b>
            {ok} z {tries.length}
          </b>
          <span>{end ? 'všech 20 pokusů' : `pokus ${tries.length + 1} / ${TRIES}`}</span>
        </div>
        <div className="g-tries" aria-hidden="true">
          {tries.map((t, i) => (
            <i key={i} className={t ? undefined : 'g-x'} />
          ))}
        </div>
      </div>
      <div className="g-okfail">
        <button type="button" className="g-ok" aria-label="Gól" disabled={end} onClick={() => add(true)}>
          ✓<small>gól</small>
        </button>
        <button type="button" className="g-no" aria-label="Vedle" disabled={end} onClick={() => add(false)}>
          ✗<small>vedle</small>
        </button>
      </div>
      {end && (
        <div className="g-done" role="status">
          Hotovo {ok} z {TRIES} · skončí samo za 15 s
        </div>
      )}
      <div className="g-mrow">
        <button type="button" disabled={!tries.length} onClick={() => setTries(tries.slice(0, -1))}>
          ↶ Zpět
        </button>
      </div>
    </Phone>
  );
}

/* ── Statické obrazovky ── */
function LoginPhone() {
  return (
    <Phone time="18:02" title="Foos Lab" sub="Přihlášení">
      <div className="g-field">
        Přezdívka<span className="g-in">Dejv</span>
      </div>
      <div className="g-field">
        Heslo<span className="g-in">••••</span>
      </div>
      <span className="g-bigbtn">Přihlásit</span>
      <div className="g-card" style={{ marginTop: 8 }}>
        <span className="g-k">Poprvé?</span>
        <span>Heslo je tvoje přezdívka. Hned potom si nastavíš vlastní.</span>
      </div>
    </Phone>
  );
}

function MyGamesPhone() {
  return (
    <Phone time="18:36" title="Moje hry" sub="Úterý 10. 11. · kolo 3 z 14" tab="my" dot>
      <div className="g-card g-hot">
        <span className="g-k">
          <span>3. kolo · stůl 2</span>
          <span className="g-pill">na řadě</span>
        </span>
        <span className="g-vs">
          Dejv + Milan
          <br />
          <span>proti</span> Osky + Denys
        </span>
        <span>
          <span className="g-pill g-blue">Zeď</span> drží tvoje strana
        </span>
        <span className="g-bigbtn">Zahájit</span>
      </div>
      <div className="g-card">
        <span className="g-k">
          <span>4. kolo · stůl 1</span>
          <span>potom</span>
        </span>
        <span className="g-vs" style={{ fontSize: 13 }}>
          Rozhodčí: Luky + Ondra <span>proti</span> David K + Lavi
        </span>
        <span>
          <span className="g-pill g-red">rozhodčí</span> čárkuješ ztráty
        </span>
      </div>
    </Phone>
  );
}

function FinishPhone() {
  const side = (cls: string, who: string, goals: number, losses: number) => (
    <div className={`g-side ${cls}`}>
      <div className="g-who">{who}</div>
      <div className="g-goal" style={{ minHeight: 120 }}>
        <b>{goals}</b>
        <small>gólů</small>
      </div>
      <div className="g-loss" style={{ display: 'grid', placeItems: 'center' }}>
        <span>
          ztráty <b>{losses}</b>
        </span>
      </div>
    </div>
  );
  return (
    <Phone time="18:51" title="3. kolo · stůl 2" sub="hraje se 7:12">
      <div className="g-mirror" style={{ flex: 'none' }}>
        {side('g-l', 'Dejv + Milan', 6, 2)}
        {side('g-r', 'Osky + Denys', 4, 3)}
      </div>
      <div className="g-done">Leg dohrán 6:4 · skončí samo za 12 s, potvrdit jde hned</div>
      <span className="g-bigbtn">Potvrdit konec</span>
      <span className="g-ghostbtn">Opravit</span>
    </Phone>
  );
}

function WarmupPhone() {
  return (
    <Phone time="18:05" title="Rozcvička" sub="stůl 1 · fáze 3 / 7">
      <div className="g-timer">
        <b>0:42</b>
        <span>zbývá ve fázi</span>
      </div>
      <p className="g-phase">Levá ruka · po směru</p>
      <div className="g-bar">
        <i style={{ width: '30%' }} />
      </div>
      <div className="g-card">
        <span className="g-k">Další</span>
        <span>Levá ruka · proti směru</span>
      </div>
      <div className="g-card">
        <span className="g-k">Celkem</span>
        <span>zbývá 6:18 z 8:35</span>
      </div>
    </Phone>
  );
}

function LivePhone() {
  const table = (n: number, who: React.ReactNode, t: React.ReactNode, wait = false) => (
    <div className={wait ? 'g-tbl g-wait' : 'g-tbl'}>
      <b>{n}</b>
      <span className="g-w">{who}</span>
      <span className="g-t">{t}</span>
    </div>
  );
  return (
    <Phone time="18:55" title="Živě" sub="kolo 3 · 2 ze 4 stolů hraje" tab="live">
      {table(1, <>Luky + Ondra<br />vs David K + Lavi</>, <>hraje<br />4:10</>)}
      {table(2, <>Dejv + Milan<br />vs Osky + Denys</>, <>hraje<br />7:12</>)}
      {table(3, 'volný', 'čeká na hráče', true)}
      {table(4, 'volný', 'čeká na hráče', true)}
      <div className="g-card">
        <span className="g-k">Další v pořadí</span>
        <span>4. kolo, stůl 1 · čeká na Luky, Ondra</span>
      </div>
    </Phone>
  );
}

function TrainingPhone() {
  return (
    <Phone time="18:58" title="Úterý 10. 11." sub="18:00 · 8 hráčů · 4 stoly · kolo 3 z 14" tab="trainings">
      <ol className="g-tl">
        <li className="g-past">
          <span className="g-dot">✓</span>
          <span className="g-rw">
            <b>1. kolo · Rozcvička</b>
            <small>18:00</small>
          </span>
        </li>
        <li className="g-past">
          <span className="g-dot">✓</span>
          <span className="g-rw">
            <b>2. kolo · Penalta proti brankáři</b>
            <small>18:10</small>
          </span>
        </li>
        <li className="g-now">
          <span className="g-dot" />
          <span className="g-rw">
            <b>3. kolo · Normální leg</b>
            <small>hraje se 7 min · 1 ze 2 stolů hotovo</small>
            <span className="g-tt">
              <span>Stůl 1 · Luky + Ondra vs David K + Lavi</span>
              <b>3:2</b>
            </span>
            <span className="g-tt g-mine">
              <span>Stůl 2 · Dejv + Milan vs Osky + Denys</span>
              <b>6:4 ✓</b>
            </span>
          </span>
        </li>
        <li>
          <span className="g-dot" />
          <span className="g-rw">
            <b>4. kolo · Daň za ztrátu</b>
            <small>kolem 19:05</small>
          </span>
        </li>
      </ol>
      <div className="g-card">
        <span className="g-k">
          <span>Souhrn tréninku</span>
          <span>rozdíl · výhry</span>
        </span>
        {(
          [
            [1, 'Dejv', '+5 · 2'],
            [2, 'Milan', '+5 · 2'],
            [3, 'Lavi', '+1 · 1'],
          ] as const
        ).map(([r, n, v]) => (
          <span key={r} className="g-sum">
            <b>{r}</b>
            <span>{n}</span>
            <span>{v}</span>
          </span>
        ))}
      </div>
    </Phone>
  );
}

type LadderPart = 'matches' | 'solo' | 'delays';
const LADDER_PARTS: [LadderPart, string][] = [
  ['matches', 'Zápasy'],
  ['solo', 'Stanoviště'],
  ['delays', 'Zdržovači'],
];

/** Ukázka žebříčku: tři části jako v appce – medaile, čára „od 3 tréninků“ s tečkami, Zdržovači se šnekem. */
function LadderPhone() {
  const [part, setPart] = useState<LadderPart>('matches');
  // [jméno, pod jménem, hodnota, tréninky (pod 3 = pod čárou), já]
  const matches: [string, string, string, number, boolean?][] = [
    ['Lavi', '21 legů · 71 %', '+1,9', 6],
    ['Milan', '18 legů · 61 %', '+1,1', 5],
    ['Dejv', '12 legů · 50 %', '+0,4', 4, true],
    ['Osky', '16 legů · 44 %', '−0,3', 5],
    ['Luky', '3 legy · 67 %', '+1,3', 1],
    ['Denys', '7 legů · 57 %', '+0,9', 2],
  ];
  const solo: [string, string, string, number, boolean?][] = [
    ['Milan', '5 tréninků', '1,4 / 10', 5],
    ['Lavi', '6 tréninků', '2,0 / 10', 6],
    ['Dejv', '4 tréninky', '2,7 / 10', 4, true],
    ['Osky', '3 tréninky', '3,3 / 10', 3],
    ['Ondra', '2 tréninky', '1,0 / 10', 2],
  ];
  // [jméno, utkání, čekání ⌀]
  const delays: [string, string, string][] = [
    ['Ondra', '9 utkání', '4:12'],
    ['Luky', '7 utkání', '3:05'],
    ['Osky', '11 utkání', '2:40'],
    ['Dejv', '8 utkání', '0:55'],
    ['Lavi', '12 utkání', '0:00'],
  ];
  const ranked = (rows: [string, string, string, number, boolean?][]) => {
    const cut = rows.findIndex((r) => r[3] < MIN);
    return rows.map(([n, sub, v, tr, me], i) => {
      const low = cut >= 0 && i >= cut;
      return (
        <Fragment key={n}>
          {i === cut && <div className="g-cut" />}
          <div className={['g-rank', me ? 'g-me' : '', low ? 'g-low' : ''].filter(Boolean).join(' ')}>
            <span className="g-rk">{low ? <Progress have={tr} need={MIN} /> : <Medal place={i + 1} />}</span>
            <span className="g-n">
              {n}
              <small>{sub}</small>
            </span>
            <span className="g-v">{v}</span>
          </div>
        </Fragment>
      );
    });
  };
  return (
    <Phone
      time="21:10"
      title="Žebříček"
      sub={part === 'solo' ? 'Udržení míče na pětce · méně je lépe' : part === 'delays' ? 'forma · čekání na zahájení' : 'forma · průměr · 14. 10. – 10. 11.'}
      tab="ladder"
      label="Ukázka: žebříček"
    >
      <div className="g-seg g-seg-btn" role="group" aria-label="Část žebříčku">
        {LADDER_PARTS.map(([k, text]) => (
          <button key={k} type="button" aria-pressed={k === part} className={k === part ? 'g-on' : undefined} onClick={() => setPart(k)}>
            {text}
          </button>
        ))}
      </div>
      <div>
        {part === 'matches' && ranked(matches)}
        {part === 'solo' && ranked(solo)}
        {part === 'delays' &&
          delays.map(([n, sub, v], i) => {
            const shamed = isShamed(i + 1, v !== '0:00');
            return (
              <div key={n} className={shamed ? 'g-rank g-shame' : 'g-rank'}>
                <span className="g-rk">
                  <ShameRank place={i + 1} shamed={shamed} />
                </span>
                <span className="g-n">
                  <span className="delay-who">
                    {n}
                    {shamed && <Snail big={i === 0} />}
                    {shamed && i === 0 && <span className="shame-tag">Brzda</span>}
                  </span>
                  <small>{sub}</small>
                </span>
                <span className={i === 0 ? 'g-v g-bad' : 'g-v'}>{v}</span>
              </div>
            );
          })}
      </div>
    </Phone>
  );
}
