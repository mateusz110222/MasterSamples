# Master Samples

[Polski](README.md) | [English](README.en.md)

A system for tracking reference units (Golden / Master Samples), monitoring
counters and managing production station locks on FIS1/FIS2.

## Start with the HTML guide

Double-click [docs/MasterSamples.html](docs/MasterSamples.html).
The PL/EN documentation works without running the application, a server, Node
or an internet connection. You can send just the HTML file to the deployment owner.

After installation, the same content is available in the **Documentation** tab
(`#/documentation`). Both versions cover the application views, counters, locks,
APIs, fresh MySQL installation and station integration through `loadcstpkgs`.

## Project structure

| Location | Contents |
| --- | --- |
| `frontend/` | React, TypeScript, Vite, Tailwind; PL/EN views, tests and the HTML generator |
| `backend/MasterDashboard.php` | PHP endpoint for FIS1 |
| `backend/FIS2/` | PHP endpoint intended for FIS2 |
| `backend/migrations/` | Fresh installation SQL and schema checks |
| `backend/tcl/` | MasterCheck, Tcl variants and tests |
| `docs/` | Ready-to-use standalone HTML documentation |

## Fresh MySQL installation

Run once on each distinct database, in this order:

1. `backend/migrations/001_initial_schema.sql` — a new database and core tables.
2. `backend/migrations/002_station_blocking_rules.sql` — the station rules table.
3. `backend/migrations/003_verify_installation.sql` — read-only verification.

The first script is for a new database and fails if the database already exists.
Do not create a database twice when FIS1/FIS2 share it. If only the rules table
is missing, see [backend/migrations/README.en.md](backend/migrations/README.en.md).
The old upgrade migrations have been removed. This set imports no old exclusions.
An empty rules table disables `_MASTER` lock handling; add real station/prefix
records through the dashboard after startup.

## Frontend preview and build

Requirements: Node.js 22.18+ in the 22 series, or Node.js 24+, and npm.

```sh
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000/custom/matz/MasterSamples/` and choose guest access.
Data views require real FIS endpoints. Documentation does not fetch production
data. Keep the Vite terminal running.

```sh
npm run build
npm test
npm run lint
```

The build generates the offline documentation and the application in
`frontend/dist/`. In production, copy the **contents** of `dist/` to
`/custom/matz/MasterSamples/`. For a different hosting path, change `base` in
`frontend/vite.config.ts` and rebuild. Do not open the application’s
`dist/index.html` by double-clicking it.

Deploy the respective PHP endpoints to FIS1 and FIS2 at
`/custom/matz/php/MasterDashboard.php`. FIS libraries and configuration must be
available on both hosts. PHP and Tcl on each FIS use the same rules database.

## Central Tcl loading

The PHP router uses the BB library on the server:
`/fis/mantis/custom/www/matz/phpBB/BuildingBlocks.php`.
Check that it is available on both FIS servers during deployment.

Application access is controlled by **masterSamplesDashboard.acl** for these
FIS groups: `testeng`, `proceng`, `golden_samples`, `fisadmin_group`, `admin_group`.
The server ACL is separate from the application’s `canEdit` write permissions;
guest mode does not bypass the ACL.

`/fis/mantis/custom/apps/local/lib/BB/loadcstpkgs` registers and loads
`MasterCheck 1.3` from `$_sysvar(CSTBBDIR)/mastercheck.tcl` for every script.
Do not add further `package require` statements to station handlers.
Choose `MasterCheck.tcl` for Tcl 8.6+ or `MasterCheck85.tcl` for Tcl 8.5.7+,
then copy the selected file to the server as `mastercheck.tcl`.

BREQ/BCMP calls with `BCNF` and `BACK` replies, library loading and the all-SN
BREQ variant are described in [backend/tcl/README.en.md](backend/tcl/README.en.md).
A GOLDEN-only condition does not run BREQ lock validation for regular SNs.

## Maintaining documentation

Shared PL/EN content: `frontend/src/documentation/content.ts`.
After changing it, run `npm run docs:build` or `npm run build` in `frontend/`.
`npm run docs:check` detects differences between the HTML file and its source.
Keep chapter identifiers stable so saved URLs continue to work.

Frontend command details: [frontend/README.en.md](frontend/README.en.md).
