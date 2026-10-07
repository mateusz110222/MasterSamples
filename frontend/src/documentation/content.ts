export type DocLanguage = 'PL' | 'EN';
export type DocBlock =
    | { kind: 'paragraph'; text: string }
    | { kind: 'heading'; text: string }
    | { kind: 'note'; text: string }
    | { kind: 'steps'; items: string[] }
    | { kind: 'flow'; items: string[] }
    | { kind: 'table'; headers: string[]; rows: string[][] }
    | { kind: 'code'; text: string };
export interface DocSection {
    id: string;
    group: 'guide' | 'technical';
    title: string;
    description: string;
    blocks: DocBlock[];
    link?: { to: string; label: string; edit?: boolean };
}

type Localized<T> = Record<DocLanguage, T>;
const pair = <T,>(PL: T, EN: T): Localized<T> => ({ PL, EN });
const paragraph = (PL: string, EN: string): Localized<DocBlock> => pair({ kind: 'paragraph', text: PL }, { kind: 'paragraph', text: EN });
const note = (PL: string, EN: string): Localized<DocBlock> => pair({ kind: 'note', text: PL }, { kind: 'note', text: EN });
const steps = (PL: string[], EN: string[]): Localized<DocBlock> => pair({ kind: 'steps', items: PL }, { kind: 'steps', items: EN });
const flow = (PL: string[], EN: string[]): Localized<DocBlock> => pair({ kind: 'flow', items: PL }, { kind: 'flow', items: EN });
const table = (headers: Localized<string[]>, rows: Localized<string[][]>): Localized<DocBlock> => pair(
    { kind: 'table', headers: headers.PL, rows: rows.PL }, { kind: 'table', headers: headers.EN, rows: rows.EN },
);
const code = (text: string): Localized<DocBlock> => pair({ kind: 'code', text }, { kind: 'code', text });
const heading = (PL: string, EN: string): Localized<DocBlock> => pair({ kind: 'heading', text: PL }, { kind: 'heading', text: EN });

interface SectionSource {
    id: string;
    group: DocSection['group'];
    title: Localized<string>;
    description: Localized<string>;
    blocks: Localized<DocBlock>[];
    link?: { to: string; label: Localized<string>; edit?: boolean };
}

const source: SectionSource[] = [
    {
        id: 'getting-started', group: 'guide',
        title: pair('Pierwsze kroki', 'Getting started'),
        description: pair('Poznaj system, dostęp i codzienną ścieżkę pracy.', 'Understand the system, access and your daily workflow.'),
        blocks: [
            paragraph('Dostęp do aplikacji na serwerze FIS określa masterSamplesDashboard.acl. Dozwolone grupy FIS: testeng, proceng, golden_samples, fisadmin_group, admin_group. Użytkownik musi należeć do co najmniej jednej z tych grup.', 'Access to the application on the FIS server is controlled by masterSamplesDashboard.acl. Allowed FIS groups: testeng, proceng, golden_samples, fisadmin_group, admin_group. A user must belong to at least one of these groups.'),
            paragraph('Master Samples to ewidencja jednostek wzorcowych używanych do sprawdzania procesów produkcyjnych. Łączy parametry masterów, wyniki kontroli, blokady stacji oraz historię operacji w jednym panelu. FIS1 i FIS2 wskazują serwer obsługujący daną jednostkę lub stację.', 'Master Samples tracks reference units used to verify production processes. It brings together master settings, verification results, station locks and operation history. FIS1 and FIS2 identify the server serving a unit or station.'),
            steps(['Zaloguj się swoim kontem lub wybierz dostęp gościa na ekranie logowania.', 'Na dashboardzie wyszukaj SN mastera i sprawdź proces, FIS, aktywność oraz oba limity.', 'Jeśli coś wymaga wyjaśnienia, otwórz historię mastera lub pełny widok audytu.', 'Wykonuj zmiany wyłącznie zgodnie z procedurą obowiązującą na produkcji.'], ['Sign in with your account or choose guest access on the login screen.', 'Find the master SN on the dashboard and check its process, FIS, activity and both limits.', 'Open the master history or the full audit view to investigate an issue.', 'Make changes according to the procedure used on your production line.']),
            table(pair(['Dostęp', 'Możliwości'], ['Access', 'Capabilities']), pair([
                ['Gość / odczyt', 'Dashboard, zablokowane maszyny, historia i dokumentacja. Bez operacji zapisu.'],
                ['Użytkownik z canEdit', 'Dodatkowo tworzenie i edycja masterów, reset, blokowanie, aktywowanie, usuwanie oraz administracja.'],
            ], [
                ['Guest / read access', 'Dashboard, blocked machines, history and documentation. No write operations.'],
                ['User with canEdit', 'Also master creation and editing, reset, blocking, activation, deletion and administration.'],
            ])),
            note('Uprawnienia zapisu są weryfikowane również przez backend. Brak przycisku administracyjnego może wynikać z uprawnień konta. Dokumentacja jest dostępna także dla gościa.', 'The backend also checks write access. An administrative button may be absent because of account permissions. Guests can also read this documentation.'),
            note('ACL serwera FIS kontroluje dostęp do aplikacji, a canEdit kontroluje operacje zapisu wewnątrz niej. Tryb gościa nie omija ACL serwera. Osobny plik HTML dokumentacji można czytać lokalnie bez logowania do FIS.', 'The FIS server ACL controls access to the application, while canEdit controls write operations within it. Guest mode does not bypass the server ACL. The standalone HTML documentation can be read locally without signing in to FIS.'),
        ], link: { to: '/', label: pair('Otwórz dashboard', 'Open dashboard') },
    },
    {
        id: 'dashboard', group: 'guide', title: pair('Dashboard i wyszukiwanie', 'Dashboard and search'),
        description: pair('Znajdź mastera i szybko oceń, co wymaga uwagi.', 'Find a master and quickly see what needs attention.'),
        blocks: [
            paragraph('Karty podsumowania pokazują dostępne, aktywne oraz serwisowane / zablokowane mastery. Wiersz tabeli łączy SN, procesy, FIS, status wzorca, aktywność i liczniki. GOOD/BAD opisuje oczekiwany wynik wzorca; nie zastępuje informacji o jego aktywności.', 'Summary cards show available, active and service / blocked masters. Each table row combines the SN, processes, FIS, reference status, activity and counters. GOOD/BAD describes the expected reference result; it does not replace activity information.'),
            steps(['Wpisz numer SN, proces lub pracownika w wyszukiwarkę.', 'Zawęź wyniki filtrami procesu, GOOD/BAD i aktywności. Możesz też wybrać gotowy filtr zadań.', 'Kliknij nagłówek kolumny, aby zmienić sortowanie. Korzystaj ze stronicowania przy większej liczbie wpisów.', 'Otwórz historię konkretnego mastera. Eksport CSV pobiera aktualnie przefiltrowany i posortowany zbiór masterów, również spoza bieżącej strony.'], ['Enter an SN, process or employee in the search field.', 'Narrow results by process, GOOD/BAD and activity. You can also select a task preset.', 'Click a column heading to change sorting. Use pagination for larger datasets.', 'Open a specific master’s history. CSV export downloads the currently filtered and sorted master dataset, including rows beyond the current page.']),
            note('Filtr „80%” wskazuje zużycie co najmniej 80% limitu cykli. „Wymaga uwagi” obejmuje osiągnięte limity cykli lub błędów oraz zablokowane mastery. Filtr związany z użytkownikiem opiera się na pracowniku zapisanym w rekordzie.', 'The “80%” preset identifies cycle usage of at least 80%. “Requires attention” includes reached cycle or error limits and blocked masters. The user-related preset matches the employee stored in the record.'),
        ], link: { to: '/', label: pair('Przejdź do ewidencji', 'Go to the registry') },
    },
    {
        id: 'create-master', group: 'guide', title: pair('Dodawanie mastera', 'Creating a master'),
        description: pair('Rejestracja SN, procesów i parametrów na właściwym FIS.', 'Register an SN, processes and settings on the correct FIS.'),
        blocks: [
            steps(['Otwórz „Dodaj nowego mastera” i wybierz FIS1 albo FIS2.', 'Podaj SN, status GOOD/BAD oraz limity cykli i błędów.', 'Wybierz tryb pojedynczego procesu albo wielu procesów i wskaż procesy z listy wybranego FIS.', 'Opcjonalnie przypisz PN / userKey2, jeśli potrzebujesz tej funkcji.', 'Zapisz. Jeśli SN już istnieje, sprawdź porównanie parametrów przed potwierdzeniem aktualizacji.'], ['Open “Add new master” and select FIS1 or FIS2.', 'Enter the SN, GOOD/BAD status, cycle limit and error limit.', 'Choose single-process or multiple-process mode and select processes from the chosen FIS list.', 'Optionally assign a PN / userKey2 when needed.', 'Save. If the SN already exists, review the settings comparison before confirming an update.']),
            flow(['Wybór FIS i parametrów', 'Przygotowanie jednostki w FIS', 'Zapis ewidencji', 'Wpis w historii'], ['Choose FIS and settings', 'Prepare the unit in FIS', 'Save registry record', 'Write history entry']),
            note('Tworzenie przygotowuje jednostkę w FIS i może obejmować odarchiwizowanie, usunięcie istniejącej jednostki FIS i ponowną rejestrację. Potwierdzenie aktualizacji z innym FIS uruchamia migrację: usunięcie jednostki na starym FIS, następnie rejestrację na nowym. To operacje na dwóch serwerach; po błędzie sprawdź stan obu FIS przed ponowieniem.', 'Creation prepares the unit in FIS and may include unarchiving, deleting an existing FIS unit and registering it again. Confirming an update with a different FIS starts migration: deleting the old FIS unit, then registering it on the new server. These are operations on two servers; after an error, inspect both FIS states before retrying.'),
        ], link: { to: '/create', label: pair('Dodaj mastera', 'Add a master'), edit: true },
    },
    {
        id: 'master-actions', group: 'guide', title: pair('Edycja i operacje na masterach', 'Editing and master operations'),
        description: pair('Co zmieniają edycja, reset, blokowanie i usuwanie.', 'Understand editing, reset, blocking and deletion.'),
        blocks: [
            table(pair(['Operacja', 'Skutek'], ['Operation', 'Effect']), pair([
                ['Edycja — ikona ołówka', 'Zmienia procesy oraz maxCounter i errorMaxCounter. Zachowuje bieżące liczniki, GOOD/BAD i aktywność. Zapis bez zmian nie tworzy audytu.'],
                ['Reset cykli / błędów / obu', 'Zeruje wybrane liczniki bieżące. Zachowuje licznik globalny (globalCounter). Master z isactive = 2 jest pomijany.'],
                ['Zablokuj', 'Ustawia isactive = 2 i zapisuje Block. Master nie przechodzi kontroli aktywności.'],
                ['Aktywuj', 'Ustawia isactive = 1 i zapisuje Activate. Osiągnięte limity nadal mogą uniemożliwiać test.'],
                ['Usuń z ewidencji', 'Wywołuje Unit::Delete na FIS przypisanym do mastera, a następnie usuwa rekord masterUnits z audytem Delete.'],
            ], [
                ['Edit — pencil icon', 'Changes processes, maxCounter and errorMaxCounter. Preserves current counters, GOOD/BAD and activity. An unchanged save creates no audit entry.'],
                ['Reset cycles / errors / both', 'Zeros the selected current counters. Preserves globalCounter. Masters with isactive = 2 are skipped.'],
                ['Block', 'Sets isactive = 2 and records Block. The master fails the activity check.'],
                ['Activate', 'Sets isactive = 1 and records Activate. Reached limits can still prevent testing.'],
                ['Delete from registry', 'Calls Unit::Delete on the master’s assigned FIS, then deletes the masterUnits record with a Delete audit entry.'],
            ])),
            steps(['Wyszukaj SN i sprawdź FIS oraz aktualny stan.', 'Wybierz akcję w wierszu. Przy edycji sprawdź procesy i oba limity; przy resecie wybierz zakres.', 'Przeczytaj okno potwierdzenia i zatwierdź właściwą operację.', 'Sprawdź komunikat, odświeżone wartości i historię mastera.'], ['Find the SN and check its FIS and current state.', 'Select a row action. For editing, review processes and both limits; for reset, choose the scope.', 'Read the confirmation and approve the intended operation.', 'Check the response, refreshed values and master history.']),
            note('Można zapisać limit niższy od bieżącego licznika. Następna kontrola MasterCheck uwzględni nowy limit. Aktywowanie mastera i zdjęcie blokady maszyny to odrębne operacje.', 'A limit can be saved below its current counter. The next MasterCheck validation uses the new limit. Activating a master and unlocking a machine are separate operations.'),
        ], link: { to: '/', label: pair('Otwórz mastery', 'Open masters') },
    },
    {
        id: 'counters', group: 'guide', title: pair('Statusy, wyniki i liczniki', 'Statuses, results and counters'),
        description: pair('Jak interpretować GOOD/BAD, PASS/FAIL i osiągnięte limity.', 'Interpret GOOD/BAD, PASS/FAIL and reached limits.'),
        blocks: [
            table(pair(['Typ mastera w bazie', 'Wynik testu ze stacji', 'Interpretacja'], ['Master type in database', 'Test result from station', 'Meaning']), pair([
                ['GOOD', 'PASS', 'Zgodny: currentCounter + 1, globalCounter + 1.'],
                ['BAD', 'FAIL', 'Zgodny: currentCounter + 1, globalCounter + 1.'],
                ['GOOD', 'FAIL', 'Niezgodny: errorCounter + 1, globalCounter + 1.'],
                ['BAD', 'PASS', 'Niezgodny: errorCounter + 1, globalCounter + 1.'],
            ], [
                ['GOOD', 'PASS', 'Matched: currentCounter + 1, globalCounter + 1.'],
                ['BAD', 'FAIL', 'Matched: currentCounter + 1, globalCounter + 1.'],
                ['GOOD', 'FAIL', 'Mismatched: errorCounter + 1, globalCounter + 1.'],
                ['BAD', 'PASS', 'Mismatched: errorCounter + 1, globalCounter + 1.'],
            ])),
            paragraph('currentCounter zlicza zgodne testy od resetu cykli. errorCounter zlicza niezgodne testy od resetu błędów. globalCounter zlicza oba rodzaje wyników i nie jest zerowany przez reset dashboardu. maxCounter i errorMaxCounter to odpowiednie limity.', 'currentCounter counts matched tests since the cycle reset. errorCounter counts mismatched tests since the error reset. globalCounter counts both result types and is not cleared by the dashboard reset. maxCounter and errorMaxCounter are their respective limits.'),
            note('Wyjątek w MasterCheck85.tcl: jeśli nazwa stacji zawiera DAL lub ADS (wielkie litery), wynik PASS dla mastera BAD jest także traktowany jako zgodny przez BCMP. FAIL dla BAD nadal jest zgodny. MasterCheck.tcl dla Tcl 8.6 nie ma tego wyjątku. Sprawdź wariant faktycznie wgrany jako mastercheck.tcl.', 'Exception in MasterCheck85.tcl: when the station name contains DAL or ADS (uppercase), BCMP also treats PASS for a BAD master as matched. FAIL for BAD remains matched. The Tcl 8.6 MasterCheck.tcl does not have this exception. Check which variant is actually deployed as mastercheck.tcl.'),
            note('MasterCheck odmawia testu, gdy currentCounter ≥ maxCounter lub errorCounter ≥ errorMaxCounter. Nieprawidłowe dane i osiągnięte limity nie naliczają testu. GOOD/BAD opisuje wzorzec, PASS/FAIL opisuje wynik, a isactive = 1 / 2 oznacza aktywny / zablokowany master.', 'MasterCheck rejects a test when currentCounter ≥ maxCounter or errorCounter ≥ errorMaxCounter. Invalid data and reached limits do not count a test. GOOD/BAD describes the reference, PASS/FAIL describes the result, and isactive = 1 / 2 means active / blocked master.'),
        ],
    },
    {
        id: 'station-locks', group: 'guide', title: pair('Blokady maszyn i reguły stacji', 'Machine locks and station rules'),
        description: pair('Kiedy MasterCheck blokuje stację, kiedy ją zwalnia i co oznacza FAIL.', 'When MasterCheck locks or releases a station, and what FAIL means.'),
        blocks: [
            heading('Co dokładnie jest blokowane?', 'What exactly is blocked?'),
            table(pair(['Mechanizm', 'Znaczenie'], ['Mechanism', 'Meaning']), pair([
                ['Blokada mastera', 'isactive = 2 w ewidencji. Dotyczy jednostki wzorcowej.'],
                ['Plik blokady maszyny', 'Plik w blocked_machines. Widok pokazuje nazwę maszyny, końcówkę / typ blokady i serwer FIS.'],
                ['Reguła blokowania stacji', 'Rekord single lub prefix włącza obsługę blokad _MASTER dla pasujących stacji na wybranym FIS.'],
            ], [
                ['Master block', 'isactive = 2 in the registry. Applies to the reference unit.'],
                ['Machine lock file', 'A file in blocked_machines. The view shows the machine name, suffix / lock type and FIS server.'],
                ['Station blocking rule', 'A single or prefix record enables _MASTER lock handling for matching stations on the selected FIS.'],
            ])),
            steps(['W „Blokowanie stacji” wybierz FIS i zakres: pojedyncza stacja albo prefix.', 'Wybierz nazwę z listy, sprawdź podgląd pasujących maszyn i potwierdź zapis.', 'Rekord włącza blokowanie. Prefix APR obejmuje wszystkie nazwy zaczynające się od APR, również przyszłe; wielkość liter ma znaczenie.', 'Usunięcie rekordu wyłącza blokowanie tylko wtedy, gdy nie pasuje żadna inna reguła. Nie usuwa ani nie tworzy pliku blokady.', 'Aby usunąć istniejący plik, przejdź do „Zablokowane maszyny”, sprawdź FIS i potwierdź odblokowanie właściwego wiersza.'], ['In “Station blocking”, choose the FIS and scope: a single station or a prefix.', 'Choose a name from the list, review the matching machines and confirm the save.', 'A record enables blocking. Prefix APR covers all names starting with APR, including future ones; matching is case-sensitive.', 'Deleting a record disables blocking only if no other rule matches. It neither removes nor creates a lock file.', 'To remove an existing file, open “Blocked machines”, check the FIS and confirm unlocking the correct row.']),
            note('Bez pasującego rekordu blokowanie _MASTER jest wyłączone, ale walidacja GOLDEN i liczniki pozostają aktywne. Istniejący plik pozostaje i ponownie obowiązuje po włączeniu blokowania. Brak tabeli reguł lub błąd bazy powoduje odmowę, nie wyłączenie kontroli. Takie same nazwy na FIS1 i FIS2 to osobne blokady.', 'Without a matching record, _MASTER blocking is disabled, but GOLDEN validation and counters remain active. An existing file is retained and applies again when blocking is enabled. A missing rules table or database error causes rejection, not disabled checks. Identical names on FIS1 and FIS2 are separate locks.'),
            heading('Kiedy maszyna zostanie zablokowana?', 'When does a machine become locked?'),
            paragraph('Automatyczna blokada ma postać pliku /fis/mantis/data/blocked_machines/<stacja>_MASTER. MasterCheck tworzy go lub zachowuje istniejący plik tylko wtedy, gdy odczytał pasującą regułę single/prefix dla tej stacji i jej FIS. Sama reguła jedynie włącza obsługę blokad; nie blokuje od razu maszyny.', 'An automatic lock is a file at /fis/mantis/data/blocked_machines/<station>_MASTER. MasterCheck creates it or retains the existing file only after reading a matching single/prefix rule for the station and its FIS. A rule merely enables lock handling; it does not immediately lock the machine.'),
            heading('Typ mastera, wynik testu i stan maszyny — trzy różne informacje', 'Master type, test result and machine state — three different things'),
            paragraph('GOOD i BAD to zapisany w bazie typ / status mastera (masterUnits.status). GOOD oznacza dobry wzorzec, który powinien przejść test. BAD oznacza zły wzorzec, którego niezgodność tester powinien wykryć. PASS i FAIL to wynik konkretnego testu zgłoszony przez stację do BCMP jako value(status): PASS — tester uznał jednostkę za poprawną, FAIL — tester wykrył niezgodność. To nie jest zmiana statusu mastera: master GOOD nie „zmienia się” w FAIL.', 'GOOD and BAD are the master type / status stored in the database (masterUnits.status). GOOD is a good reference that should pass the test. BAD is a bad reference whose defect the tester should detect. PASS and FAIL are the result of a specific test reported by the station to BCMP as value(status): PASS means the tester accepted the unit; FAIL means it detected a defect. This is not a change in master status: a GOOD master does not “become” FAIL.'),
            paragraph('Stan blokady maszyny to osobna informacja: ZABLOKOWANA oznacza obecność pliku <stacja>_MASTER, a ODBLOKOWANA — brak tego pliku. MasterCheck nie nadaje maszynie statusu GOOD ani BAD. W tabeli poniżej porównujemy typ mastera z wynikiem otrzymanym ze stacji; opis blokady zakłada pasującą regułę oraz udany zapis i operację na pliku.', 'Machine lock state is separate: LOCKED means the <station>_MASTER file exists, and UNLOCKED means it does not. MasterCheck does not assign GOOD or BAD to the machine. The table compares the master type with the result reported by the station; lock outcomes assume a matching rule and successful saving and file operations.'),
            table(pair(['Typ mastera w bazie', 'Wynik testu ze stacji', 'Ocena i decyzja BCMP', 'Stan blokady maszyny'], ['Master type in database', 'Test result from station', 'BCMP assessment and decision', 'Machine lock state']), pair([
                ['GOOD — dobry wzorzec', 'PASS — tester uznał go za poprawny', 'Zgodny: dobry wzorzec przeszedł test. currentCounter + 1, globalCounter + 1; BCMP zwraca 1.', 'ODBLOKOWANA: usuwa plik po COMMIT lub pozostawia brak pliku.'],
                ['GOOD — dobry wzorzec', 'FAIL — tester zgłosił niezgodność', 'Niezgodny: dobry wzorzec nie przeszedł testu. errorCounter + 1, globalCounter + 1; BCMP zwraca 0.', 'ZABLOKOWANA: tworzy lub zachowuje plik.'],
                ['BAD — zły wzorzec', 'FAIL — tester wykrył jego niezgodność', 'Zgodny: tester prawidłowo wykrył zły wzorzec. currentCounter + 1, globalCounter + 1; BCMP zwraca 1.', 'ODBLOKOWANA: usuwa plik po COMMIT lub pozostawia brak pliku.'],
                ['BAD — zły wzorzec', 'PASS — tester uznał go za poprawny', 'Domyślnie niezgodny: tester przepuścił zły wzorzec. errorCounter + 1, globalCounter + 1; BCMP zwraca 0. Wyjątek DAL/ADS w Tcl 8.5 opisano poniżej.', 'Domyślnie ZABLOKOWANA: tworzy lub zachowuje plik.'],
            ], [
                ['GOOD — good reference', 'PASS — tester accepted it', 'Matched: the good reference passed. currentCounter + 1, globalCounter + 1; BCMP returns 1.', 'UNLOCKED: removes the file after COMMIT or keeps it absent.'],
                ['GOOD — good reference', 'FAIL — tester reported a defect', 'Mismatched: the good reference failed. errorCounter + 1, globalCounter + 1; BCMP returns 0.', 'LOCKED: creates or retains the file.'],
                ['BAD — bad reference', 'FAIL — tester detected its defect', 'Matched: the tester correctly detected the bad reference. currentCounter + 1, globalCounter + 1; BCMP returns 1.', 'UNLOCKED: removes the file after COMMIT or keeps it absent.'],
                ['BAD — bad reference', 'PASS — tester accepted it', 'Mismatched by default: the tester accepted the bad reference. errorCounter + 1, globalCounter + 1; BCMP returns 0. The Tcl 8.5 DAL/ADS exception is described below.', 'LOCKED by default: creates or retains the file.'],
            ])),
            heading('Pozostałe przyczyny odmowy i wpływ reguł', 'Other rejection causes and the effect of rules'),
            table(pair(['Sytuacja', 'Decyzja MasterCheck', 'Plik _MASTER'], ['Situation', 'MasterCheck decision', '_MASTER file']), pair([
                ['Master nieaktywny, niewłaściwy proces, brak / wiele pasujących masterów, niepoprawne dane lub osiągnięty limit', 'BREQ albo BCMP zwraca 0. Odmowa przed zapisem nie nalicza testu.', 'Próbuje utworzyć / zachować blokadę, jeśli wcześniej poprawnie odczytano pasującą regułę.'],
                ['Zwykły SN i istniejąca blokada', 'BREQ zwraca 0, jeśli pasuje reguła. Wymagany jest poprawny test mastera.', 'Pozostaje. Zwykły SN nie odblokowuje stacji.'],
                ['Brak pasującej reguły', 'Kontrola GOLDEN i decyzja 1/0 nadal działają. Niezgodny wynik nadal nalicza błąd.', 'MasterCheck automatycznie nie tworzy ani nie usuwa pliku.'],
                ['Błąd połączenia SQL lub odczytu reguł', 'Zwraca 0. Brak dostępu do konfiguracji nie oznacza zgody na test.', 'Nie można zagwarantować utworzenia pliku: reguła mogła jeszcze nie zostać odczytana.'],
            ], [
                ['Inactive master, wrong process, missing / ambiguous master, invalid data or reached limit', 'BREQ or BCMP returns 0. Rejection before recording does not count a test.', 'Attempts to create / retain the lock if a matching rule was successfully read earlier.'],
                ['Regular SN and an existing lock', 'BREQ returns 0 if a rule matches. A successful master check is required.', 'Retained. A regular SN does not unlock the station.'],
                ['No matching rule', 'GOLDEN validation and the 1/0 decision remain active. A mismatch still counts an error.', 'MasterCheck does not automatically create or remove the file.'],
                ['SQL connection or rule-read failure', 'Returns 0. Unavailable configuration does not mean permission to test.', 'File creation cannot be guaranteed: the rule may not have been read yet.'],
            ])),
            note('FAIL to wynik testera, a 0 to odmowa funkcji MasterCheck. Nie są tym samym: BAD → FAIL jest poprawnym testem mastera. W wariancie MasterCheck85.tcl także BAD → PASS jest zgodne na stacjach, których nazwa zawiera DAL lub ADS (wielkie litery). MasterCheck.tcl nie ma tego wyjątku. Gdy funkcja zwraca 0, handler zatrzymuje test i wysyła BCNF dla BREQ albo BACK dla BCMP; pole status pochodzi z param(fStat) handlera.', 'FAIL is the tester outcome, while 0 means rejection by a MasterCheck function. They are different: BAD → FAIL is a successful master check. MasterCheck85.tcl also accepts BAD → PASS on stations whose names contain DAL or ADS (uppercase). MasterCheck.tcl has no such exception. On a 0 return, the handler stops the test and sends BCNF for BREQ or BACK for BCMP; the status field comes from the handler’s param(fStat).'),
            heading('Jak wrócić do produkcji?', 'How do you resume production?'),
            flow(['Istnieje blokada _MASTER', 'GOLDEN przechodzi BREQ', 'Test daje wynik zgodny z wzorcem', 'BCMP zapisuje wynik i usuwa plik'], ['An _MASTER lock exists', 'GOLDEN passes BREQ', 'Test matches the reference', 'BCMP saves the result and removes the file']),
            paragraph('Istniejący plik nie odrzuca automatycznie poprawnego GOLDEN w BREQ — master musi móc przejść kontrolę i odblokować stację. Samo udane BREQ nie usuwa blokady. Robi to dopiero zgodny wynik BCMP po potwierdzonym zapisie, przy włączonej obsłudze blokowania. Usunięcie pliku ręcznie w dashboardzie nie naprawia procesu, limitów ani aktywności mastera.', 'An existing file does not automatically reject a valid GOLDEN unit in BREQ — the master must be able to pass validation and unlock the station. A successful BREQ alone does not remove the lock. Only a matched BCMP result after confirmed saving does so, with lock handling enabled. Manually removing the file in the dashboard does not fix the master’s process, limits or activity.'),
            heading('Kiedy zaczyna obowiązywać limit?', 'When does a limit take effect?'),
            paragraph('Przykład: GOOD ma 99/100 cykli i wynik PASS. BCMP zapisuje 100/100 i może jeszcze odblokować stację. Limit jest sprawdzany przed naliczeniem: następne BREQ lub BCMP tego mastera zwróci 0 i przy pasującej regule spróbuje zablokować stację. Dla błędów działa ten sam warunek errorCounter ≥ errorMaxCounter, ale sam niezgodny wynik już blokuje stację. Filtr dashboardu „80%” i powiadomienie mailowe nie są automatyczną blokadą.', 'Example: a GOOD master has 99/100 cycles and returns PASS. BCMP records 100/100 and can still unlock the station. Limits are checked before counting: the next BREQ or BCMP for that master returns 0 and attempts to lock the station if a rule matches. Errors use the same errorCounter ≥ errorMaxCounter condition, but a mismatched result itself already locks the station. The dashboard’s “80%” preset and an email notification are not automatic locks.'),
            note('Błąd zapisu lub obsługi pliku może również zwrócić 0. Jeśli licznik został już zapisany, a usunięcie pliku się nie udało, zapis nie jest cofany i stacja może pozostać zablokowana. Sprawdź komunikat oraz liczniki przed ponowieniem BCMP; powtórzenie tego samego wyniku może naliczyć test drugi raz. Niepewnego COMMIT nie ponawiaj automatycznie.', 'A save or file-handling error can also return 0. If the counter was already saved but file removal fails, the save is not rolled back and the station may remain locked. Check the message and counters before retrying BCMP; repeating the same result may count the test twice. Do not automatically retry an uncertain COMMIT.'),
        ], link: { to: '/blocked-machines', label: pair('Sprawdź zablokowane maszyny', 'Check blocked machines') },
    },
    {
        id: 'audit', group: 'guide', title: pair('Administracja i audyt', 'Administration and audit'),
        description: pair('Grupy mailowe i odtwarzanie historii zmian.', 'Mail groups and tracing the history of changes.'),
        blocks: [
            paragraph('„Grupy mailowe” wiążą proces z adresem / grupą mailową w tabeli engineers. Widok umożliwia zarządzanie procesami i adresami, korzystając ze znanych grup do podpowiedzi. Zmiany wymagają uprawnień zapisu.', '“Mail groups” associate a process with an email address / group in the engineers table. The view manages processes and addresses with suggestions from known groups. Changes require write access.'),
            steps(['W „Historia i audyt” filtruj po SN / jednostce, operacji, użytkowniku, procesie, statusie lub zakresie dat.', 'Sprawdź czas, operatora i FIS zapisane przy zdarzeniu. Korzystaj ze stronicowania i wyboru liczby wpisów.', 'Dla jednego SN możesz również otworzyć historię bezpośrednio z dashboardu. Eksport CSV w dashboardzie dotyczy ewidencji masterów, nie pełnego audytu.'], ['In “History and audit”, filter by SN / unit, operation, user, process, status or date range.', 'Check the event time, operator and recorded FIS. Use pagination and the page-size selector.', 'For a single SN, you can also open history directly from the dashboard. Dashboard CSV export covers the master registry, not the full audit log.']),
            table(pair(['Zdarzenia', 'Opis'], ['Events', 'Description']), pair([
                ['Create / Update / Delete', 'Rejestracja, zmiana ustawień lub usunięcie mastera.'],
                ['Reset / ResetCycles / ResetErrors', 'Reset obu liczników bieżących albo wybranego licznika.'],
                ['Block / Activate', 'Zmiana aktywności mastera.'],
                ['UnlockStation', 'Zdjęcie pliku blokady; unit oznacza maszynę, process oznacza typ blokady. Liczniki i status są puste.'],
                ['Reguły stacji', 'Zapis i usunięcie konfiguracji blokowania są audytowane.'],
            ], [
                ['Create / Update / Delete', 'Register, change settings or delete a master.'],
                ['Reset / ResetCycles / ResetErrors', 'Reset both current counters or one selected counter.'],
                ['Block / Activate', 'Change master activity.'],
                ['UnlockStation', 'Remove a lock file; unit identifies the machine, process identifies the lock type. Counters and status are empty.'],
                ['Station rules', 'Saving and deleting blocking configuration are audited.'],
            ])),
            note('Starsze zdarzenia mogą nie zawierać FIS. Nie należy przypisywać im serwera na podstawie aktualnego rekordu mastera. Wartość „—” oznacza brak danych, nie zero.', 'Older events may have no FIS value. Do not infer their server from the master’s current record. “—” means missing data, not zero.'),
        ], link: { to: '/history', label: pair('Otwórz historię i audyt', 'Open history and audit') },
    },
    {
        id: 'architecture', group: 'technical', title: pair('Architektura i interfejsy', 'Architecture and interfaces'),
        description: pair('Komponenty systemu, endpointy i odpowiedzialność danych.', 'System components, endpoints and data responsibilities.'),
        blocks: [
            flow(['React + HashRouter', 'PHP / MasterDashboard', 'MySQL + biblioteki FIS'], ['React + HashRouter', 'PHP / MasterDashboard', 'MySQL + FIS libraries']),
            paragraph('Frontend używa React, TypeScript, Vite, Tailwind i React Query. HashRouter pozwala udostępniać widoki bez reguł przepisywania adresów. PHP wybiera operację przez parametr job i zwraca obiekt status, message, data. Dane ewidencji i audytu przechowuje baza masterSample; pliki blokad znajdują się w /fis/mantis/data/blocked_machines/.', 'The frontend uses React, TypeScript, Vite, Tailwind and React Query. HashRouter serves views without URL rewrite rules. PHP selects an operation using the job parameter and returns status, message and data. The masterSample database stores registry and audit data; lock files live in /fis/mantis/data/blocked_machines/.'),
            table(pair(['Interfejs', 'Operacje / odpowiedzialność'], ['Interface', 'Operations / responsibility']), pair([
                ['/custom/matz/php/MasterDashboard.php', 'GetMasters, GetMasterHistory, GetHistory; POST ResetCounters, BlockMaster, ActivateMaster. Te operacje korzystają z hosta otwartego dashboardu.'],
                ['MasterDashboard.php na wybranym FIS', 'POST CreateMaster, UpdateMaster, DeleteMaster; GetBlockedMachines, POST DeleteBlockedMachine; GetStationBlockingRules, POST SetStationBlocking i DeleteStationBlockingRule.'],
                ['/custom/matz/phpBB/router.php', 'GetProcessTags, GetStationTags, GetUserKey — listy z odpowiedniego FIS. Router korzysta z biblioteki BuildingBlocks.php (BB).'],
                ['/fis/mantis/custom/www/matz/phpBB/BuildingBlocks.php', 'Biblioteka BB na serwerze FIS, używana przez router.php i backend. To zależność PHP, nie osobny endpoint API.'],
                ['masterSamplesDashboard.acl', 'Dostęp do aplikacji dla grup FIS: testeng, proceng, golden_samples, fisadmin_group, admin_group.'],
                ['Administracja PHP', 'GetEngineers, GetMails oraz operacje Add / Update / Delete dla procesów i adresów.'],
            ], [
                ['/custom/matz/php/MasterDashboard.php', 'GetMasters, GetMasterHistory, GetHistory; POST ResetCounters, BlockMaster, ActivateMaster. These operations use the dashboard’s host.'],
                ['MasterDashboard.php on the chosen FIS', 'POST CreateMaster, UpdateMaster, DeleteMaster; GetBlockedMachines, POST DeleteBlockedMachine; GetStationBlockingRules, POST SetStationBlocking and DeleteStationBlockingRule.'],
                ['/custom/matz/phpBB/router.php', 'GetProcessTags, GetStationTags, GetUserKey — lists from the appropriate FIS. The router uses the BuildingBlocks.php (BB) library.'],
                ['/fis/mantis/custom/www/matz/phpBB/BuildingBlocks.php', 'The BB library on the FIS server, used by router.php and the backend. It is a PHP dependency, not a separate API endpoint.'],
                ['masterSamplesDashboard.acl', 'Application access for FIS groups: testeng, proceng, golden_samples, fisadmin_group, admin_group.'],
                ['PHP administration', 'GetEngineers, GetMails and Add / Update / Delete operations for processes and addresses.'],
            ])),
            code('GetMasters: GET ?job=GetMasters\nUpdateMaster: POST ?job=UpdateMaster\n{ "unit": "EXAMPLE-SN", "fis": "FIS1", "process": "EXAMPLE-PROCESS", "maxCounter": 1000, "maxErrors": 10 }\n\nSetStationBlocking: POST ?job=SetStationBlocking\n{ "fis": "FIS1", "mode": "prefix", "station": "APR" }\n\nDeleteStationBlockingRule: POST ?job=DeleteStationBlockingRule\n{ "fis": "FIS1", "mode": "prefix", "station": "APR" }'),
            table(pair(['Tabela', 'Dane'], ['Table', 'Data']), pair([
                ['masterUnits', 'SN, procesy, GOOD/BAD, liczniki i limity, isactive, operator oraz FIS.'],
                ['history', 'Zdarzenia z operatorem, datą, operacją i opcjonalnym FIS.'],
                ['engineers', 'Proces i adres / grupa mailowa.'],
                ['stationBlockingRules', 'FIS, zakres single / prefix i nazwa stacji / prefiksu. Obecność rekordu włącza blokowanie.'],
            ], [
                ['masterUnits', 'SN, processes, GOOD/BAD, counters and limits, isactive, operator and FIS.'],
                ['history', 'Events with operator, date, operation and optional FIS.'],
                ['engineers', 'Process and email address / group.'],
                ['stationBlockingRules', 'FIS, single / prefix scope and station / prefix name. Record presence enables blocking.'],
            ])),
            note('Przykładowe payloady pokazują dane domenowe; zapisy wymagają również prawidłowej sesji i uprawnień. Bieżący frontend przekazuje tożsamość operatora przez klienta API. Reguły nie używają przełącznika disabled: zapis zawsze włącza blokowanie.', 'Example payloads show domain data; writes also require a valid session and permissions. The current frontend passes operator identity through its API client. Rules do not use a disabled switch: saving always enables blocking.'),
        ],
    },
    {
        id: 'mastercheck', group: 'technical', title: pair('MasterCheck: BREQ i BCMP', 'MasterCheck: BREQ and BCMP'),
        description: pair('Przepływ kontroli na stacji oraz bezpieczne naliczanie wyników.', 'Station validation flow and transactional result counting.'),
        blocks: [
            heading('Kolejność decyzji w MasterCheck', 'MasterCheck decision sequence'),
            steps(['Sprawdza nazwę stacji, łączy się z MySQL i odczytuje regułę blokowania dla właściwego FIS.', 'BREQ rozpoznaje SN w FIS. Zwykły SN jest odrzucany tylko przy obowiązującej blokadzie; błędy techniczne także powodują odmowę. GOLDEN przechodzi dalszą walidację.', 'Wybiera dokładnie jednego mastera dla procesu. Dla procesów zawierających SMT lub XRAY uwzględnia również panel / jednostkę nadrzędną i jednostki podrzędne.', 'Sprawdza GOLDEN, aktywność, proces, GOOD/BAD, poprawność liczników i oba limity. Udane BREQ ustawia param(pType) i zwraca 1, bez naliczania testu i bez usuwania blokady.', 'BCMP przyjmuje PASS/FAIL, ponownie sprawdza rekord pod FOR UPDATE, porównuje wynik z oczekiwanym i zapisuje liczniki w transakcji.', 'Po COMMIT wysyła powiadomienie, jeśli przekroczono próg, oraz obsługuje plik: wynik niezgodny blokuje, zgodny odblokowuje, o ile pasuje reguła. Błąd wysyłki maila nie cofa zapisu ani sam nie blokuje testu.'], ['Validates the station name, connects to MySQL and reads blocking rules for the correct FIS.', 'BREQ identifies the SN in FIS. A regular SN is rejected when an applicable lock exists; technical errors also cause rejection. GOLDEN proceeds to master validation.', 'Selects exactly one master for the process. For processes containing SMT or XRAY, it also considers the panel / parent and child units.', 'Checks GOLDEN, activity, process, GOOD/BAD, counter validity and both limits. Successful BREQ sets param(pType) and returns 1 without counting a test or removing the lock.', 'BCMP accepts PASS/FAIL, validates the record again under FOR UPDATE, compares the actual and expected result and saves counters transactionally.', 'After COMMIT, sends a notification if the threshold was crossed and handles the file: a mismatch locks, a match unlocks, if a rule matches. An email failure neither rolls back the save nor rejects the test by itself.']),
            note('MasterCheck85.tcl ma dodatkową zgodność BAD → PASS, gdy nazwa stacji zawiera DAL lub ADS. To wyjątek tylko wariantu Tcl 8.5; szczegóły decyzji, blokad i zwalniania stacji opisuje rozdział „Blokady maszyn i reguły stacji”.', 'MasterCheck85.tcl additionally accepts BAD → PASS when the station name contains DAL or ADS. This is specific to the Tcl 8.5 variant; see “Machine locks and station rules” for decision, lock and unlock details.'),
            flow(['BREQ: walidacja wejścia', 'Test na stacji', 'BCMP: walidacja i zapis', 'COMMIT → obsługa blokady'], ['BREQ: input validation', 'Station test', 'BCMP: validate and save', 'COMMIT → lock handling']),
            paragraph('BREQ unit process station zwraca 1 albo 0. Dla zwykłego SN sprawdza konfigurację stacji i istniejącą blokadę _MASTER; nie wymaga rekordu mastera ani nie nalicza testu. Dla GOLDEN sprawdza wybór mastera / panelu, aktywność, proces i limity. Nie zwiększa liczników i nie usuwa blokady.', 'BREQ unit process station returns 1 or 0. For a regular SN, it checks station configuration and an existing _MASTER lock; it does not require a master record or count a test. For GOLDEN, it validates the selected master / panel, activity, process and limits. It neither increments counters nor removes a lock.'),
            paragraph('BCMP unit process station status przyjmuje PASS albo FAIL i ponownie waliduje mastera w transakcji z FOR UPDATE. Wynik zgodny zwiększa currentCounter; niezgodny zwiększa errorCounter. Oba zwiększają globalCounter. Niezgodny wynik zwraca 0 i obsługuje blokowanie; zgodny usuwa blokadę dopiero po potwierdzonym COMMIT. Obsługa pliku zależy od dopasowania reguł stacji.', 'BCMP unit process station status accepts PASS or FAIL and validates the master again in a FOR UPDATE transaction. A matched result increments currentCounter; a mismatched result increments errorCounter. Both increment globalCounter. A mismatch returns 0 and handles locking; a match removes the lock only after a confirmed COMMIT. File handling depends on matching station rules.'),
            paragraph('Pakiety są już dostępne w skryptach dzięki centralnemu loadcstpkgs. Poniżej pokazano Wasz handler BREQ dla GOLDEN; nie dodawaj w nim kolejnych package require.', 'Packages are already available to scripts through the central loadcstpkgs. The following is your GOLDEN BREQ handler; do not add further package require statements there.'),
            code('if { $param(uk3) eq "GOLDEN" } {\n    if { ![MasterCheck::BREQ $value(id) $param(process) $param(station)] } {\n        set param(reply) "BCNF|id=$value(id)|status=$param(fStat)|msg=$error"\n        return 0\n    }\n}'),
            paragraph('W handlerze wyniku testu mastera wywołaj BCMP i obsłuż odmowę odpowiedzią BACK. Użyj istniejących zmiennych value i station; kod nie wymaga ponownego ładowania bibliotek.', 'In the master test-result handler, call BCMP and handle rejection with BACK. Use the existing value and station variables; the code does not need to load the libraries again.'),
            code('if { ![MasterCheck::BCMP $value(id) $value(process) $station $value(status)] } {\n    set param(reply) "BACK|id=$value(id)|status=$param(fStat)|msg=$error"\n    return 0\n}'),
            note('Pokazany warunek GOLDEN pomija BREQ dla zwykłych SN. Aby reguły dashboardu sterowały także dopuszczaniem zwykłych SN, użyj poniższego wariantu dla wszystkich SN, bez zewnętrznego warunku GOLDEN. Zastępuje on także zewnętrzne sprawdzanie pliku _MASTER, które omija reguły. BCMP nadal należy wywoływać tylko dla wyników testów masterów.', 'The shown GOLDEN condition skips BREQ for regular SNs. To apply dashboard rules to regular SN admission too, use the following all-SN variant without the outer GOLDEN condition. It also replaces an external _MASTER file check, which bypasses rules. Continue to call BCMP only for master test results.'),
            code('if { ![MasterCheck::BREQ $value(id) $param(process) $param(station)] } {\n    set param(reply) "BCNF|id=$value(id)|status=$param(fStat)|msg=$error"\n    return 0\n}'),
        ],
    },
    {
        id: 'deployment', group: 'technical', title: pair('Nowa instalacja i uruchomienie', 'Fresh installation and startup'),
        description: pair('Od pliku HTML do działającej aplikacji na FIS.', 'From the HTML file to a running application on FIS.'),
        blocks: [
            paragraph('Na każdym serwerze FIS sprawdź obecność /fis/mantis/custom/www/matz/phpBB/BuildingBlocks.php, do którego odwołuje się router.php. Skonfiguruj dostęp do aplikacji przez masterSamplesDashboard.acl dla grup testeng, proceng, golden_samples, fisadmin_group i admin_group. Sprawdź dostęp konta z dozwolonej grupy oraz odmowę dla konta spoza tych grup.', 'On each FIS server, check that /fis/mantis/custom/www/matz/phpBB/BuildingBlocks.php is available to router.php. Configure application access through masterSamplesDashboard.acl for testeng, proceng, golden_samples, fisadmin_group and admin_group. Verify access with an allowed-group account and rejection of an account outside these groups.'),
            paragraph('Zacznij od docs/MasterSamples.html: otwórz plik dwuklikiem w przeglądarce. To samodzielna dokumentacja PL/EN z całą treścią, wyszukiwarką i spisem rozdziałów; nie wymaga Node, npm, serwera ani logowania. Po wdrożeniu te same instrukcje są dostępne w zakładce Dokumentacja aplikacji.', 'Start with docs/MasterSamples.html: double-click it to open it in your browser. It is standalone PL/EN documentation with all content, search and a chapter index; it needs no Node, npm, server or login. After deployment, the same instructions are available in the application’s Documentation tab.'),
            table(pair(['Etap', 'Co jest potrzebne'], ['Stage', 'Requirements']), pair([
                ['Czytanie instrukcji HTML', 'Zwykła przeglądarka. Plik działa także po skopiowaniu osobno i bez internetu.'],
                ['Budowa frontendu', 'Node.js 22.18+ z gałęzi 22 albo Node.js 24+, npm i dostęp do paczek. Generator HTML i testy używają obsługi TypeScript w Node. Komendy uruchom w katalogu projektu.'],
                ['Instalacja serwerowa', 'PHP zgodny z istniejącym endpointem FIS, MySQL 8 / InnoDB, biblioteki FIS i dostęp do katalogu aplikacji.'],
                ['Integracja stacji', 'mysqltcl i biblioteki FIS już ładowane centralnie; właściwy wariant mastercheck.tcl zarejestrowany w loadcstpkgs.'],
            ], [
                ['Reading the HTML guide', 'A web browser. The file also works when copied on its own and without internet.'],
                ['Building the frontend', 'Node.js 22.18+ in the 22 series, or Node.js 24+, npm and package access. The HTML generator and tests use Node’s TypeScript support. Run commands from the project directory.'],
                ['Server installation', 'PHP compatible with the existing FIS endpoint, MySQL 8 / InnoDB, FIS libraries and access to the application directory.'],
                ['Station integration', 'mysqltcl and FIS libraries already loaded centrally; the correct mastercheck.tcl variant registered in loadcstpkgs.'],
            ])),
            code('cd frontend\nnpm install\nnpm run dev\n\n# Production bundle / pakiet produkcyjny\nnpm run build'),
            paragraph('Do podglądu deweloperskiego otwórz http://localhost:3000/custom/matz/MasterSamples/#/documentation i wybierz gościa. Terminal z npm run dev musi pozostać uruchomiony. Widoki danych wymagają prawdziwych endpointów FIS. Produkcyjne frontend/dist/index.html wymaga serwera — nie otwieraj go dwuklikiem; do tego służy osobny plik docs/MasterSamples.html.', 'For a development preview, open http://localhost:3000/custom/matz/MasterSamples/#/documentation and choose guest access. Keep the npm run dev terminal running. Data views need real FIS endpoints. The production frontend/dist/index.html needs a server — do not open it by double-clicking; use the separate docs/MasterSamples.html instead.'),
            steps(['W kliencie MySQL na każdej odrębnej bazie wykonaj backend/migrations/001_initial_schema.sql (nowa baza i tabele), potem 002_station_blocking_rules.sql (reguły), a następnie 003_verify_installation.sql (kontrola). Nie powtarzaj tworzenia bazy, jeśli FIS1 i FIS2 współdzielą tę samą bazę.', 'Zestaw dotyczy nowej instalacji: nie importuje starych wyjątków. Pusta tabela reguł wyłącza blokowanie _MASTER. Po uruchomieniu zapisz rzeczywiste reguły stacji / prefiksu w dashboardzie.', 'Wdróż backend/MasterDashboard.php na FIS1 i backend/FIS2/MasterDashboard.php na FIS2, pod /custom/matz/php/MasterDashboard.php. Skopiuj zawartość frontend/dist do /custom/matz/MasterSamples/ — ta ścieżka jest ustawiona jako base w Vite.', 'Na każdym FIS skopiuj właściwy moduł Tcl do katalogu $_sysvar(CSTBBDIR) jako mastercheck.tcl. Zarejestruj i załaduj go raz w /fis/mantis/custom/apps/local/lib/BB/loadcstpkgs zgodnie z rozdziałem ładowania bibliotek. Uruchom ponownie procesy stacji, aby załadowały nowy moduł.', 'Sprawdź handler EI BREQ/BCMP, dostęp do bazy i grupę fis dla katalogu blokad. Dodaj pilotażową regułę i przetestuj GOLDEN GOOD/BAD, zwykły SN, oba wyniki, limity, blokadę i audyt.', 'Otwórz adres hosta FIS z /custom/matz/MasterSamples/. Po zalogowaniu znajdziesz Dokumentację w menu. Dla innej ścieżki hostowania zmień base w frontend/vite.config.ts i zbuduj ponownie.'], ['In a MySQL client, run backend/migrations/001_initial_schema.sql (new database and core tables), then 002_station_blocking_rules.sql (rules), then 003_verify_installation.sql (checks) on each distinct database. Do not recreate a database shared by FIS1 and FIS2.', 'This set is for a fresh installation and imports no old exclusions. An empty rules table disables _MASTER blocking. Configure real station / prefix rules through the dashboard after startup.', 'Deploy backend/MasterDashboard.php to FIS1 and backend/FIS2/MasterDashboard.php to FIS2 at /custom/matz/php/MasterDashboard.php. Copy frontend/dist contents to /custom/matz/MasterSamples/ — this is the Vite base path.', 'On each FIS, copy the correct Tcl module into $_sysvar(CSTBBDIR) as mastercheck.tcl. Register and load it once through /fis/mantis/custom/apps/local/lib/BB/loadcstpkgs as described in the library-loading chapter. Restart station processes to load the new module.', 'Verify the EI BREQ/BCMP handler, database access and the fis group for the lock directory. Add a pilot rule and test GOLDEN GOOD/BAD, a regular SN, both outcomes, limits, locks and audit.', 'Open the FIS host address with /custom/matz/MasterSamples/. After signing in, find Documentation in the menu. For another hosting path, change base in frontend/vite.config.ts and rebuild.']),
            paragraph('PHP odczytuje konfigurację bazy z /fis/mantis/custom/database/config.ini. Tcl ładuje /fis/mantis/common/config/system/system.cfg i config.cfg z $_sysvarc(FISVW_DB), używając globalnego param. Na hostach innych niż plblofis1 / plblofis2 ustaw jawnie param(masterCheckFis) na FIS1 albo FIS2. Procesy PHP i FIS muszą mieć dostęp do katalogu blokad przez grupę fis.', 'PHP reads database configuration from /fis/mantis/custom/database/config.ini. Tcl loads /fis/mantis/common/config/system/system.cfg and config.cfg from $_sysvarc(FISVW_DB), using global param. On hosts other than plblofis1 / plblofis2, explicitly set param(masterCheckFis) to FIS1 or FIS2. PHP and FIS processes need access to the lock directory through the fis group.'),
            note('Handler EI nie znajduje się w tym repozytorium. Aktualizacja samego dashboardu nie wdraża integracji stacji. Szczegółowe instrukcje utrzymania i testy integracyjne znajdują się w backend/tcl/README.md.', 'The EI handler is outside this repository. Updating only the dashboard does not deploy station integration. Detailed maintenance instructions and integration tests are in backend/tcl/README.md.'),
        ],
    },
    {
        id: 'package-loading', group: 'technical', title: pair('Centralne ładowanie MasterCheck', 'Central MasterCheck loading'),
        description: pair('Jedna rejestracja w loadcstpkgs, biblioteka dostępna dla każdego skryptu.', 'One registration in loadcstpkgs makes the library available to every script.'),
        blocks: [
            paragraph('W tym środowisku /fis/mantis/custom/apps/local/lib/BB/loadcstpkgs ładuje biblioteki dla wszystkich skryptów. mysqltcl jest już dostępny. Dodaj lub sprawdź poniższy wpis centralny; nie dopisuj package require mysqltcl ani MasterCheck do każdego handlera stacji.', 'In this environment, /fis/mantis/custom/apps/local/lib/BB/loadcstpkgs loads libraries for every script. mysqltcl is already available. Add or check the following central entry; do not repeat package require mysqltcl or MasterCheck in every station handler.'),
            code('if { [file exists [file join $_sysvar(CSTBBDIR) mastercheck.tcl]] } {\n    package ifneeded MasterCheck 1.3 [list source [file join $_sysvar(CSTBBDIR) mastercheck.tcl]]\n}\n\n# Central loading / centralne ładowanie\npackage require MasterCheck 1.3'),
            steps(['Sprawdź wersję interpretera Tcl w procesie FIS: info patchlevel.', 'Dla Tcl 8.6+ użyj backend/tcl/MasterCheck.tcl, a dla Tcl 8.5.7+ użyj backend/tcl/MasterCheck85.tcl. Wybrany plik skopiuj jako mastercheck.tcl do $_sysvar(CSTBBDIR); wielkość liter nazwy ma znaczenie na serwerze.', 'Sprawdź wpis w loadcstpkgs i uruchom ponownie proces korzystający z bibliotek. Obecny moduł udostępnia wersję 1.3.0, zgodną z wymaganiem 1.3.', 'W procesie FIS sprawdź package present MasterCheck oraz info commands ::MasterCheck::BREQ. Skrypty stacji wywołują już tylko BREQ i BCMP.'], ['Check the Tcl interpreter version in the FIS process: info patchlevel.', 'For Tcl 8.6+, use backend/tcl/MasterCheck.tcl; for Tcl 8.5.7+, use backend/tcl/MasterCheck85.tcl. Copy the chosen file as mastercheck.tcl into $_sysvar(CSTBBDIR); filename case matters on the server.', 'Check the loadcstpkgs entry and restart the process using the libraries. The current module provides version 1.3.0, compatible with the 1.3 requirement.', 'In the FIS process, check package present MasterCheck and info commands ::MasterCheck::BREQ. Station scripts now only call BREQ and BCMP.']),
            note('Nie ładuj obu wariantów do jednego interpretera. pkgIndex.tcl pozostaje w repozytorium jako alternatywa dla standardowego mechanizmu pakietów i testów; centralny loadcstpkgs wskazuje bezpośrednio mastercheck.tcl.', 'Do not load both variants into one interpreter. pkgIndex.tcl remains in the repository as an alternative for standard package discovery and tests; central loadcstpkgs points directly to mastercheck.tcl.'),
        ],
    },
    {
        id: 'troubleshooting', group: 'guide', title: pair('Rozwiązywanie problemów', 'Troubleshooting'),
        description: pair('Objawy, możliwe przyczyny i następny krok.', 'Symptoms, possible causes and the next step.'),
        blocks: [
            table(pair(['Objaw', 'Co sprawdzić'], ['Symptom', 'What to check']), pair([
                ['Jeden FIS jest niedostępny', 'Sprawdź oznaczenie FIS w błędzie i łączność z tym serwerem. Dane drugiego FIS mogą nadal być wyświetlane. Nie traktuj niepełnej listy jako braku blokad.'],
                ['Brak dostępu do zapisu', 'Sprawdź sesję i grupy konta. Gość ma tylko odczyt; zgłoś potrzebny dostęp administratorowi.'],
                ['Master nie jest dopuszczony', 'Sprawdź isactive, proces, GOOD/BAD i oba limity. Aktywacja nie zeruje liczników.'],
                ['BAD zakończył się FAIL', 'To zgodny wynik dla wzorca BAD. Sprawdź currentCounter, zamiast uznawać sam FAIL za błąd wzorca.'],
                ['Usunięta reguła, blokada nadal widoczna', 'Plik pozostaje. Sprawdź pozostałe reguły i FIS. Plik usuwa się osobno w „Zablokowane maszyny”.'],
                ['Blokada zdjęta, audyt wymaga sprawdzenia', 'Nie zakładaj, że operacja nie zaszła. Sprawdź plik i historię oraz log backendu; potwierdzenie COMMIT mogło się nie udać po usunięciu pliku.'],
                ['Błąd po zmianie FIS mastera', 'Sprawdź obecność jednostki na obu serwerach. Usunięcie starej jednostki i utworzenie nowej nie tworzą wspólnej transakcji między FIS.'],
            ], [
                ['One FIS is unavailable', 'Check the FIS named in the error and connectivity to that server. The other FIS may still provide data. An incomplete list does not prove there are no locks.'],
                ['Write access denied', 'Check the session and account groups. Guests have read access only; request the required access from an administrator.'],
                ['Master is rejected', 'Check isactive, process, GOOD/BAD and both limits. Activation does not reset counters.'],
                ['BAD returned FAIL', 'This is a matched result for a BAD reference. Check currentCounter rather than treating FAIL alone as a reference error.'],
                ['Rule deleted but lock still visible', 'The file remains. Check other rules and the FIS. Remove the file separately in “Blocked machines”.'],
                ['Lock removed but audit needs checking', 'Do not assume the operation did not happen. Check the file, history and backend log; COMMIT confirmation may have failed after file deletion.'],
                ['Error after changing a master’s FIS', 'Check the unit on both servers. Deleting the old unit and creating the new one do not share a cross-FIS transaction.'],
            ])),
            note('Przy zgłoszeniu problemu podaj SN lub nazwę stacji, FIS, proces, czas, operację i dokładny komunikat. Nie dołączaj haseł ani danych sesji.', 'When reporting an issue, include the SN or station name, FIS, process, time, operation and exact message. Do not include passwords or session data.'),
        ],
    },
    {
        id: 'glossary', group: 'guide', title: pair('Słownik pojęć', 'Glossary'),
        description: pair('Najważniejsze nazwy używane w aplikacji i integracji.', 'Key terms used in the application and integration.'),
        blocks: [table(pair(['Pojęcie', 'Znaczenie'], ['Term', 'Meaning']), pair([
            ['SN / unit', 'Numer seryjny identyfikujący jednostkę.'],
            ['Master / Golden Sample', 'Jednostka wzorcowa do sprawdzania procesu. GOLDEN jest rozpoznawane podczas kontroli FIS.'],
            ['Proces', 'Etap lub tag procesu, dla którego master jest dopuszczony.'],
            ['FIS', 'System produkcyjny obsługujący jednostki i stacje; aplikacja rozróżnia FIS1 i FIS2.'],
            ['Prefix', 'Literalny początek nazwy stacji, np. APR. Dopasowanie obejmuje też przyszłe stacje.'],
            ['BREQ / BCMP', 'Kontrola przed testem / walidacja i naliczenie wyniku po teście.'],
            ['Audyt', 'Historia operacji z czasem i operatorem; FIS może być nieznany dla starszych wpisów.'],
            ['COMMIT', 'Potwierdzenie transakcji bazy. System plików i MySQL nie mają wspólnej transakcji.'],
        ], [
            ['SN / unit', 'The serial number identifying a unit.'],
            ['Master / Golden Sample', 'A reference unit used to check a process. GOLDEN is identified during FIS validation.'],
            ['Process', 'A process step or tag for which the master is permitted.'],
            ['FIS', 'The production system serving units and stations; the application distinguishes FIS1 and FIS2.'],
            ['Prefix', 'A literal station-name prefix, such as APR. Matching includes future stations.'],
            ['BREQ / BCMP', 'Pre-test validation / post-test validation and result counting.'],
            ['Audit', 'Operation history with time and operator; FIS may be unknown for older entries.'],
            ['COMMIT', 'Database transaction confirmation. The filesystem and MySQL do not share a transaction.'],
        ]))],
    },
];

export function getDocumentation(language: DocLanguage): DocSection[] {
    return source.map(section => ({
        id: section.id, group: section.group, title: section.title[language], description: section.description[language],
        blocks: section.blocks.map(block => block[language]),
        link: section.link ? { ...section.link, label: section.link.label[language] } : undefined,
    }));
}

export function normalizeDocumentationSearch(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase().trim();
}

export function searchDocumentation(sections: DocSection[], query: string): DocSection[] {
    const words = normalizeDocumentationSearch(query).split(/\s+/).filter(Boolean);
    return sections.filter(section => {
        const text = normalizeDocumentationSearch([section.title, section.description, ...section.blocks.flatMap(block => {
            if (block.kind === 'steps' || block.kind === 'flow') return block.items;
            if (block.kind === 'table') return [...block.headers, ...block.rows.flat()];
            return block.text;
        })].join(' '));
        return words.every(word => text.includes(word));
    });
}
