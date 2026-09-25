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

const PALETKI_AUTH_URL = 'http://10.142.11.66:8082/auth/login';

function callPaletkiAuthLogin($login, $password)
{
    $payload = json_encode(array(
        'login' => $login,
        'password' => $password,
    ));

    $ch = curl_init(PALETKI_AUTH_URL);
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => array(
            'Content-Type: application/json',
            'Accept: application/json',
        ),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 4,
    ));

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError !== '') {
        Lib::ShowError(FILENAME, "[Login] cURL error connecting to Paletki auth: " . $curlError);
        return array(
            'success' => false,
            'code' => 503,
            'message' => 'Brak połączenia z serwisem autoryzacji domenowej (Paletki)',
        );
    }

    $data = json_decode((string)$response, true);
    if (!is_array($data)) {
        Lib::ShowError(FILENAME, "[Login] Invalid JSON response from Paletki auth ($httpCode): " . substr((string)$response, 0, 200));
        return array(
            'success' => false,
            'code' => 502,
            'message' => 'Nieprawidłowa odpowiedź z serwera autoryzacji',
        );
    }

    if ($httpCode !== 200 || empty($data['status'])) {
        $msg = isset($data['message']) ? $data['message'] : 'Nieprawidłowy login lub hasło domenowe';
        return array(
            'success' => false,
            'code' => $httpCode >= 400 && $httpCode < 500 ? 401 : 502,
            'message' => $msg,
        );
    }

    return array(
        'success' => true,
        'code' => 200,
        'data' => isset($data['data']) && is_array($data['data']) ? $data['data'] : array(),
        'token' => isset($data['token']) ? (string)$data['token'] : '',
        'expires_at' => isset($data['expires_at']) ? (string)$data['expires_at'] : '',
    );
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
    $atPos = strpos($user, '@');
    if ($atPos !== false) {
        $user = substr($user, 0, $atPos);
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
    $userId = cleanUsername($userId);
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
$job = (string)getParam($input, 'job', null, isset($_GET['job']) ? $_GET['job'] : '');

if ($job === '') {
    Lib::ShowError(FILENAME, "Incoming request without 'job' parameter from IP " . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'));
    sendJsonResponse(false, 'Brak parametru job', null, 400);
}

Lib::ShowDebug(FILENAME, "[Request] job='$job', method=" . (isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '') . ", user='" . getAuthenticatedUser() . "', IP=" . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'));

$blockedMachinesDir = '/fis/mantis/data/blocked_machines/';

try {
    switch ($job) {
        case 'Login':
            $login = trim((string)getParam($input, 'login', 'username'));
            $password = (string)getParam($input, 'password');

            if ($login === '' || $password === '') {
                Lib::ShowError(FILENAME, "[Login] Missing login or password");
                sendJsonResponse(false, 'Login i hasło domenowe są wymagane', null, 400);
            }

            $authRes = callPaletkiAuthLogin($login, $password);
            if (!$authRes['success']) {
                Lib::ShowError(FILENAME, "[Login] Auth failed for user '$login': " . $authRes['message']);
                sendJsonResponse(false, $authRes['message'], null, 200);
            }

            $paletkiUser = $authRes['data'];
            $rawPaletkiUser = isset($paletkiUser['username']) ? (string)$paletkiUser['username'] : $login;
            $cleanUser = cleanUsername($rawPaletkiUser);
            $fullName = trim((string)(isset($paletkiUser['FullName']) ? $paletkiUser['FullName'] : ''));
            $department = trim((string)(isset($paletkiUser['department']) ? $paletkiUser['department'] : ''));

            $userGroups = getUserGroups($cleanUser);
            $matched = array_intersect($userGroups, getAllowedGroups());
            $canEdit = !empty($matched);
            $email = '';

            try {
                $localDb = getLocalUserDbConnection();
                $safeUser = $localDb->real_escape_string($cleanUser);
                $res = $localDb->query("SELECT name, email FROM tbl_users WHERE userId = '$safeUser' LIMIT 1");
                if ($res && ($row = $res->fetch_assoc())) {
                    if ($fullName === '' && !empty($row['name'])) {
                        $fullName = (string)$row['name'];
                    }
                    if (!empty($row['email'])) {
                        $email = (string)$row['email'];
                    }
                }
                $localDb->close();
            } catch (Exception $error) {
                Lib::ShowError(FILENAME, "[Login] Database lookup error for '$cleanUser': " . $error->getMessage());
            }

            if ($email === '' && strpos($rawPaletkiUser, '@') !== false) {
                $email = $rawPaletkiUser;
            }

            if ($fullName === '') {
                $fullName = $cleanUser;
            }

            Lib::ShowDebug(FILENAME, "[Login] User '$cleanUser' logged in successfully. canEdit=" . ($canEdit ? 'true' : 'false') . ", groups=[" . implode(', ', $userGroups) . "]");

            sendJsonResponse(true, 'Zalogowano pomyślnie', array(
                'userId' => $cleanUser,
                'name' => $fullName,
                'email' => $email,
                'department' => $department,
                'groups' => $userGroups,
                'canEdit' => $canEdit,
                'isGuest' => false,
                'token' => $authRes['token'],
                'expires_at' => $authRes['expires_at'],
            ));
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

            sendJsonResponse(true, 'Lista masterów pobrana', $rows);
            break;

        case 'ResetCounters':
            $rawUnits = getParam($input, 'units', 'unit');
            if (empty($rawUnits) && isset($input['serialNumber'])) {
                $rawUnits = $input['serialNumber'];
            }
            $user = requireWriteAccess();
            $operatorName = getOperatorName();
            $rt = isset($input['resetType']) ? $input['resetType'] : 'all';
            $resetType = strtolower(trim($rt));

            if (empty($rawUnits)) {
                Lib::ShowError(FILENAME, "[ResetCounters] Missing units parameter");
                sendJsonResponse(false, 'Brak jednostek do zresetowania', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', $rawUnits)));
            if (empty($unitList)) {
                Lib::ShowError(FILENAME, "[ResetCounters] No valid units found in: " . var_export($rawUnits, true));
                sendJsonResponse(false, 'Brak poprawnych jednostek', null, 400);
            }

            Lib::ShowDebug(FILENAME, "[ResetCounters] Start resetting unit(s): [" . implode(', ', $unitList) . "], type='$resetType', operator='$operatorName'");
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
                        Lib::ShowDebug(FILENAME, "[ResetCounters] Skipping inactive/blocked unit '$unit'");
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
                Lib::ShowDebug(FILENAME, "[ResetCounters] Succeeded: Reset $resetCount unit(s) (type='$resetType')");

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
                Lib::ShowError(FILENAME, "[ResetCounters] Failed: " . $err->getMessage());
                throw $err;
            }
            break;

        case 'BlockMaster':
            $rawUnits = getParam($input, 'units', 'unit');
            if (empty($rawUnits) && isset($input['serialNumber'])) {
                $rawUnits = $input['serialNumber'];
            }
            $user = requireWriteAccess();
            $operatorName = getOperatorName();

            if (empty($rawUnits)) {
                Lib::ShowError(FILENAME, "[BlockMaster] Missing units parameter");
                sendJsonResponse(false, 'Brak jednostek do zablokowania', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', $rawUnits)));
            Lib::ShowDebug(FILENAME, "[BlockMaster] Start blocking unit(s): [" . implode(', ', $unitList) . "], operator='$operatorName'");
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
                Lib::ShowDebug(FILENAME, "[BlockMaster] Succeeded for unit(s): [" . implode(', ', $unitList) . "]");
                sendJsonResponse(true, "Zablokowano mastera (isActive=2)!");
            } catch (Exception $err) {
                dbRollback($mysqli);
                $mysqli->close();
                Lib::ShowError(FILENAME, "[BlockMaster] Failed: " . $err->getMessage());
                throw $err;
            }
            break;

        case 'ActivateMaster':
            $rawUnits = getParam($input, 'units', 'unit');
            if (empty($rawUnits) && isset($input['serialNumber'])) {
                $rawUnits = $input['serialNumber'];
            }
            $user = requireWriteAccess();
            $operatorName = getOperatorName();

            if (empty($rawUnits)) {
                Lib::ShowError(FILENAME, "[ActivateMaster] Missing units parameter");
                sendJsonResponse(false, 'Brak jednostek do aktywacji', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', $rawUnits)));
            Lib::ShowDebug(FILENAME, "[ActivateMaster] Start activating unit(s): [" . implode(', ', $unitList) . "], operator='$operatorName'");
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
                Lib::ShowDebug(FILENAME, "[ActivateMaster] Succeeded for unit(s): [" . implode(', ', $unitList) . "]");
                sendJsonResponse(true, "Jednostki zostały aktywowane (isActive=1)!");
            } catch (Exception $err) {
                dbRollback($mysqli);
                $mysqli->close();
                Lib::ShowError(FILENAME, "[ActivateMaster] Failed: " . $err->getMessage());
                throw $err;
            }
            break;

        case 'DeleteMaster':
            $input = getRequestData();
            $rawUnit = getParam($input, 'unit', 'serialNumber', isset($_REQUEST['unit']) ? $_REQUEST['unit'] : '');
            $unit = trim($rawUnit);
            $user = requireWriteAccess();

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
                    "INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, operation, `date`)
                     SELECT unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, ?, 'Delete', NOW()
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
                Lib::ShowError(FILENAME, "[CreateMaster] Validation error: SN or process is empty (unit='$unit', process='$processList')");
                sendJsonResponse(false, 'Numer seryjny (SN) oraz proces są wymagane!', null, 400);
            }

            $fRaw = isset($input['fis']) ? $input['fis'] : 'FIS2';
            $fisValue = strtoupper(trim($fRaw));
            if (!in_array($fisValue, array('FIS1', 'FIS2'), true)) {
                Lib::ShowError(FILENAME, "[CreateMaster] Invalid target FIS: '$fisValue'");
                sendJsonResponse(false, 'Nieprawidłowy serwer docelowy FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
            }

            $updFlag = $forceUpdate ? '1' : '0';
            Lib::ShowDebug(FILENAME, "[CreateMaster] Start unit='$unit', process='$processList', status='$status', fis='$fisValue', maxCounter=$maxCounter, maxErrors=$errorMaxCounter, forceUpdate=$updFlag, user='$user'");

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
                    "",
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
            $user = requireWriteAccess();
            $rawRec = getParam($input, 'record', 'filename');
            $record = trim($rawRec);
            if ($record === '') {
                Lib::ShowError(FILENAME, "[DeleteBlockedMachine] Missing record/filename parameter");
                sendJsonResponse(false, 'Brak parametru record/filename', null, 400);
            }

            Lib::ShowDebug(FILENAME, "[DeleteBlockedMachine] Unblocking machine record='$record' by user='$user'");
            $targetPath = $blockedMachinesDir . basename($record);
            if (!is_file($targetPath)) {
                Lib::ShowError(FILENAME, "[DeleteBlockedMachine] Block file '$record' not found at '$targetPath'");
                sendJsonResponse(false, "Plik blokady '$record' nie istnieje", null, 404);
            }

            if (@unlink($targetPath)) {
                Lib::ShowDebug(FILENAME, "[DeleteBlockedMachine] Succeeded: unblocked machine '$record'");
                sendJsonResponse(true, "Blokada dla '$record' została pomyślnie usunięta!");
            }
            Lib::ShowError(FILENAME, "[DeleteBlockedMachine] Failed to unlink block file '$targetPath'");
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
            $user = requireWriteAccess();
            $process = isset($input['process']) ? trim($input['process']) : '';
            $mail = isset($input['mail']) ? trim($input['mail']) : '';

            if ($process === '') {
                Lib::ShowError(FILENAME, "[UpdateEngineerMail] Missing process parameter");
                sendJsonResponse(false, 'Brak parametru process', null, 400);
            }

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare("UPDATE engineers SET mail = ? WHERE process = ?");
            $stmt->bind_param('ss', $mail, $process);
            $stmt->execute();
            $affected = $stmt->affected_rows;
            $stmt->close();
            $mysqli->close();

            Lib::ShowDebug(FILENAME, "[UpdateEngineerMail] Process '$process' mail set to '$mail' by user '$user'");
            sendJsonResponse(true, "Zaktualizowano grupę mailową dla procesu '$process'", array('affected' => $affected));
            break;

        case 'AddEngineer':
            $user = requireWriteAccess();
            $process = isset($input['process']) ? trim($input['process']) : '';
            $mail = isset($input['mail']) ? trim($input['mail']) : '';

            if ($process === '') {
                Lib::ShowError(FILENAME, "[AddEngineer] Missing process parameter");
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

            Lib::ShowDebug(FILENAME, "[AddEngineer] Process '$process' configured with mail '$mail' (id=$insertId) by user '$user'");
            sendJsonResponse(true, "Proces '$process' został pomyślnie skonfigurowany!", array('id' => $insertId));
            break;

        case 'DeleteEngineer':
            $user = requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : null;
            $process = isset($input['process']) ? trim($input['process']) : '';

            if (!$id && $process === '') {
                Lib::ShowError(FILENAME, "[DeleteEngineer] Missing id or process parameter");
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

            Lib::ShowDebug(FILENAME, "[DeleteEngineer] Deleted process configuration (id=" . var_export($id, true) . ", process='$process') by user '$user'");
            sendJsonResponse(true, "Usunięto konfigurację procesu", array('affected' => $affected));
            break;

        case 'GetMails':
            $mysqli = getDbConnection();
            $rows = queryFetchAllAssoc($mysqli, "SELECT id, name, mail FROM mails ORDER BY name");
            $mysqli->close();
            sendJsonResponse(true, 'Książka adresowa maili załadowana', $rows);
            break;

        case 'AddMail':
            $user = requireWriteAccess();
            $name = isset($input['name']) ? trim($input['name']) : '';
            $mail = isset($input['mail']) ? trim($input['mail']) : '';

            if ($mail === '') {
                Lib::ShowError(FILENAME, "[AddMail] Missing email address");
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

            Lib::ShowDebug(FILENAME, "[AddMail] Added mail group '$name' ($mail, id=$id) by user '$user'");
            sendJsonResponse(true, "Dodano grupę mailową '$name' ($mail)", array('id' => $id));
            break;

        case 'UpdateMail':
            $user = requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : 0;
            $name = isset($input['name']) ? trim($input['name']) : '';
            $mail = isset($input['mail']) ? trim($input['mail']) : '';

            if ($id <= 0 || $mail === '') {
                Lib::ShowError(FILENAME, "[UpdateMail] Invalid id or missing mail: id=$id, mail='$mail'");
                sendJsonResponse(false, 'Nieprawidłowe ID lub brak adresu mailowego', null, 400);
            }

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare("UPDATE mails SET name = ?, mail = ? WHERE id = ?");
            $stmt->bind_param('ssi', $name, $mail, $id);
            $stmt->execute();
            $affected = $stmt->affected_rows;
            $stmt->close();
            $mysqli->close();

            Lib::ShowDebug(FILENAME, "[UpdateMail] Updated mail group id=$id to '$name' ($mail) by user '$user'");
            sendJsonResponse(true, "Zaktualizowano grupę mailową", array('affected' => $affected));
            break;

        case 'DeleteMail':
            $user = requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : 0;
            if ($id <= 0) {
                Lib::ShowError(FILENAME, "[DeleteMail] Invalid mail id: $id");
                sendJsonResponse(false, 'Nieprawidłowe ID maila', null, 400);
            }

            $mysqli = getDbConnection();
            $stmt = $mysqli->prepare("DELETE FROM mails WHERE id = ?");
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $affected = $stmt->affected_rows;
            $stmt->close();
            $mysqli->close();

            Lib::ShowDebug(FILENAME, "[DeleteMail] Deleted mail group id=$id by user '$user'");
            sendJsonResponse(true, "Usunięto grupę mailową", array('affected' => $affected));
            break;

        default:
            Lib::ShowError(FILENAME, "Unknown job requested: '$job'");
            sendJsonResponse(false, "Nieznany job: '$job'", null, 404);
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
    sendJsonResponse(false, 'Wewnętrzny błąd serwera', null, 500);
}
