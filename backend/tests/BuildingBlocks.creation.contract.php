<?php
// Executes the real BuildingBlocks classes and endpoint read helpers.
// Only MDB transport and external archive storage are replaced; response parsing is real.
// php backend/tests/BuildingBlocks.creation.contract.php
error_reporting(E_ALL & ~E_DEPRECATED);

function verifyCreation($condition, $message) {
    if (!$condition) throw new RuntimeException($message);
}

function replaceStaticBody($source, $class, $method, $body) {
    $classOffset = strpos($source, 'class ' . $class);
    $pattern = '/(?:public|private|protected)\s+static\s+function\s+' . preg_quote($method, '/') . '\s*\([^)]*\)\s*(?::\s*[?\w]+\s*)?\{/';
    verifyCreation(preg_match($pattern, $source, $match, PREG_OFFSET_CAPTURE, $classOffset), "Missing $class::$method");
    $open = $match[0][1] + strlen($match[0][0]) - 1;
    $offset = $open; $depth = 0;
    foreach (token_get_all('<?php ' . substr($source, $open)) as $token) {
        if (is_array($token) && $token[0] === T_OPEN_TAG) continue;
        $text = is_array($token) ? $token[1] : $token;
        if ($token === '{' || (is_array($token) && in_array($token[0], array(T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES)))) $depth++;
        if ($token === '}') {
            $depth--;
            if ($depth === 0) return substr($source, 0, $open + 1) . "\n$body\n    " . substr($source, $offset);
        }
        $offset += strlen($text);
    }
    throw new RuntimeException("Unterminated $class::$method");
}

if (!isset($argv[1])) {
    foreach (array('FIS1', 'FIS2') as $fis) {
        passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__) . ' ' . $fis, $exitCode);
        verifyCreation($exitCode === 0, "$fis real-library creation contract failed");
    }
    exit;
}

$fis = $argv[1];
$legacy = $fis === 'FIS2';
$base = __DIR__ . ($legacy ? '/../FIS2/' : '/../');
$library = file_get_contents($base . 'BuildingBlocks.php');
$library = replaceStaticBody($library, 'Lib', 'sendToMDB', 'return call_user_func($GLOBALS["creationTransport"], $query);');
// The two archive stores are external dependencies. Use each library's documented miss.
$archiveMiss = $legacy
    ? 'return array("unit" => $unit, "status" => false, "message" => "No Such Unit", "reply" => null);'
    : 'throw new \RuntimeException("No Such Unit: " . $unit);';
$library = replaceStaticBody($library, 'Archive', 'SearchUnitInLongTermArchives', $archiveMiss);
$library = replaceStaticBody($library, 'Archive', 'SearchUnitInConvertedArchives', $archiveMiss);
eval(substr($library, strpos($library, '<?php') + 5));
class_alias('BuildingBlocks\Unit', 'Unit');
class_alias('BuildingBlocks\Archive', 'Archive');

// Exercise each library's real request getters, including false and zero values.
$values = array('text' => ' <b>PN&A</b> ', 'zero' => '0', 'int' => ' 12 ', 'bad' => '12x', 'array' => array('x'));
verifyCreation(\BuildingBlocks\Lib::GetArrayString($values, 'text') === 'PN&A', 'String getter encoded ampersands or retained tags');
verifyCreation(\BuildingBlocks\Lib::GetArrayString($values, 'zero') === '0', 'String getter lost zero');
verifyCreation(\BuildingBlocks\Lib::GetArrayString($values, 'array') === null, 'String getter accepted an array');
verifyCreation(\BuildingBlocks\Lib::GetArrayString($values, 'missing') === null, 'String getter accepted a missing field');
verifyCreation(\BuildingBlocks\Lib::GetArrayInt($values, 'zero') === 0, 'Integer getter lost zero');
verifyCreation(\BuildingBlocks\Lib::GetArrayInt($values, 'int') === 12, 'Integer getter rejected a valid integer');
verifyCreation(\BuildingBlocks\Lib::GetArrayInt($values, 'bad') === null, 'Integer getter accepted malformed input');
foreach (array('false', '0', 'off', 'no', false) as $value) {
    verifyCreation(\BuildingBlocks\Lib::GetArrayBool(array('flag' => $value), 'flag') === false, 'Boolean getter lost false');
}
verifyCreation(\BuildingBlocks\Lib::GetArrayBool(array('flag' => 'yes'), 'flag') === true, 'Boolean getter rejected true');
verifyCreation(\BuildingBlocks\Lib::GetArrayBool(array('flag' => 'invalid'), 'flag') === null, 'Boolean getter accepted invalid input');

$endpoint = file_get_contents($base . 'MasterDashboard.php');
preg_match_all('/^function (\w+)\(/m', $endpoint, $functions, PREG_OFFSET_CAPTURE);
foreach ($functions[1] as $index => $function) {
    if (!in_array($function[0], array('masterFisReply', 'masterExistsInWip', 'masterReadUnit', 'inspectMasterStructure', 'isMissingFisUnitError'))) continue;
    $start = $functions[0][$index][1];
    $end = $functions[0][$index + 1][1];
    eval(substr($endpoint, $start, $end - $start));
}

$raw = array(); $calls = array();
$GLOBALS['creationTransport'] = function ($query) use (&$raw, &$calls) {
    $calls[] = $query;
    if (!array_key_exists($query, $raw)) throw new RuntimeException('Unexpected MDB call: ' . $query);
    return $raw[$query];
};

$raw = array('findkey|SN|Unit|1' => 'FK|1|SN', 'getunit|SN' => 'GU|1|GOOD|PN|U1|U2|BOARD|1');
$record = masterReadUnit('SN', false);
verifyCreation($record['exists'] && !$record['archived'] && $record['children'] === array(), 'Ordinary SN must use WIP only');
verifyCreation($calls === array('findkey|SN|Unit|1', 'findkey|SN|Unit|1', 'getunit|SN'), 'Ordinary SN queried structure or archives');

$raw['getkeyptr|SN|UWin|1'] = 'KP|1|0';
$raw['getlist|SN|UBuiltFrom|1'] = 'GL|1|0|0';
$structure = inspectMasterStructure('SN', 'SMT');
verifyCreation($structure['children'] === array() && $structure['unit'] === 'SN', 'Real no-parent/no-children responses rejected');

$raw = array('findkey|SN|Unit|1' => 'FK|2|SN', 'archrptdlm|1|2|1|SN' => "AR|1|SN\nUnit|SN|PN|U1|U2|BOARD||1\nUBuiltFrom|CHILD|1");
$calls = array();
$record = masterReadUnit('SN', false);
verifyCreation(!$record['exists'] && !$record['archived'] && $calls === array('findkey|SN|Unit|1'), 'Ordinary absent SN must not query archives');
$record = masterReadUnit('SN', true);
verifyCreation($record['children'] === array('CHILD'), 'Actual archive parser lost children');

// Regression for the production reply supplied for the ordinary HOUSING master.
// Exercise real archive parsing with LF, CRLF, CR and whitespace record separators.
$housing = '66853005A262753524';
$reportRecords = array(
    'archrptdlm|1',
    'Unit|' . $housing . '|EATS_HVL_EVA2M|DAIMLER_EATS_EVA|66877414|HOUSING|67|1',
    'EVENT|CREATEUNIT|DAL035|ata|NO|261002.173352|0|0|0|1|1',
    'DC||PREV_ROUTE_KEY|EATS_LVL_EVA2_HOUSING|',
    'EVENT|EATS_HVL_HA_ZONE01|DAL035|ata|NO|261002.173352|0|0|0|1|12',
    'DC||ATTRIBUTES|DATA,Cycle_time,30|',
    'DC||NOTE|Value containing ordinary spaces|',
    'UBuiltFrom|CHILD|1',
);
foreach (array("\n", "\r\n", "\r", ' ', "\t") as $separator) {
    $calls = array();
    $raw = array('findkey|' . $housing . '|Unit|1' => 'FK|2|' . $housing,
        'archrptdlm|0|18|1|' . $housing => implode($separator, $reportRecords),
        'archrptdlm|1|18|1|' . $housing => implode($separator, $reportRecords));
    $archived = Archive::GetAll($housing);
    verifyCreation($archived['status'] === true, 'Valid archrptdlm|1 report rejected');
    verifyCreation($archived['reply']['uk3'] === 'HOUSING', 'Archive UK3 was not parsed');
    verifyCreation($archived['reply']['children'] === array('CHILD'), 'Tagged child record was lost');
    verifyCreation(count($archived['reply']['events']) === 2, 'Tagged events were lost');
    verifyCreation(strpos(implode(' ', $archived['reply']['events']), 'Value containing ordinary spaces') !== false, 'Spaces inside a DC value were split');
    $calls = array();
    $structure = inspectMasterStructure($housing, 'EATS_HVL_HA_ZONE01');
    verifyCreation($structure['unit'] === $housing && !$structure['exists'] && $structure['children'] === array(), 'Ordinary process enabled panel handling');
    verifyCreation($calls === array('findkey|' . $housing . '|Unit|1'), 'Ordinary HOUSING master entered archive lookup');
    foreach ($calls as $call) {
        verifyCreation(strpos($call, 'getkeyptr|') !== 0 && strpos($call, 'getlist|') !== 0, 'Ordinary process queried parent/children');
    }
}

// Regression: a removed WIP unit can still have an archive generation marked unarchived.
// GetAll's documented third argument enables reading that metadata without restoring it.
$raw = array('findkey|SN|Unit|1' => 'FK|2|SN',
    'archrptdlm|0|2|1|SN' => "archrptdlm|0|Already unarchived Unit has been unarchived. (Unit: 'SN') (Gen: 1)",
    'archrptdlm|1|2|1|SN' => "archrptdlm|1 Unit|SN|PN|U1|U2|HOUSING|67|1");
if ($legacy) {
    $defaultRead = Archive::GetAll('SN');
    verifyCreation(!$defaultRead['status'] && strpos($defaultRead['message'], 'Already unarchived') !== false, 'Default archive mode did not reproduce the reported error');
} else {
    try {
        Archive::GetAll('SN');
        throw new LogicException('Default archive mode unexpectedly succeeded');
    } catch (RuntimeException $error) {
        verifyCreation(strpos($error->getMessage(), 'Already unarchived') !== false, 'Wrong default archive error');
    }
}
$calls = array();
$record = masterReadUnit('SN', false);
verifyCreation(!$record['exists'] && $calls === array('findkey|SN|Unit|1'), 'Ordinary master with an already-unarchived generation queried archives');
$calls = array();
$record = masterReadUnit('SN', true);
verifyCreation($record['exists'] && $record['archived'], 'Special process allowUnar metadata was not read');
verifyCreation($calls === array('findkey|SN|Unit|1', 'archrptdlm|1|2|1|SN'), 'Creation did not use Find followed by archive allowUnar=1');

$raw = array('findkey|SN|Unit|1' => 'FK|2|SN');
$raw['archrptdlm|1|2|1|SN'] = 'AR|0|No Such Unit';
$record = masterReadUnit('SN', true);
verifyCreation(!$record['exists'], 'Actual archive absence contract rejected');

$raw['archrptdlm|1|2|1|SN'] = 'AR|0|SN';
try {
    masterReadUnit('SN', true);
    throw new LogicException('Bare SN archive error was treated as absence');
} catch (RuntimeException $error) {
    verifyCreation(strpos($error->getMessage(), 'AR|0|SN') !== false, 'Raw MDB archive header was lost');
}

$calls = array();
$raw = array('findkey|SN|Unit|1' => 'FK|0|Time out error');
try {
    masterReadUnit('SN', false);
    throw new LogicException('Find timeout accepted');
} catch (RuntimeException $error) {
    verifyCreation(count($calls) === 2 && $calls[0] === $calls[1], 'Find timeout entered archives instead of stopping after retry');
}

$raw = array('findkey|P|Unit|1' => 'FK|1|P', 'findkey|C|Unit|1' => 'FK|1|C',
    'searchlist|UBuiltFrom|C|P' => 'SL|1|0', 'searchlist|UBuiltFrom|P|C' => 'SL|1|0', 'insertlist|P|UBuiltFrom|UWin|1|C' => 'IL|1');
verifyCreation(Unit::Link('P', 'C')['status'] === true, 'Actual Unit::Link failed');
$raw['insertlist|P|UBuiltFrom|UWin|1|C'] = 'IL|0|Insert failed';
try {
    masterFisReply(Unit::Link('P', 'C'), 'Unit::Link');
    throw new LogicException('Failed insertlist accepted');
} catch (RuntimeException $error) {
    // Both contracts must stop creation; one throws, the other returns status=false.
}
echo "PASS $fis: real BuildingBlocks Find, archive, parent/children and Link contracts\n";
