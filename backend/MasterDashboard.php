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

define('FILENAME', basename(__FILE__, '.php'));

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

try {
    $buildingBlocksCandidates = [
        __DIR__ . '/../phpBB/BuildingBlocks.php', // production: /custom/matz/phpBB
        __DIR__ . '/BuildingBlocks.php',          // repository main backend
        __DIR__ . '/../BuildingBlocks.php',       // repository FIS2 deployment copy
    ];
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
} catch (Throwable $error) {
    Lib::ShowError(FILENAME, print_r($error, true));
    sendJsonResponse(false, 'Nie udało się załadować biblioteki FIS BuildingBlocks.', null, 500);
}

function getDbConnection(string $defaultDb = 'masterSample'): mysqli
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
            $password = (string)($parsed['database']['password'] ?? '');
        }
    } else {
        $host = getenv('DB_HOST') ?: '127.0.0.1';
        $user = getenv('DB_USER') ?: 'root';
        $password = getenv('DB_PASSWORD') ?: '';
    }

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $mysqli = new mysqli($host, $user, $password, $dbName);
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

function getLocalUserDbConnection(): mysqli
{
    $mysqli = new mysqli('localhost', 'fiswww', '', 'users');
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

function getCurrentUser(array $input): string
{
    $authenticated = getAuthenticatedUser();
    if ($authenticated !== '') {
        return $authenticated;
    }

    $user = trim((string)($input['user'] ?? $input['userId'] ?? ''));
    if ($user !== '') {
        return cleanUsername($user);
    }
    return 'SYSTEM';
}

function getAuthenticatedUser(): string
{
    $remoteUser = cleanUsername(getenv('REMOTE_USER') ?: ($_SERVER['REMOTE_USER'] ?? $_SERVER['AUTH_USER'] ?? ''));
    if ($remoteUser !== '') {
        return $remoteUser;
    }

    if (!empty($_SERVER['HTTP_X_USER'])) {
        return cleanUsername($_SERVER['HTTP_X_USER']);
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
    try {
        $groups = Lib::GetUserGroup($userId);
        return array_values(array_map('strval', $groups));
    } catch (Throwable $error) {
        Lib::ShowError(FILENAME, print_r($error, true));
        return [];
    }
}

function requireWriteAccess(): string
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        sendJsonResponse(false, 'Ta operacja wymaga metody POST', null, 405);
    }

    $userId = getAuthenticatedUser();
    if ($userId === '') {
        sendJsonResponse(false, 'Brak uwierzytelnionego użytkownika', null, 401);
    }

    if (empty(array_intersect(getUserGroups($userId), ALLOWED_GROUPS))) {
        sendJsonResponse(false, 'Brak uprawnień do wykonania tej operacji', null, 403);
    }

    return $userId;
}

function getUserFullName(string $userId): string
{
    $cleanId = cleanUsername($userId);
    if ($cleanId === '' || $cleanId === 'SYSTEM') {
        return $cleanId !== '' ? $cleanId : $userId;
    }

    static $cache = [];
    if (isset($cache[$cleanId])) {
        return $cache[$cleanId];
    }

    try {
        $localDb = getLocalUserDbConnection();
        $safeUser = $localDb->real_escape_string($cleanId);
        $res = $localDb->query("SELECT name FROM tbl_users WHERE userId = '$safeUser' OR name = '$safeUser' LIMIT 1");
        if ($res && ($row = $res->fetch_assoc()) && !empty($row['name'])) {
            $name = trim((string)$row['name']);
            $localDb->close();
            $cache[$cleanId] = $name;
            return $name;
        }
        $localDb->close();
    } catch (Throwable $e) {
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
        $passedName = trim((string)($input['userName'] ?? $input['userFullName'] ?? $input['operatorName'] ?? ''));
        if ($passedName !== '') {
            $cache[$cleanId] = $passedName;
            return $passedName;
        }
    }

    $cache[$cleanId] = $cleanId;
    return $cleanId;
}

$input = getRequestData();
$job = $input['job'] ?? $_GET['job'] ?? '';

if ($job === '') {
    sendJsonResponse(false, 'Brak parametru job', null, 400);
}

$blockedMachinesDir = '/fis/mantis/data/blocked_machines/';

try {
    switch ($job) {
        case 'GetUserInfo': {
            $userId = getCurrentUser($input);

            $userInfo = [
                'userId' => $userId,
                'name' => $userId,
                'email' => '',
                'groups' => [],
                'canEdit' => false,
            ];

            $userInfo['groups'] = getUserGroups($userId);

            $userInfo['canEdit'] = !empty(array_intersect($userInfo['groups'], ALLOWED_GROUPS));

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
            } catch (Throwable $error) {
                Lib::ShowError(FILENAME, print_r($error, true));
            }

            sendJsonResponse(true, 'Pobrano dane użytkownika', $userInfo);
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

                foreach ($rows as &$row) {
                    if (!empty($row['user'])) {
                        $row['user'] = getUserFullName($row['user']);
                    }
                }
                unset($row);

                sendJsonResponse(true, 'Lista masterów pobrana', $rows);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'CheckMaster': {
            $unit = trim($input['unit'] ?? $input['serialNumber'] ?? '');
            if ($unit === '') {
                sendJsonResponse(false, 'Brak parametru unit', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare("SELECT id, unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, isactive, FIS FROM masterUnits WHERE unit = ? LIMIT 1");
                $stmt->bind_param('s', $unit);
                $stmt->execute();
                $row = $stmt->get_result()->fetch_assoc();
                $stmt->close();

                if ($row && !empty($row['user'])) {
                    $row['user'] = getUserFullName($row['user']);
                }

                sendJsonResponse(true, 'Status mastera', [
                    'exists' => (bool)$row,
                    'unit' => $row ?: null
                ]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'ResetCounters': {
            $rawUnits = $input['units'] ?? $input['unit'] ?? $input['serialNumber'] ?? '';
            $user = requireWriteAccess();
            $operatorName = getUserFullName($user);
            $resetType = strtolower(trim($input['resetType'] ?? 'all'));

            if (empty($rawUnits)) {
                sendJsonResponse(false, 'Brak jednostek do zresetowania', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', (string)$rawUnits)));
            if (empty($unitList)) {
                sendJsonResponse(false, 'Brak poprawnych jednostek', null, 400);
            }

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

                    $mysqli->commit();
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
            $operatorName = getUserFullName($user);

            if (empty($rawUnits)) {
                sendJsonResponse(false, 'Brak jednostek do zablokowania', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', (string)$rawUnits)));
            $mysqli = getDbConnection();
            try {
                $mysqli->begin_transaction();
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

                    $mysqli->commit();
                    sendJsonResponse(true, "Zablokowano mastera (isActive=2)!");
                } catch (Throwable $err) {
                    $mysqli->rollback();
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
            $operatorName = getUserFullName($user);

            if (empty($rawUnits)) {
                sendJsonResponse(false, 'Brak jednostek do aktywacji', null, 400);
            }

            $unitList = is_array($rawUnits) ? $rawUnits : array_filter(array_map('trim', explode(',', (string)$rawUnits)));
            $mysqli = getDbConnection();
            try {
                $mysqli->begin_transaction();
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

                    $mysqli->commit();
                    sendJsonResponse(true, "Jednostki zostały aktywowane (isActive=1)!");
                } catch (Throwable $err) {
                    $mysqli->rollback();
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
                sendJsonResponse(false, 'Brak parametru unit', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmtMaster = $mysqli->prepare("SELECT FIS FROM masterUnits WHERE unit = ? LIMIT 1");
                $stmtMaster->bind_param('s', $unit);
                $stmtMaster->execute();
                $masterRow = $stmtMaster->get_result()->fetch_assoc();
                $stmtMaster->close();

                if (!$masterRow) {
                    sendJsonResponse(false, "Master '$unit' nie istnieje w bazie danych", null, 404);
                }

                $storedFis = normalizeFisValue($masterRow['FIS'] ?? 'FIS1');
                $requestedFisRaw = strtoupper(trim($input['fis'] ?? ''));
                if ($requestedFisRaw !== '' && !in_array($requestedFisRaw, ['FIS1', 'FIS2'], true)) {
                    sendJsonResponse(false, 'Nieprawidłowy serwer FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
                }

                $requestedFis = $requestedFisRaw !== '' ? $requestedFisRaw : $storedFis;
                if ($requestedFis !== $storedFis) {
                    sendJsonResponse(
                        false,
                        "Master '$unit' należy do $storedFis, a żądanie usunięcia wysłano dla $requestedFis.",
                        ['expected_fis' => $storedFis],
                        409
                    );
                }

                $serverFis = getServerFis();
                if ($serverFis !== null && $serverFis !== $storedFis) {
                    sendJsonResponse(
                        false,
                        "Żądanie trafiło do $serverFis, ale master '$unit' należy do $storedFis.",
                        ['expected_fis' => $storedFis],
                        409
                    );
                }

                $fisDeleted = false;
                $fisAlreadyMissing = false;
                $mysqli->begin_transaction();
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
                    } catch (Throwable $fisError) {
                        if (!isMissingFisUnitError($fisError)) {
                            throw new ApiOperationException(
                                formatOperationError('DeleteMaster', 'Unit::Delete', $unit, $storedFis, $fisError),
                                502,
                                ['fis' => $storedFis, 'fis_deleted' => false],
                                $fisError,
                            );
                        }
                        $fisAlreadyMissing = true;
                    }

                    $stmtDel = $mysqli->prepare("DELETE FROM masterUnits WHERE unit = ?");
                    $stmtDel->bind_param('s', $unit);
                    $stmtDel->execute();
                    $affected = $stmtDel->affected_rows;
                    $stmtDel->close();

                    $mysqli->commit();
                    $message = $fisDeleted
                        ? "Master '$unit' został usunięty z $storedFis i z bazy danych"
                        : "Master '$unit' nie istniał już w $storedFis i został usunięty z bazy danych";
                    sendJsonResponse(true, $message, [
                        'affected_rows' => $affected,
                        'fis' => $storedFis,
                        'fis_deleted' => $fisDeleted,
                    ]);
                } catch (Throwable $err) {
                    $mysqli->rollback();
                    if (($fisDeleted || $fisAlreadyMissing) && !($err instanceof ApiOperationException)) {
                        throw new ApiOperationException(
                            formatOperationError(
                                'DeleteMaster',
                                'database_delete',
                                $unit,
                                $storedFis,
                                $err,
                                'unit_absent_in_fis=true, database_deleted=false; retry_required=true',
                            ),
                            500,
                            [
                                'fis' => $storedFis,
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

        case 'CreateMaster': {
            $user = requireWriteAccess();
            $unit = strtoupper(trim($input['unit'] ?? $input['serialNumber'] ?? ''));
            $processList = trim($input['process'] ?? $input['processName'] ?? '');
            $status = strtoupper(trim($input['status'] ?? 'GOOD'));
            $maxCounter = (int)($input['maxCounter'] ?? 1000);
            $errorMaxCounter = (int)($input['maxErrors'] ?? $input['errorMaxCounter'] ?? 50);
            $forceUpdate = !empty($input['forceUpdate']);

            if ($unit === '' || $processList === '') {
                sendJsonResponse(false, 'Numer seryjny (SN) oraz proces są wymagane!', null, 400);
            }

            $fisValue = strtoupper(trim($input['fis'] ?? 'FIS1'));
            if (!in_array($fisValue, ['FIS1', 'FIS2'], true)) {
                sendJsonResponse(false, 'Nieprawidłowy serwer docelowy FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
            }

            $serverFis = getServerFis();
            if ($serverFis !== null && $serverFis !== $fisValue) {
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
                    } catch (Throwable $deleteError) {
                        throw new ApiOperationException(
                            formatOperationError('CreateMaster', 'Unit::Delete', $unit, $fisValue, $deleteError),
                            502,
                            ['fis' => $fisValue, 'stage' => 'delete_existing'],
                            $deleteError,
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
                } catch (Throwable $dataEntryError) {
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

                    $mysqli->commit();
                    $actionMsg = $existing ? "Master '$unit' został pomyślnie zaktualizowany!" : "Master '$unit' został pomyślnie utworzony i zarejestrowany!";
                    sendJsonResponse(true, $actionMsg, ['unit' => $unit, 'operation' => $operation, 'FIS' => $fisValue]);
                } catch (Throwable $err) {
                    $mysqli->rollback();
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
                    "SELECT id, unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, operation, `date`
                     FROM history
                     WHERE unit = ?
                     ORDER BY `date` DESC, id DESC"
                );
                $stmt->bind_param('s', $unit);
                $stmt->execute();
                $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmt->close();

                foreach ($rows as &$row) {
                    if (!empty($row['user'])) {
                        $row['user'] = getUserFullName($row['user']);
                    }
                }
                unset($row);

                sendJsonResponse(true, "Historia dla jednostki '$unit'", $rows);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'GetHistory': {
            $mysqli = getDbConnection();
            try {
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

                $sql = "SELECT id, unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, operation, `date` FROM history";
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

                foreach ($rows as &$row) {
                    if (!empty($row['user'])) {
                        $row['user'] = getUserFullName($row['user']);
                    }
                }
                unset($row);

                sendJsonResponse(true, 'Historia operacji załadowana', $rows);
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
            if (is_dir($blockedMachinesDir) && ($files = scandir($blockedMachinesDir)) !== false) {
                foreach ($files as $file) {
                    if ($file === '.' || $file === '..' || str_contains($file, '10.237.')) {
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
            requireWriteAccess();
            $record = trim($input['record'] ?? $input['filename'] ?? '');
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
            requireWriteAccess();
            $process = trim($input['process'] ?? '');
            $mail = trim($input['mail'] ?? '');

            if ($process === '') {
                sendJsonResponse(false, 'Brak parametru process', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare("UPDATE engineers SET mail = ? WHERE process = ?");
                $stmt->bind_param('ss', $mail, $process);
                $stmt->execute();
                $affected = $stmt->affected_rows;
                $stmt->close();

                sendJsonResponse(true, "Zaktualizowano grupę mailową dla procesu '$process'", ['affected' => $affected]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'AddEngineer': {
            requireWriteAccess();
            $process = trim($input['process'] ?? '');
            $mail = trim($input['mail'] ?? '');

            if ($process === '') {
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

                sendJsonResponse(true, "Proces '$process' został pomyślnie skonfigurowany!", ['id' => $insertId]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'DeleteEngineer': {
            requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : null;
            $process = trim($input['process'] ?? '');

            if (!$id && $process === '') {
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
            requireWriteAccess();
            $name = trim($input['name'] ?? '');
            $mail = trim($input['mail'] ?? '');

            if ($mail === '') {
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

                sendJsonResponse(true, "Dodano grupę mailową '$name' ($mail)", ['id' => $id]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'UpdateMail': {
            requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : 0;
            $name = trim($input['name'] ?? '');
            $mail = trim($input['mail'] ?? '');

            if ($id <= 0 || $mail === '') {
                sendJsonResponse(false, 'Nieprawidłowe ID lub brak adresu mailowego', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare("UPDATE mails SET name = ?, mail = ? WHERE id = ?");
                $stmt->bind_param('ssi', $name, $mail, $id);
                $stmt->execute();
                $affected = $stmt->affected_rows;
                $stmt->close();

                sendJsonResponse(true, "Zaktualizowano grupę mailową", ['affected' => $affected]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'DeleteMail': {
            requireWriteAccess();
            $id = isset($input['id']) ? (int)$input['id'] : 0;
            if ($id <= 0) {
                sendJsonResponse(false, 'Nieprawidłowe ID maila', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare("DELETE FROM mails WHERE id = ?");
                $stmt->bind_param('i', $id);
                $stmt->execute();
                $affected = $stmt->affected_rows;
                $stmt->close();

                sendJsonResponse(true, "Usunięto grupę mailową", ['affected' => $affected]);
            } finally {
                $mysqli->close();
            }
            break;
        }

        default:
            sendJsonResponse(false, "Nieznany job: '$job'", null, 404);
    }
} catch (Throwable $e) {
    Lib::ShowError(FILENAME, print_r($e, true));
    if ($e instanceof ApiOperationException) {
        sendJsonResponse(false, $e->publicMessage, $e->responseData, $e->statusCode);
    }
    sendJsonResponse(false, 'Wewnętrzny błąd serwera', null, 500);
}
