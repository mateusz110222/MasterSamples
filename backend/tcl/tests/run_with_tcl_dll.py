"""Run the Tcl regression suite using an existing Tcl 8.6 DLL on Windows.

No interpreter installation or replacement of the bundled runtime is needed.
Usage: python run_with_tcl_dll.py PATH_TO_TCL86_DLL [--check-file PATH | --suite PATH]
"""
import ctypes
import os
from pathlib import Path
import sys
import tempfile

dll = Path(sys.argv[1]).resolve()
directory_handle = os.add_dll_directory(str(dll.parent))
lib = ctypes.CDLL(str(dll))
lib.Tcl_CreateInterp.restype = ctypes.c_void_p
lib.Tcl_Eval.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
lib.Tcl_Eval.restype = ctypes.c_int
lib.Tcl_GetStringResult.argtypes = [ctypes.c_void_p]
lib.Tcl_GetStringResult.restype = ctypes.c_char_p
lib.Tcl_DeleteInterp.argtypes = [ctypes.c_void_p]
lib.Tcl_Init.argtypes = [ctypes.c_void_p]
command_callback = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(ctypes.c_char_p))
lib.Tcl_CreateCommand.argtypes = [ctypes.c_void_p, ctypes.c_char_p, command_callback, ctypes.c_void_p, ctypes.c_void_p]
lib.Tcl_NewStringObj.argtypes = [ctypes.c_char_p, ctypes.c_int]
lib.Tcl_NewStringObj.restype = ctypes.c_void_p
lib.Tcl_SetObjResult.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
lib.Tcl_NewListObj.argtypes = [ctypes.c_int, ctypes.c_void_p]
lib.Tcl_NewListObj.restype = ctypes.c_void_p
lib.Tcl_ListObjAppendElement.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
interp = lib.Tcl_CreateInterp()

def evaluate(script):
    code = lib.Tcl_Eval(interp, script.encode("utf-8"))
    result = lib.Tcl_GetStringResult(interp).decode("utf-8", errors="replace")
    if code:
        lib.Tcl_Eval(interp, b"set ::errorInfo")
        raise RuntimeError(lib.Tcl_GetStringResult(interp).decode("utf-8", errors="replace"))
    return result

try:
    # Initialize encoding before invoking the Windows Tcl filesystem routines.
    evaluate("encoding system")
    evaluate("encoding system utf-8")
    evaluate("pwd")
    os.environ["TCL_LIBRARY"] = str(dll.parent.parent / "tcl" / "tcl8.6")
    if lib.Tcl_Init(interp):
        raise RuntimeError(lib.Tcl_GetStringResult(interp).decode("utf-8", errors="replace"))
    # Use Python's canonical paths for redirected Windows known folders in the
    # desktop sandbox. Tcl still performs the actual file I/O in the suite.
    @command_callback
    def normalize_path(_client, target, argc, argv):
        try:
            path = Path(argv[1].decode("utf-8")).resolve().as_posix().encode("utf-8")
            lib.Tcl_SetObjResult(target, lib.Tcl_NewStringObj(path, len(path)))
            return 0
        except Exception as error:
            message = str(error).encode("utf-8")
            lib.Tcl_SetObjResult(target, lib.Tcl_NewStringObj(message, len(message)))
            return 1
    lib.Tcl_CreateCommand(interp, b"::normalizeTestPath", normalize_path, None, None)
    evaluate('rename ::file ::nativeTestFile; proc ::file {cmd args} {if {$cmd eq "normalize"} {return [::normalizeTestPath [lindex $args 0]]}; return [uplevel 1 [list ::nativeTestFile $cmd {*}$args]]}')
    @command_callback
    def glob_paths(_client, target, argc, argv):
        args = [argv[i].decode("utf-8") for i in range(1, argc)]
        directory = Path(args[args.index("-directory") + 1])
        result = lib.Tcl_NewListObj(0, None)
        for entry in directory.glob(args[-1]):
            value = entry.as_posix().encode("utf-8")
            lib.Tcl_ListObjAppendElement(target, result, lib.Tcl_NewStringObj(value, len(value)))
        lib.Tcl_SetObjResult(target, result)
        return 0
    lib.Tcl_CreateCommand(interp, b"::glob", glob_paths, None, None)
    temporary = tempfile.TemporaryDirectory(prefix="mastercheck-tcl-")
    evaluate(f"set ::env(MASTERCHECK_TEST_TMPDIR) {{{Path(temporary.name).as_posix()}}}")
    if len(sys.argv) > 2 and sys.argv[2] == "--check-file":
        path = Path(sys.argv[3]).resolve().as_posix()
        complete = evaluate(f"set fd [open {{{path}}} r]; set text [read $fd]; close $fd; info complete $text")
        if complete != "1":
            raise RuntimeError("Incomplete Tcl script: " + path)
        print("Tcl syntax complete: " + path)
        failures = 0
    else:
        suite_path = Path(sys.argv[3]) if len(sys.argv) > 2 and sys.argv[2] == "--suite" else Path(__file__).with_name("MasterCheck.test.tcl")
        suite = suite_path.resolve().as_posix()
        evaluate(f"source {{{suite}}}")
        failures = int(evaluate("set ::MasterCheckTestFailures"))
finally:
    lib.Tcl_DeleteInterp(interp)
    directory_handle.close()
    if "temporary" in locals():
        temporary.cleanup()
sys.exit(1 if failures else 0)
