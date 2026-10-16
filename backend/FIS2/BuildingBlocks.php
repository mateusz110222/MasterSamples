<?php

namespace BuildingBlocks;

class Archive
{
    /** Path to the FIS configuration file. */
    private static $configPath = '/fis/mantis/custom/database/config.ini';

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
     *   reply: null|string|array{
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
     * if ($r['status']) { echo $r['reply']['part']; }
     * </code>
     */
    /** Normalize MDB report record separators without splitting spaces inside values. */
    private static function SplitArchiveReport($report)
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($report));
        if (count($lines) === 1) {
            // MDB can return tagged records separated by whitespace, as in
            // "archrptdlm|1 Unit|SN|... EVENT|CREATEUNIT|... DC||...".
            $lines = preg_split('/[ \t]+(?=(?:Unit|EVENT|DC|UWin|UBuiltFrom)\|)/', trim($report));
        }
        return $lines;
    }

    public static function GetAll($unit, $archFile = "", $allowUnar = 0)
    {
        $unit     = (string)$unit;
        $archFile = (string)$archFile;

        $unit     = str_replace(array("\r", "\n"), '', $unit);
        $unit     = strtr($unit, array('?' => '-', '*' => '-'));
        $archFile = strtr($archFile, array('?' => '-', '*' => '-'));

        $unit = strtoupper($unit);

        if ($unit === '') {
            return array(
                "unit"    => $unit,
                "status"  => false,
                "message" => "Unit cannot be blank!",
                "reply"   => null,
            );
        }

        $bitInfo = 0;
        if (strpos((string)$allowUnar, '1') !== false) {
            $bitInfo |= 1;
        }

        $query = "archrptdlm|" . $bitInfo . "|" . strlen($unit) . "|1|" . $unit;

        if ($archFile !== '') {
            $query .= "|" . strlen($archFile) . "|1|" . $archFile;
        }

        $dlmRawRpt = (string)Lib::sendToMDB($query);

        $reply = self::SplitArchiveReport($dlmRawRpt);
        $header = explode("|", isset($reply[0]) ? $reply[0] : '');

        $successFlag = isset($header[1]) ? trim($header[1]) : '';

        $recordLines = array_slice($reply, 1);
        $message     = "OK";

        if ((string)$successFlag !== '1') {
            $error = isset($header[2]) ? trim($header[2]) : '';

            $isNoSuchUnit         = (strpos($error, 'No Such Unit') === 0);
            $isNotFoundInArchives = (stripos($dlmRawRpt, 'not found in the archives') !== false);

            if (!$isNoSuchUnit && !$isNotFoundInArchives) {
                return array(
                    "unit"    => $unit,
                    "status"  => false,
                    "message" => ($error !== '' ? $error : "Unit is unarchived"),
                    "reply"   => $dlmRawRpt,
                );
            }

            $lta = self::SearchUnitInLongTermArchives($unit, 0, 0, $archFile);

            if ($lta['status'] && is_array($lta['reply'])) {
                $recordLines = array_slice($lta['reply'], 1);
                $message     = "OK (LTA)";
            } else {
                $ltaError = isset($lta['message']) ? (string)$lta['message'] : '';

                if (!self::IsMissFromArchive($ltaError)) {
                    return array(
                        "unit"    => $unit,
                        "status"  => false,
                        "message" => "Failed searching long term archives: '" . $ltaError . "'",
                        "reply"   => null,
                    );
                }

                $conv = self::SearchUnitInConvertedArchives($unit, 0, 0, $archFile);

                if ($conv['status'] && is_array($conv['reply'])) {
                    $recordLines = array_slice($conv['reply'], 1);
                    $message     = "OK (Converted)";
                } else {
                    $convError = isset($conv['message']) ? (string)$conv['message'] : '';

                    if (!self::IsMissFromArchive($convError)) {
                        return array(
                            "unit"    => $unit,
                            "status"  => false,
                            "message" => "Failed searching converted archives: '" . $convError . "'",
                            "reply"   => null,
                        );
                    }

                    return array(
                        "unit"    => $unit,
                        "status"  => false,
                        "message" => "No Such Unit",
                        "reply"   => null,
                    );
                }
            }
        }

        $parsed = self::ParseArchiveLines($recordLines);

        return array(
            "unit"    => $unit,
            "status"  => true,
            "message" => $message,
            "reply"   => array_merge(array("unit" => $unit), $parsed),
        );
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
     *   reply: null|string|string[],
     * }
     *
     * reply is the .far path when $getArchFile is 1, the generation-info lines when
     * $getGenInfo is 1, and otherwise the raw record lines read from the .far file
     * (the first of which is the "AR|..." header). The part/uk1/events structure is
     * built by GetAll(), not here.
     *
     * <code>
     * $r = Archive::SearchUnitInLongTermArchives('ABC123', 1);
     * if ($r['status']) { foreach ($r['reply'] as $line) echo $line, PHP_EOL; }
     * </code>
     */
    public static function SearchUnitInLongTermArchives($unit, $getGenInfo = 0, $getArchFile = 0, $searchArchFile = "")
    {
        $unit           = (string)$unit;
        $searchArchFile = (string)$searchArchFile;
        $getGenInfo     = (int)$getGenInfo;
        $getArchFile    = (int)$getArchFile;

        $config = self::LoadConfig();
        if ($config === false) {
            return self::Fail($unit, "Could not read " . self::$configPath);
        }

        $dbName      = isset($config['LONGTERMARCHIVE']['db_name'])  ? $config['LONGTERMARCHIVE']['db_name']  : '';
        $db_host     = isset($config['LONGTERMARCHIVE']['host'])     ? $config['LONGTERMARCHIVE']['host']     : '';
        $db_username = isset($config['LONGTERMARCHIVE']['user'])     ? $config['LONGTERMARCHIVE']['user']     : '';
        $db_password = isset($config['LONGTERMARCHIVE']['password']) ? $config['LONGTERMARCHIVE']['password'] : '';

        if (trim((string)$dbName) === '') {
            return self::Fail($unit, "MySQL::Connect error: LONG_TERM_DB_NAME not configured");
        }

        $db = @new \mysqli($db_host, $db_username, $db_password);
        if ($db->connect_errno) {
            return self::Fail($unit, "MySQL::Connect error: " . $db->connect_error);
        }

        if (!@mysqli_set_charset($db, 'utf8')) {
            $err = $db->error;
            $db->close();

            return self::Fail($unit, "MySQL::Connect error: set_charset failed: " . $err);
        }

        $unitRaw    = $unit;
        $agenClause = "";

        $m = null;
        if (preg_match('/^(.*)>>>>([0-9]+)$/', $unitRaw, $m)) {
            $unitRaw    = $m[1];
            $agenClause = " AND AGeneration = '" . $db->real_escape_string($m[2]) . "' ";
        }

        $m2 = null;
        if (preg_match('/^\{(.*)\}$/', $unitRaw, $m2)) {
            $unitRaw = $m2[1];
        }

        $unitEsc = $db->real_escape_string($unitRaw);
        $fileEsc = ($searchArchFile !== '') ? $db->real_escape_string($searchArchFile) : '';

        $selectCols = "AGeneration,AUGEvent,AUGEventType,AUGCreateDate,ArchiveFile,ArchiveOffset";
        $fromTable  = $dbName . ".arch_events";

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

            return self::Fail($unit, "MySQL::Query error: " . $error);
        }

        $reply = array();

        while ($row = $res->fetch_row()) {
            $AGeneration   = $row[0];
            $AUGEventRaw   = $row[1];
            $AUGEventType  = $row[2];
            $AUGCreateRaw  = $row[3];
            $ArchiveFile   = $row[4];
            $ArchiveOffset = $row[5];

            $AUGEvent      = self::FormatArchiveTimestamp($AUGEventRaw);
            $AUGCreateDate = self::FormatArchiveTimestamp(self::FirstWord($AUGCreateRaw));

            if ($getArchFile === 1) {
                $res->free();
                $db->close();

                return array(
                    "unit"    => $unit,
                    "status"  => true,
                    "message" => "OK",
                    "reply"   => $ArchiveFile,
                );
            }

            $archType = ((string)$AUGEventType === "2") ? "UNARCHIVED" : "ARCHIVED";

            if ($getGenInfo === 1) {
                $reply[] = $AGeneration . '|' . $AUGCreateDate . '|' . $archType . '|'
                    . $AUGEvent . '|' . $ArchiveFile . '|' . $ArchiveOffset;
                continue;
            }

            $res->free();
            $db->close();

            $ok = self::ReadFarFile($ArchiveFile, $ArchiveOffset);
            if ($ok === false) {
                return self::Fail(
                    $unit,
                    "ReadFarFile failed for archive '" . $ArchiveFile . "' at offset " . $ArchiveOffset
                );
            }

            return array(
                "unit"    => $unit,
                "status"  => true,
                "message" => "OK",
                "reply"   => $ok,
            );
        }

        $res->free();
        $db->close();

        if ($getGenInfo === 1 && !empty($reply)) {
            return array(
                "unit"    => $unit,
                "status"  => true,
                "message" => "OK",
                "reply"   => $reply,
            );
        }

        return self::Fail($unit, "No Such Unit");
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
     *   reply: null|string|string[],
     * }
     *
     * reply is the .far path when $getArchFile is 1, the generation-info lines when
     * $getGenInfo is 1, and otherwise the raw record lines read from the .far file
     * (the first of which is the "CA|..." header). The part/uk1/events structure is
     * built by GetAll(), not here.
     *
     * <code>
     * $r = Archive::SearchUnitInConvertedArchives('ABC123', 0, 1);
     * if ($r['status']) { echo $r['reply']; }
     * </code>
     */
    public static function SearchUnitInConvertedArchives($unit, $getGenInfo = 0, $getArchFile = 0, $searchArchFile = "")
    {
        $unit           = (string)$unit;
        $searchArchFile = (string)$searchArchFile;
        $getGenInfo     = (int)$getGenInfo;
        $getArchFile    = (int)$getArchFile;

        $config = self::LoadConfig();
        if ($config === false) {
            return self::Fail($unit, "Could not read " . self::$configPath);
        }

        $convarchfiles = isset($config['CONVARCHFILES'])            ? (string)$config['CONVARCHFILES']            : '';
        $yearsBackRaw  = isset($config['CONVARCHFILES_YEARS_BACK']) ? (string)$config['CONVARCHFILES_YEARS_BACK'] : '';

        if ($convarchfiles === '' || $yearsBackRaw === '') {
            return self::Fail($unit, "ConvertedArchives not configured");
        }

        $m2 = null;
        if (preg_match('/^\{(.*)\}$/', $unit, $m2)) {
            $unit = $m2[1];
        }

        $m = null;
        if (preg_match('/^(.*)>>>>([0-9]+)$/', $unit, $m)) {
            $unit = $m[1];
        }

        $unit2 = strtr($unit, array(' ' => '.', ';' => '.', "\t" => '.'));

        $unitPattern  = self::QuoteBre($unit);
        $unit2Pattern = self::QuoteBreKeepDot($unit2);

        $convertedPath = rtrim($convarchfiles, '/');

        if ($searchArchFile !== '') {
            $hintFile2 = substr($searchArchFile, 0, -3) . 'HNT2';

            if (!is_file($hintFile2)) {
                return self::Fail($unit, "No Such Unit");
            }

            $cmd = 'grep ' . escapeshellarg("^" . $unit2Pattern . "|") . ' '
                . escapeshellarg($hintFile2) . ' 2>/dev/null';
            $out = @shell_exec($cmd);

            if ($out === null || trim($out) === '') {
                return self::Fail($unit, "No Such Unit");
            }

            $result = '';
            foreach (preg_split('/\r?\n/', trim($out)) as $line) {
                $mm = null;
                $unitInfo = preg_match('/^(.*)\.HNT2:(.*)$/', $line, $mm) ? $mm[2] : $line;

                $firstField = explode('|', $unitInfo);
                if (isset($firstField[0]) && $firstField[0] === $unit) {
                    $result = $unitInfo;
                    break;
                }
            }

            if ($result === '') {
                return self::Fail($unit, "No Such Unit");
            }

            $splResult = explode('|', $result);
            if (count($splResult) < 5) {
                return self::Fail($unit, "Parse error");
            }

            $archiveOffset = (int)$splResult[2];
            $bytes2read    = (int)$splResult[3];
            $createDate    = $splResult[4];
            $archiveName   = $searchArchFile;
            $archiveTS     = self::ArchiveTimestampFromName($hintFile2);

            if ($getArchFile === 1) {
                return array("unit" => $unit, "status" => true, "message" => "OK", "reply" => $archiveName);
            }

            if ($getGenInfo === 1) {
                return array(
                    "unit"    => $unit,
                    "status"  => true,
                    "message" => "OK",
                    "reply"   => array("1|" . $createDate . "|ARCHIVED|" . $archiveTS . "|"
                        . $archiveName . "|" . $archiveOffset),
                );
            }

            $ok = self::ReadCAFarFile($archiveOffset, $archiveName, $bytes2read);
            if ($ok === false) {
                return self::Fail($unit, "ReadCAFarFile failed");
            }

            return array("unit" => $unit, "status" => true, "message" => "OK", "reply" => $ok);
        }

        $thisYear = (int)date('Y');

        $yearsBack = (int)$yearsBackRaw;
        $untilYear = ($yearsBack > 1900) ? $yearsBack : $thisYear - ($yearsBack > 0 ? $yearsBack : 0);

        $reply = array();

        for ($yearworking = $thisYear; $yearworking >= $untilYear; $yearworking--) {
            $pattern    = $convertedPath . '/' . $yearworking . '/*.HNT';
            $candidates = glob($pattern);

            if (!$candidates) {
                continue;
            }

            $args = array_map('escapeshellarg', $candidates);
            $cmd  = 'grep -H ' . escapeshellarg("^" . $unit2Pattern . "$") . ' '
                . implode(' ', $args) . ' 2>/dev/null';
            $out  = @shell_exec($cmd);

            if ($out === null || trim($out) === '') {
                continue;
            }

            $unsortedHintFiles = array();
            foreach (preg_split('/\r?\n/', trim($out)) as $line) {
                $mm = null;
                if (preg_match('/^(.*)\.HNT:(.*)$/', $line, $mm)) {
                    if (trim($mm[2]) === $unit) {
                        $unsortedHintFiles[] = $mm[1] . '.HNT';
                    }
                }
            }

            if (empty($unsortedHintFiles)) {
                continue;
            }

            $sortedHintFiles = array_values(array_unique($unsortedHintFiles));
            usort($sortedHintFiles, array(__CLASS__, 'CompareHintFilesDescending'));

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
                $result = isset($lines2[0]) ? trim($lines2[0]) : '';

                if ($result === '') {
                    continue;
                }

                $splResult = explode('|', $result);
                if (count($splResult) < 5) {
                    continue;
                }

                $archiveOffset = (int)$splResult[2];
                $bytes2read    = (int)$splResult[3];
                $createDate    = $splResult[4];

                $archiveName = self::ConvertedArchiveName($hintFile);
                $archiveTS   = self::ArchiveTimestampFromName($hintFile);

                if ($getArchFile === 1) {
                    return array("unit" => $unit, "status" => true, "message" => "OK", "reply" => $archiveName);
                }

                if ($getGenInfo === 1) {
                    $reply[] = "1|" . $createDate . "|ARCHIVED|" . $archiveTS . "|"
                        . $archiveName . "|" . $archiveOffset;
                    continue;
                }

                $ok = self::ReadCAFarFile($archiveOffset, $archiveName, $bytes2read);
                if ($ok === false) {
                    return self::Fail($unit, "ReadCAFarFile failed");
                }

                return array("unit" => $unit, "status" => true, "message" => "OK", "reply" => $ok);
            }
        }

        if ($getGenInfo === 1 && !empty($reply)) {
            return array("unit" => $unit, "status" => true, "message" => "OK", "reply" => $reply);
        }

        return self::Fail($unit, "No Such Unit");
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
     *   reply: null|string[],
     * }
     *
     * <code>
     * $r = Archive::Unarchive('ABC123');
     * </code>
     */
    public static function Unarchive($unit, $bitMask = 0, $archiveFile = "", $ignoreLocks = 0, $allowIntercept = 0)
    {
        $unit = Lib::replaceCharsInUnit((string)$unit);

        return self::UnarchiveConfigured(array($unit), $bitMask, $archiveFile, $ignoreLocks, $allowIntercept);
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
     *   reply: null|string[],
     * }
     *
     * <code>
     * $r = Archive::UnarchiveConfigured(array('U1','U2'), 0, '/path/file.far');
     * </code>
     */
    public static function UnarchiveConfigured(array $units, $bitMask = 0, $archiveFile = "", $ignoreLocks = 0, $allowIntercept = 0)
    {
        if (empty($units)) {
            return array(
                "unit"    => $units,
                "status"  => false,
                "message" => "No units provided",
                "reply"   => null,
            );
        }

        if (!empty($archiveFile) && !file_exists($archiveFile)) {
            return array(
                "unit"    => $units,
                "status"  => false,
                "message" => "Archive file not found: " . $archiveFile,
                "reply"   => null,
            );
        }

        $units   = array_map('strtoupper', $units);
        $StrList = Convert::StrList($units);

        $query        = "archread|$bitMask|$archiveFile|$StrList|$ignoreLocks";
        $unarchRawRpt = (string)Lib::sendToMDB($query);

        $reply  = preg_split('/\r?\n/', trim($unarchRawRpt));
        $header = explode("|", isset($reply[0]) ? $reply[0] : "");

        if (!isset($header[1]) || (int)$header[1] !== 1) {
            $error = isset($header[2]) ? trim($header[2]) : 'Unknown error';

            foreach (array_slice($reply, 1) as $line) {
                $matches = null;
                if (preg_match('/ERR:(.*)$/', $line, $matches)) {
                    $error .= " (" . $matches[1] . ")";
                }
            }

            $foundSomeArchive = false;
            $lookupNotes      = array();
            $lookupFailures   = array();

            foreach ($units as $u) {
                $lta = self::SearchUnitInLongTermArchives($u, 0, 1, $archiveFile);
                if ($lta['status'] && !empty($lta['reply'])) {
                    $foundSomeArchive = true;
                    $archiveFile      = $lta['reply'];
                    break;
                }

                $ltaMessage    = isset($lta['message']) ? (string)$lta['message'] : '';
                $lookupNotes[] = "LTA($u): " . $ltaMessage;

                if (!self::IsMissFromArchive($ltaMessage)) {
                    $lookupFailures[] = "long term archives ($u): " . $ltaMessage;
                }

                $conv = self::SearchUnitInConvertedArchives($u, 0, 1, $archiveFile);
                if ($conv['status'] && !empty($conv['reply'])) {
                    $foundSomeArchive = true;
                    $archiveFile      = $conv['reply'];
                    break;
                }

                $convMessage   = isset($conv['message']) ? (string)$conv['message'] : '';
                $lookupNotes[] = "Converted($u): " . $convMessage;

                if (!self::IsMissFromArchive($convMessage)) {
                    $lookupFailures[] = "converted archives ($u): " . $convMessage;
                }
            }

            if (!$foundSomeArchive) {
                if (!empty($lookupFailures)) {
                    return array(
                        "unit"    => $units,
                        "status"  => false,
                        "message" => "Archive lookup failed: " . implode('; ', $lookupFailures),
                        "reply"   => null,
                    );
                }

                $message = $error;
                if (!empty($lookupNotes)) {
                    $message .= " [" . implode('; ', $lookupNotes) . "]";
                }

                return array(
                    "unit"    => $units,
                    "status"  => false,
                    "message" => $message,
                    "reply"   => null,
                );
            }

            $bitMask |= 8;
            $query        = "archread|$bitMask|$archiveFile|$StrList|$ignoreLocks";
            $unarchRawRpt = (string)Lib::sendToMDB($query);

            $reply  = preg_split('/\r?\n/', trim($unarchRawRpt));
            $header = explode("|", isset($reply[0]) ? $reply[0] : "");

            if (!isset($header[1]) || (int)$header[1] !== 1) {
                $err = isset($header[2]) ? $header[2] : "Unknown error";

                $m = null;
                if (preg_match('/ERR:(.*)$/', $unarchRawRpt, $m)) {
                    $err .= " (" . $m[1] . ")";
                }

                return array(
                    "unit"    => $units,
                    "status"  => false,
                    "message" => "Retry failed: " . $err,
                    "reply"   => null,
                );
            }
        }

        return array(
            "unit"    => $units,
            "status"  => true,
            "message" => "OK",
            "reply"   => $reply,
        );
    }

    /* =====================================================================
     * Helpers
     * ================================================================== */

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
    private static function ParseArchiveLines($lines)
    {
        $eventdata    = '';
        $events       = array();
        $children     = array();
        $childrenGens = array();
        $status       = '';
        $part         = '';
        $uk1          = '';
        $uk2          = '';
        $uk3          = '';
        $gen          = '';
        $parent       = '';
        $parentGen    = '';

        foreach ($lines as $line) {
            $data = explode("|", (string)$line);

            switch ($data[0]) {
                case "Unit":
                    $data = array_pad($data, 8, '');
                    list(, , $part, $uk1, $uk2, $uk3, , $gen) = $data;
                    break;

                case "EVENT":
                    if ($eventdata !== '') {
                        $events[] = $eventdata;
                    }
                    $eventdata = implode("|", array_slice($data, 1));
                    $status    = isset($data[6]) ? $data[6] : '';
                    break;

                case "DC":
                    $data = array_pad($data, 5, '');
                    list(, , $dc, $dcmod, $value) = $data;

                    if (trim((string)$dcmod) === '') {
                        $eventdata .= "|" . $dc . "=" . $value;
                    } else {
                        $eventdata .= "|" . $dc . "=" . $dcmod;
                    }
                    break;

                case "UWin":
                    $data = array_pad($data, 3, '');
                    list(, $parent, $parentGen) = $data;
                    break;

                case "UBuiltFrom":
                    $data = array_pad($data, 3, '');
                    $children[]     = $data[1];
                    $childrenGens[] = $data[2];
                    break;
            }
        }

        if ($eventdata !== '') {
            $events[] = $eventdata;
        }

        return array(
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
        );
    }

    /**
     * Czyta fragment z pliku .far wg offsetu i dlugosci.
     * Zwraca tablice linii: ["CA|<file>|<offset>|<len>", "<linia1>", ...]
     *
     * @param int $offset
     * @param string $arcfilename
     * @param int $numToRead
     * @return array|bool Tablica linii, albo false gdy pliku nie da sie odczytac
     */
    private static function ReadCAFarFile($offset, $arcfilename, $numToRead)
    {
        $numToRead = (int)$numToRead;
        if ($numToRead <= 0) {
            return false;
        }

        $reply   = array();
        $reply[] = "CA|" . $arcfilename . "|" . (int)$offset . "|" . $numToRead;

        $fp = @fopen($arcfilename, 'rb');
        if ($fp === false) {
            return false;
        }

        if (@fseek($fp, (int)$offset, SEEK_SET) !== 0) {
            @fclose($fp);
            return false;
        }

        $chunk = @fread($fp, $numToRead);
        @fclose($fp);

        if ($chunk === false) {
            return false;
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
     * @return array|bool Tablica linii, albo false gdy pliku nie da sie odczytac
     */
    private static function ReadFarFile($archiveFile, $archiveOffset)
    {
        $reply   = array();
        $reply[] = "AR|" . $archiveFile . "|" . (int)$archiveOffset . "|0";

        $fp = @fopen($archiveFile, 'rb');
        if ($fp === false) {
            return false;
        }

        if (@fseek($fp, (int)$archiveOffset, SEEK_SET) !== 0) {
            @fclose($fp);
            return false;
        }

        while (($line = fgets($fp)) !== false) {
            $line = rtrim($line, "\r\n");

            if (isset($line[0]) && $line[0] === 'O') {
                break;
            }

            $reply[] = $line;
        }

        @fclose($fp);

        return $reply;
    }

    private static function LoadConfig()
    {
        static $cache = null;

        if ($cache === null) {
            $cache = @parse_ini_file(self::$configPath, true);
        }

        return $cache;
    }

    private static function FormatArchiveTimestamp($value)
    {
        $value = (string)$value;

        if ($value === '') {
            return '';
        }

        $ts = is_numeric($value) ? (int)$value : @strtotime($value);

        return $ts ? date('ymd.His', $ts) : $value;
    }

    private static function FirstWord($value)
    {
        $parts = preg_split('/\s+/', trim((string)$value));

        return isset($parts[0]) ? $parts[0] : '';
    }

    private static function ArchiveTimestampFromName($hintFile)
    {
        $base = basename((string)$hintFile);

        if (strlen($base) < 14) {
            return '';
        }

        return substr($base, 2, 6) . '.' . substr($base, 8, 6);
    }

    private static function ConvertedArchiveName($hintFile)
    {
        $parts = explode('.', (string)$hintFile);

        return $parts[0] . '.far';
    }

    private static function CompareHintFilesDescending($a, $b)
    {
        return strnatcasecmp($b, $a);
    }

    private static function IsMissFromArchive($message)
    {
        $message = (string)$message;

        if (strpos($message, 'No Such Unit') === 0) {
            return true;
        }

        return (stripos($message, 'not configured') !== false);
    }

    /**
     * Build a failure reply.
     *
     * @param string $unit
     * @param string $message
     * @return array{unit: string, status: bool, message: string, reply: null}
     */
    private static function Fail($unit, $message)
    {
        return array(
            "unit"    => $unit,
            "status"  => false,
            "message" => $message,
            "reply"   => null,
        );
    }
    private static function QuoteBre($value)
    {
        return preg_replace('/([.\[\]*^$\\\\])/', '\\\\$1', (string)$value);
    }

    private static function QuoteBreKeepDot($value)
    {
        return preg_replace('/([\[\]*^$\\\\])/', '\\\\$1', (string)$value);
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
    public static function StrList($items)
    {
        if (!is_array($items)) {
            if ($items === "" || $items === null) {
                $items = array();
            } else {
                $items = array($items);
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
     * @param null|int|int[] $key null → [1,2,3]; int or int[] to pick specific keys
     * @return array{
     *   status: bool,
     *   message: string,
     *   reply: array{
     *     int, array{
     *           key: string[],
     *           description: string[],
     *        }
     *     }
     * }
     *
     * <code>
     * $r = UserKey::GetList(2);
     * if ($r['status']) { print_r($r['reply'][2]['key']); }
     * </code>
     */
    public static function GetList($key = null)
    {
        $status = false;
        $reply = array();

        if ($key === null || $key === "") {
            $seeklist = array("1","2","3");
        } else {
            $seeklist = is_array($key) ? $key : array($key);
        }

        foreach ($seeklist as $k) {
            $query = "getkeylist|UserKey${k}|3";
            $resp = Lib::SendQueryToMDB($query);

            if (!$resp['status']) {
                return $resp;
            }

            $rows = array_slice($resp['reply'],4);
            foreach ($rows as $item) {
                $m = "";
                if (preg_match('/^(\S+)\s*(.*)$/u', $item, $m)) {
                    $reply[] = array(
                        "key" => $m[1],
                        "description" => $m[2]
                    );
                    $status = true;
                }
            }
        }

        return array(
            "status" => $status,
            "message" => "Successfully got UserKey's lists",
            "reply" => $reply
        );
    }
}
class Unit
{
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
     */
    public static function GetAll($unit){
         $resp = Unit::GetStatus($unit);
         $Unit_status = $resp['reply'];
         if (!$resp['status']) {
             return $resp;
         }

         $Event_resp = Unit::GetEvents($unit);
         $Events = $Event_resp['reply'];

         $Children_resp = Unit::GetChildren($unit);
         $Childrens = $Children_resp['reply'];

         $Parent_resp = Unit::GetParent($unit);
         $Parent = $Parent_resp['reply'];

         if ( (strpos($Unit_status['part'],"GOLDEN") !== false) || (strpos($Unit_status['part'],"GOLD") !== false) ) {
             return array(
                "unit"  => $unit,
                "status"  => true,
                "message" => "Successfully got Unit's information",
                "reply"    => array(
                    "unit"  => $unit,
                    "status"  => $Unit_status,
                    "events"  => $Events,
                    "childrens"  => $Childrens,
                    "parent"  => $Parent,
                    "nextprocess" => "GOLDEN",
                    "routestatus" => 1,
                    "nextprocesslist" => "GOLDEN_ROUTE_PROCESSES",
                    "plroutestatusstr" => "ONROUTE",
                    "plroutestatus" => 1,
                ));
         } else {
             $NextProcess_resp = Unit::GetNextProcess($unit);
             $NextProcess = $NextProcess_resp['reply'];

             $NextProcessList_resp = Unit::GetProcessList($unit);
             $NextProcessList = $NextProcessList_resp['reply'];

             return array(
                "unit"  => $unit,
                "status"  => true,
                "message" => "Successfully got Unit's information",
                "reply"    => array(
                    "unit"  => $unit,
                    "status"  => $Unit_status,
                    "events"  => $Events,
                    "childrens"  => $Childrens,
                    "parent"  => $Parent,
                    "nextprocess" => $NextProcess,
                    "nextprocesslist" => $NextProcessList,
                )
             );
         }

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
     */

    public static function GetDCMod($unit, $description,$process = null) {
        $status = false;
        $reply = null;

        $unit = Lib::replaceCharsInUnit($unit);
        $find = Unit::Find($unit);

        if (!$find['status']) {
            return $find;
        }

        if (!empty($process)) {
            $process = strtoupper($process);
            $query = "getprocev|$unit|$process||1|1";
            $resp = Lib::SendQueryToMDB($query);

            if (!$resp['status']) {
                return $resp;
            }

            $found = false;
            $DcMods = explode("DC", $resp['reply']);

            foreach ($DcMods as $item) {
                $splitItem = explode("|", $item);
                if ($splitItem[2] == $description) {
                    return array(
                        "status" => true,
                        "message" => "Got DCMod for Unit",
                        "reply" => $splitItem[3]
                    );
                }
            }

            if (!$found) {
                $message = "DC Mod not found";
            }
        } else {
            $query = "getunitdcmod|$unit|$description";
            $resp = Lib::SendQueryToMDB($query);

            return ($resp['reply'][1] != 1)
                ? array(
                    "unit"  => $unit,
                    "status"  => false,
                    "message" => "Description information not obtained Error: ",
                    "reply"    => $resp['reply']
                )
                : array(
                    "unit"  => $unit,
                    "status"  => true,
                    "message" => "Found $description information",
                    "reply"    => $resp['reply'][2],
                );
        }

        return array(
            "unit"  => $unit,
            "status"  => $status,
            "message" => $message,
            "reply"    => $reply,
        );
    }
    /**
     * Get unit events (tracker report), with optional order flag.
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
     */
    public static function GetEvents($unit , $order=0) {
        $status = false;
        $message = "";

        $unit = Lib::replaceCharsInUnit($unit);
        $find = Unit::Find($unit);

        if (!$find['status']) {
            return $find;
        }
        $stringLength = strlen($unit);
        $query = "trkrptdlm|Unit|||||1|1|$order|1|$stringLength|1|$unit";
        $resp = Lib::SendQueryToMDB($query);

        if (!$resp['status']) {
            return $resp;
        }

        $event_data = "";
        $GetEvents_events = array();
        foreach ($resp['reply'] as $item) {
            $splitItem = explode("|", $item);
            $key = $splitItem[0];
            $data = strstr($item, "|");
            switch ($key) {
                case "EVENT":
                    if ($event_data != "") {
                        $GetEvents_events[] = $event_data;
                    }
                    $event_data = ltrim($data, '|');
                    break;
                case "DC":
                    $dc = $splitItem[2];
                    $dcmod = $splitItem[3];
                    $value = !empty($splitItem[4]) ? $splitItem[4] : "";
                    if (trim($dcmod) == "") {
                        $event_data .= "|$dc=$value";
                    } else {
                        $event_data .= "|$dc=$dcmod";
                    }
                    break;
            }
        }

        if ($event_data != "") {
            $GetEvents_events[] = $event_data;
            $status  = true;
            $message = "Events Found";
        }

        return array(
            "unit"  => $unit,
            "status"  => $status,
            "message" => $message,
            "reply"    => $GetEvents_events,
        );
    }
    /**
     * Get number of events for a unit in a process (MDB getevcnt).
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
     */
    public static function GetEventCount($unit, $process) {
        $unit = Lib::replaceCharsInUnit($unit);
        $find = Unit::Find($unit);

        if (!$find['status']) {
            return $find;
        }

        $query = "getevcnt|$unit|$process";
        $resp = Lib::SendQueryToMDB($query);
        return ($resp['reply'][1] != 1)
            ? array(
                "unit"  => $unit,
                "status"  => false,
                "message" => "Event Count not obtained Error: ",
                "reply"    => $resp['reply']
            )
            : array(
                "unit" => $unit,
                "status" => true,
                "message" => "Successfully got event count",
                "reply" => $resp['reply'][2],
            );
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
     */

    public static function GetEventCountExclude($unit, $process, $Excluded) {
        $unit = Lib::replaceCharsInUnit($unit);
        $find = Unit::Find($unit);

        if (!$find['status']) {
            return $find;
        }

        $map = array(
            'REWORK'           => 2,
            'PASS-QUARANTINE'  => 4,
            'PASS'             => 0,
        );

        if (is_array($Excluded)) {
            $Excluded = array_values(array_unique(array_filter($Excluded, 'strlen')));
        }
        elseif (is_string($Excluded) && strpos($Excluded, ",") !== false) {
            $Excluded = explode(",", $Excluded);
        }
        elseif (is_string($Excluded)) {
            $Excluded = array(trim($Excluded));
        }
        else {
            return array(
                "unit"   => $unit,
                "status" => false,
                "message"=> "Excluded must be array or string provided: ". print_r($Excluded,true),
                "reply"  => null,
            );
        }

        foreach ($Excluded as $i => $v) {
            $Excluded[$i] = trim($v);
        }

        $Excluded = array_values(array_unique(array_filter($Excluded, 'strlen')));

        foreach ($Excluded as $item) {
            if (!array_key_exists($item, $map)) {
                return array(
                    "unit"   => $unit,
                    "status" => false,
                    "message" => "Element $item is not supported",
                    "reply"  => null,
                );
            }
        }

        $resp = Unit::GetEvents($unit);
        if (!$resp['status']) {
            return $resp;
        }

        $ExcludedTransformed = array_map(function ($item) use ($map) {
            $s = strtoupper(trim((string)$item));

            if (isset($map[$s])) {
                return $map[$s];
            }

            return 0;
        }, $Excluded);

        $replyItems = is_array($resp['reply']) ? $resp['reply'] : array();

        $events_count = array_filter($replyItems, function($item) use ($process,$ExcludedTransformed) {
            $splitItem = explode("|", $item);
            $Proc = isset($splitItem[0]) ? $splitItem[0] : "";
            $status = isset($splitItem[5]) ? $splitItem[5] : "";


            if (strcasecmp($Proc, $process) !== 0) {
                return false;
            }

            if (empty($ExcludedTransformed)) {
                return true;
            }

            return !in_array($status, $ExcludedTransformed);
        });

        return array(
            "unit"  => $unit,
            "status"  => true,
            "message" => "Successfully got event count",
            "reply"    => count($events_count)
        );
    }
    /**
     * Search for a unit in the FIS.
     *
     * @param string $unit <p>
     * The unit identifier to look up.
     * </p>
     *
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: null,
     * }
     * <p><b>Example</b>:</p>
     * <code>
     * $result = Unit::Find("123456789");
     * if ($result['status']) {
     *     echo $result['message']; // Unit found
     * } else {
     *     echo $result['message']; // Unit not found
     * }
     * </code>
     */
    public static function Find($unit) {
        $unit = Lib::replaceCharsInUnit($unit);
        $resp = Lib::SendQueryToMDB("findkey|$unit|Unit|1");
        if (!$resp['status']) {
            return $resp;
        }
        if (!isset($resp['reply'][1])) {
            return array('unit' => $unit, 'status' => false,
                'message' => 'Invalid findkey response', 'reply' => $resp['reply']);
        }
        if ((string)$resp['reply'][1] === '2') {
            return array('unit' => $unit, 'status' => false,
                'message' => 'Unit not found', 'reply' => $resp['reply']);
        }
        if ((string)$resp['reply'][1] !== '1') {
            return array('unit' => $unit, 'status' => false,
                'message' => 'Find failed: ' . (isset($resp['reply'][2]) ? $resp['reply'][2] : 'Unknown MDB error'),
                'reply' => $resp['reply']);
        }
        return array('unit' => $unit, 'status' => true, 'message' => 'Unit found', 'reply' => null);
    }
    public static function Filter($unit) {
        $twosidedrule = require "/fis/mantis/custom/config/cgi/UnitRules.php";

        $prefix = substr($unit, 0, 8);
        $unit_length = strlen($unit);

        if (!isset($twosidedrule[$prefix])) {
            return array(
                "unit"    => $unit,
                "status"  => true,
                "message" => "No rule found",
                "reply"   => $unit
            );
        }

        $rule = $twosidedrule[$prefix];

        if ($rule['unitLength'] != $unit_length) {
            return array(
                "unit"    => $unit,
                "status"  => true,
                "message" => "Unit length does not match with config file",
                "reply"   => $unit,
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

        if ($unit_check != $rule['replaceString']) {
            return array(
                "unit"    => $unit,
                "status"  => false,
                "message" => "Error applying filter rule on unit",
                "reply"   => array(
                    "replace_length" => $replace_length,
                    "startPos" => $rule['startPos'],
                    "replaceString" => $rule['replaceString'],
                    "unit_replaced" => $unit_replaced,
                )
            );
        }

        return array(
            "unit"    => $unit,
            "status"  => true,
            "message" => "Filter rule applied",
            "reply"   => $unit_replaced,
        );
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
     */
    public static function GetStatus( $unit ) {
        $unit = Lib::replaceCharsInUnit($unit);
        $find = Unit::Find($unit);

        if (!$find['status']) {
            return $find;
        }

        $query = "getunit|$unit";
        $resp = Lib::SendQueryToMDB($query);

        return ($resp['reply'][1] != 1)
            ? array(
                "unit"  => $unit,
                "status"  => false,
                "message" => "Unit Details not obtained Error: ". $resp['reply'][2],
                "reply"    => $resp['reply']
            )
            : array(
                "unit"  => $unit,
                "status"  => true,
                "message" => "Unit found",
                "reply"    => array(
                    "unit"  => $unit,
                    "status"  => $resp['reply'][2],
                    "part"  => $resp['reply'][3],
                    "uk1" => $resp['reply'][4],
                    "uk2"    => $resp['reply'][5],
                    "uk3"    => $resp['reply'][6],
                    "generation"   => $resp['reply'][7],
                )
            );
    }
    /**
     * Get EV quantity for unit@process@event (MDB getprocev parsing).
     *
     * @param string $unit
     * @param string $process
     * @param string $event
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: null|int|string,
     * }
     *
     * <code>
     * $r = Unit::GetEVQty('ABC123','TEST','250101.120000');
     * </code>
     */
    public static function GetEVQty($unit,$process,$event){
        $unit = Lib::replaceCharsInUnit($unit);
        $find = Unit::Find($unit);

        if (!$find['status']) {
            return $find;
        }

        $process = strtoupper($process);
        $query = "getprocev|$unit|$process|$event|1|1";
        $resp = Lib::SendQueryToMDB($query);

        if (!$resp['status']) {
            return $resp;
        }
        $lines = explode(" ", $resp['reply']);

        $header = explode('|', isset($lines[0]) ? $lines[0] : '');
        if ((int)(isset($header[1]) ? $header[1] : 0) !== 1) {
            return array(
                "unit" => $unit,
                "status" => false,
                "message" => "Could not get EVQty information",
                "reply" => 1
            );
        }

        $reply = null;
        foreach (array_slice($lines, 1) as $line) {
            $splititem = explode('|', $line);
            if ((isset($splititem[0]) ? $splititem[0] : '') === 'EVENT') {
                $reply = isset($splititem[9]) ? $splititem[9] : null;
                break;
            }
        }

        return array(
            "unit" => $unit,
            "status" => $reply !== null,
            "message" => $reply !== null ? "Received EVQty information" : "EVQty not found in reply",
            "reply" => $reply
        );
    }
    /**
     * Add a step for a unit/process/station (+ DCs, comment).
     *
     * Auto-fills part/userkeys from GetStatus if omitted; computes EVQty; autogenerates event if empty.
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
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply: mixed,
     * }
     *
     * <code>
     * $r = Unit::DataEntry('ABC123','TEST','ST01','|DC1=VAL');
     * </code>
     */
    public static function DataEntry($unit, $process, $station,$dc, $part = "", $userkey1 = "", $userkey2 = "", $userkey3 = "",  $addedcomment = "", $operator = "", $webstring = "", $event="", $flowtype = "") {
        $process=strtoupper($process);
        $station=strtoupper($station);
        $part=strtoupper($part);
        $userkey1=strtoupper($userkey1);
        $userkey2=strtoupper($userkey2);
        $userkey3=strtoupper($userkey3);

        if ( empty($unit) || empty($station) || empty($process) || empty($dc) ) {
            return array(
                "status" => false,
                "message" => "Missing required parameters",
                "reply" => array(
                    "unit" => isset($unit) ? $unit : "",
                    "process" => isset($process) ? $process : "",
                    "station" => isset($station) ? $station : "",
                    "dc" => isset($dc) ? $dc : "",
                )
            );
        }

        $unit = Lib::replaceCharsInUnit($unit);
        $process= Lib::replaceCharsInUnit($process);
        $station= Lib::replaceCharsInUnit($station);

        if ($dc!="") {
            $dcstring = $webstring."|".$dc;
        } else {
            $dcstring = $webstring;
        }

        if ($operator === "") {
            $operator = "ata";
        }

        if ($flowtype === "" ) {
            $flowtype = "NO";
        }

        if ($event == "" ) {
            $event=date("Ymd.His") ;
            $event = substr($event, 2);
        }

        $UnitGetStatus = Unit::GetStatus($unit);
        if ($UnitGetStatus['status']) {
            if ($part == "") {
                if ($UnitGetStatus['reply']['part'] != "") {
                    $part = $UnitGetStatus['reply']['part'];
                }
            } elseif ($part == "_BLANK" ) {
                $part = "";
            }
            if ($userkey1 == "") {
                if ($UnitGetStatus['reply']['uk1'] != "") {
                    $userkey1 = $UnitGetStatus['reply']['uk1'];
                }
            } elseif ($userkey1 == "_BLANK" ) {
                $userkey1 = "";
            }
            if ($userkey2 == "") {
                if ($UnitGetStatus['reply']['uk2'] != "") {
                    $userkey2 = $UnitGetStatus['reply']['uk2'];
                }
            } elseif ($userkey2 == "_BLANK" ) {
                $userkey2 = "";
            }
            if ($userkey3 == "") {
                if ($UnitGetStatus['reply']['uk3'] != "") {
                    $userkey3 = $UnitGetStatus['reply']['uk3'];
                }
            } elseif ($userkey3 == "_BLANK" ) {
                $userkey3 = "";
            }
        }

        $resp = Unit::GetEVQty($unit,$process,$event);
        $quantity = $resp['reply'];
        $query = "rtapushevq|".$process."|".$station."|".$operator."|".$flowtype."|".$event."|".$quantity."|".$unit."|".$part."|".$userkey1."|".$userkey2."|".$userkey3;
        if ($dcstring != "") {
            $query .= $dcstring;
        }

        if($addedcomment != "") {
            $query .= "|COMMENT|".$addedcomment;
        }

        $resp = Lib::SendQueryToMDB($query);
        if (!$resp['status']) {
            return $resp;
        }

        return ($resp['reply'][1] != 1)
            ? array(
                "unit"  => $unit,
                "status"  => false,
                "message" => "Process not added Error:" . print_r($resp['reply'], true),
                "reply"    => $query
            )
            : array(
                "unit"  => $unit,
                "status"  => true,
                "message" => "Process added",
                "reply"    => $resp
            );
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
     */
    public static function GetChildren($unit) {
        $find = Unit::Find($unit);
        if (!$find['status']) {
            return $find;
        }

        $query ="getlist|$unit|UBuiltFrom|1";
        $resp = Lib::SendQueryToMDB($query);

        if (!$resp['status']) {
            return $resp;
        }

        if (!empty($resp['reply'][4])) {
            return ($resp['reply'][1] != 1)
                ? array(
                    "unit"  => $unit,
                    "status"  => false,
                    "message" => "Children's not obtained Error: ". $resp['reply'][2],
                    "reply"    => $resp['reply']
                )
                : array(
                    "unit" => $unit,
                    "status" => true,
                    "message" => "Children's found",
                    "reply" => array_slice($resp['reply'], 4)
                );
        } else {
            return array(
                "unit" => $unit,
                "status" => true,
                "message" => "Unit doesn't have any children",
                "reply" => null
            );
        }
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
     */
    public static function GetNextProcess($unit) {
        $find = Unit::Find($unit);

        if (!$find['status']) {
            return $find;
        }

        $query = "nextproc|$unit";
        $resp = Lib::SendQueryToMDB($query);

        if (!$resp['status']) {
            return $resp;
        }

        $subject = isset($resp['reply'][2]) ? $resp['reply'][2] : '';
        $m = "";
        if (preg_match('/->\s*(.*?)\s*\)/', $subject, $m)) {
            $nextprocess = $m[1];
            $routestatus = preg_match('/off route/i', $subject) ? 0 : 1;
            return array(
                "unit"  => $unit,
                "status"  => true,
                "message" => "Successfully got next process",
                "reply"    => array(
                    "nextprocess" => $nextprocess,
                    "routestatus" => $routestatus
                )
            );
        } else {
            return array(
                "unit"  => $unit,
                "status"  => false,
                "message" => "Failed to get next process",
                "reply"    => $resp
            );
        }
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
     */
    public static function GetParent($unit) {
        $find = Unit::Find($unit);

        if (!$find['status']) {
            return $find;
        }

        $query = "getkeyptr|$unit|UWin|1";
        $resp = Lib::SendQueryToMDB($query);

        if (!$resp['status']) {
            return $resp;
        }

        return $resp['reply'][2] == "0" ? array(
            "unit"  => $unit,
            "status"  => false,
            "message" => "No parent found",
            "reply"    => null
        ) : array(
            "unit"  => $unit,
            "status"  => true,
            "message" => "Parent found",
            "reply"    => trim($resp['reply'][3])
        );
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
     */
    public static function GetProcessList($unit) {
        $find = Unit::Find($unit);

        if (!$find['status']) {
            return $find;
        }

        $query = "nextproclist|$unit";
        $resp = Lib::SendQueryToMDB($query);

        if (!$resp['status']) {
            return $resp;
        }

        $plroutestatusstr = null;
        switch ($resp['reply'][2]) {
            case '0': {$plroutestatusstr = "NOROUTE"; break;}
            case '1': {$plroutestatusstr = "ONROUTE"; break;}
            case '2': {$plroutestatusstr = "OFFROUTE"; break;}
            case '3': {$plroutestatusstr = "COMPLETE"; break;}
            case '4': {$plroutestatusstr = "NOPATH"; break;}

        }

        return ($resp['reply'][1] != 1)
        ? array(
            "unit"  => $unit,
            "status"  => false,
            "message" => "Error while getting next process list",
            "reply"    => $resp['reply']
        )
        : array(
            "unit"  => $unit,
            "status"  => true,
            "message" => "Successfully got next process list",
            "reply"    => array(
                "RouteStatus" => $plroutestatusstr,
                "NextProcessList" => array_slice($resp['reply'],5)
            )
        );
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
     */
    public static function PerformHoldRouteCheck($unit, $process) {
        $startTime = microtime(true);
        $timings = array();

        // Unit::Find
        $t1 = microtime(true);
        $Find = Unit::Find($unit);
        $timings['Find'] = (microtime(true) - $t1) * 1000;

        if (!$Find['status']) {
            return $Find;
        }

        // Unit::GetStatus
        $t2 = microtime(true);
        $UnitStatus = Unit::GetStatus($unit);
        $timings['GetStatus'] = (microtime(true) - $t2) * 1000;

        if (!$UnitStatus['status']) {
            return $UnitStatus;
        }

        if ($UnitStatus['reply']['status'] == 3) {
            return array(
                "unit"  => $unit,
                "status"  => false,
                "message" => "Unit is Scrapped",
                "reply"    => $UnitStatus
            );
        }

        // Quarantine::CheckAll
        $t3 = microtime(true);
        $QuarantineCheck = Quarantine::CheckAll($unit);
        $timings['QuarantineCheckAll'] = (microtime(true) - $t3) * 1000;

        if (!$QuarantineCheck['status']) {
            return array(
                "unit"  => $unit,
                "status"  => false,
                "message" => "Unit is Quarantined",
                "reply"    => $QuarantineCheck
            );
        }

        // Route::Check
        $t4 = microtime(true);
        $RouteCheck = Route::Check($unit, $process);
        $timings['RouteCheck'] = (microtime(true) - $t4) * 1000;

        if ($RouteCheck['status']) {
            $totalTime = (microtime(true) - $startTime) * 1000;
            $timings['TOTAL'] = $totalTime;
            Lib::ShowDebug('PerformHoldRouteCheck', "Unit: $unit | " . json_encode($timings));
            return array(
                "unit"    => $unit,
                "status"  => true,
                "message" => "Route Check Passed",
                "reply"   => null
            );
        }

        // Hold::Check
        $t5 = microtime(true);
        $HoldCheck = Hold::Check($unit, $process);
        $timings['HoldCheck'] = (microtime(true) - $t5) * 1000;

        if (!$HoldCheck['status']) {
            $totalTime = (microtime(true) - $startTime) * 1000;
            $timings['TOTAL'] = $totalTime;
            Lib::ShowDebug('PerformHoldRouteCheck', "Unit: $unit | " . json_encode($timings));
            return array(
                "unit"    => $unit,
                "status"  => false,
                "message" => "Unit is Held",
                "reply"   => $HoldCheck
            );
        }

        $totalTime = (microtime(true) - $startTime) * 1000;
        $timings['TOTAL'] = $totalTime;
        Lib::ShowDebug('PerformHoldRouteCheck', "Unit: $unit | " . json_encode($timings));

        return array(
            "unit"    => $unit,
            "status"  => false,
            "message" => "Route Check",
            "reply"   => $RouteCheck
        );
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
     */
    public static function Delete($unit) {
        $Find = Unit::Find($unit);
        if (!$Find['status']) {
            return $Find;
        }

        $query = "delunit|$unit|1";
        $resp = Lib::SendQueryToMDB($query);

        if (!$resp['status']) {
            return $resp;
        }

         return ($resp['reply'][1] != 1)
         ? array(
             "unit"  => $unit,
             "status"  => false,
             "message" => "Unit not Deleted Error: ". $resp['reply'][2],
             "reply"    => $resp['reply']
         )
         : array(
             "unit"  => $unit,
             "status"  => true,
             "message" => "Unit Deleted",
             "reply"    => $resp
         );
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
     */
    public static function Rename($oldunit, $newunit)
    {
        $oldunit = Lib::replaceCharsInUnit($oldunit);

        $Find = Unit::Find($oldunit);
        if (!$Find['status']) {
            return $Find;
        }

        $newunit = Lib::replaceCharsInUnit($newunit);
        $query = "rename|Unit|$oldunit|$newunit";
        $resp = Lib::SendQueryToMDB($query);
        if (!$resp['status']) {
            return $resp;
        }

        if  ($resp['reply'][1] != 1) {
            return array(
                "unit" => $oldunit,
                "status" => false,
                "message" => "Unit not Renamed Error: " . $resp['reply'][2],
                "reply" => $resp
            );
        } else {
            $error = $resp['reply'][2];
            if (strpos("End of list", $error) || strpos("No such data", $error)) {
                return array(
                    "unit" => $oldunit,
                    "status" => false,
                    "message" => "Unit doesn't exist in the database.",
                );
            }
            return array(
                "unit"  => $oldunit,
                "status"  => true,
                "message" => "Unit Renamed",
            );
        }
    }
    /**
     * Retrieve Unit Types configuration based on the given Unit Length and Prefix.
     *
     * This method queries the Unit Types table
     * and returns routing and product family/type identifiers associated
     * with the specified unit length. If the unit length is too short,
     * the database connection fails, or no configuration is found, it
     * returns a status of false along with an explanatory message.
     *
     * @param int    $unitLength  The expected unit length to filter by.
     * @param string $unit        The original prefix string for context in the reply.
     *
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   reply?: array{
     *     routkey: string|null,
     *     prod_family: string|null,
     *     prod_type: string|null,
     *     partnbr: string|null,
     *   }|null
     * }
     */
    public static function GetUnitTypesDB($unitLength, $unit)
    {
        $unitLength = (int)$unitLength;
        if ($unitLength <= 3) {
            return array(
                "unit" => $unit,
                "status" => false,
                "message" => "Unit length must be an integer > 3",
                "reply" => $unitLength
            );
        }

        $config = @parse_ini_file('/fis/mantis/custom/database/config.ini', true);
        if ($config === false || !isset($config['database'])) {
            return array(
                "unit" => $unit,
                "status" => false,
                "message" => "Database config not found or invalid",
            );
        }

        $DB_HOST = $config['FIS_Localhost_Database']['host'];
        $DB_USER = $config['FIS_Localhost_Database']['user'];
        $DB_PASS = $config['FIS_Localhost_Database']['password'];
        $DB_NAME = "fisbf";

        $mysqli = @new \mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
        if ($mysqli->connect_errno) {
            return array(
                "unit" => $unit,
                "status" => false,
                "message" => "Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error,
            );
        }

        $sql = "SELECT routkey, prod_fmily, prod_type, partnbr
            FROM T_UNITYPE
            WHERE unitid_len = ? AND UNITYPE_ID = ?
            LIMIT 1";

        $stmt = $mysqli->prepare($sql);
        if ($stmt === false) {
            $msg = "Failed to prepare statement: (" . $mysqli->errno . ") " . $mysqli->error;
            $mysqli->close();
            return array("unit" => $unit, "status" => false, "message" => $msg);
        }

        if (!$stmt->bind_param("is", $unitLength, $unit)) {
            $msg = "Failed to bind params: (" . $stmt->errno . ") " . $stmt->error;
            $stmt->close();
            $mysqli->close();
            return array("unit" => $unit, "status" => false, "message" => $msg);
        }

        $originalUnit = $unit;
        $found = false;

        while (strlen($unit) >= 2) {
            if (!$stmt->execute()) {
                $msg = "Failed to execute statement: (" . $stmt->errno . ") " . $stmt->error;
                $stmt->close();
                $mysqli->close();
                return array("unit" => $originalUnit, "status" => false, "message" => $msg);
            }

            $routkey = $prod_family = $prod_type = $partnbr = null;
            if (!$stmt->bind_result($routkey, $prod_family, $prod_type, $partnbr)) {
                $msg = "Failed to bind results: (" . $stmt->errno . ") " . $stmt->error;
                $stmt->close();
                $mysqli->close();
                return array("unit" => $originalUnit, "status" => false, "message" => $msg);
            }

            if ($stmt->fetch()) {
                $found = true;
                break;
            }

            $unit = substr($unit, 0, -1);
            if (!$stmt->bind_param("is", $unitLength, $unit)) {
                $msg = "Failed to bind params after truncation: (" . $stmt->errno . ") " . $stmt->error;
                $stmt->close();
                $mysqli->close();
                return array("unit" => $originalUnit, "status" => false, "message" => $msg);
            }
        }

        $stmt->close();
        $mysqli->close();

        if (!$found) {
            return array(
                "unit" => $originalUnit,
                "status" => false,
                "message" => "No configuration found for unit length = " . $unitLength,
            );
        }

        return array(
            "unit" => $originalUnit,
            "status" => true,
            "message" => "Got Unit Types configuration",
            "reply" => array(
                "part" => $routkey,
                "uk1" => $prod_family,
                "uk2" => $partnbr,
                "uk3" => $prod_type,
            ),
        );
    }
    /** Link two existing WIP units (PHP 5.3 counterpart of FIS1 Unit::Link). */
    public static function Link($parentUnit, $childUnit)
    {
        $parentUnit = Lib::replaceCharsInUnit($parentUnit);
        $childUnit = Lib::replaceCharsInUnit($childUnit);
        if ($parentUnit === $childUnit) {
            return array('unit' => $parentUnit, 'status' => false,
                'message' => 'Cannot link a unit to itself', 'reply' => null);
        }
        $parent = self::Find($parentUnit);
        if (!$parent['status']) return $parent;
        $child = self::Find($childUnit);
        if (!$child['status']) return $child;

        $reply = Lib::SendQueryToMDB("searchlist|UBuiltFrom|$childUnit|$parentUnit");
        if (!$reply['status']) return $reply;
        if (!isset($reply['reply'][1], $reply['reply'][2]) || (string)$reply['reply'][1] !== '1') {
            return array('unit' => $parentUnit, 'status' => false,
                'message' => 'Failed to check reverse link', 'reply' => $reply['reply']);
        }
        if ((int)$reply['reply'][2] !== 0) {
            return array('unit' => $parentUnit, 'status' => false,
                'message' => 'Child is already parent of this unit', 'reply' => $reply['reply']);
        }
        $reply = Lib::SendQueryToMDB("searchlist|UBuiltFrom|$parentUnit|$childUnit");
        if (!$reply['status']) return $reply;
        if (!isset($reply['reply'][1], $reply['reply'][2]) || (string)$reply['reply'][1] !== '1') {
            return array('unit' => $parentUnit, 'status' => false,
                'message' => 'Failed to check existing link', 'reply' => $reply['reply']);
        }
        if ((int)$reply['reply'][2] !== 0) {
            return array('unit' => $parentUnit, 'status' => false,
                'message' => 'Unit is already linked to this parent', 'reply' => $reply['reply']);
        }
        $reply = Lib::SendQueryToMDB("insertlist|$parentUnit|UBuiltFrom|UWin|1|$childUnit");
        if (!$reply['status']) return $reply;
        if (!isset($reply['reply'][1]) || (string)$reply['reply'][1] !== '1') {
            return array('unit' => $parentUnit, 'status' => false,
                'message' => 'Failed to link unit', 'reply' => $reply['reply']);
        }
        return array('unit' => $parentUnit, 'status' => true,
            'message' => 'Unit linked', 'reply' => $reply['reply']);
    }
}
class Quarantine {
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
     */
    public static function Check($unit)
    {
        $UnitStatus = Unit::GetStatus($unit);

        if (!$UnitStatus['status']) {
            return $UnitStatus;
        }

        if ($UnitStatus['reply']['status'] == 4) {
            return array(
                "unit"  => $unit,
                "status"  => false,
                "message" => "Unit is Quarantined",
                "reply"    => null
            );
        } else {
            return array(
                "unit"  => $unit,
                "status"  => true,
                "message" => "Quarantine Check Passed",
                "reply"    => null
            );
        }
    }
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
     */
    public static function CheckAll($unit)
    {
        $visited = array();
        $queue = array($unit);
        $visited[$unit] = true;

        while (!empty($queue)) {
            $current = array_shift($queue);

            $QuarantineCheck = Quarantine::Check($current);
            if (!$QuarantineCheck['status']) {
                return $QuarantineCheck;
            }

            $childrens = Unit::GetChildren($current);
            $children = !empty($childrens['reply']) && is_array($childrens['reply']) ? $childrens['reply'] : array();

            foreach ($children as $child) {
                if (empty($visited[$child])) {
                    $visited[$child] = true;
                    $queue[]         = $child;
                }
            }
        }

        return array(
            "unit"    => $unit,
            "status"  => true,
            "message" => "Quarantine Check Passed",
            "reply"   => null
        );
    }
}
class Route {
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
     */
    public static function Check($unit, $process) {
        $UnitStatus = Unit::GetStatus($unit);

        if (!$UnitStatus['status']) {
            return $UnitStatus;
        }

        if ($UnitStatus['reply']['status'] == 4) {
            return array(
                "unit"  => $unit,
                "status"  => false,
                "message" => "Unit is Quarantined",
                "reply"    => $UnitStatus
            );
        }

        if ($UnitStatus['reply']['status'] == 3) {
            return array(
                "unit"  => $unit,
                "status"  => false,
                "message" => "Unit is Scrapped",
                "reply"    => $UnitStatus
            );
        }

        $query = "routecheck|$process|$unit";
        $resp = Lib::SendQueryToMDB($query);

        if (!$resp['status']) {
            return $resp;
        }

        if ($resp['reply'][2] != 1 || $resp['reply'][1] != 1 ) {
            $error = str_replace("\\n"," ",$resp['reply'][4]);
            return array(
                "unit"  => $unit,
                "status"  => false,
                "message" => $error . " For unit: " . $unit,
                "reply"    => $resp
            );
        }

        return array(
            "unit"  => $unit,
            "status"  => true,
            "message" => "Route Check Passed",
            "reply"    => $resp
        );
    }
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
     */
    public static function CheckAll($unit, $process)
    {
        $visited = array();
        $queue = array($unit);
        $visited[$unit] = true;
        $unitsChecked = array($unit);

        while (!empty($queue)) {
            $current = array_shift($queue);

            $RouteCheck = Route::Check($current, $process);
            if (!$RouteCheck['status']) {
                return $RouteCheck;
            }

            $childrens = Unit::GetChildren($current);
            $children = !empty($childrens['reply']) && is_array($childrens['reply']) ? $childrens['reply'] : array();

            foreach ($children as $child) {
                if (empty($visited[$child])) {
                    $visited[$child] = true;
                    $unitsChecked[]  = $child;
                    $queue[]         = $child;
                }
            }
        }

        return array(
            "unit"    => $unit,
            "status"  => true,
            "message" => "Route Check Passed",
            "reply"   => array(
                "UnitsChecked" => $unitsChecked
                ),
        );
    }
    public static function GetList()
    {
        $reply = null;
        $query = "getkeylist|Part|3";
        $resp = Lib::SendQueryToMDB($query);

        if (!$resp['status']) {
            return array(
                "unit"  => null,
                "status"  => false,
                "message" => $resp['reply'][2],
                "reply"    => $resp
            );
        }

        $rows = array_slice($resp['reply'],4);
        foreach ($rows as $item) {
            $m = "";
            if (preg_match('/^(\S+)\s*(.*)$/u', $item, $m)) {
                $reply[] = array(
                    "key" => $m[1],
                    "description" => $m[2]
                );
            }
        }

        return array(
            "unit"  => null,
            "status"  => true,
            "message" => "Successfully got Route List",
            "reply"    => $reply
        );
    }
}
class Hold {
    /**
     * Check Hold status from TCL-style .hold files.
     *
     * If $process is '', returns all hold; if a process is given, checks that one.
     *
     * @param string $unit
     * @param string|null $process [optional]
     * @return array{
     *   unit: string,
     *   status: bool,
     *   message: string,
     *   processlist?: array<string,string>,
     * }
     */
    public static function Check($unit, $process = null) {
        $HoldDir = realpath("/fis/mantis/data/database/unithold");

        if ($HoldDir === false) {
            return array(
                "unit"    => $unit,
                "status"  => false,
                "message" => "Hold directory not found",
                "reply"   => null
            );
        }

        $Holdfile = $HoldDir . "/" . $unit . ".hold";
        if (!file_exists($Holdfile)) {
            return array(
                "unit"  => $unit,
                "status"  => true,
                "message" => "Hold Check Passed",
                "reply"    => null
            );
        }

        if (!is_file($Holdfile) || !is_readable($Holdfile)) {
            return array(
                "unit"    => $unit,
                "status"  => false,
                "message" => "Could not read the hold file: not readable or not a file",
                "reply"   => $Holdfile
            );
        }

        $content = @file_get_contents($Holdfile);
        if ($content === false) {
            $err = error_get_last();
            return array(
                "unit"    => $unit,
                "status"  => false,
                "message" => "Could not read the hold file: " . ($err ? $err['message'] : 'unknown error'),
                "reply"   => null
            );
        }

        $hold = array();
        $matches = array();
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
                $val = $m[3] !== '' ? stripcslashes($m[3]) : ($m[4] !== '' ? $m[4] : $m[5]);
                $hold[$key] = $val;
            }
        }

        $processlist = array();
        $rc = null;

        if (empty($hold)) {
            $rc = 1;
        }
        elseif ($process === '') {

            $processlist = $hold;
            $rc = 0;
        }
        elseif (isset($hold[$process])) {
            $processlist = array($process => $hold[$process]);
            $rc = 0;
        }
        else {
            $rc = 1;
        }

        return array(
            "unit"        => $unit,
            "status"      => !(($rc === 0)),
            "message"     => ($rc === 0) ? "Hold data found" : "No hold",
            "processlist" => $processlist
        );
    }
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
     */
    public static function CheckAll($unit, $process) {
        $visited = array();
        $queue = array($unit);
        $visited[$unit] = true;
        $unitsChecked = array($unit);

        while (!empty($queue)) {
            $current = array_shift($queue);

            $HoldCheck = Hold::Check($current, $process);
            if (!$HoldCheck['status']) {
                return $HoldCheck;
            }

            $childrens = Unit::GetChildren($current);
            $children = !empty($childrens['reply']) && is_array($childrens['reply']) ? $childrens['reply'] : array();

            foreach ($children as $child) {
                if (empty($visited[$child])) {
                    $visited[$child] = true;
                    $unitsChecked[]  = $child;
                    $queue[]         = $child;
                }
            }
        }

        return array(
            "unit"    => $unit,
            "status"  => true,
            "message" => "Hold Check Passed",
            "reply"   => array(
                "UnitsChecked" => $unitsChecked
            ),
        );
    }
}
class Lib
{
    /**
     * Append a DEBUG line to app log.
     *
     * @param string $scriptName
     * @param string $message
     * @return void
     */
    public static function ShowDebug($scriptName, $message)
    {
        $logDir = "/fis/mantis/data/log/";
        $pid = getmypid();
        $now = date("m/d/y H:i:s");

        if (!is_string($scriptName) || trim($scriptName) === '') {
            $scriptName = "unknown_script";
        } else {
            $scriptName = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $scriptName);
        }

        if (!is_dir($logDir)) {
            @mkdir($logDir, 0775, true);
        }

        if (!is_dir($logDir) || !is_writable($logDir)) {
            return;
        }

        $logFile = $logDir . $scriptName . ".log";

        if (!is_string($message)) {
            $message = print_r($message, true);
        }

        $fp = @fopen($logFile, "a");
        if ($fp === false) {
            return;
        }

        $logLine = sprintf("DEBUG 0 [%s] %s %s\n", $pid, $now, $message);

        @fwrite($fp, $logLine);
        @fclose($fp);
    }

    public static function GetUserGroup($hname) {
        $decoded = self::DecodeJson($hname);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded) && isset($decoded['hname'])) {
            $hname = $decoded['hname'];
        }

        $usersDb = new \mysqli("localhost", "root", "just4core", "users");
        if ($usersDb->connect_error) {
            die("Connection failed: " . $usersDb->connect_error);
        }

        $stmt = $usersDb->prepare("SELECT pk, userId FROM tbl_users WHERE name = ? LIMIT 1");
        if (!$stmt) {
            die("Prepare failed: " . $usersDb->error);
        }
        $stmt->bind_param("s", $hname);
        $stmt->execute();
        $stmt->bind_result($user_pk, $userId);

        if (!$stmt->fetch()) {
            $stmt->close();
            $usersDb->close();
            return "Error: User not found";
        }
        $stmt->close();
        $usersDb->close();

        $groupsDb = new \mysqli("localhost", "root", "just4core", "groups");
        if ($groupsDb->connect_error) {
            die("Connection failed: " . $groupsDb->connect_error);
        }

        $result = $groupsDb->query("SELECT tableName FROM groupList");
        if (!$result) {
            $groupsDb->close();
            return "Error: Cannot fetch groups";
        }

        $groups = array();
        while ($row = $result->fetch_assoc()) {
            $groups[] = $row["tableName"];
        }

        foreach ($groups as $group) {
            $groupEscaped = $groupsDb->real_escape_string($group);
            $sql = "SELECT 1 FROM `$groupEscaped` WHERE user_fk = ? LIMIT 1";
            $stmt = $groupsDb->prepare($sql);

            $stmt->bind_param("i", $user_pk);
            $stmt->execute();
            $stmt->store_result();

            if ($stmt->num_rows > 0) {
                $stmt->close();
                if (!isset($user_groups)) {
                    $user_groups = array();
                }
                $user_groups[] = $group;
            }
        }

        if (isset($user_groups)) {
            $groupsDb->close();
            return $user_groups;
        } else {
            $groupsDb->close();
            return "Error: No group found for user";
        }
    }

    public static function GetCartonFormat($CARTON_QUANTITY) {
        $DB_Connection = new \mysqli("localhost", "root", "just4core", "User_Interface_Tables");

        $Carton_Quantity_Escaped = $DB_Connection->real_escape_string($CARTON_QUANTITY);
        $sql = "SELECT Computed_Format FROM `CartonTypesInterface` WHERE Computed_Quantity = ? LIMIT 1";
        $stmt = $DB_Connection->prepare($sql);

        if (!$stmt) {
            $message = "Error preparing statement for Carton_Quantity '$Carton_Quantity_Escaped': " . $DB_Connection->error;
            LibShowError("Lib", $message);
            return "Error";
        }

        $stmt->bind_param("i", $Carton_Quantity_Escaped);
        $stmt->execute();
        $stmt->store_result();
        $stmt->bind_result($Carton_Format);

        if ($stmt->num_rows > 0) {
            $stmt->fetch();
            $stmt->close();
            $DB_Connection->close();
            return $Carton_Format;
        } else {
            $stmt->close();
            $DB_Connection->close();
            return "Error";
        }
    }
    /**
     * Append an ERROR line to app log.
     *
     * @param string $scriptName
     * @param string $message
     * @return void
     */
    public static function ShowError($scriptName, $message)
    {
        $logDir = "/fis/mantis/data/log/";
        $pid = getmypid();
        $now = date("m/d/y H:i:s");

        if (!is_string($scriptName) || trim($scriptName) === '') {
            $scriptName = "unknown_script";
        } else {
            $scriptName = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $scriptName);
        }

        if (!is_dir($logDir)) {
            @mkdir($logDir, 0775, true);
        }

        if (!is_dir($logDir) || !is_writable($logDir)) {
            return;
        }

        $logFile = $logDir . $scriptName . ".log";

        if (!is_string($message)) {
            $message = print_r($message, true);
        }

        $fp = @fopen($logFile, "a");
        if ($fp === false) {
            return;
        }

        $logLine = sprintf("ERROR 0 [%s] %s %s\n", $pid, $now, $message);

        @fwrite($fp, $logLine);
        @fclose($fp);
    }
    /**
     * Low-level wrapper to submit an MDB query via shell script.
     *
     * @param string $query
     * @return string Raw output
     */
    public static function sendToMDB($query) {
        $mdbConfig = "/fis/mantis/common/apps/local/bin/atdb_submit.sh";
        $mdbCall = $mdbConfig . " " . escapeshellarg($query);
        return shell_exec($mdbCall);
    }
    /**
     * Decode a JSON string tolerant of BOM and slashes.
     *
     * @param string $jsonString
     * @return mixed
     */
    public static function DecodeJson($jsonString) {
        $cleaned = trim($jsonString);
        $cleaned = trim(preg_replace('/^\xEF\xBB\xBF/', '', $cleaned));
        $cleaned = stripslashes($cleaned);
        return json_decode($cleaned, true);
    }
    /**
     * Send an MDB query and normalize the reply.
     *
     * Detects 'trkrptdlm' (space-delimited) vs pipe-delimited replies,
     * retries on timeout, and returns a standard structure.
     *
     * @param string $query
     * @return array{
     *   status: bool,
     *   message: string,
     *   reply: mixed,
     * }
     */
    public static function SendQueryToMDB($query) {
        $mdb_reply = Lib::sendToMDB($query);

        // $split_reply = explode("|", $mdb_reply);

        // if (isset($split_reply[1]) && $split_reply[1] !== 1 && preg_match("/Time out error/", implode('|', $split_reply))) {
        //     usleep(10);
        //     $mdb_reply = Lib::sendToMDB($query);
        //     $split_reply = explode('|', $mdb_reply);
        // }

        // if (!isset($split_reply[1])) {
        //     $message = "Unexpected database reply format: missing index 1.";
        //     return array(
        //         "status" => false,
        //         "message" => $message,
        //         "reply" => null
        //     );
        // }

        // if ($split_reply[1] !== 1 && preg_match("/Time out error/", implode('|', $split_reply))) {
        //     $status = false;
        //     $message = "Database timeout error";
        // } else {
        //     $status = true;
        //     $message = "Succesfully recived replay from MDB";
        // }

        // return array(
        //     "status" => $status,
        //     "message" => $message,
        //     "reply" => $split_reply
        // );

        if (strpos($query, "trkrptdlm") !== false){
            $split_reply = explode(" ", str_replace("\n", "", $mdb_reply));
            $temp = explode( "|",$split_reply[0]);
            if (isset($temp[1]) && $temp[1] == 0 && preg_match("/Time out error/", implode('|', $temp))) {
                usleep(100000);
                $mdb_reply = Lib::sendToMDB($query);
                $split_reply = explode(" ", str_replace("\n", "", $mdb_reply));
                $temp = explode( "|",$split_reply[0]);
            }

            if (!isset($temp[1])) {
                $message = "Unexpected database reply format: missing index 1.";
                return array(
                    "status"  => false,
                    "message" => $message,
                    "reply"    => null
                );
            }

            if ($temp[1] == 0 && preg_match("/Time out error/", implode('|', $temp))) {
                $status = false;
                $message = "Database timeout error";
            } else {
                $message = "Succesfully recived replay from MDB";
                $status = true;
            }

            return array(
                "status"  => $status,
                "message" => $message,
                "reply"    => $split_reply
            );
        } else {
            $split_reply = explode('|', str_replace("\n", "", $mdb_reply));
            if (isset($split_reply[1]) && $split_reply[1] == 0 && preg_match("/Time out error/", implode('|', $split_reply))) {
                usleep(10);
                $mdb_reply = Lib::sendToMDB($query);
                $split_reply = explode('|', $mdb_reply);
            }

            if (!isset($split_reply[1])) {
                $message = "Unexpected database reply format: missing index 1.";
                return array(
                    "status" => false,
                    "message" => $message,
                    "reply" => null
                );
            }

            if ($split_reply[1] == 0 && preg_match("/Time out error/", implode('|', $split_reply))) {
                $status = false;
                $message = "Database timeout error";
            } else {
                $status = true;
                $message = "Succesfully recived replay from MDB";
            }

            if (strpos($query,"getprocev") !== false) {
                return array(
                    "status" => $status,
                    "message" => $message,
                    "reply" => $mdb_reply
                );
            } else {
                return array(
                    "status" => $status,
                    "message" => $message,
                    "reply" => $split_reply
                );
            }
        }
    }
    /**
     * Normalize a unit: strip CR/LF, replace '?' and space with underscore.
     *
     * @param string $unit
     * @return string
     */
    public static function replaceCharsInUnit($unit) {
        $unit = preg_replace("/[\n]/", "", $unit);
        $unit = preg_replace("/[\xd]/", "", $unit);
        $unit = preg_replace("/[\xa]/", "", $unit);
        $unit = preg_replace("/[\x3f]/", "_", $unit);
        $unit = preg_replace("/[\x20]/", "_", $unit);
        return $unit;
    }
    /**
     * Read POST body depending on Content-Type (JSON or multipart/form-data).
     *
     * @param string $contentType
     * @param string $filename
     * @return array|null
     */
    public static function getForm($contentType, $filename){
        $contentType = (string)$contentType;

        if (stripos($contentType, 'application/json') !== false) {
            $raw = file_get_contents('php://input');
            self::ShowDebug($filename, "Raw JSON body: ".$raw);
            return self::DecodeJson($raw);
        }

        if (stripos($contentType, 'multipart/form-data') !== false) {
            self::ShowDebug($filename, 'Multipart form-data: ' . json_encode($_POST));
            return $_POST;
        }

        if (stripos($contentType, 'application/x-www-form-urlencoded') !== false) {
            self::ShowDebug($filename, 'Form-URLENCODED: ' . json_encode($_POST));
            return $_POST;
        }

        self::ShowDebug($filename, "Unknown Content-Type: ".$contentType);
        return null;
    }
    /** Read a trimmed scalar string from decoded JSON or form data. */
    public static function GetArrayString($data, $key)
    {
        if (empty($data) || !array_key_exists($key, $data) || !is_scalar($data[$key])) {
            return null;
        }
        $value = trim(strip_tags((string)$data[$key]));
        return $value !== '' ? $value : null;
    }

    public static function GetArrayInt($data, $key)
    {
        if (empty($data) || !array_key_exists($key, $data)) {
            return null;
        }
        $value = filter_var($data[$key], FILTER_VALIDATE_INT, array('flags' => FILTER_NULL_ON_FAILURE));
        return is_int($value) ? $value : null;
    }

    public static function GetArrayBool($data, $key)
    {
        if (empty($data) || !array_key_exists($key, $data)) {
            return null;
        }
        return filter_var($data[$key], FILTER_VALIDATE_BOOLEAN, array('flags' => FILTER_NULL_ON_FAILURE));
    }
}
class Language {
    private static $defaultLanguage = "English";

    /**
     * Map code (e.g. "pl") to human-readable language name.
     * @param string $code
     * @return string
     */
    private static function GetLanguageName($code) {
        $Language = array(
            'pl' => 'Polski',
            'en' => 'English',
            'de' => 'Deutsch',
            'uk' => 'Ukrainski',
        );
        return isset($Language[$code]) ? $Language[$code] : $code;
    }

    /**
     * Retrieve a translated phrase for a given language.
     *
     * Looks up a phrase key in the language database and returns its translated
     * value based on the provided (or default) language. On error or when the
     * phrase is not found, returns status=false and reply=null.
     *
     * @param string $Phrase Phrase key/name to translate (must be non-empty).
     * @param string|null $LanguageCode Optional language code; if null, default language is used.
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
     */

    public static function GetPhrase($Phrase, $LanguageCode = null)
    {
        $Phrase = trim((string)$Phrase);
        if ($LanguageCode !== null) {
            $LanguageCode = trim((string)$LanguageCode);
        }

        if ($Phrase === '') {
            return array(
                "status"  => false,
                "message" => "Language::GetPhrase: Phrase cannot be empty",
                "reply"   => null,
            );
        }

        if ($LanguageCode === null || $LanguageCode === '') {
            $Language = self::$defaultLanguage;
        } else {
            $Language = self::GetLanguageName($LanguageCode);
            if ($Language === null || $Language === '') {
                return array(
                    "status"  => false,
                    "message" => 'Language::GetPhrase: Unknown/invalid language code "' . $LanguageCode . '"',
                    "reply"   => null,
                );
            }
        }

        $config = @parse_ini_file('/fis/mantis/custom/database/config.ini', true);
        if ($config === false || !isset($config['database'])) {
            return array(
                "status"  => false,
                "message" => "Database config not found or invalid",
                "reply"   => null,
            );
        }

        $DB_HOST = $config['database']['host'];
        $DB_USER = $config['database']['user'];
        $DB_PASS = $config['database']['password'];
        $DB_NAME = "language";

        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

        $db = null;
        $stmt = null;

        try {
            $db = new \mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);

            if ($db->connect_errno) {
                return array(
                    "status"  => false,
                    "message" => 'Language::GetPhrase: MySQL connect error (' . $db->connect_errno . '): ' . $db->connect_error,
                    "reply"   => null,
                );
            }

            $sql = "
            SELECT p.phrase AS phrase_value
            FROM language.phrases AS p
            LEFT JOIN language.language  AS l ON p.language_fk   = l.pk
            LEFT JOIN language.phrase_id AS i ON p.phrase_id_fk  = i.pk
            WHERE l.name = ? AND i.name = ?
            LIMIT 1
        ";

            $stmt = $db->prepare($sql);
            if (!$stmt) {
                $msg = 'Language::GetPhrase: MySQL prepare error: ' . $db->error;
                $db->close();
                return array("status" => false, "message" => $msg, "reply" => null);
            }

            $stmt->bind_param("ss", $Language, $Phrase);
            $stmt->execute();

            $phraseValue = null;
            $stmt->bind_result($phraseValue);

            if ($stmt->fetch()) {
                $msg = 'Language::GetPhrase: phrase "' . $Phrase . '" found in language "' . $Language . '"';
                $stmt->close();
                $db->close();
                return array(
                    "status"  => true,
                    "message" => $msg,
                    "reply"   => $phraseValue,
                );
            }

             if ($Language !== self::$defaultLanguage) {
                 $stmt->close();
                 $stmt = $db->prepare($sql);
                 $stmt->bind_param("ss", self::$defaultLanguage, $Phrase);
                 $stmt->execute();
                 $stmt->bind_result($phraseValue);
                 if ($stmt->fetch()) {
                     $msg = 'Language::GetPhrase: phrase "' . $Phrase . '" not found in "' . $Language . '", used default "' . self::$defaultLanguage . '"';
                     $stmt->close();
                     $db->close();
                     return array("status" => true, "message" => $msg, "reply" => $phraseValue);
                 }
             }

            $stmt->close();
            $db->close();

            return array(
                "status"  => false,
                "message" => 'Language::GetPhrase: no match for phrase "' . $Phrase . '" in language "' . $Language . '"',
                "reply"   => null,
            );
        } catch (\mysqli_sql_exception $e) {
            if ($stmt instanceof \mysqli_stmt) { @$stmt->close(); }
            if ($db   instanceof \mysqli)     { @$db->close(); }
            return array(
                "status"  => false,
                "message" => 'Language::GetPhrase: MySQL error: ' . $e->getMessage(),
                "reply"   => null,
            );
        }
    }
}
class Process {
    public static function GetList() {
        $query = "getkeylist|Process|3";
        $reply = Lib::SendQueryToMDB($query);
        $replay = array();

        if (!$reply['status']) {
            return $reply;
        }

        foreach (array_slice($reply['reply'],4) as $line) {
            $m = null;
            if (preg_match('/^([^ ]*)(.*)$/u', $line, $m)) {
                $id   = isset($m[1]) ? $m[1] : '';
                $name = isset($m[2]) ? $m[2] : '';
                $replay[] = array(
                    "key" => trim($id),
                    "description" => trim($id) . " - " . trim($name),
                );
            }
        }

        if (count($replay) == 0) {
            return array(
                "status"  => false,
                "message" => "Process::GetList: No processes found",
                "reply"   => $replay,
            );
        }
        return array(
            "status"  => true,
            "message" => "Got process list",
            "reply"   => $replay,
        );
    }
}
class Station
{
    public static function GetList()
    {
        $query = "getkeylist|Station|3";
        $reply = Lib::SendQueryToMDB($query);
        if (!$reply['status']) {
            return array(
                "status"  => false,
                "message" => "Station::GetList Eroor: " . $reply['reply'][2],
                "reply" => null
            );
        }

        $replay = array();
        foreach (array_slice($reply['reply'],4) as $line) {
            $m = explode(" ", $line,2);
            $id   = isset($m[0]) ? $m[0] : '';
            $name = isset($m[1]) ? $m[1] : '';
            $replay[] = array(
                "key" => trim($id),
                "description" => trim($id) . " - " . trim($name),
            );
        }
        return array(
            "status"  => true,
            "message" => "Got station list",
            "reply"   => $replay,
        );
    }
}
class Report {

    private static $datasources = array("Real-Time", "RunRealTime", "Historical", "RunLongTerm");
    private static $TMPDIR = "/fis/mantis/data/tmp";

    public static $argsArr = array();
    private static $isAutoReport = 0;

    private static $defaults = array(
        "report"   => "",
        "title"    => "",
        "option"   => "",
        "from"     => "",
        "to"       => "",
        "maxevent" => 50000,
        "process"  => array(),
        "station"  => array(),
        "unit"     => "",
        "status"   => "",
        "part"     => array(),
        "userkey1" => array(),
        "userkey2" => array(),
        "userkey3" => array(),
        "dc"       => array(),
        "dclogic"  => "0",
        "dcmod"    => "",
        "operator" => array(),
        "flowtype" => array(),
        "dcgroup"  => array(),
    );

    public static function getDatadefault()
    {
        return self::$datasources[1];
    }

    public static function GetList()
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
                $e->getCode(),
                $e
            );
        }
    }

    public static function RunReport($args = array())
    {
        $returnValue = 0;

        if (!is_array($args)) {
            $args = array();
        }

        try {
            self::$argsArr = array_merge(self::$defaults, $args);

            if (empty(self::$argsArr['maxevent'])) {
                self::$argsArr['maxevent'] = 50000;
            }

            $returnValue = call_user_func(array(__CLASS__, self::getDatadefault()));

        } catch (InvalidArgumentException $e) {
            Lib::ShowError("Reports.php", "Invalid argument: " . print_r($e, true));
        } catch (LogicException $e) {
            Lib::ShowError("Reports.php", "Logic error: " . print_r($e, true));
        } catch (UnexpectedValueException $e) {
            Lib::ShowError("Reports.php", "Unexpected value: " . print_r($e, true));
        } catch (RuntimeException $e) {
            Lib::ShowError("Reports.php", print_r($e, true));
        } catch (Exception $e) {
            Lib::ShowError("Reports.php", "Report::RunReport Exception Error: " . print_r($e, true));
        }
        return $returnValue;
    }

    private static function writeUserKey($fp, $values, $label)
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
    private static function RunRealTime()
    {
        $a = self::$argsArr;
        $options = $a['option'];

        $fileOpt = "";
        $fileInput = "";
        $fileOutput = "";

        if ($a['report'] == "X_MANTIS") {
            $pid = getmypid();

            $fileOpt = $pid . "_" . uniqid('', true) . "_opt.tmp";
            $fileInput = $pid . "_" . uniqid('', true) . "_i.tmp";
            $fileOutput = $pid . "_" . uniqid('', true) . "_o.tmp";

            $tmp = self::$TMPDIR;

            $fp = fopen($tmp . DIRECTORY_SEPARATOR . $fileInput, "w");
            $fp1 = fopen($tmp . DIRECTORY_SEPARATOR . $fileOutput, "w");
            $fp2 = fopen($tmp . DIRECTORY_SEPARATOR . $fileOpt, "w");
            fwrite($fp2, $a['option'] . "\n");
            fclose($fp);
            fclose($fp1);
            fclose($fp2);

            $options = $fileOpt;
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

        if (trim($a['from']) === "") {
            Lib::ShowError("Reports.php", "No FROM time specified! (query: '" . $query . "')");
            return 0;
        }

        $reply = Lib::sendToMDB($query);

        file_put_contents("/fis/mantis/data/log/php_raww.txt", Lib::sendToMDB($query));
        $response = explode("|", $reply);
        $report = implode("| ", array_slice($response, 2));
        $report = preg_replace('/(?=\d{6}\.\d{6})/', "\n", $report);
        $report = ltrim($report, "\n");

        $tmp = self::$TMPDIR;
        $fileInputPath = $tmp . DIRECTORY_SEPARATOR . $fileInput;
        $fileOutputPath = $tmp . DIRECTORY_SEPARATOR . $fileOutput;

        $outdata1 = @fopen($fileOutputPath, "a");
        if ($outdata1 === false) {
            fwrite(STDERR, "Cannot open fname: " . $fileOutput . "\n");
        } else {
            fwrite($outdata1, $report);
            fclose($outdata1);
        }

        $repdata1 = @fopen($fileInputPath, "a");
        if ($repdata1 === false) {
            fwrite(STDERR, "Cannot open fname: " . $fileInput . "\n");
        } else {
            fwrite($repdata1, "*           Title :  " . $a['title'] . "\n");
            fwrite($repdata1, "*         Options :  " . $fileOpt . "\n");
            fwrite($repdata1, "*     Report Name :  " . $a['report'] . "\n");
            fwrite($repdata1, "*  Maximum Events :  " . $a['maxevent'] . "\n");
            fwrite($repdata1, "*            From :  " . $a['from'] . "\n");
            fwrite($repdata1, "*              To :  " . $a['to'] . "\n");

            if ($a['station'] !== "") {
                fwrite($repdata1, "*         Station :  " . implode(",&nbsp", (array)$a['station']) . "\n");
            }
            if ($a['process'] !== "") {
                fwrite($repdata1, "*         Process :   " . implode(",&nbsp", (array)$a['process']) . "\n");
            }
            self::writeUserKey($repdata1, $a['userkey1'], "* Prod Family-UK1 :   ");
            self::writeUserKey($repdata1, $a['userkey2'], "* Prod Number-UK2 :   ");
            self::writeUserKey($repdata1, $a['userkey3'], "* Prod Type-UK3 :   ");

            if ($a['dc'] !== "") {
                $dcArr = (array)$a['dc'];
                fwrite($repdata1, "*       Descript:   " . array_shift($dcArr));
                foreach ($dcArr as $dc) {
                    fwrite($repdata1, ",&nbsp" . $dc);
                }
                fwrite($repdata1, "\n");

                if ($a['dclogic'] === "0") {
                    fwrite($repdata1, "*        DC Logic :  OR\n");
                } else {
                    fwrite($repdata1, "*        DC Logic :  AND\n");
                }
            }
            if ($a['dcmod'] !== "") {
                fwrite($repdata1, "*        Modifier :  " . $a['dcmod'] . "\n");
            }

            fwrite($repdata1, $report);
            fclose($repdata1);
        }


        $repType = (self::$isAutoReport === 1) ? "yes_autoreport" : "no_autoreport";

        $cmd = "/fis/mantis/common/apps/local/reports/dqx_mantis " . $repType . " " . $fileInputPath . " " . $fileOutputPath;

        $execOut = array();
        $execStatus = 0;
        exec($cmd, $execOut, $execStatus);

        if ($execStatus !== 0) {
            Lib::ShowError("Reports.php","Could not run dqx_mantis, status=" . $execStatus . ", output=" . implode("\n", $execOut));
        }

        $contents = file_get_contents($fileOutputPath);
        if ($contents !== false) {
            $report = $contents;
        }

        return array(
            "status" => true,
            "message" => "Succusfuly retirved raport",
            "reply"   => $report,
        );
    }

    private static function RunLongTerm()
    {
        // TODO: iteracja po dniach z krokiem 26h, czytanie .gz z LNGTRMDIR,
        //       filtrowanie po part/uk1-3/unit/station/status/dc+dcmod,
        //       sort -r, rptwrapper, zapis do self::$report.
        return 0;
    }
}