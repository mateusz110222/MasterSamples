import React, { useState, ReactNode } from 'react';
import { LanguageContext } from './language-context';

export type Language = 'PL' | 'EN';

const translations = {
    PL: {
        // App title / branding
        brandSubtitle: 'BorgWarner FIS QA',

        // Navigation
        navDashboard: 'BAZA I AUDYT (DASHBOARD)',
        navCreate: 'DODAJ NOWEGO MASTERA',
        navBlocked: 'ZABLOKOWANE MASZYNY',
        navEngineers: 'GRUPY MAILOWE (ADMIN)',
        navHistory: 'HISTORIA I AUDYT',

        // Header titles
        headerDashboardTitle: 'Panel Zarządzania (Baza i Audyt)',
        headerDashboardSub: 'Ewidencja, historia zmian, liczniki cykli i blokowanie masterów.',
        headerCreateTitle: 'Dodaj Nowego Mastera',
        headerCreateSub: 'Rejestracja nowej jednostki wzorcowej w systemie FIS i bazie masterUnits.',
        headerBlockedTitle: 'Zablokowane Maszyny i Prefiksy',
        headerBlockedSub: 'Katalog aktywnych blokad procesowych na liniach produkcyjnych (/fis/mantis/data/blocked_machines/).',
        headerEngineersTitle: 'Grupy Mailowe i Książka Adresowa',
        headerEngineersSub: 'Konfiguracja dystrybucji powiadomień mailowych dla procesów oraz zarządzanie adresami e-mail.',
        headerHistoryTitle: 'Historia Operacji i Audyt',
        headerHistorySub: 'Dziennik audytu zmian i operacji przeprowadzonych na masterach produkcyjnych.',

        // Dashboard Stats & Actions
        statAvailable: 'DOSTĘPNE MASTERY',
        statActive: 'AKTYWNE',
        statServiceBlocked: 'SERWIS / ZABLOKOWANE',
        statRequiresAttention: 'Wymaga uwagi / odblokowania',
        statNoBlocked: 'Brak zablokowanych masterów',
        btnAddMaster: 'DODAJ NOWEGO MASTERA',
        btnExportCsv: 'EKSPORTUJ HISTORIĘ / CSV',
        searchPlaceholder: 'Szukaj ID mastera, procesu, pracownika...',

        // Filters
        filterProcess: 'FILTRUJ WG PROCESU',
        allProcesses: 'Wszystkie Procesy',
        filterStatus: 'FILTRUJ WG STATUSU',
        allStatuses: 'Wszystkie Statusy',
        filterActivity: 'FILTRUJ WG AKTYWNOŚCI',
        allActivities: 'Wszystkie',
        onlyActive: 'Tylko Aktywne',
        blockedDead: 'Zablokowane / Dead',
        rowsPerPage: 'WIERSZE NA STRONĘ',
        clearFilters: 'Wyczyść Filtry',
        displayedCount: 'Wyświetlono',
        ofTotal: 'z',
        registeredMasters: 'zarejestrowanych masterów',
        sectionRegistryTitle: 'Ewidencja i Obieg Masterów',
        btnRefreshMasters: 'Odśwież Mastery',

        // Batch selection
        selectedCount: 'Zaznaczone:',
        btnResetCyclesOnly: 'Resetuj Tylko Cykle (0)',
        btnResetErrorsOnly: 'Resetuj Tylko Błędy (0)',
        btnResetAll: 'Resetuj Wszystko (Cykle + Błędy)',
        btnBlockSelected: 'Zablokuj zaznaczone',
        btnClearSelection: 'Wyczyść zaznaczenie',

        // Table headers
        thMasterId: 'Master ID',
        thProcess: 'Proces',
        thFis: 'Parametry (FIS)',
        thCycles: 'Zużycie (Cykle)',
        thErrors: 'Licznik Błędów',
        thGlobal: 'Globalny',
        thStatus: 'Status',
        thOperator: 'Utworzył / Operator',
        thState: 'Stan',
        thActions: 'Akcje',

        // Row states
        stateActive: 'AKTYWNA',
        stateBlocked: 'ZABLOKOWANY',
        loadingMasters: 'Ładowanie masterów produkcyjnych...',
        noMastersFound: 'Brak rekordów spełniających wybrane kryteria wyszukiwania.',

        // General buttons & actions
        cancel: 'Anuluj',
        confirm: 'Potwierdź',
        saveChanges: 'Zapisz Zmiany',
        close: 'Zamknij',
        edit: 'Edytuj',
        delete: 'Usuń',
        saving: 'Zapisywanie...',
        deleting: 'Usuwanie...',
        resetting: 'Resetowanie...',

        // Reset modal
        resetModalTitle: 'Reset Liczników Mastera',
        resetModalDesc: 'Wybierz zakres zerowania liczników dla:',
        resetOptBoth: 'Resetuj Oba Liczniki (Zalecane)',
        resetOptBothSub: 'Wyzeruje zarówno cykle użyć (currentCounter), jak i licznik błędów (errorCounter).',
        resetOptCycles: 'Resetuj Tylko Cykle Użyć',
        resetOptCyclesSub: 'Wyzeruje wyłącznie licznik użyć (currentCounter → 0). Licznik błędów bez zmian.',
        resetOptErrors: 'Resetuj Tylko Licznik Błędów',
        resetOptErrorsSub: 'Wyzeruje wyłącznie zarejestrowane błędy (errorCounter → 0). Cykle użyć bez zmian.',
        confirmReset: 'Zatwierdź Reset',

        // Block modal
        blockModalTitle: 'Zablokuj Mastera (Dead)',
        activateModalTitle: 'Aktywuj Mastera',
        blockModalWarn: 'Zablokowanie mastera (isActive = 2) uniemożliwi resetowanie jego liczników i zablokuje dopuszczenie do procesów produkcyjnych.',
        activateModalWarn: 'Czy na pewno chcesz przywrócić mastera do stanu aktywnego (isActive = 1)?',

        // Delete modal
        deleteModalTitle: 'Usuń Mastera z Bazy Danych',
        deleteModalWarning: 'Ostrzeżenie!',
        deleteModalText: 'zostanie usunięty z tabeli masterUnits. Zdarzenie zostanie zapisane w historii.',
        confirmDelete: 'Trwale Usuń',

        // History modal
        historyModalTitle: 'Historia Zdarzeń:',
        historyModalSub: 'Pełny dziennik operacji zarejestrowany dla tej konkretnej sztuki wzorcowej',
        historyNoRecords: 'Brak wpisów w historii dla jednostki',
        thDate: 'Data',
        thOperation: 'Operacja',

        // Create Master View
        backToDashboard: 'Powrót do Dashboardu',
        singleProcessMode: 'Pojedynczy Proces',
        multiProcessMode: 'Wiele Procesów',
        createTitle: 'Dodaj Master Sample',
        createSingleSub: 'Tryb pojedynczego procesu — przypisz jednostkę wzorcową do jednego etapu.',
        createMultiSub: 'Tryb wielu procesów — powiąż jedną jednostkę z wieloma liniami/stacjami.',
        serialNumberLabel: 'Numer Seryjny (Unit / SN)',
        serialNumberPlaceholder: 'Zeskanuj lub wpisz numer SN...',
        processLabel: 'Proces Produkcyjny',
        selectProcessPlaceholder: '-- Wybierz lub wpisz Proces --',
        multiProcessLabel: 'Wybierz Procesy (Jednocześnie)',
        loadingProcesses: 'Ładowanie procesów...',
        statusLabel: 'Status Mastera',
        goodStatusLabel: 'GOOD',
        badStatusLabel: 'BAD',
        maxCounterLabel: 'Limit Użyć (Max Use)',
        maxCounterHint: 'Domyślnie: 1000 (zakres: 50–5000)',
        maxErrorsLabel: 'Limit Błędów (Max Errors)',
        maxErrorsHint: 'Domyślnie: 50 (zakres: 5–1000)',
        btnRegisterMaster: 'Zarejestruj Master Sample',
        btnRegistering: 'Tworzenie i rejestracja w FIS...',
        searchProcessesPlaceholder: 'Filtruj procesy... (wpisz np. SMT, AOI, AUDI)',
        selectAllFiltered: 'Zaznacz widoczne',
        clearAllSelected: 'Wyczyść zaznaczone',
        visibleProcessesCount: 'Widoczne procesy:',

        // Engineers / Mails
        tabProcessEngineers: 'Przypisania Procesów (engineers)',
        tabMailsDirectory: 'Książka Adresowa E-mail (mails)',
        engineersBannerTitle: 'Konfiguracja Powiadomień i Adresów E-mail',
        engineersBannerSub: 'Zarządzanie powiązaniami procesów produkcyjnych z grupami dystrybucyjnymi inżynierów oraz katalogiem adresowym.',
        btnAddProcessMail: 'Dodaj Proces / Mail',
        btnAddStandaloneMail: 'Dodaj Nowy E-mail',
        searchProcessMailPlaceholder: 'Szukaj po nazwie, procesie lub adresie e-mail...',
        thEmailGroup: 'Przypisana Grupa Mailowa (Inżynierowie)',
        thContactName: 'Nazwa Kontaktu / Grupy',
        thEmailAddress: 'Adres E-mail',
        noMailAssigned: 'Nie przypisano adresu mailowego',
        editMailGroupTitle: 'Edycja Grupy Mailowej:',
        addProcessConfigTitle: 'Dodaj Proces do Konfiguracji',
        addStandaloneMailTitle: 'Dodaj Nowy Adres do Książki Mailowej',
        editStandaloneMailTitle: 'Edytuj Adres Mailowy',
        contactNameLabel: 'Nazwa Grupy / Inżyniera (Opcjonalnie)',
        contactNamePlaceholder: 'np. SMT Linia 1 lub Jan Kowalski',
        emailAddressLabel: 'Adres E-mail',
        emailAddressPlaceholder: 'np. PLBLO_SMT_ENG@borgwarner.com',
        deleteMailTitle: 'Usuń Adres Mailowy',
        deleteMailConfirm: 'Czy na pewno chcesz usunąć ten adres e-mail z książki adresowej?',
    },
    EN: {
        // App title / branding
        brandSubtitle: 'BorgWarner FIS QA',

        // Navigation
        navDashboard: 'DATABASE & AUDIT (DASHBOARD)',
        navCreate: 'ADD NEW MASTER',
        navBlocked: 'BLOCKED MACHINES',
        navEngineers: 'EMAIL GROUPS (ADMIN)',
        navHistory: 'AUDIT HISTORY',

        // Header titles
        headerDashboardTitle: 'Management Dashboard (Database & Audit)',
        headerDashboardSub: 'Registry, change history, cycle counters and master blocking.',
        headerCreateTitle: 'Add New Master Sample',
        headerCreateSub: 'Register a new golden sample in the FIS system and masterUnits database.',
        headerBlockedTitle: 'Blocked Machines & Prefixes',
        headerBlockedSub: 'Directory of active process blocks on production lines (/fis/mantis/data/blocked_machines/).',
        headerEngineersTitle: 'Email Groups & Contact Directory',
        headerEngineersSub: 'Configure notification routing for production processes and manage email contacts.',
        headerHistoryTitle: 'Operation History & Audit Log',
        headerHistorySub: 'Audit log of actions and changes performed on production golden samples.',

        // Dashboard Stats & Actions
        statAvailable: 'AVAILABLE MASTERS',
        statActive: 'ACTIVE',
        statServiceBlocked: 'SERVICE / BLOCKED',
        statRequiresAttention: 'Requires attention / unblocking',
        statNoBlocked: 'No blocked masters',
        btnAddMaster: 'ADD NEW MASTER',
        btnExportCsv: 'EXPORT HISTORY / CSV',
        searchPlaceholder: 'Search master ID, process, operator...',

        // Filters
        filterProcess: 'FILTER BY PROCESS',
        allProcesses: 'All Processes',
        filterStatus: 'FILTER BY STATUS',
        allStatuses: 'All Statuses',
        filterActivity: 'FILTER BY ACTIVITY',
        allActivities: 'All',
        onlyActive: 'Only Active',
        blockedDead: 'Blocked / Dead',
        rowsPerPage: 'ROWS PER PAGE',
        clearFilters: 'Clear Filters',
        displayedCount: 'Showing',
        ofTotal: 'of',
        registeredMasters: 'registered masters',
        sectionRegistryTitle: 'Master Units Registry & Circulation',
        btnRefreshMasters: 'Refresh Masters',

        // Batch selection
        selectedCount: 'Selected:',
        btnResetCyclesOnly: 'Reset Cycles Only (0)',
        btnResetErrorsOnly: 'Reset Errors Only (0)',
        btnResetAll: 'Reset All (Cycles + Errors)',
        btnBlockSelected: 'Block Selected',
        btnClearSelection: 'Clear Selection',

        // Table headers
        thMasterId: 'Master ID',
        thProcess: 'Process',
        thFis: 'Parameters (FIS)',
        thCycles: 'Cycle Usage',
        thErrors: 'Error Counter',
        thGlobal: 'Global',
        thStatus: 'Status',
        thOperator: 'Created by / Operator',
        thState: 'State',
        thActions: 'Actions',

        // Row states
        stateActive: 'ACTIVE',
        stateBlocked: 'BLOCKED',
        loadingMasters: 'Loading production golden samples...',
        noMastersFound: 'No records found matching current search criteria.',

        // General buttons & actions
        cancel: 'Cancel',
        confirm: 'Confirm',
        saveChanges: 'Save Changes',
        close: 'Close',
        edit: 'Edit',
        delete: 'Delete',
        saving: 'Saving...',
        deleting: 'Deleting...',
        resetting: 'Resetting...',

        // Reset modal
        resetModalTitle: 'Reset Master Counters',
        resetModalDesc: 'Select counter reset scope for:',
        resetOptBoth: 'Reset Both Counters (Recommended)',
        resetOptBothSub: 'Resets both usage cycles (currentCounter) and error counter (errorCounter).',
        resetOptCycles: 'Reset Usage Cycles Only',
        resetOptCyclesSub: 'Resets usage counter only (currentCounter → 0). Error counter remains unchanged.',
        resetOptErrors: 'Reset Error Counter Only',
        resetOptErrorsSub: 'Resets error counter only (errorCounter → 0). Usage cycles remain unchanged.',
        confirmReset: 'Confirm Reset',

        // Block modal
        blockModalTitle: 'Block Master Sample (Dead)',
        activateModalTitle: 'Activate Master Sample',
        blockModalWarn: 'Blocking the master (isActive = 2) prevents counter resets and denies process admission.',
        activateModalWarn: 'Are you sure you want to reactivate this master sample (isActive = 1)?',

        // Delete modal
        deleteModalTitle: 'Delete Master from Database',
        deleteModalWarning: 'Warning!',
        deleteModalText: 'will be deleted from masterUnits table. An audit record will be logged in history.',
        confirmDelete: 'Permanently Delete',

        // History modal
        historyModalTitle: 'Event History:',
        historyModalSub: 'Complete audit log recorded for this specific golden sample',
        historyNoRecords: 'No history records found for unit',
        thDate: 'Date',
        thOperation: 'Operation',

        // Create Master View
        backToDashboard: 'Back to Dashboard',
        singleProcessMode: 'Single Process',
        multiProcessMode: 'Multiple Processes',
        createTitle: 'Add Master Sample',
        createSingleSub: 'Single process mode — bind golden sample to a single station/line.',
        createMultiSub: 'Multiple processes mode — bind one unit across several production lines/stations.',
        serialNumberLabel: 'Serial Number (Unit / SN)',
        serialNumberPlaceholder: 'Scan or type serial number...',
        processLabel: 'Production Process',
        selectProcessPlaceholder: '-- Select or type process --',
        multiProcessLabel: 'Select Processes (Simultaneously)',
        loadingProcesses: 'Loading processes...',
        statusLabel: 'Master Status',
        goodStatusLabel: 'GOOD',
        badStatusLabel: 'BAD',
        maxCounterLabel: 'Max Cycles (Max Use)',
        maxCounterHint: 'Default: 1000 (range: 50–5000)',
        maxErrorsLabel: 'Max Errors Limit',
        maxErrorsHint: 'Default: 50 (range: 5–1000)',
        btnRegisterMaster: 'Register Master Sample',
        btnRegistering: 'Registering in FIS...',
        searchProcessesPlaceholder: 'Filter processes... (type e.g. SMT, AOI, AUDI)',
        selectAllFiltered: 'Select visible',
        clearAllSelected: 'Clear selected',
        visibleProcessesCount: 'Visible processes:',

        // Engineers / Mails
        tabProcessEngineers: 'Process Assignments (engineers)',
        tabMailsDirectory: 'Email Directory (mails)',
        engineersBannerTitle: 'Email Alerts & Contact Directory',
        engineersBannerSub: 'Manage email routing for production line errors and maintain standalone distribution contacts.',
        btnAddProcessMail: 'Add Process / Email',
        btnAddStandaloneMail: 'Add New Email',
        searchProcessMailPlaceholder: 'Search by name, process or email address...',
        thEmailGroup: 'Assigned Email Group (Engineers)',
        thContactName: 'Contact / Group Name',
        thEmailAddress: 'Email Address',
        noMailAssigned: 'No email address assigned',
        editMailGroupTitle: 'Edit Email Group:',
        addProcessConfigTitle: 'Add Process Configuration',
        addStandaloneMailTitle: 'Add New Contact to Directory',
        editStandaloneMailTitle: 'Edit Email Contact',
        contactNameLabel: 'Contact / Group Name (Optional)',
        contactNamePlaceholder: 'e.g. SMT Line 1 or John Doe',
        emailAddressLabel: 'Email Address',
        emailAddressPlaceholder: 'e.g. PLBLO_SMT_ENG@borgwarner.com',
        deleteMailTitle: 'Delete Email Contact',
        deleteMailConfirm: 'Are you sure you want to remove this email contact from the directory?',
    }
};

export type TranslationsType = typeof translations.PL;

export interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: TranslationsType;
}

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguageState] = useState<Language>(() => {
        const saved = localStorage.getItem('master_samples_lang');
        return (saved === 'EN' || saved === 'PL') ? saved : 'PL';
    });

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('master_samples_lang', lang);
    };

    const t = translations[language];

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};
