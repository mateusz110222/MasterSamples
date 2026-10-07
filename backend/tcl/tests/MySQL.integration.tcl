# Opt-in Linux / MySQL 8 integration tests. Creates ONLY a disposable database.
# Required env: MC_TEST_HOST, MC_TEST_USER, MC_TEST_PASSWORD; optional MC_TEST_PORT,
# MC_TEST_GROUP (default fis). Never point these credentials at a production server.
package require Tcl 8.6
package require mysqltcl 3.0
if {$::tcl_platform(platform) ne "unix"} { error "This suite requires Linux/POSIX" }
set root [file dirname [file normalize [info script]]]
foreach key {MC_TEST_HOST MC_TEST_USER MC_TEST_PASSWORD} {
    if {![info exists ::env($key)]} { error "Missing $key" }
}
set port [expr {[info exists ::env(MC_TEST_PORT)] ? $::env(MC_TEST_PORT) : 3306}]
set group [expr {[info exists ::env(MC_TEST_GROUP)] ? $::env(MC_TEST_GROUP) : "fis"}]
set credentials [list -host $::env(MC_TEST_HOST) -user $::env(MC_TEST_USER) \
    -password $::env(MC_TEST_PASSWORD) -port $port -encoding utf-8]

namespace eval ::Lib {
    proc ShowError {message args} { puts stderr $message }
    proc ShowDebug {message args} { puts stderr $message }
}
namespace eval ::Unit {
    variable uk3 GOLDEN
    proc Find {unit} { return 1 }
    proc GetParent {unit} { return 0 }
    proc GetChildren {unit} { return 0 }
    proc GetStatus {unit} { set ::Unit::uk3 [expr {$unit eq "PRODUCTION" ? "NORMAL" : "GOLDEN"}]; return 1 }
}
namespace eval ::Mail {
    proc SendHTML {mail subject html} {
        set fd [open [file join $::env(MC_TEST_DIR) mail-[pid].log] a]
        puts $fd "sent"
        close $fd
        return 1
    }
}

# Intercept production configuration files; tests use only the disposable schema.
rename ::source ::nativeSource
proc ::source {path args} {
    if {$path eq "/fis/mantis/common/config/system/system.cfg"} {
        uplevel 1 {set _sysvarc(FISVW_DB) /mock/fisdb}
        return
    }
    if {$path eq "/mock/fisdb/config.cfg"} {
        foreach key {host user password port} envKey {MC_TEST_HOST MC_TEST_USER MC_TEST_PASSWORD MC_TEST_PORT} {
            if {$key eq "port"} {
                set ::param($key) $::port
            } else {
                set ::param($key) $::env($envKey)
            }
        }
        set ::param(dbName) $::env(MC_TEST_DB)
        return
    }
    return [uplevel 1 [list ::nativeSource $path {*}$args]]
}
proc loadModule {} {
    namespace eval ::MasterCheck {set _sysvarc(FISVW_DB) /mock/fisdb}
    source [file join $::root .. MasterCheck.tcl]
    set ::param(masterCheckFis) FIS1
    set ::MasterCheck::blockedDir $::env(MC_TEST_DIR)
    set ::MasterCheck::blockedGroup $::group
}

if {[lindex $::argv 0] eq "--worker"} {
    loadModule
    lassign [lrange $::argv 1 end] station status mode
    if {$mode eq "row-delay"} {
        rename ::MasterCheck::_Rows ::MasterCheck::_OriginalRows
        proc ::MasterCheck::_Rows {db predicate {forUpdate 0}} {
            set rows [_OriginalRows $db $predicate $forUpdate]
            if {$forUpdate} { puts HELD; flush stdout; after 300 }
            return $rows
        }
    }
    if {$mode eq "deadlock"} {
        set ::heldReported 0
        rename ::MasterCheck::_Exec ::MasterCheck::_OriginalExec
        proc ::MasterCheck::_Exec {db sql} {
            set result [_OriginalExec $db $sql]
            if {$sql eq "START TRANSACTION"} {
                _OriginalExec $db {UPDATE masterUnits SET globalCounter = globalCounter + 1 WHERE unit = 'AUX'}
                if {!$::heldReported} { set ::heldReported 1; puts HELD; flush stdout }
            }
            return $result
        }
    }
    set result [::MasterCheck::BCMP SN1 SMT $station $status]
    puts "RESULT $result"
    exit 0
}

proc assert {condition message} {
    if {![uplevel 1 [list expr $condition]]} { error $message }
}
proc worker {station status {mode ""}} {
    # stderr goes to the test process; passwords stay in inherited environment.
    set channel [open [list | [info nameofexecutable] [info script] --worker $station $status $mode 2>@stderr] r]
    lappend ::workers $channel
    return $channel
}
proc finish {channel} {
    set result ""
    while {[gets $channel line] >= 0} {
        if {[string match "RESULT *" $line]} { set result [lindex $line 1] }
    }
    close $channel
    if {$result eq ""} { error "Worker ended without result" }
    return $result
}
proc resetCounters {db {current 10} {maximum 1000}} {
    ::mysql::exec $db "UPDATE masterUnits SET currentCounter=$current, maxCounter=$maximum, errorCounter=0, globalCounter=$current, isactive=1 WHERE unit='SN1'"
    foreach path [glob -nocomplain -directory $::env(MC_TEST_DIR) *] { file delete $path }
}
proc state {db} {
    return [lindex [::mysql::sel $db {SELECT currentCounter, errorCounter, globalCounter FROM masterUnits WHERE unit='SN1'} -list] 0]
}

set admin [::mysql::connect {*}$credentials]
set schema mastercheck_test_[pid]_[clock seconds]
assert {[regexp {^mastercheck_test_[0-9]+_[0-9]+$} $schema]} "Unsafe integration database name"
set ::env(MC_TEST_DB) $schema
set ::env(MC_TEST_DIR) [file join $root .mastercheck-integration-[pid]]
set created 0
set work ""
set ::workers {}
try {
    set version [lindex [::mysql::sel $admin {SELECT VERSION()} -list] 0 0]
    assert {[string match "8.*" $version]} "Use MySQL 8 for this suite"
    ::mysql::exec $admin "CREATE DATABASE `$schema` CHARACTER SET utf8mb4"
    set created 1
    set work [::mysql::connect {*}$credentials -db $schema]
    ::mysql::exec $work {CREATE TABLE masterUnits (
        unit varchar(100) PRIMARY KEY, process varchar(100), status varchar(100), isactive int,
        currentCounter int, maxCounter int, errorCounter int, errorMaxCounter int, globalCounter int
    ) ENGINE=InnoDB}
    ::mysql::exec $work {CREATE TABLE engineers (process varchar(100) PRIMARY KEY, mail varchar(100)) ENGINE=InnoDB}
    set migrationFile [open [file join $root .. .. migrations 002_station_blocking_rules.sql] r]
    set migration [read $migrationFile]
    close $migrationFile
    set migration [string map [list masterSample $schema] $migration]
    regsub -all {(?m)^--[^\n]*\n?} $migration {} migration
    foreach sql [split $migration {;}] {
        if {[string trim $sql] ne ""} { ::mysql::exec $work $sql }
    }
    assert {[::mysql::sel $work {SELECT COUNT(*) FROM stationBlockingRules} -list] eq {{0}}} "Fresh schema must not enable any rules"
    ::mysql::exec $work {INSERT INTO stationBlockingRules (FIS, mode, station, user) VALUES ('FIS1','single','FRESH','test'), ('FIS2','single','FRESH','other')}
    set fresh [::mysql::sel $work {SELECT FIS, mode, station, disabled, user FROM stationBlockingRules ORDER BY FIS} -list]
    assert {$fresh eq {{FIS1 single FRESH 0 test} {FIS2 single FRESH 0 other}}} "Fresh rules must default to zero and preserve FIS isolation"
    ::mysql::exec $work {DELETE FROM stationBlockingRules}
    puts "PASS fresh rules schema starts empty and preserves FIS isolation"
    ::mysql::exec $work {INSERT INTO masterUnits VALUES ('SN1','SMT','GOOD',1,10,1000,0,50,10)}
    ::mysql::exec $work {INSERT INTO engineers VALUES ('SMT','engineer@example.test')}
    file mkdir $::env(MC_TEST_DIR)
    file attributes $::env(MC_TEST_DIR) -group $group -permissions 02775
    loadModule

    assert {[::MasterCheck::LockStationMaster CON01] == 1} "Cannot create lock"
    set path [file join $::env(MC_TEST_DIR) CON01_MASTER]
    assert {[file attributes $path -group] eq $group} "Wrong file group"
    assert {([scan [file attributes $path -permissions] %o] & 0777) == 0664} "Wrong file permissions"
    assert {([scan [file attributes $::env(MC_TEST_DIR) -permissions] %o] & 02000) != 0} "Missing directory setgid"
    set fd [open $path w]; puts -nonewline $fd preserved; close $fd
    file mtime $path 1700000000
    assert {[::MasterCheck::LockStationMaster CON01] == 1} "Cannot retain existing lock"
    assert {[file size $path] == 9 && [file mtime $path] == 1700000000} "Existing lock changed"
    # PHP CLI proves unlink works with the invoking account's group membership.
    # The actual web-server account is a separate deployment smoke test.
    set php [auto_execok php]
    assert {$php ne ""} "PHP CLI required for unlink check"
    exec {*}$php -r {if (!unlink($argv[1])) { exit(1); }} $path
    assert {![file exists $path]} "PHP could not unlink lock"

    assert {[::MasterCheck::BREQ PRODUCTION SMT CON01] == 1} "No record must disable blocking"
    ::mysql::exec $work {INSERT INTO stationBlockingRules VALUES ('FIS1','single','CON01',0,'test',NOW())}
    assert {[::MasterCheck::LockStationMaster CON01] == 1} "Cannot prepare policy lock"
    assert {[::MasterCheck::BREQ PRODUCTION SMT CON01] == 0} "Production must respect lock"
    ::mysql::exec $work {DELETE FROM stationBlockingRules WHERE FIS='FIS1' AND station='CON01'}
    ::mysql::exec $work {INSERT INTO stationBlockingRules VALUES ('FIS2','single','CON01',0,'test',NOW())}
    assert {[::MasterCheck::BREQ PRODUCTION SMT CON01] == 1} "Record leaked from FIS2"
    ::mysql::exec $work {INSERT INTO stationBlockingRules VALUES ('FIS1','single','CON01',0,'test',NOW())}
    assert {[::MasterCheck::BREQ PRODUCTION SMT CON01] == 0} "Local record did not enable blocking"
    assert {[file exists $path]} "Policy must not delete the existing lock"
    ::mysql::exec $work {DELETE FROM stationBlockingRules}
    assert {[::MasterCheck::BREQ PRODUCTION SMT CON01] == 1} "Deleting records must disable blocking"
    assert {[::MasterCheck::UnlockStationMaster CON01] == 1} "Cannot clean policy lock"
    puts "PASS station blocking exclusions and FIS isolation"
    ::mysql::exec $work {INSERT INTO stationBlockingRules VALUES ('FIS1','prefix','FT',0,'test',NOW()), ('FIS1','prefix','FTS',1,'test',NOW()), ('FIS1','single','FTS001',0,'test',NOW())}
    assert {[::MasterCheck::_BlockingEnabled $work FTS001] == 1} "Single override did not win"
    foreach station {FTS002 FTS_TEST FTS001_A FTS999} {
        assert {[::MasterCheck::_BlockingEnabled $work $station] == 1} "Prefix did not cover $station"
    }
    assert {[::MasterCheck::_BlockingEnabled $work XFTS001] == 0} "Prefix matched inside station name"
    ::mysql::exec $work {DELETE FROM stationBlockingRules WHERE mode='single'}
    assert {[::MasterCheck::_BlockingEnabled $work FTS001] == 1} "Removed exception did not inherit group"
    ::mysql::exec $work {DELETE FROM stationBlockingRules}
    puts "PASS literal prefix matching, single overrides and longest prefix"
    puts "PASS POSIX permissions and PHP unlink"

    set target [file join $::env(MC_TEST_DIR) target]
    close [open $target w]
    file link -symbolic $path $target
    assert {[::MasterCheck::UnlockStationMaster CON01] == 0} "Symlink was accepted"
    assert {[file exists $target]} "Symlink target deleted"
    file delete $path $target
    file mkdir $path
    assert {[::MasterCheck::UnlockStationMaster CON01] == 0} "Directory was deleted"
    file delete $path
    file attributes $::env(MC_TEST_DIR) -permissions 02555
    assert {[::MasterCheck::LockStationMaster CON01] == 0} "Unwritable directory was accepted (run as non-root)"
    file attributes $::env(MC_TEST_DIR) -permissions 02775
    puts "PASS unsafe paths and missing permissions"

    resetCounters $work 949
    set a [worker CON01 PASS row-delay]
    assert {[gets $a line] >= 0 && $line eq "HELD"} "First worker did not lock master"
    set b [worker CON02 PASS]
    assert {[finish $a] == 1 && [finish $b] == 1} "Concurrent master writes failed"
    assert {[state $work] eq {951 0 951}} "Lost or duplicate increments"
    set mailCount 0
    foreach mail [glob -nocomplain -directory $::env(MC_TEST_DIR) mail-*.log] {
        set fd [open $mail r]
        incr mailCount [llength [split [string trim [read $fd]] \n]]
        close $fd
    }
    assert {$mailCount == 1} "Duplicate or missing threshold notification"
    puts "PASS shared master concurrency and single threshold notification"

    resetCounters $work 0 1
    set a [worker CON01 PASS row-delay]
    assert {[gets $a line] >= 0 && $line eq "HELD"} "First worker did not lock master"
    set b [worker CON02 PASS]
    assert {[finish $a] == 1 && [finish $b] == 0} "Counter limit did not stop second result"
    assert {[state $work] eq {1 0 1}} "Counter exceeded limit"
    puts "PASS concurrent cycle limit"

    resetCounters $work
    ::mysql::exec $work {START TRANSACTION}
    ::mysql::exec $work {UPDATE masterUnits SET globalCounter=globalCounter WHERE unit='SN1'}
    set a [worker CON01 PASS]
    # Worker hits the configured 5-second timeout and retries the transaction.
    after 5700
    ::mysql::exec $work COMMIT
    assert {[finish $a] == 1 && [state $work] eq {11 0 11}} "Lock-timeout retry failed"
    puts "PASS actual MySQL lock wait timeout and retry"

    resetCounters $work
    ::mysql::exec $work {INSERT INTO masterUnits VALUES ('AUX','OTHER','GOOD',1,0,1000,0,50,0)}
    for {set i 0} {$i < 20} {incr i} {
        ::mysql::exec $work "INSERT INTO masterUnits VALUES ('HEAVY$i','OTHER','GOOD',1,0,1000,0,50,0)"
    }
    ::mysql::exec $work {START TRANSACTION}
    ::mysql::exec $work {UPDATE masterUnits SET globalCounter=globalCounter+1 WHERE unit != 'AUX'}
    set a [worker CON01 PASS deadlock]
    assert {[gets $a line] >= 0 && $line eq "HELD"} "Deadlock worker did not lock AUX"
    # The heavier controller transaction waits on AUX; the module's lighter
    # transaction waits on SN1 and should be selected as the deadlock victim.
    ::mysql::exec $work {UPDATE masterUnits SET globalCounter=globalCounter+1 WHERE unit='AUX'}
    ::mysql::exec $work COMMIT
    assert {[finish $a] == 1} "Deadlock victim failed to retry"
    assert {[lindex [state $work] 0] == 11} "Deadlock duplicated the cycle"
    puts "PASS actual MySQL deadlock and transaction retry"
    puts "All Linux/MySQL integration checks passed"
} finally {
    foreach channel $::workers {
        if {$channel in [chan names]} { catch {finish $channel} }
    }
    if {$work ne ""} { catch {::mysql::exec $work ROLLBACK}; catch {::mysql::close $work} }
    if {$created} { ::mysql::exec $admin "DROP DATABASE `$schema`" }
    ::mysql::close $admin
    if {[file isdirectory $::env(MC_TEST_DIR)]} {
        file attributes $::env(MC_TEST_DIR) -permissions 02775
        foreach path [glob -nocomplain -directory $::env(MC_TEST_DIR) *] { file delete $path }
        file delete $::env(MC_TEST_DIR)
    }
}
