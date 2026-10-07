-- NEW INSTALLATION ONLY. Run first on each distinct MySQL instance used by FIS.
-- Intentionally fails if masterSample already exists; this is not an upgrade.
-- No users, passwords or grants are created here.
CREATE DATABASE masterSample CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE masterSample;

CREATE TABLE masterUnits (
    id int NOT NULL AUTO_INCREMENT,
    unit varchar(100) NOT NULL,
    process varchar(100) NOT NULL,
    status varchar(100) NOT NULL,
    currentCounter int DEFAULT 0,
    maxCounter int DEFAULT NULL,
    errorCounter int DEFAULT 0,
    errorMaxCounter int DEFAULT NULL,
    globalCounter int DEFAULT 0,
    user varchar(100) DEFAULT NULL,
    isactive int DEFAULT 1,
    FIS varchar(100) DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY unit (unit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE history (
    id int NOT NULL AUTO_INCREMENT,
    unit varchar(100) NOT NULL,
    process varchar(100) DEFAULT NULL,
    status varchar(100) DEFAULT NULL,
    currentCounter int DEFAULT NULL,
    maxCounter int DEFAULT NULL,
    errorCounter int DEFAULT NULL,
    errorMaxCounter int DEFAULT NULL,
    globalCounter int DEFAULT NULL,
    FIS varchar(100) DEFAULT NULL,
    user varchar(100) DEFAULT NULL,
    operation varchar(50) DEFAULT NULL,
    `date` datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY history_unit_date (unit, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE engineers (
    id int NOT NULL AUTO_INCREMENT,
    process varchar(100) NOT NULL,
    mail varchar(100) DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY process (process)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mails (
    id int NOT NULL AUTO_INCREMENT,
    name varchar(100) NOT NULL,
    mail varchar(100) NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
