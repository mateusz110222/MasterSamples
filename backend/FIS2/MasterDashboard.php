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
    if ($input === null) {
        $contentType = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : (isset($_SERVER['HTTP_CONTENT_TYPE']) ? $_SERVER['HTTP_CONTENT_TYPE'] : '');
        $form = Lib::getForm($contentType, FILENAME);
        $input = array_merge($_GET, is_array($form) ? $form : array());
    }
    return $input;
}

// BEGIN MASTER CREATION STRUCTURE (kept identical in both standalone endpoints).
function masterFisReply($response, $operation)
{
    if (!is_array($response) || empty($response['status'])) {
        $message = isset($response['message']) ? $response['message'] : 'Invalid FIS response';
        if ($operation === 'Archive::GetAll' && isset($response['reply']) && is_string($response['reply']) && $response['reply'] !== '') {
            // Archive::GetAll preserves the raw MDB report on an unsuccessful archrptdlm.
            // Keep its header in the diagnostic instead of guessing that a bare SN means absent.
            $lines = explode("\n", $response['reply']);
            $message .= ' | MDB header: ' . substr(trim($lines[0]), 0, 512);
        }
        throw new RuntimeException($operation . ': ' . $message);
    }
    return isset($response['reply']) ? $response['reply'] : null;
}

function masterExistsInWip($unit)
{
    try {
        $result = Unit::Find($unit);
        if (is_array($result) && isset($result['status']) && $result['status'] === false
            && isset($result['message']) && $result['message'] === 'Unit not found') {
            return false;
        }
        masterFisReply($result, 'Unit::Find');
        return true;
    } catch (Exception $error) {
        if (!isMissingFisUnitError($error)) {
            throw $error;
        }
        return false;
    }
}

function masterReadUnit($unit, $withStructure = true)
{
    // Always check WIP first; technical Find failures must not trigger archive lookup.
    if (!masterExistsInWip($unit)) {
        // Ordinary masters need no historical metadata: absent in WIP means CREATEUNIT.
        if (!$withStructure) {
            return array('exists' => false, 'archived' => false, 'gold' => false, 'parent' => '', 'children' => array());
        }
        try {
            // Read historical metadata even if this generation was unarchived earlier.
            $archiveResult = Archive::GetAll($unit, '', 1);
            $data = masterFisReply($archiveResult, 'Archive::GetAll');
        } catch (Exception $archiveError) {
            if (!isMissingFisUnitError($archiveError)) {
                throw $archiveError;
            }
            return array('exists' => false, 'archived' => false, 'gold' => false, 'parent' => '', 'children' => array());
        }
        $archived = true;
        $parent = $withStructure && isset($data['parent']) ? $data['parent'] : '';
        $children = $withStructure && isset($data['children']) ? $data['children'] : array();
    }
    if (!isset($archived)) {
        $data = masterFisReply(Unit::GetStatus($unit), 'Unit::GetStatus');
        $parent = '';
        $children = array();
        if ($withStructure) {
            $parentResult = Unit::GetParent($unit);
            if (!is_array($parentResult) || !array_key_exists('status', $parentResult)) {
                throw new RuntimeException('Invalid Unit::GetParent response');
            }
            // GetParent returns status=false for the normal "no parent" case.
            if (empty($parentResult['status']) && (!isset($parentResult['message']) || $parentResult['message'] !== 'No parent found')) {
                throw new RuntimeException('Unit::GetParent failed for ' . $unit);
            }
            if (!empty($parentResult['status']) && (!isset($parentResult['reply']) || !is_string($parentResult['reply']))) {
                throw new RuntimeException('Invalid parent of ' . $unit);
            }
            $parent = !empty($parentResult['status']) ? $parentResult['reply'] : '';
            $children = masterFisReply(Unit::GetChildren($unit), 'Unit::GetChildren');
            // FIS2 GetChildren returns status=true, reply=null for an empty list.
            if ($children === null) {
                $children = array();
            }
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
    return array('exists' => true, 'archived' => $archived,
        'gold' => stripos($data['uk3'], 'GOLD') !== false,
        'parent' => trim($parent), 'children' => $children);
}

function inspectMasterStructure($requestedUnit, $process)
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
    if ($record['parent'] !== '' && count($record['children'])) {
        throw new RuntimeException('Nested panel structure: ' . $unit);
    }
    $members = array($unit => $record);
    foreach ($record['children'] as $child) {
        $members[$child] = masterReadUnit($child);
        if (!$members[$child]['exists']) {
            throw new RuntimeException("Panel '$unit' lists child '$child', but the child was not found in FIS or archives");
        }
        // UBuiltFrom on the panel is authoritative when the child's UWin is empty.
        // Accept one-way links in existing FIS data; recreated units are linked again.
        if ($members[$child]['parent'] !== '' && $members[$child]['parent'] !== $unit) {
            throw new RuntimeException("Child '$child' of panel '$unit' reports a different parent: '" . $members[$child]['parent'] . "'");
        }
        if (count($members[$child]['children'])) {
            throw new RuntimeException("Child '$child' of panel '$unit' has its own children: " . implode(', ', $members[$child]['children']));
        }
    }
    return array('requestedUnit' => $requestedUnit, 'unit' => $unit,
        'children' => $record['children'], 'exists' => $record['exists'], 'members' => $members);
}

function masterStructureRecord($unit)
{
    $db = getDbConnection();
    $stmt = $db->prepare('SELECT unit, FIS FROM masterUnits WHERE unit = ? LIMIT 1');
    $stmt->bind_param('s', $unit);
    $stmt->execute();
    $record = function_exists('stmtFetchAssoc') ? stmtFetchAssoc($stmt) : $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $db->close();
    return $record;
}

function masterCheckChildRecords($structure, $db)
{
    $stmt = $db->prepare('SELECT unit, FIS FROM masterUnits WHERE unit = ? LIMIT 1');
    foreach ($structure['children'] as $child) {
        $stmt->bind_param('s', $child);
        $stmt->execute();
        $record = function_exists('stmtFetchAssoc') ? stmtFetchAssoc($stmt) : $stmt->get_result()->fetch_assoc();
        if ($record) {
            $stmt->close();
            throw new RuntimeException('Child already has a separate master record: ' . $child);
        }
    }
    $stmt->close();
}

function masterStructureFailure($stage, $unit, $fis, $error, $completed)
{
    return new ApiOperationException(
        formatOperationError('CreateMaster', $stage, $unit, $fis, $error,
            empty($completed) ? 'fis_updated=false; database_updated=false'
                : 'FIS operations are not rolled back; database_updated=false'),
        502, array('fis' => $fis, 'stage' => $stage, 'failedUnit' => $unit,
            'completed' => $completed, 'database_updated' => false), $error);
}

function masterStructureEqual($left, $right)
{
    return is_array($left) && is_array($right)
        && isset($left['unit'], $left['children'], $left['members'])
        && $left['unit'] === $right['unit'] && $left['children'] === $right['children']
        && $left['members'] == $right['members'];
}

function masterImportStructure($target, $source, $process)
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
        if (($record['parent'] !== '' && $record['parent'] !== $target['unit']) || count($record['children'])) {
            throw new RuntimeException('Target child belongs to another structure: ' . $child);
        }
    }
    $target['children'] = array_values(array_unique($source['children']));
    sort($target['children'], SORT_STRING);
    return $target;
}

function applyMasterStructure($structure, $process, $status, $pn, $operator, $fis, $deleteOnly = false)
{
    $completed = array('unarchived' => array(), 'deleted' => array(), 'created' => array(), 'linked' => array());
    $stage = 'structure_check';
    $part = $structure['unit'];
    try {
        // Read every member before the first write. Never read children after deleting a panel.
        foreach ($structure['members'] as $sn => $expected) {
            $part = $sn;
            if (masterReadUnit($sn, preg_match('/SMT|XRAY|ICT/i', $process) === 1) != $expected) {
                throw new RuntimeException('Structure changed; refresh and confirm again: ' . $sn);
            }
        }
        // Capture all children before deletion, then clear WIP completely before creating
        // any new units. GOLD units must also be rebuilt to replace their old history.
        $parts = array_merge($structure['children'], array($structure['unit']));
        foreach ($parts as $part) {
            $record = $structure['members'][$part];
            $existsInWip = $record['exists'] && !$record['archived'];
            // A missing WIP unit can be created directly. Do not restore its old
            // history merely to delete it, including an "Already unarchived" generation.
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
                masterFisReply(Unit::Delete($part), 'Unit::Delete');
                $completed['deleted'][] = $part;
            }
        }
        if (!$deleteOnly) {
            $createOrder = array_merge(array($structure['unit']), $structure['children']);
            foreach ($createOrder as $part) {
                $stage = 'create_unit';
                $dcmods = 'MS_HISTORY|' . $part . '_MASTER|MS_PROCESS|' . $process . '|MS_STATUS|' . $status . '|OPERATOR|' . $operator;
                masterFisReply(Unit::DataEntry($part, 'CREATEUNIT', 'WEB', $dcmods, 'GOLD', '', (string)$pn, 'GOLDEN'), 'Unit::DataEntry');
                $completed['created'][] = $part;
            }
        }
        if (!$deleteOnly) {
            foreach ($structure['children'] as $part) {
                $stage = 'link';
                $current = masterFisReply(Unit::GetChildren($structure['unit']), 'Unit::GetChildren');
                if ($current === null) {
                    $current = array();
                }
                if (!is_array($current)) {
                    throw new RuntimeException('Invalid children after creation');
                }
                if (!in_array($part, $current, true)) {
                    masterFisReply(Unit::Link($structure['unit'], $part), 'Unit::Link');
                    $completed['linked'][] = $part;
                }
            }
        }
    } catch (Exception $error) {
        throw masterStructureFailure($stage, $part, $fis, $error, $completed);
    }
    return $completed;
}
// END MASTER CREATION STRUCTURE

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
    $inputUser = Lib::GetArrayString($input, 'user');
    $inputUser = cleanUsername((string)$inputUser);
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
    $name = Lib::GetArrayString($input, 'userName');
    if ($name !== null) {
        return $name;
    }

    $user = getAuthenticatedUser();
    return $user !== '' ? $user : 'SYSTEM';
}

$input = getRequestData();
$job = Lib::GetArrayString($input, 'job');

if ($job === null) {
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
            $record = Lib::GetArrayString($input, 'filename');
            if ($record === null || $record === '.' || $record === '..' ||
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
                $writeUser = requireWriteAccess();
            }
            $fis = Lib::GetArrayString($input, 'fis');
            if (!in_array($fis, array('FIS1', 'FIS2'), true)) {
                sendJsonResponse(false, 'Nieprawidłowy serwer FIS', null, 400);
            }
            $serverFis = getServerFis();
            if ($serverFis !== null && $serverFis !== $fis) {
                sendJsonResponse(false, 'Żądanie trafiło do niewłaściwego FIS', null, 409);
            }
            if ($job !== 'GetStationBlockingRules') {
                $mode = Lib::GetArrayString($input, 'mode');
                $station = Lib::GetArrayString($input, 'station');
                $required_fields = compact('mode', 'station');
                foreach ($required_fields as $field => $value) {
                    if ($value === null) {
                        throw new InvalidArgumentException("$field is required");
                    }
                }
                if (!in_array($mode, array('single', 'prefix', 'fis'), true) ||
                    ($mode === 'fis' ? $station !== 'ALL' : !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/D', $station)) ||
                    ($job === 'SetStationBlocking' && array_key_exists('disabled', $input) && (!is_bool($input['disabled']) || ($mode !== 'fis' && $input['disabled'] !== false)))) {
                    sendJsonResponse(false, 'Nieprawidłowa stacja, prefix, zakres lub ustawienie blokowania', null, 400);
                }
                if ($mode === 'fis' && !array_intersect(getUserGroups($writeUser), array('admin_group', 'fisadmin_group'))) {
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
                    $stmt->bind_result($station, $mode, $disabled, $rowFis, $operator, $date);
                    $rows = array();
                    while ($stmt->fetch()) {
                        $rows[] = array('station' => $station, 'mode' => $mode,
                            'FIS' => $rowFis, 'user' => $operator, 'date' => $date);
                        if ($mode === 'fis') $rows[count($rows) - 1]['disabled'] = (bool)$disabled;
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
                $disabled = $mode === 'fis' && Lib::GetArrayBool($input, 'disabled') === true ? 1 : 0;
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
                        $operation = $disabled ? 'DisableStationBlocking' : 'EnableStationBlocking';
                        $auditStatus = $disabled ? 'DISABLED' : 'ENABLED';
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
            if (!in_array($fis, array('FIS1', 'FIS2'), true)) {
                sendJsonResponse(false, 'Nieprawidłowy serwer FIS', null, 400);
            }
            $serverFis = getServerFis();
            if ($serverFis !== null && $serverFis !== $fis) {
                sendJsonResponse(false, 'Żądanie edycji trafiło do niewłaściwego FIS', null, 409);
            }
            $processes = array();
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
            if (!preg_match('/^.{1,100}$/usD', $processClean)) {
                sendJsonResponse(false, 'Lista procesów może mieć maksymalnie 100 znaków', null, 400);
            }
            if ($maxCounter < 1 || $maxErrors < 1
                || $maxCounter > 2147483647 || $maxErrors > 2147483647) {
                sendJsonResponse(false, 'Limity muszą być dodatnimi liczbami całkowitymi do 2147483647.', null, 400);
            }
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

        case 'InspectMasterStructure':
        case 'DeleteMasterStructure':
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

            if (!in_array($fis, array('FIS1', 'FIS2'), true)
                || (getServerFis() !== null && getServerFis() !== $fis)) {
                sendJsonResponse(false, 'Nieprawidłowe parametry struktury mastera.', null, 400);
            }
            $unit = strtoupper($unit);
            try {
                $structure = inspectMasterStructure($unit, $process);
            } catch (Exception $error) {
                throw masterStructureFailure(preg_match('/SMT|XRAY|ICT/i', $process) ? 'read_structure' : 'read_unit', $unit, $fis, $error, array());
            }
            $masterRecord = masterStructureRecord($structure['unit']);
            $structure['masterFis'] = $masterRecord ? $masterRecord['FIS'] : null;
            if ($job === 'DeleteMasterStructure') {
                if (!$masterRecord || $masterRecord['FIS'] !== $fis || !$structure['exists']) {
                    sendJsonResponse(false, 'Brak mastera na źródłowym FIS.', null, 409);
                }
                if (!isset($input['expectedStructure']) || !masterStructureEqual($input['expectedStructure'], $structure)) {
                    sendJsonResponse(false, 'Struktura uległa zmianie. Odśwież dane przed migracją.', null, 409);
                }
                $structureDb = getDbConnection();
                masterCheckChildRecords($structure, $structureDb);
                $structureDb->close();
                $completed = applyMasterStructure($structure, $process, '', '', '', $fis, true);
                sendJsonResponse(true, 'Usunięto strukturę ze źródłowego FIS.', array('structure' => $structure, 'completed' => $completed));
            }
            sendJsonResponse(true, 'Odczytano strukturę mastera.', $structure);
            break;

        case 'CreateMaster':
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

            $forceUpdate = Lib::GetArrayBool($input, 'forceUpdate') === true;

            if (!in_array($status, array('GOOD', 'BAD'), true)) {
                sendJsonResponse(false, 'Nieprawidłowy status. Dozwolone wartości: GOOD, BAD.', null, 400);
            }
            if ($maxCounter < 1 || $maxCounter > 2147483647 || $maxErrors < 1 || $maxErrors > 2147483647) {
                sendJsonResponse(false, 'Limity muszą być dodatnimi liczbami całkowitymi do 2147483647.', null, 400);
            }

            if (!in_array($fis, array('FIS1', 'FIS2'), true)) {
                Lib::ShowError(FILENAME, "[CreateMaster] Invalid target FIS: '$fis'");
                sendJsonResponse(false, 'Nieprawidłowy serwer docelowy FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
            }

            $unit = strtoupper($unit);
            $userKey2 = Lib::GetArrayString($input, 'userKey2');

            $updFlag = $forceUpdate ? '1' : '0';
            Lib::ShowDebug(FILENAME, "[CreateMaster] Start unit='$unit', process='$process', status='$status', fis='$fis', maxCounter=$maxCounter, maxErrors=$maxErrors, forceUpdate=$updFlag, user='$user', userKey2='$userKey2'");

            $serverFis = getServerFis();
            if ($serverFis !== null && $serverFis !== $fis) {
                Lib::ShowError(FILENAME, "[CreateMaster] Target mismatch: request for $fis hit server $serverFis");
                sendJsonResponse(
                    false,
                    "Żądanie utworzenia dla $fis trafiło do $serverFis.",
                    array('expected_fis' => $fis),
                    409
                );
            }

            $processArray = array_values(array_unique(array_filter(array_map('trim', explode(',', $process)))));
            $processClean = implode(',', $processArray);
            if ($processClean === '') {
                sendJsonResponse(false, 'Proces jest wymagany.', null, 400);
            }

            $requestedUnit = $unit;
            try {
                $structure = inspectMasterStructure($requestedUnit, $processClean);
                // A source snapshot carries the layout when the destination has no panel yet.
                $sourceStructure = isset($input['sourceStructure']) ? $input['sourceStructure'] : null;
                if ($sourceStructure !== null && !$structure['exists']) {
                    if (!is_array($sourceStructure) || !isset($sourceStructure['unit']) || !is_string($sourceStructure['unit'])) {
                        throw new RuntimeException('Invalid source structure');
                    }
                    $structure = inspectMasterStructure($sourceStructure['unit'], $processClean);
                }
                $unit = $structure['unit'];
            } catch (Exception $error) {
                throw masterStructureFailure(preg_match('/SMT|XRAY|ICT/i', $processClean) ? 'read_structure' : 'read_unit', $requestedUnit, $fis, $error, array());
            }

            $mysqli = getDbConnection();
            $stmtCheck = $mysqli->prepare("SELECT unit, process, status, maxCounter, errorMaxCounter, isactive, FIS FROM masterUnits WHERE unit = ? LIMIT 1");
            $stmtCheck->bind_param('s', $unit);
            $stmtCheck->execute();
            $existing = stmtFetchAssoc($stmtCheck);
            $stmtCheck->close();

            if ($sourceStructure !== null) {
                if (!$existing || $existing['FIS'] !== Lib::GetArrayString($input, 'sourceFis') || $existing['FIS'] === $fis) {
                    sendJsonResponse(false, 'Brak mastera na wskazanym źródłowym FIS.', null, 409);
                }
                try {
                    $structure = masterImportStructure($structure, $sourceStructure, $processClean);
                } catch (Exception $error) {
                    throw masterStructureFailure(preg_match('/SMT|XRAY|ICT/i', $processClean) ? 'read_structure' : 'read_unit', $unit, $fis, $error, array());
                }
            }
            try {
                masterCheckChildRecords($structure, $mysqli);
            } catch (Exception $error) {
                throw masterStructureFailure('master_conflict', $unit, $fis, $error, array());
            }
            $structure['requestedUnit'] = $requestedUnit;
            $structureData = array('requestedUnit' => $requestedUnit, 'unit' => $unit,
                'children' => $structure['children'], 'structure' => $structure);

            if ($existing && !$forceUpdate) {
                $mysqli->close();
                Lib::ShowDebug(FILENAME, "[CreateMaster] Unit '$unit' already exists in database. Returning conflict comparison.");
                sendJsonResponse(true, 'Master o tym numerze już istnieje w bazie', array(
                    'requestedUnit' => $requestedUnit, 'unit' => $unit, 'children' => $structure['children'],
                'exists' => true,
                    'oldData' => $existing,
                    'newData' => array(
                        'unit' => $unit,
                        'process' => $processClean,
                        'status' => $status,
                        'maxCounter' => $maxCounter,
                        'errorMaxCounter' => $maxErrors,
                        'FIS' => $fis,
                        'userKey2' => $userKey2
                    )
                ));
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
                dbBegin($mysqli);
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
                sendJsonResponse(true, $actionMsg, array_merge($structureData, array('operation' => $operation, 'FIS' => $fis, 'completed' => $completed)));
            } catch (Exception $err) {
                dbRollback($mysqli);
                $mysqli->close();
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
                    array(
                        'fis' => $fis,
                        'stage' => 'database_save', 'unit' => $unit, 'children' => $structure['children'], 'completed' => $completed,
                        'fis_updated' => true,
                        'database_updated' => false
                    ),
                    $err
                );
            }
            break;

        case 'DeleteMaster':
            $user = requireWriteAccess();
            $unit = Lib::GetArrayString($input, 'unit');
            $fis = Lib::GetArrayString($input, 'fis');

            $required_fields = compact('unit', 'fis');
            foreach ($required_fields as $field => $value) {
                if ($value === null) {
                    throw new InvalidArgumentException("$field is required");
                }
            }

            $fisOnly = Lib::GetArrayBool($input, 'fisOnly') === true;
            if (!in_array($fis, array('FIS1', 'FIS2'), true)) {
                sendJsonResponse(false, 'Nieprawidłowy serwer FIS. Dozwolone wartości: FIS1, FIS2.', null, 400);
            }
            $fisOnlyFlag = $fisOnly ? '1' : '0';
            Lib::ShowDebug(FILENAME, "[DeleteMaster] Start unit='$unit', requestedFis='$fis', fisOnly=$fisOnlyFlag, user='$user'");
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
            if (!$fisOnly && $storedFis !== null && $fis !== $storedFis) {
                $mysqli->close();
                Lib::ShowError(FILENAME, "[DeleteMaster] FIS mismatch for unit '$unit': expected '$storedFis', got '$fis'");
                sendJsonResponse(
                    false,
                    "Master '$unit' należy do $storedFis, a żądanie usunięcia wysłano dla $fis.",
                    array('expected_fis' => $storedFis),
                    409
                );
            }

            $serverFis = getServerFis();
            $targetHostFis = $fisOnly ? $fis : ($storedFis ? $storedFis : $fis);
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

            try {
                dbBegin($mysqli);
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
    if ($e instanceof InvalidArgumentException) {
        sendJsonResponse(false, 'Nieprawidłowy format danych wejściowych: ' . $e->getMessage(), null, 400);
    }
    sendJsonResponse(false, 'Wewnętrzny błąd serwera: ' . $e->getMessage(), null, 500);
}
