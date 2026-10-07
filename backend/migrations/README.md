# SQL — nowa instalacja Master Samples

[Polski](README.md) | [English](README.en.md)

W kliencie MySQL lub narzędziu administracyjnym połącz się z właściwym serwerem.
Uruchom pliki w kolejności:

1. `001_initial_schema.sql` — nowa baza `masterSample`, tabele masterów,
   audytu, procesów i książki adresowej. Kolumna `history.FIS` jest od razu obecna.
2. `002_station_blocking_rules.sql` — bieżąca tabela reguł stacji i prefiksów.
3. `003_verify_installation.sql` — odczyt struktury i liczby reguł, bez zmian danych.

Pierwszy plik dotyczy wyłącznie nowej bazy i celowo zgłasza błąd, jeśli już istnieje.
Jeśli baza i aktualne tabele podstawowe już są przygotowane, a brakuje tylko tabeli
reguł, użyj `002`, następnie `003`. Nie ignoruj błędów SQL i nie uruchamiaj plików
tworzących tabele ponownie po niepełnej instalacji bez sprawdzenia jej stanu.

Wykonaj zestaw raz na każdej **odrębnej bazie** używanej przez FIS1/FIS2.
Gdy oba hosty wskazują tę samą bazę, nie powtarzaj tworzenia tabel.
PHP i MasterCheck dla danego FIS muszą odczytywać tę samą konfigurację bazy.

Pusta tabela reguł oznacza wyłączoną obsługę blokad `_MASTER` na wszystkich
stacjach. Dodaj rzeczywiste rekordy `single` lub `prefix` w dashboardzie.
Nazwy i FIS wybierz z list oraz sprawdź podgląd maszyn. Rekordy nie tworzą
ani nie usuwają plików blokad. `disabled` pozostaje wymagane przez aktualny PHP,
ma wartość 0 i nie służy do przełączania reguły.

Zestaw nie tworzy starych `stationBlockingExclusions`, nie importuje danych
i nie zmienia znaczenia istniejących rekordów. Stare migracje aktualizacyjne
zostały usunięte; ten katalog opisuje nową instalację, nie aktualizację starej bazy.

Pełną instrukcję otwórz dwuklikiem: `docs/MasterSamples.html` w katalogu projektu.
