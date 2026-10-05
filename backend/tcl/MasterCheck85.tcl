# ==============================================================================
# MasterCheck 1.3.0 -- Tcl 8.5.7 / mysqltcl / FIS Building Blocks
# Uses the existing FIS system.cfg / config.cfg and global param settings.
# ==============================================================================

package require Tcl 8.5.7

namespace eval ::MasterCheck {
    namespace upvar :: param param

    # --------------------------------------------------------------------------
    # Inicjalizacja i Konfiguracja
    # --------------------------------------------------------------------------
    source [file join /fis mantis common config system system.cfg]

    upvar error error
    set error ""
    set param(dbName) "masterSample"

    if {[catch {
        set configFile [file join $_sysvarc(FISVW_DB) config.cfg]
        source $configFile
    } err]} {
        set error "MasterCheck INIT ERROR: Failed to load config.cfg. Reason: $err"
        ::Lib::ShowError $error
        return 0
    }

    variable blockedDir   /fis/mantis/data/blocked_machines
    variable blockedGroup fis

    # --------------------------------------------------------------------------
    # Zarządzanie Blokadami Stacji (Lock Files)
    # --------------------------------------------------------------------------

    proc _StationPath {station} {
        variable blockedDir

        if {[string length $station] > 100 ||
            ![regexp {^[A-Za-z0-9][A-Za-z0-9_.-]*$} $station]} {
            error "Invalid station name"
        }

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

        set code [catch {
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

            set attributeCode [catch {
                file attributes $path -group $blockedGroup -permissions 0664
            } attributeError attributeOptions]
            set closeCode [catch {close $fd} closeError closeOptions]
            if {$attributeCode != 0} {
                return -options $attributeOptions $attributeError
            }
            if {$closeCode != 0} {
                return -options $closeOptions $closeError
            }
            return 1
        } message options]

        if {$code == 1} {
            set error "Cannot lock station '$station': $message"
            ::Lib::ShowError $error
            return 0
        }
        return -options $options $message
    }

    proc UnlockStationMaster {station} {
        variable error
        set error ""

        if {[catch {
            set path [_StationPath $station]
            if {[_ExistingLock $path]} {
                file delete $path
            }
        } message]} {
            set error "Cannot unlock station '$station': $message"
            ::Lib::ShowError $error
            return 0
        }
        return 1
    }

    # --------------------------------------------------------------------------
    # Warstwa Bazy Danych (MySQL Helpers)
    # --------------------------------------------------------------------------

    proc _Query {command db sql args} {
        # Przechwycenie kodu błędu sterownika zanim rollback/close go zresetuje
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

        set db [::mysql::connect \
            -host     $param(host) \
            -user     $param(user) \
            -password $param(password) \
            -port     $param(port) \
            -db       $param(dbName) \
            -encoding utf-8]

        if {[catch {
            _Exec $db {SET NAMES utf8mb4}
            _Exec $db {SET SESSION innodb_lock_wait_timeout = 5}
        } message options]} {
            catch {::mysql::close $db}
            return -options $options $message
        }
        return $db
    }

    # --------------------------------------------------------------------------
    # Walidacja i Weryfikacja Jednostek FIS
    # --------------------------------------------------------------------------

    proc _EnsureFisUnit {unit} {
        if {![::Unit::Find $unit]} {
            if {![::Archive::GetAll $unit] || ![::Archive::Unarchive $unit]} {
                error "Cannot find or unarchive unit '$unit'"
            }
            if {![::Unit::Find $unit]} {
                error "Unit '$unit' is still unavailable after unarchive"
            }
        }
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

    # --------------------------------------------------------------------------
    # Zapis Wyniku i Powiadomienia
    # --------------------------------------------------------------------------

    proc _Record {db unit process status} {
        for {set attempt 0} {$attempt < 3} {incr attempt} {
            set inTransaction 0
            set committing    0

            set outcome [catch {
                _Exec $db {START TRANSACTION}
                set inTransaction 1

                set rows [_Rows $db "unit = [_Quote $db $unit]" 1]
                if {[llength $rows] != 1} {
                    error "Master disappeared before result recording"
                }

                array set record [lindex $rows 0]
                set expected [_Validate record $process]
                set matched [expr {$status eq $expected}]
                if {$status eq $expected} {
                    # GOOD/PASS or BAD/FAIL: count the confirmed master cycle.
                    set counter currentCounter
                    set changes "currentCounter = currentCounter + 1"
                } else {
                    # GOOD/FAIL or BAD/PASS: count the mismatched master result.
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
                set threshold [expr {max(1, $record(maxCounter) - 50)}]
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

            } message options]

            if {$outcome != 1} {
                return -options $options $message
            }

            # Capture the error before rollback can replace mysqlstatus.
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
                ::Lib::ShowDebug "Retrying master transaction after DB lock conflict"
                after [expr {100 * ($attempt + 1)}]
                continue
            }

            if {$committing} {
                append message " (COMMIT outcome uncertain; do not automatically repeat BCMP)"
            }
            return -options $options $message
        }
    }

    proc _Notify {db process resultName} {
        upvar 1 $resultName result

        if {!$result(notify)} {
            return
        }

        if {[catch {
            set rows [_Select $db "SELECT mail FROM engineers WHERE process = [_Quote $db $process]"]
            set mail [string trim [lindex $rows 0 0]]
            if {$mail eq ""} {
                error "No recipient configured for process '$process'"
            }

            set unit    $result(unit)
            set html    [string map {& &amp; < &lt; > &gt; {"} &quot; ' &#39;} $unit]
            set subject "\[FIS\] $unit will soon expire!"
            set body    "Master $html zbliza sie do limitu ($result(after)/$result(max))"

            set sent [::Mail::SendHTML $mail $subject $body]
            if {$sent eq "0"} {
                error "Mail::SendHTML returned failure"
            }
        } message options]} {
            ::Lib::ShowError "Master notification failed (single attempt): $message"
        }
    }

    # --------------------------------------------------------------------------
    # Główny Silnik Wykonawczy (Core Engine)
    # --------------------------------------------------------------------------

    proc _Run {operation unit process station {status ""}} {
        variable error
        global param
        set error ""
        set db ""

        set code [catch {
            _StationPath $station
            set db [_Connect]
            set process [string trim $process]

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

            # Błąd powiadomienia nie może wpływać na zatwierdzony wynik testu
            _Notify $db $process result

            if {!$result(matched)} {
                if {![LockStationMaster $station]} {
                    error $error
                }
                set error "Wrong status ($status != $result(expected)); station '$station' blocked"
                ::Lib::ShowError $error
                return 0
            }

            if {![UnlockStationMaster $station]} {
                error $error
            }

            ::Lib::ShowDebug "Unlocked station: $station after succesful master check"
            return 1

        } message options]

        if {$code == 1} {
            if {$db ne "" && ![LockStationMaster $station]} {
                append message "; station block failed: $error"
            }
            set error "MasterCheck $operation failed: $message"
            ::Lib::ShowError $error
            set message 0
        }

        # Close the connection for success, denial and every caught error.
        if {$db ne "" && [catch {::mysql::close $db} closeError]} {
            ::Lib::ShowError "DB close failed: $closeError"
        }

        if {$code == 1} {
            return 0
        }
        return -options $options $message
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
}

package provide MasterCheck 1.3.0
