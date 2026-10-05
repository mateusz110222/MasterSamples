# Run on Tcl 8.5.7: tclsh tests/MasterCheck85.test.tcl
# On 8.6, disable try to detect accidental dependencies on that command.
package require Tcl 8.5.7
set suiteDir [file dirname [file normalize [info script]]]
set ::env(MASTERCHECK_TEST_MODULE) [file normalize [file join $suiteDir .. MasterCheck85.tcl]]
set hadTry [expr {[llength [info commands ::try]] > 0}]
if {$hadTry} {
    rename ::try ::disabledTryForMasterCheck85
}
set code [catch {
    source [file join $suiteDir MasterCheck.test.tcl]
} message options]
if {$hadTry} {
    rename ::disabledTryForMasterCheck85 ::try
}
unset ::env(MASTERCHECK_TEST_MODULE)
if {$code != 0} {
    return -options $options $message
}
if {[info exists ::argv0] && [file normalize $::argv0] eq [file normalize [info script]]} {
    exit [expr {$::MasterCheckTestFailures ? 1 : 0}]
}
