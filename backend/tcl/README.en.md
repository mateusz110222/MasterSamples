# MasterCheck 1.3.0

[Polski](README.md) | [English](README.en.md)

The Tcl module validates masters, counts results and manages lock files.
`MasterCheck.tcl` requires Tcl 8.6+; `MasterCheck85.tcl` requires Tcl 8.5.7+.
Both use mysqltcl 3.x, MySQL 8 / InnoDB, FIS libraries `Unit`, `Archive`, `Lib`,
`Mail` and the global `param` array.

## Central loading through loadcstpkgs

In this environment, libraries including mysqltcl are loaded for every script.
Check this entry in `/fis/mantis/custom/apps/local/lib/BB/loadcstpkgs`:

```tcl
if { [file exists [file join $_sysvar(CSTBBDIR) mastercheck.tcl]] } {
    package ifneeded MasterCheck 1.3 [list source [file join $_sysvar(CSTBBDIR) mastercheck.tcl]]
}

# Central loading — available to every script.
package require MasterCheck 1.3
```

Copy the chosen repository variant as **mastercheck.tcl** into
`$_sysvar(CSTBBDIR)`. Filename case matters on a case-sensitive server.
Do not load both variants. Do not repeat `package require mysqltcl` or
`package require MasterCheck` in BREQ/BCMP handlers.
Restart the processes using the libraries; check in the FIS process:

```tcl
info patchlevel
package present MasterCheck
info commands ::MasterCheck::BREQ
```

The 1.3 requirement is compatible with the module’s provided version 1.3.0.
`pkgIndex.tcl` remains an alternative for standard package discovery and tests;
the central loader points directly to `mastercheck.tcl`.

## MySQL — fresh installation

Run in this order on every distinct database used by PHP and Tcl:

1. `backend/migrations/001_initial_schema.sql` — a new database and core tables.
2. `backend/migrations/002_station_blocking_rules.sql` — the rules table.
3. `backend/migrations/003_verify_installation.sql` — schema verification.

Do not repeat database creation when both FIS servers share it. If the current
core tables already exist and only rules are missing, use 002 and 003.
This set imports no old exclusions and creates no `stationBlockingExclusions`.
An empty table disables `_MASTER` blocking; a missing table or SQL error causes
rejection, not disabled checks. A record’s presence enables blocking; `disabled`
is retained for the current PHP code and always written as 0.

## BREQ in the existing GOLDEN handler

```tcl
if { $param(uk3) eq "GOLDEN" } {
    if { ![MasterCheck::BREQ $value(id) $param(process) $param(station)] } {
        set param(reply) "BCNF|id=$value(id)|status=$param(fStat)|msg=$error"
        return 0
    }
}
```

## BCMP in the master result handler

```tcl
if { ![MasterCheck::BCMP $value(id) $value(process) $station $value(status)] } {
    set param(reply) "BACK|id=$value(id)|status=$param(fStat)|msg=$error"
    return 0
}
```

Call BCMP for master tests; `value(status)` must be PASS or FAIL.

## Dashboard rules and regular SNs

The GOLDEN condition above skips BREQ for regular SNs. If dashboard rules must
control their admission, use the following BREQ variant for every SN, without
the outer GOLDEN condition or a separate `_MASTER` file check:

```tcl
if { ![MasterCheck::BREQ $value(id) $param(process) $param(station)] } {
    set param(reply) "BCNF|id=$value(id)|status=$param(fStat)|msg=$error"
    return 0
}
```

The EI handler code is outside the repository — change it on the station during
deployment. For a regular SN, BREQ reads configuration and the lock file, without
requiring a master or counting a test. For GOLDEN, it checks the master/panel,
activity, process and limits. BCMP remains in the master result path.

The **Station blocking** view stores `single` or `prefix` rules separately for
FIS1/FIS2. Prefix matching is literal and case-sensitive. An `APR` record also
covers future stations starting with `APR`. Deleting a record disables blocking
only when no other record matches; it does not remove an existing file. GOLDEN
validation and counters remain active. After blocking is enabled again, the
existing file applies again.

API: `GetStationBlockingRules` with `fis`; POST `SetStationBlocking` and
`DeleteStationBlockingRule` with `{fis, mode, station}`. `mode` is `single` or
`prefix`. Saving enables blocking; do not use `disabled` as a switch. Saves and
deletions are audited. Configuration is not cached: subsequent BREQ/BCMP calls
read the current rules.

On hosts other than `plblofis1` / `plblofis2`, set this before the first call:

```tcl
set param(masterCheckFis) "FIS1" ;# on FIS2: "FIS2"
```

Deployment order: SQL, the respective PHP for each FIS, frontend, the correct
`mastercheck.tcl` variant and central loader, then the EI handler. Check one
station: a regular SN, GOOD/BAD, both outcomes, limits, prefix, rule deletion
and audit. Manual `LockStationMaster` / `UnlockStationMaster` and dashboard
unlocking are administrative operations independent of rule configuration.

The module loads `/fis/mantis/common/config/system/system.cfg`, sets global
`param(dbName)` to `masterSample`, then loads `config.cfg` from
`$_sysvarc(FISVW_DB)`. `host`, `user`, `password` and `port` come from that
configuration, as in the previous version. A `config.cfg` loading error is
stored in `error` and logged through `Lib::ShowError`; the package is not
declared loaded in that case. The lock directory is
`/fis/mantis/data/blocked_machines`; its group is `fis`.

`BREQ unit process station` and `BCMP unit process station status` return `1`/`0`.
The message is available in `::MasterCheck::error` and the caller’s `error`
variable, matching the previous calling convention. After a successful BREQ,
the expected type is available in global `::param(pType)` (`GOOD`/`BAD`).

BREQ neither increments counters nor removes a lock. BCMP validates the record
again under `FOR UPDATE` and unlocks only after a confirmed COMMIT of a matched
result. For a BAD master, FAIL is a matched result and counts a cycle, not an
error. A mismatch increments `errorCounter` and `globalCounter`, blocks the
station and returns `0`. Invalid data and reached limits do not count a test.

Public `LockStationMaster station` and `UnlockStationMaster station` preserve
their arguments and `1`/`0` results. They operate on files only and do not connect
to MySQL. `UnlockStationMaster` is administrative; the normal result path should
use BCMP. The old general `SafeUpdate` was replaced by internal whole-transaction
retrying and must no longer be called from outside the module.

## Locks and permissions

An automatic lock is `<station>_MASTER` in `blocked_machines`. Creating or
removing the file requires a matching station or prefix rule for the FIS to
have been read successfully. A rule’s presence alone does not create a file.

By default, GOOD/PASS and BAD/FAIL are matched: BCMP removes the lock after
COMMIT. GOOD/FAIL and BAD/PASS are mismatched: after saving the error, BCMP
creates or retains the lock and returns 0. **MasterCheck85.tcl exception:**
BAD/PASS is also matched when the station name contains DAL or ADS (uppercase).
MasterCheck.tcl has no such exception. Tester FAIL and a function’s 0 return
are separate pieces of information.

An inactive master, wrong process, missing or ambiguous master selection,
invalid data and reached limits cause rejection and an attempted lock if a
matching rule was already read. Connection or rule-read failure returns 0,
but file creation cannot be guaranteed in that case.

BREQ for a regular SN does not remove a lock. A valid GOLDEN unit may pass
BREQ with an existing file so it can run an unlocking test. BREQ alone does
not unlock. Limits are checked before counting: a matched test at 99/100 can
save 100/100 and unlock; the next check rejects and attempts to lock the station.
A file-removal failure after saving counters does not undo the test; do not
automatically retry BCMP. Without a rule, the file remains unchanged, while
GOLDEN validation and counters stay active.

Run on the target server for this directory only:

```sh
chgrp fis /fis/mantis/data/blocked_machines
chmod 2775 /fis/mantis/data/blocked_machines
```

Do not use `-R`. Other files, including `UPS22_5156`, must remain unchanged.
FIS and PHP processes must belong to `fis`; restart them after changing group
membership. New locks use group `fis` and permissions `0664`. Existing regular
files retain their content, permissions and modification time. Symlinks and
directories in place of files are rejected; files are removed without `-force`.
The design assumes trusted, cooperating users of the shared group directory,
not protection against a malicious process replacing paths concurrently.

A station calls the module sequentially; there is no per-station MySQL lock.
BREQ and BCMP use the public file locking/unlocking functions. The `FOR UPDATE`
transaction protects counters when different stations use the same master.
Manual file removal through the dashboard remains a separate administrative decision.

Without an SQL connection, the module returns `0` and does not remove the file.
The caller must stop testing on every `0`; a missing file alone is not proof
of a valid master. Physical locking failures are explicitly logged.

## Transactions and notifications

Deadlock 1213 or lock timeout 1205 triggers rollback and retries the whole
transaction: up to three attempts with 100/200 ms delays. Row-lock waiting is
limited to 5 seconds per connection. An uncertain COMMIT result is not retried.
Results are not deduplicated: calling BCMP again for the same test can count it
again, including after a saved result followed by an unlocking failure.

The email threshold is `max(1, maxCounter-50)`. Email is sent after the confirmed
threshold crossing, using values calculated while holding the row lock.
There is one attempt, no queue and no delivery guarantee if the process fails.
After a manual counter reset, another threshold crossing produces another
notification. A sending error or missing recipient is logged through
`Lib::ShowError` but does not roll back the saved test. The recipient comes
from `engineers` for the full name of the process used in the call.

## Tests and deployment

The 8.5.7 variant:

```sh
tclsh8.5 tests/MasterCheck85.test.tcl
```

Locally, the variant passed 56 tests on Tcl 8.6 with `try` disabled. It has not
yet been run on actual Tcl 8.5.7; verify it on the target interpreter with the
installed mysqltcl and FIS libraries.

Tests with FIS/MySQL doubles and real file I/O:

```sh
tclsh8.6 tests/MasterCheck.test.tcl
```

On Linux, run as a user in `fis` with write access to the test directory.
On Windows, POSIX permissions and the symlink case are emulated.
`tests/run_with_tcl_dll.py` runs the same suite with an existing Tcl 8.6 DLL,
without installing Tcl; it also handles redirected Windows paths in the
sandbox. It does not replace the Linux test.

Integration requires Linux, mysqltcl, PHP CLI and an **isolated MySQL 8 server**:

```sh
export MC_TEST_HOST=127.0.0.1
export MC_TEST_USER=mastercheck_test
# Set MC_TEST_PASSWORD without including the password in shell history.
export MC_TEST_GROUP=fis
tclsh8.6 tests/MySQL.integration.tcl
```

The test account must be able to create and delete temporary
`mastercheck_test_*` databases. The suite creates its own database and test
directory and checks concurrent processes, limits, email, real deadlock/timeout,
POSIX permissions and file removal through PHP CLI. Do not run as root: the
permission-denial test must check an actual rejection. Do not use a production
server or a FIS administrator account.

Before deployment, run both suites, retain the previous module and deploy 1.3.0
on one station first. With real FIS, check GOOD and BAD masters, a panel, archive,
dashboard locking and file removal by the actual PHP web-server account.
Verify counters and logs after both outcomes, and email at the threshold.
Then expand deployment to the remaining stations; do not mix old and new
versions on one station. To roll back, restore the previous module.
