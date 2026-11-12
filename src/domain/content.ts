/** Obsah z prototypu (reference/rozpis-stolu.html). Texty jsou tréninkové instrukce – neměnit. */

export const STATIONS: string[] = [
  'Udržení míče na pětce',
  'Penalta z místa',
  'Rozehrávka ze zadních tyčí',
];

export interface RoundDef {
  name: string;
  min: number;
  /** Daň za ztrátu: ztráty jsou v gólech (a zapisují se i zvlášť). */
  lossTax: boolean;
  /** Která strana hraje Zeď (A = levá, B = pravá). */
  wall?: 'A' | 'B';
  /** Scénářový start [levá, pravá]. */
  start?: [number, number];
}

export const ROUNDS: RoundDef[] = [
  { name: 'Normální leg', min: 8, lossTax: false },
  { name: 'Daň za ztrátu', min: 8, lossTax: true },
  { name: 'Zeď', min: 8, lossTax: false, wall: 'A' },
  { name: 'Zeď, otočené role', min: 8, lossTax: false, wall: 'B' },
  { name: 'Start 0:3 + daň (levá strana začíná 0:3)', min: 5, lossTax: true, start: [0, 3] },
  { name: 'Start 4:4', min: 3, lossTax: false, start: [4, 4] },
  { name: 'Start 5:5, o 2 góly, strop 10', min: 3, lossTax: false, start: [5, 5] },
];

/** Časové konstanty v minutách (PRD 4.1–4.3, 5.4). */
export const TIMES = {
  team: { warmup: 15, stationSlot: 8, leagueStart: 60, changeover: 1, simBreak: 10, wave: 20, evaluationOffset: 45 },
  single: { warmup: 10, chain: 20, leagueStart: 30, changeover: 1, recordMin: 10 },
} as const;

export function clock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${m < 10 ? '0' : ''}${m}`;
}

/** Rozcvička: fáze timeru (pořadí a délky od trenéra, 10. 11. 2026). */
export interface WarmupPhase {
  name: string;
  rod: 'twoBar' | 'fiveBar';
  sec: number;
}
export const WARMUP_PHASES: WarmupPhase[] = [
  { name: 'Kroužení kolem míčku – pravá ruka, po směru', rod: 'twoBar', sec: 60 },
  { name: 'Kroužení kolem míčku – pravá ruka, proti směru', rod: 'twoBar', sec: 60 },
  { name: 'Kroužení kolem míčku – levá ruka, po směru', rod: 'twoBar', sec: 60 },
  { name: 'Kroužení kolem míčku – levá ruka, proti směru', rod: 'twoBar', sec: 60 },
  { name: 'Absorbování – nahrávka, zastavit, zpět', rod: 'fiveBar', sec: 60 },
  { name: 'Tic-tac nahrávky', rod: 'fiveBar', sec: 60 },
  { name: 'Postupka – nahrávky mezi všemi panáčky po dvou', rod: 'fiveBar', sec: 120 },
];
/** Příprava před každou fází Rozcvičky (s). */
export const WARMUP_PREP_SEC = 5;

export interface ExplanationPart {
  label?: string;
  text: string;
}
export interface ExplanationItem {
  name: string;
  parts: ExplanationPart[];
}
export interface ExplanationGroup {
  title: string;
  items: ExplanationItem[];
}

export const EXPLANATIONS: ExplanationGroup[] = [
  {
    "title": "Stanoviště (sólový trénink, 8 minut na každém)",
    "items": [
      {
        "name": "Rozcvička",
        "parts": [
          {
            "label": "Cíl:",
            "text": "zahřát ruce a rozehrát se."
          },
          {
            "label": "Provedení:",
            "text": "u stolu dva hráči, každý na své straně s vlastním míčkem, podle společného timeru v Moje hry; před každou fází 5 s na přípravu. Na dvojce kroužení kolem míčku (panáček madlem krouží kolem míčku, co nejmenší kroužení) – pravá ruka po směru a proti směru, levá ruka po směru a proti směru, po 1 min. Na pětce absorbování (nahrávka mezi dvěma panáčky, míček zastavit a teprve pak zpět, žádné tic-tac) 1 min, tic-tac nahrávky 1 min a postupka (nahrávky postupně mezi všemi panáčky po dvou) 2 min. Lichý hráč cvičí sám u volného stolu. Nic se nezapisuje."
          }
        ]
      },
      {
        "name": "Přihrávky na pětce",
        "parts": [
          {
            "label": "Cíl:",
            "text": "dostat míč z pětky na vlastní trojku pod kontrolou přes aktivně bránícího soupeře."
          },
          {
            "label": "Provedení:",
            "text": "útočník má míč na pětce, soupeř brání pětkou. 20 pokusů o přihrávku na trojku, platí jen přihrávka, kterou trojka přijme pod kontrolou. V polovině kola výměna rolí."
          },
          {
            "label": "Počítá se:",
            "text": "povedené přihrávky z 20."
          }
        ]
      },
      {
        "name": "Udržení míče na pětce",
        "parts": [
          {
            "label": "Cíl:",
            "text": "přijmout a zastavit míč pod kontrolou dřív, než se přihrává."
          },
          {
            "label": "Provedení:",
            "text": "útočník na pětce, soupeř aktivně brání svou pětkou. Útočník míč přijme a úplně zastaví, posune ho po pětce na jiného panáčka a zastaví, ještě jednou totéž. Teprve po třetím zastavení smí přihrát na trojku. Série končí přihrávkou, kterou trojka přijme pod kontrolou, nebo ztrátou. 20 sérií, pak výměna."
          },
          {
            "label": "Počítá se:",
            "text": "góly z 20 sérií – víc je lépe."
          }
        ]
      },
      {
        "name": "Penalta z místa",
        "parts": [
          {
            "label": "Cíl:",
            "text": "střílet až z kontrolovaného míče, ne z chaosu."
          },
          {
            "label": "Provedení:",
            "text": "střelec si nastaví míč na trojce, rozehraje ho (3 dotyky) a vystřelí z místa. Celý pokus do 15 s. Soupeř brání brankou a dvojkou. 20 pokusů."
          },
          {
            "label": "Počítá se:",
            "text": "góly z 20 střel."
          }
        ]
      },
      {
        "name": "Přihrávky ke zdi a po lajně",
        "parts": [
          {
            "label": "Cíl:",
            "text": "čistá přihrávka z pětky na trojku bez soupeře."
          },
          {
            "label": "Provedení:",
            "text": "míč zastavený na pětce, nikdo nebrání. 1. kolo 20 přihrávek ke zdi, 2. kolo 20 přihrávek po lajně. Platí jen přihrávka, kterou trojka přijme pod kontrolou. Každý hráč za sebe, jde i sám."
          },
          {
            "label": "Počítá se:",
            "text": "povedené přihrávky z 20 v každém kole."
          }
        ]
      },
      {
        "name": "Penalta z místa proti brankáři",
        "parts": [
          {
            "label": "Cíl:",
            "text": "střílet až z kontrolovaného míče, ne z chaosu."
          },
          {
            "label": "Provedení:",
            "text": "střelec si nastaví míč na trojce, rozehraje ho (3 dotyky) a vystřelí z místa. Celý pokus do 15 s. Soupeř brání brankou a dvojkou. Dvě kola po 20 střelách, v každém kole jedna varianta, kterou si střelec určí sám (např. u stahovačky krátká a dlouhá, u snaka nebo pinu k bližší a ke vzdálenější tyčce). Ve dvojici se po 20 střelách vystřídáte."
          },
          {
            "label": "Počítá se:",
            "text": "góly z 20 v každém kole."
          }
        ]
      },
      {
        "name": "Penalta z místa bez brankáře",
        "parts": [
          {
            "label": "Cíl:",
            "text": "přesnost střely z místa, i když není s kým trénovat."
          },
          {
            "label": "Provedení:",
            "text": "jako Penalta z místa proti brankáři, jen nikdo nebrání. Pro trénink jednoho hráče, nebo když zbyde hráč bez dvojice. Dvě kola po 20 střelách, v každém kole jedna varianta, kterou si hráč určí sám (např. u stahovačky krátká a dlouhá, u snaka nebo pinu k bližší a ke vzdálenější tyčce)."
          },
          {
            "label": "Počítá se:",
            "text": "góly z 20 v každém kole; v žebříčku má vlastní tabulku."
          }
        ]
      },
      {
        "name": "Střela z dvojky proti brankáři",
        "parts": [
          {
            "label": "Cíl:",
            "text": "střela z dvojky z nastaveného míče proti bránícímu soupeři."
          },
          {
            "label": "Provedení:",
            "text": "míč nastavený na dvojce, střela na bránu, soupeř brání. Dvě kola po 20 střelách, v každém kole jedna varianta, kterou si střelec určí sám. Ve dvojici se po 20 střelách vystřídáte."
          },
          {
            "label": "Počítá se:",
            "text": "góly z 20 v každém kole."
          }
        ]
      },
      {
        "name": "Střela z dvojky bez brankáře",
        "parts": [
          {
            "label": "Cíl:",
            "text": "přesnost střely z dvojky, i když není s kým trénovat."
          },
          {
            "label": "Provedení:",
            "text": "míč nastavený na dvojce, střela na bránu, nikdo nebrání. Pro trénink jednoho hráče, nebo když zbyde hráč bez dvojice. Dvě kola po 20 střelách, v každém kole jedna varianta, kterou si hráč určí sám."
          },
          {
            "label": "Počítá se:",
            "text": "góly z 20 v každém kole; v žebříčku má vlastní tabulku."
          }
        ]
      },
      {
        "name": "Clearing",
        "parts": [
          {
            "label": "Cíl:",
            "text": "dostat míč z obrany za soupeřovu pětku, aby nezůstal soupeři na útočných tyčích."
          },
          {
            "label": "Provedení:",
            "text": "obránce má míč v brance nebo na dvojce, soupeř brání trojkou i pětkou. Obránce míč vyčistí dopředu. Dvě kola po 20 pokusech, v každém kole jedna varianta, kterou si obránce určí sám. Ve dvojici se po 20 pokusech vystřídáte."
          },
          {
            "label": "Počítá se:",
            "text": "povedené clearingy z 20 v každém kole – míč se dostal za soupeřovu pětku."
          }
        ]
      },
      {
        "name": "Zachycení volného míče",
        "parts": [
          {
            "label": "Cíl:",
            "text": "míč, který se dostane do zóny obránce, zachytit a dostat pod kontrolu – nenechat ho odskočit ani ho odpálit pryč."
          },
          {
            "label": "Provedení:",
            "text": "obránce na brance a dvojce, partner posílá míč do jeho zóny, ale ne střelou: odrazem, pomalu kutálený nebo nepřesnou přihrávkou. 1. kolo míče po zdi, 2. kolo míče středem, po 20 pokusech. Ve dvojici se po 20 pokusech vystřídáte."
          },
          {
            "label": "Počítá se:",
            "text": "míče pod kontrolou z 20 v každém kole – stačí míč zastavit a mít ho pod kontrolou v zadních tyčích."
          }
        ]
      },
      {
        "name": "Řetězec",
        "parts": [
          {
            "label": "Cíl:",
            "text": "dostat míč z dvojky přes pětku a trojku až do gólu proti bránícímu soupeři."
          },
          {
            "label": "Provedení:",
            "text": "útočník rozehraje z dvojky, nahraje na pětku, z pětky přihraje na trojku a z trojky střílí; soupeř brání. Když se míček vrátí na tyč, ze které hráč přihrával, pokus končí neúspěchem. Ve dvojici se hráči střídají, každý má v kole 20 pokusů."
          },
          {
            "label": "Počítá se:",
            "text": "jen gól – góly z 20."
          }
        ]
      },
      {
        "name": "Rozehrávka ze zadních tyčí",
        "parts": [
          {
            "label": "Cíl:",
            "text": "dostat míč z branky a dvojky na vlastní pětku přes aktivní soupeřovu trojku. Nejdražší místo na stole, kde se dá ztratit míč."
          },
          {
            "label": "Provedení:",
            "text": "obránce má míč zastavený na dvojce nebo v brance, soupeř brání trojkou a pětkou. 10 rozehrávek, platí jen ta, která skončí zastaveným míčem na vlastní pětce."
          },
          {
            "label": "Počítá se:",
            "text": "dokončené rozehrávky z 10."
          }
        ]
      },
      {
        "name": "Čistá desítka – střela z trojky",
        "parts": [
          {
            "label": "Cíl:",
            "text": "jedna střela, která drží i pod tlakem série."
          },
          {
            "label": "Provedení:",
            "text": "vyber si jednu střelu z trojky (např. stahovačku do dlouhého rohu) a opakuj pořád tu stejnou, dokud nedáš 10 gólů po sobě. Po každém pokusu ✓ nebo ✗; nepovedený pokus sérii vynuluje a počítá se znovu od 0. Každý hráč cvičí sám na své straně s vlastním míčkem, nikdo nebrání."
          },
          {
            "label": "Počítá se:",
            "text": "čas od začátku kola do desátého povedeného pokusu po sobě; méně je lépe. V klubovém tréninku je limit délka kola (10 min), pak se jde na další disciplínu a série zůstane nesplněná. V žebříčku rozhoduje nejlepší čas."
          }
        ]
      },
      {
        "name": "Čistá desítka – přihrávka na pětce",
        "parts": [
          {
            "label": "Cíl:",
            "text": "spolehlivá přihrávka z pětky na trojku."
          },
          {
            "label": "Provedení:",
            "text": "vyber si jednu přihrávku z pětky na trojku (např. ke zdi) a opakuj pořád tu stejnou, dokud nemáš 10 povedených po sobě. Platí jen přihrávka, kterou trojka přijme pod kontrolou. Po každém pokusu ✓ nebo ✗; nepovedený pokus sérii vynuluje a počítá se znovu od 0. Každý hráč cvičí sám na své straně s vlastním míčkem, nikdo nebrání."
          },
          {
            "label": "Počítá se:",
            "text": "čas od začátku kola do desátého povedeného pokusu po sobě; méně je lépe. V klubovém tréninku je limit délka kola (10 min), pak se jde na další disciplínu a série zůstane nesplněná. V žebříčku rozhoduje nejlepší čas."
          }
        ]
      },
      {
        "name": "Čistá desítka – střela z dvojky",
        "parts": [
          {
            "label": "Cíl:",
            "text": "jistá střela ze zadní řady."
          },
          {
            "label": "Provedení:",
            "text": "vyber si jednu střelu z dvojky a opakuj pořád tu stejnou, dokud nedáš 10 gólů po sobě. Po každém pokusu ✓ nebo ✗; nepovedený pokus sérii vynuluje a počítá se znovu od 0. Každý hráč cvičí sám na své straně s vlastním míčkem, nikdo nebrání."
          },
          {
            "label": "Počítá se:",
            "text": "čas od začátku kola do desátého povedeného pokusu po sobě; méně je lépe. V klubovém tréninku je limit délka kola (10 min), pak se jde na další disciplínu a série zůstane nesplněná. V žebříčku rozhoduje nejlepší čas."
          }
        ]
      },
      {
        "name": "Čistá desítka – přihrávka z dvojky",
        "parts": [
          {
            "label": "Cíl:",
            "text": "čistá rozehrávka ze zadních tyčí."
          },
          {
            "label": "Provedení:",
            "text": "vyber si jednu přihrávku z dvojky na pětku a opakuj pořád tu stejnou, dokud nemáš 10 povedených po sobě. Platí jen přihrávka, kterou pětka přijme pod kontrolou. Po každém pokusu ✓ nebo ✗; nepovedený pokus sérii vynuluje a počítá se znovu od 0. Každý hráč cvičí sám na své straně s vlastním míčkem, nikdo nebrání."
          },
          {
            "label": "Počítá se:",
            "text": "čas od začátku kola do desátého povedeného pokusu po sobě; méně je lépe. V klubovém tréninku je limit délka kola (10 min), pak se jde na další disciplínu a série zůstane nesplněná. V žebříčku rozhoduje nejlepší čas."
          }
        ]
      },
      {
        "name": "Řetězec (trénink jedniček)",
        "parts": [
          {
            "label": "Provedení:",
            "text": "hráč musí dokončit celý řetězec: blok → zastavení v brance nebo na dvojce → rozehrávka na pětku → zastavení → přihrávka na trojku → zastavení → střela. Soupeř hraje normálně, střílí jen středním tempem. Řetězec se přeruší první ztrátou nebo prvním krokem bez zastavení."
          },
          {
            "label": "Počítá se:",
            "text": "dokončené řetězce z 10."
          }
        ]
      }
    ]
  },
  {
    "title": "Pravidla a scénáře (zápasový trénink)",
    "items": [
      {
        "name": "Každý gól se počítá",
        "parts": [
          {
            "text": "Pořadí ve scénářové lize dělá celkové skóre (vstřelené minus obdržené), ne vyhrané legy. Vést 1:0 a odpočívat stojí reálné body, vzdát prohraný leg taky."
          }
        ]
      },
      {
        "name": "Normální leg",
        "parts": [
          {
            "text": "Leg do 6 bez dalších pravidel. Výchozí stav, se kterým se ostatní kola porovnávají."
          }
        ]
      },
      {
        "name": "Goalie war",
        "parts": [
          {
            "text": "Singl. Hraje se jen zadními tyčemi (branka a dvojka) proti zadním tyčím soupeře, pětka a trojka se nepoužívají. Leg vyhrává, kdo dřív dá 6 gólů (v BO formátu podle nastavení); zapisuje se skóre jako u legu."
          }
        ]
      },
      {
        "name": "Penalty",
        "parts": [
          {
            "text": "Singl. Jeden střílí z trojky z nastaveného míče, druhý brání brankou a dvojkou; po každé střele se role prohodí. Leg vyhrává, kdo dřív dá 6 gólů (v BO formátu podle nastavení); zapisuje se skóre jako u legu."
          }
        ]
      },
      {
        "name": "Daň za ztrátu",
        "parts": [
          {
            "text": "Ztracený míč z kontrolované pozice = gól pro soupeře. Pětka: máš míč na pětce a soupeř ho získá, aniž bys vystřelil. Zadní tyče: míč byl v brance nebo na dvojce zastavený aspoň 1 sekundu a cokoli z něj vznikne skončí u soupeře bez tvé střely. Nepočítá se odražený míč hned po bloku. Ztráty jsou už v gólech a navíc se zapisují i zvlášť (pro ztráty na leg)."
          }
        ]
      },
      {
        "name": "Zeď",
        "parts": [
          {
            "text": "Jeden tým má celý leg zakázáno riskovat: drží míč, nikam nespěchá, žádné riskantní přihrávky, střílí jen z jistoty. Druhý tým ho musí prolomit. Kdo drží zeď, ukazuje rozpis štítkem Zeď; během tréninku se role střídají. Simulace soupeře, který nás v lize trestá, když zrychlíme."
          }
        ]
      },
      {
        "name": "Start 0:3",
        "parts": [
          {
            "text": "Leg začíná za stavu 0:3, pozadu je strana uvedená v rozpisu vlevo. Trénuje nehrát odevzdaně, když prohráváme. Hraje se s Daní za ztrátu. Zapisuje se stav na stole (konec 6:4), appka sama započítá jen odehrané góly (6:1)."
          }
        ]
      },
      {
        "name": "Start 4:4",
        "parts": [
          {
            "text": "Koncovka těsného legu, zbývají 2 až 4 góly. Zapisuje se stav na stole (konec 6:4), appka započítá jen odehrané góly (2:0)."
          }
        ]
      },
      {
        "name": "Start 4:5",
        "parts": [
          {
            "text": "Koncovka, kdy jeden gól rozhoduje: leg začíná za stavu 4:5, pozadu je strana uvedená v rozpisu vlevo. Vepředu stačí jeden gól, pozadu se musí ubránit a dvakrát skórovat. Hrají se 2 kola, ve druhém si strany role prohodí. Zapisuje se stav na stole (konec 6:5), appka započítá jen odehrané góly (2:0)."
          }
        ]
      },
      {
        "name": "Start 5:5, o 2 góly, strop 10",
        "parts": [
          {
            "text": "Přesně třetí set z ligy. Vyhrává, kdo získá náskok 2 gólů, nejvýš do 10. Zapisuje se stav na stole (konec 7:5), appka započítá jen odehrané góly (2:0)."
          }
        ]
      },
      {
        "name": "Simulace ligového kola",
        "parts": [
          {
            "text": "Dva týmy, pevná nominace předem, každý zápas 2 sety do 6, třetí o 2 góly se stropem 10. Zapisuje se výsledek v setech (2:0, 2:1). Vyhrává tým s více vyhranými zápasy."
          }
        ]
      },
      {
        "name": "Role rozhodčího",
        "parts": [
          {
            "text": "Kdo zrovna nehraje, je rozhodčí: první čekající u stolu 1, druhý u stolu 2 a tak dál. Rozhodčí čárkuje ztráty, hlídá kolo Zeď a čas kola, rozhoduje sporné ztráty. Rozhodnutí platí, nediskutuje se. U stolu bez rozhodčího si ztráty zapisují hráči sami; v kolech s Daní jsou ztráty navíc i v gólech."
          },
          {
            "text": "Kolo končí dohraným legem, čas je jen pojistka, aby trénink držel čas: když vyprší, zapíše se aktuální stav a jde se dál. Aby se nedalo hrát na čas, rozhodčí vymáhá limity držení míče (10 s na pětce, 15 s na trojce). Pomalá hra je záměr jen v kole Zeď."
          }
        ]
      }
    ]
  }
];
