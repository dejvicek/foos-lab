# Změny ve Foos Lab

Číslo verze je v hlavičce appky vedle „Foos Lab“. Jediné místo, kde se mění, je `package.json`.

- **Opravná verze** (1.0.**1**): opravy chyb a drobnosti v textech, nic nového.
- **Menší verze** (1.**1**.0): nová funkce nebo viditelná změna chování.
- **Hlavní verze** (**2**.0.0): velká změna, po které se appka používá jinak.

Když nová verze nesmí běžet vedle starší (jiný rozpis nebo databáze), zvyšuje se navíc `COMPAT` v `src/version.ts`.
Ke každé vydané verzi patří záznam tady a git tag `vX.Y.Z` na `main`; z tagu se appka nasadí a vznikne GitHub Release s tímto záznamem. Postup je v README → Vydání nové verze.

## 1.3.0 – 19. 11. 2026

Připraven místo Zahájit, nové Moje hry, přehlednější rozpis a žebříček, Živě je pryč.

**U stolu a v Moje hry**
- **Připraven místo Zahájit**: utkání začne, až se ohlásí obě strany (u cvičení každý hráč). Do té doby nejde zapisovat skóre nikomu. Proužek ukáže, na koho se ještě čeká, a připravenost jde zrušit.
- **Moje hry nově**: karta kola jako v rozpisu (čas, disciplína, do kolika se hraje, velké číslo stolu, zápas jako výsledková tabule) se stavem Na řadě / Hraje se / Dohráno. Pod ní jen jedno velké tlačítko podle situace: Připraven, zápis, Potvrdit konec.
- **Po konci** zůstane dohrané kolo s výsledkem a průběhem a nad ním **karta Další kolo**: buď „Na řadě“ s odkazem Otevřít, nebo na co se čeká (stůl, soupeř, pauza s odpočtem). Oprava výsledku je „Opravit“ přímo v kartě.
- **Časová osa** nahoře jde proklikat. Barvy podle druhu kola (cvičení modře, zápasy a scénáře zeleně, simulace fialově), odehraná kola plnou barvou a aktuální kolo zvětšené.
- **Nápověda** ke kolu (i k dalšímu) je pod otazníkem v kartě.
- **Cvičení** po konci ukáže u stolu výsledek každého hráče, třeba „14/20“.

**Trénink a rozpis**
- **Záložka Živě zrušena.** Záložka se teď jmenuje **Tréninky**, probíhající trénink otevře rovnou a nahoře má přepínač Klubové / Vlastní s tlačítkem „+ Klubový trénink“ nebo „+ Vlastní trénink“.
- **Souhrn tréninku nahoře**: Pořadí (s medailemi), Zdržovači a Simulace jako ligový zápis s legy a průběžným stavem.
- **Rozpis**: číslo kola na časové ose v barvě druhu kola, tvoje kola se žlutým pruhem, odehraná kola se během tréninku sbalí. Na telefonu má každé kolo dlaždici se všemi stoly, velkým číslem stolu a zápasem jako výsledkovou tabulí.
- U každého kola je vidět, do kolika se hraje (do 6, BO3, o 2 se stropem, počet pokusů). Asymetrické disciplíny mají u dvojic štítky (Zeď / Láme zeď, začíná 4).
- Průběh hry má každý přes ikonku grafu u stolu; organizátor opravuje výsledek tužkou u konkrétního stolu.
- **Délka kola** se počítá z doby míčku × nejvíc možných gólů nebo pokusů. Simulace se hraje po legech (BO3 do 6 nebo BO5 do 5).
- **Ztráty** se zapisují jen v Dani za ztrátu a tam je u každého stolu rozhodčí.

**Žebříček**
- Části **Zápasy · Cvičení (Týmové, Solo/Duo) · Zdržovači**. Tabulky jdou řadit podle libovolného sloupce.
- **Zápasy podle disciplín** s přepínačem Vše / 1 na 1 / 2 na 2. Počítají i klasické tréninky a simulaci; v zápasech se počítají jen výhry.
- **Krátké sloupce**: G± (rozdíl skóre), L+ / L− (vyhrané / prohrané legy), G+ / G−. Plný název se ukáže po najetí myší.
- **Barvy rozdílu**: zelená = výrazný náskok, zlatá = plus, červená = minus, i v souhrnu tréninku.
- Na telefonu je žebříček krátká tabulka jen s G± a výhrami. Všechno ostatní je na notebooku a na stránce hráče.
- Zdržovači: nelichotivě označený jen ten první (šnek, Brzda).

**Vzhled**
- Menší tlačítka a přepínače (zakulacené čipy) a klikací logo i na telefonu.

**Opravy**
- Moje hry otevírají tvoje další nebo poslední odehrané kolo, ne poslední kolo podle hodin.
- Proběhlý trénink ukazuje všechna kola rozbalená.

Po aktualizaci appku obnov – starší verze nové připravenosti a délkám kol nerozumí.

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
