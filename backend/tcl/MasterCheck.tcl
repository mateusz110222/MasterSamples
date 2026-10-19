################################################################################
#
# @(#)
# @(#) Title: Master Unit Check Building Block   Version: 1.3.0
# @(#)
# @(#) Description: Collection of utilities for Master Unit verification,
# @(#)              counting cycles, and station locking via MySQL 8.
# @(#)
# @(#) Usage: package require MasterCheck
# @(#)        MasterCheck::BREQ $unit $process $station
# @(#)        MasterCheck::BCMP $unit $process $station $status
# @(#)
#
#      Revisions:
#      09/11/2026 Mateusz Zieliński - init release
#
################################################################################


package require Tcl 8.6

namespace eval ::MasterCheck {
    namespace upvar :: param param
    variable error ""
    set param(dbName) "masterSample"

    set initCode [catch {
        uplevel #0 [list source [file join $::_sysvarc(FISVW_DB) config.cfg]]
    } err]
    if {$initCode} {
        set error "MasterCheck INIT ERROR: Failed to load config.cfg. Reason: $err"
        set ::error $error
        ::Lib::ShowError $error
        error $error
    }

    variable blockedDir   /fis/mantis/data/blocked_machines
    variable blockedGroup fis

    proc _StationPath {station} {
        variable blockedDir

        set dir $blockedDir
        if {![file isdirectory $dir] || [file type $dir] eq "link" || ![file writable $dir]} {
            error "Lock directory is missing, unsafe or not writable: $dir"
        }
        return [file join $dir "${station}_MASTER"]
    }

    proc _ExistingLock {path} {
        if {[catch {file lstat $path attributes} message options]} {
            if {[lrange [dict get $options -errorcode] 0 1] eq {POSIX ENOENT}} {
                return 0
            }
            return -options $options $message
        }
        if {$attributes(type) ne "file"} {
            error "Lock path is not a regular file: $path"
        }
        return 1
    }

    proc LockStationMaster {station} {
        variable error
        variable blockedGroup
        set error ""

        try {
            set path [_StationPath $station]
            if {[_ExistingLock $path]} {
                return 1
            }

            if {[catch {open $path {WRONLY CREAT EXCL} 0664} fd options]} {
                set errCode [lrange [dict get $options -errorcode] 0 1]
                if {$errCode eq {POSIX EEXIST} && [_ExistingLock $path]} {
                    return 1
                }
                return -options $options $fd
            }

            try {
                file attributes $path -group $blockedGroup -permissions 0664
                close $fd
            } on error {message options} {
                catch {close $fd}
                catch {file delete $path}
                return -options $options $message
            }
            ::Lib::ShowDebug "Locked station: $station due to master check failure"
            return 1
        } on error {message options} {
            set error "Cannot lock station '$station': $message"
            ::Lib::ShowError $error
            return 0
        }
    }

    proc UnlockStationMaster {station} {
        variable error
        set error ""

        if {[catch {
            set path [_StationPath $station]
            if {[_ExistingLock $path]} {
                file delete $path
                ::Lib::ShowDebug "Unlocked station: $station after succesful master check"
            }
        } message]} {
            set error "Cannot unlock station '$station': $message"
            ::Lib::ShowError $error
            return 0
        }

        return 1
    }

    proc _Query {command db sql args} {
        set ::mysqlstatus(code) 0
        if {[catch {$command $db $sql {*}$args} result options]} {
            if {[info exists ::mysqlstatus(code)] && $::mysqlstatus(code) != 0} {
                dict set options -errorcode [list MASTERCHECK MYSQL $::mysqlstatus(code)]
            }
            return -options $options $result
        }
        return $result
    }

    proc _Exec {db sql} {
        return [_Query ::mysql::exec $db $sql]
    }

    proc _Select {db sql} {
        return [_Query ::mysql::sel $db $sql -list]
    }

    proc _Quote {db value} {
        return "'[::mysql::escape $db $value]'"
    }

    proc _Connect {} {
        global param
        variable dbName

        set db [::mysql::connect \
            -host     $param(host) \
            -user     $param(user) \
            -password $param(password) \
            -port     $param(port) \
            -db       $param(dbName) \
            -encoding utf-8]

        try {
            _Exec $db {SET NAMES utf8mb4}
            _Exec $db {SET SESSION innodb_lock_wait_timeout = 5}
        } on error {message options} {
            catch {::mysql::close $db}
            return -options $options $message
        }
        return $db
    }

    proc _EnsureFisUnit {unit {allowMissing 0}} {
        if {![::Unit::Find $unit]} {
            ::Lib::ShowDebug "Unit '$unit' not found; attempting to unarchive"
            if {![::Archive::GetAll $unit]} {
                if {$allowMissing} {
                    ::Lib::ShowDebug "MasterCheck: unit='$unit' absent from FIS and archive; treating as production"
                    return 0
                }
                error "Cannot find or unarchive unit '$unit'"
            }
            if {![::Archive::Unarchive $unit]} {
                error "Cannot unarchive unit '$unit'"
            }
            if {![::Unit::Find $unit]} {
                error "Unit '$unit' is still unavailable after unarchive"
            }
            ::Lib::ShowDebug "MasterCheck: unit='$unit' restored from archive"
        }
        return 1
    }

    proc _Candidates {unit process} {
        if {[string trim $unit] eq "" || [string trim $process] eq ""} {
            error "Unit and process are required"
        }
        _EnsureFisUnit $unit
        set candidates [list $unit]

        if {[regexp -nocase {SMT|XRAY} $process]} {
            if {[::Unit::GetParent $unit]} {
                set parent $::Unit::parent
                _EnsureFisUnit $parent
                lappend candidates $parent
                if {[::Unit::GetChildren $parent]} {
                    lappend candidates {*}$::Unit::children
                }
            } elseif {[::Unit::GetChildren $unit]} {
                lappend candidates {*}$::Unit::children
            }
        }
        return [lsort -unique $candidates]
    }

    proc _MatchesProcess {stored process} {
        foreach item [split $stored ,] {
            if {[string trim $item] eq $process} {
                return 1
            }
        }
        return 0
    }

    proc _Rows {db predicate {forUpdate 0}} {
        set sql "SELECT unit, process, status, isactive,
                        currentCounter, maxCounter,
                        errorCounter, errorMaxCounter, globalCounter
                   FROM masterUnits
                  WHERE $predicate"

        if {$forUpdate} {
            append sql " FOR UPDATE"
        }

        set result {}
        set fields {
            unit process status isactive
            currentCounter maxCounter
            errorCounter errorMaxCounter globalCounter
        }

        foreach row [_Select $db $sql] {
            if {[llength $row] != 9} {
                error "Invalid master record shape"
            }
            array unset record
            foreach key $fields value $row {
                if {[llength [info commands ::mysql::isnull]] && [::mysql::isnull $value]} {
                    error "NULL master field: $key"
                }
                set record($key) $value
            }
            lappend result [array get record]
        }
        return $result
    }

    proc _Resolve {db candidates process} {
        set quoted {}
        foreach unit $candidates {
            lappend quoted [_Quote $db $unit]
        }

        set matches {}
        foreach row [_Rows $db "unit IN ([join $quoted ,])"] {
            array unset record
            array set record $row
            if {[_MatchesProcess $record(process) $process]} {
                lappend matches [array get record]
            }
        }

        if {[llength $matches] != 1} {
            error "Expected one master for '$process'; found [llength $matches]"
        }
        return [lindex $matches 0]
    }

    proc _Validate {recordName process} {
        upvar 1 $recordName record

        if {$record(isactive) ne "1"} {
            error "Master is inactive or blocked"
        }
        if {![_MatchesProcess $record(process) $process]} {
            error "Master process changed"
        }

        set expected $record(status)
        if {$expected ni {GOOD BAD}} {
            error "Invalid master status: $expected"
        }

        set counters {currentCounter errorCounter globalCounter maxCounter errorMaxCounter}
        foreach key $counters {
            set value   $record($key)
            set minimum [expr {$key in {maxCounter errorMaxCounter} ? 1 : 0}]

            if {![string is wideinteger -strict $value] || $value < $minimum || $value > 2147483647} {
                error "Invalid master counter: $key"
            }
        }

        if {$record(currentCounter) >= $record(maxCounter)} {
            error "Master exceeded max cycles ($record(currentCounter)/$record(maxCounter)). Station blocked."
        }
        if {$record(errorCounter) >= $record(errorMaxCounter)} {
            error "Master exceeded max error cycles ($record(errorCounter)/$record(errorMaxCounter)). Station blocked."
        }

        if {$expected eq "GOOD"} {
            return "PASS"
        }
        return "FAIL"
    }

    proc _Golden {unit} {
        _EnsureFisUnit $unit
        if {![::Unit::GetStatus $unit]} {
            set detail "unit '$unit'"
            if {[info exists ::Unit::error]} {
                set detail $::Unit::error
            }
            error "Cannot get unit status: $detail"
        }
        if {![info exists ::Unit::uk3] || $::Unit::uk3 ne "GOLDEN"} {
            error "Selected unit '$unit' is not GOLDEN"
        }
    }

    proc _Record {db unit process status} {
        global value
        for {set attempt 0} {$attempt < 3} {incr attempt} {
            set inTransaction 0
            set committing    0

            try {
                _Exec $db {START TRANSACTION}
                set inTransaction 1

                set rows {}
                foreach row [_Rows $db "unit = [_Quote $db $unit]" 1] {
                    if {[_MatchesProcess [dict get $row process] $process]} {
                        lappend rows $row
                    }
                }
                if {[llength $rows] != 1} {
                    error "Expected one master for result recording; found [llength $rows]"
                }

                array set record [lindex $rows 0]
                set expected [_Validate record $process]

                if {[info exists value(TestType)] && [string trim $value(TestType)] ne ""} {
                    set testType [string toupper [string trim $value(TestType)]]

                    if {$testType eq "NOK" && $expected eq "FAIL"} {
                        ::Lib::ShowDebug "Master TestType=NOK: unit='$unit', process='$process'; expected FAIL changed to PASS"
                        set expected "PASS"
                    }
                }

                set matched [expr {$status eq $expected}]
                if {$status eq $expected} {
                    set counter currentCounter
                    set changes "currentCounter = currentCounter + 1"
                } else {
                    set counter errorCounter
                    set changes "errorCounter = errorCounter + 1"
                }

                if {$record(globalCounter) == 2147483647 ||
                    $record($counter)       == 2147483647} {
                    error "Master counter overflow"
                }

                set sql "UPDATE masterUnits
                            SET $changes,
                                globalCounter = globalCounter + 1
                          WHERE unit = [_Quote $db $unit]
                            AND isactive = 1
                            AND currentCounter < maxCounter
                            AND errorCounter < errorMaxCounter
                            AND globalCounter < 2147483647
                            AND process = [_Quote $db $record(process)]
                            AND status = [_Quote $db $record(status)]"

                set affected [_Exec $db $sql]
                if {$affected != 1} {
                    error "Result was not recorded: affected rows = $affected"
                }

                set committing 1
                _Exec $db COMMIT
                set inTransaction 0

                set before    $record(currentCounter)
                set warnOffset [expr {min(50, max(1, int($record(maxCounter) * 0.2)))}]
                set threshold [expr {max(1, $record(maxCounter) - $warnOffset)}]
                set after     [expr {$before + $matched}]
                set notify    [expr {$matched && $before < $threshold && $after >= $threshold}]

                array set result [list \
                    matched  $matched \
                    expected $expected \
                    unit     $unit \
                    after    $after \
                    max      $record(maxCounter) \
                    notify   $notify]
                return [array get result]

            } on error {message options} {
                set code       [dict get $options -errorcode]
                set rolledBack 1

                if {$inTransaction && [catch {_Exec $db ROLLBACK} rollbackError]} {
                    set rolledBack 0
                    ::Lib::ShowError "Rollback failed: $rollbackError"
                }

                set isLockConflict [expr {
                    !$committing && $rolledBack &&
                    [lrange $code 0 1] eq {MASTERCHECK MYSQL} &&
                    [lindex $code 2] in {1205 1213} && $attempt < 2
                }]

                if {$isLockConflict} {
                    ::Lib::ShowDebug "Retrying master transaction: unit='$unit', process='$process', mysqlCode=[lindex $code 2], nextAttempt=[expr {$attempt + 2}]/3"
                    after [expr {100 * ($attempt + 1)}]
                    continue
                }

                if {$committing} {
                    append message " (COMMIT outcome uncertain; do not automatically repeat BCMP)"
                }
                return -options $options $message
            }
        }
    }

    proc _Notify {db process resultName} {
        upvar 1 $resultName result

        if {!$result(notify)} {
            return
        }

        try {
            set rows [_Select $db "SELECT mail FROM engineers WHERE process = [_Quote $db $process]"]
            set mail [string trim [lindex $rows 0 0]]
            if {$mail eq ""} {
                error "No recipient configured for process '$process'"
            }

            set unit    $result(unit)
            set html    [string map [list & {&amp;} < {&lt;} > {&gt;} \" {&quot;} ' {&#39;}] $unit]
            set subject "\[FIS\] $unit will soon expire!"
            set body    "Master $html zbliza sie do limitu ($result(after)/$result(max))"

            set sent [::Mail::SendHTML $mail $subject $body]
            if {$sent eq "0"} {
                error "Mail::SendHTML returned failure"
            }
        } on error {message options} {
            ::Lib::ShowError "Master notification failed (single attempt): $message"
        }
    }

    proc _CheckStationName {station} {
        if {[string length $station] > 100 || ![regexp {^[A-Za-z0-9][A-Za-z0-9_.-]*$} $station]} {
            error "Invalid station name"
        }
    }

    proc _BlockingEnabled {db station} {
        global param
        _CheckStationName $station
        if {[info exists param(masterCheckFis)]} {
            set fis [string toupper [string trim $param(masterCheckFis)]]
        } elseif {[regexp -nocase {^plblofis([12])(?:\.|$)} [info hostname] unused number]} {
            set fis "FIS$number"
        } else {
            error "Set param(masterCheckFis) to FIS1 or FIS2"
        }
        if {$fis ni {FIS1 FIS2}} {
            error "Invalid param(masterCheckFis): expected FIS1 or FIS2"
        }
        # Indexed literal prefix candidates; underscore is never a SQL wildcard.
        set prefixes {}
        for {set length 1} {$length <= [string length $station]} {incr length} {
            lappend prefixes [_Quote $db [string range $station 0 [expr {$length - 1}]]]
        }
        set rows [_Select $db "SELECT mode, station, disabled FROM stationBlockingRules
            WHERE FIS = [_Quote $db $fis] AND
                ((mode = 'fis' AND station = 'ALL') OR
                 (mode = 'single' AND station = [_Quote $db $station]) OR
                 (mode = 'prefix' AND station IN ([join $prefixes ,])))"]
        set enabled [_RuleEnabled $rows $station]
        ::Lib::ShowDebug "MasterCheck blocking: fis='$fis', station='$station', host='$param(host)', port='$param(port)', db='$param(dbName)', enabled=$enabled, rules=$rows"
        return $enabled
    }

    proc _RuleEnabled {rows station} {
        set selected -1
        set enabled 0
        set seen {}
        foreach row $rows {
            if {[llength $row] != 3} { error "Invalid station blocking rule" }
            lassign $row mode selector disabled
            if {$mode ni {single prefix fis} || $disabled ni {0 1} ||
                ![regexp {^[A-Za-z0-9][A-Za-z0-9_.-]*$} $selector] || [string length $selector] > 100} {
                error "Invalid station blocking rule"
            }
            set identity [list $mode $selector]
            if {$identity in $seen} { error "Duplicate station blocking rule" }
            lappend seen $identity
            if {$mode eq "fis"} {
                if {$selector ne "ALL"} { error "Invalid FIS blocking override" }
                set priority 102
            } elseif {$mode eq "single"} {
                if {$selector ne $station} { continue }
                set priority 101
            } else {
                if {[string first $selector $station] != 0} { continue }
                set priority [string length $selector]
            }
            if {$priority > $selected} {
                set selected $priority
                set enabled [expr {!$disabled}]
            }
        }
        return $enabled
    }

    proc _Run {operation unit process station {status ""}} {
        variable error
        variable blockedDir
        global param
        set error ""
        set db ""
        set blockingEnabled 0
        set isMaster 0

        try {
            _CheckStationName $station
            set process [string trim $process]

            if {[_EnsureFisUnit $unit 1]} {
                if {![::Unit::GetStatus $unit]} {
                    error "Cannot get unit status for '$unit'"
                }
                set uk3 [expr {[info exists ::Unit::uk3] ? [string trim $::Unit::uk3] : ""}]
                set isMaster [expr {$uk3 eq "GOLDEN"}]
            }

            if {!$isMaster} {
                set lockCandidate [file join $blockedDir "${station}_MASTER"]
                if {[catch {_ExistingLock $lockCandidate} hasLock] || !$hasLock} {
                    if {![info exists hasLock] || $hasLock eq "0"} {
                        return 1
                    }
                }
            }

            set db [_Connect]
            set blockingEnabled [_BlockingEnabled $db $station]
            if {$blockingEnabled} { _StationPath $station }

            ::Lib::ShowDebug "MasterCheck start: operation=$operation, unit='$unit', process='$process', station='$station', status='$status', isMaster=$isMaster, blocking=$blockingEnabled"

            if {!$isMaster} {
                if {$blockingEnabled && [_ExistingLock [_StationPath $station]]} {
                    set error "Station blocked, master check required"
                    ::Lib::ShowError "$error (operation=$operation, unit='$unit', process='$process', station='$station')"
                    return 0
                }
                ::Lib::ShowDebug "MasterCheck production allowed: operation=$operation, unit='$unit', station='$station', blocking=$blockingEnabled; master counters unchanged"
                return 1
            }

            if {$operation eq "BCMP"} {
                set status [string toupper [string trim $status]]
                if {$status ni {PASS FAIL}} {
                    error "Invalid test result: expected PASS or FAIL"
                }
            }

            array set record [_Resolve $db [_Candidates $unit $process] $process]
            set resolved $record(unit)
            _Golden $resolved
            _Validate record $process

            if {$operation eq "BREQ"} {
                set param(pType) $record(status)
                return 1
            }

            if {$operation ne "BCMP"} {
                error "Unknown MasterCheck operation: $operation"
            }

            array set result [_Record $db $resolved $process $status]

            _Notify $db $process result

            if {!$result(matched)} {
                set message "Wrong status ($status != $result(expected))"
                if {$blockingEnabled} {
                    if {[LockStationMaster $station]} {
                        append message "; station '$station' blocked"
                    } else {
                        append message "; station block failed: $error"
                    }
                }
                set error $message
                ::Lib::ShowError "$error (operation=$operation, unit='$unit', process='$process', station='$station')"
                return 0
            }

            if {$blockingEnabled && ![UnlockStationMaster $station]} {
                set error "Master result committed; $error (do not automatically repeat BCMP)"
                ::Lib::ShowError "$error (operation=$operation, unit='$unit', process='$process', station='$station')"
                return 0
            }

            return 1

        } on error {message options} {
            if {!$blockingEnabled} { set message [string map {". Station blocked." "."} $message] }
            if {$isMaster && $db ne "" && $blockingEnabled && ![LockStationMaster $station]} {
                append message "; station block failed: $error"
            }
            set error "MasterCheck $operation failed: $message"
            ::Lib::ShowError "$error (operation=$operation, unit='$unit', process='$process', station='$station')"
            return 0
        } finally {
            if {$db ne "" && [catch {::mysql::close $db} closeError]} {
                ::Lib::ShowError "DB close failed: $closeError"
            }
        }
    }

    proc BREQ {unit process station} {
        set result [_Run BREQ $unit $process $station]
        variable error
        upvar 1 error callerError
        set callerError $error
        return $result
    }

    proc BCMP {unit process station status} {
        set result [_Run BCMP $unit $process $station $status]
        variable error
        upvar 1 error callerError
        set callerError $error
        return $result
    }
    proc SafeUpdate {db sql} {
        set retries 3

        for {set i 0} {$i < $retries} {incr i} {
            if {![catch {set affected [::mysql::exec $db $sql]} err]} {
                return $affected
            }

            if {
                [string match -nocase "*Lock wait timeout*" $err] ||
                [string match -nocase "*Deadlock*" $err] ||
                [string match -nocase "*try restarting transaction*" $err]
            } {
                ::Lib::ShowDebug "DB Lock/Deadlock encountered, retrying... ([expr {$i+1}]/$retries)" 3
                if {$i < ($retries - 1)} { after 100 }
                continue
            } else {
                ::Lib::ShowError "SQL Update Error: $err \nQuery: $sql"
                return -1
            }
        }

        ::Lib::ShowError "Update failed after $retries retries."
        return -1
    }
}

package provide MasterCheck 1.3.0
