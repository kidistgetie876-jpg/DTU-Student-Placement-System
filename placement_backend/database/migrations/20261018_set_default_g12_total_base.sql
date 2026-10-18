ALTER TABLE placement_settings
    MODIFY COLUMN g12_total_base DECIMAL(10,2) NOT NULL DEFAULT 600;

UPDATE placement_settings
SET g12_total_base = 600
WHERE g12_total_base = 100;
