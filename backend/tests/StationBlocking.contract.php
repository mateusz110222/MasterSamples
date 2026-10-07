<?php
// Standalone PHP 5.3-compatible contract tests. No FIS, database or file locks.
// Executes the actual switch cases from BOTH endpoints with a database double.
// Run: php backend/tests/StationBlocking.contract.php
class ContractResponse extends Exception {
    public $response;
    public function __construct($ok, $data, $code) {
        parent::__construct('response');
        $this->response = array('ok' => $ok, 'data' => $data, 'code' => $code);
    }
}
class Lib {
    static function ShowDebug($file, $message) {}
    static function ShowError($file, $message) {}
}
define('FILENAME', 'StationBlocking.contract');
function sendJsonResponse($ok, $message, $data = null, $code = 200) { throw new ContractResponse($ok, $data, $code); }
function requireWriteAccess() {
    if (!$GLOBALS['writeAllowed']) sendJsonResponse(false, 'Forbidden', null, 403);
    if ($GLOBALS['method'] !== 'POST') sendJsonResponse(false, 'POST required', null, 405);
}
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
    function close() {}
}
function requestRule($cases, $job, $input) {
    try { eval('switch ($job) {' . $cases . '}'); }
    catch (ContractResponse $response) { return $response->response; }
    catch (Exception $error) { return array('ok' => false, 'code' => 500, 'data' => null); }
    throw new Exception('Endpoint did not respond');
}
function checkRule($condition, $message) { if (!$condition) throw new Exception($message); }
foreach (array('MasterDashboard.php', 'FIS2/MasterDashboard.php') as $endpoint) {
    $source = file_get_contents(dirname(__FILE__) . '/../' . $endpoint);
    $start = strpos($source, "        case 'GetStationBlockingRules':");
    $end = strpos($source, "        case 'UpdateMaster':", $start);
    checkRule($start !== false && $end !== false, 'Missing station rule cases');
    $cases = substr($source, $start, $end - $start);
    $database = new ContractDatabase(); $serverFis = 'FIS1'; $writeAllowed = true; $method = 'POST';
    $payload = array('fis' => 'FIS1', 'station' => 'FTS', 'mode' => 'prefix');
    $response = requestRule($cases, 'SetStationBlocking', $payload);
    checkRule($response['ok'] && count($database->rules) === 1, 'Prefix was not saved');
    checkRule($database->history[0] === array('FTS', 'BLOCKING_POLICY:prefix', 'ENABLED', 'FIS1', 'Test Operator', 'EnableStationBlocking'), 'Incorrect audit fields');
    requestRule($cases, 'SetStationBlocking', $payload);
    checkRule(count($database->history) === 1, 'No-op created audit');
    $single = array('fis' => 'FIS1', 'station' => 'FTS001');
    requestRule($cases, 'SetStationBlocking', $single);
    checkRule(isset($database->rules['FIS1|single|FTS001']) && $database->rules['FIS1|single|FTS001'][2] === 0, 'Enabled single exception was not retained');
    $response = requestRule($cases, 'GetStationBlockingRules', array('fis' => 'FIS1'));
    checkRule($response['ok'] && count($response['data']) === 2 && !isset($response['data'][0]['disabled']), 'Incorrect list contract');
    $bad = $payload; $bad['mode'] = 'unknown';
    $response = requestRule($cases, 'SetStationBlocking', $bad); checkRule($response['code'] === 400, 'Invalid mode accepted');
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
    echo 'PASS ' . $endpoint . " station blocking contract\n";
}
