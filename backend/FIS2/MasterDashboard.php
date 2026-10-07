<?php
/** @noinspection SqlNoDataSourceInspection */
/** @noinspection SqlResolve */
/** @noinspection DuplicatedCode */
/** @noinspection PhpUnreachableStatementInspection */
/** @noinspection PhpUnhandledExceptionInspection */
/** @noinspection PhpDocMissingThrowsInspection */
/** @noinspection AutoloadingIssuesInspection */
/** @noinspection PhpIllegalPsrClassPathInspection */
/** @noinspection PhpMultipleClassesDeclarationsInOneFile */
/** @noinspection PhpUnused */
/** @noinspection SpellCheckingInspection */

/**
 * Master Samples Dashboard Backend API — FIS 2 dedicated endpoint (PHP 5.3.3 compatible)
 * Production host: plblofis2.global.borgwarner.net
 * Production path: /custom/matz/php/MasterDashboard.php
 *
 * Dedicated exclusively to FIS 2 operations:
 * - CreateMaster: registers and creates master unit in FIS 2 and database
 * - DeleteMaster: unlinks/deletes master unit from FIS 2 (and database if not fisOnly)
 * - GetBlockedMachines / DeleteBlockedMachine: local station lock files
 * - Ping: diagnostics/health-check
 */

use BuildingBlocks\Archive;
use BuildingBlocks\Lib;
use BuildingBlocks\Unit;

date_default_timezone_set('Europe/Warsaw');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-User, X-User-Name, X-User-Groups, Accept, Origin');

define('FILENAME', basename(__FILE__, '.php'));
define('BLOCKED_MACHINES_DIR', '/fis/mantis/data/blocked_machines/');

if (!function_exists('http_response_code')) {
    function http_response_code($code = null)
    {
        static $currentCode = 200;
        if ($code !== null) {
            $currentCode = (int)$code;
            header('X-PHP-Response-Code: ' . $currentCode, true, $currentCode);
        }
        return $currentCode;
    }
}

if (!function_exists('str_contains')) {
    function str_contains($haystack, $needle)
    {
        return $needle !== '' && strpos($haystack, $needle) !== false;
    }
}

$reqMethod = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '';
if ($reqMethod === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function getAllowedGroups()
{
    return array(
        'admin_group',
        'support_group',
        'fisadmin_group',
        'testeng',
        'proceng',
        'golden_samples'
    );
}

function sendJsonResponse($status, $message, $data = null, $statusCode = 200)
{
    http_response_code($statusCode);
    echo json_encode(array(
        'status' => (bool)$status,
        'message' => $message,
        'data' => $data
    ));
    exit;
}

final class ApiOperationException extends RuntimeException
{
    public $publicMessage;
    public $statusCode;
    public $responseData;

    public function __construct($publicMessage, $statusCode = 500, $responseData = null, Exception $previous = null)
    {
        $this->publicMessage = $publicMessage;
        $this->statusCode = (int)$statusCode;
        $this->responseData = $responseData;
        parent::__construct($publicMessage, 0, $previous);
    }
}

try {
    $buildingBlocksCandidates = array(
        __DIR__ . '/../phpBB/BuildingBlocks.php', // production: /custom/matz/phpBB
        __DIR__ . '/BuildingBlocks.php',          // repository main backend
        __DIR__ . '/../BuildingBlocks.php'        // repository FIS2 deployment copy
    );
    $buildingBlocksPath = null;
    foreach ($buildingBlocksCandidates as $candidate) {
        if (is_file($candidate)) {
            $buildingBlocksPath = $candidate;
            break;
        }
    }
    if ($buildingBlocksPath === null) {
        throw new RuntimeException('BuildingBlocks.php was not found in any supported location.');
    }
    require_once $buildingBlocksPath;
} catch (Exception $error) {
    Lib::ShowError(FILENAME, print_r($error, true));
    sendJsonResponse(false, 'Nie udało się załadować biblioteki FIS BuildingBlocks.', null, 500);
}

function getDbConnection($defaultDb = 'masterSample')
{
    $configPath = '/fis/mantis/custom/database/config.ini';
    $host = '127.0.0.1';
    $user = 'root';
    $password = '';
    $dbName = $defaultDb;

    if (is_file($configPath)) {
        $parsed = @parse_ini_file($configPath, true);
        if ($parsed && isset($parsed['database']['host'], $parsed['database']['user'])) {
            $host = (string)$parsed['database']['host'];
            $user = (string)$parsed['database']['user'];
            $password = isset($parsed['database']['password']) ? (string)$parsed['database']['password'] : '';
        }
    } else {
        $envHost = getenv('DB_HOST');
        $envUser = getenv('DB_USER');
        $envPass = getenv('DB_PASSWORD');
        $host = !empty($envHost) ? $envHost : '127.0.0.1';
        $user = !empty($envUser) ? $envUser : 'root';
        $password = !empty($envPass) ? $envPass : '';
    }

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $mysqli = new mysqli($host, $user, $password, $dbName);
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

function dbBegin(mysqli $mysqli)
{
    $mysqli->query("START TRANSACTION");
}

function dbCommit(mysqli $mysqli)
{
    $mysqli->query("COMMIT");
}

function dbRollback(mysqli $mysqli)
{
    $mysqli->query("ROLLBACK");
}

function stmtFetchAssoc(mysqli_stmt $stmt)
{
    if (method_exists($stmt, 'get_result')) {
        $res = $stmt->get_result();
        return $res ? $res->fetch_assoc() : null;
    }
    $stmt->store_result();
    $meta = $stmt->result_metadata();
    if (!$meta) {
        return null;
    }
    $fields = array();
    $row = array();
    while ($field = $meta->fetch_field()) {
        $fields[] = &$row[$field->name];
    }
    call_user_func_array(array($stmt, 'bind_result'), $fields);
    $result = null;
    if ($stmt->fetch()) {
        $result = array_merge(array(), $row);
    }
    return $result;
}

function cleanUsername($username)
{
    $str = trim((string)$username);
    if ($str === '') {
        return '';
    }
    $slashPos = strrpos($str, '\\');
    if ($slashPos !== false) {
        $str = substr($str, $slashPos + 1);
    }
    $atPos = strpos($str, '@');
    if ($atPos !== false) {
        $str = substr($str, 0, $atPos);
    }
    return trim($str);
}

function normalizeFisValue($fis)
{
    $value = strtoupper(trim((string)$fis));
    return $value === 'FIS2' ? 'FIS2' : 'FIS1';
}

function getServerFis()
{
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : (isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : '');
    if (strpos($host, 'plblofis1') !== false) {
        return 'FIS1';
    }
    if (strpos($host, 'plblofis2') !== false) {
        return 'FIS2';
    }
    $addr = isset($_SERVER['SERVER_ADDR']) ? $_SERVER['SERVER_ADDR'] : '';
    if (strpos($addr, '10.142.11.20') !== false) {
        return 'FIS1';
    }
    if (strpos($addr, '10.142.11.30') !== false) {
        return 'FIS2';
    }
    return null;
}

function getRequestData()
{
    static $input = null;
    if ($input !== null) {
        return $input;
    }

    $contentType = '';
    if (isset($_SERVER['CONTENT_TYPE'])) {
        $contentType = $_SERVER['CONTENT_TYPE'];
    } elseif (isset($_SERVER['HTTP_CONTENT_TYPE'])) {
        $contentType = $_SERVER['HTTP_CONTENT_TYPE'];
    }

    $form = null;
    if (is_callable(array('BuildingBlocks\\Lib', 'getForm'))) {
        try {
            $form = Lib::getForm($contentType, FILENAME);
        } catch (Exception $e) {
            $form = null;
        }
    }

    if (!is_array($form) || empty($form)) {
        $raw = file_get_contents('php://input');
        if (!empty($raw)) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $form = $decoded;
            }
        }
    }

    if (!is_array($form) || empty($form)) {
        if (isset($GLOBALS['HTTP_RAW_POST_DATA']) && !empty($GLOBALS['HTTP_RAW_POST_DATA'])) {
            $decoded = json_decode($GLOBALS['HTTP_RAW_POST_DATA'], true);
            if (is_array($decoded)) {
                $form = $decoded;
            }
        }
    }

    if (!is_array($form) || empty($form)) {
        if (!empty($_POST)) {
            $form = $_POST;
        }
    }

    if (!is_array($form)) {
        $form = array();
    }

    $input = array_merge($_GET, $form);
    return $input;
}

function getParam(array $source)
{
    $args = func_get_args();
    array_shift($args);
    foreach ($args as $key) {
        if (is_string($key) && $key !== '' && isset($source[$key]) && $source[$key] !== '') {
            return $source[$key];
        }
    }
    foreach ($args as $key) {
        if (is_string($key) && $key !== '' && isset($_REQUEST[$key]) && $_REQUEST[$key] !== '') {
            return $_REQUEST[$key];
        }
    }
    return '';
}

function isMissingFisUnitError(Exception $error)
{
    for ($current = $error; $current !== null; $current = $current->getPrevious()) {
        $message = strtolower($current->getMessage());
        if (strpos($message, 'no such unit') !== false
            || strpos($message, 'unit not found') !== false
            || strpos($message, "unit doesn't exist") !== false) {
            return true;
        }
    }
    return false;
}

function formatOperationError($operation, $stage, $unit, $fis, Exception $error, $state = null)
{
    $message = sprintf(
        "%s failed [stage=%s, unit='%s', fis=%s, exception=%s, code=%d]: %s",
        $operation,
        $stage,
        $unit,
        $fis,
        get_class($error),
        (int)$error->getCode(),
        $error->getMessage()
    );

    return $state !== null ? $message . ' | state: ' . $state : $message;
}

function getAuthenticatedUser()
{
    if (!empty($_SERVER['HTTP_X_USER'])) {
        $headerUser = cleanUsername(rawurldecode((string)$_SERVER['HTTP_X_USER']));
        if ($headerUser !== '') {
            return $headerUser;
        }
    }

    $input = getRequestData();
    $inputUser = cleanUsername(getParam($input, 'user', 'userId'));
    if ($inputUser !== '') {
        return $inputUser;
    }

    $envRemote = getenv('REMOTE_USER');
    $srvRemote = isset($_SERVER['REMOTE_USER']) ? $_SERVER['REMOTE_USER'] : (isset($_SERVER['AUTH_USER']) ? $_SERVER['AUTH_USER'] : '');
    $remote = !empty($envRemote) ? $envRemote : $srvRemote;
    $remoteUser = cleanUsername($remote);
    if ($remoteUser !== '') {
        return $remoteUser;
    }

    return '';
}

function getUserGroups($userId)
{
    $userId = cleanUsername($userId);
    $groups = array();

    // 1. Sprawdzenie grup w lokalnej bazie FIS (jeśli użytkownik istnieje w FIS)
    if ($userId !== '') {
        try {
            $dbGroups = Lib::GetUserGroup($userId);
            if (is_array($dbGroups) && !empty($dbGroups)) {
                $groups = array_values(array_map('strval', $dbGroups));
            }
        } catch (Exception $error) {
            Lib::ShowError(FILENAME, "Lib::GetUserGroup failed for '$userId': " . $error->getMessage());
        }
    }

    // 2. Fallback: nagłówek HTTP X-User-Groups przesłany przez frontend (autoryzacja Paletki/LDAP na FIS 1)
    if (empty($groups) && !empty($_SERVER['HTTP_X_USER_GROUPS'])) {
        $rawHeader = rawurldecode((string)$_SERVER['HTTP_X_USER_GROUPS']);
        $parts = explode(',', $rawHeader);
        foreach ($parts as $p) {
            $trimmed = trim($p);
            if ($trimmed !== '') {
                $groups[] = $trimmed;
            }
        }
    }

    // 3. Fallback: pole userGroups w ciele żądania JSON
    if (empty($groups)) {
        $input = getRequestData();
        $inputGroups = isset($input['userGroups']) ? $input['userGroups'] : null;
        if (is_array($inputGroups)) {
            foreach ($inputGroups as $p) {
                $trimmed = trim((string)$p);
                if ($trimmed !== '') {
                    $groups[] = $trimmed;
                }
            }
        } elseif (is_string($inputGroups) && trim($inputGroups) !== '') {
            $parts = explode(',', $inputGroups);
            foreach ($parts as $p) {
                $trimmed = trim($p);
                if ($trimmed !== '') {
                    $groups[] = $trimmed;
                }
            }
        }
    }

    return array_values(array_unique($groups));
}

function requireWriteAccess()
{
    $req = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '';
    if ($req !== 'POST') {
        Lib::ShowError(FILENAME, "requireWriteAccess denied: Method is '$req', POST required");
        sendJsonResponse(false, 'Ta operacja wymaga metody POST', null, 405);
    }

    $userId = getAuthenticatedUser();
    if ($userId === '') {
        Lib::ShowError(FILENAME, "requireWriteAccess denied: No authenticated user");
        sendJsonResponse(false, 'Brak uwierzytelnionego użytkownika', null, 401);
    }

    $userGroups = getUserGroups($userId);
    $matched = array_intersect($userGroups, getAllowedGroups());
    if (empty($matched)) {
        Lib::ShowError(FILENAME, "requireWriteAccess denied for user '$userId'. Groups: [" . implode(', ', $userGroups) . "]");
        sendJsonResponse(false, 'Brak uprawnień do wykonania tej operacji', null, 403);
    }

    Lib::ShowDebug(FILENAME, "requireWriteAccess authorized for user '$userId'");
    return $userId;
}


/**
 * Record a station unlock in the existing history table.
 * SQL and the filesystem cannot share a transaction: report a commit failure
 * after unlink explicitly, without recreating a potentially obsolete lock.
 */
function unlockMachineWithAudit($targetPath, $record, $fis)
{
    $separator = strrpos($record, '_');
    $machine = $separator !== false ? substr($record, 0, $separator) : $record;
    $lockType = $separator !== false ? substr($record, $separator + 1) : 'MASTER';
    if (!preg_match('/^.{1,100}$/usD', $machine) || !preg_match('/^.{1,100}$/usD', $lockType)) {
        throw new ApiOperationException('Nazwa maszyny lub typ blokady nie mieści się w rejestrze audytu', 400);
    }
    $operator = getOperatorName();
    $db = getDbConnection();
    $removed = false;
    try {
        $db->query('START TRANSACTION');
        $stmt = $db->prepare("INSERT INTO history
            (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`)
            VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, 'UnlockStation', NOW())");
        $stmt->bind_param('ssss', $machine, $lockType, $fis, $operator);
        $stmt->execute();
        if ($stmt->affected_rows !== 1) {
            throw new Exception('Station unlock audit insert failed');
        }
        $stmt->close();
        if (is_link($targetPath) || !is_file($targetPath) || !@unlink($targetPath)) {
            throw new ApiOperationException("Nie udało się usunąć blokady '$record'", 500);
        }
        $removed = true;
        $db->query('COMMIT');
    } catch (Exception $err) {
        try { $db->query('ROLLBACK'); } catch (Exception $rollbackError) {
            Lib::ShowError(FILENAME, '[UnlockStation] Rollback failed: ' . $rollbackError->getMessage());
        }
        $db->close();
        if ($removed) {
            Lib::ShowError(FILENAME, "[UnlockStation] Block removed but audit commit not confirmed: fis='$fis', record='$record', operator='$operator': " . $err->getMessage());
            throw new ApiOperationException('Blokada została zdjęta, ale nie potwierdzono zapisu audytu. Sprawdź historię i logi.', 500,
                array('unlocked' => true, 'audit_confirmed' => false), $err);
        }
        throw $err;
    }
    $db->close();
    Lib::ShowDebug(FILENAME, "[UnlockStation] Audited unlock: fis='$fis', record='$record', operator='$operator'");
}

function getOperatorName()
{
    if (!empty($_SERVER['HTTP_X_USER_NAME'])) {
        $name = trim(rawurldecode((string)$_SERVER['HTTP_X_USER_NAME']));
        if ($name !== '') {
            return $name;
        }
    }

    $input = getRequestData();
    $name = trim((string)getParam($input, 'userName', 'userFullName', 'operatorName'));
    if ($name !== '') {
        return $name;
    }

    $user = getAuthenticatedUser();
    return $user !== '' ? $user : 'SYSTEM';
}

$input = getRequestData();
$job = (string)getParam($input, 'job');
if ($job === '' && isset($_GET['job'])) {
    $job = (string)$_GET['job'];
}

if ($job === '') {
    Lib::ShowError(FILENAME, "Incoming request without 'job' parameter from IP " . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'));
    sendJsonResponse(false, 'Brak parametru job', null, 400);
}

Lib::ShowDebug(FILENAME, "[Request] job='$job', method=" . (isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '') . ", user='" . getAuthenticatedUser() . "', IP=" . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'));

try {
    switch ($job) {
        case 'Ping':
            $authU = getAuthenticatedUser();
            sendJsonResponse(true, 'FIS2 MasterDashboard endpoint aktywny', array(
                'php_version' => PHP_VERSION,
                'server_fis' => getServerFis(),
                'user' => $authU,
                'groups' => getUserGroups($authU),
                'input_keys' => array_keys($input),
            ));
            break;

        case 'GetBlockedMachines':
            if (!is_dir(BLOCKED_MACHINES_DIR) || !is_readable(BLOCKED_MACHINES_DIR)) {
                sendJsonResponse(false, 'Katalog blokad FIS 2 jest niedostępny', null, 500);
            }
            $files = scandir(BLOCKED_MACHINES_DIR);
            if ($files === false) {
                sendJsonResponse(false, 'Nie można odczytać blokad FIS 2', null, 500);
            }
            $items = array();
            foreach ($files as $file) {
                if ($file === '.' || $file === '..' || strpos($file, '10.237.') !== false) {
                    continue;
                }
                $fullPath = BLOCKED_MACHINES_DIR . $file;
                if (is_link($fullPath) || !is_file($fullPath)) {
                    continue;
                }
                $lastUnderscore = strrpos($file, '_');
                $machine = $lastUnderscore !== false ? substr($file, 0, $lastUnderscore) : $file;
                $prefix = $lastUnderscore !== false ? substr($file, $lastUnderscore + 1) : 'MASTER';
                $mtime = filemtime($fullPath);
                $items[] = array(
                    'id' => $file,
                    'filename' => $file,
                    'machine' => $machine !== '' ? $machine : 'UNKNOWN',
                    'prefix' => $prefix !== '' ? $prefix : 'MASTER',
                    'blockedAt' => $mtime ? date('Y-m-d H:i:s', $mtime) : null,
                    'size' => filesize($fullPath),
                    'FIS' => 'FIS2'
                );
            }
            sendJsonResponse(true, 'Pobrano zablokowane maszyny FIS 2', $items);
            break;

        case 'DeleteBlockedMachine':
            $user = requireWriteAccess();
            $record = trim((string)getParam($input, 'record', 'filename'));
            if ($record === '' || $record === '.' || $record === '..' ||
                strpos($record, '/') !== false || strpos($record, chr(92)) !== false || strpos($record, chr(0)) !== false) {
                sendJsonResponse(false, 'Nieprawidłowa nazwa pliku blokady', null, 400);
            }
            $targetPath = BLOCKED_MACHINES_DIR . $record;
            if (is_link($targetPath) || !is_file($targetPath)) {
                sendJsonResponse(false, "Plik blokady '$record' nie istnieje lub nie jest zwykłym plikiem", null, 404);
            }
            Lib::ShowDebug(FILENAME, "[DeleteBlockedMachine] Unblocking FIS2 record='$record' by user='$user'");
            unlockMachineWithAudit($targetPath, $record, 'FIS2');
            sendJsonResponse(true, "Blokada dla '$record' została pomyślnie usunięta i zapisana w audycie!");
            break;

        case 'GetStationBlockingRules':
        case 'SetStationBlocking':
        case 'DeleteStationBlockingRule': {
            if ($job !== 'GetStationBlockingRules') {
                requireWriteAccess();
            }
            $fis = isset($input['fis']) && is_string($input['fis']) ? strtoupper(trim($input['fis'])) : '';
            if (!in_array($fis, array('FIS1', 'FIS2'), true)) {
                sendJsonResponse(false, 'Nieprawidłowy serwer FIS', null, 400);
            }
            $serverFis = getServerFis();
            if ($serverFis !== null && $serverFis !== $fis) {
                sendJsonResponse(false, 'Żądanie trafiło do niewłaściwego FIS', null, 409);
            }
            if ($job !== 'GetStationBlockingRules') {
                $mode = isset($input['mode']) ? $input['mode'] : 'single';
                $station = isset($input['station']) && is_string($input['station']) ? trim($input['station']) : '';
                if (!in_array($mode, array('single', 'prefix'), true) ||
                    !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/D', $station) ||
                    ($job === 'SetStationBlocking' && isset($input['disabled']) && $input['disabled'] !== false)) {
                    sendJsonResponse(false, 'Nieprawidłowa stacja, prefix, zakres lub ustawienie blokowania', null, 400);
                }
            }
            $mysqli = getDbConnection();
            try {
                if ($job === 'GetStationBlockingRules') {
                    $stmt = $mysqli->prepare('SELECT station, mode, disabled, FIS, user, `date` FROM stationBlockingRules WHERE FIS = ? ORDER BY mode, station');
                    $stmt->bind_param('s', $fis);
                    $stmt->execute();
                    $stmt->bind_result($station, $mode, $disabled, $rowFis, $operator, $date);
                    $rows = array();
                    while ($stmt->fetch()) {
                        $rows[] = array('station' => $station, 'mode' => $mode,
                            'FIS' => $rowFis, 'user' => $operator, 'date' => $date);
                    }
                    $stmt->close();
                    $mysqli->close();
                    sendJsonResponse(true, 'Pobrano reguły blokowania stacji', $rows);
                }
                $operator = getOperatorName();
                $mysqli->query('START TRANSACTION');
                $check = $mysqli->prepare('SELECT disabled FROM stationBlockingRules WHERE FIS = ? AND mode = ? AND station = ? FOR UPDATE');
                $check->bind_param('sss', $fis, $mode, $station);
                $check->execute();
                $check->bind_result($oldDisabled);
                $exists = $check->fetch();
                $check->close();
                $deleting = $job === 'DeleteStationBlockingRule';
                $disabled = 0; // Presence of a rule enables blocking.
                $changed = $deleting ? (bool)$exists : (!$exists || (int)$oldDisabled !== $disabled);
                if ($changed) {
                    if ($deleting) {
                        $stmt = $mysqli->prepare('DELETE FROM stationBlockingRules WHERE FIS = ? AND mode = ? AND station = ?');
                        $stmt->bind_param('sss', $fis, $mode, $station);
                        $operation = 'DeleteStationBlockingRule';
                        $auditStatus = 'INHERIT';
                    } else {
                        $stmt = $mysqli->prepare('INSERT INTO stationBlockingRules (FIS, mode, station, disabled, user, `date`) VALUES (?, ?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE disabled = VALUES(disabled), user = VALUES(user), `date` = NOW()');
                        $stmt->bind_param('sssis', $fis, $mode, $station, $disabled, $operator);
                        $operation = 'EnableStationBlocking';
                        $auditStatus = 'ENABLED';
                    }
                    $stmt->execute();
                    $stmt->close();
                    $auditProcess = 'BLOCKING_POLICY:' . $mode;
                    $audit = $mysqli->prepare("INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, NOW())");
                    $audit->bind_param('ssssss', $station, $auditProcess, $auditStatus, $fis, $operator, $operation);
                    $audit->execute();
                    if ($audit->affected_rows !== 1) {
                        throw new Exception('Station blocking audit insert failed');
                    }
                    $audit->close();
                }
                $mysqli->query('COMMIT');
                $mysqli->close();
            } catch (Exception $err) {
                try { $mysqli->query('ROLLBACK'); } catch (Exception $rollbackError) {
                    Lib::ShowError(FILENAME, '[StationBlocking] Rollback failed: ' . $rollbackError->getMessage());
                }
                $mysqli->close();
                $mysqli = null;
                throw $err;
            }
            Lib::ShowDebug(FILENAME, "[StationBlocking] job='$job', fis='$fis', mode='$mode', station='$station', operator='$operator', changed=" . ($changed ? '1' : '0'));
            sendJsonResponse(true, 'Zapisano regułę blokowania stacji', array('changed' => $changed));
            break;
        }

        case 'UpdateMaster': {
            requireWriteAccess();
            foreach (array('unit', 'fis', 'process') as $key) {
                if (!isset($input[$key]) || !is_string($input[$key]) || trim($input[$key]) === '') {
                    sendJsonResponse(false, 'Numer mastera, FIS i procesy są wymagane', null, 400);
                }
            }
            $unit = trim($input['unit']);
            $fis = strtoupper(trim($input['fis']));
            if (!in_array($fis, array('FIS1', 'FIS2'), true)) {
                sendJsonResponse(false, 'Nieprawidłowy serwer FIS', null, 400);
            }
            $serverFis = getServerFis();
            if ($serverFis !== null && $serverFis !== $fis) {
                sendJsonResponse(false, 'Żądanie edycji trafiło do niewłaściwego FIS', null, 409);
            }
            $processes = array();
            foreach (explode(',', $input['process']) as $process) {
                $process = trim($process);
                if ($process === '') {
                    sendJsonResponse(false, 'Lista procesów zawiera pustą nazwę', null, 400);
                }
                if (!in_array($process, $processes, true)) {
                    $processes[] = $process;
                }
            }
            $processClean = implode(',', $processes);
            if (!preg_match('/^.{1,100}$/usD', $processClean)) {
                sendJsonResponse(false, 'Lista procesów może mieć maksymalnie 100 znaków', null, 400);
            }
            $limits = array();
            foreach (array('maxCounter', 'maxErrors') as $key) {
                $value = isset($input[$key]) ? $input[$key] : null;
                if ((!is_int($value) && !is_string($value)) || !preg_match('/^[0-9]+$/D', (string)$value) ||
                    (float)$value < 1 || (float)$value > 2147483647) {
                    sendJsonResponse(false, 'Limity muszą być dodatnimi liczbami całkowitymi do 2147483647', null, 400);
                }
                $limits[$key] = (int)$value;
            }
            $maxCounter = $limits['maxCounter'];
            $maxErrors = $limits['maxErrors'];
            $operatorName = getOperatorName();
            $mysqli = getDbConnection();
            try {
                $mysqli->query('START TRANSACTION');
                $check = $mysqli->prepare('SELECT process, maxCounter, errorMaxCounter, FIS FROM masterUnits WHERE unit = ? FOR UPDATE');
                $check->bind_param('s', $unit);
                $check->execute();
                $check->bind_result($oldProcess, $oldMaxCounter, $oldMaxErrors, $storedFis);
                $exists = $check->fetch();
                $check->close();
                if (!$exists) {
                    throw new ApiOperationException('Master nie istnieje', 404);
                }
                if (strtoupper(trim((string)$storedFis)) !== $fis) {
                    throw new ApiOperationException('Master należy do innego FIS. Odśwież listę masterów.', 409);
                }
                $changed = $oldProcess !== $processClean || (int)$oldMaxCounter !== $maxCounter || (int)$oldMaxErrors !== $maxErrors;
                if ($changed) {
                    // Update only editable settings; counters, status and activity are retained.
                    $update = $mysqli->prepare('UPDATE masterUnits SET process = ?, maxCounter = ?, errorMaxCounter = ? WHERE unit = ?');
                    $update->bind_param('siis', $processClean, $maxCounter, $maxErrors, $unit);
                    $update->execute();
                    if ($update->affected_rows !== 1) {
                        throw new Exception('UpdateMaster did not update exactly one master');
                    }
                    $update->close();
                    $history = $mysqli->prepare("INSERT INTO history
                        (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`)
                        SELECT unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, ?, 'Update', NOW()
                        FROM masterUnits WHERE unit = ?");
                    $history->bind_param('ss', $operatorName, $unit);
                    $history->execute();
                    if ($history->affected_rows !== 1) {
                        throw new Exception('UpdateMaster did not create exactly one history entry');
                    }
                    $history->close();
                }
                $mysqli->query('COMMIT');
                $mysqli->close();
            } catch (Exception $err) {
                try { $mysqli->query('ROLLBACK'); } catch (Exception $rollbackError) {
                    Lib::ShowError(FILENAME, '[UpdateMaster] Rollback failed: ' . $rollbackError->getMessage());
                }
                $mysqli->close();
                $mysqli = null;
                throw $err;
            }
            Lib::ShowDebug(FILENAME, "[UpdateMaster] unit='$unit', fis='$fis', operator='$operatorName', changed=" . ($changed ? '1' : '0'));
            sendJsonResponse(true, 'Zapisano ustawienia mastera', array('unit' => $unit, 'changed' => $changed));
            break;
        }

        case 'CreateMaster':
            $user = requireWriteAccess();
            $unit = strtoupper(trim(getParam($input, 'unit', 'serialNumber')));
            $processList = trim(getParam($input, 'process', 'processName'));
            $statusInput = isset($input['status']) ? $input['status'] : 'GOOD';
            if (!is_string($statusInput)) {
                sendJsonResponse(false, 'Nieprawidłowy status. Dozwolone wartości: GOOD, BAD.', null, 400);
            }
            $status = strtoupper(trim($statusInput));
            $maxCounter = filter_var(isset($input['maxCounter']) ? $input['maxCounter'] : 1000, FILTER_VALIDATE_INT, array(
                'options' => array('min_range' => 1, 'max_range' => 2147483647)
            ));
            $rawErrors = isset($input['maxErrors']) ? $input['maxErrors'] : (isset($input['errorMaxCounter']) ? $input['errorMaxCounter'] : 50);
            $errorMaxCounter = filter_var($rawErrors, FILTER_VALIDATE_INT, array(
                'options' => array('min_range' => 1, 'max_range' => 2147483647)
            ));
            $forceUpdate = !empty($input['forceUpdate']);

            if (!in_array($status, array('GOOD', 'BAD'), true)) {
                sendJsonResponse(false, 'Nieprawidłowy status. Dozwolone wartości: GOOD, BAD.', null, 400);
            }
            if ($maxCounter === false || $errorMaxCounter === false) {
                sendJsonResponse(false, 'Limity muszą być dodatnimi liczbami całkowitymi do 2147483647.', null, 400);
            }

            if ($unit === '' || $processList === '') {
                Lib::ShowError(FILENAME, "[CreateMaster] Validation error: SN or process is empty (unit='$unit', process='$processList')");
                sendJsonResponse(false, 'Numer seryjny (SN) oraz proces są wymagane!', null, 400);
            }

            $fRaw = getParam($input, 'fis');
            $fisValue = $fRaw !== '' ? strtoupper(trim($fRaw)) : 'FIS2';
            if (!in_array($fisValue, array('FIS1', 'FIS2'), true)) {
                Lib::ShowError(FILENAME, "[CreateMaster] Invalid target FIS: '$fisValue'");
                sendJsonResponse(false, 'Nieprawidłowy serwer docelowy FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
            }

            $userKey2 = trim((string)getParam($input, 'userKey2', 'userkey2', 'pn'));

            $updFlag = $forceUpdate ? '1' : '0';
            Lib::ShowDebug(FILENAME, "[CreateMaster] Start unit='$unit', process='$processList', status='$status', fis='$fisValue', maxCounter=$maxCounter, maxErrors=$errorMaxCounter, forceUpdate=$updFlag, user='$user', userKey2='$userKey2'");

            $serverFis = getServerFis();
            if ($serverFis !== null && $serverFis !== $fisValue) {
                Lib::ShowError(FILENAME, "[CreateMaster] Target mismatch: request for $fisValue hit server $serverFis");
                sendJsonResponse(
                    false,
                    "Żądanie utworzenia dla $fisValue trafiło do $serverFis.",
                    array('expected_fis' => $fisValue),
                    409
                );
            }

            $processArray = array_filter(array_map('trim', explode(',', $processList)));
            $processClean = implode(',', $processArray);

            $mysqli = getDbConnection();
            $stmtCheck = $mysqli->prepare("SELECT unit, process, status, maxCounter, errorMaxCounter, isactive, FIS FROM masterUnits WHERE unit = ? LIMIT 1");
            $stmtCheck->bind_param('s', $unit);
            $stmtCheck->execute();
            $existing = stmtFetchAssoc($stmtCheck);
            $stmtCheck->close();

            if ($existing && !$forceUpdate) {
                $mysqli->close();
                Lib::ShowDebug(FILENAME, "[CreateMaster] Unit '$unit' already exists in database. Returning conflict comparison.");
                sendJsonResponse(true, 'Master o tym numerze już istnieje w bazie', array(
                    'exists' => true,
                    'oldData' => $existing,
                    'newData' => array(
                        'unit' => $unit,
                        'process' => $processClean,
                        'status' => $status,
                        'maxCounter' => $maxCounter,
                        'errorMaxCounter' => $errorMaxCounter,
                        'FIS' => $fisValue,
                        'userKey2' => $userKey2
                    )
                ));
            }

            $unitExistsInFis = false;
            $fisUnitDeleted = false;
            try {
                Unit::Find($unit);
                $unitExistsInFis = true;
            } catch (Exception $findError) {
                if (!isMissingFisUnitError($findError)) {
                    $mysqli->close();
                    Lib::ShowError(FILENAME, "[CreateMaster] Unit::Find failed for '$unit': " . $findError->getMessage());
                    throw new ApiOperationException(
                        formatOperationError('CreateMaster', 'Unit::Find', $unit, $fisValue, $findError),
                        502,
                        array('fis' => $fisValue, 'stage' => 'find'),
                        $findError
                    );
                }

                try {
                    Archive::GetAll($unit);
                    Archive::Unarchive($unit);
                    Unit::Find($unit);
                    $unitExistsInFis = true;
                } catch (Exception $archiveError) {
                    if (!isMissingFisUnitError($archiveError)) {
                        $mysqli->close();
                        Lib::ShowError(FILENAME, "[CreateMaster] Archive::Unarchive failed for '$unit': " . $archiveError->getMessage());
                        throw new ApiOperationException(
                            formatOperationError('CreateMaster', 'Archive::Unarchive', $unit, $fisValue, $archiveError),
                            502,
                            array('fis' => $fisValue, 'stage' => 'unarchive'),
                            $archiveError
                        );
                    }
                }
            }

            if ($unitExistsInFis) {
                try {
                    Unit::Delete($unit);
                    $fisUnitDeleted = true;
                    Lib::ShowDebug(FILENAME, "[CreateMaster] Existing unit '$unit' deleted from FIS prior to recreation");
                } catch (Exception $deleteError) {
                    $mysqli->close();
                    Lib::ShowError(FILENAME, "[CreateMaster] Deletion of existing unit '$unit' failed: " . $deleteError->getMessage());
                    throw new ApiOperationException(
                        formatOperationError('CreateMaster', 'Unit::Delete', $unit, $fisValue, $deleteError),
                        502,
                        array('fis' => $fisValue, 'stage' => 'delete_existing'),
                        $deleteError
                    );
                }
            }

            $creatorName = getOperatorName();
            $dcmods = 'MS_HISTORY|' . $unit . '_MASTER|MS_PROCESS|' . $processClean . '|MS_STATUS|' . $status . '|OPERATOR|' . $creatorName;
            try {
                Unit::DataEntry(
                    $unit,
                    "CREATEUNIT",
                    "WEB",
                    $dcmods,
                    "GOLD",
                    "",
                    $userKey2,
                    "GOLDEN"
                );
                Lib::ShowDebug(FILENAME, "[CreateMaster] Unit::DataEntry succeeded for '$unit'");
            } catch (Exception $dataEntryError) {
                $mysqli->close();
                Lib::ShowError(FILENAME, "[CreateMaster] Unit::DataEntry failed for '$unit': " . $dataEntryError->getMessage());
                $state = $fisUnitDeleted
                    ? 'previous_unit_deleted=true, new_unit_created=false; retry_required=true'
                    : 'previous_unit_deleted=false, new_unit_created=false';
                $message = formatOperationError(
                    'CreateMaster',
                    'Unit::DataEntry',
                    $unit,
                    $fisValue,
                    $dataEntryError,
                    $state
                );
                throw new ApiOperationException(
                    $message,
                    502,
                    array(
                        'fis' => $fisValue,
                        'stage' => 'create_unit',
                        'previous_unit_deleted' => $fisUnitDeleted,
                        'database_updated' => false
                    ),
                    $dataEntryError
                );
            }

            dbBegin($mysqli);
            try {
                $sqlUnit = "INSERT INTO masterUnits
                                (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, isactive, FIS)
                            VALUES
                                (?, ?, ?, 0, ?, 0, ?, 0, ?, 1, ?)
                            ON DUPLICATE KEY UPDATE
                                process = VALUES(process),
                                status = VALUES(status),
                                maxCounter = VALUES(maxCounter),
                                errorMaxCounter = VALUES(errorMaxCounter),
                                user = IF(user IS NULL OR user = '', VALUES(user), user),
                                FIS = VALUES(FIS),
                                isactive = 1";

                $stmtSave = $mysqli->prepare($sqlUnit);
                $stmtSave->bind_param('sssiiss', $unit, $processClean, $status, $maxCounter, $errorMaxCounter, $creatorName, $fisValue);
                $stmtSave->execute();
                $stmtSave->close();

                $operation = $existing ? 'Update' : 'Create';
                $sqlHist = "INSERT INTO history
                                (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`)
                            SELECT
                                unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, ?, ?, NOW()
                            FROM masterUnits WHERE unit = ?";
                $stmtHist = $mysqli->prepare($sqlHist);
                $stmtHist->bind_param('sss', $creatorName, $operation, $unit);
                $stmtHist->execute();
                $stmtHist->close();

                $stmtEng = $mysqli->prepare("INSERT IGNORE INTO engineers (process) VALUES (?)");
                $stmtEng->bind_param('s', $processClean);
                $stmtEng->execute();
                $stmtEng->close();

                dbCommit($mysqli);
                $mysqli->close();
                Lib::ShowDebug(FILENAME, "[CreateMaster] Succeeded: Master '$unit' saved in database and FIS ($operation)");

                $actionMsg = $existing ? "Master '$unit' został pomyślnie zaktualizowany!" : "Master '$unit' został pomyślnie utworzony i zarejestrowany!";
                sendJsonResponse(true, $actionMsg, array('unit' => $unit, 'operation' => $operation, 'FIS' => $fisValue));
            } catch (Exception $err) {
                dbRollback($mysqli);
                $mysqli->close();
                Lib::ShowError(FILENAME, "[CreateMaster] Database transaction failed for '$unit': " . $err->getMessage());
                throw new ApiOperationException(
                    formatOperationError(
                        'CreateMaster',
                        'database_save',
                        $unit,
                        $fisValue,
                        $err,
                        'fis_updated=true, database_updated=false; retry_required=true'
                    ),
                    500,
                    array(
                        'fis' => $fisValue,
                        'stage' => 'database_save',
                        'fis_updated' => true,
                        'database_updated' => false
                    ),
                    $err
                );
            }
            break;

        case 'DeleteMaster':
            $user = requireWriteAccess();
            $unit = trim(getParam($input, 'unit', 'serialNumber'));

            if ($unit === '') {
                Lib::ShowError(FILENAME, "[DeleteMaster] Missing unit parameter");
                sendJsonResponse(false, 'Brak parametru unit', null, 400);
            }

            $fisOnly = !empty($input['fisOnly']) || !empty($input['deleteFisOnly']);
            $reqFis = isset($input['fis']) ? $input['fis'] : '';
            $fisOnlyFlag = $fisOnly ? '1' : '0';
            Lib::ShowDebug(FILENAME, "[DeleteMaster] Start unit='$unit', requestedFis='$reqFis', fisOnly=$fisOnlyFlag, user='$user'");
            $mysqli = getDbConnection();
            $stmtMaster = $mysqli->prepare("SELECT FIS FROM masterUnits WHERE unit = ? LIMIT 1");
            $stmtMaster->bind_param('s', $unit);
            $stmtMaster->execute();
            $masterRow = stmtFetchAssoc($stmtMaster);
            $stmtMaster->close();

            if (!$masterRow && !$fisOnly) {
                $mysqli->close();
                Lib::ShowError(FILENAME, "[DeleteMaster] Master '$unit' does not exist in database");
                sendJsonResponse(false, "Master '$unit' nie istnieje w bazie danych", null, 404);
            }

            $storedFis = $masterRow ? normalizeFisValue(isset($masterRow['FIS']) ? $masterRow['FIS'] : 'FIS1') : null;
            $requestedFisRaw = isset($input['fis']) ? strtoupper(trim($input['fis'])) : '';
            if ($requestedFisRaw !== '' && !in_array($requestedFisRaw, array('FIS1', 'FIS2'), true)) {
                $mysqli->close();
                Lib::ShowError(FILENAME, "[DeleteMaster] Invalid requested FIS: '$requestedFisRaw'");
                sendJsonResponse(false, 'Nieprawidłowy serwer FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
            }

            $requestedFis = $requestedFisRaw !== '' ? $requestedFisRaw : ($storedFis ? $storedFis : 'FIS1');
            if (!$fisOnly && $storedFis !== null && $requestedFis !== $storedFis) {
                $mysqli->close();
                Lib::ShowError(FILENAME, "[DeleteMaster] FIS mismatch for unit '$unit': expected '$storedFis', got '$requestedFis'");
                sendJsonResponse(
                    false,
                    "Master '$unit' należy do $storedFis, a żądanie usunięcia wysłano dla $requestedFis.",
                    array('expected_fis' => $storedFis),
                    409
                );
            }

            $serverFis = getServerFis();
            $targetHostFis = $fisOnly ? $requestedFis : ($storedFis ? $storedFis : $requestedFis);
            if ($serverFis !== null && $targetHostFis !== null && $serverFis !== $targetHostFis) {
                $mysqli->close();
                Lib::ShowError(FILENAME, "[DeleteMaster] Server mismatch: request hit $serverFis, but unit '$unit' belongs to $targetHostFis");
                sendJsonResponse(
                    false,
                    "Żądanie trafiło do $serverFis, ale master '$unit' należy do $targetHostFis.",
                    array('expected_fis' => $targetHostFis),
                    409
                );
            }

            $fisDeleted = false;
            $fisAlreadyMissing = false;
            $effectiveFis = $serverFis ? $serverFis : $targetHostFis;

            try {
                Unit::Delete($unit);
                $fisDeleted = true;
            } catch (Exception $fisError) {
                if (!isMissingFisUnitError($fisError)) {
                    $mysqli->close();
                    Lib::ShowError(FILENAME, "[DeleteMaster] Unit::Delete failed for unit '$unit' in $effectiveFis: " . $fisError->getMessage());
                    throw new ApiOperationException(
                        formatOperationError('DeleteMaster', 'Unit::Delete', $unit, $effectiveFis, $fisError),
                        502,
                        array('fis' => $effectiveFis, 'fis_deleted' => false),
                        $fisError
                    );
                }
                $fisAlreadyMissing = true;
                Lib::ShowDebug(FILENAME, "[DeleteMaster] Unit '$unit' was already missing from $effectiveFis");
            }

            if ($fisOnly) {
                $mysqli->close();
                Lib::ShowDebug(FILENAME, "[DeleteMaster] Succeeded (fisOnly): Master '$unit' deleted from $effectiveFis (fisDeleted=" . ($fisDeleted ? '1' : '0') . ")");
                $message = $fisDeleted
                    ? "Master '$unit' został usunięty z $effectiveFis"
                    : "Master '$unit' nie istniał już w $effectiveFis";
                sendJsonResponse(true, $message, array(
                    'fis' => $effectiveFis,
                    'fis_deleted' => $fisDeleted,
                    'fis_only' => true
                ));
            }

            dbBegin($mysqli);
            try {
                $stmtHist = $mysqli->prepare(
                    "INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`)
                     SELECT unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, ?, 'Delete', NOW()
                     FROM masterUnits WHERE unit = ?"
                );
                $stmtHist->bind_param('ss', $user, $unit);
                $stmtHist->execute();
                $stmtHist->close();

                $stmtDel = $mysqli->prepare("DELETE FROM masterUnits WHERE unit = ?");
                $stmtDel->bind_param('s', $unit);
                $stmtDel->execute();
                $affected = $stmtDel->affected_rows;
                $stmtDel->close();

                dbCommit($mysqli);
                $mysqli->close();
                Lib::ShowDebug(FILENAME, "[DeleteMaster] Succeeded: Master '$unit' deleted from $effectiveFis and DB (fisDeleted=" . ($fisDeleted ? '1' : '0') . ", affectedRows=$affected)");

                $message = $fisDeleted
                    ? "Master '$unit' został usunięty z $effectiveFis i z bazy danych"
                    : "Master '$unit' nie istniał już w $effectiveFis i został usunięty z bazy danych";
                sendJsonResponse(true, $message, array(
                    'affected_rows' => $affected,
                    'fis' => $effectiveFis,
                    'fis_deleted' => $fisDeleted
                ));
            } catch (Exception $err) {
                dbRollback($mysqli);
                $mysqli->close();
                Lib::ShowError(FILENAME, "[DeleteMaster] Failed: " . $err->getMessage());
                if (($fisDeleted || $fisAlreadyMissing) && !($err instanceof ApiOperationException)) {
                    throw new ApiOperationException(
                        formatOperationError(
                            'DeleteMaster',
                            'database_delete',
                            $unit,
                            $effectiveFis,
                            $err,
                            'unit_absent_in_fis=true, database_deleted=false; retry_required=true'
                        ),
                        500,
                        array(
                            'fis' => $effectiveFis,
                            'fis_deleted' => $fisDeleted,
                            'fis_already_missing' => $fisAlreadyMissing,
                            'database_deleted' => false
                        ),
                        $err
                    );
                }
                throw $err;
            }
            break;

        default:
            Lib::ShowError(FILENAME, "Unknown job requested: '$job'");
            sendJsonResponse(false, "Nieznany job lub operacja nieobsługiwana na serwerze FIS 2: '$job'", null, 404);
            break;
    }
} catch (Exception $e) {
    if (isset($mysqli) && $mysqli instanceof mysqli) {
        @$mysqli->close();
    }
    Lib::ShowError(FILENAME, "[Fatal] Exception in job '$job': " . $e->getMessage() . " at " . $e->getFile() . ":" . $e->getLine());
    Lib::ShowError(FILENAME, "[Fatal] Stack trace:\n" . $e->getTraceAsString());
    if ($e instanceof ApiOperationException) {
        sendJsonResponse(false, $e->publicMessage, $e->responseData, $e->statusCode);
    }
    sendJsonResponse(false, 'Wewnętrzny błąd serwera: ' . $e->getMessage(), null, 500);
}
