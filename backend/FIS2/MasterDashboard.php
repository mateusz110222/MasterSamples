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
 * Master Samples Dashboard Backend API — FIS 2 deployment copy (PHP 5.3.3 compatible)
 * Production host: plblofis2.global.borgwarner.net
 * Production path: /custom/matz/php/MasterDashboard.php
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
$ALLOWED_GROUPS = getAllowedGroups();

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
        $host = $envHost ?: '127.0.0.1';
        $user = $envUser ?: 'root';
        $password = $envPass ?: '';
    }

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $mysqli = new mysqli($host, $user, $password, $dbName);
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

function getLocalUserDbConnection()
{
    $mysqli = new mysqli('localhost', 'fiswww', '', 'users');
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

function stmtBindParams(mysqli_stmt $stmt, $types, array $params)
{
    $bindArgs = array($types);
    foreach ($params as &$param) {
        $bindArgs[] = &$param;
    }
    unset($param);
    return call_user_func_array(array($stmt, 'bind_param'), $bindArgs);
}

function stmtFetchAllAssoc(mysqli_stmt $stmt)
{
    if (method_exists($stmt, 'get_result')) {
        $res = $stmt->get_result();
        if ($res) {
            $rows = array();
            while ($row = $res->fetch_assoc()) {
                $rows[] = $row;
            }
            return $rows;
        }
    }
    $stmt->store_result();
    $meta = $stmt->result_metadata();
    if (!$meta) {
        return array();
    }
    $fields = array();
    $row = array();
    while ($field = $meta->fetch_field()) {
        $fields[] = &$row[$field->name];
    }
    call_user_func_array(array($stmt, 'bind_result'), $fields);
    $results = array();
    while ($stmt->fetch()) {
        $results[] = array_merge(array(), $row);
    }
    return $results;
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
    if ($stmt->fetch()) {
        return array_merge(array(), $row);
    }
    return null;
}

function queryFetchAllAssoc(mysqli $mysqli, $sql)
{
    $res = $mysqli->query($sql);
    $rows = array();
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
        }
    }
    return $rows;
}

function getRequestData()
{
    static $input = null;
    if ($input !== null) {
        return $input;
    }

    $contentType = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    $form = Lib::getForm($contentType, FILENAME);
    $input = array_merge($_GET, is_array($form) ? $form : array());
    return $input;
}

function getParam(array $input, $primaryKey, $secondaryKey = null, $default = '')
{
    if (isset($input[$primaryKey]) && $input[$primaryKey] !== '') {
        return $input[$primaryKey];
    }
    if ($secondaryKey !== null && isset($input[$secondaryKey]) && $input[$secondaryKey] !== '') {
        return $input[$secondaryKey];
    }
    $lowerPrimary = strtolower($primaryKey);
    $lowerSecondary = $secondaryKey !== null ? strtolower($secondaryKey) : null;
    foreach ($input as $k => $v) {
        $lowerK = strtolower($k);
        if ($lowerK === $lowerPrimary && $v !== '') {
            return $v;
        }
        if ($lowerSecondary !== null && $lowerK === $lowerSecondary && $v !== '') {
            return $v;
        }
    }
    return $default;
}

function cleanUsername($user)
{
    $user = trim($user);
    $slashPos = strrpos($user, '\\');
    if ($slashPos !== false) {
        $user = substr($user, $slashPos + 1);
    }
    return trim($user, " \t\n\r\0\x0B\"'");
}

function normalizeFisValue($fis)
{
    $val = strtoupper(trim($fis));
    return strpos($val, '2') !== false ? 'FIS2' : 'FIS1';
}

function getServerFis()
{
    $host = isset($_SERVER['HTTP_HOST']) ? strtolower($_SERVER['HTTP_HOST']) : '';
    if (strpos($host, 'plblofis2') !== false) {
        return 'FIS2';
    }
    if (strpos($host, 'plblofis1') !== false) {
        return 'FIS1';
    }
    return null;
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

function getCurrentUser($input)
{
    $authenticated = getAuthenticatedUser();
    if ($authenticated !== '') {
        return $authenticated;
    }

    $raw = getParam($input, 'user', 'userId');
    $user = trim($raw);
    if ($user !== '') {
        return cleanUsername($user);
    }
    return 'SYSTEM';
}

function getAuthenticatedUser()
{
    if (!empty($_SERVER['HTTP_X_USER'])) {
        $headerUser = cleanUsername($_SERVER['HTTP_X_USER']);
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
    $srvRemote = '';
    if (isset($_SERVER['REMOTE_USER'])) {
        $srvRemote = $_SERVER['REMOTE_USER'];
    } elseif (isset($_SERVER['AUTH_USER'])) {
        $srvRemote = $_SERVER['AUTH_USER'];
    }
    $remote = $envRemote ?: $srvRemote;
    $remoteUser = cleanUsername($remote);
    if ($remoteUser !== '') {
        return $remoteUser;
    }

    return '';
}

function getUserGroups($userId)
{
    if (!empty($_SERVER['HTTP_X_USER_GROUPS'])) {
        $parts = explode(',', $_SERVER['HTTP_X_USER_GROUPS']);
        $headerGroups = array();
        foreach ($parts as $part) {
            $g = trim($part);
            if ($g !== '') {
                $headerGroups[] = $g;
            }
        }
        if (!empty($headerGroups)) {
            return $headerGroups;
        }
    }

    $input = getRequestData();
    if (isset($input['userGroups']) && is_array($input['userGroups'])) {
        $payloadGroups = array();
        foreach ($input['userGroups'] as $part) {
            $g = trim((string)$part);
            if ($g !== '') {
                $payloadGroups[] = $g;
            }
        }
        if (!empty($payloadGroups)) {
            return $payloadGroups;
        }
    }

    try {
        $groups = Lib::GetUserGroup($userId);
        if (is_array($groups) && !empty($groups)) {
            return array_values(array_map('strval', $groups));
        }
    } catch (Exception $error) {
        Lib::ShowError(FILENAME, print_r($error, true));
    }

    return array();
}

function requireWriteAccess()
{
    $req = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '';
    if ($req !== 'POST') {
        sendJsonResponse(false, 'Ta operacja wymaga metody POST', null, 405);
    }

    $userId = getAuthenticatedUser();
    if ($userId === '') {
        sendJsonResponse(false, 'Brak uwierzytelnionego użytkownika', null, 401);
    }

    $userGroups = getUserGroups($userId);
    $matched = array_intersect($userGroups, getAllowedGroups());
    if (empty($matched)) {
        sendJsonResponse(false, 'Brak uprawnień do wykonania tej operacji', null, 403);
    }

    return $userId;
}

function getUserFullName($userId)
{
    $cleanId = cleanUsername($userId);
    if ($cleanId === '' || $cleanId === 'SYSTEM') {
        return $cleanId !== '' ? $cleanId : $userId;
    }

    static $cache = array();
    if (isset($cache[$cleanId])) {
        return $cache[$cleanId];
    }

    try {
        $localDb = getLocalUserDbConnection();
        $safeUser = $localDb->real_escape_string($cleanId);
        $res = $localDb->query("SELECT name FROM tbl_users WHERE userId = '$safeUser' OR name = '$safeUser' LIMIT 1");
        if ($res && ($row = $res->fetch_assoc()) && !empty($row['name'])) {
            $name = trim($row['name']);
            $localDb->close();
            $cache[$cleanId] = $name;
            return $name;
        }
        $localDb->close();
    } catch (Exception $e) {
        Lib::ShowError(FILENAME, print_r($e, true));
    }

    // Only if resolving the currently authenticated session user, fallback to client-supplied session name
    $authUser = getAuthenticatedUser();
    if ($authUser !== '' && strcasecmp($cleanId, $authUser) === 0) {
        if (!empty($_SERVER['HTTP_X_USER_NAME'])) {
            $headerName = trim($_SERVER['HTTP_X_USER_NAME']);
            if ($headerName !== '') {
                $cache[$cleanId] = $headerName;
                return $headerName;
            }
        }

        $input = getRequestData();
        $passedName = getParam($input, 'userName', 'userFullName', getParam($input, 'operatorName', 'fullName'));
        if (!empty($passedName) && trim($passedName) !== '') {
            $cache[$cleanId] = trim($passedName);
            return trim($passedName);
        }
    }

    $cache[$cleanId] = $cleanId;
    return $cleanId;
}

$input = getRequestData();
$job = (string)getParam($input, 'job', null, isset($_GET['job']) ? $_GET['job'] : '');

if ($job === '') {
    sendJsonResponse(false, 'Brak parametru job', null, 400);
}

$blockedMachinesDir = '/fis/mantis/data/blocked_machines/';

try {
    switch ($job) {
        case 'GetUserInfo':
            $userId = getCurrentUser($input);

            $userInfo = array(
                'userId' => $userId,
                'name' => getUserFullName($userId),
                'email' => '',
                'groups' => array(),
                'canEdit' => false
            );

            $userInfo['groups'] = getUserGroups($userId);

            $matched = array_intersect($userInfo['groups'], getAllowedGroups());
            $userInfo['canEdit'] = !empty($matched);

            try {
                $localDb = getLocalUserDbConnection();
                $safeUser = $localDb->real_escape_string($userId);
                $res = $localDb->query("SELECT name, email FROM tbl_users WHERE userId = '$safeUser' LIMIT 1");
                if ($res && ($row = $res->fetch_assoc())) {
                    if (!empty($row['name'])) {
                        $userInfo['name'] = (string)$row['name'];
                    }
                    if (!empty($row['email'])) {
                        $userInfo['email'] = (string)$row['email'];
                    }
                }
                $localDb->close();
            } catch (Exception $error) {
                Lib::ShowError(FILENAME, print_r($error, true));
            }

            sendJsonResponse(true, 'Pobrano dane użytkownika', $userInfo);
            break;

        case 'GetMasters':
            $statusFilter = isset($input['status']) ? $input['status'] : '';
            $processFilter = isset($input['process']) ? $input['process'] : '';
            $activeFilter = (isset($input['isactive']) && $input['isactive'] !== '') ? (int)$input['isactive'] : null;
            $search = isset($input['search']) ? trim($input['search']) : '';

            $where = array();
            $types = '';
            $params = array();

            if ($statusFilter !== '') {
                $where[] = "status = ?";
                $types .= 's';
                $params[] = $statusFilter;
            }
            if ($processFilter !== '') {
                $where[] = "process LIKE ?";
                $types .= 's';
                $params[] = '%' . $processFilter . '%';
            }
            if ($activeFilter !== null) {
                $where[] = "isactive = ?";
                $types .= 'i';
                $params[] = $activeFilter;
            }
            if ($search !== '') {
                $where[] = "(unit LIKE ? OR process LIKE ? OR user LIKE ?)";
                $types .= 'sss';
                $searchParam = '%' . $search . '%';
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
            }

            $sql = "SELECT id, unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, isactive, FIS FROM masterUnits";
            if (!empty($where)) {
                $sql .= " WHERE " . implode(" AND ", $where);
            }
            $sql .= " ORDER BY id DESC";

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare($sql);
            if (!empty($params)) {
                stmtBindParams($stmt, $types, $params);
            }
            $stmt->execute();
            $rows = stmtFetchAllAssoc($stmt);
            $stmt->close();
            $mysqli->close();

            foreach ($rows as &$row) {
                if (!empty($row['user'])) {
                    $row['user'] = getUserFullName($row['user']);
                }
            }
            unset($row);

            sendJsonResponse(true, 'Lista masterów pobrana', $rows);
            break;

        case 'CheckMaster':
            $rawUnit = getParam($input, 'unit', 'serialNumber');
            $unit = trim($rawUnit);
            if ($unit === '') {
                sendJsonResponse(false, 'Brak parametru unit', null, 400);
            }

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare("SELECT id, unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, isactive, FIS FROM masterUnits WHERE unit = ? LIMIT 1");
            $stmt->bind_param('s', $unit);
            $stmt->execute();
            $row = stmtFetchAssoc($stmt);
            $stmt->close();
            $mysqli->close();

            if ($row && !empty($row['user'])) {
                $row['user'] = getUserFullName($row['user']);
            }

            sendJsonResponse(true, 'Status mastera', array(
                'exists' => (bool)$row,
                'unit' => $row ?: null
            ));
            break;

        case 'ResetCounters':
            $rawUnits = getParam($input, 'units', 'unit');
            if (empty($rawUnits) && isset($input['serialNumber'])) {
                $rawUnits = $input['serialNumber'];
            }
            $user = requireWriteAccess();
            $operatorName = getUserFullName($user);
            $rt = isset($input['resetType']) ? $input['resetType'] : 'all';
            $resetType = strtolower(trim($rt));

            if (empty($rawUnits)) {
                sendJsonResponse(false, 'Brak jednostek do zresetowania', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', $rawUnits)));
            if (empty($unitList)) {
                sendJsonResponse(false, 'Brak poprawnych jednostek', null, 400);
            }

            $operationName = 'Reset';
            if ($resetType === 'cycles') {
                $operationName = 'ResetCycles';
            } elseif ($resetType === 'errors') {
                $operationName = 'ResetErrors';
            }

            $mysqli = getDbConnection();
            dbBegin($mysqli);
            try {
                $resetCount = 0;
                foreach ($unitList as $unit) {
                    $stmtCheck = $mysqli->prepare("SELECT isactive FROM masterUnits WHERE unit = ? LIMIT 1");
                    $stmtCheck->bind_param('s', $unit);
                    $stmtCheck->execute();
                    $checkRow = stmtFetchAssoc($stmtCheck);
                    $stmtCheck->close();

                    if (!$checkRow || (int)$checkRow['isactive'] === 2) {
                        continue;
                    }

                    $stmtHist = $mysqli->prepare(
                        "INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, operation, `date`)
                         SELECT unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, ?, ?, NOW()
                         FROM masterUnits WHERE unit = ?"
                    );
                    $stmtHist->bind_param('sss', $operatorName, $operationName, $unit);
                    $stmtHist->execute();
                    $stmtHist->close();

                    if ($resetType === 'cycles') {
                        $stmtUpdate = $mysqli->prepare("UPDATE masterUnits SET currentCounter = 0 WHERE unit = ?");
                    } elseif ($resetType === 'errors') {
                        $stmtUpdate = $mysqli->prepare("UPDATE masterUnits SET errorCounter = 0 WHERE unit = ?");
                    } else {
                        $stmtUpdate = $mysqli->prepare("UPDATE masterUnits SET currentCounter = 0, errorCounter = 0 WHERE unit = ?");
                    }
                    $stmtUpdate->bind_param('s', $unit);
                    $stmtUpdate->execute();
                    $stmtUpdate->close();

                    $resetCount++;
                }

                dbCommit($mysqli);
                $mysqli->close();

                $msg = "Wyzerowano wszystkie liczniki ($resetCount sztuk)";
                if ($resetType === 'cycles') {
                    $msg = "Wyzerowano liczniki cykli ($resetCount sztuk)";
                } elseif ($resetType === 'errors') {
                    $msg = "Wyzerowano liczniki błędów ($resetCount sztuk)";
                }

                sendJsonResponse(true, $msg, array('count' => $resetCount, 'resetType' => $resetType));
            } catch (Exception $err) {
                dbRollback($mysqli);
                $mysqli->close();
                throw $err;
            }
            break;

        case 'BlockMaster':
            $rawUnits = getParam($input, 'units', 'unit');
            if (empty($rawUnits) && isset($input['serialNumber'])) {
                $rawUnits = $input['serialNumber'];
            }
            $user = requireWriteAccess();
            $operatorName = getUserFullName($user);

            if (empty($rawUnits)) {
                sendJsonResponse(false, 'Brak jednostek do zablokowania', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', $rawUnits)));
            $mysqli = getDbConnection();
            dbBegin($mysqli);
            try {
                foreach ($unitList as $unit) {
                    $stmtHist = $mysqli->prepare(
                        "INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, operation, `date`)
                         SELECT unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, ?, 'Block', NOW()
                         FROM masterUnits WHERE unit = ?"
                    );
                    $stmtHist->bind_param('ss', $operatorName, $unit);
                    $stmtHist->execute();
                    $stmtHist->close();

                    $stmtUpdate = $mysqli->prepare("UPDATE masterUnits SET isactive = 2 WHERE unit = ?");
                    $stmtUpdate->bind_param('s', $unit);
                    $stmtUpdate->execute();
                    $stmtUpdate->close();
                }

                dbCommit($mysqli);
                $mysqli->close();
                sendJsonResponse(true, "Zablokowano mastera (isActive=2)!");
            } catch (Exception $err) {
                dbRollback($mysqli);
                $mysqli->close();
                throw $err;
            }
            break;

        case 'ActivateMaster':
            $rawUnits = getParam($input, 'units', 'unit');
            if (empty($rawUnits) && isset($input['serialNumber'])) {
                $rawUnits = $input['serialNumber'];
            }
            $user = requireWriteAccess();
            $operatorName = getUserFullName($user);

            if (empty($rawUnits)) {
                sendJsonResponse(false, 'Brak jednostek do aktywacji', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', $rawUnits)));
            $mysqli = getDbConnection();
            dbBegin($mysqli);
            try {
                foreach ($unitList as $unit) {
                    $stmtHist = $mysqli->prepare(
                        "INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, operation, `date`)
                         SELECT unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, ?, 'Activate', NOW()
                         FROM masterUnits WHERE unit = ?"
                    );
                    $stmtHist->bind_param('ss', $operatorName, $unit);
                    $stmtHist->execute();
                    $stmtHist->close();

                    $stmtUpdate = $mysqli->prepare("UPDATE masterUnits SET isactive = 1 WHERE unit = ?");
                    $stmtUpdate->bind_param('s', $unit);
                    $stmtUpdate->execute();
                    $stmtUpdate->close();
                }

                dbCommit($mysqli);
                $mysqli->close();
                sendJsonResponse(true, "Jednostki zostały aktywowane (isActive=1)!");
            } catch (Exception $err) {
                dbRollback($mysqli);
                $mysqli->close();
                throw $err;
            }
            break;

        case 'DeleteMaster':
            $input = getRequestData();
            $rawUnit = getParam($input, 'unit', 'serialNumber', isset($_REQUEST['unit']) ? $_REQUEST['unit'] : '');
            $unit = trim($rawUnit);
            $user = requireWriteAccess();

            if ($unit === '') {
                sendJsonResponse(false, 'Brak parametru unit', null, 400);
            }

            $mysqli = getDbConnection();
            $stmtMaster = $mysqli->prepare("SELECT FIS FROM masterUnits WHERE unit = ? LIMIT 1");
            $stmtMaster->bind_param('s', $unit);
            $stmtMaster->execute();
            $masterRow = stmtFetchAssoc($stmtMaster);
            $stmtMaster->close();

            if (!$masterRow) {
                $mysqli->close();
                sendJsonResponse(false, "Master '$unit' nie istnieje w bazie danych", null, 404);
            }

            $storedFis = normalizeFisValue(isset($masterRow['FIS']) ? $masterRow['FIS'] : 'FIS1');
            $requestedFisRaw = isset($input['fis']) ? strtoupper(trim($input['fis'])) : '';
            if ($requestedFisRaw !== '' && !in_array($requestedFisRaw, array('FIS1', 'FIS2'), true)) {
                $mysqli->close();
                sendJsonResponse(false, 'Nieprawidłowy serwer FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
            }

            $requestedFis = $requestedFisRaw !== '' ? $requestedFisRaw : $storedFis;
            if ($requestedFis !== $storedFis) {
                $mysqli->close();
                sendJsonResponse(
                    false,
                    "Master '$unit' należy do $storedFis, a żądanie usunięcia wysłano dla $requestedFis.",
                    array('expected_fis' => $storedFis),
                    409
                );
            }

            $serverFis = getServerFis();
            if ($serverFis !== null && $serverFis !== $storedFis) {
                $mysqli->close();
                sendJsonResponse(
                    false,
                    "Żądanie trafiło do $serverFis, ale master '$unit' należy do $storedFis.",
                    array('expected_fis' => $storedFis),
                    409
                );
            }

            $fisDeleted = false;
            $fisAlreadyMissing = false;
            dbBegin($mysqli);
            try {
                $stmtHist = $mysqli->prepare(
                    "INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, operation, `date`)
                     SELECT unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, ?, 'Delete', NOW()
                     FROM masterUnits WHERE unit = ?"
                );
                $stmtHist->bind_param('ss', $user, $unit);
                $stmtHist->execute();
                $stmtHist->close();

                try {
                    Unit::Delete($unit);
                    $fisDeleted = true;
                } catch (Exception $fisError) {
                    if (!isMissingFisUnitError($fisError)) {
                        throw new ApiOperationException(
                            formatOperationError('DeleteMaster', 'Unit::Delete', $unit, $storedFis, $fisError),
                            502,
                            array('fis' => $storedFis, 'fis_deleted' => false),
                            $fisError
                        );
                    }
                    $fisAlreadyMissing = true;
                }

                $stmtDel = $mysqli->prepare("DELETE FROM masterUnits WHERE unit = ?");
                $stmtDel->bind_param('s', $unit);
                $stmtDel->execute();
                $affected = $stmtDel->affected_rows;
                $stmtDel->close();

                dbCommit($mysqli);
                $mysqli->close();

                $message = $fisDeleted
                    ? "Master '$unit' został usunięty z $storedFis i z bazy danych"
                    : "Master '$unit' nie istniał już w $storedFis i został usunięty z bazy danych";
                sendJsonResponse(true, $message, array(
                    'affected_rows' => $affected,
                    'fis' => $storedFis,
                    'fis_deleted' => $fisDeleted
                ));
            } catch (Exception $err) {
                dbRollback($mysqli);
                $mysqli->close();
                if (($fisDeleted || $fisAlreadyMissing) && !($err instanceof ApiOperationException)) {
                    throw new ApiOperationException(
                        formatOperationError(
                            'DeleteMaster',
                            'database_delete',
                            $unit,
                            $storedFis,
                            $err,
                            'unit_absent_in_fis=true, database_deleted=false; retry_required=true'
                        ),
                        500,
                        array(
                            'fis' => $storedFis,
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

        case 'CreateMaster':
            $user = requireWriteAccess();
            $input = getRequestData();
            $rawUnit = getParam($input, 'unit', 'serialNumber', isset($_REQUEST['unit']) ? $_REQUEST['unit'] : '');
            $unit = strtoupper(trim($rawUnit));
            $rawProc = getParam($input, 'process', 'processName', isset($_REQUEST['process']) ? $_REQUEST['process'] : '');
            $processList = trim($rawProc);
            $st = isset($input['status']) ? $input['status'] : (isset($_REQUEST['status']) ? $_REQUEST['status'] : 'GOOD');
            $status = strtoupper(trim($st));
            $maxCounter = isset($input['maxCounter']) ? (int)$input['maxCounter'] : (isset($_REQUEST['maxCounter']) ? (int)$_REQUEST['maxCounter'] : 1000);
            $rawErrors = getParam($input, 'maxErrors', 'errorMaxCounter', isset($_REQUEST['maxErrors']) ? $_REQUEST['maxErrors'] : 50);
            $errorMaxCounter = (int)$rawErrors;
            $forceUpdate = !empty($input['forceUpdate']) || !empty($_REQUEST['forceUpdate']);

            if ($unit === '' || $processList === '') {
                sendJsonResponse(false, 'Numer seryjny (SN) oraz proces są wymagane!', null, 400);
            }

            $fRaw = isset($input['fis']) ? $input['fis'] : 'FIS2';
            $fisValue = strtoupper(trim($fRaw));
            if (!in_array($fisValue, array('FIS1', 'FIS2'), true)) {
                sendJsonResponse(false, 'Nieprawidłowy serwer docelowy FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
            }

            $serverFis = getServerFis();
            if ($serverFis !== null && $serverFis !== $fisValue) {
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
                sendJsonResponse(true, 'Master o tym numerze już istnieje w bazie', array(
                    'exists' => true,
                    'oldData' => $existing,
                    'newData' => array(
                        'unit' => $unit,
                        'process' => $processClean,
                        'status' => $status,
                        'maxCounter' => $maxCounter,
                        'errorMaxCounter' => $errorMaxCounter,
                        'FIS' => $fisValue
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
                } catch (Exception $deleteError) {
                    $mysqli->close();
                    throw new ApiOperationException(
                        formatOperationError('CreateMaster', 'Unit::Delete', $unit, $fisValue, $deleteError),
                        502,
                        array('fis' => $fisValue, 'stage' => 'delete_existing'),
                        $deleteError
                    );
                }
            }

            $creatorName = getUserFullName($user);
            $dcmods = 'MS_HISTORY|' . $unit . '_MASTER|MS_PROCESS|' . $processClean . '|MS_STATUS|' . $status . '|OPERATOR|' . $creatorName;
            try {
                Unit::DataEntry(
                    $unit,
                    "CREATEUNIT",
                    "WEB",
                    $dcmods,
                    "GOLD",
                    "",
                    "",
                    "GOLDEN"
                );
            } catch (Exception $dataEntryError) {
                $mysqli->close();
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
                                (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, operation, `date`)
                            SELECT
                                unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, ?, ?, NOW()
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

                $actionMsg = $existing ? "Master '$unit' został pomyślnie zaktualizowany!" : "Master '$unit' został pomyślnie utworzony i zarejestrowany!";
                sendJsonResponse(true, $actionMsg, array('unit' => $unit, 'operation' => $operation, 'FIS' => $fisValue));
            } catch (Exception $err) {
                dbRollback($mysqli);
                $mysqli->close();
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

        /* =========================================================================
         * 2. HISTORY & AUDIT LOGS
         * ========================================================================= */
        case 'GetMasterHistory':
            $rawUnit = isset($input['unit']) ? $input['unit'] : '';
            $unit = trim($rawUnit);
            if ($unit === '') {
                sendJsonResponse(false, 'Brak parametru unit', null, 400);
            }

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare(
                "SELECT id, unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, operation, `date`
                 FROM history
                 WHERE unit = ?
                 ORDER BY `date` DESC, id DESC"
            );
            $stmt->bind_param('s', $unit);
            $stmt->execute();
            $rows = stmtFetchAllAssoc($stmt);
            $stmt->close();
            $mysqli->close();

            foreach ($rows as &$row) {
                if (!empty($row['user'])) {
                    $row['user'] = getUserFullName($row['user']);
                }
            }
            unset($row);

            sendJsonResponse(true, "Historia dla jednostki '$unit'", $rows);
            break;

        case 'GetHistory':
            $limit = isset($input['limit']) ? max(1, min(500, (int)$input['limit'])) : 100;
            $offset = isset($input['offset']) ? max(0, (int)$input['offset']) : 0;
            $unitFilter = isset($input['unit']) ? trim($input['unit']) : '';
            $opFilter = isset($input['operation']) ? trim($input['operation']) : '';
            $userFilter = isset($input['user']) ? trim($input['user']) : '';
            $processFilter = isset($input['process']) ? trim($input['process']) : '';
            $statusFilter = isset($input['status']) ? trim($input['status']) : '';
            $dateFrom = isset($input['dateFrom']) ? trim($input['dateFrom']) : '';
            $dateTo = isset($input['dateTo']) ? trim($input['dateTo']) : '';

            $where = array();
            $types = '';
            $params = array();

            if ($unitFilter !== '') {
                $where[] = "unit LIKE ?";
                $types .= 's';
                $params[] = '%' . $unitFilter . '%';
            }
            if ($opFilter !== '') {
                $where[] = "operation = ?";
                $types .= 's';
                $params[] = $opFilter;
            }
            if ($userFilter !== '') {
                $where[] = "user LIKE ?";
                $types .= 's';
                $params[] = '%' . $userFilter . '%';
            }
            if ($processFilter !== '') {
                $where[] = "process LIKE ?";
                $types .= 's';
                $params[] = '%' . $processFilter . '%';
            }
            if ($statusFilter !== '') {
                $where[] = "status = ?";
                $types .= 's';
                $params[] = $statusFilter;
            }
            if ($dateFrom !== '') {
                $where[] = "`date` >= ?";
                $types .= 's';
                $params[] = strpos($dateFrom, ' ') !== false ? $dateFrom : ($dateFrom . ' 00:00:00');
            }
            if ($dateTo !== '') {
                $where[] = "`date` <= ?";
                $types .= 's';
                $params[] = strpos($dateTo, ' ') !== false ? $dateTo : ($dateTo . ' 23:59:59');
            }

            $sql = "SELECT id, unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, operation, `date` FROM history";
            if (!empty($where)) {
                $sql .= " WHERE " . implode(" AND ", $where);
            }
            $sql .= " ORDER BY `date` DESC, id DESC LIMIT ? OFFSET ?";
            $types .= 'ii';
            $params[] = $limit;
            $params[] = $offset;

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare($sql);
            stmtBindParams($stmt, $types, $params);
            $stmt->execute();
            $rows = stmtFetchAllAssoc($stmt);
            $stmt->close();
            $mysqli->close();

            foreach ($rows as &$row) {
                if (!empty($row['user'])) {
                    $row['user'] = getUserFullName($row['user']);
                }
            }
            unset($row);

            sendJsonResponse(true, 'Historia operacji załadowana', $rows);
            break;

        /* =========================================================================
         * 3. BLOCKED MACHINES
         * ========================================================================= */
        case 'GetBlockedMachines':
            $items = array();
            if (is_dir($blockedMachinesDir) && ($files = scandir($blockedMachinesDir)) !== false) {
                foreach ($files as $file) {
                    if ($file === '.' || $file === '..' || strpos($file, '10.237.') !== false) {
                        continue;
                    }
                    $fullPath = $blockedMachinesDir . $file;
                    if (!is_file($fullPath)) {
                        continue;
                    }

                    $lastUnderscore = strrpos($file, '_');
                    $machine = $lastUnderscore !== false ? substr($file, 0, $lastUnderscore) : $file;
                    $prefix = $lastUnderscore !== false ? substr($file, $lastUnderscore + 1) : 'MASTER';
                    $mtime = filemtime($fullPath);
                    $fsize = filesize($fullPath);

                    $items[] = array(
                        'id' => $file,
                        'filename' => $file,
                        'machine' => $machine ?: 'UNKNOWN',
                        'prefix' => $prefix ?: 'MASTER',
                        'blockedAt' => $mtime ? date('Y-m-d H:i:s', $mtime) : null,
                        'size' => $fsize ?: 0
                    );
                }
            }
            sendJsonResponse(true, 'Pobrano zablokowane maszyny', $items);
            break;

        case 'DeleteBlockedMachine':
            requireWriteAccess();
            $rawRec = getParam($input, 'record', 'filename');
            $record = trim($rawRec);
            if ($record === '') {
                sendJsonResponse(false, 'Brak parametru record/filename', null, 400);
            }

            $targetPath = $blockedMachinesDir . basename($record);
            if (!is_file($targetPath)) {
                sendJsonResponse(false, "Plik blokady '$record' nie istnieje", null, 404);
            }

            if (@unlink($targetPath)) {
                sendJsonResponse(true, "Blokada dla '$record' została pomyślnie usunięta!");
            }
            sendJsonResponse(false, "Błąd podczas usuwania pliku blokady '$record'", null, 500);
            break;

        /* =========================================================================
         * 4. ENGINEERS & MAILING GROUPS
         * ========================================================================= */
        case 'GetEngineers':
            $mysqli = getDbConnection();
            $rows = queryFetchAllAssoc($mysqli, "SELECT id, process, mail FROM engineers ORDER BY process");
            $mysqli->close();
            sendJsonResponse(true, 'Lista inżynierów załadowana', $rows);
            break;

        case 'UpdateEngineerMail':
            requireWriteAccess();
            $process = isset($input['process']) ? trim($input['process']) : '';
            $mail = isset($input['mail']) ? trim($input['mail']) : '';

            if ($process === '') {
                sendJsonResponse(false, 'Brak parametru process', null, 400);
            }

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare("UPDATE engineers SET mail = ? WHERE process = ?");
            $stmt->bind_param('ss', $mail, $process);
            $stmt->execute();
            $affected = $stmt->affected_rows;
            $stmt->close();
            $mysqli->close();

            sendJsonResponse(true, "Zaktualizowano grupę mailową dla procesu '$process'", array('affected' => $affected));
            break;

        case 'AddEngineer':
            requireWriteAccess();
            $process = isset($input['process']) ? trim($input['process']) : '';
            $mail = isset($input['mail']) ? trim($input['mail']) : '';

            if ($process === '') {
                sendJsonResponse(false, 'Brak parametru process', null, 400);
            }

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare(
                "INSERT INTO engineers (process, mail) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE mail = VALUES(mail)"
            );
            $stmt->bind_param('ss', $process, $mail);
            $stmt->execute();
            $insertId = $stmt->insert_id;
            $stmt->close();
            $mysqli->close();

            sendJsonResponse(true, "Proces '$process' został pomyślnie skonfigurowany!", array('id' => $insertId));
            break;

        case 'DeleteEngineer':
            requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : null;
            $process = isset($input['process']) ? trim($input['process']) : '';

            if (!$id && $process === '') {
                sendJsonResponse(false, 'Brak parametru id lub process', null, 400);
            }

            $mysqli = getDbConnection();
            if ($id) {
                $stmt = $mysqli->prepare("DELETE FROM engineers WHERE id = ?");
                $stmt->bind_param('i', $id);
            } else {
                $stmt = $mysqli->prepare("DELETE FROM engineers WHERE process = ?");
                $stmt->bind_param('s', $process);
            }
            $stmt->execute();
            $affected = $stmt->affected_rows;
            $stmt->close();
            $mysqli->close();

            sendJsonResponse(true, "Usunięto konfigurację procesu", array('affected' => $affected));
            break;

        case 'GetMails':
            $mysqli = getDbConnection();
            $rows = queryFetchAllAssoc($mysqli, "SELECT id, name, mail FROM mails ORDER BY name");
            $mysqli->close();
            sendJsonResponse(true, 'Książka adresowa maili załadowana', $rows);
            break;

        case 'AddMail':
            requireWriteAccess();
            $name = isset($input['name']) ? trim($input['name']) : '';
            $mail = isset($input['mail']) ? trim($input['mail']) : '';

            if ($mail === '') {
                sendJsonResponse(false, 'Adres e-mail jest wymagany!', null, 400);
            }

            if ($name === '') {
                $parts = explode('@', $mail);
                $name = $parts[0];
            }

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare("INSERT INTO mails (name, mail) VALUES (?, ?)");
            $stmt->bind_param('ss', $name, $mail);
            $stmt->execute();
            $id = $stmt->insert_id;
            $stmt->close();
            $mysqli->close();

            sendJsonResponse(true, "Dodano grupę mailową '$name' ($mail)", array('id' => $id));
            break;

        case 'UpdateMail':
            requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : 0;
            $name = isset($input['name']) ? trim($input['name']) : '';
            $mail = isset($input['mail']) ? trim($input['mail']) : '';

            if ($id <= 0 || $mail === '') {
                sendJsonResponse(false, 'Nieprawidłowe ID lub brak adresu mailowego', null, 400);
            }

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare("UPDATE mails SET name = ?, mail = ? WHERE id = ?");
            $stmt->bind_param('ssi', $name, $mail, $id);
            $stmt->execute();
            $affected = $stmt->affected_rows;
            $stmt->close();
            $mysqli->close();

            sendJsonResponse(true, "Zaktualizowano grupę mailową", array('affected' => $affected));
            break;

        case 'DeleteMail':
            requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : 0;
            if ($id <= 0) {
                sendJsonResponse(false, 'Nieprawidłowe ID maila', null, 400);
            }

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare("DELETE FROM mails WHERE id = ?");
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $affected = $stmt->affected_rows;
            $stmt->close();
            $mysqli->close();

            sendJsonResponse(true, "Usunięto grupę mailową", array('affected' => $affected));
            break;

        default:
            sendJsonResponse(false, "Nieznany job: '$job'", null, 404);
            break;
    }
} catch (Exception $e) {
    if (isset($mysqli) && $mysqli instanceof mysqli) {
        @$mysqli->close();
    }
    Lib::ShowError(FILENAME, print_r($e, true));
    if ($e instanceof ApiOperationException) {
        sendJsonResponse(false, $e->publicMessage, $e->responseData, $e->statusCode);
    }
    sendJsonResponse(false, 'Wewnętrzny błąd serwera', null, 500);
}
