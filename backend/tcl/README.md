# MasterCheck 1.3.0

Moduł Tcl do sprawdzania masterów, naliczania wyników i obsługi plików blokad.
Wariant dla Tcl **8.5.7** znajduje się w `MasterCheck85.tcl`. Zachowuje te same
wywołania, tablice danych, globalne `param` i wyniki `1`/`0`. Używa `catch`
zamiast `try`, z jawnym zamykaniem plików i połączeń. `dict` jest używany tylko
do opcji błędów (obsługiwanych przez [catch w Tcl 8.5](https://www.tcl-lang.org/man/tcl8.5/TclCmd/catch.htm)).
W tym wariancie jest także kontrola poprawności nazwy stacji.
`pkgIndex.tcl` wybiera `MasterCheck85.tcl` dla Tcl 8.5 i `MasterCheck.tcl`
dla Tcl 8.6+. Nie ładuj obu wariantów do jednego interpretera.

Podstawowy wariant wymaga Tcl 8.6+, alternatywny Tcl 8.5.7+.
Oba wymagają mysqltcl 3.x, MySQL 8 / InnoDB i bibliotek FIS `Unit`, `Archive`,
`Lib`, `Mail`. Ładują dotychczasową konfigurację FIS i korzystają z globalnego `param`.

## Konfiguracja i API

Skopiuj `MasterCheck.tcl`, `MasterCheck85.tcl` oraz `pkgIndex.tcl` do katalogu pakietu dostępnego dla
FIS. W skrypcie stacji, po załadowaniu bibliotek FIS:

```tcl
package require mysqltcl 3.0
package require MasterCheck 1.3.0

if {![MasterCheck::BREQ $unit $process $station]} {
    # Zatrzymaj dalszy test i pokaż $::MasterCheck::error.
    return 0
}
# Uruchom test; wynik musi być PASS albo FAIL.
return [MasterCheck::BCMP $unit $process $station $status]
```

Moduł sam ładuje `/fis/mantis/common/config/system/system.cfg`, ustawia
globalne `param(dbName)` na `masterSample`, następnie ładuje
`config.cfg` z katalogu `$_sysvarc(FISVW_DB)`. Parametry `host`, `user`,
`password` i `port` pochodzą z tej konfiguracji, tak jak w poprzedniej wersji.
Błąd ładowania `config.cfg` jest zapisywany w `error` i logowany przez
`Lib::ShowError`; pakiet nie zostaje wtedy zadeklarowany jako załadowany.
Katalog blokad to `/fis/mantis/data/blocked_machines`, grupa to `fis`.

`BREQ unit process station` i `BCMP unit process station status` zwracają `1`/`0`.
Komunikat jest dostępny w `::MasterCheck::error` i w zmiennej `error` wywołującego,
zgodnie z poprzednim sposobem wywołania. Oczekiwany typ po udanym `BREQ` dostępny
jest jak wcześniej w globalnym `::param(pType)` (`GOOD`/`BAD`).

`BREQ` nie zwiększa liczników ani nie usuwa blokady. `BCMP` ponownie waliduje
rekord pod `FOR UPDATE`; odblokowuje tylko po potwierdzonym `COMMIT` zgodnego
wyniku. Dla mastera BAD wynik FAIL jest wynikiem zgodnym i nalicza cykl, nie błąd.
Wynik niezgodny nalicza `errorCounter` i `globalCounter`, blokuje stację i zwraca
`0`. Nieprawidłowe dane i przekroczone limity nie naliczają testu.

Publiczne `LockStationMaster station` i `UnlockStationMaster station` zachowują
argumenty i wynik `1`/`0`. Obsługują wyłącznie pliki i nie łączą się z MySQL.
`UnlockStationMaster` jest operacją administracyjną; normalna ścieżka wyników
powinna korzystać z `BCMP`. Stary ogólny `SafeUpdate` zastąpiono wewnętrznym
ponawianiem całej transakcji i nie należy już go wywoływać spoza modułu.

## Blokady i uprawnienia

Wykonaj na docelowym serwerze wyłącznie dla wskazanego katalogu:

```sh
chgrp fis /fis/mantis/data/blocked_machines
chmod 2775 /fis/mantis/data/blocked_machines
```

Nie używaj `-R`. Pozostałe pliki, w tym `UPS22_5156`, mają pozostać bez zmian.
Procesy FIS i PHP muszą należeć do grupy `fis`; po zmianie członkostwa uruchom
je ponownie, aby odświeżyły grupy. Nowe blokady mają grupę `fis` i prawa `0664`.
Istniejące regularne pliki pozostają bez zmiany zawartości, praw i czasu modyfikacji.
Symlinki i katalogi zamiast pliku są odrzucane; pliki są usuwane bez `-force`.
Zakładamy zaufanych współpracujących użytkowników katalogu grupowego, nie
ochronę przed złośliwym procesem równolegle podmieniającym ścieżki w tym katalogu.

Stacja wykonuje wywołania modułu kolejno; nie ma blokady MySQL per stacja.
`BREQ` i `BCMP` używają publicznych funkcji blokowania i odblokowania pliku.
Transakcja z `FOR UPDATE` chroni liczniki mastera używanego przez różne stacje.
Ręczne usunięcie pliku przez dashboard pozostaje osobną decyzją administratora.

Przy braku połączenia SQL moduł zwraca `0` i nie usuwa pliku. Wywołujący
musi zatrzymać test przy każdym `0`; nie wolno traktować samego braku pliku jako
potwierdzenia poprawnego mastera. Błąd fizycznego blokowania jest jawnie logowany.

## Transakcje i powiadomienia

Deadlock 1213 lub lock timeout 1205 powoduje rollback i ponowienie całej
transakcji: do trzech prób z przerwami 100/200 ms. Timeout oczekiwania na rekord
jest ustawiany dla połączenia na 5 s. Niepewny wynik `COMMIT` nie jest ponawiany.
Brak deduplikacji wyników: ponowne wywołanie `BCMP` dla tego samego testu może
naliczyć go ponownie, także po zapisanym wyniku i późniejszej awarii odblokowania.

Próg maila wynosi `max(1, maxCounter-50)`. Wiadomość wysyłana jest po zatwierdzonym
przejściu przez próg, z wartości policzonych pod blokadą rekordu. Jest jedna próba,
bez kolejki i bez gwarancji dostarczenia przy awarii procesu. Po ręcznym resecie
licznika ponowne przekroczenie progu oznacza nowe powiadomienie. Błąd wysyłki lub
brak adresata trafia do `Lib::ShowError`, ale nie cofa zapisanego testu.
Adres odbiorcy pochodzi z `engineers` dla pełnej nazwy wywoływanego procesu.

## Testy i wdrożenie

Wariant 8.5.7:

```sh
tclsh8.5 tests/MasterCheck85.test.tcl
```

Lokalnie wariant przeszedł 56 testów na Tcl 8.6 z wyłączonym poleceniem `try`.
Nie został jeszcze uruchomiony na rzeczywistym Tcl 8.5.7; sprawdź go na docelowym
interpreterze razem z zainstalowanymi bibliotekami mysqltcl i FIS.

Testy z atrapami FIS/MySQL i prawdziwym I/O plikowym:

```sh
tclsh8.6 tests/MasterCheck.test.tcl
```

Na Linux test uruchom jako użytkownik należący do `fis`, z prawami zapisu do
katalogu testów. Na Windows prawa POSIX i przypadek symlinka są emulowane.
`tests/run_with_tcl_dll.py` pozwala uruchomić ten sam zestaw z istniejącym Tcl 8.6
DLL bez instalacji Tcl; koryguje też obsługę przekierowanych ścieżek Windows w
sandboxie. Nie zastępuje testu Linux.

Integracja wymaga Linux, mysqltcl, PHP CLI i **izolowanego serwera MySQL 8**:

```sh
export MC_TEST_HOST=127.0.0.1
export MC_TEST_USER=mastercheck_test
# Ustaw MC_TEST_PASSWORD bez umieszczania hasła w historii terminala.
export MC_TEST_GROUP=fis
tclsh8.6 tests/MySQL.integration.tcl
```

Konto testowe musi móc tworzyć i usuwać tymczasowe bazy `mastercheck_test_*`.
Suite tworzy własną bazę i katalog testów, sprawdza równoległe procesy, limity,
mail, rzeczywisty deadlock/timeout, prawa POSIX i usuwanie pliku przez PHP CLI.
Nie uruchamiaj jako root: test braku uprawnień ma sprawdzać rzeczywistą odmowę.
Nie wykorzystuj produkcyjnego serwera ani konta administracyjnego FIS.

Przed wdrożeniem: przeprowadź oba zestawy, zachowaj poprzedni moduł i wdroż
wersję 1.3.0 najpierw na jednej stacji. Sprawdź z rzeczywistym FIS master GOOD
i BAD, panel, archiwum, blokadę z dashboardu oraz usuwanie pliku przez faktyczne
konto web-serwera PHP. Zweryfikuj licznik i log po obu wynikach oraz mail na
progu. Dopiero potem rozszerz wdrożenie na pozostałe stacje; nie mieszaj starej
i nowej wersji na jednej stacji. Przy wycofaniu przywróć poprzedni moduł.
