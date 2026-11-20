# Road mapa Foos Lab

Plán podle **počtu odehraných klubových tréninků**, ne podle dat. Další vlna funkcí přijde, až budou data, na kterých dává smysl (pořadí v žebříčku od 3 tréninků, graf vývoje od 5 bodů, bilance proti soupeři až po desítkách legů), a až se předchozí vlna vyzkouší na tréninku.

**T*N*** = *N*-tý klubový trénink (vlastní tréninky se nepočítají). Stav k 20. 11. 2026: odehrané T1 (1. 11.) a T2 (17. 11.), T3 je založený na 20. 11.

Čísla **#** odkazují na návrhy z přehledu motivace (soutěživý × líný hráč, 20. 11. 2026).

## Hotovo na `develop` (zatím nevydáno)

- Žebříčky: zvýrazněný sloupec pořadí, posun ▲▼ od posledního tréninku, moje jméno zlatě, „⌀“ v Průměru, Z+ · Z− · L+ · L−.
- #1 Tvůj trénink, #2 vibrace a nezhasínající displej, #3 Připraven za spoluhráče u cvičení, #4 Můj profil, #6 rekordy, #11 Zdržovači s prahem 2 min a od 3 tréninků, #15 moje jméno zlatě v souhrnu tréninku.
- Zahájení zápasu prvním gólem, výsledky jedné disciplíny po trénincích, stránka Co je nového.

## Plán

| Kdy | Co | Proč tady |
|---|---|---|
| **Před T4** | **Vydat 1.4.0** se vším z `develop`. Předtím nasadit migraci 32 (`can_mark_ready`). | Po T3 budou mít první hráči 3 tréninky, takže poprvé vznikne pořadí a ▲▼ bude mít smysl. Ne těsně před T3, aby nikdo nové věci nezkoumal během tréninku. |
| **Na T4** | Kontrolní trénink bez nových změn: neobtěžují vibrace a displej? Používá se Připraven za spoluhráče? Vidí lidé Tvůj trénink? | První ostré použití 1.4.0. |
| **Po T4** | #14 stav simulace v Moje hry („Tým A 3 : 2“), #12 docházka na profilu. | Levné a bez rizika, data už existují. |
| **Po T5** | Vyhodnotit práh Zdržovačů (2 min) na reálných časech, případně doplnit větu „dnes se čekáním ztratilo X min“ (zbytek #11). #13 štítek Skokan. | Práh jde posoudit až po několika trénincích s připraveností. Skokan potřebuje víc posunů, aby nebyl náhodný. |
| **Po T6–T7** | #7 vývoj v čase: graf na profilu a v detailu disciplíny. | Z méně než 5 bodů graf nic neřekne. PRD fáze 2, bod 11. |
| **Po T7** | #10 „Moje slabiny“ ve vlastním tréninku. | Potřebuje umístění ve více cvičeních, jinak je „slabina“ jedna série. |
| **Po T8** | #16 kalendářní měsíce v období žebříčku. | Smysl má až po prvním celém měsíci s několika tréninky. |
| **Po T10** | #9 vzájemná bilance proti soupeřům (až od několika legů), nominační přehled pro ligu (PRD fáze 2, bod 12). | Dvojice se za trénink potkají jednou dvakrát. Nominace bez dat by byla dojmem. |

## Průběžně, po každých 2 trénincích

- Kolik hráčů je nad čarou v Zápasech a ve cvičeních.
- Jestli rekordy z tréninků ve dvou nevypadají podezřele.
- Kolik zápasů začalo prvním gólem místo Připraven.
- Žebříček Zdržovačů dává pořadí až od T5 (připravenost platí od 18. 11.).

## Zatím nezařazené

- #8 dnešní pořadí v Moje hry: řádek s odstupem byl z žebříčku odebrán (20. 11. 2026), bez poptávky nedělat.
- #17 výsledek cvičení číslem na telefonu: pokusy může ťukat spoluhráč a ztratil by se Průběh.
- Export CSV / PDF (PRD fáze 3): až bude potřeba.

## Neděláme

Elo a vážení síly soupeře (PRD: mimo rozsah), push notifikace a e-maily, body, úrovně a odznaky, další žebříčky hanby, párování podle pořadí nebo „vítěz zůstává“, změna kritérií řazení, okna 28 dní nebo hranice 3 tréninků, chat a komentáře.
