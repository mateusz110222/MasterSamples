-- Run once on the masterSample database before deploying either updated backend.
-- Keep historical FIS unknown: the current master location does not prove its
-- location when an old event was recorded, especially after migration/deletion.
ALTER TABLE masterSample.history
    ADD COLUMN FIS varchar(100) DEFAULT NULL;
