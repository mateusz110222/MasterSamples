# Master Samples

[Polski](README.md) | [English](README.en.md)

System ewidencji jednostek wzorcowych (Golden / Master Samples), kontroli
liczników i obsługi blokad stacji produkcyjnych na FIS1/FIS2.

## Zacznij od instrukcji HTML

Otwórz dwuklikiem [docs/MasterSamples.html](docs/MasterSamples.html).
Dokumentacja PL/EN działa bez uruchamiania aplikacji, serwera, Node ani internetu.
Możesz przekazać sam plik HTML osobie odpowiedzialnej za wdrożenie.

Po instalacji ta sama treść jest w zakładce **Dokumentacja** (`#/documentation`).
Obie wersje obejmują obsługę widoków, liczniki, blokady, API, nową instalację
MySQL i integrację stacji przez `loadcstpkgs`.

## Struktura projektu

| Katalog | Zawartość |
| --- | --- |
| `frontend/` | React, TypeScript, Vite, Tailwind; widoki PL/EN, testy i generator HTML |
| `backend/MasterDashboard.php` | Endpoint PHP dla FIS1 |
| `backend/FIS2/` | Endpoint PHP przeznaczony dla FIS2 |
| `backend/migrations/` | SQL nowej instalacji i kontrola struktury |
| `backend/tcl/` | MasterCheck, warianty Tcl i testy |
| `docs/` | Gotowa, samodzielna dokumentacja HTML |

## Nowa instalacja MySQL

Wykonaj raz na każdej odrębnej bazie, w kolejności:

1. `backend/migrations/001_initial_schema.sql` — nowa baza i tabele podstawowe.
2. `backend/migrations/002_station_blocking_rules.sql` — tabela reguł stacji.
3. `backend/migrations/003_verify_installation.sql` — kontrola bez zmian danych.

Pierwszy skrypt jest przeznaczony dla nowej bazy i zgłasza błąd, jeśli już istnieje.
Przy współdzielonej bazie FIS1/FIS2 nie wykonuj tworzenia dwa razy.
Jeżeli brakuje wyłącznie tabeli reguł, szczegóły są w
[backend/migrations/README.md](backend/migrations/README.md).
Stare migracje aktualizacyjne zostały usunięte. Zestaw nie importuje starych wyłączeń.
Pusta tabela reguł oznacza wyłączoną obsługę blokad `_MASTER`; rzeczywiste
rekordy stacji/prefiksu dodaj przez dashboard po uruchomieniu.

## Podgląd i budowa frontendu

Wymagane: Node.js 22.18+ z gałęzi 22 albo Node.js 24+ i npm.

```sh
cd frontend
npm install
npm run dev
```

Otwórz `http://localhost:3000/custom/matz/MasterSamples/` i wybierz gościa.
Widoki danych wymagają rzeczywistych endpointów FIS. Dokumentacja nie pobiera
danych produkcyjnych. Terminal z Vite musi pozostać uruchomiony.

```sh
npm run build
npm test
npm run lint
```

Budowa generuje dokumentację offline i aplikację w `frontend/dist/`.
Na produkcji skopiuj **zawartość** `dist/` do `/custom/matz/MasterSamples/`.
Dla innej ścieżki zmień `base` w `frontend/vite.config.ts` i zbuduj ponownie.
Pliku aplikacji `dist/index.html` nie otwieraj dwuklikiem.

Wdróż odpowiednie endpointy PHP na FIS1 i FIS2 pod
`/custom/matz/php/MasterDashboard.php`. Biblioteki i konfiguracja FIS muszą
być dostępne na obu hostach. PHP oraz Tcl danego FIS korzystają z tej samej bazy reguł.

## Centralne ładowanie Tcl

Router PHP korzysta z biblioteki BB na serwerze:
`/fis/mantis/custom/www/matz/phpBB/BuildingBlocks.php`.
Sprawdź jej dostępność na obu FIS podczas wdrożenia.

Dostęp do aplikacji określa **masterSamplesDashboard.acl** dla grup FIS:
`testeng`, `proceng`, `golden_samples`, `fisadmin_group`, `admin_group`.
ACL serwera jest niezależna od uprawnień zapisu `canEdit` w aplikacji;
tryb gościa nie omija ACL.

`/fis/mantis/custom/apps/local/lib/BB/loadcstpkgs` rejestruje i ładuje
`MasterCheck 1.3` z pliku `$_sysvar(CSTBBDIR)/mastercheck.tcl` dla wszystkich
skryptów. Nie dodawaj kolejnych `package require` w handlerach stacji.
Wybierz `MasterCheck.tcl` dla Tcl 8.6+ albo `MasterCheck85.tcl` dla Tcl 8.5.7+,
a wybrany plik skopiuj na serwer jako `mastercheck.tcl`.

Wywołania BREQ/BCMP z odpowiedziami `BCNF` i `BACK`, sposób ładowania oraz
wariant BREQ dla wszystkich SN opisuje
[backend/tcl/README.md](backend/tcl/README.md). Warunek tylko GOLDEN nie
uruchamia kontroli blokady przez BREQ dla zwykłych SN.

## Utrzymanie dokumentacji

Wspólna treść PL/EN: `frontend/src/documentation/content.ts`.
Po zmianie wykonaj w `frontend/` `npm run docs:build` albo `npm run build`.
`npm run docs:check` wykrywa rozbieżność HTML względem źródła.
Zachowuj identyfikatory rozdziałów, aby zapisane adresy nadal działały.

Szczegóły poleceń frontendu: [frontend/README.md](frontend/README.md).
