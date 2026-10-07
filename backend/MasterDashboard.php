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
/** @noinspection SpellCheckingInspection */
declare(strict_types=1);

/**
 * Master Samples Dashboard Backend API
 * Production path: /custom/matz/php/MasterDashboard.php
 */

use BuildingBlocks\Archive;
use BuildingBlocks\Lib;
use BuildingBlocks\Unit;
use JetBrains\PhpStorm\NoReturn;

date_default_timezone_set('Europe/Warsaw');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-User, X-User-Name, X-User-Groups, Accept, Origin');
require("../phpBB/BuildingBlocks.php");

define('FILENAME', basename(__FILE__, '.php'));

$config = @parse_ini_file('/fis/mantis/custom/database/config.ini', true);
if (!$config || !isset($config['database']['host'], $config['database']['user'], $config['database']['password'])) {
    try {
        echo json_encode([
            'status'  => false,
            'message' => "Invalid DB config.ini",
            'data'    => [],
        ], JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        Lib::ShowError(FILENAME, "JSON encoding failed: " . $e->getMessage());
        http_response_code(500);
    }
    exit;
}

define("DB_HOST", $config['database']['host']);
define("DB_USER", $config['database']['user']);
define("DB_PASSWORD", $config['database']['password']);
const DB_NAME = "masterSample";
const DB_HOST_LOCAL = "localhost";
const DB_USER_LOCAL = "fiswww";
const DB_PASSWORD_LOCAL = "";
const DB_NAME_LOCAL = "users";

const blockedMachinesDir = '/fis/mantis/data/blocked_machines/';
const PALETKI_AUTH_URL = 'http://10.142.11.66:8082/auth/login';

function callPaletkiAuthLogin(string $login, string $password): array
{
    $payload = json_encode([
        'login' => $login,
        'password' => $password,
    ], JSON_UNESCAPED_UNICODE);

    $ch = curl_init(PALETKI_AUTH_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 4,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError !== '') {
        Lib::ShowError(FILENAME, "[Login] cURL error connecting to Paletki auth: " . $curlError);
        return [
            'success' => false,
            'code' => 503,
            'message' => 'Brak połączenia z serwisem autoryzacji domenowej (Paletki)',
        ];
    }

    $data = json_decode((string)$response, true);
    if (!is_array($data)) {
        Lib::ShowError(FILENAME, "[Login] Invalid JSON response from Paletki auth ($httpCode): " . substr((string)$response, 0, 200));
        return [
            'success' => false,
            'code' => 502,
            'message' => 'Nieprawidłowa odpowiedź z serwera autoryzacji',
        ];
    }

    if ($httpCode !== 200 || empty($data['status'])) {
        $msg = $data['message'] ?? 'Nieprawidłowy login lub hasło domenowe';
        return [
            'success' => false,
            'code' => $httpCode >= 400 && $httpCode < 500 ? 401 : 502,
            'message' => $msg,
        ];
    }

    return [
        'success' => true,
        'code' => 200,
        'data' => is_array($data['data'] ?? null) ? $data['data'] : [],
        'token' => (string)($data['token'] ?? ''),
        'expires_at' => (string)($data['expires_at'] ?? ''),
    ];
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const ALLOWED_GROUPS = [
    'admin_group',
    'support_group',
    'fisadmin_group',
    'testeng',
    'proceng',
    'golden_samples',
];

#[NoReturn]
function sendJsonResponse(bool $status, string $message, mixed $data = null, int $statusCode = 200): void
{
    http_response_code($statusCode);
    try {
        echo json_encode([
            'status' => $status,
            'message' => $message,
            'data' => $data,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    } catch (JsonException) {
        echo '{"status":false,"message":"JSON encoding error"}';
    }
    exit;
}

final class ApiOperationException extends RuntimeException
{
    public string $publicMessage;
    public int $statusCode;
    public mixed $responseData;

    public function __construct(
        string $publicMessage,
        int $statusCode = 500,
        mixed $responseData = null,
        ?Throwable $previous = null
    ) {
        $this->publicMessage = $publicMessage;
        $this->statusCode = $statusCode;
        $this->responseData = $responseData;
        parent::__construct($publicMessage, 0, $previous);
    }
}

function getDbConnection(): mysqli
{
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $mysqli = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME);
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

function getLocalUserDbConnection(): mysqli
{
    $mysqli = new mysqli(DB_HOST_LOCAL, DB_USER_LOCAL, DB_PASSWORD_LOCAL, DB_NAME_LOCAL);
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

function getRequestData(): array
{
    static $input = null;
    if ($input !== null) {
        return $input;
    }

    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    $form = Lib::getForm($contentType, FILENAME);
    $input = array_merge($_GET, is_array($form) ? $form : []);
    return $input;
}

function cleanUsername(string $user): string
{
    $user = trim($user);
    if (str_contains($user, '\\')) {
        $user = substr($user, strrpos($user, '\\') + 1);
    }
    if (str_contains($user, '@')) {
        $user = substr($user, 0, strpos($user, '@'));
    }
    return trim($user, " \t\n\r\0\x0B\"'");
}

function normalizeFisValue(mixed $fis): string
{
    return str_contains(strtoupper(trim((string)$fis)), '2') ? 'FIS2' : 'FIS1';
}

function getServerFis(): ?string
{
    $host = strtolower(($_SERVER['HTTP_HOST'] ?? ''));
    if (str_contains($host, 'plblofis2')) {
        return 'FIS2';
    }
    if (str_contains($host, 'plblofis1')) {
        return 'FIS1';
    }

    return null;
}

function isMissingFisUnitError(Throwable $error): bool
{
    for ($current = $error; $current !== null; $current = $current->getPrevious()) {
        $message = strtolower($current->getMessage());
        if (str_contains($message, 'no such unit')
            || str_contains($message, 'unit not found')
            || str_contains($message, "unit doesn't exist")) {
            return true;
        }
    }

    return false;
}

function formatOperationError(
    string $operation,
    string $stage,
    string $unit,
    string $fis,
    Throwable $error,
    ?string $state = null
): string {
    $message = sprintf(
        "%s failed [stage=%s, unit='%s', fis=%s, exception=%s, code=%d]: %s",
        $operation,
        $stage,
        $unit,
        $fis,
        get_class($error),
        $error->getCode(),
        $error->getMessage()
    );

    return $state !== null ? $message . ' | state: ' . $state : $message;
}

function getAuthenticatedUser(): string
{
    $remoteUser = cleanUsername(getenv('REMOTE_USER') ?: ($_SERVER['REMOTE_USER'] ?? $_SERVER['AUTH_USER'] ?? ''));
    if ($remoteUser !== '') {
        return $remoteUser;
    }

    if (!empty($_SERVER['HTTP_X_USER'])) {
        return cleanUsername(rawurldecode((string)$_SERVER['HTTP_X_USER']));
    }

    $input = getRequestData();
    $inputUser = $input['user'] ?? $input['userId'] ?? '';
    if ($inputUser !== '') {
        return cleanUsername($inputUser);
    }

    return '';
}

function getUserGroups(string $userId): array
{
    $userId = cleanUsername($userId);
    $groups = [];
    if ($userId !== '') {
        try {
            $dbGroups = Lib::GetUserGroup($userId);
            if (is_array($dbGroups) && !empty($dbGroups)) {
                $groups = array_values(array_map('strval', $dbGroups));
            }
        } catch (Throwable $error) {
            Lib::ShowError(FILENAME, "Lib::GetUserGroup failed for '$userId': " . $error->getMessage());
        }
    }

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

    if (empty($groups)) {
        $input = getRequestData();
        $inputGroups = $input['userGroups'] ?? null;
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

function requireWriteAccess(): string
{
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if ($method !== 'POST') {
        Lib::ShowError(FILENAME, "requireWriteAccess denied: Method is '$method', POST required");
        sendJsonResponse(false, 'Ta operacja wymaga metody POST', null, 405);
    }

    $userId = getAuthenticatedUser();
    if ($userId === '') {
        Lib::ShowError(FILENAME, "requireWriteAccess denied: No authenticated user");
        sendJsonResponse(false, 'Brak uwierzytelnionego użytkownika', null, 401);
    }

    $userGroups = getUserGroups($userId);
    if (empty(array_intersect($userGroups, ALLOWED_GROUPS))) {
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

function getOperatorName(): string
{
    if (!empty($_SERVER['HTTP_X_USER_NAME'])) {
        $name = trim(rawurldecode((string)$_SERVER['HTTP_X_USER_NAME']));
        if ($name !== '') {
            return $name;
        }
    }

    $input = getRequestData();
    $passedName = trim((string)($input['userName'] ?? $input['userFullName'] ?? $input['operatorName'] ?? ''));
    if ($passedName !== '') {
        return $passedName;
    }

    $user = getAuthenticatedUser();
    return $user !== '' ? $user : 'SYSTEM';
}

$input = getRequestData();
$job = $input['job'] ?? $_GET['job'] ?? '';

if ($job === '') {
    Lib::ShowError(FILENAME, "Incoming request without 'job' parameter from IP " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    sendJsonResponse(false, 'Brak parametru job', null, 400);
}

Lib::ShowDebug(FILENAME, "[Request] job='$job', method=" . ($_SERVER['REQUEST_METHOD'] ?? '') . ", user='" . getAuthenticatedUser() . "', IP=" . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
try {
    switch ($job) {
        case 'Login': {
            $login = trim((string)($input['login'] ?? $input['username'] ?? ''));
            $password = (string)($input['password'] ?? '');

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
            $fullName = trim((string)($paletkiUser['FullName'] ?? ''));
            $department = trim((string)($paletkiUser['department'] ?? ''));

            // Pobranie grup i danych z bazy FIS
            $userGroups = getUserGroups($cleanUser);
            $canEdit = !empty(array_intersect($userGroups, ALLOWED_GROUPS));
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
            } catch (Throwable $error) {
                Lib::ShowError(FILENAME, "[Login] Database lookup error for '$cleanUser': " . $error->getMessage());
            }

            if ($email === '' && str_contains($rawPaletkiUser, '@')) {
                $email = $rawPaletkiUser;
            }

            if ($fullName === '') {
                $fullName = $cleanUser;
            }

            Lib::ShowDebug(FILENAME, "[Login] User '$cleanUser' logged in successfully. canEdit=" . ($canEdit ? 'true' : 'false') . ", groups=[" . implode(', ', $userGroups) . "]");

            sendJsonResponse(true, 'Zalogowano pomyślnie', [
                'userId' => $cleanUser,
                'name' => $fullName,
                'email' => $email,
                'department' => $department,
                'groups' => $userGroups,
                'canEdit' => $canEdit,
                'isGuest' => false,
                'token' => $authRes['token'],
                'expires_at' => $authRes['expires_at'],
            ]);
            break;
        }

        case 'GetMasters': {
            $mysqli = getDbConnection();
            try {
                $statusFilter = $input['status'] ?? '';
                $processFilter = $input['process'] ?? '';
                $activeFilter = isset($input['isactive']) && $input['isactive'] !== '' ? (int)$input['isactive'] : null;
                $search = trim($input['search'] ?? '');

                $where = [];
                $types = '';
                $params = [];

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

                $stmt = $mysqli->prepare($sql);
                if (!empty($params)) {
                    $stmt->bind_param($types, ...$params);
                }
                $stmt->execute();
                $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmt->close();

                sendJsonResponse(true, 'Lista masterów pobrana', $rows);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'ResetCounters': {
            $rawUnits = $input['units'] ?? $input['unit'] ?? $input['serialNumber'] ?? '';
            $user = requireWriteAccess();
            $operatorName = getOperatorName();
            $resetType = strtolower(trim($input['resetType'] ?? 'all'));

            if (empty($rawUnits)) {
                Lib::ShowError(FILENAME, "[ResetCounters] Missing units parameter");
                sendJsonResponse(false, 'Brak jednostek do zresetowania', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', (string)$rawUnits)));
            if (empty($unitList)) {
                Lib::ShowError(FILENAME, "[ResetCounters] No valid units found in: " . var_export($rawUnits, true));
                sendJsonResponse(false, 'Brak poprawnych jednostek', null, 400);
            }

            Lib::ShowDebug(FILENAME, "[ResetCounters] Start resetting unit(s): [" . implode(', ', $unitList) . "], type='$resetType', operator='$operatorName'");
            $mysqli = getDbConnection();
            try {
                $mysqli->begin_transaction();
                try {
                    $resetCount = 0;
                    if ($resetType === 'cycles') {
                        $operationName = 'ResetCycles';
                    } elseif ($resetType === 'errors') {
                        $operationName = 'ResetErrors';
                    } else {
                        $operationName = 'Reset';
                    }

                    foreach ($unitList as $unit) {
                        $stmtCheck = $mysqli->prepare("SELECT isactive FROM masterUnits WHERE unit = ? LIMIT 1");
                        $stmtCheck->bind_param('s', $unit);
                        $stmtCheck->execute();
                        $checkRow = $stmtCheck->get_result()->fetch_assoc();
                        $stmtCheck->close();

                        if (!$checkRow || (int)$checkRow['isactive'] === 2) {
                            Lib::ShowDebug(FILENAME, "[ResetCounters] Skipping inactive/blocked unit '$unit'");
                            continue;
                        }

                        $stmtHist = $mysqli->prepare(
                            "INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`)
                             SELECT unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, ?, ?, NOW()
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

                    $mysqli->commit();
                    Lib::ShowDebug(FILENAME, "[ResetCounters] Succeeded: Reset $resetCount unit(s) (type='$resetType')");
                    if ($resetType === 'cycles') {
                        $msg = "Wyzerowano liczniki cykli ($resetCount sztuk)";
                    } elseif ($resetType === 'errors') {
                        $msg = "Wyzerowano liczniki błędów ($resetCount sztuk)";
                    } else {
                        $msg = "Wyzerowano wszystkie liczniki ($resetCount sztuk)";
                    }

                    sendJsonResponse(true, $msg, ['count' => $resetCount, 'resetType' => $resetType]);
                } catch (Throwable $err) {
                    $mysqli->rollback();
                    Lib::ShowError(FILENAME, "[ResetCounters] Failed during transaction: " . $err->getMessage());
                    throw $err;
                }
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'BlockMaster': {
            $rawUnits = $input['units'] ?? $input['unit'] ?? $input['serialNumber'] ?? '';
            $user = requireWriteAccess();
            $operatorName = getOperatorName();

            if (empty($rawUnits)) {
                Lib::ShowError(FILENAME, "[BlockMaster] Missing units parameter");
                sendJsonResponse(false, 'Brak jednostek do zablokowania', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', (string)$rawUnits)));
            Lib::ShowDebug(FILENAME, "[BlockMaster] Start blocking unit(s): [" . implode(', ', $unitList) . "], operator='$operatorName'");
            $mysqli = getDbConnection();
            try {
                $mysqli->begin_transaction();
                try {
                    foreach ($unitList as $unit) {
                        $stmtHist = $mysqli->prepare(
                            "INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`)
                             SELECT unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, ?, 'Block', NOW()
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

                    $mysqli->commit();
                    Lib::ShowDebug(FILENAME, "[BlockMaster] Succeeded for unit(s): [" . implode(', ', $unitList) . "]");
                    sendJsonResponse(true, "Zablokowano mastera (isActive=2)!");
                } catch (Throwable $err) {
                    $mysqli->rollback();
                    Lib::ShowError(FILENAME, "[BlockMaster] Failed: " . $err->getMessage());
                    throw $err;
                }
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'ActivateMaster': {
            $rawUnits = $input['units'] ?? $input['unit'] ?? $input['serialNumber'] ?? '';
            $user = requireWriteAccess();
            $operatorName = getOperatorName();

            if (empty($rawUnits)) {
                Lib::ShowError(FILENAME, "[ActivateMaster] Missing units parameter");
                sendJsonResponse(false, 'Brak jednostek do aktywacji', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', (string)$rawUnits)));
            Lib::ShowDebug(FILENAME, "[ActivateMaster] Start activating unit(s): [" . implode(', ', $unitList) . "], operator='$operatorName'");
            $mysqli = getDbConnection();
            try {
                $mysqli->begin_transaction();
                try {
                    foreach ($unitList as $unit) {
                        $stmtHist = $mysqli->prepare(
                            "INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`)
                             SELECT unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, ?, 'Activate', NOW()
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

                    $mysqli->commit();
                    Lib::ShowDebug(FILENAME, "[ActivateMaster] Succeeded for unit(s): [" . implode(', ', $unitList) . "]");
                    sendJsonResponse(true, "Jednostki zostały aktywowane (isActive=1)!");
                } catch (Throwable $err) {
                    $mysqli->rollback();
                    Lib::ShowError(FILENAME, "[ActivateMaster] Failed: " . $err->getMessage());
                    throw $err;
                }
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'DeleteMaster': {
            $unit = trim($input['unit'] ?? $input['serialNumber'] ?? '');
            $user = requireWriteAccess();

            if ($unit === '') {
                Lib::ShowError(FILENAME, "[DeleteMaster] Missing unit parameter");
                sendJsonResponse(false, 'Brak parametru unit', null, 400);
            }

            $fisOnly = !empty($input['fisOnly']) || !empty($input['deleteFisOnly']);
            $reqFis = $input['fis'] ?? '';
            Lib::ShowDebug(FILENAME, "[DeleteMaster] Start unit='$unit', requestedFis='$reqFis', fisOnly=" . ($fisOnly ? '1' : '0') . ", user='$user'");
            $mysqli = getDbConnection();
            try {
                $stmtMaster = $mysqli->prepare("SELECT FIS FROM masterUnits WHERE unit = ? LIMIT 1");
                $stmtMaster->bind_param('s', $unit);
                $stmtMaster->execute();
                $masterRow = $stmtMaster->get_result()->fetch_assoc();
                $stmtMaster->close();

                if (!$masterRow && !$fisOnly) {
                    Lib::ShowError(FILENAME, "[DeleteMaster] Master '$unit' does not exist in database");
                    sendJsonResponse(false, "Master '$unit' nie istnieje w bazie danych", null, 404);
                }

                $storedFis = $masterRow ? normalizeFisValue($masterRow['FIS'] ?? 'FIS1') : null;
                $requestedFisRaw = strtoupper(trim($input['fis'] ?? ''));
                if ($requestedFisRaw !== '' && !in_array($requestedFisRaw, ['FIS1', 'FIS2'], true)) {
                    Lib::ShowError(FILENAME, "[DeleteMaster] Invalid requested FIS: '$requestedFisRaw'");
                    sendJsonResponse(false, 'Nieprawidłowy serwer FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
                }

                $requestedFis = $requestedFisRaw !== '' ? $requestedFisRaw : ($storedFis ?? 'FIS1');
                if (!$fisOnly && $storedFis !== null && $requestedFis !== $storedFis) {
                    Lib::ShowError(FILENAME, "[DeleteMaster] FIS mismatch for unit '$unit': expected '$storedFis', got '$requestedFis'");
                    sendJsonResponse(
                        false,
                        "Master '$unit' należy do $storedFis, a żądanie usunięcia wysłano dla $requestedFis.",
                        ['expected_fis' => $storedFis],
                        409
                    );
                }

                $serverFis = getServerFis();
                $targetHostFis = $fisOnly ? $requestedFis : ($storedFis ?? $requestedFis);
                if ($serverFis !== null && $targetHostFis !== null && $serverFis !== $targetHostFis) {
                    Lib::ShowError(FILENAME, "[DeleteMaster] Server mismatch: request hit $serverFis, but unit '$unit' belongs to $targetHostFis");
                    sendJsonResponse(
                        false,
                        "Żądanie trafiło do $serverFis, ale master '$unit' należy do $targetHostFis.",
                        ['expected_fis' => $targetHostFis],
                        409
                    );
                }

                $fisDeleted = false;
                $fisAlreadyMissing = false;
                $effectiveFis = $serverFis ?? $targetHostFis;

                try {
                    Unit::Delete($unit);
                    $fisDeleted = true;
                } catch (Throwable $fisError) {
                    if (!isMissingFisUnitError($fisError)) {
                        Lib::ShowError(FILENAME, "[DeleteMaster] Unit::Delete failed for unit '$unit' in $effectiveFis: " . $fisError->getMessage());
                        throw new ApiOperationException(
                            formatOperationError('DeleteMaster', 'Unit::Delete', $unit, $effectiveFis, $fisError),
                            502,
                            ['fis' => $effectiveFis, 'fis_deleted' => false],
                            $fisError,
                        );
                    }
                    $fisAlreadyMissing = true;
                    Lib::ShowDebug(FILENAME, "[DeleteMaster] Unit '$unit' was already missing from $effectiveFis");
                }

                if ($fisOnly) {
                    Lib::ShowDebug(FILENAME, "[DeleteMaster] Succeeded (fisOnly): Master '$unit' deleted from $effectiveFis (fisDeleted=" . ($fisDeleted ? '1' : '0') . ")");
                    $message = $fisDeleted
                        ? "Master '$unit' został usunięty z $effectiveFis"
                        : "Master '$unit' nie istniał już w $effectiveFis";
                    sendJsonResponse(true, $message, [
                        'fis' => $effectiveFis,
                        'fis_deleted' => $fisDeleted,
                        'fis_only' => true,
                    ]);
                }

                $mysqli->begin_transaction();
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

                    $mysqli->commit();
                    Lib::ShowDebug(FILENAME, "[DeleteMaster] Succeeded: Master '$unit' deleted from $effectiveFis and DB (fisDeleted=" . ($fisDeleted ? '1' : '0') . ", affectedRows=$affected)");
                    $message = $fisDeleted
                        ? "Master '$unit' został usunięty z $effectiveFis i z bazy danych"
                        : "Master '$unit' nie istniał już w $effectiveFis i został usunięty z bazy danych";
                    sendJsonResponse(true, $message, [
                        'affected_rows' => $affected,
                        'fis' => $effectiveFis,
                        'fis_deleted' => $fisDeleted,
                    ]);
                } catch (Throwable $err) {
                    $mysqli->rollback();
                    Lib::ShowError(FILENAME, "[DeleteMaster] Failed: " . $err->getMessage());
                    if (($fisDeleted || $fisAlreadyMissing) && !($err instanceof ApiOperationException)) {
                        throw new ApiOperationException(
                            formatOperationError(
                                'DeleteMaster',
                                'database_delete',
                                $unit,
                                $effectiveFis,
                                $err,
                                'unit_absent_in_fis=true, database_deleted=false; retry_required=true',
                            ),
                            500,
                            [
                                'fis' => $effectiveFis,
                                'fis_deleted' => $fisDeleted,
                                'fis_already_missing' => $fisAlreadyMissing,
                                'database_deleted' => false,
                            ],
                            $err,
                        );
                    }
                    throw $err;
                }
            } finally {
                $mysqli->close();
            }
            break;
        }

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
                throw $err;
            }
            Lib::ShowDebug(FILENAME, "[UpdateMaster] unit='$unit', fis='$fis', operator='$operatorName', changed=" . ($changed ? '1' : '0'));
            sendJsonResponse(true, 'Zapisano ustawienia mastera', array('unit' => $unit, 'changed' => $changed));
            break;
        }

        case 'CreateMaster': {
            $user = requireWriteAccess();
            $unit = strtoupper(trim($input['unit'] ?? $input['serialNumber'] ?? ''));
            $processList = trim($input['process'] ?? $input['processName'] ?? '');
            $statusInput = $input['status'] ?? 'GOOD';
            if (!is_string($statusInput)) {
                sendJsonResponse(false, 'Nieprawidłowy status. Dozwolone wartości: GOOD, BAD.', null, 400);
            }
            $status = strtoupper(trim($statusInput));
            $maxCounter = filter_var($input['maxCounter'] ?? 1000, FILTER_VALIDATE_INT, [
                'options' => ['min_range' => 1, 'max_range' => 2147483647],
            ]);
            $errorMaxCounter = filter_var($input['maxErrors'] ?? $input['errorMaxCounter'] ?? 50, FILTER_VALIDATE_INT, [
                'options' => ['min_range' => 1, 'max_range' => 2147483647],
            ]);
            $forceUpdate = !empty($input['forceUpdate']);

            if (!in_array($status, ['GOOD', 'BAD'], true)) {
                sendJsonResponse(false, 'Nieprawidłowy status. Dozwolone wartości: GOOD, BAD.', null, 400);
            }
            if ($maxCounter === false || $errorMaxCounter === false) {
                sendJsonResponse(false, 'Limity muszą być dodatnimi liczbami całkowitymi do 2147483647.', null, 400);
            }

            if ($unit === '' || $processList === '') {
                Lib::ShowError(FILENAME, "[CreateMaster] Validation error: SN or process is empty (unit='$unit', process='$processList')");
                sendJsonResponse(false, 'Numer seryjny (SN) oraz proces są wymagane!', null, 400);
            }

            $fisValue = strtoupper(trim($input['fis'] ?? 'FIS1'));
            if (!in_array($fisValue, ['FIS1', 'FIS2'], true)) {
                Lib::ShowError(FILENAME, "[CreateMaster] Invalid target FIS: '$fisValue'");
                sendJsonResponse(false, 'Nieprawidłowy serwer docelowy FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
            }

            $userKey2 = trim((string)($input['userKey2'] ?? $input['userkey2'] ?? $input['pn'] ?? ''));

            Lib::ShowDebug(FILENAME, "[CreateMaster] Start unit='$unit', process='$processList', status='$status', fis='$fisValue', maxCounter=$maxCounter, maxErrors=$errorMaxCounter, forceUpdate=" . ($forceUpdate ? '1' : '0') . ", user='$user', userKey2='$userKey2'");

            $serverFis = getServerFis();
            if ($serverFis !== null && $serverFis !== $fisValue) {
                Lib::ShowError(FILENAME, "[CreateMaster] Target mismatch: request for $fisValue hit server $serverFis");
                sendJsonResponse(
                    false,
                    "Żądanie utworzenia dla $fisValue trafiło do $serverFis.",
                    ['expected_fis' => $fisValue],
                    409
                );
            }

            $processArray = array_filter(array_map('trim', explode(',', $processList)));
            $processClean = implode(',', $processArray);

            $mysqli = getDbConnection();
            try {
                $stmtCheck = $mysqli->prepare("SELECT unit, process, status, maxCounter, errorMaxCounter, isactive, FIS FROM masterUnits WHERE unit = ? LIMIT 1");
                $stmtCheck->bind_param('s', $unit);
                $stmtCheck->execute();
                $existing = $stmtCheck->get_result()->fetch_assoc();
                $stmtCheck->close();

                if ($existing && !$forceUpdate) {
                    Lib::ShowDebug(FILENAME, "[CreateMaster] Unit '$unit' already exists in database. Returning conflict comparison.");
                    sendJsonResponse(true, 'Master o tym numerze już istnieje w bazie', [
                        'exists' => true,
                        'oldData' => $existing,
                        'newData' => [
                            'unit' => $unit,
                            'process' => $processClean,
                            'status' => $status,
                            'maxCounter' => $maxCounter,
                            'errorMaxCounter' => $errorMaxCounter,
                            'FIS' => $fisValue,
                            'userKey2' => $userKey2,
                        ]
                    ]);
                }

                $unitExistsInFis = false;
                $fisUnitDeleted = false;
                try {
                    Unit::Find($unit);
                    $unitExistsInFis = true;
                } catch (Throwable $findError) {
                    if (!isMissingFisUnitError($findError)) {
                        Lib::ShowError(FILENAME, "[CreateMaster] Unit::Find failed for '$unit': " . $findError->getMessage());
                        throw new ApiOperationException(
                            formatOperationError('CreateMaster', 'Unit::Find', $unit, $fisValue, $findError),
                            502,
                            ['fis' => $fisValue, 'stage' => 'find'],
                            $findError,
                        );
                    }

                    try {
                        Archive::GetAll($unit);
                        Archive::Unarchive($unit);
                        Unit::Find($unit);
                        $unitExistsInFis = true;
                    } catch (Throwable $archiveError) {
                        if (!isMissingFisUnitError($archiveError)) {
                            Lib::ShowError(FILENAME, "[CreateMaster] Archive::Unarchive failed for '$unit': " . $archiveError->getMessage());
                            throw new ApiOperationException(
                                formatOperationError('CreateMaster', 'Archive::Unarchive', $unit, $fisValue, $archiveError),
                                502,
                                ['fis' => $fisValue, 'stage' => 'unarchive'],
                                $archiveError,
                            );
                        }
                        // A completely new unit is allowed to continue directly to CREATEUNIT.
                    }
                }

                if ($unitExistsInFis) {
                    try {
                        Unit::Delete($unit);
                        $fisUnitDeleted = true;
                        Lib::ShowDebug(FILENAME, "[CreateMaster] Existing unit '$unit' deleted from FIS prior to recreation");
                    } catch (Throwable $deleteError) {
                        Lib::ShowError(FILENAME, "[CreateMaster] Deletion of existing unit '$unit' failed: " . $deleteError->getMessage());
                        throw new ApiOperationException(
                            formatOperationError('CreateMaster', 'Unit::Delete', $unit, $fisValue, $deleteError),
                            502,
                            ['fis' => $fisValue, 'stage' => 'delete_existing'],
                            $deleteError,
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
                } catch (Throwable $dataEntryError) {
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
                        $state,
                    );
                    throw new ApiOperationException(
                        $message,
                        502,
                        [
                            'fis' => $fisValue,
                            'stage' => 'create_unit',
                            'previous_unit_deleted' => $fisUnitDeleted,
                            'database_updated' => false,
                        ],
                        $dataEntryError,
                    );
                }

                $mysqli->begin_transaction();
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

                    $mysqli->commit();
                    Lib::ShowDebug(FILENAME, "[CreateMaster] Succeeded: Master '$unit' saved in database and FIS ($operation)");
                    $actionMsg = $existing ? "Master '$unit' został pomyślnie zaktualizowany!" : "Master '$unit' został pomyślnie utworzony i zarejestrowany!";
                    sendJsonResponse(true, $actionMsg, ['unit' => $unit, 'operation' => $operation, 'FIS' => $fisValue]);
                } catch (Throwable $err) {
                    $mysqli->rollback();
                    Lib::ShowError(FILENAME, "[CreateMaster] Database transaction failed for '$unit': " . $err->getMessage());
                    throw new ApiOperationException(
                        formatOperationError(
                            'CreateMaster',
                            'database_save',
                            $unit,
                            $fisValue,
                            $err,
                            'fis_updated=true, database_updated=false; retry_required=true',
                        ),
                        500,
                        [
                            'fis' => $fisValue,
                            'stage' => 'database_save',
                            'fis_updated' => true,
                            'database_updated' => false,
                        ],
                        $err,
                    );
                }
            } finally {
                $mysqli->close();
            }
            break;
        }

        /* =========================================================================
         * 2. HISTORY & AUDIT LOGS
         * ========================================================================= */
        case 'GetMasterHistory': {
            $unit = trim($input['unit'] ?? '');
            if ($unit === '') {
                sendJsonResponse(false, 'Brak parametru unit', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare(
                    "SELECT id, unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`
                     FROM history
                     WHERE unit = ?
                     ORDER BY `date` DESC, id DESC"
                );
                $stmt->bind_param('s', $unit);
                $stmt->execute();
                $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmt->close();

                sendJsonResponse(true, "Historia dla jednostki '$unit'", $rows);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'GetHistory': {
            $mysqli = getDbConnection();
            try {
                $includeTotal = !empty($input['includeTotal']);
                $limit = isset($input['limit']) ? max(1, min(500, (int)$input['limit'])) : 100;
                $offset = isset($input['offset']) ? max(0, (int)$input['offset']) : 0;
                $unitFilter = trim($input['unit'] ?? '');
                $opFilter = trim($input['operation'] ?? '');
                $userFilter = trim($input['user'] ?? '');
                $processFilter = trim($input['process'] ?? '');
                $statusFilter = trim($input['status'] ?? '');
                $dateFrom = trim($input['dateFrom'] ?? '');
                $dateTo = trim($input['dateTo'] ?? '');

                $where = [];
                $types = '';
                $params = [];

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
                    $params[] = str_contains($dateFrom, ' ') ? $dateFrom : ($dateFrom . ' 00:00:00');
                }
                if ($dateTo !== '') {
                    $where[] = "`date` <= ?";
                    $types .= 's';
                    $params[] = str_contains($dateTo, ' ') ? $dateTo : ($dateTo . ' 23:59:59');
                }

                if ($includeTotal) {
                    $countSql = "SELECT COUNT(*) AS total FROM history";
                    if (!empty($where)) {
                        $countSql .= " WHERE " . implode(" AND ", $where);
                    }
                    $countStmt = $mysqli->prepare($countSql);
                    if ($params) {
                        $countStmt->bind_param($types, ...$params);
                    }
                    $countStmt->execute();
                    $total = (int)$countStmt->get_result()->fetch_assoc()['total'];
                    $countStmt->close();
                }

                $sql = "SELECT id, unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date` FROM history";
                if (!empty($where)) {
                    $sql .= " WHERE " . implode(" AND ", $where);
                }
                $sql .= " ORDER BY `date` DESC, id DESC LIMIT ? OFFSET ?";
                $types .= 'ii';
                $params[] = $limit;
                $params[] = $offset;

                $stmt = $mysqli->prepare($sql);
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmt->close();

                sendJsonResponse(true, 'Historia operacji załadowana', $includeTotal ? ['records' => $rows, 'total' => $total] : $rows);
            } finally {
                $mysqli->close();
            }
            break;
        }

        /* =========================================================================
         * 3. BLOCKED MACHINES
         * ========================================================================= */
        case 'GetBlockedMachines': {
            $items = [];
            if (is_dir(blockedMachinesDir) && ($files = scandir(blockedMachinesDir)) !== false) {
                foreach ($files as $file) {
                    if ($file === '.' || $file === '..' || str_contains($file, '10.237.')) {
                        continue;
                    }
                    $fullPath = blockedMachinesDir . $file;
                    if (!is_file($fullPath)) {
                        continue;
                    }

                    $lastUnderscore = strrpos($file, '_');
                    $machine = $lastUnderscore !== false ? substr($file, 0, $lastUnderscore) : $file;
                    $prefix = $lastUnderscore !== false ? substr($file, $lastUnderscore + 1) : 'MASTER';
                    $mtime = filemtime($fullPath);

                    $items[] = [
                        'id' => $file,
                        'filename' => $file,
                        'machine' => $machine ?: 'UNKNOWN',
                        'prefix' => $prefix ?: 'MASTER',
                        'blockedAt' => $mtime ? date('Y-m-d H:i:s', $mtime) : null,
                        'size' => filesize($fullPath) ?: 0,
                    ];
                }
            }
            sendJsonResponse(true, 'Pobrano zablokowane maszyny', $items);
            break;
        }

        case 'DeleteBlockedMachine': {
            $user = requireWriteAccess();
            $record = trim($input['record'] ?? $input['filename'] ?? '');
            if ($record === '' || $record === '.' || $record === '..' || strpos($record, '/') !== false || strpos($record, chr(92)) !== false || strpos($record, chr(0)) !== false) {
                Lib::ShowError(FILENAME, "[DeleteBlockedMachine] Missing record/filename parameter");
                sendJsonResponse(false, 'Brak parametru record/filename', null, 400);
            }

            Lib::ShowDebug(FILENAME, "[DeleteBlockedMachine] Unblocking machine record='$record' by user='$user'");
            $targetPath = blockedMachinesDir . basename($record);
            if (is_link($targetPath) || !is_file($targetPath)) {
                Lib::ShowError(FILENAME, "[DeleteBlockedMachine] Block file '$record' not found at '$targetPath'");
                sendJsonResponse(false, "Plik blokady '$record' nie istnieje", null, 404);
            }

            unlockMachineWithAudit($targetPath, $record, getServerFis() ?: 'FIS1');
            sendJsonResponse(true, "Blokada dla '$record' została pomyślnie usunięta i zapisana w audycie!");
            break;
        }

        /* =========================================================================
         * 4. ENGINEERS & MAILING GROUPS
         * ========================================================================= */
        case 'GetEngineers': {
            $mysqli = getDbConnection();
            try {
                $res = $mysqli->query("SELECT id, process, mail FROM engineers ORDER BY process");
                $rows = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
                sendJsonResponse(true, 'Lista inżynierów załadowana', $rows);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'UpdateEngineerMail': {
            $user = requireWriteAccess();
            $process = trim($input['process'] ?? '');
            $mail = trim($input['mail'] ?? '');

            if ($process === '') {
                Lib::ShowError(FILENAME, "[UpdateEngineerMail] Missing process parameter");
                sendJsonResponse(false, 'Brak parametru process', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare("UPDATE engineers SET mail = ? WHERE process = ?");
                $stmt->bind_param('ss', $mail, $process);
                $stmt->execute();
                $affected = $stmt->affected_rows;
                $stmt->close();

                Lib::ShowDebug(FILENAME, "[UpdateEngineerMail] Process '$process' mail set to '$mail' by user '$user'");
                sendJsonResponse(true, "Zaktualizowano grupę mailową dla procesu '$process'", ['affected' => $affected]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'AddEngineer': {
            $user = requireWriteAccess();
            $process = trim($input['process'] ?? '');
            $mail = trim($input['mail'] ?? '');

            if ($process === '') {
                Lib::ShowError(FILENAME, "[AddEngineer] Missing process parameter");
                sendJsonResponse(false, 'Brak parametru process', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare(
                    "INSERT INTO engineers (process, mail) VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE mail = VALUES(mail)"
                );
                $stmt->bind_param('ss', $process, $mail);
                $stmt->execute();
                $insertId = $stmt->insert_id;
                $stmt->close();

                Lib::ShowDebug(FILENAME, "[AddEngineer] Process '$process' configured with mail '$mail' (id=$insertId) by user '$user'");
                sendJsonResponse(true, "Proces '$process' został pomyślnie skonfigurowany!", ['id' => $insertId]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'DeleteEngineer': {
            $user = requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : null;
            $process = trim($input['process'] ?? '');

            if (!$id && $process === '') {
                Lib::ShowError(FILENAME, "[DeleteEngineer] Missing id or process parameter");
                sendJsonResponse(false, 'Brak parametru id lub process', null, 400);
            }

            $mysqli = getDbConnection();
            try {
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

                Lib::ShowDebug(FILENAME, "[DeleteEngineer] Deleted process configuration (id=" . var_export($id, true) . ", process='$process') by user '$user'");
                sendJsonResponse(true, "Usunięto konfigurację procesu", ['affected' => $affected]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'GetMails': {
            $mysqli = getDbConnection();
            try {
                $res = $mysqli->query("SELECT id, name, mail FROM mails ORDER BY name");
                $rows = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
                sendJsonResponse(true, 'Książka adresowa maili załadowana', $rows);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'AddMail': {
            $user = requireWriteAccess();
            $name = trim($input['name'] ?? '');
            $mail = trim($input['mail'] ?? '');

            if ($mail === '') {
                Lib::ShowError(FILENAME, "[AddMail] Missing email address");
                sendJsonResponse(false, 'Adres e-mail jest wymagany!', null, 400);
            }

            if ($name === '') {
                $name = explode('@', $mail)[0];
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare("INSERT INTO mails (name, mail) VALUES (?, ?)");
                $stmt->bind_param('ss', $name, $mail);
                $stmt->execute();
                $id = $stmt->insert_id;
                $stmt->close();

                Lib::ShowDebug(FILENAME, "[AddMail] Added mail group '$name' ($mail, id=$id) by user '$user'");
                sendJsonResponse(true, "Dodano grupę mailową '$name' ($mail)", ['id' => $id]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'UpdateMail': {
            $user = requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : 0;
            $name = trim($input['name'] ?? '');
            $mail = trim($input['mail'] ?? '');

            if ($id <= 0 || $mail === '') {
                Lib::ShowError(FILENAME, "[UpdateMail] Invalid id or missing mail: id=$id, mail='$mail'");
                sendJsonResponse(false, 'Nieprawidłowe ID lub brak adresu mailowego', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare("UPDATE mails SET name = ?, mail = ? WHERE id = ?");
                $stmt->bind_param('ssi', $name, $mail, $id);
                $stmt->execute();
                $affected = $stmt->affected_rows;
                $stmt->close();

                Lib::ShowDebug(FILENAME, "[UpdateMail] Updated mail group id=$id to '$name' ($mail) by user '$user'");
                sendJsonResponse(true, "Zaktualizowano grupę mailową", ['affected' => $affected]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'DeleteMail': {
            $user = requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : 0;
            if ($id <= 0) {
                Lib::ShowError(FILENAME, "[DeleteMail] Invalid mail id: $id");
                sendJsonResponse(false, 'Nieprawidłowe ID maila', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare("DELETE FROM mails WHERE id = ?");
                $stmt->bind_param('i', $id);
                $stmt->execute();
                $affected = $stmt->affected_rows;
                $stmt->close();

                Lib::ShowDebug(FILENAME, "[DeleteMail] Deleted mail group id=$id by user '$user'");
                sendJsonResponse(true, "Usunięto grupę mailową", ['affected' => $affected]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        default:
            Lib::ShowError(FILENAME, "Unknown job requested: '$job'");
            sendJsonResponse(false, "Nieznany job: '$job'", null, 404);
    }
} catch (Throwable $e) {
    Lib::ShowError(FILENAME, "[Fatal] Exception in job '$job': " . $e->getMessage() . " at " . $e->getFile() . ":" . $e->getLine());
    Lib::ShowError(FILENAME, "[Fatal] Stack trace:\n" . $e->getTraceAsString());
    if ($e instanceof ApiOperationException) {
        sendJsonResponse(false, $e->publicMessage, $e->responseData, $e->statusCode);
    }
    sendJsonResponse(false, 'Wewnętrzny błąd serwera', null, 500);
}
