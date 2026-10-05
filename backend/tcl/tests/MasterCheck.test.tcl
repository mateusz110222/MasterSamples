# Standalone regression suite: tclsh8.6 MasterCheck.test.tcl
# mysql/FIS/mail are mocked. Lock files use a dedicated temporary directory.
package require Tcl 8.5.7
set testDir [file dirname [file normalize [info script]]]

namespace eval ::Test {
    variable passed 0
    variable failed 0
    variable directory [file join $::testDir .mastercheck-tests-[pid]]
    if {[info exists ::env(MASTERCHECK_TEST_TMPDIR)]} {
        set directory [file join $::env(MASTERCHECK_TEST_TMPDIR) mastercheck-tests-[pid]]
    }
    variable files {}
    variable rows {}
    variable queries {}
    variable logs {}
    variable mails {}
    variable handles 0
    variable closed 0
    variable updateAttempts 0
    variable committed 0
    variable failures {}
    variable golden GOLDEN
    variable parent ""
    variable children {}
    variable find 1
    variable archived 1
    variable fisThrow 0
    variable connectThrow 0
    variable affected 1
    variable recipients {{eng@example.test}}
    variable mailThrow 0
    variable mailReturn 1
    variable refreshActive ""
    variable transactions {}

    proc assert {condition {message "assertion failed"}} {
        if {![uplevel 1 [list expr $condition]]} { error $message }
    }
    proc equals {actual expected} {
        if {$actual ne $expected} { error "expected <$expected>, got <$actual>" }
    }
    proc record {{unit SN1} {process SMT}} {
        return [dict create unit $unit process $process status GOOD isactive 1 \
            currentCounter 10 maxCounter 1000 errorCounter 0 errorMaxCounter 50 globalCounter 10]
    }
    proc reset {} {
        foreach {key value} {
            queries {} logs {} mails {} handles 0 closed 0 updateAttempts 0
            committed 0 failures {} golden GOLDEN parent {} children {} find 1 archived 1
            fisThrow 0 connectThrow 0 affected 1 recipients {{eng@example.test}}
            mailThrow 0 mailReturn 1 refreshActive {} transactions {} files {}
        } { variable $key; set $key $value }
        variable rows
        set rows [dict create SN1 [record]]
        variable directory
        if {[file exists $directory]} {
            foreach path [glob -nocomplain -directory $directory *] {
                if {[file isdirectory $path]} { file delete $path } else { file delete $path }
            }
        } else { file mkdir $directory }
        array set ::param {host mock user mock password {} port 3306 dbName masterSample}
        set ::MasterCheck::blockedDir $directory
        set ::MasterCheck::blockedGroup fis
    }
    proc run {name body} {
        variable passed
        variable failed
        reset
        if {[catch {uplevel 1 $body} message options]} {
            incr failed
            puts "FAIL $name: $message"
            puts "MasterCheck error: $::MasterCheck::error"
            puts [dict get $options -errorinfo]
        } else {
            incr passed
            puts "PASS $name"
        }
    }
    proc lockPath {} { variable directory; return [file join $directory CON01_MASTER] }
    proc checkCleanup {} {
        variable handles; variable closed
        equals $handles $closed
    }
}

namespace eval ::Lib {
    proc ShowError {message args} { lappend ::Test::logs $message }
    proc ShowDebug {message args} { lappend ::Test::logs $message }
}
namespace eval ::Unit {
    variable uk3 GOLDEN
    variable parent ""
    variable children {}
    variable error ""
    proc Find {unit} {
        if {$::Test::fisThrow} { error "FIS unavailable" }
        return $::Test::find
    }
    proc GetParent {unit} {
        set ::Unit::parent $::Test::parent
        return [expr {$::Test::parent ne ""}]
    }
    proc GetChildren {unit} {
        set ::Unit::children $::Test::children
        return [expr {[llength $::Test::children] > 0}]
    }
    proc GetStatus {unit} { set ::Unit::uk3 $::Test::golden; return 1 }
}
namespace eval ::Archive {
    proc GetAll {unit} { return $::Test::archived }
    proc Unarchive {unit} { set ::Test::find 1; return $::Test::archived }
}
namespace eval ::Mail {
    proc SendHTML {mail subject html} {
        lappend ::Test::mails [list $mail $subject $html]
        if {$::Test::mailThrow} { error "SMTP unavailable" }
        return $::Test::mailReturn
    }
}
namespace eval ::mysql {
    proc connect {args} {
        set ::Test::connectionArgs $args
        if {$::Test::connectThrow} { error "DB unavailable" }
        incr ::Test::handles
        return mock$::Test::handles
    }
    proc close {db} { incr ::Test::closed }
    proc escape {db value} { return [string map [list "\\" "\\\\" "'" "\\'"] $value] }
    proc isnull {value} { return [expr {$value eq "__NULL__"}] }
    proc sel {db sql args} {
        lappend ::Test::queries $sql
        if {[string match "SELECT mail*" $sql]} { return $::Test::recipients }
        if {[string match "*FOR UPDATE" $sql] && $::Test::refreshActive ne ""} {
            dict set ::Test::rows SN1 isactive $::Test::refreshActive
        }
        set result {}
        dict for {unit record} $::Test::rows {
            if {[string first "'[escape $db $unit]'" $sql] < 0} { continue }
            set row {}
            foreach key {unit process status isactive currentCounter maxCounter errorCounter errorMaxCounter globalCounter} {
                lappend row [dict get $record $key]
            }
            lappend result $row
        }
        return $result
    }
    proc exec {db sql} {
        lappend ::Test::queries $sql
        if {$sql eq "START TRANSACTION"} {
            dict set ::Test::transactions $db $::Test::rows
            return 0
        }
        if {$sql eq "ROLLBACK"} {
            if {[dict exists $::Test::transactions $db]} {
                set ::Test::rows [dict get $::Test::transactions $db]
                dict unset ::Test::transactions $db
            }
            return 0
        }
        if {$sql eq "COMMIT"} {
            if {$::Test::failures eq {commit}} { error "Connection lost during COMMIT" }
            incr ::Test::committed
            dict unset ::Test::transactions $db
            return 0
        }
        if {![string match "UPDATE masterUnits*" $sql]} { return 0 }
        incr ::Test::updateAttempts
        if {[llength $::Test::failures] && $::Test::failures ne {commit}} {
            set code [lindex $::Test::failures 0]
            set ::Test::failures [lrange $::Test::failures 1 end]
            set ::mysqlstatus(code) $code
            error "Simulated SQL error $code"
        }
        if {$::Test::affected != 1} { return $::Test::affected }
        set key [expr {[string match "*SET currentCounter*" $sql] ? "currentCounter" : "errorCounter"}]
        dict for {unit record} $::Test::rows {
            if {[string first "unit = '[escape $db $unit]'" $sql] >= 0} {
                dict incr record $key
                dict incr record globalCounter
                dict set ::Test::rows $unit $record
            }
        }
        return 1
    }
}

# Windows has no POSIX group/permissions attributes. Emulate only those attributes
# and symlinks; the remaining lock-file tests exercise actual filesystem I/O.
if {$::tcl_platform(platform) eq "windows"} {
    rename ::file ::Test::nativeFile
    proc ::file {subcommand args} {
        if {$subcommand eq "attributes" && [lindex $args 1] in {-group -permissions}} {
            if {[info exists ::Test::attributeFailure] && $::Test::attributeFailure} {
                error "Permission denied"
            }
            return ""
        }
        if {$subcommand eq "lstat" && [info exists ::Test::fakeSymlink] && $::Test::fakeSymlink} {
            upvar 1 [lindex $args 1] attributes
            set attributes(type) link
            return
        }
        return [uplevel 1 [list ::Test::nativeFile $subcommand {*}$args]]
    }
}

# Only the two production configuration paths are intercepted.
rename ::source ::Test::nativeSource
proc ::source {path args} {
    if {[file tail $path] eq "MasterCheck.tcl" && [info exists ::env(MASTERCHECK_TEST_MODULE)]} {
        set path $::env(MASTERCHECK_TEST_MODULE)
    }
    if {$path eq "/fis/mantis/common/config/system/system.cfg"} {
        uplevel 1 {set _sysvarc(FISVW_DB) /mock/fisdb}
        return
    }
    if {$path eq "/mock/fisdb/config.cfg"} {
        if {[info exists ::Test::configFail] && $::Test::configFail} {
            error "config unavailable"
        }
        array set ::param {host mock user mock password {} port 3306}
        return
    }
    return [uplevel 1 [list ::Test::nativeSource $path {*}$args]]
}
# The host may have loaded system.cfg before loading the module.
namespace eval ::MasterCheck {set _sysvarc(FISVW_DB) /mock/fisdb}
source [file join $testDir .. MasterCheck.tcl]

::Test::run configuration {
    set ::param(dbName) otherApplication
    source [file join $::testDir .. MasterCheck.tcl]
    ::Test::equals $::param(dbName) masterSample
    ::Test::equals [package provide MasterCheck] 1.3.0
    ::Test::assert {![llength [info commands ::MasterCheck::Configure]]}
}
::Test::run configuration-load-failure {
    package forget MasterCheck
    set ::Test::configFail 1
    ::Test::equals [source [file join $::testDir .. MasterCheck.tcl]] 0
    ::Test::equals [package provide MasterCheck] {}
    ::Test::assert {[string match "*Failed to load config.cfg*" $::MasterCheck::error]}
    set ::Test::configFail 0
    source [file join $::testDir .. MasterCheck.tcl]
}
::Test::run package-index {
    set dir [file join $::testDir ..]
    package forget MasterCheck
    source [file join $dir pkgIndex.tcl]
    ::Test::equals [package require MasterCheck 1.3.0] 1.3.0
    ::Test::assert {[llength [info commands ::MasterCheck::BCMP]] == 1}
}
::Test::run no-configuration {
    unset ::param(host)
    ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 0
    ::Test::equals $::Test::handles 0
}
::Test::run global-connection-parameters {
    set ::param(host) configured-host
    set ::param(user) configured-user
    set ::param(password) configured-password
    set ::param(port) 3307
    ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 1
    foreach key {host user password port dbName} {
        set index [lsearch -exact $::Test::connectionArgs [expr {$key eq "dbName" ? "-db" : "-$key"}]]
        ::Test::equals [lindex $::Test::connectionArgs [expr {$index + 1}]] $::param($key)
    }
}
::Test::run breq-no-counters-or-unlock {
    ::Test::equals [::MasterCheck::LockStationMaster CON01] 1
    ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 1
    ::Test::assert {[file exists [::Test::lockPath]]}
    ::Test::equals [dict get $::Test::rows SN1 currentCounter] 10
    ::Test::equals $::param(pType) GOOD
    ::Test::checkCleanup
}
foreach masterStatus {GOOD BAD} {
    ::Test::run "repeated-breq-no-writes-$masterStatus" {
        dict set ::Test::rows SN1 status $masterStatus
        dict set ::Test::rows SN1 currentCounter 949
        dict set ::Test::rows SN1 errorCounter 3
        dict set ::Test::rows SN1 globalCounter 952
        set before $::Test::rows
        ::Test::equals [::MasterCheck::LockStationMaster CON01] 1
        for {set i 0} {$i < 5} {incr i} {
            ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 1
            ::Test::equals $::Test::rows $before
            ::Test::equals $::param(pType) $masterStatus
        }
        ::Test::equals $::Test::updateAttempts 0
        ::Test::equals $::Test::committed 0
        ::Test::equals $::Test::mails {}
        ::Test::assert {[file exists [::Test::lockPath]]}
        foreach sql $::Test::queries {
            ::Test::assert {![string match -nocase "UPDATE *" $sql]}
            ::Test::assert {$sql ne "START TRANSACTION"}
        }
        # Only the subsequent BCMP may count the incompatible real result.
        set wrongStatus [expr {$masterStatus eq "GOOD" ? "FAIL" : "PASS"}]
        ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 $wrongStatus] 0
        ::Test::equals [dict get $::Test::rows SN1 currentCounter] 949
        ::Test::equals [dict get $::Test::rows SN1 errorCounter] 4
        ::Test::equals [dict get $::Test::rows SN1 globalCounter] 953
        ::Test::equals $::Test::updateAttempts 1
        ::Test::checkCleanup
    }
}
::Test::run refused-breq-no-writes {
    dict set ::Test::rows SN1 errorCounter 50
    set before $::Test::rows
    ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 0
    ::Test::equals $::Test::rows $before
    ::Test::equals $::Test::updateAttempts 0
    ::Test::equals $::Test::committed 0
    ::Test::checkCleanup
}
::Test::run successful-result {
    ::MasterCheck::LockStationMaster CON01
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 " pass "] 1
    ::Test::assert {![file exists [::Test::lockPath]]}
    ::Test::equals [dict get $::Test::rows SN1 currentCounter] 11
    ::Test::equals [dict get $::Test::rows SN1 globalCounter] 11
    ::Test::equals [dict get $::Test::rows SN1 errorCounter] 0
    ::Test::assert {[lsearch -exact $::Test::logs "Unlocked station: CON01 after succesful master check"] >= 0}
    ::Test::checkCleanup
}
::Test::run expected-bad-master {
    dict set ::Test::rows SN1 status BAD
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 FAIL] 1
    ::Test::equals [dict get $::Test::rows SN1 currentCounter] 11
}
foreach {masterStatus testStatus matched} {GOOD PASS 1 GOOD FAIL 0 BAD PASS 0 BAD FAIL 1} {
    ::Test::run "counter-mapping-$masterStatus-$testStatus" {
        dict set ::Test::rows SN1 status $masterStatus
        ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 $testStatus] $matched
        ::Test::equals [dict get $::Test::rows SN1 currentCounter] [expr {10 + $matched}]
        ::Test::equals [dict get $::Test::rows SN1 errorCounter] [expr {1 - $matched}]
        ::Test::equals [dict get $::Test::rows SN1 globalCounter] 11
        ::Test::equals [file exists [::Test::lockPath]] [expr {!$matched}]
    }
}
foreach {counter limit fragment} {currentCounter 1000 {max cycles} errorCounter 50 {max error cycles}} {
    foreach value [list $limit [expr {$limit + 1}]] {
        ::Test::run "exhausted-limit-$counter-$value" {
            dict set ::Test::rows SN1 $counter $value
            set before $::Test::rows
            ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 0
            ::Test::assert {[string first $fragment $error] >= 0}
            ::Test::equals $::Test::rows $before
            ::Test::assert {[file exists [::Test::lockPath]]}
            foreach status {PASS FAIL} {
                ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 $status] 0
                ::Test::equals $::Test::rows $before
                ::Test::assert {[file exists [::Test::lockPath]]}
            }
            ::Test::equals $::Test::updateAttempts 0
        }
    }
}
::Test::run last-allowed-cycle-then-block {
    dict set ::Test::rows SN1 maxCounter 11
    ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 1
    ::Test::equals [dict get $::Test::rows SN1 currentCounter] 10
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 1
    ::Test::equals [dict get $::Test::rows SN1 currentCounter] 11
    ::Test::equals [dict get $::Test::rows SN1 errorCounter] 0
    set atLimit $::Test::rows
    ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 0
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
    ::Test::equals $::Test::rows $atLimit
    ::Test::assert {[file exists [::Test::lockPath]]}
    ::Test::equals $::Test::updateAttempts 1
}
::Test::run wrong-result {
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 FAIL] 0
    ::Test::equals [dict get $::Test::rows SN1 errorCounter] 1
    ::Test::equals [dict get $::Test::rows SN1 currentCounter] 10
    ::Test::equals [dict get $::Test::rows SN1 globalCounter] 11
    ::Test::assert {[file exists [::Test::lockPath]]}
    ::Test::checkCleanup
}
::Test::run blocked-before-bcmp {
    ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 1
    dict set ::Test::rows SN1 isactive 2
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
    ::Test::equals $::Test::updateAttempts 0
    ::Test::assert {[file exists [::Test::lockPath]]}
}
::Test::run changed-during-bcmp {
    set ::Test::refreshActive 2
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
    ::Test::equals $::Test::updateAttempts 0
    ::Test::equals $::Test::committed 0
}
foreach {key value} {currentCounter 1000 errorCounter 50 maxCounter 0 errorMaxCounter -1 globalCounter 2147483647 currentCounter abc errorCounter __NULL__ maxCounter 2147483648} {
    ::Test::run "invalid-$key-$value" {
        dict set ::Test::rows SN1 $key $value
        ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
        ::Test::equals $::Test::updateAttempts 0
    }
}
foreach status {ERROR {} GOOD} {
    ::Test::run "invalid-test-result-$status" {
        ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 $status] 0
        ::Test::equals $::Test::updateAttempts 0
        ::Test::equals [dict get $::Test::rows SN1 errorCounter] 0
    }
}
::Test::run spaced-processes {
    dict set ::Test::rows SN1 process "SMT, AOI"
    ::Test::equals [::MasterCheck::BREQ SN1 AOI CON01] 1
    ::Test::equals [::MasterCheck::BCMP SN1 AOI CON01 PASS] 1
    ::Test::equals [::MasterCheck::BREQ SN1 SM CON01] 0
}
::Test::run panel-child-selection {
    set ::Test::parent PANEL
    set ::Test::children {SN1 OTHER SN1}
    dict set ::Test::rows SN1 process "AOI, SMT"
    ::Test::equals [::MasterCheck::BREQ OTHER SMT CON01] 1
    ::Test::equals [::MasterCheck::BCMP OTHER SMT CON01 PASS] 1
    ::Test::equals [dict get $::Test::rows SN1 currentCounter] 11
    set sql [lsearch -inline -glob $::Test::queries {*unit IN*}]
    ::Test::assert {[string first "'PANEL'" $sql] >= 0 && [string first "'SN1'" $sql] >= 0}
}
::Test::run ambiguous-panel {
    set ::Test::children {SN2}
    dict set ::Test::rows SN2 [::Test::record SN2]
    ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 0
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
    ::Test::equals $::Test::updateAttempts 0
}
::Test::run missing-master {
    set ::Test::rows {}
    ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 0
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
}
::Test::run unarchive-clears-error {
    set ::Test::find 0
    ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 1
    ::Test::equals $::MasterCheck::error {}
    ::Test::equals $error {}
}
::Test::run fis-exception {
    set ::Test::fisThrow 1
    ::Test::equals [::MasterCheck::BREQ SN1 SMT CON01] 0
    ::Test::assert {[string match {*FIS unavailable*} $error]}
    ::Test::checkCleanup
}
::Test::run not-golden {
    set ::Test::golden NORMAL
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
    ::Test::equals $::Test::updateAttempts 0
}
::Test::run invalid-master-status {
    dict set ::Test::rows SN1 status ERROR
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
    ::Test::equals $::Test::updateAttempts 0
    ::Test::assert {[string match {*Invalid master status*} $error]}
}
::Test::run deadlock-retry {
    set ::Test::failures {1213 1205}
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 1
    ::Test::equals $::Test::updateAttempts 3
    ::Test::equals [dict get $::Test::rows SN1 currentCounter] 11
    ::Test::equals $::Test::committed 1
    ::Test::checkCleanup
}
::Test::run exhausted-retries {
    set ::Test::failures {1213 1213 1213}
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
    ::Test::equals $::Test::updateAttempts 3
    ::Test::equals [dict get $::Test::rows SN1 currentCounter] 10
}
::Test::run wrong-result-db-failure {
    set ::Test::failures {1064}
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 FAIL] 0
    ::Test::equals [dict get $::Test::rows SN1 errorCounter] 0
    ::Test::assert {[string match {*SQL error*} $error]}
}
::Test::run affected-zero {
    set ::Test::affected 0
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
    ::Test::equals $::Test::committed 0
}
::Test::run uncertain-commit {
    set ::Test::failures {commit}
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
    ::Test::equals $::Test::updateAttempts 1
    ::Test::assert {[string match {*COMMIT outcome uncertain*} $error]}
}
::Test::run notify-once {
    dict set ::Test::rows SN1 currentCounter 949
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 1
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON02 PASS] 1
    ::Test::equals [llength $::Test::mails] 1
}
::Test::run short-limit-notification {
    dict set ::Test::rows SN1 maxCounter 50
    dict set ::Test::rows SN1 currentCounter 0
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 1
    ::Test::equals [llength $::Test::mails] 1
}
::Test::run mail-error-does-not-fail-test {
    dict set ::Test::rows SN1 currentCounter 949
    set ::Test::mailThrow 1
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 1
    ::Test::equals [dict get $::Test::rows SN1 currentCounter] 950
    ::Test::equals [llength $::Test::mails] 1
    ::Test::assert {[lsearch -glob $::Test::logs {*notification failed*}] >= 0}
}
::Test::run no-recipient {
    dict set ::Test::rows SN1 currentCounter 949
    set ::Test::recipients {}
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 1
    ::Test::assert {[lsearch -glob $::Test::logs {*No recipient*}] >= 0}
}
::Test::run notification-after-retry {
    dict set ::Test::rows SN1 currentCounter 949
    set ::Test::failures {1213}
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 1
    ::Test::equals [dict get $::Test::rows SN1 currentCounter] 950
    ::Test::equals [llength $::Test::mails] 1
}
::Test::run explicit-mail-failure {
    dict set ::Test::rows SN1 currentCounter 949
    set ::Test::mailReturn 0
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 1
    ::Test::assert {[lsearch -glob $::Test::logs {*returned failure*}] >= 0}
}
::Test::run quote-and-html-escape {
    set sn {SN'<&"}
    set ::Test::rows [dict create $sn [::Test::record $sn]]
    dict set ::Test::rows $sn currentCounter 949
    ::Test::equals [::MasterCheck::BCMP $sn SMT CON01 PASS] 1
    ::Test::equals [dict get $::Test::rows $sn currentCounter] 950
    ::Test::assert {[string first {&#39;&lt;&amp;&quot;} [lindex $::Test::mails 0 2]] >= 0}
}
::Test::run result-order {
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 FAIL] 0
    ::Test::assert {[file exists [::Test::lockPath]]}
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 1
    ::Test::assert {![file exists [::Test::lockPath]]}
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 FAIL] 0
    ::Test::assert {[file exists [::Test::lockPath]]}
}
foreach station {../CON01 /CON01 {CON/01} {CON\01} {CON 01}} {
    ::Test::run "invalid-station-$station" {
        ::Test::equals [::MasterCheck::BREQ SN1 SMT $station] 0
        ::Test::equals $::Test::handles 0
    }
}
::Test::run file-locks-without-database {
    set ::Test::connectThrow 1
    unset ::param(host)
    ::Test::equals [::MasterCheck::LockStationMaster CON01] 1
    ::Test::assert {[file exists [::Test::lockPath]]}
    ::Test::equals [::MasterCheck::UnlockStationMaster CON01] 1
    ::Test::assert {![file exists [::Test::lockPath]]}
    ::Test::equals [::MasterCheck::UnlockStationMaster CON01] 1
    ::Test::equals $::Test::handles 0
    ::Test::equals $::Test::queries {}
}
::Test::run connection-failure-keeps-file {
    ::MasterCheck::LockStationMaster CON01
    set ::Test::connectThrow 1
    ::Test::equals [::MasterCheck::BCMP SN1 SMT CON01 PASS] 0
    ::Test::assert {[file exists [::Test::lockPath]]}
}
::Test::run existing-file-not-truncated {
    set path [::Test::lockPath]
    set fd [open $path w]
    puts -nonewline $fd existing
    close $fd
    file mtime $path 1700000000
    ::Test::equals [::MasterCheck::LockStationMaster CON01] 1
    set fd [open $path r]
    ::Test::equals [read $fd] existing
    close $fd
    ::Test::equals [file mtime $path] 1700000000
}
::Test::run directory-not-deleted {
    file mkdir [::Test::lockPath]
    ::Test::equals [::MasterCheck::UnlockStationMaster CON01] 0
    ::Test::assert {[file isdirectory [::Test::lockPath]]}
}
if {$::tcl_platform(platform) eq "windows"} {
    ::Test::run symlink-rejected {
        set ::Test::fakeSymlink 1
        ::Test::equals [::MasterCheck::UnlockStationMaster CON01] 0
        set ::Test::fakeSymlink 0
    }
    ::Test::run file-attributes-failure {
        set ::Test::attributeFailure 1
        ::Test::equals [::MasterCheck::LockStationMaster CON01] 0
        set ::Test::attributeFailure 0
        ::Test::checkCleanup
    }
} else {
    ::Test::run symlink-rejected {
        set target [file join $::Test::directory target]
        close [open $target w]
        file link -symbolic [::Test::lockPath] $target
        ::Test::equals [::MasterCheck::UnlockStationMaster CON01] 0
        ::Test::assert {[file exists $target]}
    }
}

proc ::Test::stationReply {operation status} {
    global param
    array set value [list id SN1 process SMT station CON01 status $status]
    set boardID $value(id)
    set process $value(process)
    set station $value(station)
    set error stale

    if {$operation eq "BCMP"} {
        if {![MasterCheck::BCMP $value(id) $value(process) $value(station) $value(status)]} {
            set param(reply) "BACK|id=$value(id)|status=$param(fStat)|msg=$error"
            return 0
        }
    } else {
        if {![MasterCheck::BREQ $boardID $process $station]} {
            set param(reply) "BCNF|id=$boardID|status=$param(fStat)|msg=$error"
            return 0
        }
    }
    ::Test::equals $error {}
    return 1
}
::Test::run caller-bcmp-reply {
    set ::param(fStat) FAIL
    ::Test::equals [::Test::stationReply BCMP FAIL] 0
    ::Test::assert {[string match "BACK|id=SN1|status=FAIL|msg=Wrong status*" $::param(reply)]}
    ::Test::equals [::Test::stationReply BCMP PASS] 1
}
::Test::run caller-breq-reply {
    set ::param(fStat) FAIL
    dict set ::Test::rows SN1 isactive 0
    ::Test::equals [::Test::stationReply BREQ PASS] 0
    ::Test::assert {[string match "BCNF|id=SN1|status=FAIL|msg=*inactive*" $::param(reply)]}
    dict set ::Test::rows SN1 isactive 1
    ::Test::equals [::Test::stationReply BREQ PASS] 1
    ::Test::equals $::param(pType) GOOD
}

# Fixture for the EI boundary shown in the supplied station log. The production
# EI handler is not in this repository; ordinary-board gating is emulated here.
proc ::Test::eiReply {message} {
    set parts [split $message |]
    set operation [lindex $parts 0]
    foreach field [lrange $parts 1 end] {
        set separator [string first = $field]
        set value([string range $field 0 [expr {$separator - 1}]]) [string range $field [expr {$separator + 1}] end]
    }
    set replyType [expr {$operation eq "BREQ" ? "BCNF" : "BACK"}]
    set lockPath [file join $::Test::directory "$value(station)_MASTER"]
    if {![dict exists $::Test::rows $value(id)]} {
        if {[file exists $lockPath]} {
            return "$replyType|id=$value(id)|status=FAIL|msg=Station blocked, master check required"
        }
        return "$replyType|id=$value(id)|status=PASS"
    }
    if {$operation eq "BREQ"} {
        set accepted [::MasterCheck::BREQ $value(id) $value(process) $value(station)]
    } else {
        set accepted [::MasterCheck::BCMP $value(id) $value(process) $value(station) $value(status)]
    }
    if {!$accepted} {
        return "$replyType|id=$value(id)|status=FAIL|msg=$error"
    }
    return "$replyType|id=$value(id)|status=PASS"
}
::Test::run ei-real-log-bad-master-recovery {
    set master [::Test::record 1B002Q1 SMT_SPI]
    dict set master status BAD
    set ::Test::rows [dict create 1B002Q1 $master]
    set station SMT_L8_SPI1
    set lockPath [file join $::Test::directory ${station}_MASTER]

    ::Test::equals [::Test::eiReply {BCMP|id=1B002Q1|process=SMT_SPI|station=SMT_L8_SPI1|status=PASS|result=1,P,0,94.81966,129.9039|software=42044644B_SM2_BOT}] \
        {BACK|id=1B002Q1|status=FAIL|msg=Wrong status (PASS != FAIL); station 'SMT_L8_SPI1' blocked}
    ::Test::assert {[file exists $lockPath]}
    ::Test::equals [dict get $::Test::rows 1B002Q1 currentCounter] 10
    ::Test::equals [dict get $::Test::rows 1B002Q1 errorCounter] 1
    ::Test::equals [dict get $::Test::rows 1B002Q1 globalCounter] 11
    set afterWrongResult $::Test::rows

    ::Test::equals [::Test::eiReply {BREQ|id=1B002Q1|process=SMT_SPI|station=SMT_L8_SPI1|software=42044644B_SM2_BOT}] \
        {BCNF|id=1B002Q1|status=PASS}
    ::Test::equals $::Test::rows $afterWrongResult
    ::Test::equals $::param(pType) BAD
    ::Test::assert {[file exists $lockPath]}

    ::Test::equals [::Test::eiReply {BREQ|id=42044644C841RR2611502CC010TEST|process=SMT_SPI|station=SMT_L8_SPI1|software=42044644B_SM2_BOT}] \
        {BCNF|id=42044644C841RR2611502CC010TEST|status=FAIL|msg=Station blocked, master check required}
    ::Test::equals $::Test::rows $afterWrongResult

    ::Test::equals [::Test::eiReply {BCMP|id=1B002Q1|process=SMT_SPI|station=SMT_L8_SPI1|status=FAIL|result=1,P,0,94.81966,129.9039|software=42044644B_SM2_BOT}] \
        {BACK|id=1B002Q1|status=PASS}
    ::Test::assert {![file exists $lockPath]}
    ::Test::equals [dict get $::Test::rows 1B002Q1 currentCounter] 11
    ::Test::equals [dict get $::Test::rows 1B002Q1 errorCounter] 1
    ::Test::equals [dict get $::Test::rows 1B002Q1 globalCounter] 12
    set afterCorrectResult $::Test::rows

    ::Test::equals [::Test::eiReply {BREQ|id=42044644C841RR2611502CC010TEST|process=SMT_SPI|station=SMT_L8_SPI1|software=42044644B_SM2_BOT}] \
        {BCNF|id=42044644C841RR2611502CC010TEST|status=PASS}
    ::Test::equals $::Test::rows $afterCorrectResult
    ::Test::equals $::Test::updateAttempts 2
    ::Test::equals $::Test::committed 2
    ::Test::checkCleanup
}

puts "MasterCheck tests: $::Test::passed passed, $::Test::failed failed"
foreach path [glob -nocomplain -directory $::Test::directory *] { file delete $path }
file delete $::Test::directory
set ::MasterCheckTestFailures $::Test::failed
if {[info exists ::argv0] && [file normalize $::argv0] eq [file normalize [info script]]} {
    exit [expr {$::Test::failed ? 1 : 0}]
}
