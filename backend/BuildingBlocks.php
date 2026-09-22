<?php /** @noinspection SqlNoDataSourceInspection */

declare(strict_types=1);

namespace BuildingBlocks;

use Exception;
use InvalidArgumentException;
use JsonException;
use mysqli;
use mysqli_sql_exception;
use RuntimeException;

const DB_HOST = "localhost";
const DB_USER = "fiswww";
const DB_PASSWORD = null;

date_default_timezone_set('Europe/Warsaw');

class Archive
{
    /** Path to the FIS configuration file. */
    private static string $configPath = '/fis/mantis/custom/database/config.ini';

    /** @var array<string, mixed>|null */
    private static ?array $configCache = null;

    /**
     * Read all archive information for a unit.
     *
     * Tries MDB first; on "No Such Unit" falls back to the Long Term Archives and
     * then to the Converted Archives.
     *
     * @param string $unit Unit; may carry a ">>>>N" generation suffix
     * @param string $archFile [optional] Specific archive file to read from
     * @param int $allowUnar [optional] 1 = allow an already unarchived unit
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: array{
     *     unit: string,
     *     status: string,
     *     part: string,
     *     uk1: string,
     *     uk2: string,
     *     uk3: string,
     *     gen: string,
     *     events: string[],
     *     children: string[],
     *     childrengens: string[],
     *     parent: string,
     *     parentgen: string,
     *   }
     * }
     *
     * <code>
     * $r = Archive::GetAll('ABC123');
     * echo $r['reply']['part'];
     * </code>
     *
     * @throws InvalidArgumentException When the unit is blank
     * @throws RuntimeException When the unit is in neither MDB nor any archive,
     *                          or when an archive could not be searched
     */
    public static function GetAll(string $unit, string $archFile = "", int $allowUnar = 0): array
    {
        $unit = str_replace(["\r", "\n"], '', $unit);
        $unit = strtr($unit, ['?' => '-', '*' => '-']);
        $archFile = strtr($archFile, ['?' => '-', '*' => '-']);

        $unit = strtoupper($unit);

        if ($unit === '') {
            throw new InvalidArgumentException("Unit cannot be blank!");
        }

        $bitInfo = 0;
        if (str_contains((string)$allowUnar, '1')) {
            $bitInfo |= 1;
        }

        $query = "archrptdlm|" . $bitInfo . "|" . strlen($unit) . "|1|" . $unit;

        if ($archFile !== '') {
            $query .= "|" . strlen($archFile) . "|1|" . $archFile;
        }

        $dlmRawRpt = (string)Lib::sendToMDB($query);

        $reply = explode("\n", $dlmRawRpt);
        $header = explode("|", $reply[0] ?? '');

        $successFlag = isset($header[1]) ? trim($header[1]) : '';

        $recordLines = array_slice($reply, 1);
        $message = "OK";

        if ($successFlag !== '1') {
            $error = isset($header[2]) ? trim($header[2]) : '';

            $isNoSuchUnit = str_starts_with($error, 'No Such Unit');
            $isNotFoundInArchives = stripos($dlmRawRpt, 'not found in the archives') !== false;

            if (!$isNoSuchUnit && !$isNotFoundInArchives) {
                throw new RuntimeException(
                    ($error !== '' ? $error : "Unit is unarchived") . " (report: " . trim($dlmRawRpt) . ")"
                );
            }

            try {
                $lta = self::SearchUnitInLongTermArchives($unit, 0, 0, $archFile);

                $recordLines = array_slice($lta['reply'], 1);
                $message = "OK (LTA)";
            } catch (RuntimeException $ltaError) {
                if (!self::IsMissFromArchive($ltaError->getMessage())) {
                    throw new RuntimeException(
                        "Failed searching long term archives: '" . $ltaError->getMessage() . "'",
                        (int)$ltaError->getCode(),
                        $ltaError
                    );
                }

                try {
                    $conv = self::SearchUnitInConvertedArchives($unit, 0, 0, $archFile);

                    $recordLines = array_slice($conv['reply'], 1);
                    $message = "OK (Converted)";
                } catch (RuntimeException $convError) {
                    if (!self::IsMissFromArchive($convError->getMessage())) {
                        throw new RuntimeException(
                            "Failed searching converted archives: '" . $convError->getMessage() . "'",
                            (int)$convError->getCode(),
                            $convError
                        );
                    }

                    throw new RuntimeException("No Such Unit: " . $unit, 0, $convError);
                }
            }
        }

        return [
            "unit"    => $unit,
            "status"  => true,
            "message" => $message,
            "reply"   => array_merge(["unit" => $unit], self::ParseArchiveLines($recordLines)),
        ];
    }

    /**
     * Search for a unit in the Long-Term Archives (MySQL).
     *
     * @param string $unit
     * @param int $getGenInfo [optional] 1 = return generation info lines
     * @param int $getArchFile [optional] 1 = return only the .far file path
     * @param string $searchArchFile [optional] Restrict to one archive file
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: string|string[],
     * }
     *
     * reply is the .far path when $getArchFile is 1, the generation-info lines when
     * $getGenInfo is 1, and otherwise the raw record lines read from the .far file
     * (the first of which is the "AR|..." header). The part/uk1/events structure is
     * built by GetAll(), not here.
     *
     * <code>
     * $r = Archive::SearchUnitInLongTermArchives('ABC123', 1);
     * foreach ($r['reply'] as $line) { echo $line, PHP_EOL; }
     * </code>
     *
     * @throws RuntimeException When the unit is absent ("No Such Unit ..."), the
     *                          archive is not configured, or the database or .far
     *                          file could not be read
     */
    public static function SearchUnitInLongTermArchives(string $unit, int $getGenInfo = 0, int $getArchFile = 0, string $searchArchFile = ""): array
    {
        $config = self::LoadConfig();

        $dbName = $config['LONGTERMARCHIVE']['db_name'] ?? '';
        $db_host = $config['LONGTERMARCHIVE']['host'] ?? '';
        $db_username = $config['LONGTERMARCHIVE']['user'] ?? '';
        $db_password = $config['LONGTERMARCHIVE']['password'] ?? '';

        if (trim((string)$dbName) === '') {
            throw new RuntimeException("MySQL::Connect error: LONG_TERM_DB_NAME not configured");
        }

        $db = @new \mysqli($db_host, $db_username, $db_password);
        if ($db->connect_errno) {
            throw new RuntimeException("MySQL::Connect error: " . $db->connect_error);
        }

        if (!@mysqli_set_charset($db, 'utf8')) {
            $err = $db->error;
            $db->close();

            throw new RuntimeException("MySQL::Connect error: set_charset failed: " . $err);
        }

        $unitRaw = $unit;
        $agenClause = "";

        $m = [];
        if (preg_match('/^(.*)>>>>(\d+)$/', $unitRaw, $m)) {
            $unitRaw = $m[1];
            $agenClause = " AND AGeneration = '" . $db->real_escape_string($m[2]) . "' ";
        }

        $m2 = [];
        if (preg_match('/^\{(.*)}$/', $unitRaw, $m2)) {
            $unitRaw = $m2[1];
        }

        $unitEsc = $db->real_escape_string($unitRaw);
        $fileEsc = $searchArchFile !== '' ? $db->real_escape_string($searchArchFile) : '';

        $selectCols = "AGeneration,AUGEvent,AUGEventType,AUGCreateDate,ArchiveFile,ArchiveOffset";
        $fromTable = $dbName . ".arch_events";

        $where = "AUnit = '" . $unitEsc . "'";
        if ($fileEsc !== '') {
            $where .= " AND ArchiveFile = '" . $fileEsc . "'";
        }
        $where .= $agenClause;

        $sql = "SELECT " . $selectCols
            . " FROM " . $fromTable
            . " WHERE " . $where
            . " ORDER BY AUGEvent DESC";

        if ($getArchFile === 1) {
            $sql .= " LIMIT 1";
        }

        $res = $db->query($sql);
        if (!$res) {
            $error = $db->error;
            $db->close();

            throw new RuntimeException("MySQL::Query error: " . $error);
        }

        $reply = [];

        while ($row = $res->fetch_row()) {
            [$AGeneration, $AUGEventRaw, $AUGEventType, $AUGCreateRaw, $ArchiveFile, $ArchiveOffset] = $row;

            $AUGEvent = self::FormatArchiveTimestamp($AUGEventRaw);
            $AUGCreateDate = self::FormatArchiveTimestamp(self::FirstWord($AUGCreateRaw));

            if ($getArchFile === 1) {
                $res->free();
                $db->close();

                return [
                    "unit"    => $unit,
                    "status"  => true,
                    "message" => "OK",
                    "reply"   => $ArchiveFile,
                ];
            }

            $archType = (string)$AUGEventType === "2" ? "UNARCHIVED" : "ARCHIVED";

            if ($getGenInfo === 1) {
                $reply[] = $AGeneration . '|' . $AUGCreateDate . '|' . $archType . '|'
                    . $AUGEvent . '|' . $ArchiveFile . '|' . $ArchiveOffset;
                continue;
            }

            $res->free();
            $db->close();

            return [
                "unit"    => $unit,
                "status"  => true,
                "message" => "OK",
                "reply"   => self::ReadFarFile((string)$ArchiveFile, (int)$ArchiveOffset),
            ];
        }

        $res->free();
        $db->close();

        if ($getGenInfo === 1 && !empty($reply)) {
            return [
                "unit"    => $unit,
                "status"  => true,
                "message" => "OK",
                "reply"   => $reply,
            ];
        }

        throw new RuntimeException("No Such Unit: " . $unit);
    }

    /**
     * Search for a unit in the Converted Archives (.HNT/.HNT2 + .far).
     *
     * @param string $unit
     * @param int $getGenInfo [optional]
     * @param int $getArchFile [optional]
     * @param string $searchArchFile [optional]
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: string|string[],
     * }
     *
     * reply is the .far path when $getArchFile is 1, the generation-info lines when
     * $getGenInfo is 1, and otherwise the raw record lines read from the .far file
     * (the first of which is the "CA|..." header). The part/uk1/events structure is
     * built by GetAll(), not here.
     *
     * <code>
     * $r = Archive::SearchUnitInConvertedArchives('ABC123', 0, 1);
     * echo $r['reply'];
     * </code>
     *
     * @throws RuntimeException When the unit is absent ("No Such Unit ..."), the
     *                          archives are not configured, or a hint or .far file
     *                          could not be parsed or read
     */
    public static function SearchUnitInConvertedArchives(string $unit, int $getGenInfo = 0, int $getArchFile = 0, string $searchArchFile = ""): array
    {
        $config = self::LoadConfig();

        $convarchfiles = (string)($config['CONVARCHFILES'] ?? '');
        $yearsBackRaw = (string)($config['CONVARCHFILES_YEARS_BACK'] ?? '');

        if ($convarchfiles === '' || $yearsBackRaw === '') {
            throw new RuntimeException("ConvertedArchives not configured");
        }

        $m2 = [];
        if (preg_match('/^\{(.*)}$/', $unit, $m2)) {
            $unit = $m2[1];
        }

        $m = [];
        if (preg_match('/^(.*)>>>>(\d+)$/', $unit, $m)) {
            $unit = $m[1];
        }

        $unit2 = strtr($unit, [' ' => '.', ';' => '.', "\t" => '.']);

        $unitPattern = self::QuoteBre($unit);
        $unit2Pattern = self::QuoteBreKeepDot($unit2);

        $convertedPath = rtrim($convarchfiles, '/');

        if ($searchArchFile !== '') {
            $hintFile2 = substr($searchArchFile, 0, -3) . 'HNT2';

            if (!is_file($hintFile2)) {
                throw new RuntimeException("No Such Unit: " . $unit);
            }

            $cmd = 'grep ' . escapeshellarg("^" . $unit2Pattern . "|") . ' '
                . escapeshellarg($hintFile2) . ' 2>/dev/null';
            $out = @shell_exec($cmd);

            if ($out === null || trim($out) === '') {
                throw new RuntimeException("No Such Unit: " . $unit);
            }

            $result = '';
            foreach (preg_split('/\r?\n/', trim($out)) as $line) {
                $mm = [];
                $unitInfo = preg_match('/^(.*)\.HNT2:(.*)$/', $line, $mm) ? $mm[2] : $line;

                $firstField = explode('|', $unitInfo);
                if (($firstField[0] ?? null) === $unit) {
                    $result = $unitInfo;
                    break;
                }
            }

            if ($result === '') {
                throw new RuntimeException("No Such Unit: " . $unit);
            }

            $splResult = explode('|', $result);
            if (count($splResult) < 5) {
                throw new RuntimeException("Parse error in " . $hintFile2 . ": " . $result);
            }

            $archiveOffset = (int)$splResult[2];
            $bytes2read = (int)$splResult[3];
            $createDate = $splResult[4];
            $archiveName = $searchArchFile;
            $archiveTS = self::ArchiveTimestampFromName($hintFile2);

            if ($getArchFile === 1) {
                return ["unit" => $unit, "status" => true, "message" => "OK", "reply" => $archiveName];
            }

            if ($getGenInfo === 1) {
                return [
                    "unit"    => $unit,
                    "status"  => true,
                    "message" => "OK",
                    "reply"   => ["1|" . $createDate . "|ARCHIVED|" . $archiveTS . "|"
                        . $archiveName . "|" . $archiveOffset],
                ];
            }

            return [
                "unit"    => $unit,
                "status"  => true,
                "message" => "OK",
                "reply"   => self::ReadCAFarFile($archiveOffset, $archiveName, $bytes2read),
            ];
        }

        $thisYear = (int)date('Y');

        $yearsBack = (int)$yearsBackRaw;
        $untilYear = $yearsBack > 1900 ? $yearsBack : $thisYear - max(0, $yearsBack);

        $reply = [];

        for ($yearworking = $thisYear; $yearworking >= $untilYear; $yearworking--) {
            $pattern = $convertedPath . '/' . $yearworking . '/*.HNT';
            $candidates = glob($pattern);

            if (!$candidates) {
                continue;
            }

            $args = array_map('escapeshellarg', $candidates);
            $cmd = 'grep -H ' . escapeshellarg("^" . $unit2Pattern . "$") . ' '
                . implode(' ', $args) . ' 2>/dev/null';
            $out = @shell_exec($cmd);

            if ($out === null || trim($out) === '') {
                continue;
            }

            $unsortedHintFiles = [];
            foreach (preg_split('/\r?\n/', trim($out)) as $line) {
                $mm = [];
                if (preg_match('/^(.*)\.HNT:(.*)$/', $line, $mm) && trim($mm[2]) === $unit) {
                    $unsortedHintFiles[] = $mm[1] . '.HNT';
                }
            }

            if (empty($unsortedHintFiles)) {
                continue;
            }

            $sortedHintFiles = array_values(array_unique($unsortedHintFiles));
            rsort($sortedHintFiles, SORT_NATURAL | SORT_FLAG_CASE);

            foreach ($sortedHintFiles as $hintFile) {
                $cmdHnt = 'grep ' . escapeshellarg("^" . $unitPattern . "$") . ' '
                    . escapeshellarg($hintFile) . ' 2>/dev/null';
                $outHnt = @shell_exec($cmdHnt);

                if ($outHnt === null || trim($outHnt) === '') {
                    continue;
                }

                $hintFile2 = $hintFile . '2';

                $cmd2 = 'grep ' . escapeshellarg("^" . $unitPattern . "|") . ' '
                    . escapeshellarg($hintFile2) . ' 2>/dev/null';
                $out2 = @shell_exec($cmd2);

                if ($out2 === null || trim($out2) === '') {
                    continue;
                }

                $lines2 = preg_split('/\r?\n/', trim($out2));
                $result = trim($lines2[0] ?? '');

                if ($result === '') {
                    continue;
                }

                $splResult = explode('|', $result);
                if (count($splResult) < 5) {
                    continue;
                }

                $archiveOffset = (int)$splResult[2];
                $bytes2read = (int)$splResult[3];
                $createDate = $splResult[4];

                $archiveName = self::ConvertedArchiveName($hintFile);
                $archiveTS = self::ArchiveTimestampFromName($hintFile);

                if ($getArchFile === 1) {
                    return ["unit" => $unit, "status" => true, "message" => "OK", "reply" => $archiveName];
                }

                if ($getGenInfo === 1) {
                    $reply[] = "1|" . $createDate . "|ARCHIVED|" . $archiveTS . "|"
                        . $archiveName . "|" . $archiveOffset;
                    continue;
                }

                return [
                    "unit"    => $unit,
                    "status"  => true,
                    "message" => "OK",
                    "reply"   => self::ReadCAFarFile($archiveOffset, $archiveName, $bytes2read),
                ];
            }
        }

        if ($getGenInfo === 1 && !empty($reply)) {
            return ["unit" => $unit, "status" => true, "message" => "OK", "reply" => $reply];
        }

        throw new RuntimeException("No Such Unit: " . $unit);
    }

    /**
     * Unarchive a single unit (wrapper over UnarchiveConfigured).
     *
     * @param string $unit
     * @param int $bitMask [optional]
     * @param string $archiveFile [optional]
     * @param int $ignoreLocks [optional]
     * @param int $allowIntercept [optional] Accepted for compatibility; not used.
     * @return array{
     *   unit: string[],
     *   status: bool,
     *   message: string,
     *   reply: string[],
     * }
     *
     * <code>
     * $r = Archive::Unarchive('ABC123');
     * </code>
     *
     * @throws InvalidArgumentException
     * @throws RuntimeException
     */
    public static function Unarchive(string $unit, int $bitMask = 0, string $archiveFile = "", int $ignoreLocks = 0, int $allowIntercept = 0): array
    {
        $unit = Lib::replaceCharsInUnit($unit);

        return self::UnarchiveConfigured([$unit], $bitMask, $archiveFile, $ignoreLocks, $allowIntercept);
    }

    /**
     * Unarchive multiple units with configuration options.
     *
     * Tries MDB; if needed, looks up LTA/Converted archives and retries with an extra bit.
     *
     * @param string[] $units
     * @param int $bitMask [optional]
     * @param string $archiveFile [optional]
     * @param int $ignoreLocks [optional]
     * @param int $allowIntercept [optional] Accepted for compatibility; not used.
     * @return array{
     *   unit: string[],
     *   status: bool,
     *   message: string,
     *   reply: string[],
     * }
     *
     * <code>
     * $r = Archive::UnarchiveConfigured(['U1','U2'], 0, '/path/file.far');
     * </code>
     *
     * @throws InvalidArgumentException When no units are given
     * @throws RuntimeException When the archive file is missing, no archive holds any
     *                          of the units, or the retry still fails
     */
    public static function UnarchiveConfigured(array $units, int $bitMask = 0, string $archiveFile = "", int $ignoreLocks = 0, int $allowIntercept = 0): array
    {
        if (empty($units)) {
            throw new InvalidArgumentException("No units provided");
        }

        if (!empty($archiveFile) && !file_exists($archiveFile)) {
            throw new InvalidArgumentException("Archive file not found: " . $archiveFile);
        }

        $units = array_map('strtoupper', $units);
        $StrList = Convert::StrList($units);

        $query = "archread|$bitMask|$archiveFile|$StrList|$ignoreLocks";
        $unarchRawRpt = (string)Lib::sendToMDB($query);

        $reply = preg_split('/\r?\n/', trim($unarchRawRpt));
        $header = explode("|", $reply[0] ?? "");

        if (!isset($header[1]) || (int)$header[1] !== 1) {
            $error = isset($header[2]) ? trim($header[2]) : 'Unknown error';

            foreach (array_slice($reply, 1) as $line) {
                $matches = [];
                if (preg_match('/ERR:(.*)$/', $line, $matches)) {
                    $error .= " (" . $matches[1] . ")";
                }
            }

            $foundSomeArchive = false;
            $lookupNotes = [];
            $lookupFailures = [];

            foreach ($units as $u) {
                try {
                    $lta = self::SearchUnitInLongTermArchives($u, 0, 1, $archiveFile);

                    if (!empty($lta['reply'])) {
                        $foundSomeArchive = true;
                        $archiveFile = $lta['reply'];
                        break;
                    }

                    $lookupNotes[] = "LTA($u): empty reply";
                } catch (RuntimeException $e) {
                    $lookupNotes[] = "LTA($u): " . $e->getMessage();

                    if (!self::IsMissFromArchive($e->getMessage())) {
                        $lookupFailures[] = "long term archives ($u): " . $e->getMessage();
                    }
                }

                try {
                    $conv = self::SearchUnitInConvertedArchives($u, 0, 1, $archiveFile);

                    if (!empty($conv['reply'])) {
                        $foundSomeArchive = true;
                        $archiveFile = $conv['reply'];
                        break;
                    }

                    $lookupNotes[] = "Converted($u): empty reply";
                } catch (RuntimeException $e) {
                    $lookupNotes[] = "Converted($u): " . $e->getMessage();

                    if (!self::IsMissFromArchive($e->getMessage())) {
                        $lookupFailures[] = "converted archives ($u): " . $e->getMessage();
                    }
                }
            }

            if (!$foundSomeArchive) {
                if (!empty($lookupFailures)) {
                    throw new RuntimeException("Archive lookup failed: " . implode('; ', $lookupFailures));
                }

                $message = $error;
                if (!empty($lookupNotes)) {
                    $message .= " [" . implode('; ', $lookupNotes) . "]";
                }

                throw new RuntimeException($message);
            }

            $bitMask |= 8;
            $query = "archread|$bitMask|$archiveFile|$StrList|$ignoreLocks";
            $unarchRawRpt = (string)Lib::sendToMDB($query);

            $reply = preg_split('/\r?\n/', trim($unarchRawRpt));
            $header = explode("|", $reply[0] ?? "");

            if (!isset($header[1]) || (int)$header[1] !== 1) {
                $err = $header[2] ?? "Unknown error";

                $m = [];
                if (preg_match('/ERR:(.*)$/', $unarchRawRpt, $m)) {
                    $err .= " (" . $m[1] . ")";
                }

                throw new RuntimeException("Retry failed: " . $err);
            }
        }

        return [
            "unit"    => $units,
            "status"  => true,
            "message" => "OK",
            "reply"   => $reply,
        ];
    }

    /**
     * Parse MDB/archive record lines into the common unit reply structure.
     *
     * @param string[] $lines Record lines, without the leading header line
     * @return array{
     *   status: string,
     *   part: string,
     *   uk1: string,
     *   uk2: string,
     *   uk3: string,
     *   gen: string,
     *   events: string[],
     *   children: string[],
     *   childrengens: string[],
     *   parent: string,
     *   parentgen: string,
     * }
     */
    private static function ParseArchiveLines(array $lines): array
    {
        $eventdata = '';
        $events = [];
        $children = [];
        $childrenGens = [];
        $status = '';
        $part = '';
        $uk1 = '';
        $uk2 = '';
        $uk3 = '';
        $gen = '';
        $parent = '';
        $parentGen = '';

        foreach ($lines as $line) {
            $data = explode("|", (string)$line);

            switch ($data[0]) {
                case "Unit":
                    $data = array_pad($data, 8, '');
                    [, , $part, $uk1, $uk2, $uk3, , $gen] = $data;
                    break;

                case "EVENT":
                    if ($eventdata !== '') {
                        $events[] = $eventdata;
                    }
                    $eventdata = implode("|", array_slice($data, 1));
                    $status = $data[6] ?? '';
                    break;

                case "DC":
                    $data = array_pad($data, 5, '');
                    [, , $dc, $dcmod, $value] = $data;

                    if (trim((string)$dcmod) === '') {
                        $eventdata .= "|" . $dc . "=" . $value;
                    } else {
                        $eventdata .= "|" . $dc . "=" . $dcmod;
                    }
                    break;

                case "UWin":
                    $data = array_pad($data, 3, '');
                    [, $parent, $parentGen] = $data;
                    break;

                case "UBuiltFrom":
                    $data = array_pad($data, 3, '');
                    $children[] = $data[1];
                    $childrenGens[] = $data[2];
                    break;
            }
        }

        if ($eventdata !== '') {
            $events[] = $eventdata;
        }

        return [
            "status"       => $status,
            "part"         => $part,
            "uk1"          => $uk1,
            "uk2"          => $uk2,
            "uk3"          => $uk3,
            "gen"          => $gen,
            "events"       => $events,
            "children"     => $children,
            "childrengens" => $childrenGens,
            "parent"       => $parent,
            "parentgen"    => $parentGen,
        ];
    }

    /**
     * Czyta fragment z pliku .far wg offsetu i dlugosci.
     * Zwraca tablice linii: ["CA|<file>|<offset>|<len>", "<linia1>", ...]
     *
     * @param int $offset
     * @param string $arcfilename
     * @param int $numToRead
     * @return string[]
     *
     * @throws RuntimeException When the byte count is not positive or the file
     *                          cannot be opened, seeked or read
     */
    private static function ReadCAFarFile(int $offset, string $arcfilename, int $numToRead): array
    {
        if ($numToRead <= 0) {
            throw new RuntimeException(
                "ReadCAFarFile failed: invalid byte count " . $numToRead . " for archive '" . $arcfilename . "'"
            );
        }

        $reply = [];
        $reply[] = "CA|" . $arcfilename . "|" . $offset . "|" . $numToRead;

        $fp = @fopen($arcfilename, 'rb');
        if ($fp === false) {
            throw new RuntimeException("ReadCAFarFile failed: cannot open archive '" . $arcfilename . "'");
        }

        if (@fseek($fp, $offset, SEEK_SET) !== 0) {
            @fclose($fp);

            throw new RuntimeException(
                "ReadCAFarFile failed: cannot seek to offset " . $offset . " in '" . $arcfilename . "'"
            );
        }

        $chunk = @fread($fp, $numToRead);
        @fclose($fp);

        if ($chunk === false) {
            throw new RuntimeException("ReadCAFarFile failed: cannot read from '" . $arcfilename . "'");
        }

        if ($chunk !== '') {
            foreach (preg_split('/\r?\n/', $chunk) as $line) {
                $reply[] = $line;
            }
        }

        return $reply;
    }

    /**
     * Czyta rekord z pliku .far od podanego offsetu do linii zaczynajacej sie od "O".
     *
     * @param string $archiveFile
     * @param int $archiveOffset
     * @return string[]
     *
     * @throws RuntimeException When the file cannot be opened or seeked
     */
    private static function ReadFarFile(string $archiveFile, int $archiveOffset): array
    {
        $reply = [];
        $reply[] = "AR|" . $archiveFile . "|" . $archiveOffset . "|0";

        $fp = @fopen($archiveFile, 'rb');
        if ($fp === false) {
            throw new RuntimeException(
                "ReadFarFile failed: cannot open archive '" . $archiveFile . "' at offset " . $archiveOffset
            );
        }

        if (@fseek($fp, $archiveOffset, SEEK_SET) !== 0) {
            @fclose($fp);

            throw new RuntimeException(
                "ReadFarFile failed: cannot seek to offset " . $archiveOffset . " in '" . $archiveFile . "'"
            );
        }

        while (($line = fgets($fp)) !== false) {
            $line = rtrim($line, "\r\n");

            if (str_starts_with($line, 'O')) {
                break;
            }

            $reply[] = $line;
        }

        @fclose($fp);

        return $reply;
    }

    private static function LoadConfig(): array
    {
        if (self::$configCache === null) {
            $parsed = @parse_ini_file(self::$configPath, true);

            if ($parsed === false) {
                throw new RuntimeException("Could not read " . self::$configPath);
            }

            self::$configCache = $parsed;
        }

        return self::$configCache;
    }

    private static function FormatArchiveTimestamp(mixed $value): string
    {
        $value = (string)$value;

        if ($value === '') {
            return '';
        }

        $ts = is_numeric($value) ? (int)$value : @strtotime($value);

        return $ts ? date('ymd.His', $ts) : $value;
    }

    private static function FirstWord(mixed $value): string
    {
        $parts = preg_split('/\s+/', trim((string)$value));

        return $parts[0] ?? '';
    }

    private static function ArchiveTimestampFromName(string $hintFile): string
    {
        $base = basename($hintFile);

        if (strlen($base) < 14) {
            return '';
        }

        return substr($base, 2, 6) . '.' . substr($base, 8, 6);
    }

    private static function ConvertedArchiveName(string $hintFile): string
    {
        return explode('.', $hintFile)[0] . '.far';
    }

    private static function IsMissFromArchive(string $message): bool
    {
        return str_starts_with($message, 'No Such Unit')
            || stripos($message, 'not configured') !== false;
    }

    private static function QuoteBre(string $value): string
    {
        return preg_replace('/([.\[\]*^$\\\\])/', '\\\\$1', $value);
    }

    private static function QuoteBreKeepDot(string $value): string
    {
        return preg_replace('/([\[\]*^$\\\\])/', '\\\\$1', $value);
    }
}

class Convert
{
    /**
     * Format zgodny z Tclem:
     *   pusta lista     -> "0|0"
     *   jeden element X -> "len(X)|1|X"
     *   wiele elementow -> "len_total|count|x1|x2|..."
     *
     * @param array|string|null $items
     * @return string
     */
    public static function StrList(array|string|null $items): string
    {
        if (!is_array($items)) {
            if ($items === "" || $items === null) {
                $items = [];
            } else {
                $items = [$items];
            }
        }

        if (count($items) === 0) {
            return "0|0";
        }

        $totalLen = 0;
        foreach ($items as $it) {
            $totalLen += strlen((string)$it);
        }

        return $totalLen . "|" . count($items) . "|" . implode("|", $items);
    }
}

class UserKey
{
    /**
     * Get UserKey list(s) from MDB.
     *
     * @param null|int|string|array $key null - [1,2,3]; int or int[] to pick specific keys
     * @return array{
     *   status: bool,
     *   message: string,
     *   reply: array<int, array{
     *     key: string,
     *     description: string,
     *   }>
     * }
     *
     * <code>
     * $r = UserKey::GetList(2);
     * print_r($r['reply'][2]['key']);
     * </code>
     *
     * @throws RuntimeException When MDB rejects the query or no keys were returned
     */
    public static function GetList(int|string|array|null $key = null): array
    {
        $reply = [];

        if ($key === null || $key === "") {
            $seeklist = ["1", "2", "3"];
        } else {
            $seeklist = is_array($key) ? $key : [$key];
        }

        foreach ($seeklist as $k) {
            $query = "getkeylist|UserKey{$k}|3";
            $resp = Lib::SendQueryToMDB($query);

            if (empty($resp['status'])) {
                throw new RuntimeException(
                    "UserKey::GetList: " . ($resp['message'] ?? 'MDB query failed for UserKey' . $k)
                );
            }

            $rows = array_slice($resp['reply'], 4);
            foreach ($rows as $item) {
                $m = [];
                if (preg_match('/^(\S+)\s*(.*)$/u', $item, $m)) {
                    $reply[] = [
                        "key"         => $m[1],
                        "description" => $m[2],
                    ];
                }
            }
        }

        if (count($reply) === 0) {
            throw new RuntimeException("UserKey list is empty.");
        }

        return [
            "status"  => true,
            "message" => "Successfully got UserKey's lists",
            "reply"   => $reply,
        ];
    }
}


class Unit
{
    /** @var array<string, array{unitLength: int, replaceString: string, startPos: int}>|null Cached UnitRules.php contents */
    private static ?array $unitRules = null;

    /**
     * Aggregate full unit info: status, events, children, parent and next-process info (if not GOLDEN).
     *
     * @param string $unit
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: array{
     *     unit: string,
     *     status: array{
     *       unit: string,
     *       status: string,
     *       part: string,
     *       uk1: string,
     *       uk2: string,
     *       uk3: string,
     *       generation: string,
     *     },
     *     events: string[],
     *     childrens: null|string[],
     *     parent: null|string,
     *     nextprocess?: array{
     *       nextprocess: string,
     *       routestatus: int,
     *     }|string,
     *     nextprocesslist?: array{
     *       RouteStatus?: string,
     *       NextProcessList?: string[],
     *     },
     *     nextprocesslist?: string
     *   }
     * }
     *
     * <code>
     * $r = Unit::GetAll('ABC123');
     * </code>
     * @throws Exception
     */
    public static function GetAll(string $unit): array
    {
        $resp = self::GetStatus($unit);
        $Unit_status = $resp['reply'];

        $Event_resp = self::GetEvents($unit);
        $Events = $Event_resp['reply'];

        try {
            $Children_resp = self::GetChildren($unit);
            $Childrens = $Children_resp['reply'];
        } catch (Exception) {
            $Childrens = null;
        }

        try {
            $Parent_resp = self::GetParent($unit);
            $Parent = $Parent_resp['reply'];
        } catch (Exception) {
            $Parent = null;
        }

        if (str_contains($Unit_status['part'], "GOLD")) {
            return [
                "unit" => $unit,
                "status" => true,
                "message" => "Successfully got Unit's information",
                "reply" => [
                    "unit" => $unit,
                    "status" => $Unit_status,
                    "events" => $Events,
                    "childrens" => $Childrens,
                    "parent" => $Parent,
                    "nextprocess" => "GOLDEN",
                    "routestatus" => 1,
                    "nextprocesslist" => "GOLDEN_ROUTE_PROCESSES",
                    "plroutestatusstr" => "ONROUTE",
                    "plroutestatus" => 1,
                ]
            ];
        }

        $NextProcess_resp = self::GetNextProcess($unit);
        $NextProcess = $NextProcess_resp['reply'];

        $NextProcessList_resp = self::GetProcessList($unit);
        $NextProcessList = $NextProcessList_resp['reply'];

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Successfully got Unit's information",
            "reply" => [
                "unit" => $unit,
                "status" => $Unit_status,
                "events" => $Events,
                "childrens" => $Childrens,
                "parent" => $Parent,
                "nextprocess" => $NextProcess,
                "nextprocesslist" => $NextProcessList,
            ]
        ];
    }

    /**
     * Get current unit status/basic data (MDB getunit).
     *
     * @param string $unit
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: array{
     *     unit: string,
     *     status: string,
     *     part: string,
     *     uk1: string,
     *     uk2: string,
     *     uk3: string,
     *     generation: string,
     *   }
     * }
     *
     * <code>
     * $r = Unit::GetStatus('ABC123');
     * </code>
     * @throws Exception
     */
    public static function GetStatus(string $unit): array
    {
        $unit = Lib::replaceCharsInUnit($unit);
        try {
            self::Find($unit);
        } catch (Exception $e) {
            throw new RuntimeException("Unit not found: " . $e->getMessage(), (int)$e->getCode(), $e);
        }

        $query = "getunit|$unit";
        $resp = Lib::SendQueryToMDB($query);

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Unit found",
            "reply" => [
                "unit" => $unit,
                "status" => Lib::mdbField($resp['reply'], 2, "getunit status for $unit"),
                "part" => Lib::mdbField($resp['reply'], 3, "getunit part for $unit"),
                "uk1" => Lib::mdbField($resp['reply'], 4, "getunit uk1 for $unit"),
                "uk2" => Lib::mdbField($resp['reply'], 5, "getunit uk2 for $unit"),
                "uk3" => Lib::mdbField($resp['reply'], 6, "getunit uk3 for $unit"),
                "generation" => Lib::mdbField($resp['reply'], 7, "getunit generation for $unit"),
            ]
        ];
    }

    /**
     * Search for a unit in the FIS.
     *
     * @param string $unit <p>
     * The unit identifier to look up.
     * </p>
     *
     * @return array <p><b>Example</b>:</p>
     * <code>
     * $result = Unit::Find("123456789");
     * if ($result['status']) {
     *     echo $result['message']; // Unit found
     * } else {
     *     echo $result['message']; // Unit not found
     * }
     * </code>
     * @throws Exception
     */
    public static function Find(string $unit): array
    {
        $unit = Lib::replaceCharsInUnit($unit);
        $query = "findkey|$unit|Unit|1";
        try {
            Lib::SendQueryToMDB($query);
        } catch (Exception $e) {
            throw new RuntimeException("Unit doesn't exist: " . $e->getMessage(), (int)$e->getCode(), $e);
        }

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Unit found",
            "reply" => null,
        ];
    }

    /**
     * Get unit events (tracker report), with an optional order flag.
     *
     * @param string $unit
     * @param int $order [optional]
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: string[],
     * }
     *
     * <code>
     * $r = Unit::GetEvents('ABC123');
     * </code>
     * @throws Exception
     */
    public static function GetEvents(string $unit, int $order = 0): array
    {
        $unit = Lib::replaceCharsInUnit($unit);
        self::Find($unit);

        $stringLength = strlen($unit);
        $query = "trkrptdlm|Unit|||||1|1|$order|1|$stringLength|1|$unit";

        $reply = Lib::sendAndValidate($query)['raw'];

        $lines = explode("\n", $reply);

        $event_data = "";
        $GetEvents_events = [];

        foreach ($lines as $item) {
            $splitItem = explode("|", $item);
            $key = $splitItem[0];

            switch ($key) {
                case "EVENT":
                    if ($event_data !== "") {
                        $GetEvents_events[] = $event_data;
                    }
                    $event_data = implode("|", array_slice($splitItem, 1));
                    break;
                case "DC":
                    $splitItem = array_pad($splitItem, 5, '');
                    [, , $dc, $dcmod, $value] = $splitItem;
                    $event_data .= "|" . trim((string)$dc) . "="
                        . (trim((string)$dcmod) === '' ? trim((string)$value) : trim((string)$dcmod));
                    break;
            }
        }

        if ($event_data !== "") {
            $GetEvents_events[] = $event_data;
        }

        if (count($GetEvents_events) === 0) {
            return [
                "unit" => $unit,
                "status" => false,
                "message" => "No events found for Unit: " . $unit,
                "reply" => [],
            ];
        }

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Events Found",
            "reply" => $GetEvents_events,
        ];
    }

    /**
     * Get direct children units (UBuiltFrom).
     *
     * @param string $unit
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: null|string[],
     * }
     * @throws Exception
     */
    public static function GetChildren(string $unit): array
    {
        self::Find($unit);

        $query = "getlist|$unit|UBuiltFrom|1";
        $resp = Lib::SendQueryToMDB($query);

        if (!empty($resp['reply'][4])) {
            $children = array_map(
                static fn($child) => trim((string)$child),
                array_slice($resp['reply'], 4)
            );

            return [
                "unit" => $unit,
                "status" => true,
                "message" => "Children's found",
                "reply" => array_values(array_filter($children, static fn($c) => $c !== ''))
            ];
        }

        return array(
            "unit" => $unit,
            "status" => true,
            "message" => "Unit doesn't have any children",
            "reply" => []
        );
    }

    /**
     * Get parent for the unit.
     *
     * @param string $unit
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: null|string,
     * }
     * @throws Exception
     */
    public static function GetParent(string $unit): array
    {
        self::Find($unit);

        $query = "getkeyptr|$unit|UWin|1";
        $resp = Lib::SendQueryToMDB($query);

        if (Lib::mdbField($resp['reply'], 2, "getkeyptr count for $unit") === "0") {
            return [
                "unit" => $unit,
                "status" => false,
                "message" => "Parent not found",
                "reply" => null
            ];
        }

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Parent found",
            "reply" => Lib::mdbField($resp['reply'], 3, "getkeyptr parent for $unit")
        ];
    }

    /**
     * Get the next processes and route status for a unit.
     *
     * @param string $unit
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: array{
     *     nextprocess: string,
     *     routestatus: int,
     *   }|array
     * }
     * @throws Exception
     */
    public static function GetNextProcess(string $unit): array
    {
        self::Find($unit);

        $query = "nextproc|$unit";
        $resp = Lib::SendQueryToMDB($query);

        $subject = Lib::mdbFieldOptional($resp['reply'], 2);
        $m = [];
        if (preg_match('/->\s*(.*?)\s*\)/', $subject, $m)) {
            $nextprocess = $m[1];
            $routestatus = preg_match('/off route/i', $subject) ? 0 : 1;
            return [
                "unit" => $unit,
                "status" => true,
                "message" => "Successfully got next process",
                "reply" => [
                    "nextprocess" => $nextprocess,
                    "routestatus" => $routestatus
                ]
            ];
        }

        throw new RuntimeException("Failed to get next process for unit $unit (reply: $subject)");
    }

    /**
     * Get the next process list and route status code.
     *
     * @param string $unit
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: array{
     *     RouteStatus: string,
     *     NextProcessList: string[],
     *   }|array
     * }
     * @throws Exception
     */
    public static function GetProcessList(string $unit): array
    {
        self::Find($unit);

        $query = "nextproclist|$unit";
        $resp = Lib::SendQueryToMDB($query);

        $routeStatusCode = Lib::mdbField($resp['reply'], 2, "nextproclist route status for $unit");
        $plroutestatusstr = match ($routeStatusCode) {
            '0' => "NOROUTE",
            '1' => "ONROUTE",
            '2' => "OFFROUTE",
            '3' => "COMPLETE",
            '4' => "NOPATH",
            default => throw new RuntimeException(
                "Unknown route status code '$routeStatusCode' for unit $unit"
            )
        };

        $nextProcesses = array_map(
            static fn($process) => trim((string)$process),
            array_slice($resp['reply'], 5)
        );

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Successfully got next process list",
            "reply" => [
                "RouteStatus" => $plroutestatusstr,
                "NextProcessList" => array_values(array_filter($nextProcesses, static fn($p) => $p !== ''))
            ]
        ];
    }

    /**
     * Get DCMod value for a unit (optionally within a process context).
     *
     * @param string $unit
     * @param string $description
     * @param string|null $process [optional]
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: null|string|array,
     * }
     *
     * <code>
     * $dcmod = Unit::GetDCMod($Unit,"MSD_REMAIN_EXP","N2CABINETOUT");
     * </code>
     * @throws Exception
     */

    public static function GetDCMod(string $unit, string $description, ?string $process = null): array
    {
        $unit = Lib::replaceCharsInUnit($unit);
        $description = Lib::sanitizeForMdb(trim($description));

        if ($description === '') {
            throw new InvalidArgumentException("GetDCMod: description cannot be empty");
        }

        self::Find($unit);

        if (!empty($process)) {
            $process = strtoupper(Lib::replaceCharsInUnit($process));
            $query = "getprocev|$unit|$process||1|1";

            $raw = Lib::sendAndValidate($query)['raw'];

            foreach (preg_split('/\r?\n/', $raw) as $line) {
                $splitItem = explode("|", $line);

                if (($splitItem[0] ?? '') !== "DC") {
                    continue;
                }

                $splitItem = array_pad($splitItem, 5, '');

                if (trim((string)$splitItem[2]) === $description) {
                    return [
                        "unit" => $unit,
                        "status" => true,
                        "message" => "Got DCMod for Unit",
                        "reply" => trim((string)$splitItem[3])
                    ];
                }
            }

            return [
                "unit" => $unit,
                "status" => false,
                "message" => "DC Mod '$description' not found for unit $unit in process $process",
                "reply" => null
            ];
        }

        $query = "getunitdcmod|$unit|$description";
        $resp = Lib::SendQueryToMDB($query);

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Found $description information",
            "reply" => Lib::mdbField($resp['reply'], 2, "getunitdcmod $description for $unit"),
        ];
    }

    /**
     * Get a number of events for a unit in a process (MDB getevcnt).
     *
     * @param string $unit
     * @param string $process
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: int,
     * }
     *
     * <code>
     * $r = Unit::GetEventCount('ABC123','PACK');
     * $eventCount = $r['reply'];
     * </code>
     * @throws Exception
     */
    public static function GetEventCount(string $unit, string $process): array
    {
        $unit = Lib::replaceCharsInUnit($unit);
        self::Find($unit);

        $process = strtoupper(Lib::replaceCharsInUnit($process));
        $query = "getevcnt|$unit|$process";
        try {
            $resp = Lib::SendQueryToMDB($query);
        } catch (Exception $e) {
            throw new RuntimeException("Failed to get event count: " . $e->getMessage(), (int)$e->getCode(), $e);
        }

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Successfully got event count",
            "reply" => (int)Lib::mdbField($resp['reply'], 2, "getevcnt for $unit/$process"),
        ];
    }

    /**
     * Get a number of events for a unit in a process, excluding given statuses.
     *
     * Supported names: REWORK→2, PASS-QUARANTINE→4, PASS→0.
     *
     * @param string $unit
     * @param string $process
     * @param string|string[] $Excluded
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: int,
     * }
     *
     * <code>
     * $r = Unit::GetEventCountExclude('ABC123','TEST','REWORK');
     * </code>
     * <code>
     * $r = Unit::GetEventCountExclude('ABC123','TEST','REWORK, PASS-QUARANTINE');
     * </code>
     * <code>
     * $r = Unit::GetEventCountExclude('ABC1','TEST',['REWORK', 'PASS-QUARANTINE']);
     * </code>
     *
     * @throws Exception
     * @throws Exception
     */

    public static function GetEventCountExclude(string $unit, string $process, array|string $Excluded): array
    {
        $unit = Lib::replaceCharsInUnit($unit);
        self::Find($unit);

        $map = [
            'REWORK' => 2,
            'PASS-QUARANTINE' => 4,
            'PASS' => 0,
        ];

        if (is_array($Excluded)) {
            $Excluded = array_filter($Excluded, static function ($v) {
                return is_string($v) && $v !== '';
            });
        } else {
            $Excluded = explode(",", $Excluded);
        }

        $Excluded = array_map(static fn($v) => strtoupper(trim((string)$v)), $Excluded);

        $Excluded = array_values(array_unique(array_filter($Excluded, static function ($v) {
            return $v !== '';
        })));

        foreach ($Excluded as $item) {
            if (!array_key_exists($item, $map)) {
                throw new InvalidArgumentException(
                    "Element $item is not supported. Valid values: " . implode(", ", array_keys($map))
                );
            }
        }

        $resp = self::GetEvents($unit);

        $ExcludedTransformed = array_map(static fn($item) => $map[$item], $Excluded);

        $replyItems = is_array($resp['reply']) ? $resp['reply'] : [];

        $events_count = array_filter($replyItems, static function ($item) use ($process, $ExcludedTransformed) {
            $splitItem = explode("|", $item);
            $Proc = $splitItem[0] ?? "";
            $status = $splitItem[5] ?? "";

            if (strcasecmp($Proc, $process) !== 0) {
                return false;
            }

            if (empty($ExcludedTransformed)) {
                return true;
            }

            return !in_array((int)$status, $ExcludedTransformed, true);
        });

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Successfully got event count",
            "reply" => count($events_count)
        ];
    }

    /**
     * @throws RuntimeException
     */
    public static function Filter($unit): array
    {
        $unit = (string)$unit;
        $rulesPath = "/fis/mantis/custom/config/cgi/UnitRules.php";

        if (self::$unitRules === null) {
            if (!is_file($rulesPath) || !is_readable($rulesPath)) {
                throw new RuntimeException("Unit rules file not found or not readable: $rulesPath");
            }

            $loaded = require $rulesPath;

            if (!is_array($loaded)) {
                throw new RuntimeException("Unit rules file did not return an array: $rulesPath");
            }

            self::$unitRules = $loaded;
        }

        $twosidedrule = self::$unitRules;

        $prefix = substr($unit, 0, 8);
        $unit_length = strlen($unit);

        if (!isset($twosidedrule[$prefix])) {
            return [
                "unit" => $unit,
                "status" => true,
                "message" => "No rule found",
                "reply" => $unit
            ];
        }

        $rule = $twosidedrule[$prefix];

        foreach (['unitLength', 'replaceString', 'startPos'] as $required) {
            if (!isset($rule[$required])) {
                throw new RuntimeException("Unit rule for prefix '$prefix' is missing '$required' in $rulesPath");
            }
        }

        if ((int)$rule['unitLength'] !== $unit_length) {
            throw new RuntimeException(
                "Unit length does not match config file for unit " . $unit
                . " - unit length: $unit_length, config file: " . $rule['unitLength']
            );
        }

        $replace_length = strlen($rule['replaceString']);

        $unit_replaced = substr_replace(
            $unit,
            $rule['replaceString'],
            $rule['startPos'] - 1,
            $replace_length
        );

        $unit_check = substr($unit_replaced, $rule['startPos'] - 1, $replace_length);

        if ($unit_check !== $rule['replaceString']) {
            throw new RuntimeException(
                "Error applying filter rule on unit " . $unit
                . " - result: $unit_replaced, rule: " . print_r($rule, true)
            );
        }

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Filter rule applied",
            "reply" => $unit_replaced,
        ];
    }

    /**
     * Add a step for a unit/process/station (+ DCs, comment).
     *
     * Autofills part/userkeys from GetStatus if omitted; computes EVQty; autogenerates event if empty.
     *
     * @param string $unit
     * @param string $process
     * @param string $station
     * @param string $dc
     * @param string $part [optional]
     * @param string $userkey1 [optional]
     * @param string $userkey2 [optional]
     * @param string $userkey3 [optional]
     * @param string $addedcomment [optional]
     * @param string $operator [optional]
     * @param string $webstring [optional]
     * @param string $event [optional]
     * @param string $flowtype
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: mixed,
     * }
     *
     * <code>
     * $r = Unit::DataEntry('ABC123','TEST','ST01','|DC1=VAL);
     * </code>
     * @throws Exception
     */
    public static function DataEntry(
        string $unit,
        string $process,
        string $station,
        string $dc,
        string $part = "",
        string $userkey1 = "",
        string $userkey2 = "",
        string $userkey3 = "",
        string $addedcomment = "",
        string $operator = "",
        string $webstring = "",
        string $event = "",
        string $flowtype = ""
    ): array
    {
        $process = strtoupper($process);
        $station = strtoupper($station);
        $part = strtoupper($part);
        $userkey1 = strtoupper($userkey1);
        $userkey2 = strtoupper($userkey2);
        $userkey3 = strtoupper($userkey3);

        if ($unit === '' || $station === '' || $process === '' || $dc === '') {
            throw new InvalidArgumentException("Missing required parameters: unit, station, process, or dc");
        }

        $unit = Lib::replaceCharsInUnit($unit);
        $process = Lib::replaceCharsInUnit($process);
        $station = Lib::replaceCharsInUnit($station);
        $operator = Lib::replaceCharsInUnit($operator);
        $flowtype = Lib::replaceCharsInUnit($flowtype);
        $event = Lib::replaceCharsInUnit($event);
        $part = Lib::replaceCharsInUnit($part);
        $userkey1 = Lib::replaceCharsInUnit($userkey1);
        $userkey2 = Lib::replaceCharsInUnit($userkey2);
        $userkey3 = Lib::replaceCharsInUnit($userkey3);
        $addedcomment = Lib::sanitizeForMdb($addedcomment);

        $dcstring = ($webstring !== "") ? "$webstring|$dc" : "|$dc";

        if ($operator === "") {
            $operator = "ata";
        }

        if ($flowtype === "") {
            $flowtype = "NO";
        }

        if ($event === "") {
            $event = date("ymd.His");
        }

        try {
            $UnitGetStatus = self::GetStatus($unit);
            $details = $UnitGetStatus['reply'] ?? [];
        } catch (Exception $e) {
        }

        $fillIfEmpty = static function (string &$var, string $dbValue) {
            if ($var === "") {
                $var = $dbValue;
            } elseif ($var === "_BLANK") {
                $var = "";
            }
        };

        $fillIfEmpty($part, $details['part'] ?? "");
        $fillIfEmpty($userkey1, $details['uk1'] ?? "");
        $fillIfEmpty($userkey2, $details['uk2'] ?? "");
        $fillIfEmpty($userkey3, $details['uk3'] ?? "");

        $resp = self::GetEVQty($unit, $process, $event);

        if (empty($resp['status'])) {
            Lib::ShowError(
                "BuildingBlocks",
                "DataEntry: using default EVQty for $unit/$process/$event - " . ($resp['message'] ?? 'unknown reason')
            );
        }

        $quantity = $resp['reply'];

        $query = "rtapushevq|$process|$station|$operator|$flowtype|$event|$quantity|$unit|$part|$userkey1|$userkey2|$userkey3";

        $query .= $dcstring;

        if ($addedcomment !== "") {
            $query .= "|COMMENT|$addedcomment";
        }

        $reply = Lib::SendQueryToMDB($query);

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Process added",
            "reply" => $reply['reply'] ?? null
        ];
    }

    /**
     * Get EV quantity for a unit@process@event (MDB getprocev parsing).
     *
     * @param string $unit
     * @param string $process
     * @param string $event
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: int|string,
     * }
     *
     * On failure this returns status=false with reply=1 (the neutral default quantity)
     * rather than throwing; callers that care must check 'status'.
     *
     * <code>
     * $r = Unit::GetEVQty('ABC123','TEST','250101.120000');
     * </code>
     * @throws Exception
     */
    public static function GetEVQty(string $unit, string $process, string $event): array
    {
        $Ev_qty = null;
        $unit = Lib::replaceCharsInUnit($unit);

        $process = strtoupper(Lib::replaceCharsInUnit($process));
        $event = Lib::replaceCharsInUnit($event);
        $query = "getprocev|$unit|$process|$event|1|1";

        try {
            $resp = Lib::SendQueryToMDB($query);
        } catch (Exception $error) {
            return [
                "unit" => $unit,
                "status" => false,
                "message" => "Could not get EVQty information, error: " . $error->getMessage(),
                "reply" => 1
            ];
        }

        if (Lib::mdbFieldOptional($resp['reply'], 3) === 'EVENT') {
            $Ev_qty = $resp['reply'][9] ?? null;
        }

        if ($Ev_qty === null) {
            return [
                "unit" => $unit,
                "status" => false,
                "message" => "EVQty not found in reply for $unit/$process/$event",
                "reply" => 1
            ];
        }

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Received EVQty information",
            "reply" => $Ev_qty
        ];
    }

    /**
     * Perform Hold/Route checks in order: Find → Status → Quarantine → Route → Hold.
     *
     * @param string $unit
     * @param string $process
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: null|array,
     * }
     * @throws Exception
     */
    public static function PerformHoldRouteCheck(string $unit, string $process): array
    {
        $unit = Lib::replaceCharsInUnit($unit);
        $process = strtoupper(Lib::replaceCharsInUnit($process));

        try {
            self::Find($unit);
        } catch (Exception $e) {
            throw new RuntimeException("Unit not found: " . $unit, (int)$e->getCode(), $e);
        }

        try {
            $UnitStatus = self::GetStatus($unit);
        } catch (Exception $e) {
            throw new RuntimeException(
                "Failed to get unit status for $unit: " . $e->getMessage(),
                (int)$e->getCode(),
                $e
            );
        }

        if ((int)$UnitStatus['reply']['status'] === 3) {
            throw new RuntimeException("Unit is Scrapped");
        }

        Quarantine::CheckAll($unit);

        Route::Check($unit, $process);

        Hold::Check($unit, $process);

        try {
            $resp = self::GetProcessList($unit);
        } catch (Exception $e) {
            throw new RuntimeException(
                "Route Check Failed for $unit: " . $e->getMessage(),
                (int)$e->getCode(),
                $e
            );
        }

        if ($resp['reply']['RouteStatus'] !== "ONROUTE") {
            throw new RuntimeException("Route Check Failed route status is: " . $resp['reply']['RouteStatus']);
        }

        $nextProcesses = array_map('strtoupper', $resp['reply']['NextProcessList']);

        if (!in_array($process, $nextProcesses, true)) {
            throw new RuntimeException(
                "Route Check Failed. Unit is not ready for process: " . $process
                . " (allowed: " . implode(", ", $nextProcesses) . ")"
            );
        }

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Route Check Passed",
            "reply" => null,
        ];
    }

    /**
     * Delete a unit from FIS.
     *
     * @param string $unit
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: mixed,
     * }
     * @throws Exception
     */
    public static function Delete(string $unit): array
    {
        self::Find($unit);

        $query = "delunit|$unit|1";
        $resp = Lib::SendQueryToMDB($query);

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Unit Deleted",
            "reply" => $resp
        ];
    }

    /**
     * Rename a unit in FIS.
     *
     * @param string $oldunit
     * @param string $newunit
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply?: mixed,
     * }
     * @throws Exception
     */
    public static function Rename(string $oldunit, string $newunit): array
    {
        $oldunit = Lib::replaceCharsInUnit($oldunit);

        self::Find($oldunit);

        $newunit = Lib::replaceCharsInUnit($newunit);

        if ($newunit === '') {
            throw new InvalidArgumentException("Rename: new unit cannot be empty");
        }

        $query = "rename|Unit|$oldunit|$newunit";
        $resp = Lib::SendQueryToMDB($query);

        $error = Lib::mdbFieldOptional($resp['reply'], 2);

        if (str_contains($error, "End of list") || str_contains($error, "No such data")) {
            throw new RuntimeException("Error while renaming, error: " . $error);
        }

        return [
            "unit" => $newunit,
            "status" => true,
            "message" => "Unit Renamed",
            "reply" => null,
        ];
    }

    /**
     * Retrieve Unit Types configuration for the given unit length and prefix.
     *
     * Looks up T_UNITYPE by unit length and prefix, shortening the prefix one
     * character at a time until a row matches or fewer than 2 characters remain.
     *
     * The reply keys are the part/userkey slots the caller fills in, mapped from the
     * T_UNITYPE columns as follows:
     *   part <- routkey, uk1 <- prod_fmily, uk2 <- partnbr, uk3 <- prod_type
     *
     * @param int $unitLength The expected unit length to filter by (must be > 3).
     * @param string $unit The prefix string to search for.
     *
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: array{
     *     part: string|null,
     *     uk1: string|null,
     *     uk2: string|null,
     *     uk3: string|null,
     *   }
     * }
     * @throws Exception
     */
    public static function GetUnitTypesDB(int $unitLength, string $unit): array
    {
        if ($unitLength <= 3) {
            throw new InvalidArgumentException("Unit length must be an integer > 3");
        }

        $DB_NAME = "fisbf";

        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

        $mysqli = null;
        $stmt = null;

        try {
            $mysqli = new mysqli(
                DB_HOST,
                DB_USER,
                DB_PASSWORD,
                $DB_NAME
            );
            $mysqli->set_charset('utf8mb4');

            $sql = "SELECT routkey, prod_fmily, prod_type, partnbr
                FROM T_UNITYPE
                WHERE unitid_len = ? AND UNITYPE_ID = ?
                LIMIT 1";

            $stmt = $mysqli->prepare($sql);

            $routkey = $prod_family = $prod_type = $partnbr = null;

            $found = false;
            $originalUnit = $unit;

            while (strlen($unit) >= 2) {
                $stmt->bind_param("is", $unitLength, $unit);
                $stmt->execute();
                $stmt->bind_result($routkey, $prod_family, $prod_type, $partnbr);

                if ($stmt->fetch()) {
                    $found = true;
                    break;
                }

                $stmt->free_result();
                $unit = substr($unit, 0, -1);
            }

            if (!$found) {
                throw new RuntimeException("No configuration found for unit length = " . $unitLength);
            }

            return [
                "unit" => $originalUnit,
                "status" => true,
                "message" => "Got Unit Types configuration",
                "reply" => [
                    "part" => $routkey,
                    "uk1" => $prod_family,
                    "uk2" => $partnbr,
                    "uk3" => $prod_type,
                ],
            ];

        } catch (mysqli_sql_exception $e) {
            throw new RuntimeException("Database error: " . $e->getMessage(), (int)$e->getCode(), $e);
        } finally {
            $stmt?->close();
            $mysqli?->close();
        }
    }

    /**
     * @throws Exception
     */
    public static function Link(string $parentUnit, string $childUnit): array
    {
        $parentUnit = Lib::replaceCharsInUnit($parentUnit);
        self::Find($parentUnit);

        $childUnit = Lib::replaceCharsInUnit($childUnit);
        self::Find($childUnit);

        if ($parentUnit === $childUnit) {
            return [
                "unit" => $parentUnit,
                "status" => false,
                "message" => "Cannot link unit " . $parentUnit . " to itself",
                "reply" => null
            ];
        }

        $query = "searchlist|UBuiltFrom|$childUnit|$parentUnit";
        $reply = Lib::SendQueryToMDB($query);
        if ((int)Lib::mdbField($reply['reply'], 2, "searchlist $childUnit/$parentUnit") !== 0) {
            return [
                "unit" => $parentUnit,
                "status" => false,
                "message" => "Unit " . $childUnit . " is already parent of " . $parentUnit,
                "reply" => null
            ];
        }

        $query = "searchlist|UBuiltFrom|$parentUnit|$childUnit";
        $reply = Lib::SendQueryToMDB($query);
        if ((int)Lib::mdbField($reply['reply'], 2, "searchlist $parentUnit/$childUnit") !== 0) {
            return [
                "unit" => $parentUnit,
                "status" => false,
                "message" => "Unit " . $parentUnit . " is already parent of " . $childUnit,
                "reply" => null
            ];
        }

        $query = "insertlist|" . $parentUnit . "|UBuiltFrom|UWin|1|" . $childUnit;
        $reply = Lib::SendQueryToMDB($query);

        return [
            "unit" => $parentUnit,
            "status" => true,
            "message" => "Unit linked",
            "reply" => $reply['reply'],
        ];
    }
}

class Quarantine
{
    /**
     * BFS over unit and its children; verify none are quarantined.
     *
     * @param string $unit
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: array{
     *     UnitsChecked: string[],
     *   }
     * }
     * @throws Exception
     */
    public static function CheckAll(string $unit): array
    {
        $unitsChecked = Lib::walkUnitTree($unit, static function (string $current): void {
            self::Check($current);
        });

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Quarantine Check Passed",
            "reply" => [
                "UnitsChecked" => $unitsChecked
            ],
        ];
    }

    /**
     * Check if a unit is quarantined.
     *
     * @param string $unit
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: null,
     * }
     * @throws Exception
     */
    public static function Check(string $unit): array
    {
        $UnitStatus = Unit::GetStatus($unit);

        if ((int)$UnitStatus['reply']['status'] === 4) {
            throw new RuntimeException("Unit is Quarantined");
        }

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Quarantine Check Passed",
            "reply" => null
        ];
    }
}

class Route
{
    /**
     * BFS over unit and children for route check.
     *
     * @param string $unit
     * @param string $process
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: array{
     *     UnitsChecked: string[],
     *   }
     * }
     * @throws Exception
     */
    public static function CheckAll(string $unit, string $process): array
    {
        $unitsChecked = Lib::walkUnitTree($unit, static function (string $current) use ($process): void {
            self::Check($current, $process);
        });

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Route Check Passed",
            "reply" => [
                "UnitsChecked" => $unitsChecked
            ],
        ];
    }

    /**
     * Check route eligibility for a unit@process (also rejects quarantined/scrapped).
     *
     * @param string $unit
     * @param string $process
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: mixed,
     * }
     * @throws Exception
     */
    public static function Check(string $unit, string $process): array
    {
        $UnitStatus = Unit::GetStatus($unit);

        if ((int)$UnitStatus['reply']['status'] === 4) {
            throw new RuntimeException("Unit is Quarantined");
        }

        if ((int)$UnitStatus['reply']['status'] === 3) {
            throw new RuntimeException("Unit is Scrapped");
        }

        $query = "routecheck|$process|$unit";
        $resp = Lib::SendQueryToMDB($query);

        if ((int)Lib::mdbField($resp['reply'], 2, "routecheck result for $unit") !== 1) {
            $error = str_replace("\\n", " ", Lib::mdbFieldOptional($resp['reply'], 4, "Route check failed"));
            throw new RuntimeException($error . " For unit: " . $unit);
        }

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Route Check Passed",
            "reply" => null,
        ];
    }

    /**
     * @throws Exception
     */
    public static function GetList(): array
    {
        $reply = [];
        $query = "getkeylist|Route|3";
        $resp = Lib::SendQueryToMDB($query);

        $rows = array_slice($resp['reply'], 4);
        foreach ($rows as $item) {
            $m = [];
            if (preg_match('/^(\S+)\s*(.*)$/u', $item, $m)) {
                $reply[] = [
                    "key" => $m[1],
                    "description" => $m[2]
                ];
            }
        }

        return [
            "unit" => null,
            "status" => true,
            "message" => "Successfully got Route List",
            "reply" => $reply
        ];
    }
}

class Hold
{
    /**
     * BFS over unit and children for Hold checks.
     *
     * @param string $unit
     * @param string $process
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: array{
     *     UnitsChecked: string[],
     *   }
     * }
     * @throws Exception
     */
    public static function CheckAll(string $unit, string $process): array
    {
        $unitsChecked = Lib::walkUnitTree($unit, static function (string $current) use ($process): void {
            self::Check($current, $process);
        });

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "Hold Check Passed",
            "reply" => [
                "UnitsChecked" => $unitsChecked
            ],
        ];
    }

    /**
     * Check Hold status from TCL-style .hold files.
     *
     * With no $process, every hold on the unit is returned with status=false (holds
     * exist) or status=true with an empty list (none). With a $process, a matching
     * hold throws and anything else returns status=true.
     *
     * @param string $unit
     * @param string|null $process [optional]
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   processlist: array<string,string>,
     * }
     * @throws Exception
     */
    public static function Check(string $unit, ?string $process = null): array
    {
        $HoldDir = realpath("/fis/mantis/data/database/unithold");

        if ($HoldDir === false) {
            throw new RuntimeException("Hold directory not found");
        }

        $unit = basename(Lib::replaceCharsInUnit($unit));

        if ($unit === '' || $unit === '.' || $unit === '..') {
            throw new InvalidArgumentException("Hold::Check: invalid unit");
        }

        $Holdfile = $HoldDir . "/" . $unit . ".hold";
        if (!file_exists($Holdfile)) {
            return [
                "unit" => $unit,
                "status" => true,
                "message" => "Hold Check Passed",
                "reply" => null
            ];
        }

        if (!is_file($Holdfile) || !is_readable($Holdfile)) {
            throw new RuntimeException("Could not read the hold file: not readable or not a file");
        }

        $content = @file_get_contents($Holdfile);
        if ($content === false) {
            $err = error_get_last();
            throw new RuntimeException("Could not read the hold file: " . ($err ? $err['message'] : 'unknown error'));
        }

        $hold = [];
        $matches = [];
        if (preg_match_all(
            '/^\s*set\s+hold\(([^)]+)\)\s+('
            . '"((?:[^"\\\\]|\\\\.)*)"'
            . '|\{([^}]*)'
            . '|([^\s;]+)'
            . ')/m',
            $content,
            $matches,
            PREG_SET_ORDER
        )) {
            foreach ($matches as $m) {
                $key = $m[1];

                if (($m[3] ?? '') !== '') {
                    $val = stripcslashes($m[3]);
                } else {
                    $val = ($m[4] ?? '') !== '' ? $m[4] : ($m[5] ?? '');
                }

                $hold[$key] = $val;
            }
        }

        if (empty($hold)) {
            return [
                "unit" => $unit,
                "status" => true,
                "message" => "No hold",
                "processlist" => []
            ];
        }

        if (empty($process)) {
            return [
                "unit" => $unit,
                "status" => false,
                "message" => "Hold data found",
                "processlist" => $hold
            ];
        }

        if (isset($hold[$process])) {
            throw new RuntimeException("Hold data found for process $process on unit $unit");
        }

        return [
            "unit" => $unit,
            "status" => true,
            "message" => "No hold",
            "processlist" => []
        ];
    }
}

class Lib
{
    /**
     * Resolve the carton format configured for a given carton quantity.
     *
     * @param int $CARTON_QUANTITY
     * @return string Uppercased format string.
     * @throws Exception If no format matches the quantity or a database error occurs.
     */
    public static function GetCartonFormat(int $CARTON_QUANTITY): string
    {
        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT | MYSQLI_REPORT_INDEX);

        $mysqli = null;
        $stmt = null;

        try {
            $mysqli = new mysqli(
                DB_HOST,
                DB_USER,
                DB_PASSWORD,
                "User_Interface_Tables"
            );
            $mysqli->set_charset('utf8mb4');

            $select_sql = "SELECT Computed_Format FROM `CartonTypesInterface` WHERE Computed_Quantity = ? LIMIT 1";
            $stmt = $mysqli->prepare($select_sql);

            $stmt->bind_param("i", $CARTON_QUANTITY);
            $stmt->execute();

            $result = $stmt->get_result();

            if ($result->num_rows === 0) {
                throw new RuntimeException("No format found for Quantity: " . $CARTON_QUANTITY);
            }

            $row = $result->fetch_assoc();

            return strtoupper($row['Computed_Format']);

        } catch (mysqli_sql_exception $e) {
            throw new RuntimeException("Database error: " . $e->getMessage(), (int)$e->getCode(), $e);
        } finally {
            $stmt?->close();
            $mysqli?->close();
        }
    }

    /**
     * Retrieve the list of group names a user belongs to.
     *
     * Uses a single UNION ALL round-trip instead of one query per group table.
     *
     * @param string $hname User name or userId
     * @return string[] Group names (empty array when the user belongs to none)
     * @throws Exception If the user is not found or a database error occurs.
     */
    public static function GetUserGroup(string $hname): array
    {
        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

        $hname = trim($hname);
        $userStmt = null;
        $stmt = null;
        $groupsDb = null;
        $usersDb = null;

        try {
            $usersDb = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, "users");
            $usersDb->set_charset('utf8mb4');

            $userStmt = $usersDb->prepare("SELECT pk FROM tbl_users WHERE TRIM(name) = ? OR userId = ? LIMIT 1");
            $userStmt->bind_param("ss", $hname, $hname);
            $userStmt->execute();

            $result = $userStmt->get_result();

            if ($result->num_rows === 0) {
                throw new RuntimeException("Error: User '$hname' not found");
            }

            $userRow = $result->fetch_assoc();
            $userPk = (int)$userRow['pk'];

            $userStmt->close();
            $userStmt = null;

            $groupsDb = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, "groups");
            $groupsDb->set_charset('utf8mb4');

            $result = $groupsDb->query("SELECT tableName FROM groupList");
            $groupTables = [];

            while ($row = $result->fetch_assoc()) {
                $table = (string)$row['tableName'];

                if (preg_match('/^[A-Za-z0-9_]+$/', $table) !== 1) {
                    self::ShowError("BuildingBlocks", "GetUserGroup: skipping unsafe group table name: $table");
                    continue;
                }

                $groupTables[] = $table;
            }

            if (empty($groupTables)) {
                return [];
            }

            $queries = [];
            $params = [];
            $types = "";

            foreach ($groupTables as $table) {
                $queries[] = "SELECT ? as group_name FROM `$table` WHERE user_fk = ?";
                $params[] = $table;
                $params[] = $userPk;
                $types .= "si";
            }

            $finalSql = implode(" UNION ALL ", $queries);

            $stmt = $groupsDb->prepare($finalSql);
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $result = $stmt->get_result();

            $userGroups = [];
            while ($row = $result->fetch_assoc()) {
                $userGroups[] = $row['group_name'];
            }

            return $userGroups;

        } catch (mysqli_sql_exception $e) {
            throw new RuntimeException("Database error: " . $e->getMessage(), (int)$e->getCode(), $e);
        } finally {
            $userStmt?->close();
            $stmt?->close();
            $groupsDb?->close();
            $usersDb?->close();
        }
    }

    /**
     * Append an ERROR line to app log.
     *
     * @param string $scriptName
     * @param string $message
     * @return void
     */
    public static function ShowError(string $scriptName, string $message): void
    {
        self::writeLog("ERROR", $scriptName, $message);
    }

    /**
     * Fetch an MDB key list and normalize it into key/description pairs.
     *
     * Process::GetList(), Part::GetList() and Station::GetList() were three copies of
     * this body; two of them also reported "Got station list" and only one treated an
     * empty list as an error.
     *
     * @param string $keyName MDB key name, e.g. "Process"
     * @param string $label Human-readable label used in messages
     * @return array{status: bool, message: string, reply: array<int, array{key: string, description: string}>}
     * @throws Exception
     */
    public static function GetKeyList(string $keyName, string $label): array
    {
        $reply = self::SendQueryToMDB("getkeylist|$keyName|3");
        $items = [];

        foreach (array_slice($reply['reply'], 4) as $line) {
            $m = explode(" ", (string)$line, 2);
            $id = trim($m[0] ?? '');
            $name = trim($m[1] ?? '');

            if ($id === '') {
                continue;
            }

            $items[] = [
                "key" => $id,
                "description" => $name !== '' ? "$id - $name" : $id,
            ];
        }

        if (count($items) === 0) {
            throw new RuntimeException("No $label entries found");
        }

        return [
            "status" => true,
            "message" => "Got $label list",
            "reply" => $items,
        ];
    }

    /**
     * Send an MDB query and normalize the reply.
     *
     * Detects 'trkrptdlm' (space-delimited) vs. pipe-delimited replies,
     * retries on timeout, and returns a standard structure.
     *
     * @param string $query
     * @return array{
     *   status: bool,
     *   message: string,
     *   reply: mixed,
     * }
     * @throws Exception
     */
    public static function SendQueryToMDB(string $query): array
    {
        $result = self::sendAndValidate($query);

        return [
            "status" => true,
            "message" => "Successfully received reply from MDB",
            "reply" => $result['parts'],
        ];
    }

    /**
     * Send an MDB query, retry once on timeout and validate the success flag.
     *
     * Single source of truth for the send/retry/validate cycle. Callers that need
     * the raw (newline-delimited) payload read 'raw'; callers that work on the
     * pipe-delimited header read 'parts'.
     *
     * @param string $query
     * @return array{raw: string, parts: string[]}
     * @throws Exception
     */
    public static function sendAndValidate(string $query): array
    {
        $reply = self::sendToMDB($query);
        $parts = self::splitReply($reply);

        if ((int)$parts[1] !== 1 && str_contains($reply, "Time out error")) {
            usleep(100000);
            $reply = self::sendToMDB($query);
            $parts = self::splitReply($reply);
        }

        if ((int)$parts[1] !== 1 && str_contains($reply, "Time out error")) {
            throw new RuntimeException("Database Timeout");
        }

        if ((int)$parts[1] !== 1) {
            $errMsg = $parts[2] ?? "unknown error";
            if (count($parts) > 3) {
                $errMsg .= "|" . implode("|", array_slice($parts, 3));
            }
            throw new RuntimeException("Database replied false: $errMsg");
        }

        return ["raw" => $reply, "parts" => $parts];
    }

    /**
     * Split an MDB reply and guarantee the status flag is present.
     *
     * @param string $reply
     * @return string[]
     */
    private static function splitReply(string $reply): array
    {
        $parts = explode("|", $reply);

        if (!isset($parts[1])) {
            throw new RuntimeException("Unexpected database reply format: missing index 1. Error: $reply");
        }

        return $parts;
    }

    /**
     * Read a required field from a validated MDB reply.
     *
     * Every MDB reply is positional, so a missing index means the reply did not have
     * the shape the caller expects. Under declare(strict_types=1) an unchecked index
     * would surface later as a TypeError inside trim()/str_contains(); failing here
     * keeps the diagnostic close to the actual cause.
     *
     * @param string[] $reply Value of $resp['reply']
     * @param int $index
     * @param string $context Short description used in the error message
     * @return string Trimmed field value
     */
    public static function mdbField(array $reply, int $index, string $context): string
    {
        if (!isset($reply[$index])) {
            throw new RuntimeException(
                "Malformed MDB response ($context): missing field $index in [" . implode("|", $reply) . "]"
            );
        }

        return trim((string)$reply[$index]);
    }

    /**
     * Read an optional field from a validated MDB reply.
     *
     * @param string[] $reply
     * @param int $index
     * @param string $default
     * @return string
     */
    public static function mdbFieldOptional(array $reply, int $index, string $default = ''): string
    {
        return isset($reply[$index]) ? trim((string)$reply[$index]) : $default;
    }

    /**
     * Low-level wrapper to submit an MDB query via a shell script.
     *
     * @param string $query
     * @return string Raw output
     * @throws Exception
     */
    public static function sendToMDB(string $query): string
    {
        $tclScriptPath = "/fis/mantis/common/apps/local/bin/bridge.tcl";
        $workingDir = "/fis/mantis/common/apps/local/bin";

        $safeDir = escapeshellarg($workingDir);
        $safeScript = escapeshellarg($tclScriptPath);
        $safeQuery = escapeshellarg($query);

        $command = "cd $safeDir && tclsh $safeScript $safeQuery 2>&1";

        $outputLines = [];
        $exitCode = 0;
        exec($command, $outputLines, $exitCode);

        $output = implode("\n", $outputLines);

        if ($exitCode !== 0) {
            throw new RuntimeException("Failed to execute MDB query. Exit code: $exitCode. Output: $output");
        }

        return $output;
    }

    /**
     * Read POST body depending on Content-Type (JSON or multipart/form-data).
     *
     * @param string $contentType
     * @param string $filename
     * @return array|null
     * @throws JsonException
     */
    public static function getForm(string $contentType, string $filename): ?array
    {
        $mainContentType = strtolower(trim(explode(';', $contentType)[0]));

        if (in_array($mainContentType, ['application/json', 'application/ld+json', 'application/vnd.api+json'], true)) {
            $raw = file_get_contents('php://input');
            return json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        }

        if (stripos($contentType, 'multipart/form-data') !== false) {
            if (in_array($_SERVER['REQUEST_METHOD'] ?? '', ['POST', 'PUT', 'PATCH'], true)) {
                if (empty($_POST)) {
                    $raw = file_get_contents('php://input');

                    if (empty($raw)) {
                        return [];
                    }

                    preg_match('/boundary=(.*)$/', $contentType, $matches);
                    $boundary = $matches[1] ?? null;

                    if ($boundary) {
                        return self::parseMultipartFormData($raw, $boundary);
                    }

                    return [];
                }

                return $_POST;
            }

            $raw = file_get_contents('php://input');
            if (empty($raw)) {
                return [];
            }

            preg_match('/boundary=(.*)$/', $contentType, $matches);
            $boundary = $matches[1] ?? null;

            if ($boundary) {
                return self::parseMultipartFormData($raw, $boundary);
            }

            return [];
        }

        if ($mainContentType === 'application/x-www-form-urlencoded') {
            if (in_array($_SERVER['REQUEST_METHOD'] ?? '', ['POST', 'PUT', 'PATCH'], true)) {
                return $_POST;
            }

            $raw = file_get_contents('php://input');
            if (empty($raw)) {
                return [];
            }

            parse_str($raw, $data);
            return $data;
        }

        if ($mainContentType === 'text/plain') {
            $raw = file_get_contents('php://input');
            return ['text' => $raw];
        }

        if (empty($mainContentType)) {
            if (!empty($_POST)) {
                return $_POST;
            }

            $raw = file_get_contents('php://input');
            if (!empty($raw)) {
                try {
                    $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
                } catch (JsonException) {
                    return ['raw' => $raw];
                }

                return is_array($decoded) ? $decoded : ['raw' => $raw];
            }

            return [];
        }

        self::ShowError($filename, "Unsupported Content-Type: " . $contentType);
        throw new InvalidArgumentException("Unsupported Content-Type: $contentType");
    }

    /**
     * Append a DEBUG line to app log.
     *
     * @param string $scriptName
     * @param string $message
     * @return void
     */
    public static function ShowDebug(string $scriptName, string $message): void
    {
        self::writeLog("DEBUG", $scriptName, $message);
    }

    /**
     * Append a line to the application log.
     *
     * Logging never throws: ShowError() is called from error-handling paths, so a
     * failure to log must not replace the original exception with a logging one.
     * A log line that cannot be written is dropped silently.
     *
     * @param string $level
     * @param string $scriptName
     * @param string $message
     * @return void
     */
    private static function writeLog(string $level, string $scriptName, string $message): void
    {
        $logDir = "/fis/mantis/data/log/";

        $pid = getmypid();
        $now = date("m/d/y H:i:s");

        $scriptName = trim($scriptName) === ''
            ? "unknown_script"
            : preg_replace('/[^a-zA-Z0-9_\-]/', '_', $scriptName);

        if (!is_dir($logDir) && !@mkdir($logDir, 0775, true) && !is_dir($logDir)) {
            return;
        }

        if (!is_writable($logDir)) {
            return;
        }

        $logFile = $logDir . $scriptName . ".log";
        $logLine = "$level 0 [$pid] $now $message\n";

        @file_put_contents($logFile, $logLine, FILE_APPEND | LOCK_EX);
    }

    /**
     * Ręczne parsowanie multipart/form-data
     */
    private static function parseMultipartFormData(string $raw, string $boundary): array
    {
        $data = [];

        $boundary = '--' . trim($boundary);

        $parts = array_slice(explode($boundary, $raw), 1);

        foreach ($parts as $part) {
            if (trim($part) === '--' || empty(trim($part))) {
                continue;
            }

            $sections = explode("\r\n\r\n", $part, 2);
            if (count($sections) < 2) {
                continue;
            }

            [$headers, $content] = $sections;

            if (preg_match('/name="([^"]*)"/', $headers, $matches)) {
                $name = $matches[1];
                $content = rtrim($content, "\r\n");
                $data[$name] = $content;
            }
        }

        return $data;
    }

    /**
     * Checks if a unit's process timing falls within acceptable time limits
     *
     * @param string $unit Unit identifier
     * @param string|null $process Process name to check
     * @return array Response array with unit, status, message, and reply
     * @throws RuntimeException When a database connection fails
     * @throws RuntimeException When query preparation or execution fails
     * @throws RuntimeException When time check validation fails
     * @throws InvalidArgumentException When the config file is not found
     * @throws Exception
     */
    public static function TimeCheck(string $unit, ?string $process = null): array
    {
        $unit = self::replaceCharsInUnit($unit);

        if ($process === null || trim($process) === '') {
            throw new InvalidArgumentException("TimeCheck: process is required");
        }

        $process = trim($process);
        $db_name = 'TimeCheck';
        $timeCheckData = [];
        $stmt = null;

        try {
            mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
            $mysqli = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, $db_name);
            $mysqli->set_charset('utf8mb4');
        } catch (Exception $e) {
            $errorMsg = "DB connection failed: " . $e->getMessage();
            throw new RuntimeException($errorMsg, (int)$e->getCode(), $e);
        }

        try {
            $response = Unit::Filter($unit);
            $unit = $response['reply'] ?? $unit;

            $unitDetails = Unit::GetStatus($unit);
            $part = $unitDetails['reply']['part'] ?? '';
            Unit::Find($unit);
        } catch (RuntimeException $e) {
            $mysqli->close();

            if (!str_contains($e->getMessage(), "Unit doesn't exist")
                && !str_contains($e->getMessage(), "Unit not found")) {
                throw $e;
            }

            throw new InvalidArgumentException("TimeCheck: unit '" . $unit . "' does not exist in FIS", 0, $e);
        }

        try {
            $query_sql = "SELECT * FROM TimeCheck WHERE process = ? AND (ROUTEKEY = ? OR ROUTEKEY = '')";

            $stmt = $mysqli->prepare($query_sql);

            $stmt->bind_param("ss", $process, $part);
            $stmt->execute();
            $result = $stmt->get_result();

            if ($result->num_rows === 0) {
                return [
                    'unit' => $unit,
                    'status' => true,
                    'message' => 'No time check rules found for this process',
                    'reply' => null,
                ];
            }

            $timeCheckData = $result->fetch_all(MYSQLI_ASSOC);
        } catch (Exception $e) {
            $errorMsg = "Query error: " . $e->getMessage();
            throw new RuntimeException($errorMsg, (int)$e->getCode(), $e);
        } finally {
            $stmt->close();
            $mysqli->close();
        }

        $current_time = time();
        $eventsResponse = Unit::GetEvents($unit);
        $events = $eventsResponse['reply'] ?? [];

        if (!is_array($events)) {
            $events = [];
        }

        $found = false;
        $matched = false;
        $successMessage = '';
        $failures = [];

        foreach ($timeCheckData as $timeCheck) {
            foreach ($events as $event) {
                $eventParts = explode("|", (string)$event);

                if (count($eventParts) < 5) {
                    continue;
                }

                $eventProcess = $eventParts[0] ?? '';
                $eventTimestamp = $eventParts[4] ?? '';

                if ($timeCheck['POWERPN'] !== $eventProcess) {
                    continue;
                }

                $matched = true;
                $eventTime = date_create_from_format("ymd.His", $eventTimestamp);

                if ($eventTime === false) {
                    $failures[] = "Failed to parse event timestamp: $eventTimestamp";
                    continue;
                }

                $eventTimeUnix = $eventTime->getTimestamp();
                $timeDiff = $current_time - $eventTimeUnix;
                $minTime = (int)$timeCheck['MIN_TIME'];
                $maxTime = (int)$timeCheck['SENSQUAN'];

                if ($timeDiff >= $minTime && $timeDiff <= $maxTime) {
                    $successMessage = sprintf(
                        "TimeCheck passed for process: %s with time: %d seconds (range: %d-%d)",
                        $timeCheck['POWERPN'],
                        $timeDiff,
                        $minTime,
                        $maxTime
                    );
                    $found = true;
                    break 2;
                }

                $failures[] = sprintf(
                    "TimeCheck failed for process: %s with time: %d seconds (expected range: %d-%d)",
                    $timeCheck['POWERPN'],
                    $timeDiff,
                    $minTime,
                    $maxTime
                );
            }
        }

        if (!$found) {
            if (!$matched) {
                throw new RuntimeException('No matching events found for time check validation');
            }

            throw new RuntimeException(implode('; ', $failures));
        }

        return [
            'unit' => $unit,
            'status' => true,
            'message' => $successMessage,
            'reply' => null,
        ];
    }

    /**
     * Normalize a unit: strip CR/LF, replace '?', space and the MDB field separator.
     *
     * '|' delimits fields in every MDB query built by this file, so a value carrying
     * one would silently shift every following field. It is normalized here rather
     * than at each call site.
     *
     * @param string $unit
     * @return string
     */
    public static function replaceCharsInUnit(string $unit): string
    {
        $unit = trim($unit);

        return str_replace(
            array("\r", "\n", "?", " ", "|"),
            array("", "", "_", "_", "_"),
            $unit
        );
    }

    /**
     * Normalize any value before it is interpolated into a pipe-delimited MDB query.
     *
     * Same reasoning as replaceCharsInUnit(), but for free-text fields (DC strings,
     * comments, dates) where '?' and spaces are legitimate content.
     *
     * @param string $value
     * @return string
     */
    public static function sanitizeForMdb(string $value): string
    {
        return str_replace(array("\r", "\n", "|"), array("", "", " "), $value);
    }

    /**
     * Escape POSIX basic-regular-expression metacharacters for use in a grep pattern.
     *
     * escapeshellarg() protects the shell, but the value still reaches grep as a
     * pattern: a unit containing '.', '*' or '[' would match more than itself.
     *
     * @param string $value
     * @return string
     */
    public static function quoteBre(string $value): string
    {
        return preg_replace('/([.\\[\\]*^$\\\\])/', '\\\\$1', $value);
    }

    /**
     * Breadth-first walk over a unit and all of its descendants.
     *
     * Shared by Quarantine::CheckAll(), Route::CheckAll() and Hold::CheckAll(), which
     * previously carried three byte-identical copies of this loop.
     *
     * @param string $unit Root unit
     * @param callable $check Receives each unit; expected to throw on failure
     * @return string[] Every unit visited, in visit order
     * @throws Exception
     */
    public static function walkUnitTree(string $unit, callable $check): array
    {
        $visited = [$unit => true];
        $queue = [$unit];
        $unitsChecked = [$unit];

        while (!empty($queue)) {
            $current = array_shift($queue);

            $check($current);

            $childrens = Unit::GetChildren($current);
            $children = !empty($childrens['reply']) && is_array($childrens['reply']) ? $childrens['reply'] : [];

            foreach ($children as $child) {
                $child = trim((string)$child);

                if ($child === '' || !empty($visited[$child])) {
                    continue;
                }

                $visited[$child] = true;
                $unitsChecked[] = $child;
                $queue[] = $child;
            }
        }

        return $unitsChecked;
    }

        /**
     * Parse MDB/archive record lines into the common unit reply structure.
     *
     * @param string[] $lines Record lines (without the leading header line)
     * @return array{
     *   status: string, part: string, uk1: string, uk2: string, uk3: string,
     *   gen: string, events: string[], children: string[], childrengens: string[],
     *   parent: string, parentgen: string
     * }
     */
    public static function parseArchiveLines(array $lines): array
    {
        $eventData = "";
        $events = $children = $childrenGens = [];
        $status = $part = $uk1 = $uk2 = $uk3 = $gen = $parent = $parentGen = '';

        foreach ($lines as $line) {
            $data = explode("|", (string)$line);

            switch ($data[0]) {
                case "Unit":
                    $data = array_pad($data, 8, '');
                    [, , $part, $uk1, $uk2, $uk3, , $gen] = $data;
                    break;

                case "EVENT":
                    if ($eventData !== '') {
                        $events[] = $eventData;
                    }
                    $eventData = implode("|", array_slice($data, 1));
                    $status = $data[6] ?? '';
                    break;

                case "DC":
                    $data = array_pad($data, 5, '');
                    [, , $dc, $dcmod, $value] = $data;

                    $eventData .= "|" . $dc . "="
                        . (trim((string)$dcmod) === '' ? $value : $dcmod);
                    break;

                case "UWin":
                    $data = array_pad($data, 3, '');
                    [, $parent, $parentGen] = $data;
                    break;

                case "UBuiltFrom":
                    $data = array_pad($data, 3, '');
                    $children[] = $data[1];
                    $childrenGens[] = $data[2];
                    break;
            }
        }

        if ($eventData !== '') {
            $events[] = $eventData;
        }

        return [
            "status" => $status,
            "part" => $part,
            "uk1" => $uk1,
            "uk2" => $uk2,
            "uk3" => $uk3,
            "gen" => $gen,
            "events" => $events,
            "children" => $children,
            "childrengens" => $childrenGens,
            "parent" => $parent,
            "parentgen" => $parentGen,
        ];
    }


    public static function GetInt(string $key, int $method = INPUT_GET): int|null
    {
        $value = filter_input($method, $key, FILTER_VALIDATE_INT, ["flags" => FILTER_NULL_ON_FAILURE]);
        return is_int($value) ? $value : null;
    }

    /**
     * Read a trimmed string from the request.
     *
     * FILTER_SANITIZE_SPECIAL_CHARS was replaced with FILTER_UNSAFE_RAW: it HTML-encoded
     * the value at input time, so a legitimate unit or part containing '&' arrived as
     * '&amp;' and no longer matched the database. Escaping belongs at render time.
     * FILTER_NULL_ON_FAILURE also has no effect on sanitize filters.
     *
     * @param string $key
     * @param int $method
     * @return string|null
     */
    public static function GetString(string $key, int $method = INPUT_GET): string|null
    {
        $value = filter_input($method, $key, FILTER_UNSAFE_RAW);

        if (!is_string($value)) {
            return null;
        }

        $trimmed = trim(strip_tags($value));

        return $trimmed !== '' ? $trimmed : null;
    }

    public static function GetBool(string $key, int $method = INPUT_GET): bool|null
    {
        return filter_input($method, $key, FILTER_VALIDATE_BOOLEAN, ["flags" => FILTER_NULL_ON_FAILURE]);
    }

    /**
     * Pobiera i filtruje string z dowolnej tablicy (np. zdekodowanego JSON-a).
     */
    public static function GetArrayString(?array $data, string $key): ?string
    {
        if (empty($data) || !array_key_exists($key, $data) || !is_scalar($data[$key])) {
            return null;
        }

        $trimmed = trim(strip_tags((string)$data[$key]));

        return $trimmed !== '' ? $trimmed : null;
    }

    /**
     * Pobiera i waliduje liczbę całkowitą z dowolnej tablicy.
     */
    public static function GetArrayInt(?array $data, string $key): ?int
    {
        if (empty($data) || !array_key_exists($key, $data)) {
            return null;
        }

        $value = filter_var($data[$key], FILTER_VALIDATE_INT, ["flags" => FILTER_NULL_ON_FAILURE]);

        return is_int($value) ? $value : null;
    }

    /**
     * Pobiera i waliduje wartość logiczną (bool) z dowolnej tablicy.
     * Uwaga: 'true', '1', 'on', 'yes' zwrócą true, a 'false', '0', 'off', 'no' zwrócą false.
     */
    public static function GetArrayBool(?array $data, string $key): ?bool
    {
        if (empty($data) || !array_key_exists($key, $data)) {
            return null;
        }

        return filter_var($data[$key], FILTER_VALIDATE_BOOLEAN, ["flags" => FILTER_NULL_ON_FAILURE]);
    }
}

class Language
{
    private static string $defaultLanguage = "English";

    /**
     * Retrieve a translated phrase for a given language.
     *
     * Looks up a phrase key in the language database and returns its translated
     * value based on the provided (or default) language. On error or when the
     * phrase is not found, returns status=false and reply=null.
     *
     * @param string $Phrase Phrase key/name to translate (must be non-empty).
     * @param string|null $LanguageCode Optional language code; if null, the default language is used.
     *
     * @return array{
     * status: bool,
     * message: string,
     * reply: string|null,
     * }
     * <code>
     * $r = Language::GetPhrase('sidebar.buttons.Add_New_Record','pl');
     * if ($r['status']) { echo $r['reply']; }
     * </code>
     * @throws Exception
     */

    public static function GetPhrase(string $Phrase, ?string $LanguageCode = null): array
    {
        $Phrase = trim($Phrase);
        $LanguageCode = $LanguageCode !== null ? trim($LanguageCode) : null;

        if ($Phrase === '') {
            throw new InvalidArgumentException("Language::GetPhrase: Phrase cannot be empty");
        }

        if ($LanguageCode === null || $LanguageCode === '') {
            $Language = self::$defaultLanguage;
        } else {
            $Language = self::GetLanguageName($LanguageCode);

            if ($Language === null) {
                throw new InvalidArgumentException(
                    "Language::GetPhrase: Unknown/invalid language code " . $LanguageCode
                );
            }
        }

        $configPath = '/fis/mantis/custom/database/config.ini';
        $config = @parse_ini_file($configPath, true);
        if ($config === false || !isset($config['database'])) {
            throw new RuntimeException("Database config not found or invalid: $configPath");
        }

        $dbConfig = $config['database'];

        foreach (['host', 'user'] as $required) {
            if (!isset($dbConfig[$required]) || trim((string)$dbConfig[$required]) === '') {
                throw new RuntimeException("Database config parameter '$required' is missing in $configPath");
            }
        }

        $DB_HOST = $dbConfig['host'];
        $DB_USER = $dbConfig['user'];
        $DB_PASS = $dbConfig['password'] ?? '';
        $DB_NAME = "language";

        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

        $db = null;
        $stmt = null;

        try {
            $db = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
            $db->set_charset('utf8mb4');

            $sql = "
            SELECT p.phrase AS phrase_value
            FROM language.phrases AS p
            LEFT JOIN language.language  AS l ON p.language_fk   = l.pk
            LEFT JOIN language.phrase_id AS i ON p.phrase_id_fk  = i.pk
            WHERE l.name = ? AND i.name = ?
            LIMIT 1
        ";

            $stmt = $db->prepare($sql);
            $stmt->bind_param("ss", $Language, $Phrase);
            $stmt->execute();

            $phraseValue = null;
            $stmt->bind_result($phraseValue);

            if ($stmt->fetch()) {
                return [
                    "status" => true,
                    "message" => "Language::GetPhrase: phrase $Phrase found in language $Language",
                    "reply" => $phraseValue,
                ];
            }

            if ($Language !== self::$defaultLanguage) {
                $stmt->close();
                $stmt = $db->prepare($sql);
                $stmt->bind_param("ss", self::$defaultLanguage, $Phrase);
                $stmt->execute();
                $stmt->bind_result($phraseValue);

                if ($stmt->fetch()) {
                    return [
                        "status" => true,
                        "message" => "Language::GetPhrase: phrase $Phrase not found in $Language, used default "
                            . self::$defaultLanguage,
                        "reply" => $phraseValue,
                    ];
                }
            }

            return [
                "status" => false,
                "message" => "Language::GetPhrase: no match for phrase $Phrase in language $Language",
                "reply" => null,
            ];

        } catch (mysqli_sql_exception $e) {
            throw new RuntimeException("Language::GetPhrase: MySQL error: " . $e->getMessage(), (int)$e->getCode(), $e);
        } finally {
            $stmt?->close();
            $db?->close();
        }
    }

    /**
     * Map code (e.g. "pl") to human-readable language name.
     *
     * @param string $code
     * @return string|null Null for an unknown code, so the caller can reject it.
     */
    private static function GetLanguageName(string $code): ?string
    {
        $Language = [
            'pl' => 'Polski',
            'en' => 'English',
            'de' => 'Deutsch',
            'uk' => 'Ukrainski',
        ];

        return $Language[strtolower($code)] ?? null;
    }
}

class Process
{
    /**
     * @return array{status: bool, message: string, reply: array<int, array{key: string, description: string}>}
     * @throws Exception
     */
    public static function GetList(): array
    {
        return Lib::GetKeyList("Process", "process");
    }
}

class Part
{
    /**
     * @return array{status: bool, message: string, reply: array<int, array{key: string, description: string}>}
     * @throws Exception
     */
    public static function GetList(): array
    {
        return Lib::GetKeyList("Part", "part");
    }
}

class Station
{
    /**
     * @return array{status: bool, message: string, reply: array<int, array{key: string, description: string}>}
     * @throws Exception
     */
    public static function GetList(): array
    {
        return Lib::GetKeyList("Station", "station");
    }
}

class Report
{

    public static array $argsArr = array();

    /** Data source label => handler method name. */
    private static array $datasources = array(
        "Real-Time" => "RunRealTime",
        "Historical" => "RunLongTerm",
    );

    private static string $defaultDatasource = "Real-Time";

    private static string $TMPDIR = "/fis/mantis/data/tmp";
    private static int $isAutoReport = 0;

    private static array $defaults = array(
        "report" => "",
        "title" => "",
        "option" => "",
        "from" => "",
        "to" => "",
        "maxevent" => 50000,
        "process" => array(),
        "station" => array(),
        "unit" => "",
        "status" => "",
        "part" => array(),
        "userkey1" => array(),
        "userkey2" => array(),
        "userkey3" => array(),
        "dc" => array(),
        "dclogic" => "0",
        "dcmod" => "",
        "operator" => array(),
        "flowtype" => array(),
        "dcgroup" => array(),
    );

    public static function GetList(): array
    {
        $query = "getkeylist|RptNam|1";

        try {
            $reply = Lib::SendQueryToMDB($query);

            $list = array();
            foreach (array_slice($reply['reply'], 4) as $line) {
                $list[] = trim($line);
            }

            if (count($list) === 0) {
                throw new RuntimeException("Report::GetList: No reports found");
            }

            return array(
                "status" => true,
                "message" => "Got report list",
                "reply" => $list,
            );
        } catch (Exception $e) {
            throw new RuntimeException(
                "Report::GetList: " . $e->getMessage(),
                (int)$e->getCode(),
                $e
            );
        }
    }

    /**
     * Run a report using the configured data source.
     *
     * @param array $args Overrides for self::$defaults
     * @return array|int Report payload, or 0 when the report could not be started
     * @throws Exception
     */
    public static function RunReport($args = array()): array|int
    {
        if (!is_array($args)) {
            $args = array();
        }

        self::$argsArr = array_merge(self::$defaults, $args);

        if (empty(self::$argsArr['maxevent'])) {
            self::$argsArr['maxevent'] = 50000;
        }

        $handler = self::getDatadefault();

        if (!method_exists(__CLASS__, $handler)) {
            throw new RuntimeException("Report::RunReport: unknown data source handler '$handler'");
        }

        return call_user_func(array(__CLASS__, $handler));
    }

    /**
     * Resolve the handler method for the configured default data source.
     *
     * @return string
     */
    public static function getDatadefault(): string
    {
        return self::$datasources[self::$defaultDatasource]
            ?? throw new RuntimeException(
                "Report: unknown default data source '" . self::$defaultDatasource . "'"
            );
    }

    /**
     * @throws Exception
     */
    private static function RunRealTime(): array|int
    {
        $a = self::$argsArr;
        $options = $a['option'];

        $tmp = self::$TMPDIR;

        if (!is_dir($tmp) && !@mkdir($tmp, 0775, true) && !is_dir($tmp)) {
            throw new RuntimeException("Report temp directory is not available: " . $tmp);
        }

        $pid = getmypid();
        $fileOpt = $pid . "_" . uniqid('', true) . "_opt.tmp";
        $fileInput = $pid . "_" . uniqid('', true) . "_i.tmp";
        $fileOutput = $pid . "_" . uniqid('', true) . "_o.tmp";

        $fileOptPath = $tmp . DIRECTORY_SEPARATOR . $fileOpt;
        $fileInputPath = $tmp . DIRECTORY_SEPARATOR . $fileInput;
        $fileOutputPath = $tmp . DIRECTORY_SEPARATOR . $fileOutput;

        try {
            self::createTempFile($fileInputPath);
            self::createTempFile($fileOutputPath);

            if ((string)$a['report'] === "X_MANTIS") {
                self::createTempFile($fileOptPath, $a['option'] . "\n");
                $options = $fileOpt;
            } else {
                self::createTempFile($fileOptPath);
            }

            $message = implode("|", array(
                $a['title'],
                $options,
                $a['report'],
                $a['maxevent'],
                $a['from'],
                $a['to'],
                Convert::StrList($a['station']),
                Convert::StrList($a['operator']),
                Convert::StrList($a['process']),
                Convert::StrList($a['flowtype']),
                $a['unit'],
                $a['status'],
                Convert::StrList($a['part']),
                Convert::StrList($a['userkey1']),
                Convert::StrList($a['userkey2']),
                Convert::StrList($a['userkey3']),
                Convert::StrList($a['dc']),
                Convert::StrList($a['dcgroup']),
                $a['dcmod'],
                $a['dclogic'],
            ));

            $query = "sumrpt|" . $message;

            if (empty($a['from'])) {
               throw new InvalidArgumentException("Report: no FROM time specified");
            }

            $reply = Lib::sendAndValidate($query)['raw'];

            $response = explode("|", $reply);
            $report = implode("| ", array_slice($response, 2));

            $outdata1 = @fopen($fileOutputPath, 'ab');
            if ($outdata1 === false) {
                Lib::ShowError("Reports.php", "Cannot open output file: " . $fileOutput);
            } else {
                fwrite($outdata1, $report);
                fclose($outdata1);
            }

            $repdata1 = @fopen($fileInputPath, "ab");
            if ($repdata1 === false) {
                Lib::ShowError("Reports.php", "Cannot open input file: " . $fileInput);
            } else {
                fwrite($repdata1, "*           Title :  " . $a['title'] . "\n");
                fwrite($repdata1, "*         Options :  " . $fileOpt . "\n");
                fwrite($repdata1, "*     Report Name :  " . $a['report'] . "\n");
                fwrite($repdata1, "*  Maximum Events :  " . $a['maxevent'] . "\n");
                fwrite($repdata1, "*            From :  " . $a['from'] . "\n");
                fwrite($repdata1, "*              To :  " . $a['to'] . "\n");

                if (!empty($a['station'])) {
                    fwrite($repdata1, "*         Station :  " . implode(",&nbsp", (array)$a['station']) . "\n");
                }
                if (!empty($a['process'])) {
                    fwrite($repdata1, "*         Process :   " . implode(",&nbsp", (array)$a['process']) . "\n");
                }

                self::writeUserKey($repdata1, $a['userkey1'], "* Prod Family-UK1 :   ");
                self::writeUserKey($repdata1, $a['userkey2'], "* Prod Number-UK2 :   ");
                self::writeUserKey($repdata1, $a['userkey3'], "* Prod Type-UK3 :   ");

                if (!empty($a['dc'])) {
                    $dcArr = (array)$a['dc'];
                    fwrite($repdata1, "*       Descript:   " . array_shift($dcArr));
                    foreach ($dcArr as $dc) {
                        fwrite($repdata1, ",&nbsp" . $dc);
                    }
                    fwrite($repdata1, "\n");

                    if ((string)$a['dclogic'] === "0") {
                        fwrite($repdata1, "*        DC Logic :  OR\n");
                    } else {
                        fwrite($repdata1, "*        DC Logic :  AND\n");
                    }
                }

                if (!empty($a['dcmod'])) {
                    fwrite($repdata1, "*        Modifier :  " . $a['dcmod'] . "\n");
                }

                fwrite($repdata1, $report);
                fclose($repdata1);
            }

            $repType = (self::$isAutoReport === 1) ? "yes_autoreport" : "no_autoreport";
            $binary = "/fis/mantis/common/apps/local/reports/dqx_mantis";

            $cmd = escapeshellarg($binary) . " " . escapeshellarg($repType) . " "
                . escapeshellarg($fileInputPath) . " " . escapeshellarg($fileOutputPath);

            $execOut = array();
            $execStatus = 0;
            exec($cmd, $execOut, $execStatus);

            if ($execStatus !== 0) {
                Lib::ShowError(
                    "Reports.php",
                    "Could not run dqx_mantis, status=" . $execStatus . ", output=" . implode("\n", $execOut)
                );
            }

            $contents = @file_get_contents($fileOutputPath);
            if ($contents !== false) {
                $report = $contents;
            }

            return array(
                "status" => true,
                "message" => "Successfully retrieved report",
                "reply" => $report,
            );
        } finally {
            foreach ([$fileOptPath, $fileInputPath, $fileOutputPath] as $path) {
                if (is_file($path)) {
                    @unlink($path);
                }
            }
        }
    }

    /**
     * Create (or truncate) a temp file, failing loudly if it cannot be opened.
     *
     * @param string $path
     * @param string $contents
     * @return void
     */
    private static function createTempFile(string $path, string $contents = ""): void
    {
        $fp = @fopen($path, 'wb');

        if ($fp === false) {
            throw new RuntimeException("Could not create report temp file: " . $path);
        }

        if ($contents !== "") {
            fwrite($fp, $contents);
        }

        fclose($fp);
    }

    /**
     * @param resource $fp
     * @param string|string[] $values
     * @param string $label
     * @return void
     */
    private static function writeUserKey($fp, array|string $values, string $label): void
    {
        if (empty($values)) {
            return;
        }

        $arr = (array)$values;
        fwrite($fp, $label . array_shift($arr));

        foreach ($arr as $v) {
            fwrite($fp, ",&nbsp" . $v);
        }

        fwrite($fp, "\n");
    }

    /**
     * Historical (long-term) report handler.
     *
     * Not implemented. It throws rather than returning 0, so selecting the
     * "Historical" data source cannot silently produce an empty report.
     *
     * @return int
     */
    private static function RunLongTerm(): int
    {
        // TODO: iteracja po dniach z krokiem 26h, czytanie .gz z LNGTRMDIR,
        //       filtrowanie po part/uk1-3/unit/station/status/dc+dcmod,
        //       sort -r, rptwrapper, zapis do self::$report.
        throw new RuntimeException("Report::RunLongTerm is not implemented yet");
    }
}