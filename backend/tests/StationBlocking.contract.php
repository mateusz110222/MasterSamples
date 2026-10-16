<?php
// Standalone contract tests. No FIS, database or file locks.
// Executes the actual switch cases from BOTH endpoints with a database double.
// Run: php backend/tests/StationBlocking.contract.php
class ContractResponse extends Exception {
    public $response;
    public function __construct($ok, $data, $code) {
        parent::__construct('response');
        $this->response = array('ok' => $ok, 'data' => $data, 'code' => $code);
    }
}
require_once dirname(__FILE__) . '/RequestInput.stub.php';
define('FILENAME', 'StationBlocking.contract');
if (!defined('MYSQLI_ASSOC')) define('MYSQLI_ASSOC', 1);
function sendJsonResponse($ok, $message, $data = null, $code = 200) { throw new ContractResponse($ok, $data, $code); }
function requireWriteAccess() {
    if (!$GLOBALS['writeAllowed']) sendJsonResponse(false, 'Forbidden', null, 403);
    if ($GLOBALS['method'] !== 'POST') sendJsonResponse(false, 'POST required', null, 405);
    return 'test.operator';
}
function getUserGroups($userId) { return $GLOBALS['userGroups']; }
function getServerFis() { return $GLOBALS['serverFis']; }
function getOperatorName() { return 'Test Operator'; }
function getDbConnection() { return $GLOBALS['database']; }
class ContractDatabase {
    public $rules = array();
    public $history = array();
    public $failAudit = false;
    private $snapshot = null;
    function prepare($sql) { return new ContractStatement($this, $sql); }
    function query($sql) {
        if ($sql === 'START TRANSACTION') $this->snapshot = array($this->rules, $this->history);
        if ($sql === 'ROLLBACK' && $this->snapshot !== null) {
            $this->rules = $this->snapshot[0]; $this->history = $this->snapshot[1]; $this->snapshot = null;
        }
        if ($sql === 'COMMIT') $this->snapshot = null;
    }
    function close() {}
    function begin_transaction() { $this->query('START TRANSACTION'); }
    function commit() { $this->query('COMMIT'); }
    function rollback() { $this->query('ROLLBACK'); }
}
class ContractStatement {
    public $affected_rows = 0;
    private $db;
    private $sql;
    private $params;
    private $rows = array();
    private $bindings;
    function __construct($db, $sql) { $this->db = $db; $this->sql = $sql; }
    function bind_param($types) { $args = func_get_args(); $this->params = array_slice($args, 1); }
    function bind_result(&$a, &$b = null, &$c = null, &$d = null, &$e = null, &$f = null) {
        $this->bindings = array(&$a, &$b, &$c, &$d, &$e, &$f);
    }
    function execute() {
        $p = $this->params;
        if (strpos($this->sql, 'SELECT station, mode') === 0) {
            foreach ($this->db->rules as $row) if ($row[3] === $p[0]) $this->rows[] = $row;
        } elseif (strpos($this->sql, 'SELECT disabled') === 0) {
            $key = implode('|', $p);
            if (isset($this->db->rules[$key])) $this->rows[] = array($this->db->rules[$key][2]);
        } elseif (strpos($this->sql, 'INSERT INTO stationBlockingRules') === 0) {
            $key = implode('|', array_slice($p, 0, 3));
            $this->db->rules[$key] = array($p[2], $p[1], $p[3], $p[0], $p[4], '2026-10-06 12:00:00');
            $this->affected_rows = 1;
        } elseif (strpos($this->sql, 'DELETE FROM stationBlockingRules') === 0) {
            $key = implode('|', $p);
            $this->affected_rows = isset($this->db->rules[$key]) ? 1 : 0;
            unset($this->db->rules[$key]);
        } elseif (strpos($this->sql, 'INSERT INTO history') === 0) {
            if ($this->db->failAudit) throw new Exception('Injected audit failure');
            $this->db->history[] = $p;
            $this->affected_rows = 1;
        } else { throw new Exception('Unexpected SQL in contract test: ' . $this->sql); }
    }
    function fetch() {
        if (!$this->rows) return false;
        $row = array_shift($this->rows);
        foreach ($row as $i => $value) $this->bindings[$i] = $value;
        return true;
    }
    function get_result() {
        $columns = strpos($this->sql, 'SELECT disabled') === 0
            ? array('disabled') : array('station', 'mode', 'disabled', 'FIS', 'user', 'date');
        return new ContractResult($this->rows, $columns);
    }
    function close() {}
}
class ContractResult {
    private $rows;
    function __construct($rows, $columns) {
        $this->rows = array();
        foreach ($rows as $row) $this->rows[] = array_combine($columns, $row);
    }
    function fetch_all($mode) { return $this->rows; }
    function fetch_assoc() { return $this->rows ? array_shift($this->rows) : null; }
}
function requestRule($cases, $job, $input) {
    try { eval('switch ($job) {' . $cases . '}'); }
    catch (ContractResponse $response) { return $response->response; }
    catch (InvalidArgumentException $error) { return array('ok' => false, 'code' => 400, 'data' => null); }
    catch (Exception $error) { return array('ok' => false, 'code' => 500, 'data' => null); }
    throw new Exception('Endpoint did not respond');
}
function checkRule($condition, $message) { if (!$condition) throw new Exception($message); }
foreach (array('MasterDashboard.php', 'FIS2/MasterDashboard.php') as $endpoint) {
    $source = file_get_contents(dirname(__FILE__) . '/../' . $endpoint);
    if (!function_exists('requireValidFis')) {
        preg_match('/^function requireValidFis\([^\n]*\n\{.*?^\}/ms', $source, $helper);
        eval($helper[0]);
    }
    $start = strpos($source, "        case 'GetStationBlockingRules':");
    $end = strpos($source, "        case 'UpdateMaster':", $start);
    checkRule($start !== false && $end !== false, 'Missing station rule cases');
    $cases = substr($source, $start, $end - $start);
    $database = new ContractDatabase(); $serverFis = 'FIS1'; $writeAllowed = true; $method = 'POST'; $userGroups = array('admin_group');
    $payload = array('fis' => 'FIS1', 'station' => 'FTS', 'mode' => 'prefix');
    $response = requestRule($cases, 'SetStationBlocking', $payload);
    checkRule($response['ok'] && count($database->rules) === 1, 'Prefix was not saved');
    checkRule($database->history[0] === array('FTS', 'BLOCKING_POLICY:prefix', 'ENABLED', 'FIS1', 'Test Operator', 'EnableStationBlocking'), 'Incorrect audit fields');
    requestRule($cases, 'SetStationBlocking', $payload);
    checkRule(count($database->history) === 1, 'No-op created audit');
    $single = array('fis' => 'FIS1', 'station' => 'FTS001', 'mode' => 'single');
    requestRule($cases, 'SetStationBlocking', $single);
    checkRule(isset($database->rules['FIS1|single|FTS001']) && $database->rules['FIS1|single|FTS001'][2] === 0, 'Enabled single exception was not retained');
    $response = requestRule($cases, 'GetStationBlockingRules', array('fis' => 'FIS1'));
    checkRule($response['ok'] && count($response['data']) === 2 && !isset($response['data'][0]['disabled']), 'Incorrect list contract');
    $bad = $payload; $bad['mode'] = 'unknown';
    $response = requestRule($cases, 'SetStationBlocking', $bad); checkRule($response['code'] === 400, 'Invalid mode accepted');
    $bad = $payload; unset($bad['mode']);
    $response = requestRule($cases, 'SetStationBlocking', $bad); checkRule($response['code'] === 400, 'Missing mode silently defaulted');
    $bad = $payload; $bad['disabled'] = 'false';
    $response = requestRule($cases, 'SetStationBlocking', $bad); checkRule($response['code'] === 400, 'Non-boolean accepted');
    $bad = $payload; $bad['station'] = '../FTS';
    $response = requestRule($cases, 'SetStationBlocking', $bad); checkRule($response['code'] === 400, 'Invalid selector accepted');
    $bad = $payload; $bad['fis'] = 'FIS2';
    $response = requestRule($cases, 'SetStationBlocking', $bad); checkRule($response['code'] === 409, 'Wrong FIS accepted');
    $writeAllowed = false;
    $response = requestRule($cases, 'SetStationBlocking', $payload); checkRule($response['code'] === 403, 'Unauthorized write accepted');
    $writeAllowed = true; $method = 'GET';
    $response = requestRule($cases, 'DeleteStationBlockingRule', $payload); checkRule($response['code'] === 405, 'GET mutation accepted');
    $method = 'POST'; $database->failAudit = true;
    $before = $database->rules;
    $response = requestRule($cases, 'DeleteStationBlockingRule', $payload);
    checkRule($response['code'] === 500 && $database->rules === $before, 'Audit failure did not roll back rule');
    $database->failAudit = false;
    $response = requestRule($cases, 'DeleteStationBlockingRule', $payload);
    checkRule($response['ok'] && !isset($database->rules['FIS1|prefix|FTS']), 'Rule deletion failed');
    $last = $database->history[count($database->history) - 1];
    checkRule($last[2] === 'INHERIT' && $last[5] === 'DeleteStationBlockingRule', 'Deletion audit incorrect');
    $count = count($database->history);
    requestRule($cases, 'DeleteStationBlockingRule', $payload);
    checkRule(count($database->history) === $count, 'Idempotent deletion created audit');
    $override = array('fis' => 'FIS1', 'mode' => 'fis', 'station' => 'ALL', 'disabled' => true);
    $before = $database->rules;
    $response = requestRule($cases, 'SetStationBlocking', $override);
    checkRule($response['ok'] && $database->rules['FIS1|fis|ALL'][2] === 1, 'FIS disable override not saved');
    $last = $database->history[count($database->history) - 1];
    checkRule($last[1] === 'BLOCKING_POLICY:fis' && $last[2] === 'DISABLED' && $last[5] === 'DisableStationBlocking', 'FIS override audit incorrect');
    $count = count($database->history);
    requestRule($cases, 'SetStationBlocking', $override);
    checkRule(count($database->history) === $count, 'Override no-op created audit');
    $response = requestRule($cases, 'GetStationBlockingRules', array('fis' => 'FIS1'));
    $found = false;
    foreach ($response['data'] as $row) if ($row['mode'] === 'fis') $found = $row['disabled'] === true;
    checkRule($found, 'List did not expose disabled override');
    $override['disabled'] = false;
    $database->failAudit = true;
    $response = requestRule($cases, 'SetStationBlocking', $override);
    checkRule($response['code'] === 500 && $database->rules['FIS1|fis|ALL'][2] === 1, 'Override update did not roll back');
    $database->failAudit = false;
    $response = requestRule($cases, 'SetStationBlocking', $override);
    checkRule($response['ok'] && $database->rules['FIS1|fis|ALL'][2] === 0, 'FIS enable override not saved');
    requestRule($cases, 'DeleteStationBlockingRule', $override);
    checkRule($database->rules === $before, 'Returning to rules changed saved station rules');
    foreach (array(null, 'false', 1) as $invalid) {
        $bad = $override; $bad['disabled'] = $invalid;
        $response = requestRule($cases, 'SetStationBlocking', $bad);
        checkRule($response['code'] === 400, 'Invalid FIS override boolean accepted');
    }
    $bad = $override; $bad['station'] = 'FTS';
    $response = requestRule($cases, 'SetStationBlocking', $bad);
    checkRule($response['code'] === 400, 'Non-canonical FIS selector accepted');
    $bad = $override; $bad['fis'] = 'FIS2';
    $response = requestRule($cases, 'SetStationBlocking', $bad);
    checkRule($response['code'] === 409, 'Cross-FIS override accepted');
    $bad = $single; $bad['disabled'] = true;
    $response = requestRule($cases, 'SetStationBlocking', $bad);
    checkRule($response['code'] === 400, 'Disabled single rule accepted');
    foreach (array(array(), array('support_group'), array('testeng'), array('proceng'), array('golden_samples'), array('ADMIN_GROUP')) as $deniedGroups) {
        $userGroups = $deniedGroups;
        $beforeRules = $database->rules; $beforeHistory = $database->history;
        foreach (array('SetStationBlocking', 'DeleteStationBlockingRule') as $overrideJob) {
            $response = requestRule($cases, $overrideJob, $override);
            checkRule($response['code'] === 403, 'Non-admin FIS override mutation accepted');
            checkRule($database->rules === $beforeRules && $database->history === $beforeHistory, 'Denied override mutation changed data');
        }
        $response = requestRule($cases, 'GetStationBlockingRules', array('fis' => 'FIS1'));
        checkRule($response['ok'], 'Non-admin cannot read blocking settings');
    }
    $userGroups = array('testeng');
    $response = requestRule($cases, 'SetStationBlocking', array('fis' => 'FIS1', 'station' => 'OTHER01', 'mode' => 'single'));
    checkRule($response['ok'], 'Station rule permissions were unintentionally restricted');
    foreach (array('FIS1', 'FIS2') as $targetFis) {
        $serverFis = $targetFis;
        $override['fis'] = $targetFis;
        foreach (array('admin_group', 'fisadmin_group') as $allowedGroup) {
            $userGroups = array($allowedGroup);
            foreach (array(false, true) as $disabledValue) {
                $override['disabled'] = $disabledValue;
                $response = requestRule($cases, 'SetStationBlocking', $override);
                checkRule($response['ok'], 'Admin cannot set FIS override');
            }
            $response = requestRule($cases, 'DeleteStationBlockingRule', $override);
            checkRule($response['ok'], 'Admin cannot restore saved FIS rules');
        }
    }
    echo 'PASS ' . $endpoint . " station blocking contract\n";
}
