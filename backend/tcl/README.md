# MasterCheck 1.3.0

[Polski](README.md) | [English](README.en.md)

Moduł Tcl sprawdza mastery, nalicza wyniki i obsługuje pliki blokad.
`MasterCheck.tcl` wymaga Tcl 8.6+, `MasterCheck85.tcl` — Tcl 8.5.7+.
Oba korzystają z mysqltcl 3.x, MySQL 8 / InnoDB, bibliotek FIS
`Unit`, `Archive`, `Lib`, `Mail` i globalnego `param`.

## Centralne ładowanie przez loadcstpkgs

W tym środowisku biblioteki, w tym mysqltcl, są ładowane dla wszystkich skryptów.
W pliku `/fis/mantis/custom/apps/local/lib/BB/loadcstpkgs` sprawdź wpis:

```tcl
if { [file exists [file join $_sysvar(CSTBBDIR) mastercheck.tcl]] } {
    package ifneeded MasterCheck 1.3 [list source [file join $_sysvar(CSTBBDIR) mastercheck.tcl]]
}

# Ładowanie centralne — dostępne dla każdego skryptu.
package require MasterCheck 1.3
```

Wybrany wariant z repozytorium skopiuj jako **mastercheck.tcl** do katalogu
`$_sysvar(CSTBBDIR)`. Nazwa ma znaczenie na serwerze rozróżniającym wielkość liter.
Nie ładuj obu wariantów. Nie powtarzaj `package require mysqltcl` ani
`package require MasterCheck` w handlerach BREQ/BCMP.
Zrestartuj procesy korzystające z bibliotek; w procesie FIS sprawdź:

```tcl
info patchlevel
package present MasterCheck
info commands ::MasterCheck::BREQ
```

Wymaganie 1.3 jest zgodne z wersją 1.3.0 udostępnianą przez moduł.
`pkgIndex.tcl` pozostaje jako alternatywa standardowego mechanizmu pakietów
oraz testów; centralny loader wskazuje bezpośrednio `mastercheck.tcl`.

## MySQL — nowa instalacja

W każdej odrębnej bazie używanej przez PHP i Tcl wykonaj po kolei:

1. `backend/migrations/001_initial_schema.sql` — nowa baza i tabele podstawowe.
2. `backend/migrations/002_station_blocking_rules.sql` — tabela reguł.
3. `backend/migrations/003_verify_installation.sql` — kontrola struktury.

Jeżeli oba FIS współdzielą bazę, nie powtarzaj jej tworzenia. Jeżeli aktualne
tabele podstawowe już istnieją, a brakuje tylko reguł, użyj 002 i 003.
Ten zestaw nie importuje starych wyłączeń. Nie tworzy `stationBlockingExclusions`.
Pusta tabela oznacza wyłączone blokowanie `_MASTER`. Gdy reguły są potrzebne,
brak tabeli lub błąd SQL powoduje odmowę. Każdy tryb respektuje `disabled`:
0 włącza blokowanie, 1 je wyłącza. Pierwszeństwo ma reguła FIS, następnie
pojedyncza stacja, następnie najdłuższy pasujący prefiks. Dashboard zapisuje
reguły stacji/prefiksu z `disabled = 0`.

## BREQ w istniejącym handlerze GOLDEN

```tcl
if { $param(uk3) eq "GOLDEN" } {
    if { ![MasterCheck::BREQ $value(id) $param(process) $param(station)] } {
        set param(reply) "BCNF|id=$value(id)|status=$param(fStat)|msg=$error"
        return 0
    }
}
```

## BCMP w handlerze wyniku mastera

```tcl
if { ![MasterCheck::BCMP $value(id) $value(process) $station $value(status)] } {
    set param(reply) "BACK|id=$value(id)|status=$param(fStat)|msg=$error"
    return 0
}
```

Wywołuj BCMP dla testów masterów; `value(status)` musi być PASS albo FAIL.

## Reguły dashboardu i zwykłe SN

Powyższy warunek GOLDEN pomija BREQ dla zwykłych SN. Jeśli reguły dashboardu
mają sterować ich dopuszczaniem, zastosuj poniższy wariant BREQ dla każdego SN,
bez zewnętrznego warunku GOLDEN i bez osobnego sprawdzania pliku `_MASTER`:

```tcl
if { ![MasterCheck::BREQ $value(id) $param(process) $param(station)] } {
    set param(reply) "BCNF|id=$value(id)|status=$param(fStat)|msg=$error"
    return 0
}
```

Kod handlera EI nie jest częścią repozytorium — zmień go na stacji podczas
wdrożenia. BREQ/BCMP dla zwykłego SN na niezablokowanej stacji sprawdza plik
blokady i kończy się bez połączenia z MySQL. Przy istniejącej blokadzie czyta
aktualne reguły, nie wymaga mastera i nie nalicza testu. Dla GOLDEN kontroluje master/panel,
aktywność, proces i limity. BCMP rozpoznaje również zwykłe SN: respektuje blokadę stacji, ale nie nalicza
liczników mastera. Brak jednostki w FIS i archiwum jest dozwolony: sztuka może zostać utworzona
dopiero przez stację po kontroli. Traktujemy ją jak zwykłą produkcję i
respektujemy istniejącą blokadę. Błąd odczytu FIS kończy kontrolę odmową,
ale nie tworzy blokady. Brak lub puste `uk3` oznacza zwykłą produkcję.

Widok **Blokowanie stacji** zapisuje reguły `single` lub `prefix` osobno dla
FIS1/FIS2. Dopasowanie prefiksu jest literalne i rozróżnia wielkość liter.
Rekord `APR` obejmuje także przyszłe stacje zaczynające się od `APR`.
Usunięcie rekordu wyłącza blokowanie tylko gdy nie pasuje inny rekord;
nie usuwa istniejącego pliku. GOLDEN i liczniki pozostają kontrolowane.
Po ponownym włączeniu istniejący plik znów obowiązuje.

API: `GetStationBlockingRules` z `fis`; POST `SetStationBlocking` i
`DeleteStationBlockingRule` z `{fis, mode, station}`. `mode`: `single` lub
`prefix`. Zapis reguły stacji lub prefiksu włącza blokowanie.
Zapisy i usunięcia są audytowane. Nie ma cache konfiguracji: kolejne
BREQ/BCMP odczytuje aktualne reguły dla GOLDEN lub istniejącego pliku blokady.

Nadrzędne ustawienie dla całego FIS: `mode: "fis"`, `station: "ALL"`.
Zapis z `disabled: false` wymusza blokowanie wszystkich obecnych i przyszłych
stacji; `disabled: true` je wyłącza. Wymuszenie ma pierwszeństwo przed
regułami stacji i prefiksów. Usunięcie reguły `fis` przywraca zapisane
reguły bez ich modyfikowania i bez usuwania plików blokad. Wdroż PHP i TCL
razem z frontendem; istniejąca tabela nie wymaga nowej migracji.

Na hostach innych niż `plblofis1` / `plblofis2` ustaw przed pierwszym wywołaniem:

```tcl
set param(masterCheckFis) "FIS1" ;# na FIS2: "FIS2"
```

Wdrożenie: SQL, odpowiedni PHP dla każdego FIS, frontend, właściwy wariant
`mastercheck.tcl` i centralny loader, następnie handler EI. Sprawdź jedną stację:
zwykły SN, GOOD/BAD, oba wyniki, limity, prefix, usunięcie reguły i audyt.
Ręczne `LockStationMaster` / `UnlockStationMaster` oraz odblokowanie z dashboardu
są operacjami administracyjnymi niezależnymi od konfiguracji reguł.

Wariant 8.5 ładuje `/fis/mantis/common/config/system/system.cfg`; wariant 8.6
korzysta z konfiguracji systemowej załadowanej przez hosta. Oba ładują
`config.cfg` z katalogu `$::_sysvarc(FISVW_DB)` w globalnym zakresie.
Przed załadowaniem konfiguracji moduł ustawia globalne `param(dbName)` na
`masterSample`, jak w poprzedniej wersji. `_Connect` korzysta z globalnego
`param(dbName)`. Parametry `host`, `user`,
`password` i `port` pochodzą z tej konfiguracji, tak jak w poprzedniej wersji.
Błąd ładowania konfiguracji jest zapisywany w `::MasterCheck::error` i `::error`,
logowany przez `Lib::ShowError` i zgłaszany jako wyjątek Tcl; pakiet nie zostaje
wtedy zadeklarowany jako załadowany.
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
powinna korzystać z `BCMP`. `SafeUpdate db sql` pozostaje dostępne dla zewnętrznych wywołań.
Zapis wyniku mastera korzysta z `_Record`, które ponawia całą transakcję.

## Blokady i uprawnienia

Automatyczna blokada to `<stacja>_MASTER` w katalogu `blocked_machines`.
Tworzenie i usuwanie pliku wymaga wcześniej odczytanej, pasującej reguły stacji
lub prefiksu dla danego FIS. Sama obecność reguły nie tworzy pliku.

Domyślnie GOOD/PASS i BAD/FAIL są zgodne: po COMMIT BCMP usuwa blokadę.
GOOD/FAIL i BAD/PASS są niezgodne: po zapisie błędu BCMP tworzy lub zachowuje
blokadę i zwraca 0. **Wyjątek w MasterCheck85.tcl:** BAD/PASS także jest zgodne,
jeśli nazwa stacji zawiera DAL lub ADS (wielkie litery). MasterCheck.tcl tego
wyjątku nie ma. FAIL testera i zwrot 0 z funkcji to odrębne informacje.

Nieaktywny master, błędny proces, brak lub niejednoznaczny wybór mastera,
nieprawidłowe dane i osiągnięte limity powodują odmowę oraz próbę blokady,
jeśli pasującą regułę już odczytano. Awaria połączenia lub odczytu reguł
zwraca 0, ale utworzenie pliku nie jest wtedy gwarantowane.

BREQ zwykłego SN nie usuwa blokady. Poprawny GOLDEN może przejść BREQ mimo
istniejącego pliku, aby wykonać test odblokowujący. Samo BREQ nie odblokowuje.
Limit jest sprawdzany przed naliczeniem: zgodny test 99/100 może zapisać 100/100
i odblokować, a następna kontrola odmówi i spróbuje zablokować stację.
Po zapisie liczników awaria usunięcia pliku nie cofa testu; nie powtarzaj BCMP
automatycznie. Bez reguły plik pozostaje bez zmian, ale GOLDEN i liczniki są kontrolowane.

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

Przy awarii wymaganego połączenia SQL moduł zwraca `0` i nie usuwa pliku.
Zwykła produkcja bez pliku blokady nie wymaga połączenia SQL. Wywołujący
musi zatrzymać test przy każdym `0`; nie wolno traktować samego braku pliku jako
potwierdzenia poprawnego mastera. Błąd fizycznego blokowania jest jawnie logowany.

## Transakcje i powiadomienia

Deadlock 1213 lub lock timeout 1205 powoduje rollback i ponowienie całej
transakcji: do trzech prób z przerwami 100/200 ms. Timeout oczekiwania na rekord
jest ustawiany dla połączenia na 5 s. Niepewny wynik `COMMIT` nie jest ponawiany.
Brak deduplikacji wyników: ponowne wywołanie `BCMP` dla tego samego testu może
naliczyć go ponownie, także po zapisanym wyniku i późniejszej awarii odblokowania.

Offset maila wynosi `min(50, max(1, int(maxCounter * 0.2)))`, a próg
`max(1, maxCounter - offset)`, np. 16/20 lub 950/1000. Wiadomość wysyłana jest po zatwierdzonym
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

Lokalnie wariant przeszedł 107 testów na Tcl 8.6 z wyłączonym poleceniem `try`.
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

Po zatwierdzonym wyniku awaria odblokowania zwraca 0 bez ponownej próby
blokowania; nie ponawiaj automatycznie BCMP. Awaria utworzenia blokady przy
niezgodnym wyniku zachowuje pierwotny komunikat i wykonuje jedną próbę.
Jeśli inicjalizacja nowego pliku blokady nie powiedzie się, deskryptor jest
zamykany i wykonywana jest próba usunięcia utworzonego pliku.
