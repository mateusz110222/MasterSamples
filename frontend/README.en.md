# Master Samples — frontend

[Polski](README.md) | [English](README.en.md)

React / TypeScript / Vite, with a PL/EN interface and read-only guest access.

## Documentation before startup

Double-click `../docs/MasterSamples.html`. It is a standalone file and needs no
package installation, server, login or internet connection. It covers fresh
installation, MySQL configuration and central Tcl loading. The same content is
available in the running application’s **Documentation** tab.

## Local preview

Use Node.js 22.18+ in the 22 series, or Node.js 24+, and npm.
The generator and tests use Node’s built-in support for TypeScript files.

Run from this directory:

```sh
npm install
npm run dev
```

Open `http://localhost:3000/custom/matz/MasterSamples/` and choose guest access.
Keep the terminal running. Data views require FIS servers; the documentation
view does not fetch production data.

## Build and checks

```sh
npm run build
npm test
npm run lint
```

The application output is `dist/`. Upload its contents to
`/custom/matz/MasterSamples/` on the server. `dist/index.html` requires a server
and is not offline documentation. For another hosting directory, change `base`
in `vite.config.ts` before building.

## Maintaining both documentation versions

Shared PL/EN content: `src/documentation/content.ts`.
After changing instructions, run `npm run docs:build` or `npm run build`.
The `scripts/build-documentation.mjs` generator creates one HTML file with
embedded styles and script, without external resources. `npm run docs:check`
checks whether the generated HTML matches the current content. Keep chapter
identifiers stable so saved URLs remain valid.

Fresh installation SQL and file order:
[../backend/migrations/README.en.md](../backend/migrations/README.en.md).

## Production bundles

All operational views, including station blocking, are included in the main
JavaScript bundle. Only documentation is loaded separately with `React.lazy`.
Tailwind scans `src/` and `index.html`, excluding the documentation generator
and test files. Put new interface components in `src/`.

Vite’s 500 kB warning refers to minified JavaScript size before compression.
The gzip size in the build output reflects transfer size only when the server
serves assets with HTTP compression.
