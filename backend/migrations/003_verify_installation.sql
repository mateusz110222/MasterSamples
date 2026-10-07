-- READ-ONLY checks after 001 and 002; safe to repeat.
USE masterSample;

SELECT VERSION() AS mysql_version, DATABASE() AS configured_database;
SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'masterSample'
  AND TABLE_NAME IN ('masterUnits', 'history', 'engineers', 'mails', 'stationBlockingRules')
ORDER BY TABLE_NAME;

SHOW COLUMNS FROM masterUnits;
SHOW COLUMNS FROM history;
SHOW COLUMNS FROM engineers;
SHOW COLUMNS FROM mails;
SHOW CREATE TABLE stationBlockingRules;

SELECT COUNT(*) AS configured_blocking_rules FROM stationBlockingRules;
SELECT FIS, mode, station, disabled, user, `date`
FROM stationBlockingRules ORDER BY FIS, mode, station;
-- Fresh installation: five InnoDB tables, history.FIS exists, rule count is 0.
