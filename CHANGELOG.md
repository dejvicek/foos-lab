# Změny ve Foos Lab

Číslo verze je v hlavičce appky vedle „Foos Lab“. Jediné místo, kde se mění, je `package.json`.

- **Opravná verze** (1.0.**1**): opravy chyb a drobnosti v textech, nic nového.
- **Menší verze** (1.**1**.0): nová funkce nebo viditelná změna chování.
- **Hlavní verze** (**2**.0.0): velká změna, po které se appka používá jinak.

Když nová verze nesmí běžet vedle starší (jiný rozpis nebo databáze), zvyšuje se navíc `COMPAT` v `src/version.ts`.
Ke každé vydané verzi patří záznam tady a git tag `vX.Y.Z` na `main`; z tagu se appka nasadí a vznikne GitHub Release s tímto záznamem. Postup je v README → Vydání nové verze.

## 1.2.0 – 12. 11. 2026

Zápasy na víc legů, nová cvičení a jasně dané, co se hraje v klubu, sám a ve dvou.

- **Formát zápasu BO1, BO2, BO3, BO5** u každého zápasu a scénáře – v šablonách, v nastavení tréninku i ve vlastním tréninku. Jde nastavit počet gólů na leg a u rozhodujícího legu „o 2 se stropem“. Legy se zapisují po sobě, předchozí jde otevřít a opravit.
- **Vlastní trénink ve dvou** nabízí i zápasy a scénáře 1 na 1 (Jedničky, Daň za ztrátu, Zeď, Starty, Goalie war, Penalty).
- **Nové disciplíny**: Goalie war (jen branka a dvojka) a Penalty (střídání po střele).
- **Čistá desítka**: 10 povedených stejných pokusů po sobě na čas – střela z trojky, přihrávka na pětce, střela z dvojky, přihrávka z dvojky. Nepovedený pokus počítá od nuly, v žebříčku rozhoduje nejlepší čas. Jen ve vlastním tréninku.
- **Cvičení mají 20 pokusů** místo 10 a delší kola. Starší výsledky si nesou svůj počet pokusů, Průměr je přepočítá na celou sérii.
- **Udržení míče na pětce** se počítá na góly (víc je lépe) a hraje se v klubu a ve dvou. Starší výsledky jsou převedené.
- **Kde se co hraje**: na stránce Disciplíny panáčci ukazují klubový trénink, solo a duo; kliknutím na panáčka se seznam vyfiltruje. Cvičení „bez brankáře“ a Přihrávky ke zdi a po lajně jsou jen solo, Normální leg jen v klubu (ve dvou jsou to Jedničky).
- **Žebříčky napříč**: cvičení, která jsou v klubu i ve dvou, mají jednu tabulku ve Stanovištích. Ve Vlastní zůstanou solo cvičení, Čistá desítka a zápasy 1 na 1 – i singly z klubu.
- **Vlastní trénink**: výchozí plán zvlášť pro solo (asi 45 min) a duo (asi 63 min), zařízení si pamatuje výběr pro každý zvlášť, tlačítko Výchozí. Cvičení jsou rozdělená do sekcí Obrana, Pětka, Trojka (i na stránce Disciplíny).
- **Klubový trénink** jde založit až se 4 hráči; méně hráčů si zacvičí ve vlastním tréninku.
- **Šablony**: nová šablona začíná prázdná, tlačítko Označit vše / Odznačit vše; barevné časové pruhy a barevná čára Naplánováno.
- Po aktualizaci appku obnov – starší verze novým formátům nerozumí.

## 1.1.0 – 11. 11. 2026

Vlastní trénink: zacvič si kdykoli sám nebo ve dvou, i bez organizátora.

- **Vlastní trénink** na stránce Trénink: vyber, jestli cvičíš sám, nebo se spoluhráčem.
- Zaškrtneš cvičení a jejich pořadí, appka je projde **po kolech s časem** jako na klubovém tréninku; cvičení na dvě varianty má dvě kola za sebou. Do dalšího kola se jde po uplynutí času nebo po všech pokusech.
- Sám se nabízí jen cvičení, která jdou bez bránícího soupeře; ve dvou všechna.
- Zápis po pokusech ✓ / ✗; ve dvou zapisuje kterýkoli z vás za oba a oba telefony ukazují totéž.
- Na konci souhrn s výsledky a s tím, kolikátý jsi.
- **Žebříček Vlastní**: nová záložka v Žebříčku, počítá jen vlastní tréninky. Klubové žebříčky a docházka se nemění.
- Po aktualizaci appku obnov – starší verze vlastní tréninky nezná.

## 1.0.0 – 10. 11. 2026

První verze, kterou klub používá na tréninku naostro.

- **Moje hry**: kde hraješ, s kým a proti komu, červená tečka = jsi na řadě.
- **Zápis u stolu**: Zahájit → ťukat góly a ztráty → Potvrdit konec; dohraný leg skončí sám po 15 s.
- **Cvičení** po pokusech ✓ / ✗ a **Rozcvička** s časovačem.
- **Živě**: co se hraje u všech stolů a kdo je na řadě.
- **Průběh hry** gól po gólu jako sloupec nebo křivka vedení.
- **Souhrn tréninku**, **žebříček** (Zápasy, Stanoviště) a **Zdržovači**.
- Funguje i se slabým signálem: zápisy se odešlou, až se spojení vrátí.
- **Návod pro hráče** s ukázkami a rozcestníkem.
- Přepínač **světlého a tmavého režimu** v hlavičce.
- Číslo verze v hlavičce.
