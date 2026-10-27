ALTER TABLE placement_results
    ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
    ADD INDEX idx_placement_results_published_department (is_published, dept_id);

UPDATE placement_results
SET is_published = 1,
    status = 'Published'
WHERE LOWER(TRIM(status)) IN ('approved', 'published');
