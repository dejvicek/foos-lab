# Změny ve Foos Lab

Číslo verze je v hlavičce appky vedle „Foos Lab“. Jediné místo, kde se mění, je `package.json`.

- **Opravná verze** (1.0.**1**): opravy chyb a drobnosti v textech, nic nového.
- **Menší verze** (1.**1**.0): nová funkce nebo viditelná změna chování.
- **Hlavní verze** (**2**.0.0): velká změna, po které se appka používá jinak.

Když nová verze nesmí běžet vedle starší (jiný rozpis nebo databáze), zvyšuje se navíc `COMPAT` v `src/version.ts`.
Ke každé vydané verzi patří záznam tady a git tag `vX.Y.Z` na `main`; z tagu se appka nasadí a vznikne GitHub Release s tímto záznamem. Postup je v README → Vydání nové verze.

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
