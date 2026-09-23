# Master Samples Dashboard (React 19 + TypeScript + PHP)

Nowoczesny system monitoringu i zarządzania jednostkami wzorcowymi (Golden Samples / Master Samples) w środowisku produkcyjnym, stworzony na podstawie architektury i systemu projektowego aplikacji **Paletki**.

---

## 🚀 Architektura i Moduły

Aplikacja składa się z dwóch niezależnych części:
1. **Frontend (`frontend/`)**:
   - **React 19 + TypeScript + Vite + Tailwind CSS v4**
   - **@tanstack/react-query**: inteligentne pobieranie, cache i mutacje w czasie rzeczywistym
   - **lucide-react**: zestaw ikon przemysłowych
   - **React Router (HashRouter)**: pełna kompatybilność z serwerami Apache bez potrzeby konfiguracji `mod_rewrite`
   - Spójny design system z aplikacją **Paletki**: industrial dark mode (`#090d16`, `#111827`, `#1f2937`, `#6366f1`), fonty Plus Jakarta Sans / JetBrains Mono.

2. **Backend (`backend/MasterDashboard.php`)**:
   - Pojedynczy, zoptymalizowany plik PHP obsługujący żądania przez parametr `?job=...`
   - Integracja z biblioteką FIS: `/custom/matz/phpBB/BuildingBlocks.php` (`Unit`, `Archive`, `Lib`)
   - Połączenie MySQL z bazą `masterSample` przez `/fis/mantis/custom/database/config.ini`
   - Zarządzanie plikami blokad w `/fis/mantis/data/blocked_machines/`
   - Integracja z uwierzytelnianiem `/custom/auth/GetUserName.php`

---

## 🖥️ Dostępne Widoki Aplikacji

1. **Dashboard Masterów (`/`)**:
   - Karty KPI: Aktywne, Status GOOD/BAD, Blisko limitu (>80%), Wykryte błędy, Zablokowane (Dead).
   - Tabela jednostek z wizualnymi paskami postępu liczników zużycia i błędów.
   - Akcje na każdym rekordzie:
     - **Reset Liczników** (zerowanie ze wpisem do `history`, blokada dla jednostek dead `isActive = 2`).
     - **Zablokuj / Aktywuj Mastera** (zmiana `isActive = 2` lub `1` z audytem).
     - **Historia Mastera** (modal z pełnym dziennikiem zdarzeń dla danego numeru SN).
     - **Usuń z bazy** (fizyczne usunięcie `DELETE FROM masterUnits` z uprzednim wpisem audytu w `history`).
2. **Dodaj Mastera (`/create`)**:
   - Tryby: **Single Process** (pojedynczy proces) oraz **Multiple Processes** (wiele procesów jednocześnie).
   - Tagi procesów pobierane z `/custom/matz/phpBB/router.php?job=GetProcessTags`.
   - Procedura FIS przed zapisem: `Unit::Find` $\rightarrow$ `Archive::GetAll` $\rightarrow$ `Archive::Unarchive` $\rightarrow$ `Unit::Delete` $\rightarrow$ `Unit::DataEntry`.
   - W przypadku istniejącego SN: automatyczne okno porównania starych i nowych parametrów z prośbą o zatwierdzenie aktualizacji.
3. **Zablokowane Maszyny (`/blocked-machines`)**:
   - Skanowanie katalogu `/fis/mantis/data/blocked_machines/`.
   - Podział na maszynę i prefiks (`<machine>_<prefix>`), data zablokowania.
   - Przycisk bezpiecznego odblokowania (usunięcie pliku za pomocą `unlink`).
4. **Grupy Mailowe Inżynierów (`/admin/processes`)**:
   - Tabela `masterSample.engineers` (`id`, `process`, `mail`).
   - Edycja istniejących maili (z autouzupełnianiem znanych grup) oraz dodawanie nowych procesów.
5. **Historia i Audyt (`/history`)**:
   - Kompletny dziennik zdarzeń tabeli `masterSample.history`.
   - Filtrowanie po numerze SN, rodzaju operacji (`Create`, `Update`, `Reset`, `Block`, `Delete`), użytkowniku i dacie.

---

## 🛠️ Uruchomienie Lokalne (Development)

Aplikację można uruchomić lokalnie przez Vite:

```bash
cd frontend
npm install
npm run dev
```

Aplikacja uruchomi się pod adresem `http://localhost:3000`.
Bez serwera Apache i endpointów FIS widoki wymagające danych pokażą błąd pobierania; projekt nie zawiera wbudowanego mocka API.

---

## 📦 Budowanie i Wdrożenie na Serwer Produkcyjny

### 1. Budowanie Frontendu
W katalogu `frontend/` wykonaj:
```bash
npm run build
```
Wynik kompilacji znajdzie się w katalogu `frontend/dist/`:
- `dist/index.html`
- `dist/assets/*.js`
- `dist/assets/*.css`

### 2. Kopiowanie na Serwer
1. **Backend PHP**:
   Skopiuj plik `backend/MasterDashboard.php` do docelowego katalogu:
   `/custom/matz/php/MasterDashboard.php`

2. **Frontend**:
   Zawartość katalogu `frontend/dist/` (plik `index.html` oraz folder `assets/`) skopiuj do katalogu docelowego, np.:
   `/custom/matz/` lub `/cst_auth/masterSamples/`

> `CreateMaster` może być wysyłany do FIS 1 albo FIS 2. Ten sam aktualny plik
> `backend/MasterDashboard.php` musi być wdrożony na obu hostach pod ścieżką
> `/custom/matz/php/MasterDashboard.php`. Pozostałe operacje nadal korzystają
> z backendu hosta, na którym otwarto dashboard.
>
> Gotowa kopia dla drugiego serwera znajduje się w
> `backend/FIS2/MasterDashboard.php`. Na hoście FIS 2 należy wgrać ją jako
> `/custom/matz/php/MasterDashboard.php`; jej bezpieczna wartość domyślna to `FIS2`.
> Operacja `DeleteMaster` jest również kierowana na host wskazany w kolumnie
> `FIS` i przed usunięciem rekordu z bazy wywołuje `Unit::Delete()` z biblioteki
> `/custom/matz/phpBB/BuildingBlocks.php`.

---

## 🗄️ Schemat Bazy Danych (`masterSample`)

### 1. Tabela `masterUnits`
```sql
CREATE TABLE `masterUnits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `unit` varchar(100) NOT NULL,
  `process` varchar(100) NOT NULL,
  `status` varchar(100) NOT NULL,
  `currentCounter` int(11) DEFAULT 0,
  `maxCounter` int(11) DEFAULT NULL,
  `errorCounter` int(11) DEFAULT 0,
  `errorMaxCounter` int(11) DEFAULT NULL,
  `globalCounter` int(11) DEFAULT 0,
  `user` varchar(100) DEFAULT NULL,
  `isactive` int(11) DEFAULT 1,
  `FIS` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unit` (`unit`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 2. Tabela `history`
```sql
CREATE TABLE `history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `unit` varchar(100) NOT NULL,
  `process` varchar(100) DEFAULT NULL,
  `status` varchar(100) DEFAULT NULL,
  `currentCounter` int(11) DEFAULT NULL,
  `maxCounter` int(11) DEFAULT NULL,
  `errorCounter` int(11) DEFAULT NULL,
  `errorMaxCounter` int(11) DEFAULT NULL,
  `globalCounter` int(11) DEFAULT NULL,
  `user` varchar(100) DEFAULT NULL,
  `operation` varchar(50) DEFAULT NULL,
  `date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3. Tabela `engineers`
```sql
CREATE TABLE `engineers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `process` varchar(100) NOT NULL,
  `mail` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `process` (`process`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
