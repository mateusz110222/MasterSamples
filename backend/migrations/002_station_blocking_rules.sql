-- NEW INSTALLATION: run after 001_initial_schema.sql.
-- May also create the rules table when the current core schema already exists.
-- No old exclusions are imported and no rules are enabled automatically.
USE masterSample;

CREATE TABLE stationBlockingRules (
    FIS varchar(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    mode varchar(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    station varchar(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    disabled tinyint(1) NOT NULL DEFAULT 0,
    user varchar(100) NOT NULL,
    `date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (FIS, mode, station)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rule presence enables _MASTER blocking. An empty table disables it everywhere.
-- disabled is retained because current PHP selects/writes it, always as 0.
-- Configure real single/prefix rules through the dashboard after verification.
