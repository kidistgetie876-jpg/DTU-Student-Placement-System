CREATE TABLE IF NOT EXISTS streams (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_streams_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS colleges (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    stream_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_colleges_name_stream (name, stream_id),
    CONSTRAINT fk_colleges_stream
        FOREIGN KEY (stream_id) REFERENCES streams (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO streams (name) VALUES ('Natural'), ('Social');

INSERT IGNORE INTO colleges (name, stream_id)
SELECT seeded.name, streams.id
FROM (
    SELECT 'Gafat Institute of Technology' AS name, 'Natural' AS stream_name
    UNION ALL SELECT 'College of Natural and Computational Sciences', 'Natural'
    UNION ALL SELECT 'College of Agriculture and Environmental Sciences', 'Natural'
    UNION ALL SELECT 'College of Health Science', 'Natural'
    UNION ALL SELECT 'Freshman Faculty', 'Natural'
    UNION ALL SELECT 'College of Social Sciences and Humanities', 'Social'
    UNION ALL SELECT 'College of Business and Economics', 'Social'
    UNION ALL SELECT 'School of Law', 'Social'
) AS seeded
INNER JOIN streams
    ON streams.name COLLATE utf8mb4_unicode_ci
        = seeded.stream_name COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO streams (name)
SELECT DISTINCT CASE
    WHEN LOWER(TRIM(stream)) LIKE '%natural%' THEN 'Natural'
    WHEN LOWER(TRIM(stream)) LIKE '%social%' THEN 'Social'
    ELSE TRIM(stream)
END
FROM departments
WHERE stream IS NOT NULL AND TRIM(stream) <> '';

INSERT IGNORE INTO colleges (name, stream_id)
SELECT DISTINCT TRIM(departments.college_name), streams.id
FROM departments
INNER JOIN streams
    ON streams.name COLLATE utf8mb4_unicode_ci
        = (CASE
            WHEN LOWER(TRIM(departments.stream)) LIKE '%natural%' THEN 'Natural'
            WHEN LOWER(TRIM(departments.stream)) LIKE '%social%' THEN 'Social'
            ELSE TRIM(departments.stream)
        END) COLLATE utf8mb4_unicode_ci
WHERE departments.college_name IS NOT NULL
  AND TRIM(departments.college_name) <> ''
  AND departments.stream IS NOT NULL
  AND TRIM(departments.stream) <> '';
