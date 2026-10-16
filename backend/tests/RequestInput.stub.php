<?php
// Use the real JSON/form accessors; replace only logging in endpoint contract tests.
$inputLibrary = file_get_contents(dirname(__FILE__) . '/../FIS2/BuildingBlocks.php');
preg_match_all('/    public static function GetArray(?:String|Int|Bool)\([^)]*\)[^{]*\{.*?^    \}/ms', $inputLibrary, $inputMethods);
if (count($inputMethods[0]) !== 3) {
    throw new RuntimeException('Missing Lib request accessors');
}
eval('class Lib {' . implode("\n", $inputMethods[0]) . '
    static function ShowDebug($file, $message) {}
    static function ShowError($file, $message) {}
}');
unset($inputLibrary, $inputMethods);
