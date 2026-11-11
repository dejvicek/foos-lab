# Foos Lab

Webová appka foosballového klubu pro trénink: vede soupisku, z přítomných sestaví rozpis tréninku (kdo, s kým, na kterém stole, od kolika), hráči u stolu ťukají skóre a ztráty do telefonu a appka počítá souhrn tréninku a žebříček napříč tréninky.

- **Appka:** https://dejvicek.github.io/foos-lab/
- **Návod pro hráče:** https://dejvicek.github.io/foos-lab/#/guide
- **Změny po verzích:** [CHANGELOG.md](CHANGELOG.md)

## Technologie

- Vite + React + TypeScript, bez UI knihovny.
- Data v [Supabase](https://supabase.com) (Postgres). Schéma jen přes SQL migrace v `supabase/migrations/`, ke každé funkci v databázi test v `supabase/tests/`.
- Testy: Vitest.
- Service worker: appka se po první návštěvě spustí i bez spojení; neodeslané zápisy čekají v zařízení.

## Vývoj

```sh
npm install
cp .env.example .env.local   # doplň VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY
npm run dev                  # Vite dev server
npm test                     # Vitest
npm run build
sh supabase/tests/run.sh     # migrace a funkce databáze na lokálním Postgresu (Docker)
```

Bez Supabase jde appka spustit s daty jen v paměti: `VITE_USE_MEMORY=1 npm run dev`.

Kód je rozdělený na `src/domain/` (čisté funkce: rozpis, souhrn, žebříček – bez Reactu a bez úložiště), `src/storage/` (Supabase, fronta zápisů, nastavení zařízení) a `src/ui/` (stránky a komponenty).

## Větve

| Větev | K čemu |
|---|---|
| `develop` | Vývoj. Sem jdou všechny commity. Výchozí větev repozitáře. |
| `main` | Vydaný kód. Chráněná: přímý push je zakázaný, změny jen merge pull requestu z `develop` (merge commit, ne squash) a po projití testů. |

Push do `develop` / `main` a každý pull request spustí workflow **Testy** (`.github/workflows/ci.yml`). Nic se přitom nenasazuje.

## Verze

Číslo verze je jen v `package.json` a appka ho ukazuje v hlavičce vedle „Foos Lab“.

- **Opravná** (1.0.**1**): opravy chyb a drobnosti v textech.
- **Menší** (1.**1**.0): nová funkce nebo viditelná změna chování.
- **Hlavní** (**2**.0.0): zásadní změna, po které se appka používá jinak.

Když nová verze nesmí běžet vedle starší (jiný rozpis nebo smlouva s databází), zvyšuje se navíc `COMPAT` v `src/version.ts` – telefon se starší verzí pak bez obnovení nepustí dál.

## Vydání nové verze

Vydává se jen z tagu `vX.Y.Z` na `main`, a jen na pokyn správce.

1. Na `develop`: zvýšit verzi (`npm version X.Y.Z --no-git-tag-version`) a do `CHANGELOG.md` přidat záznam `## X.Y.Z – datum` – srozumitelně pro hráče, co je nového a co se opravilo (z commitů od posledního tagu). Commit `chore(release): X.Y.Z`.
2. Migrace databáze, které verze potřebuje, nasadit do Supabase **před** vydáním appky (musí fungovat i se starší verzí, která běží v telefonech).
3. Pull request `develop` → `main`, po projití testů merge commitem.
4. Na merge commitu v `main` vytvořit tag `vX.Y.Z` (anotovaný, zpráva = záznam z changelogu) a pushnout ho.
5. Workflow **Vydání** (`.github/workflows/release.yml`) zkontroluje, že tag sedí s `package.json`, je na `main` a má záznam v `CHANGELOG.md`; pak pustí testy, sestaví appku, nasadí ji na GitHub Pages a založí GitHub Release s poznámkami z changelogu.

Otevřené telefony se starší verzí ukážou lištu „Je k dispozici nová verze appky“ s tlačítkem Obnovit.
