<?php
declare(strict_types=1);

/**
 * Master Samples Dashboard Backend API
 * Production path: /custom/matz/php/MasterDashboard.php
 */

use BuildingBlocks\Archive;
use BuildingBlocks\Lib;
use BuildingBlocks\Unit;

require_once __DIR__ . '/../phpBB/BuildingBlocks.php';

date_default_timezone_set('Europe/Warsaw');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-User');

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

function sendJsonResponse(bool $status, string $message, mixed $data = null, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode([
        'status' => $status,
        'message' => $message,
        'data' => $data,
    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    exit;
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
    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (is_array($decoded)) {
            return array_merge($_GET, $decoded);
        }
    }
    return array_merge($_GET, $_POST);
}

function cleanUsername(string $user): string
{
    $user = trim($user);
    if (str_contains($user, '\\')) {
        $user = substr($user, (int)strrpos($user, '\\') + 1);
    }
    return trim($user, " \t\n\r\0\x0B\"'");
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

/**
 * @throws JsonException
 */
function getAuthenticatedUser(): string
{
    $remoteUser = cleanUsername((string)(getenv('REMOTE_USER') ?: ($_SERVER['REMOTE_USER'] ?? $_SERVER['AUTH_USER'] ?? '')));
    if ($remoteUser !== '') {
        return $remoteUser;
    }

    if (!empty($_SERVER['HTTP_X_USER'])) {
        return cleanUsername($_SERVER['HTTP_X_USER']);
    }

    $input = getRequestData();
    $inputUser = $input['user'] ?? $input['userId'] ?? '';
    if ($inputUser !== '') {
        return cleanUsername((string)$inputUser);
    }

    return '';
}

function getUserGroups(string $userId): array
{
    try {
        $groups = Lib::GetUserGroup($userId);
        return is_array($groups) ? array_values(array_map('strval', $groups)) : [];
    } catch (Throwable $error) {
        error_log("MasterDashboard authorization lookup failed: {$error->getMessage()}");
        return [];
    }
}

/**
 * @throws JsonException
 */
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
    $userId = cleanUsername($userId);
    if ($userId === '' || $userId === 'SYSTEM') {
        return $userId;
    }

    static $cache = [];
    if (isset($cache[$userId])) {
        return $cache[$userId];
    }

    try {
        $localDb = getLocalUserDbConnection();
        $safeUser = $localDb->real_escape_string($userId);
        $res = $localDb->query("SELECT name FROM tbl_users WHERE userId = '$safeUser' LIMIT 1");
        if ($res && ($row = $res->fetch_assoc())) {
            if (!empty($row['name'])) {
                $name = trim((string)$row['name']);
                $localDb->close();
                $cache[$userId] = $name;
                return $name;
            }
        }
        $localDb->close();
    } catch (Throwable $e) {
        error_log("getUserFullName error: " . $e->getMessage());
    }

    $cache[$userId] = $userId;
    return $userId;
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
                error_log("MasterDashboard local user lookup failed: {$error->getMessage()}");
            }

            sendJsonResponse(true, 'Pobrano dane użytkownika', $userInfo);
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
            $resetType = strtolower(trim((string)($input['resetType'] ?? 'all')));

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
                    $operationName = $resetType === 'cycles' ? 'ResetCycles' : ($resetType === 'errors' ? 'ResetErrors' : 'Reset');

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
                    $msg = $resetType === 'cycles' ? "Wyzerowano liczniki cykli ($resetCount sztuk)" :
                           ($resetType === 'errors' ? "Wyzerowano liczniki błędów ($resetCount sztuk)" : "Wyzerowano wszystkie liczniki ($resetCount sztuk)");

                    sendJsonResponse(true, $msg, ['count' => $resetCount, 'resetType' => $resetType]);
                } catch (Throwable $err) {
                    $mysqli->rollback();
                    throw $err;
                }
            } finally {
                $mysqli->close();
            }
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
        }

        case 'DeleteMaster': {
            $unit = trim($input['unit'] ?? $input['serialNumber'] ?? '');
            $user = requireWriteAccess();

            if ($unit === '') {
                sendJsonResponse(false, 'Brak parametru unit', null, 400);
            }

            $mysqli = getDbConnection();
            try {
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

                    $stmtDel = $mysqli->prepare("DELETE FROM masterUnits WHERE unit = ?");
                    $stmtDel->bind_param('s', $unit);
                    $stmtDel->execute();
                    $affected = $stmtDel->affected_rows;
                    $stmtDel->close();

                    $mysqli->commit();
                    sendJsonResponse(true, "Master '$unit' został usunięty z bazy danych", ['affected_rows' => $affected]);
                } catch (Throwable $err) {
                    $mysqli->rollback();
                    throw $err;
                }
            } finally {
                $mysqli->close();
            }
            break;
        }

        case 'CreateMaster': {
            $user = requireWriteAccess();
            $unit = strtoupper(trim((string)($input['unit'] ?? $input['serialNumber'] ?? '')));
            $processList = trim((string)($input['process'] ?? $input['processName'] ?? ''));
            $status = strtoupper(trim((string)($input['status'] ?? 'GOOD')));
            $maxCounter = (int)($input['maxCounter'] ?? 1000);
            $errorMaxCounter = (int)($input['maxErrors'] ?? $input['errorMaxCounter'] ?? 50);
            $forceUpdate = !empty($input['forceUpdate']);

            if ($unit === '' || $processList === '') {
                sendJsonResponse(false, 'Numer seryjny (SN) oraz proces są wymagane!', null, 400);
            }

            $fisRaw = strtoupper(trim((string)($input['fis'] ?? 'FIS1')));
            $fisValue = in_array($fisRaw, ['FIS1', 'FIS2'], true) ? $fisRaw : 'FIS1';

            $processArray = array_filter(array_map('trim', explode(',', $processList)));
            $processClean = implode(',', $processArray);

            $mysqli = getDbConnection();
            try {
                $stmtCheck = $mysqli->prepare("SELECT unit, process, status, maxCounter, errorMaxCounter, isactive FROM masterUnits WHERE unit = ? LIMIT 1");
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
                        ]
                    ]);
                }

                try {
                    try {
                        Unit::Find($unit);
                    } catch (Throwable $findError) {
                        Archive::GetAll($unit);
                        Archive::Unarchive($unit);
                        Unit::Find($unit);
                    }
                    Unit::Delete($unit);

                    $creatorName = getUserFullName($user);
                    $dcmods = "MS_HISTORY|{$unit}_MASTER|MS_PROCESS|{$processClean}|MS_STATUS|{$status}|OPERATOR|{$creatorName}";
                    Unit::DataEntry(
                        $unit,
                        "CREATEUNIT",
                        "WEB",
                        $dcmods,
                        "ata",
                        "",
                        "",
                        "",
                        "GOLD",
                        "",
                        "",
                        "GOLDEN"
                    );
                } catch (Throwable $error) {
                    throw new RuntimeException('Nie udało się zarejestrować mastera w FIS: ' . $error->getMessage(), 0, $error);
                }

                $creatorName = getUserFullName($user);

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
                    sendJsonResponse(true, $actionMsg, ['unit' => $unit, 'operation' => $operation]);
                } catch (Throwable $err) {
                    $mysqli->rollback();
                    throw $err;
                }
            } finally {
                $mysqli->close();
            }
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
            if (is_dir($blockedMachinesDir)) {
                $files = scandir($blockedMachinesDir);
                if ($files !== false) {
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
            }
            sendJsonResponse(true, 'Pobrano zablokowane maszyny', $items);
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
            } else {
                sendJsonResponse(false, "Błąd podczas usuwania pliku blokady '$record'", null, 500);
            }
        }

        /* =========================================================================
         * 4. ENGINEERS & MAILING GROUPS
         * ========================================================================= */
        case 'GetEngineers': {
            $mysqli = getDbConnection();
            try {
                $res = $mysqli->query("SELECT id, process, mail FROM engineers ORDER BY process ASC");
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
                $res = $mysqli->query("SELECT id, name, mail FROM mails ORDER BY name ASC");
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
    error_log(sprintf(
        'MasterDashboard error: %s in %s:%d',
        $e->getMessage(),
        $e->getFile(),
        $e->getLine()
    ));
    sendJsonResponse(false, 'Wewnętrzny błąd serwera', null, 500);
}
