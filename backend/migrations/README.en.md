# SQL — fresh Master Samples installation

[Polski](README.md) | [English](README.en.md)

Connect to the correct server using a MySQL client or administration tool.
Run the files in this order:

1. `001_initial_schema.sql` — a new `masterSample` database and tables for
   masters, audit, processes and the address book. `history.FIS` is included.
2. `002_station_blocking_rules.sql` — the current station and prefix rules table.
3. `003_verify_installation.sql` — read-only schema and rule-count checks.

The first file is only for a new database and intentionally fails if the database
already exists. If the database and current core tables are ready, but the rules
table is missing, use `002`, then `003`. Do not ignore SQL errors or rerun table
creation after a partial installation without checking its state first.

Run the set once on each **distinct database** used by FIS1/FIS2. If both hosts
point to the same database, do not repeat table creation. PHP and MasterCheck
on each FIS must use the same database configuration.

An empty rules table disables `_MASTER` lock handling on every station. Add real
`single` or `prefix` records through the dashboard. Select names and FIS from
the lists and check the machine preview. Records neither create nor delete lock
files. `disabled` remains required by the current PHP code, has value 0 and does
not act as a rule switch.

This set does not create the old `stationBlockingExclusions` table, import data
or change the meaning of existing records. The old upgrade migrations have been
removed; this directory describes a fresh installation, not an old-database upgrade.

For the full guide, double-click `docs/MasterSamples.html` in the project root.
