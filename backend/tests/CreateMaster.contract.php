<?php
// Runs the actual creation/structure cases from both endpoints with FIS/DB doubles.
// php backend/tests/CreateMaster.contract.php
class ApiOperationException extends RuntimeException {
    public $statusCode;
    public $responseData;
    function __construct($message, $code = 500, $data = null, $previous = null) {
        parent::__construct($message, 0, $previous);
        $this->statusCode = $code; $this->responseData = $data;
    }
}
require_once dirname(__FILE__) . '/RequestInput.stub.php';
define('FILENAME', 'CreateMaster.contract');
function requireWriteAccess() {
    if ($GLOBALS['scenario'] === 'denied') sendJsonResponse(false, 'Forbidden', null, 403);
    return 'operator';
}
function getOperatorName() { return 'Test Operator'; }
function getServerFis() { return $GLOBALS['fis']; }
function getDbConnection() { return $GLOBALS['db']; }
function stmtFetchAssoc($stmt) { return $stmt->get_result()->fetch_assoc(); }
function dbBegin($db) { $db->begin_transaction(); }
function dbCommit($db) { $db->commit(); }
function dbRollback($db) { $db->rollback(); }
function isMissingFisUnitError($error) { return strpos($error->getMessage(), 'No Such Unit') !== false; }
function formatOperationError($operation, $stage, $unit, $fis, $error, $state = '') { return "$stage:$unit:$fis: " . $error->getMessage() . " | state: $state"; }
function sendJsonResponse($status, $message, $data = null, $code = 200) {
    echo json_encode(array('ok' => $status, 'message' => $message, 'data' => $data, 'code' => $code,
        'events' => Unit::$events, 'calls' => Unit::$calls, 'units' => Unit::$units, 'records' => $GLOBALS['db']->records,
        'audit' => $GLOBALS['db']->audit));
    exit;
}
class ContractDb {
    public $records = array(); public $audit = array(); public $snapshot;
    function prepare($sql) { return new ContractStmt($this, $sql); }
    function begin_transaction() { $this->snapshot = array($this->records, $this->audit); }
    function commit() {}
    function rollback() { list($this->records, $this->audit) = $this->snapshot; }
    function close() {}
}
class ContractStmt {
    public $db; public $sql; public $args; public $affected_rows = 1;
    function __construct($db, $sql) { $this->db = $db; $this->sql = $sql; }
    function bind_param($types, &...$args) { $this->args = &$args; }
    function execute() {
        if (strpos($this->sql, 'INSERT INTO masterUnits') !== false) {
            list($unit, $process, $status, $max, $errors, $user, $fis) = $this->args;
            $this->db->records[$unit] = array('unit' => $unit, 'process' => $process, 'status' => $status,
                'maxCounter' => $max, 'errorMaxCounter' => $errors, 'FIS' => $fis);
        }
        if (strpos($this->sql, 'INSERT INTO history') !== false) {
            if ($GLOBALS['scenario'] === 'database-error') throw new RuntimeException('Audit failed');
            $this->db->audit[] = $this->args[2];
        }
    }
    function get_result() { return $this; }
    function fetch_assoc() { return isset($this->db->records[$this->args[0]]) ? $this->db->records[$this->args[0]] : null; }
    function close() {}
}
class Unit {
    static $units = array(); static $events = array(); static $calls = array(); static $findCounts = array(); static $fail = ''; static $failureReadCount = 0;
    static function operation($op, $unit) {
        self::$calls[] = "$op:$unit";
        if (self::$fail === "$op:$unit") throw new RuntimeException("Failed $op for $unit");
        if ($GLOBALS['scenario'] === 'false-link' && $op === 'Link') return false;
        return true;
    }
    static function Find($unit) {
        self::operation('Find', $unit);
        self::$findCounts[$unit] = isset(self::$findCounts[$unit]) ? self::$findCounts[$unit] + 1 : 1;
        if ($GLOBALS['scenario'] === 'restored-before-unarchive' && $unit === 'SN' && self::$findCounts[$unit] === 3) self::$units[$unit]['archived'] = false;
        if (!isset(self::$units[$unit]) || self::$units[$unit]['archived']) {
            if ($GLOBALS['fis'] === 'FIS2') return array('status' => false, 'message' => 'Unit not found', 'reply' => array('FK', '2', $unit));
            throw new RuntimeException('No Such Unit');
        }
        return array('status' => true);
    }
    static function GetStatus($unit) { self::operation('GetStatus', $unit); return array('status' => true, 'reply' => array('uk3' => self::$units[$unit]['gold'] ? 'GOLDEN' : 'BOARD')); }
    static function GetParent($unit) { self::operation('GetParent', $unit); $parent = self::$units[$unit]['parent']; return array('status' => $parent !== '', 'reply' => $parent === '' ? null : $parent, 'message' => $GLOBALS['fis'] === 'FIS2' ? 'No parent found' : 'Parent not found'); }
    static function GetChildren($unit) {
        self::operation('GetChildren', $unit);
        if ($GLOBALS['scenario'] === 'changed-structure' && $unit === 'P' && ++self::$failureReadCount === 2) {
            self::$units['P']['children'] = array();
        }
        return array('status' => true, 'reply' => $GLOBALS['fis'] === 'FIS2' && !self::$units[$unit]['children'] ? null : self::$units[$unit]['children']);
    }
    static function Delete($unit) {
        self::operation('Delete', $unit); self::$events[] = "delete:$unit";
        unset(self::$units[$unit]);
        foreach (self::$units as &$record) {
            if ($record['archived']) continue; // WIP deletion does not rewrite archive snapshots.
            $record['children'] = array_values(array_diff($record['children'], array($unit)));
            if ($record['parent'] === $unit) $record['parent'] = '';
        }
        return array('status' => true);
    }
    static function DataEntry($unit, $process, $station, $dcmods, $part, $uk1, $pn, $uk3) {
        self::operation('DataEntry', $unit);
        if (isset(self::$units[$unit]) && !self::$units[$unit]['archived']) throw new RuntimeException('CREATEUNIT requires an empty WIP slot: ' . $unit);
        self::$events[] = "create:$unit";
        self::$units[$unit] = array('parent' => '', 'children' => array(), 'gold' => $uk3 === 'GOLDEN', 'archived' => false, 'pn' => $pn, 'dcmods' => $dcmods, 'history' => array('CREATEUNIT|' . $dcmods));
        return array('status' => true);
    }
    static function Link($parent, $child) {
        if (!self::operation('Link', $child)) return array('status' => false, 'message' => 'Link rejected');
        self::$events[] = "link:$parent:$child";
        self::$units[$parent]['children'][] = $child; self::$units[$child]['parent'] = $parent;
        return array('status' => true);
    }
}
class Archive {
    static function GetAll($unit, $archiveFile = '', $allowUnar = 0) {
        Unit::operation('ArchiveRead', $unit);
        if ($GLOBALS['scenario'] === 'archive-marked-unarchived' && $allowUnar !== 1) return array('status' => false, 'message' => 'Already unarchived Unit has been unarchived.', 'reply' => 'archrptdlm|0|Already unarchived');
        if ($allowUnar !== 1) throw new RuntimeException('Creation must request archive metadata with allowUnar=1');
        if ($GLOBALS['scenario'] === 'archive-bare-sn-error') return array('status' => false, 'message' => $unit, 'reply' => 'AR|0|' . $unit);
        if (in_array($GLOBALS['scenario'], array('archive-false-error', 'ordinary-broken-archive'))) return array('status' => false, 'message' => 'Archive database connection failed', 'reply' => null);
        if (!isset(Unit::$units[$unit])) {
            if ($GLOBALS['fis'] === 'FIS2') return array('status' => false, 'message' => 'No Such Unit', 'reply' => null);
            throw new RuntimeException('No Such Unit');
        }
        $record = Unit::$units[$unit]; $record['uk3'] = $record['gold'] ? 'GOLDEN' : 'BOARD';
        return array('status' => true, 'reply' => $record);
    }
    static function Unarchive($unit) {
        Unit::operation('Unarchive', $unit);
        // FIS restores the panel's subtree, not only the requested serial number.
        foreach (Unit::$units[$unit]['children'] as $child) {
            if (isset(Unit::$units[$child]) && !Unit::$units[$child]['archived']) {
                throw new RuntimeException("Retry failed: Exists (Unit '$child' found in WIP)");
            }
        }
        Unit::$events[] = "unarchive:$unit";
        foreach (Unit::$units[$unit]['children'] as $child) Unit::$units[$child]['archived'] = false;
        Unit::$units[$unit]['archived'] = false;
        return array('status' => true);
    }
}
function fixture($gold = false, $archived = false) {
    return array('parent' => '', 'children' => array(), 'gold' => $gold, 'archived' => $archived, 'history' => array('OLD_PRODUCTION_HISTORY'));
}
function check($condition, $message) { if (!$condition) throw new RuntimeException($message); }

if (isset($argv[1]) && $argv[1] === '--scenario') {
    $endpoint = $argv[2]; $scenario = $argv[3]; $fis = strpos($endpoint, 'FIS2') !== false ? 'FIS2' : 'FIS1';
    $db = new ContractDb();
    Unit::$units = array('P' => fixture(), 'A' => fixture(), 'B' => fixture());
    Unit::$units['P']['children'] = array('A', 'B');
    Unit::$units['A']['parent'] = 'P'; Unit::$units['B']['parent'] = 'P';
    $input = array('unit' => 'P', 'process' => 'SMT_SPI', 'fis' => $fis, 'status' => 'BAD', 'maxCounter' => 2000, 'maxErrors' => 50, 'userKey2' => 'PN123');
    $job = 'CreateMaster';
    if ($scenario === 'input-canonical') {
        $input['unit'] = ' <b>p</b> '; $input['process'] = ' SMT_SPI '; $input['userKey2'] = ' PN123 ';
    }
    if (strpos($scenario, 'input-missing-') === 0) unset($input[substr($scenario, strlen('input-missing-'))]);
    $aliases = array('input-alias-unit' => array('unit', 'serialNumber'), 'input-alias-process' => array('process', 'processName'), 'input-alias-maxErrors' => array('maxErrors', 'errorMaxCounter'));
    if (isset($aliases[$scenario])) {
        list($field, $alias) = $aliases[$scenario];
        $input[$alias] = $input[$field]; unset($input[$field]);
    }
    if ($scenario === 'input-pn-alias' || $scenario === 'input-userkey2-alias') {
        unset($input['userKey2']);
        $input[$scenario === 'input-pn-alias' ? 'pn' : 'userkey2'] = 'UNEXPECTED_PN';
    }
    if ($scenario === 'input-false-preview') $input['previewOnly'] = 'false';
    if ($scenario === 'input-false-update') {
        $input['forceUpdate'] = 'false';
        $db->records['P'] = array('unit' => 'P', 'process' => 'SMT_SPI', 'status' => 'GOOD', 'maxCounter' => 1000, 'errorMaxCounter' => 50, 'FIS' => $fis);
    }
    if ($scenario === 'input-invalid-limit') $input['maxCounter'] = '123abc';
    if ($scenario === 'input-array-limit') $input['maxCounter'] = array(123);
    if ($scenario === 'input-zero-limit') $input['maxCounter'] = '0';
    if ($scenario === 'input-array-unit') $input['unit'] = array('P');
    if ($scenario === 'input-array-status') $input['status'] = array('BAD');
    if (in_array($scenario, array('child-SMT', 'child-XRAY', 'child-ICT'))) { $input['unit'] = 'A'; $input['process'] = substr($scenario, 6) . '_TEST'; }
    if ($scenario === 'conflict' || $scenario === 'update') $input['unit'] = 'A';
    if ($scenario === 'gold-single' || $scenario === 'archived-gold-single') {
        $input['unit'] = 'SN'; Unit::$units['SN'] = fixture(true, $scenario === 'archived-gold-single');
    }
    if ($scenario === 'other-panel') $input['process'] = 'FCT';
    if ($scenario === 'other-child') { $input['process'] = 'FCT'; $input['unit'] = 'A'; }
    if ($scenario === 'archive-bare-sn-error' || $scenario === 'archive-false-error') { $input['process'] = 'SMT_SPI'; $input['unit'] = '66853005A262753524'; }
    if ($scenario === 'ordinary-broken-archive' || $scenario === 'ordinary-find-error') { $input['unit'] = 'NEW'; $input['process'] = 'FCT'; }
    if ($scenario === 'other-archived-single') { $input['process'] = 'FCT'; $input['unit'] = 'SN'; Unit::$units['SN'] = fixture(false, true); }
    if ($scenario === 'mixed-process') { $input['unit'] = 'A'; $input['process'] = 'FCT,pre_ict_test'; }
    if ($scenario === 'empty-process') $input['process'] = ', ,';
    if ($scenario === 'single' || $scenario === 'missing') { $input['unit'] = $scenario === 'single' ? 'SN' : 'NEW'; Unit::$units['SN'] = fixture(); $input['process'] = 'FCT'; }
    if ($scenario === 'gold' || $scenario === 'archived-gold') foreach (Unit::$units as &$record) { $record['gold'] = true; $record['archived'] = $scenario === 'archived-gold'; }
    if ($scenario === 'mixed-gold') { Unit::$units['P']['gold'] = true; Unit::$units['A']['gold'] = true; }
    if ($scenario === 'archived-panel-live-gold-children' || $scenario === 'archived-gold-panel-live-gold-children') {
        Unit::$units['P']['archived'] = true;
        Unit::$units['P']['gold'] = $scenario === 'archived-gold-panel-live-gold-children';
        Unit::$units['A']['gold'] = Unit::$units['B']['gold'] = true;
        Unit::$units['A']['parent'] = Unit::$units['B']['parent'] = '';
    }
    if ($scenario === 'archived') foreach (Unit::$units as &$record) $record['archived'] = true;
    if (in_array($scenario, array('conflict', 'update')) || strpos($scenario, 'migration') === 0) {
        $db->records['P'] = array('unit' => 'P', 'process' => 'SMT_SPI', 'status' => 'GOOD', 'maxCounter' => 1000, 'errorMaxCounter' => 50, 'FIS' => $fis);
        if ($scenario !== 'conflict') $input['forceUpdate'] = true;
    }
    $failures = array('read-error' => 'GetChildren:P', 'delete-error' => 'Delete:B', 'create-error' => 'DataEntry:B', 'link-error' => 'Link:B', 'archive-error' => 'ArchiveRead:NEW', 'find-tech-error' => 'Find:P', 'ordinary-find-error' => 'Find:NEW');
    if (isset($failures[$scenario])) Unit::$fail = $failures[$scenario];
    if ($scenario === 'archive-error') $input['unit'] = 'NEW';
    if ($scenario === 'archive-marked-unarchived' || $scenario === 'archived-single' || $scenario === 'restored-before-unarchive') {
        $input['unit'] = 'SN'; Unit::$units['SN'] = fixture(false, true);
    }
    if ($scenario === 'missing-backlink') Unit::$units['A']['parent'] = '';
    if ($scenario === 'foreign-parent') Unit::$units['A']['parent'] = 'OTHER_PANEL';
    if ($scenario === 'missing-child') unset(Unit::$units['A']);
    if ($scenario === 'nested') { Unit::$units['A']['children'] = array('N'); Unit::$units['N'] = fixture(); Unit::$units['N']['parent'] = 'A'; }
    if ($scenario === 'child-master') $db->records['A'] = array('unit' => 'A', 'FIS' => $fis);
    $text = file_get_contents($endpoint);
    // Extract the actual helpers by name; FIS1 uses typed helpers after its refactor.
    preg_match_all('/^function (\w+)\(/m', $text, $functions, PREG_OFFSET_CAPTURE);
    foreach ($functions[1] as $index => $function) {
        $name = $function[0];
        if (strpos($name, 'master') !== 0 && $name !== 'inspectMasterStructure' && $name !== 'applyMasterStructure' && $name !== 'logMasterHistory') continue;
        $start = $functions[0][$index][1];
        $end = isset($functions[0][$index + 1]) ? $functions[0][$index + 1][1] : strlen($text);
        $helper = substr($text, $start, $end - $start);
        // Substitute only the mysqli type so production SQL executes on the DB double.
        $helper = preg_replace('/\bmysqli\b/', 'ContractDb', $helper);
        eval($helper);
    }
    if (strpos($scenario, 'migration') === 0) {
        if ($scenario === 'migration-archived-source') foreach (Unit::$units as &$record) $record['archived'] = true;
        if ($scenario === 'migration-mixed-source') Unit::$units['P']['archived'] = true;
        $source = inspectMasterStructure('A', 'ICT');
        $source['masterFis'] = $fis;
        if (in_array($scenario, array('migration', 'migration-changed', 'migration-archived-source', 'migration-mixed-source'))) {
            $job = 'DeleteMasterStructure'; $input['expectedStructure'] = $source;
            if ($scenario === 'migration-changed') $input['expectedStructure']['children'] = array('A');
        } else {
            Unit::$units = array();
            $input['sourceFis'] = $fis === 'FIS1' ? 'FIS2' : 'FIS1';
            $db->records['P']['FIS'] = $input['sourceFis'];
            $input['sourceStructure'] = $source; $input['forceUpdate'] = true;
            if ($scenario === 'migration-preview') $input['previewOnly'] = true;
            if ($scenario === 'migration-target-conflict') { Unit::$units['P'] = fixture(); }
            if ($scenario === 'migration-target-changed') $input['expectedTargetStructure'] = $source;
        }
    }
    preg_match_all('/^        case /m', $text, $matches, PREG_OFFSET_CAPTURE);
    $cases = '';
    foreach ($matches[0] as $i => $match) {
        $start = $match[1]; $end = isset($matches[0][$i + 1]) ? $matches[0][$i + 1][1] : strlen($text);
        $chunk = substr($text, $start, $end - $start);
        if (preg_match("/^        case '(CreateMaster|InspectMasterStructure|DeleteMasterStructure)'/", $chunk)) $cases .= $chunk;
    }
    try { eval('switch ($job) {' . $cases . '}'); }
    catch (InvalidArgumentException $error) {
        sendJsonResponse(false, $error->getMessage(), null, 400);
    }
    catch (Throwable $error) {
        sendJsonResponse(false, $error->getMessage(), $error instanceof ApiOperationException ? $error->responseData : null, $error instanceof ApiOperationException ? $error->statusCode : 500);
    }
    throw new RuntimeException('No response');
}

$scenarios = array('child-SMT', 'child-XRAY', 'child-ICT', 'mixed-process', 'other-panel', 'other-child', 'other-archived-single', 'ordinary-broken-archive', 'ordinary-find-error', 'archive-bare-sn-error', 'archive-false-error', 'single', 'missing', 'gold', 'gold-single', 'archived-gold-single', 'mixed-gold', 'archived-gold', 'archived', 'archived-panel-live-gold-children', 'archived-gold-panel-live-gold-children', 'archived-single', 'archive-marked-unarchived', 'restored-before-unarchive', 'find-tech-error', 'conflict', 'update', 'read-error', 'delete-error', 'create-error', 'link-error', 'false-link', 'archive-error', 'changed-structure', 'missing-backlink', 'foreign-parent', 'missing-child', 'nested', 'child-master', 'empty-process', 'database-error', 'migration', 'migration-archived-source', 'migration-mixed-source', 'migration-preview', 'migration-create', 'migration-target-conflict', 'migration-target-changed', 'migration-changed', 'denied');
foreach (array(__DIR__ . '/../MasterDashboard.php', __DIR__ . '/../FIS2/MasterDashboard.php') as $endpoint) {
    $inputScenarios = array('input-canonical', 'input-false-preview', 'input-false-update', 'input-invalid-limit', 'input-array-limit', 'input-zero-limit', 'input-array-unit', 'input-array-status', 'input-alias-unit', 'input-alias-process', 'input-alias-maxErrors', 'input-pn-alias', 'input-userkey2-alias');
    foreach (array('unit', 'process', 'status', 'fis', 'maxCounter', 'maxErrors') as $field) $inputScenarios[] = 'input-missing-' . $field;
    $endpointScenarios = array_merge($scenarios, $inputScenarios);
    foreach ($endpointScenarios as $scenario) {
        $command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__) . ' --scenario ' . escapeshellarg($endpoint) . ' ' . escapeshellarg($scenario);
        exec($command, $lines, $exitCode); $result = json_decode(implode("\n", $lines), true); $lines = array();
        check($exitCode === 0 && is_array($result), "$endpoint $scenario invalid response");
        $label = "$endpoint $scenario";
        $creationStarted = false;
        foreach ($result['events'] as $event) {
            if (strpos($event, 'create:') === 0) $creationStarted = true;
            if (strpos($event, 'delete:') === 0) check(!$creationStarted, "$label deleted an old unit after recreation started");
        }
        $lastCalls = array();
        foreach ($result['calls'] as $call) {
            list($operation, $sn) = explode(':', $call, 2);
            if ($operation === 'ArchiveRead' || $operation === 'Unarchive') {
                check(isset($lastCalls[$sn]) && $lastCalls[$sn] === 'Find', "$label archive used without a fresh Unit::Find for $sn");
            }
            $lastCalls[$sn] = $operation;
        }
        if ($scenario === 'find-tech-error') check($result['calls'] === array('Find:P'), "$label technical failure entered archives");
        if (strpos($scenario, 'input-missing-') === 0 || strpos($scenario, 'input-alias-') === 0 || in_array($scenario, array('input-invalid-limit', 'input-array-limit', 'input-zero-limit', 'input-array-unit', 'input-array-status'))) {
            check(!$result['ok'] && $result['code'] === 400 && !$result['calls'] && !$result['events'] && !$result['audit'], "$label invalid input reached FIS");
            if (strpos($scenario, 'input-missing-') === 0) {
                $field = substr($scenario, strlen('input-missing-'));
                check($result['message'] === "$field is required", "$label missing field was not identified");
            }
        } elseif (in_array($scenario, array('read-error', 'find-tech-error', 'ordinary-find-error', 'archive-bare-sn-error', 'archive-false-error', 'archive-error', 'changed-structure', 'foreign-parent', 'missing-child', 'nested', 'child-master', 'empty-process', 'migration-changed', 'migration-target-conflict', 'migration-target-changed', 'denied'))) {
            check(!$result['ok'] && !$result['events'] && !$result['audit'], "$label must fail before writes");
            if (in_array($scenario, array('read-error', 'foreign-parent', 'missing-child', 'nested'))) check(strpos($result['message'], 'fis_updated=false') !== false, "$label inaccurate write state");
            if (in_array($scenario, array('archive-bare-sn-error', 'archive-false-error'))) check($result['data']['stage'] === 'read_structure', "$label special process lost panel stage");
            if ($scenario === 'ordinary-find-error') check($result['calls'] === array('Find:NEW') && $result['data']['stage'] === 'read_unit', "$label technical Find error entered archive");
            if ($scenario === 'read-error') check($result['data']['stage'] === 'read_structure', "$label SMT process lost structure stage");
            if ($scenario === 'archive-bare-sn-error' && strpos($endpoint, 'FIS2') !== false) check(strpos($result['message'], 'MDB header: AR|0|66853005A262753524') !== false, "$label lost MDB header");
            if ($scenario === 'foreign-parent') check(strpos($result['message'], 'OTHER_PANEL') !== false, "$label missing actual parent");
            if ($scenario === 'missing-child') check(strpos($result['message'], 'not found in FIS or archives') !== false, "$label missing reason");
            if ($scenario === 'nested') check(strpos($result['message'], 'own children: N') !== false, "$label missing nested children");
        } elseif (in_array($scenario, array('delete-error', 'create-error', 'link-error', 'false-link', 'database-error'))) {
            check(!$result['ok'] && !$result['audit'] && !$result['records'], "$label must not save DB");
            check(isset($result['data']['completed']), "$label missing completed operations");
            if ($scenario === 'delete-error') check(!$result['data']['completed']['created'], "$label created new units before deletion completed");
        } elseif ($scenario === 'conflict' || $scenario === 'input-false-update') {
            check($result['ok'] && $result['data']['exists'] && $result['data']['newData']['unit'] === 'P' && !$result['events'], "$label wrong conflict");
        } elseif ($scenario === 'migration-preview') {
            check($result['ok'] && $result['data']['children'] === array('A', 'B') && !$result['events'], "$label preview mutated FIS");
        } elseif (in_array($scenario, array('migration', 'migration-archived-source', 'migration-mixed-source'))) {
            $live = array_filter($result['units'], function ($record) { return !$record['archived']; });
            check($result['ok'] && !$live && count($result['records']) === 1 && !$result['audit'], "$label source deletion updated DB or left live units");
            foreach ($result['events'] as $event) check(strpos($event, 'unarchive:') !== 0, "$label restored source archives");
        } else {
            $expectedPn = in_array($scenario, array('input-pn-alias', 'input-userkey2-alias')) ? '' : 'PN123';
            $unit = in_array($scenario, array('single', 'archived-single', 'other-archived-single', 'archive-marked-unarchived', 'restored-before-unarchive', 'gold-single', 'archived-gold-single')) ? 'SN' : (in_array($scenario, array('missing', 'ordinary-broken-archive')) ? 'NEW' : ($scenario === 'archive-bare-sn-error' ? '66853005A262753524' : ($scenario === 'other-child' ? 'A' : 'P')));
            check($result['ok'] && array_keys($result['records']) === array($unit) && $result['audit'] === array($unit), "$label wrong database master");
            check($result['data']['unit'] === $unit, "$label wrong canonical SN");
            foreach ($result['units'] as $sn => $record) {
                if (!$record['archived'] && ($sn === $unit || in_array($sn, $result['data']['children']))) {
                    check(count($record['history']) === 1 && strpos($record['history'][0], 'CREATEUNIT|MS_HISTORY|' . $sn . '_MASTER|') === 0, "$label retained old history for $sn");
                    check($record['gold'] && $record['pn'] === $expectedPn, "$label lost master settings for $sn");
                }
            }
            if ($unit === 'P' && $scenario !== 'other-panel') check($result['units']['P']['children'] === array('A', 'B') && $result['units']['A']['parent'] === 'P', "$label links lost");
            if (in_array($scenario, array('other-panel', 'other-child', 'other-archived-single', 'archive-bare-sn-error'))) {
                check($result['data']['children'] === array(), "$label used panel children for FCT");
                foreach ($result['calls'] as $call) check(strpos($call, 'GetChildren:') !== 0 && strpos($call, 'GetParent:') !== 0, "$label read panel relations for FCT");
            }
            if (in_array($scenario, array('missing', 'other-archived-single', 'ordinary-broken-archive'))) {
                foreach ($result['calls'] as $call) check(strpos($call, 'ArchiveRead:') !== 0, "$label read archives for an ordinary master");
                check($result['events'] === array('create:' . $unit), "$label did not create the ordinary unit directly");
            }
            if ($scenario === 'other-child') check($result['units']['P']['history'] === array('OLD_PRODUCTION_HISTORY') && $result['units']['B']['history'] === array('OLD_PRODUCTION_HISTORY'), "$label changed parent or sibling history");
            if ($scenario === 'other-panel') {
                check($result['data']['children'] === array() && $result['events'] === array('delete:P', 'create:P'), "$label touched panel members for FCT");
                check($result['units']['A']['history'] === array('OLD_PRODUCTION_HISTORY') && $result['units']['B']['history'] === array('OLD_PRODUCTION_HISTORY'), "$label changed children's history");
                foreach ($result['calls'] as $call) check(strpos($call, 'GetChildren:') !== 0 && strpos($call, 'GetParent:') !== 0, "$label read panel structure for FCT");
            }
            foreach ($result['events'] as $event) {
                if (strpos($event, 'create:') === 0) {
                    $created = $result['units'][substr($event, 7)];
                    check($created['pn'] === $expectedPn && strpos($created['dcmods'], 'MS_STATUS|BAD|OPERATOR|Test Operator') !== false, "$label lost settings");
                }
            }
            if ($scenario === 'restored-before-unarchive') check($result['events'] === array('delete:SN', 'create:SN'), "$label restored a unit already in WIP");
            if ($scenario === 'gold' || $scenario === 'mixed-gold') {
                foreach (array('P', 'A', 'B') as $sn) check(in_array("delete:$sn", $result['events']) && in_array("create:$sn", $result['events']), "$label did not rebuild GOLD unit $sn");
            }
            if (strpos($scenario, 'child-') === 0) check($result['data']['requestedUnit'] === 'A', "$label requested SN lost");
            if (in_array($scenario, array('archived-gold', 'archived', 'archived-panel-live-gold-children', 'archived-gold-panel-live-gold-children'))) {
                foreach ($result['events'] as $event) check(strpos($event, 'unarchive:') !== 0, "$label must not restore archived panel subtrees into WIP");
            }
            if ($scenario === 'archived-panel-live-gold-children' || $scenario === 'archived-gold-panel-live-gold-children') {
                check($result['events'] === array('delete:A', 'delete:B', 'create:P', 'create:A', 'create:B', 'link:P:A', 'link:P:B'), "$label did not rebuild the full archived/live structure");
            }
            foreach ($result['events'] as $event) check(strpos($event, 'unarchive:') !== 0, "$label unnecessarily restored production history");
            if ($scenario === 'archive-marked-unarchived' || $scenario === 'archived-single') check($result['events'] === array('create:SN'), "$label did not directly recreate the missing WIP unit");
        }
    }
    echo 'PASS ' . basename(dirname($endpoint)) . '/' . basename($endpoint) . ': ' . count($endpointScenarios) . " creation/structure scenarios\n";
}
