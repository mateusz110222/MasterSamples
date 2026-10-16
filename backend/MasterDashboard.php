<?php
/** @noinspection SqlNoDataSourceInspection */
/** @noinspection SqlResolve */
/** @noinspection DuplicatedCode */
/** @noinspection PhpUnhandledExceptionInspection */
/** @noinspection PhpDocMissingThrowsInspection */
/** @noinspection AutoloadingIssuesInspection */
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
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-User, X-User-Name, X-User-Groups, Accept, Origin');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../phpBB/BuildingBlocks.php';

define('FILENAME', basename(__FILE__, '.php'));

const DB_NAME = 'masterSample';
const DB_HOST_LOCAL = 'localhost';
const DB_USER_LOCAL = 'fiswww';
const DB_PASSWORD_LOCAL = '';
const DB_NAME_LOCAL = 'users';

const BLOCKED_MACHINES_DIR = '/fis/mantis/data/blocked_machines/';
const PALETKI_AUTH_URL = 'http://10.142.11.66:8082/auth/login';

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
            'status'  => $status,
            'message' => $message,
            'data'    => $data,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    } catch (JsonException $e) {
        Lib::ShowError(FILENAME, 'JSON encoding failed: ' . $e->getMessage());
        echo '{"status":false,"message":"JSON encoding error","data":null}';
    }
    exit;
}

$config = @parse_ini_file('/fis/mantis/custom/database/config.ini', true);
if (!$config || !isset($config['database']['host'], $config['database']['user'], $config['database']['password'])) {
    sendJsonResponse(false, 'Invalid DB config.ini', [], 500);
}

define('DB_HOST', $config['database']['host']);
define('DB_USER', $config['database']['user']);
define('DB_PASSWORD', $config['database']['password']);

final class ApiOperationException extends RuntimeException
{
    public function __construct(
        public string $publicMessage,
        public int $statusCode = 500,
        public mixed $responseData = null,
        ?Throwable $previous = null
    ) {
        parent::__construct($publicMessage, 0, $previous);
    }
}

/* =========================================================================
 * DATABASE & REQUEST HELPERS
 * ========================================================================= */

function getDbConnection(): mysqli
{
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

function parseUnitList(?string $units): array
{
    if ($units === null) {
        return [];
    }
    return array_values(array_filter(array_map('trim', explode(',', $units)), static fn($u) => $u !== ''));
}

function logMasterHistory(mysqli $db, string $unit, string $operator, string $operation): int
{
    $stmt = $db->prepare(
        "INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`)
         SELECT unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, ?, ?, NOW()
         FROM masterUnits WHERE unit = ?"
    );
    $stmt->bind_param('sss', $operator, $operation, $unit);
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    return $affected;
}

/* =========================================================================
 * AUTHENTICATION & AUTHORIZATION
 * ========================================================================= */

function callPaletkiAuthLogin(string $login, string $password): array
{
    $payload = json_encode([
        'login'    => $login,
        'password' => $password,
    ], JSON_UNESCAPED_UNICODE);

    $ch = curl_init(PALETKI_AUTH_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_CONNECTTIMEOUT => 4,
    ]);

    $response = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError !== '') {
        Lib::ShowError(FILENAME, '[Login] cURL error connecting to Paletki auth: ' . $curlError);
        return [
            'success' => false,
            'code'    => 503,
            'message' => 'Brak połączenia z serwisem autoryzacji domenowej (Paletki)',
        ];
    }

    $data = json_decode((string)$response, true);
    if (!is_array($data)) {
        Lib::ShowError(FILENAME, "[Login] Invalid JSON response from Paletki auth ($httpCode): " . substr((string)$response, 0, 200));
        return [
            'success' => false,
            'code'    => 502,
            'message' => 'Nieprawidłowa odpowiedź z serwera autoryzacji',
        ];
    }

    if ($httpCode !== 200 || empty($data['status'])) {
        return [
            'success' => false,
            'code'    => ($httpCode >= 400 && $httpCode < 500) ? 401 : 502,
            'message' => $data['message'] ?? 'Nieprawidłowy login lub hasło domenowe',
        ];
    }

    return [
        'success'    => true,
        'code'       => 200,
        'data'       => is_array($data['data'] ?? null) ? $data['data'] : [],
        'token'      => (string)($data['token'] ?? ''),
        'expires_at' => (string)($data['expires_at'] ?? ''),
    ];
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
    $inputUser = Lib::GetArrayString($input, 'user');
    return $inputUser !== null ? cleanUsername($inputUser) : '';
}

function getUserGroups(string $userId): array
{
    $userId = cleanUsername($userId);
    if ($userId === '') {
        return [];
    }

    try {
        $dbGroups = Lib::GetUserGroup($userId);
        if (is_array($dbGroups)) {
            return array_values(array_unique(array_map('strval', $dbGroups)));
        }
    } catch (Throwable $error) {
        Lib::ShowError(FILENAME, "Lib::GetUserGroup failed for '$userId': " . $error->getMessage());
    }

    return [];
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
        Lib::ShowError(FILENAME, 'requireWriteAccess denied: No authenticated user');
        sendJsonResponse(false, 'Brak uwierzytelnionego użytkownika', null, 401);
    }

    $userGroups = getUserGroups($userId);
    if (empty(array_intersect($userGroups, ALLOWED_GROUPS))) {
        Lib::ShowError(FILENAME, "requireWriteAccess denied for user '$userId'. Groups: [" . implode(', ', $userGroups) . ']');
        sendJsonResponse(false, 'Brak uprawnień do wykonania tej operacji', null, 403);
    }

    Lib::ShowDebug(FILENAME, "requireWriteAccess authorized for user '$userId'");
    return $userId;
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
    $passedName = Lib::GetArrayString($input, 'userName');
    if ($passedName !== null) {
        return $passedName;
    }

    $user = getAuthenticatedUser();
    return $user !== '' ? $user : 'SYSTEM';
}

/* =========================================================================
 * FIS & SERVER HELPERS
 * ========================================================================= */

function normalizeFisValue(mixed $fis): string
{
    return str_contains(strtoupper(trim((string)$fis)), '2') ? 'FIS2' : 'FIS1';
}

function getServerFis(): ?string
{
    $host = strtolower($_SERVER['HTTP_HOST'] ?? '');
    if (str_contains($host, 'plblofis2')) {
        return 'FIS2';
    }
    if (str_contains($host, 'plblofis1')) {
        return 'FIS1';
    }
    return null;
}

function requireValidFis(?string $fis, string $mismatchMsg = 'Żądanie trafiło do niewłaściwego FIS'): string
{
    if (!in_array($fis, ['FIS1', 'FIS2'], true)) {
        sendJsonResponse(false, 'Nieprawidłowy serwer FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
    }

    $serverFis = getServerFis();
    if ($serverFis !== null && $serverFis !== $fis) {
        sendJsonResponse(false, $mismatchMsg, ['expected_fis' => $fis], 409);
    }

    return $fis;
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

/* =========================================================================
 * MASTER CREATION STRUCTURE
 * ========================================================================= */

function masterFisReply(array $response, string $operation): mixed
{
    if (empty($response['status'])) {
        throw new RuntimeException($operation . ': ' . ($response['message'] ?? 'Invalid FIS response'));
    }
    return $response['reply'] ?? null;
}

function masterExistsInWip(string $unit): bool
{
    try {
        Unit::Find($unit);
        return true;
    } catch (Exception $error) {
        if (!isMissingFisUnitError($error)) {
            throw $error;
        }
        return false;
    }
}

function masterReadUnit(string $unit, bool $withStructure = true): array
{
    if (!masterExistsInWip($unit)) {
        if (!$withStructure) {
            return ['exists' => false, 'archived' => false, 'gold' => false, 'parent' => '', 'children' => []];
        }
        try {
            $archiveResult = Archive::GetAll($unit, '', 1);
            $data = masterFisReply($archiveResult, 'Archive::GetAll');
        } catch (Exception $archiveError) {
            if (!isMissingFisUnitError($archiveError)) {
                throw $archiveError;
            }
            return ['exists' => false, 'archived' => false, 'gold' => false, 'parent' => '', 'children' => []];
        }
        $archived = true;
        $parent = $withStructure ? ($data['parent'] ?? '') : '';
        $children = $withStructure ? ($data['children'] ?? []) : [];
    } else {
        $data = masterFisReply(Unit::GetStatus($unit), 'Unit::GetStatus');
        $parent = '';
        $children = [];
        if ($withStructure) {
            $parentResult = Unit::GetParent($unit);
            if (empty($parentResult['status']) && ($parentResult['message'] ?? '') !== 'Parent not found') {
                throw new RuntimeException('Unit::GetParent failed for ' . $unit);
            }
            if (!empty($parentResult['status']) && (!isset($parentResult['reply']) || !is_string($parentResult['reply']))) {
                throw new RuntimeException('Invalid parent of ' . $unit);
            }
            $parent = !empty($parentResult['status']) ? $parentResult['reply'] : '';
            $children = masterFisReply(Unit::GetChildren($unit), 'Unit::GetChildren');
        }
        $archived = false;
    }

    if (!is_array($data) || !isset($data['uk3']) || !is_string($data['uk3']) || !is_array($children) || !is_string($parent)) {
        throw new RuntimeException('Invalid unit structure for ' . $unit);
    }

    foreach ($children as $child) {
        if (!is_string($child)) {
            throw new RuntimeException('Invalid child identifier of ' . $unit);
        }
    }

    $children = array_values(array_unique(array_map('trim', $children)));
    sort($children, SORT_STRING);

    foreach ($children as $child) {
        if ($child === '' || $child === $unit) {
            throw new RuntimeException('Invalid child of ' . $unit);
        }
    }

    return [
        'exists'   => true,
        'archived' => $archived,
        'gold'     => stripos($data['uk3'], 'GOLD') !== false,
        'parent'   => trim($parent),
        'children' => $children,
    ];
}

function inspectMasterStructure(string $requestedUnit, string $process): array
{
    $unit = $requestedUnit;
    $withStructure = preg_match('/SMT|XRAY|ICT/i', $process) === 1;
    $record = masterReadUnit($unit, $withStructure);

    if ($withStructure && $record['parent'] !== '') {
        $unit = $record['parent'];
        $record = masterReadUnit($unit);
        if (!$record['exists'] || !in_array($requestedUnit, $record['children'], true)) {
            throw new RuntimeException('Parent/child structure is inconsistent');
        }
    }

    if ($record['parent'] !== '' && count($record['children']) > 0) {
        throw new RuntimeException('Nested panel structure: ' . $unit);
    }

    $members = [$unit => $record];
    foreach ($record['children'] as $child) {
        $members[$child] = masterReadUnit($child);
        if (!$members[$child]['exists']) {
            throw new RuntimeException("Panel '$unit' lists child '$child', but the child was not found in FIS or archives");
        }
        if ($members[$child]['parent'] !== '' && $members[$child]['parent'] !== $unit) {
            throw new RuntimeException("Child '$child' of panel '$unit' reports a different parent: '" . $members[$child]['parent'] . "'");
        }
        if (count($members[$child]['children']) > 0) {
            throw new RuntimeException("Child '$child' of panel '$unit' has its own children: " . implode(', ', $members[$child]['children']));
        }
    }

    return [
        'requestedUnit' => $requestedUnit,
        'unit'          => $unit,
        'children'      => $record['children'],
        'exists'        => $record['exists'],
        'members'       => $members,
    ];
}

function masterStructureRecord(mysqli $db, string $unit): ?array
{
    $stmt = $db->prepare('SELECT unit, FIS FROM masterUnits WHERE unit = ? LIMIT 1');
    $stmt->bind_param('s', $unit);
    $stmt->execute();
    $record = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $record ?: null;
}

function masterCheckChildRecords(array $structure, mysqli $db): void
{
    if (empty($structure['children'])) {
        return;
    }
    $stmt = $db->prepare('SELECT unit FROM masterUnits WHERE unit = ? LIMIT 1');
    try {
        foreach ($structure['children'] as $child) {
            $stmt->bind_param('s', $child);
            $stmt->execute();
            if ($stmt->get_result()->fetch_assoc()) {
                throw new RuntimeException('Child already has a separate master record: ' . $child);
            }
        }
    } finally {
        $stmt->close();
    }
}

function masterStructureFailure(string $stage, string $unit, string $fis, Throwable $error, array $completed): ApiOperationException
{
    return new ApiOperationException(
        formatOperationError(
            'CreateMaster',
            $stage,
            $unit,
            $fis,
            $error,
            empty($completed) ? 'fis_updated=false; database_updated=false' : 'FIS operations are not rolled back; database_updated=false'
        ),
        502,
        [
            'fis'              => $fis,
            'stage'            => $stage,
            'failedUnit'       => $unit,
            'completed'        => $completed,
            'database_updated' => false,
        ],
        $error
    );
}

function masterStructureEqual(mixed $left, mixed $right): bool
{
    return is_array($left) && is_array($right)
        && isset($left['unit'], $left['children'], $left['members'])
        && $left['unit'] === $right['unit']
        && $left['children'] === $right['children']
        && $left['members'] == $right['members'];
}

function masterImportStructure(array $target, mixed $source, string $process): array
{
    if (!is_array($source) || !isset($source['unit'], $source['children'])
        || !is_string($source['unit']) || !is_array($source['children']) || $source['unit'] === '') {
        throw new RuntimeException('Invalid source structure');
    }
    if ($target['unit'] !== $source['unit']) {
        throw new RuntimeException('Source and target panel numbers differ');
    }
    if ($target['exists'] && $target['children'] !== $source['children']) {
        throw new RuntimeException('Source and target children differ');
    }
    if (!preg_match('/SMT|XRAY|ICT/i', $process) && count($source['children']) > 0) {
        throw new RuntimeException('Panel creation is limited to SMT, XRAY and ICT processes');
    }
    foreach ($source['children'] as $child) {
        if (!is_string($child) || trim($child) === '' || $child === $source['unit']) {
            throw new RuntimeException('Invalid source child');
        }
        if (!isset($target['members'][$child])) {
            $target['members'][$child] = masterReadUnit($child);
        }
        $record = $target['members'][$child];
        if (($record['parent'] !== '' && $record['parent'] !== $target['unit']) || count($record['children']) > 0) {
            throw new RuntimeException('Target child belongs to another structure: ' . $child);
        }
    }
    $target['children'] = array_values(array_unique($source['children']));
    sort($target['children'], SORT_STRING);
    return $target;
}

function applyMasterStructure(
    array $structure,
    string $process,
    string $status,
    ?string $pn,
    string $operator,
    string $fis,
    bool $deleteOnly = false
): array {
    $completed = ['unarchived' => [], 'deleted' => [], 'created' => [], 'linked' => []];
    $stage = 'structure_check';
    $part = $structure['unit'];

    try {
        foreach ($structure['members'] as $sn => $expected) {
            $part = $sn;
            if (masterReadUnit($sn, preg_match('/SMT|XRAY|ICT/i', $process) === 1) != $expected) {
                throw new RuntimeException('Structure changed; refresh and confirm again: ' . $sn);
            }
        }

        $parts = array_merge($structure['children'], [$structure['unit']]);

        foreach ($parts as $part) {
            $record = $structure['members'][$part];
            $existsInWip = $record['exists'] && !$record['archived'];

            if (!$existsInWip) {
                $stage = 'find';
                if (masterExistsInWip($part)) {
                    $current = masterReadUnit($part, preg_match('/SMT|XRAY|ICT/i', $process) === 1);
                    $expected = $record;
                    $expected['archived'] = false;
                    if ($current != $expected) {
                        throw new RuntimeException('Unit changed before recreation: ' . $part);
                    }
                    $existsInWip = true;
                }
            }
            if ($existsInWip) {
                $stage = 'delete_existing';
                Unit::Delete($part);
                $completed['deleted'][] = $part;
            }
        }

        if (!$deleteOnly) {
            $createOrder = array_merge([$structure['unit']], $structure['children']);
            foreach ($createOrder as $part) {
                $stage = 'create_unit';
                $dcmods = 'MS_HISTORY|' . $part . '_MASTER|MS_PROCESS|' . $process . '|MS_STATUS|' . $status . '|OPERATOR|' . $operator;
                Unit::DataEntry($part, 'CREATEUNIT', 'WEB', $dcmods, 'GOLD', '', (string)$pn, 'GOLDEN');
                $completed['created'][] = $part;
            }

            foreach ($structure['children'] as $part) {
                $stage = 'link';
                masterFisReply(Unit::Link($structure['unit'], $part), 'Unit::Link');
                $completed['linked'][] = $part;
            }
        }
    } catch (Exception $error) {
        throw masterStructureFailure($stage, $part, $fis, $error, $completed);
    }

    return $completed;
}

/* =========================================================================
 * STATION UNLOCK HELPER
 * ========================================================================= */

function unlockMachineWithAudit(string $targetPath, string $record, string $fis): void
{
    $separator = strrpos($record, '_');
    $machine = $separator !== false ? substr($record, 0, $separator) : $record;
    $lockType = $separator !== false ? substr($record, $separator + 1) : 'MASTER';

    if ($machine === '' || mb_strlen($machine) > 100 || $lockType === '' || mb_strlen($lockType) > 100) {
        throw new ApiOperationException('Nazwa maszyny lub typ blokady nie mieści się w rejestrze audytu', 400);
    }

    $operator = getOperatorName();
    $db = getDbConnection();
    $removed = false;

    try {
        $db->begin_transaction();
        $stmt = $db->prepare(
            "INSERT INTO history
             (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`)
             VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, 'UnlockStation', NOW())"
        );
        $stmt->bind_param('ssss', $machine, $lockType, $fis, $operator);
        $stmt->execute();
        if ($stmt->affected_rows !== 1) {
            throw new RuntimeException('Station unlock audit insert failed');
        }
        $stmt->close();

        if (is_link($targetPath) || !is_file($targetPath) || !@unlink($targetPath)) {
            throw new ApiOperationException("Nie udało się usunąć blokady '$record'", 500);
        }
        $removed = true;
        $db->commit();
    } catch (Throwable $err) {
        try {
            $db->rollback();
        } catch (Throwable $rollbackError) {
            Lib::ShowError(FILENAME, '[UnlockStation] Rollback failed: ' . $rollbackError->getMessage());
        }
        if ($removed) {
            Lib::ShowError(FILENAME, "[UnlockStation] Block removed but audit commit not confirmed: fis='$fis', record='$record', operator='$operator': " . $err->getMessage());
            throw new ApiOperationException(
                'Blokada została zdjęta, ale nie potwierdzono zapisu audytu. Sprawdź historię i logi.',
                500,
                ['unlocked' => true, 'audit_confirmed' => false],
                $err
            );
        }
        throw $err;
    } finally {
        $db->close();
    }

    Lib::ShowDebug(FILENAME, "[UnlockStation] Audited unlock: fis='$fis', record='$record', operator='$operator'");
}

/* =========================================================================
 * MAIN ROUTER
 * ========================================================================= */

$job = '';

try {
    $input = getRequestData();
    $job = Lib::GetArrayString($input, 'job');

    if ($job === null) {
        Lib::ShowError(FILENAME, "Incoming request without 'job' parameter from IP " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
        sendJsonResponse(false, 'Brak parametru job', null, 400);
    }

    Lib::ShowDebug(FILENAME, "[Request] job='$job', method=" . ($_SERVER['REQUEST_METHOD'] ?? '') . ", user='" . getAuthenticatedUser() . "', IP=" . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));

    switch ($job) {
        /* =====================================================================
         * 1. AUTH & MASTERS MANAGEMENT
         * ===================================================================== */
        case 'Login': {
            $login = Lib::GetArrayString($input, 'login');
            $password = (string)($input['password'] ?? '');

            if ($login === null || $password === '') {
                Lib::ShowError(FILENAME, '[Login] Missing login or password');
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

            $userGroups = getUserGroups($cleanUser);
            $canEdit = !empty(array_intersect($userGroups, ALLOWED_GROUPS));
            $email = '';

            try {
                $localDb = getLocalUserDbConnection();
                try {
                    $stmtUser = $localDb->prepare('SELECT name, email FROM tbl_users WHERE userId = ? LIMIT 1');
                    $stmtUser->bind_param('s', $cleanUser);
                    $stmtUser->execute();
                    if ($row = $stmtUser->get_result()->fetch_assoc()) {
                        if ($fullName === '' && !empty($row['name'])) {
                            $fullName = (string)$row['name'];
                        }
                        if (!empty($row['email'])) {
                            $email = (string)$row['email'];
                        }
                    }
                    $stmtUser->close();
                } finally {
                    $localDb->close();
                }
            } catch (Throwable $error) {
                Lib::ShowError(FILENAME, "[Login] Database lookup error for '$cleanUser': " . $error->getMessage());
            }

            if ($email === '' && str_contains($rawPaletkiUser, '@')) {
                $email = $rawPaletkiUser;
            }
            if ($fullName === '') {
                $fullName = $cleanUser;
            }

            Lib::ShowDebug(FILENAME, "[Login] User '$cleanUser' logged in successfully. canEdit=" . ($canEdit ? 'true' : 'false') . ', groups=[' . implode(', ', $userGroups) . ']');

            sendJsonResponse(true, 'Zalogowano pomyślnie', [
                'userId'     => $cleanUser,
                'name'       => $fullName,
                'email'      => $email,
                'department' => $department,
                'groups'     => $userGroups,
                'canEdit'    => $canEdit,
                'isGuest'    => false,
                'token'      => $authRes['token'],
                'expires_at' => $authRes['expires_at'],
            ]);
        }

        case 'GetMasters': {
            $mysqli = getDbConnection();
            try {
                $statusFilter = Lib::GetArrayString($input, 'status');
                $processFilter = Lib::GetArrayString($input, 'process');
                $activeFilter = Lib::GetArrayInt($input, 'isactive');
                $search = Lib::GetArrayString($input, 'search');

                $where = [];
                $types = '';
                $params = [];

                if ($statusFilter !== null) {
                    $where[] = 'status = ?';
                    $types .= 's';
                    $params[] = $statusFilter;
                }
                if ($processFilter !== null) {
                    $where[] = 'process LIKE ?';
                    $types .= 's';
                    $params[] = '%' . $processFilter . '%';
                }
                if ($activeFilter !== null) {
                    $where[] = 'isactive = ?';
                    $types .= 'i';
                    $params[] = $activeFilter;
                }
                if ($search !== null) {
                    $where[] = '(unit LIKE ? OR process LIKE ? OR user LIKE ?)';
                    $types .= 'sss';
                    $searchParam = '%' . $search . '%';
                    array_push($params, $searchParam, $searchParam, $searchParam);
                }

                $sql = 'SELECT id, unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, user, isactive, FIS FROM masterUnits';
                if (!empty($where)) {
                    $sql .= ' WHERE ' . implode(' AND ', $where);
                }
                $sql .= ' ORDER BY id DESC';

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
        }

        case 'ResetCounters': {
            requireWriteAccess();
            $operatorName = getOperatorName();
            $resetType = Lib::GetArrayString($input, 'resetType');
            if (!in_array($resetType, ['all', 'cycles', 'errors'], true)) {
                sendJsonResponse(false, 'Nieprawidłowy typ resetowania liczników', null, 400);
            }
            $unitList = parseUnitList(Lib::GetArrayString($input, 'units'));

            if (empty($unitList)) {
                Lib::ShowError(FILENAME, '[ResetCounters] Missing or empty units parameter');
                sendJsonResponse(false, 'Brak jednostek do zresetowania', null, 400);
            }

            [$operationName, $updateSql, $msgPrefix] = match ($resetType) {
                'cycles' => ['ResetCycles', 'UPDATE masterUnits SET currentCounter = 0 WHERE unit = ?', 'Wyzerowano liczniki cykli'],
                'errors' => ['ResetErrors', 'UPDATE masterUnits SET errorCounter = 0 WHERE unit = ?', 'Wyzerowano liczniki błędów'],
                'all'    => ['Reset', 'UPDATE masterUnits SET currentCounter = 0, errorCounter = 0 WHERE unit = ?', 'Wyzerowano wszystkie liczniki'],
            };

            Lib::ShowDebug(FILENAME, '[ResetCounters] Start resetting unit(s): [' . implode(', ', $unitList) . "], type='$resetType', operator='$operatorName'");
            $mysqli = getDbConnection();
            try {
                $mysqli->begin_transaction();
                $resetCount = 0;

                $stmtCheck = $mysqli->prepare('SELECT isactive FROM masterUnits WHERE unit = ? LIMIT 1');
                $stmtUpdate = $mysqli->prepare($updateSql);

                foreach ($unitList as $unit) {
                    $stmtCheck->bind_param('s', $unit);
                    $stmtCheck->execute();
                    $checkRow = $stmtCheck->get_result()->fetch_assoc();

                    if (!$checkRow || (int)$checkRow['isactive'] === 2) {
                        Lib::ShowDebug(FILENAME, "[ResetCounters] Skipping inactive/blocked unit '$unit'");
                        continue;
                    }

                    logMasterHistory($mysqli, $unit, $operatorName, $operationName);

                    $stmtUpdate->bind_param('s', $unit);
                    $stmtUpdate->execute();
                    $resetCount++;
                }

                $stmtCheck->close();
                $stmtUpdate->close();
                $mysqli->commit();

                Lib::ShowDebug(FILENAME, "[ResetCounters] Succeeded: Reset $resetCount unit(s) (type='$resetType')");
                sendJsonResponse(true, "$msgPrefix ($resetCount sztuk)", ['count' => $resetCount, 'resetType' => $resetType]);
            } catch (Throwable $err) {
                $mysqli->rollback();
                Lib::ShowError(FILENAME, '[ResetCounters] Failed during transaction: ' . $err->getMessage());
                throw $err;
            } finally {
                $mysqli->close();
            }
        }

        case 'BlockMaster':
        case 'ActivateMaster': {
            requireWriteAccess();
            $operatorName = getOperatorName();
            $isBlocking = ($job === 'BlockMaster');
            $unitList = parseUnitList(Lib::GetArrayString($input, $isBlocking ? 'units' : 'unit'));

            if (empty($unitList)) {
                $errMsg = $isBlocking ? 'Brak jednostek do zablokowania' : 'Brak jednostek do aktywacji';
                Lib::ShowError(FILENAME, "[$job] Missing units parameter");
                sendJsonResponse(false, $errMsg, null, 400);
            }

            $newActiveState = $isBlocking ? 2 : 1;
            $operationName = $isBlocking ? 'Block' : 'Activate';

            Lib::ShowDebug(FILENAME, "[$job] Start processing unit(s): [" . implode(', ', $unitList) . "], operator='$operatorName'");
            $mysqli = getDbConnection();
            try {
                $mysqli->begin_transaction();
                $stmtUpdate = $mysqli->prepare('UPDATE masterUnits SET isactive = ? WHERE unit = ?');

                foreach ($unitList as $unit) {
                    logMasterHistory($mysqli, $unit, $operatorName, $operationName);
                    $stmtUpdate->bind_param('is', $newActiveState, $unit);
                    $stmtUpdate->execute();
                }

                $stmtUpdate->close();
                $mysqli->commit();

                Lib::ShowDebug(FILENAME, "[$job] Succeeded for unit(s): [" . implode(', ', $unitList) . ']');
                $msg = $isBlocking ? 'Zablokowano mastera (isActive=2)!' : 'Jednostki zostały aktywowane (isActive=1)!';
                sendJsonResponse(true, $msg);
            } catch (Throwable $err) {
                $mysqli->rollback();
                Lib::ShowError(FILENAME, "[$job] Failed: " . $err->getMessage());
                throw $err;
            } finally {
                $mysqli->close();
            }
        }

        case 'DeleteMaster': {
            $user = requireWriteAccess();
            $operatorName = getOperatorName();
            $unit = Lib::GetArrayString($input, 'unit');
            $fis = Lib::GetArrayString($input, 'fis');

            $required_fields = compact('unit', 'fis');
            foreach ($required_fields as $field => $value) {
                if ($value === null) {
                    throw new InvalidArgumentException("$field is required");
                }
            }

            $fisOnly = Lib::GetArrayBool($input, 'fisOnly') === true;
            if (!in_array($fis, ['FIS1', 'FIS2'], true)) {
                sendJsonResponse(false, 'Nieprawidłowy serwer FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
            }

            Lib::ShowDebug(FILENAME, "[DeleteMaster] Start unit='$unit', requestedFis='$fis', fisOnly=" . ($fisOnly ? '1' : '0') . ", user='$user'");
            $mysqli = getDbConnection();
            try {
                $masterRow = masterStructureRecord($mysqli, $unit);

                if (!$masterRow && !$fisOnly) {
                    Lib::ShowError(FILENAME, "[DeleteMaster] Master '$unit' does not exist in database");
                    sendJsonResponse(false, "Master '$unit' nie istnieje w bazie danych", null, 404);
                }

                $storedFis = $masterRow ? normalizeFisValue($masterRow['FIS'] ?? 'FIS1') : null;

                if (!$fisOnly && $storedFis !== null && $fis !== $storedFis) {
                    Lib::ShowError(FILENAME, "[DeleteMaster] FIS mismatch for unit '$unit': expected '$storedFis', got '$fis'");
                    sendJsonResponse(
                        false,
                        "Master '$unit' należy do $storedFis, a żądanie usunięcia wysłano dla $fis.",
                        ['expected_fis' => $storedFis],
                        409
                    );
                }

                $serverFis = getServerFis();
                $targetHostFis = $fisOnly ? $fis : ($storedFis ?? $fis);
                if ($serverFis !== null && $serverFis !== $targetHostFis) {
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
                            $fisError
                        );
                    }
                    $fisAlreadyMissing = true;
                    Lib::ShowDebug(FILENAME, "[DeleteMaster] Unit '$unit' was already missing from $effectiveFis");
                }

                if ($fisOnly) {
                    Lib::ShowDebug(FILENAME, "[DeleteMaster] Succeeded (fisOnly): Master '$unit' deleted from $effectiveFis (fisDeleted=" . ($fisDeleted ? '1' : '0') . ')');
                    $message = $fisDeleted
                        ? "Master '$unit' został usunięty z $effectiveFis"
                        : "Master '$unit' nie istniał już w $effectiveFis";
                    sendJsonResponse(true, $message, [
                        'fis'         => $effectiveFis,
                        'fis_deleted' => $fisDeleted,
                        'fis_only'    => true,
                    ]);
                }

                try {
                    $mysqli->begin_transaction();
                    logMasterHistory($mysqli, $unit, $operatorName, 'Delete');

                    $stmtDel = $mysqli->prepare('DELETE FROM masterUnits WHERE unit = ?');
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
                        'fis'           => $effectiveFis,
                        'fis_deleted'   => $fisDeleted,
                    ]);
                } catch (Throwable $err) {
                    $mysqli->rollback();
                    Lib::ShowError(FILENAME, '[DeleteMaster] Failed: ' . $err->getMessage());
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
                            [
                                'fis'                 => $effectiveFis,
                                'fis_deleted'         => $fisDeleted,
                                'fis_already_missing' => $fisAlreadyMissing,
                                'database_deleted'    => false,
                            ],
                            $err
                        );
                    }
                    throw $err;
                }
            } finally {
                $mysqli->close();
            }
        }

        case 'GetStationBlockingRules':
        case 'SetStationBlocking':
        case 'DeleteStationBlockingRule': {
            $writeUser = '';
            if ($job !== 'GetStationBlockingRules') {
                $writeUser = requireWriteAccess();
            }

            $fis = requireValidFis(Lib::GetArrayString($input, 'fis'));
            $mode = 'single';
            $station = '';

            if ($job !== 'GetStationBlockingRules') {
                $mode = Lib::GetArrayString($input, 'mode');
                $station = Lib::GetArrayString($input, 'station');

                $required_fields = compact('mode', 'station');
                foreach ($required_fields as $field => $value) {
                    if ($value === null) {
                        throw new InvalidArgumentException("$field is required");
                    }
                }

                if (!in_array($mode, ['single', 'prefix', 'fis'], true)
                    || ($mode === 'fis' ? $station !== 'ALL' : !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/D', $station))
                    || ($job === 'SetStationBlocking' && array_key_exists('disabled', $input) && (!is_bool($input['disabled']) || ($mode !== 'fis' && $input['disabled'] !== false)))) {
                    sendJsonResponse(false, 'Nieprawidłowa stacja, prefix, zakres lub ustawienie blokowania', null, 400);
                }

                if ($mode === 'fis' && empty(array_intersect(getUserGroups($writeUser), ['admin_group', 'fisadmin_group']))) {
                    Lib::ShowError(FILENAME, "[StationBlocking] FIS override denied for user '$writeUser', fis='$fis', job='$job'");
                    sendJsonResponse(false, 'Nadrzędne blokowanie całego FIS mogą zmieniać tylko osoby z grup admin_group lub fisadmin_group', null, 403);
                }
            }

            $mysqli = getDbConnection();
            try {
                if ($job === 'GetStationBlockingRules') {
                    $stmt = $mysqli->prepare('SELECT station, mode, disabled, FIS, user, `date` FROM stationBlockingRules WHERE FIS = ? ORDER BY mode, station');
                    $stmt->bind_param('s', $fis);
                    $stmt->execute();
                    $rawRows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
                    $stmt->close();

                    $rows = [];
                    foreach ($rawRows as $r) {
                        $item = [
                            'station' => $r['station'],
                            'mode'    => $r['mode'],
                            'FIS'     => $r['FIS'],
                            'user'    => $r['user'],
                            'date'    => $r['date'],
                        ];
                        if ($r['mode'] === 'fis') {
                            $item['disabled'] = (bool)$r['disabled'];
                        }
                        $rows[] = $item;
                    }
                    sendJsonResponse(true, 'Pobrano reguły blokowania stacji', $rows);
                }

                $operator = getOperatorName();
                $mysqli->begin_transaction();

                $check = $mysqli->prepare('SELECT disabled FROM stationBlockingRules WHERE FIS = ? AND mode = ? AND station = ? FOR UPDATE');
                $check->bind_param('sss', $fis, $mode, $station);
                $check->execute();
                $existingRow = $check->get_result()->fetch_assoc();
                $check->close();

                $deleting = ($job === 'DeleteStationBlockingRule');
                $disabled = ($mode === 'fis' && Lib::GetArrayBool($input, 'disabled') === true) ? 1 : 0;
                $changed = $deleting ? ($existingRow !== null) : ($existingRow === null || (int)$existingRow['disabled'] !== $disabled);

                if ($changed) {
                    if ($deleting) {
                        $stmt = $mysqli->prepare('DELETE FROM stationBlockingRules WHERE FIS = ? AND mode = ? AND station = ?');
                        $stmt->bind_param('sss', $fis, $mode, $station);
                        $operation = 'DeleteStationBlockingRule';
                        $auditStatus = 'INHERIT';
                    } else {
                        $stmt = $mysqli->prepare(
                            'INSERT INTO stationBlockingRules (FIS, mode, station, disabled, user, `date`)
                             VALUES (?, ?, ?, ?, ?, NOW())
                             ON DUPLICATE KEY UPDATE disabled = VALUES(disabled), user = VALUES(user), `date` = NOW()'
                        );
                        $stmt->bind_param('sssis', $fis, $mode, $station, $disabled, $operator);
                        $operation = $disabled ? 'DisableStationBlocking' : 'EnableStationBlocking';
                        $auditStatus = $disabled ? 'DISABLED' : 'ENABLED';
                    }
                    $stmt->execute();
                    $stmt->close();

                    $auditProcess = 'BLOCKING_POLICY:' . $mode;
                    $audit = $mysqli->prepare(
                        "INSERT INTO history (unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date`)
                         VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, NOW())"
                    );
                    $audit->bind_param('ssssss', $station, $auditProcess, $auditStatus, $fis, $operator, $operation);
                    $audit->execute();
                    if ($audit->affected_rows !== 1) {
                        throw new RuntimeException('Station blocking audit insert failed');
                    }
                    $audit->close();
                }

                $mysqli->commit();
                Lib::ShowDebug(FILENAME, "[StationBlocking] job='$job', fis='$fis', mode='$mode', station='$station', operator='$operator', changed=" . ($changed ? '1' : '0'));
                sendJsonResponse(true, 'Zapisano regułę blokowania stacji', ['changed' => $changed]);
            } catch (Throwable $err) {
                $mysqli->rollback();
                throw $err;
            } finally {
                $mysqli->close();
            }
        }

        case 'UpdateMaster': {
            requireWriteAccess();
            $unit = Lib::GetArrayString($input, 'unit');
            $fis = Lib::GetArrayString($input, 'fis');
            $process = Lib::GetArrayString($input, 'process');
            $maxCounter = Lib::GetArrayInt($input, 'maxCounter');
            $maxErrors = Lib::GetArrayInt($input, 'maxErrors');

            $required_fields = compact('unit', 'fis', 'process', 'maxCounter', 'maxErrors');
            foreach ($required_fields as $field => $value) {
                if ($value === null) {
                    throw new InvalidArgumentException("$field is required");
                }
            }
            $fis = requireValidFis($fis, 'Żądanie edycji trafiło do niewłaściwego FIS');

            $processes = [];
            foreach (explode(',', $process) as $process) {
                $process = trim($process);
                if ($process === '') {
                    sendJsonResponse(false, 'Lista procesów zawiera pustą nazwę', null, 400);
                }
                if (!in_array($process, $processes, true)) {
                    $processes[] = $process;
                }
            }

            $processClean = implode(',', $processes);
            if ($processClean === '' || mb_strlen($processClean) > 100) {
                sendJsonResponse(false, 'Lista procesów może mieć maksymalnie 100 znaków', null, 400);
            }

            if ($maxCounter < 1 || $maxErrors < 1
                || $maxCounter > 2147483647 || $maxErrors > 2147483647) {
                sendJsonResponse(false, 'Limity muszą być dodatnimi liczbami całkowitymi do 2147483647.', null, 400);
            }
            $operatorName = getOperatorName();
            $mysqli = getDbConnection();
            try {
                $mysqli->begin_transaction();

                $check = $mysqli->prepare('SELECT process, maxCounter, errorMaxCounter, FIS FROM masterUnits WHERE unit = ? FOR UPDATE');
                $check->bind_param('s', $unit);
                $check->execute();
                $oldRow = $check->get_result()->fetch_assoc();
                $check->close();

                if (!$oldRow) {
                    throw new ApiOperationException('Master nie istnieje', 404);
                }
                if (strtoupper(trim((string)$oldRow['FIS'])) !== $fis) {
                    throw new ApiOperationException('Master należy do innego FIS. Odśwież listę masterów.', 409);
                }

                $changed = $oldRow['process'] !== $processClean
                    || (int)$oldRow['maxCounter'] !== $maxCounter
                    || (int)$oldRow['errorMaxCounter'] !== $maxErrors;

                if ($changed) {
                    $update = $mysqli->prepare('UPDATE masterUnits SET process = ?, maxCounter = ?, errorMaxCounter = ? WHERE unit = ?');
                    $update->bind_param('siis', $processClean, $maxCounter, $maxErrors, $unit);
                    $update->execute();
                    if ($update->affected_rows !== 1) {
                        throw new RuntimeException('UpdateMaster did not update exactly one master');
                    }
                    $update->close();

                    if (logMasterHistory($mysqli, $unit, $operatorName, 'Update') !== 1) {
                        throw new RuntimeException('UpdateMaster did not create exactly one history entry');
                    }
                }

                $mysqli->commit();
                Lib::ShowDebug(FILENAME, "[UpdateMaster] unit='$unit', fis='$fis', operator='$operatorName', changed=" . ($changed ? '1' : '0'));
                sendJsonResponse(true, 'Zapisano ustawienia mastera', ['unit' => $unit, 'changed' => $changed]);
            } catch (Throwable $err) {
                $mysqli->rollback();
                throw $err;
            } finally {
                $mysqli->close();
            }
        }

        case 'InspectMasterStructure':
        case 'DeleteMasterStructure': {
            requireWriteAccess();
            $unit = Lib::GetArrayString($input, 'unit');
            $process = Lib::GetArrayString($input, 'process');
            $fis = Lib::GetArrayString($input, 'fis');

            $required_fields = compact('unit', 'process', 'fis');
            foreach ($required_fields as $field => $value) {
                if ($value === null) {
                    throw new InvalidArgumentException("$field is required");
                }
            }

            if (!in_array($fis, ['FIS1', 'FIS2'], true)
                || (getServerFis() !== null && getServerFis() !== $fis)) {
                sendJsonResponse(false, 'Nieprawidłowe parametry struktury mastera.', null, 400);
            }

            $unit = strtoupper($unit);
            try {
                $structure = inspectMasterStructure($unit, $process);
            } catch (Exception $error) {
                throw masterStructureFailure(preg_match('/SMT|XRAY|ICT/i', $process) ? 'read_structure' : 'read_unit', $unit, $fis, $error, []);
            }

            $structureDb = getDbConnection();
            try {
                $masterRecord = masterStructureRecord($structureDb, $structure['unit']);
                $structure['masterFis'] = $masterRecord ? $masterRecord['FIS'] : null;

                if ($job === 'DeleteMasterStructure') {
                    if (!$masterRecord || $masterRecord['FIS'] !== $fis || !$structure['exists']) {
                        sendJsonResponse(false, 'Brak mastera na źródłowym FIS.', null, 409);
                    }
                    if (!isset($input['expectedStructure']) || !masterStructureEqual($input['expectedStructure'], $structure)) {
                        sendJsonResponse(false, 'Struktura uległa zmianie. Odśwież dane przed migracją.', null, 409);
                    }
                    masterCheckChildRecords($structure, $structureDb);
                    $completed = applyMasterStructure($structure, $process, '', '', '', $fis, true);
                    sendJsonResponse(true, 'Usunięto strukturę ze źródłowego FIS.', ['structure' => $structure, 'completed' => $completed]);
                }

                sendJsonResponse(true, 'Odczytano strukturę mastera.', $structure);
            } finally {
                $structureDb->close();
            }
        }

        case 'CreateMaster': {
            $user = requireWriteAccess();
            $unit = Lib::GetArrayString($input, 'unit');
            $process = Lib::GetArrayString($input, 'process');
            $status = Lib::GetArrayString($input, 'status');
            $maxCounter = Lib::GetArrayInt($input, 'maxCounter');
            $maxErrors = Lib::GetArrayInt($input, 'maxErrors');
            $fis = Lib::GetArrayString($input, 'fis');

            $required_fields = compact('unit', 'process', 'status', 'maxCounter', 'maxErrors', 'fis');
            foreach ($required_fields as $field => $value) {
                if ($value === null) {
                    throw new InvalidArgumentException("$field is required");
                }
            }

            if (!in_array($status, ['GOOD', 'BAD'], true)) {
                sendJsonResponse(false, 'Nieprawidłowy status. Dozwolone wartości: GOOD, BAD.', null, 400);
            }

            if ($maxCounter < 1 || $maxCounter > 2147483647 || $maxErrors < 1 || $maxErrors > 2147483647) {
                sendJsonResponse(false, 'Limity muszą być dodatnimi liczbami całkowitymi do 2147483647.', null, 400);
            }

            if (!in_array($fis, ['FIS1', 'FIS2'], true)) {
                Lib::ShowError(FILENAME, "[CreateMaster] Invalid target FIS: '$fis'");
                sendJsonResponse(false, 'Nieprawidłowy serwer docelowy FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
            }

            $unit = strtoupper($unit);
            $forceUpdate = Lib::GetArrayBool($input, 'forceUpdate') === true;
            $userKey2 = Lib::GetArrayString($input, 'userKey2');

            Lib::ShowDebug(FILENAME, "[CreateMaster] Start unit='$unit', process='$process', status='$status', fis='$fis', maxCounter=$maxCounter, maxErrors=$maxErrors, forceUpdate=" . ($forceUpdate ? '1' : '0') . ", user='$user', userKey2='$userKey2'");

            $serverFis = getServerFis();
            if ($serverFis !== null && $serverFis !== $fis) {
                Lib::ShowError(FILENAME, "[CreateMaster] Target mismatch: request for $fis hit server $serverFis");
                sendJsonResponse(
                    false,
                    "Żądanie utworzenia dla $fis trafiło do $serverFis.",
                    ['expected_fis' => $fis],
                    409
                );
            }

            $processArray = array_values(array_unique(array_filter(array_map('trim', explode(',', $process)))));
            $processClean = implode(',', $processArray);
            if ($processClean === '') {
                sendJsonResponse(false, 'Proces jest wymagany.', null, 400);
            }

            $requestedUnit = $unit;
            $sourceStructure = $input['sourceStructure'] ?? null;

            try {
                $structure = inspectMasterStructure($requestedUnit, $processClean);
                if ($sourceStructure !== null && !$structure['exists']) {
                    if (!is_array($sourceStructure) || !isset($sourceStructure['unit']) || !is_string($sourceStructure['unit'])) {
                        throw new RuntimeException('Invalid source structure');
                    }
                    $structure = inspectMasterStructure($sourceStructure['unit'], $processClean);
                }
                $unit = $structure['unit'];
            } catch (Exception $error) {
                throw masterStructureFailure(preg_match('/SMT|XRAY|ICT/i', $processClean) ? 'read_structure' : 'read_unit', $requestedUnit, $fis, $error, []);
            }

            $mysqli = getDbConnection();
            try {
                $stmtCheck = $mysqli->prepare('SELECT unit, process, status, maxCounter, errorMaxCounter, isactive, FIS FROM masterUnits WHERE unit = ? LIMIT 1');
                $stmtCheck->bind_param('s', $unit);
                $stmtCheck->execute();
                $existing = $stmtCheck->get_result()->fetch_assoc();
                $stmtCheck->close();

                if ($sourceStructure !== null) {
                    if (!$existing || $existing['FIS'] !== Lib::GetArrayString($input, 'sourceFis') || $existing['FIS'] === $fis) {
                        sendJsonResponse(false, 'Brak mastera na wskazanym źródłowym FIS.', null, 409);
                    }
                    try {
                        $structure = masterImportStructure($structure, $sourceStructure, $processClean);
                    } catch (Exception $error) {
                        throw masterStructureFailure(preg_match('/SMT|XRAY|ICT/i', $processClean) ? 'read_structure' : 'read_unit', $unit, $fis, $error, []);
                    }
                }

                try {
                    masterCheckChildRecords($structure, $mysqli);
                } catch (Exception $error) {
                    throw masterStructureFailure('master_conflict', $unit, $fis, $error, []);
                }

                $structure['requestedUnit'] = $requestedUnit;
                $structureData = [
                    'requestedUnit' => $requestedUnit,
                    'unit'          => $unit,
                    'children'      => $structure['children'],
                    'structure'     => $structure,
                ];

                if ($existing && !$forceUpdate) {
                    Lib::ShowDebug(FILENAME, "[CreateMaster] Unit '$unit' already exists in database. Returning conflict comparison.");
                    sendJsonResponse(true, 'Master o tym numerze już istnieje w bazie', [
                        'requestedUnit' => $requestedUnit,
                        'unit'          => $unit,
                        'children'      => $structure['children'],
                        'exists'        => true,
                        'oldData'       => $existing,
                        'newData'       => [
                            'unit'            => $unit,
                            'process'         => $processClean,
                            'status'          => $status,
                            'maxCounter'      => $maxCounter,
                            'errorMaxCounter' => $maxErrors,
                            'FIS'             => $fis,
                            'userKey2'        => $userKey2,
                        ],
                    ]);
                }

                if (Lib::GetArrayBool($input, 'previewOnly') === true) {
                    sendJsonResponse(true, 'Struktura gotowa do utworzenia mastera.', $structureData);
                }
                if ($existing && $existing['FIS'] !== $fis && $sourceStructure === null) {
                    sendJsonResponse(false, 'Migracja wymaga odczytu struktury źródłowej.', $structureData, 409);
                }
                if (isset($input['expectedTargetStructure']) && !masterStructureEqual($input['expectedTargetStructure'], $structure)) {
                    sendJsonResponse(false, 'Struktura docelowa uległa zmianie. Odśwież dane.', $structureData, 409);
                }

                $creatorName = getOperatorName();
                $completed = applyMasterStructure($structure, $processClean, $status, $userKey2, $creatorName, $fis);

                try {
                    $mysqli->begin_transaction();
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
                    $stmtSave->bind_param('sssiiss', $unit, $processClean, $status, $maxCounter, $maxErrors, $creatorName, $fis);
                    $stmtSave->execute();
                    $stmtSave->close();

                    $operation = $existing ? 'Update' : 'Create';
                    logMasterHistory($mysqli, $unit, $creatorName, $operation);

                    $stmtEng = $mysqli->prepare('INSERT IGNORE INTO engineers (process) VALUES (?)');
                    foreach ($processArray as $singleProc) {
                        $stmtEng->bind_param('s', $singleProc);
                        $stmtEng->execute();
                    }
                    $stmtEng->close();

                    $mysqli->commit();
                    Lib::ShowDebug(FILENAME, "[CreateMaster] Succeeded: Master '$unit' saved in database and FIS ($operation)");
                    $actionMsg = $existing
                        ? "Master '$unit' został pomyślnie zaktualizowany!"
                        : "Master '$unit' został pomyślnie utworzony i zarejestrowany!";

                    sendJsonResponse(true, $actionMsg, array_merge($structureData, [
                        'operation' => $operation,
                        'FIS'       => $fis,
                        'completed' => $completed,
                    ]));
                } catch (Throwable $err) {
                    $mysqli->rollback();
                    Lib::ShowError(FILENAME, "[CreateMaster] Database transaction failed for '$unit': " . $err->getMessage());
                    throw new ApiOperationException(
                        formatOperationError(
                            'CreateMaster',
                            'database_save',
                            $unit,
                            $fis,
                            $err,
                            'fis_updated=true, database_updated=false; retry_required=true'
                        ),
                        500,
                        [
                            'fis'              => $fis,
                            'stage'            => 'database_save',
                            'unit'             => $unit,
                            'children'         => $structure['children'],
                            'completed'        => $completed,
                            'fis_updated'      => true,
                            'database_updated' => false,
                        ],
                        $err
                    );
                }
            } finally {
                $mysqli->close();
            }
        }

        /* =====================================================================
         * 2. HISTORY & AUDIT LOGS
         * ===================================================================== */
        case 'GetMasterHistory': {
            $unit = Lib::GetArrayString($input, 'unit');
            if ($unit === null) {
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
        }

        case 'GetHistory': {
            $mysqli = getDbConnection();
            try {
                $includeTotal = Lib::GetArrayBool($input, 'includeTotal') === true;
                $limit = max(1, min(500, Lib::GetArrayInt($input, 'limit') ?? 100));
                $offset = max(0, Lib::GetArrayInt($input, 'offset') ?? 0);
                $unitFilter = Lib::GetArrayString($input, 'unit');
                $opFilter = Lib::GetArrayString($input, 'operation');
                $userFilter = Lib::GetArrayString($input, 'user');
                $processFilter = Lib::GetArrayString($input, 'process');
                $statusFilter = Lib::GetArrayString($input, 'status');
                $dateFrom = Lib::GetArrayString($input, 'dateFrom');
                $dateTo = Lib::GetArrayString($input, 'dateTo');

                $where = [];
                $types = '';$params = [];

                if ($unitFilter !== null) {$where[] = 'unit LIKE ?';
                    $types .= 's';
                    $params[] = '%' .$unitFilter . '%';
                }
                if ($opFilter !== null) {
                    $where[] = 'operation = ?';$types .= 's';
                    $params[] =$opFilter;
                }
                if ($userFilter !== null) {$where[] = 'user LIKE ?';
                    $types .= 's';
                    $params[] = '%' .$userFilter . '%';
                }
                if ($processFilter !== null) {$where[] = 'process LIKE ?';
                    $types .= 's';
                    $params[] = '%' .$processFilter . '%';
                }
                if ($statusFilter !== null) {
                    $where[] = 'status = ?';$types .= 's';
                    $params[] =$statusFilter;
                }
                if ($dateFrom !== null) {$where[] = '`date` >= ?';
                    $types .= 's';
                    $params[] = str_contains($dateFrom, ' ') ? $dateFrom : ($dateFrom . ' 00:00:00');
                }
                if ($dateTo !== null) {$where[] = '`date` <= ?';
                    $types .= 's';
                    $params[] = str_contains($dateTo, ' ') ? $dateTo : ($dateTo . ' 23:59:59');
                }

                $whereSql = !empty($where) ? ' WHERE ' . implode(' AND ', $where) : '';$total = 0;

                if ($includeTotal) {$countStmt = $mysqli->prepare('SELECT COUNT(*) AS total FROM history' .$whereSql);
                    if (!empty($params)) {$countStmt->bind_param($types, ...$params);
                    }
                    $countStmt->execute();$total = (int)$countStmt->get_result()->fetch_assoc()['total'];$countStmt->close();
                }

                $sql = 'SELECT id, unit, process, status, currentCounter, maxCounter, errorCounter, errorMaxCounter, globalCounter, FIS, user, operation, `date` FROM history'
                    . $whereSql
                    . ' ORDER BY `date` DESC, id DESC LIMIT ? OFFSET ?';
                $types .= 'ii';
                $params[] =$limit;
                $params[] =$offset;

                $stmt =$mysqli->prepare($sql);
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmt->close();

                sendJsonResponse(true, 'Historia operacji załadowana', $includeTotal ? ['records' => $rows, 'total' => $total] :$rows);
            } finally {
                $mysqli->close();
            }
        }

        /* =====================================================================
         * 3. BLOCKED MACHINES
         * ===================================================================== */
        case 'GetBlockedMachines': {
            $items = [];
            if (is_dir(BLOCKED_MACHINES_DIR) && ($files = scandir(BLOCKED_MACHINES_DIR)) !== false) {
                foreach ($files as$file) {
                    if ($file === '.' || $file === '..' || str_contains($file, '10.237.')) {
                        continue;
                    }
                    $fullPath = BLOCKED_MACHINES_DIR .$file;
                    if (!is_file($fullPath)) {
                        continue;
                    }

                    $lastUnderscore = strrpos($file, '_');$machine = $lastUnderscore !== false ? substr($file, 0, $lastUnderscore) :$file;
                    $prefix =$lastUnderscore !== false ? substr($file,$lastUnderscore + 1) : 'MASTER';
                    $mtime = filemtime($fullPath);

                    $items[] = [
                        'id'        => $file,
                        'filename'  => $file,
                        'machine'   => $machine ?: 'UNKNOWN',
                        'prefix'    => $prefix ?: 'MASTER',
                        'blockedAt' => $mtime ? date('Y-m-d H:i:s', $mtime) : null,
                        'size'      => filesize($fullPath) ?: 0,
                    ];
                }
            }
            sendJsonResponse(true, 'Pobrano zablokowane maszyny', $items);
        }

        case 'DeleteBlockedMachine': {
            $user = requireWriteAccess();
            $record = Lib::GetArrayString($input, 'filename');
            if ($record === null || $record === '.' || $record === '..'
                || str_contains($record, '/') || str_contains($record, '\\') || str_contains($record, "\0")) {
                Lib::ShowError(FILENAME, '[DeleteBlockedMachine] Missing or invalid filename parameter');
                sendJsonResponse(false, 'Nieprawidłowy parametr filename', null, 400);
            }

            Lib::ShowDebug(FILENAME, "[DeleteBlockedMachine] Unblocking machine record='$record' by user='$user'");
            $targetPath = BLOCKED_MACHINES_DIR . basename($record);
            if (is_link($targetPath) || !is_file($targetPath)) {
                Lib::ShowError(FILENAME, "[DeleteBlockedMachine] Block file '$record' not found at '$targetPath'");
                sendJsonResponse(false, "Plik blokady '$record' nie istnieje", null, 404);
            }

            unlockMachineWithAudit($targetPath,$record, getServerFis() ?: 'FIS1');
            sendJsonResponse(true, "Blokada dla '$record' została pomyślnie usunięta i zapisana w audycie!");
        }

        /* =====================================================================
         * 4. ENGINEERS & MAILING GROUPS
         * ===================================================================== */
        case 'GetEngineers': {
            $mysqli = getDbConnection();
            try {
                $res = $mysqli->query('SELECT id, process, mail FROM engineers ORDER BY process');$rows = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
                sendJsonResponse(true, 'Lista inżynierów załadowana', $rows);
            } finally {
                $mysqli->close();
            }
        }

        case 'UpdateEngineerMail': {
            $user = requireWriteAccess();
            $process = Lib::GetArrayString($input, 'process');
            $mail = Lib::GetArrayString($input, 'mail');

            if ($process === null) {
                Lib::ShowError(FILENAME, '[UpdateEngineerMail] Missing process parameter');
                sendJsonResponse(false, 'Brak parametru process', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt =$mysqli->prepare('UPDATE engineers SET mail = ? WHERE process = ?');
                $stmt->bind_param('ss',$mail, $process);$stmt->execute();
                $affected =$stmt->affected_rows;
                $stmt->close();

                Lib::ShowDebug(FILENAME, "[UpdateEngineerMail] Process '$process' mail set to '$mail' by user '$user'");
                sendJsonResponse(true, "Zaktualizowano grupę mailową dla procesu '$process'", ['affected' => $affected]);
            } finally {
                $mysqli->close();
            }
        }

        case 'AddEngineer': {
            $user = requireWriteAccess();
            $process = Lib::GetArrayString($input, 'process');
            $mail = Lib::GetArrayString($input, 'mail');

            if ($process === null) {
                Lib::ShowError(FILENAME, '[AddEngineer] Missing process parameter');
                sendJsonResponse(false, 'Brak parametru process', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt =$mysqli->prepare(
                    'INSERT INTO engineers (process, mail) VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE mail = VALUES(mail)'
                );
                $stmt->bind_param('ss',$process, $mail);
                $stmt->execute();
                $insertId =$stmt->insert_id;
                $stmt->close();

                Lib::ShowDebug(FILENAME, "[AddEngineer] Process '$process' configured with mail '$mail' (id=$insertId) by user '$user'");
                sendJsonResponse(true, "Proces '$process' został pomyślnie skonfigurowany!", ['id' => $insertId]);
            } finally {
                $mysqli->close();
            }
        }

        case 'DeleteEngineer': {
            $user = requireWriteAccess();
            $id = Lib::GetArrayInt($input, 'id');
            if ($id === null || $id <= 0) {
                sendJsonResponse(false, 'Nieprawidłowe ID inżyniera', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare('DELETE FROM engineers WHERE id = ?');
                $stmt->bind_param('i', $id);
                $stmt->execute();
                $affected =$stmt->affected_rows;
                $stmt->close();

                Lib::ShowDebug(FILENAME, "[DeleteEngineer] Deleted process configuration id=$id by user '$user'");
                sendJsonResponse(true, 'Usunięto konfigurację procesu', ['affected' => $affected]);
            } finally {
                $mysqli->close();
            }
        }

        case 'GetMails': {
            $mysqli = getDbConnection();
            try {
                $res = $mysqli->query('SELECT id, name, mail FROM mails ORDER BY name');$rows = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
                sendJsonResponse(true, 'Książka adresowa maili załadowana', $rows);
            } finally {
                $mysqli->close();
            }
        }

        case 'AddMail': {
            $user = requireWriteAccess();
            $name = Lib::GetArrayString($input, 'name');
            $mail = Lib::GetArrayString($input, 'mail');

            if ($mail === null) {
                Lib::ShowError(FILENAME, '[AddMail] Missing email address');
                sendJsonResponse(false, 'Adres e-mail jest wymagany!', null, 400);
            }

            if ($name === null) {
                $name = explode('@',$mail)[0];
            }

            $mysqli = getDbConnection();
            try {
                $stmt =$mysqli->prepare('INSERT INTO mails (name, mail) VALUES (?, ?)');
                $stmt->bind_param('ss',$name, $mail);
                $stmt->execute();
                $id =$stmt->insert_id;
                $stmt->close();

                Lib::ShowDebug(FILENAME, "[AddMail] Added mail group '$name' ($mail, id=$id) by user '$user'");
                sendJsonResponse(true, "Dodano grupę mailową '$name' ($mail)", ['id' => $id]);
            } finally {
                $mysqli->close();
            }
        }

        case 'UpdateMail': {
            $user = requireWriteAccess();
            $id = Lib::GetArrayInt($input, 'id');
            $name = Lib::GetArrayString($input, 'name');
            $mail = Lib::GetArrayString($input, 'mail');

            $required_fields = compact('id', 'mail');
            foreach ($required_fields as $field => $value) {
                if ($value === null) {
                    throw new InvalidArgumentException("$field is required");
                }
            }
            if ($id <= 0) {
                Lib::ShowError(FILENAME, "[UpdateMail] Invalid id or missing mail: id=$id, mail='$mail'");
                sendJsonResponse(false, 'Nieprawidłowe ID lub brak adresu mailowego', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt =$mysqli->prepare('UPDATE mails SET name = ?, mail = ? WHERE id = ?');
                $stmt->bind_param('ssi', $name,$mail, $id);
                $stmt->execute();
                $affected =$stmt->affected_rows;
                $stmt->close();

                Lib::ShowDebug(FILENAME, "[UpdateMail] Updated mail group id=$id to '$name' ($mail) by user '$user'");
                sendJsonResponse(true, 'Zaktualizowano grupę mailową', ['affected' => $affected]);
            } finally {
                $mysqli->close();
            }
        }

        case 'DeleteMail': {
            $user = requireWriteAccess();
            $id = Lib::GetArrayInt($input, 'id');
            if ($id === null || $id <= 0) {
                Lib::ShowError(FILENAME, "[DeleteMail] Invalid mail id: $id");
                sendJsonResponse(false, 'Nieprawidłowe ID maila', null, 400);
            }

            $mysqli = getDbConnection();
            try {
                $stmt = $mysqli->prepare('DELETE FROM mails WHERE id = ?');
                $stmt->bind_param('i', $id);
                $stmt->execute();
                $affected =$stmt->affected_rows;
                $stmt->close();

                Lib::ShowDebug(FILENAME, "[DeleteMail] Deleted mail group id=$id by user '$user'");
                sendJsonResponse(true, 'Usunięto grupę mailową', ['affected' => $affected]);
            } finally {
                $mysqli->close();
            }
        }

        default:
            Lib::ShowError(FILENAME, "Unknown job requested: '$job'");
            sendJsonResponse(false, "Nieznany job: '$job'", null, 404);
    }
} catch (Throwable $e) {
    Lib::ShowError(FILENAME, "[Fatal] Exception in job '$job': " . $e->getMessage() . ' at ' . $e->getFile() . ':' .$e->getLine());
    Lib::ShowError(FILENAME, "[Fatal] Stack trace:\n" . $e->getTraceAsString());
    if ($e instanceof ApiOperationException) {
        sendJsonResponse(false, $e->publicMessage, $e->responseData,$e->statusCode);
    }
    if ($e instanceof JsonException || $e instanceof InvalidArgumentException) {
        sendJsonResponse(false, 'Nieprawidłowy format danych wejściowych: ' . $e->getMessage(), null, 400);
    }
    sendJsonResponse(false, 'Wewnętrzny błąd serwera', null, 500);
}
