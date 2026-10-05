if {[package vsatisfies [package provide Tcl] 8.6]} {
    set masterCheckFile MasterCheck.tcl
} else {
    set masterCheckFile MasterCheck85.tcl
}
package ifneeded MasterCheck 1.3.0 [list source [file join $dir $masterCheckFile]]
unset masterCheckFile
