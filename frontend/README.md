# Master Samples — frontend

[Polski](README.md) | [English](README.en.md)

React / TypeScript / Vite, z interfejsem PL/EN i dostępem gościa do odczytu.

## Dokumentacja przed uruchomieniem

Otwórz dwuklikiem `../docs/MasterSamples.html`. To samodzielny plik:
nie wymaga instalacji paczek, serwera, logowania ani internetu.
Zawiera instrukcję nowej instalacji, konfigurację MySQL i centralne ładowanie Tcl.
Ta sama treść jest w zakładce **Dokumentacja** działającej aplikacji.

## Podgląd lokalny

Użyj Node.js 22.18+ z gałęzi 22 albo Node.js 24+ oraz npm.
Generator i testy korzystają z wbudowanej obsługi plików TypeScript.

W tym katalogu uruchom:

```sh
npm install
npm run dev
```

Otwórz `http://localhost:3000/custom/matz/MasterSamples/` i wybierz gościa.
Terminal musi pozostać uruchomiony. Widoki danych wymagają serwerów FIS;
sam widok dokumentacji nie pobiera danych produkcyjnych.

## Budowa i sprawdzenie

```sh
npm run build
npm test
npm run lint
```

Wynik aplikacji to `dist/`. Jego zawartość wgraj na serwer do
`/custom/matz/MasterSamples/`. `dist/index.html` wymaga serwera i nie jest
dokumentacją offline. Przy innym katalogu hostowania zmień `base` w
`vite.config.ts` przed budową.

## Utrzymanie dwóch wersji dokumentacji

Treść PL/EN jest wspólna: `src/documentation/content.ts`.
Po zmianie instrukcji wykonaj `npm run docs:build` lub `npm run build`.
Generator `scripts/build-documentation.mjs` tworzy pojedynczy HTML z osadzonymi
stylami i skryptem, bez zewnętrznych zasobów. `npm run docs:check` sprawdza,
czy gotowy HTML odpowiada bieżącej treści. Identyfikatory rozdziałów zachowuj
stabilne, aby działały zapisane adresy.

SQL nowej instalacji i kolejność plików: `../backend/migrations/README.md`.

## Paczki produkcyjne

Wszystkie widoki operacyjne, w tym blokowanie stacji, trafiają do głównej paczki
JavaScript. Tylko dokumentacja jest ładowana osobno przez `React.lazy`.
Tailwind skanuje `src/` oraz `index.html`, pomijając generator dokumentacji
i pliki testów. Nowe komponenty interfejsu umieszczaj w `src/`.

Ostrzeżenie Vite o 500 kB odnosi się do rozmiaru zminifikowanego JavaScript
przed kompresją. Rozmiar gzip w wyniku budowy jest miarodajny dla transferu
tylko wtedy, gdy serwer udostępnia zasoby z kompresją HTTP.
