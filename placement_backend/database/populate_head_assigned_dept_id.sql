USE placement_db;

-- The application's department assignment is stored in departments.head_id.
-- Preview the exact user-to-department mappings before changing users.
SELECT u.id AS user_id, u.username, u.role,
       d.id AS department_id, d.name AS department_name
FROM users u
JOIN departments d ON d.head_id = u.id
WHERE LOWER(TRIM(u.role)) IN ('head', 'department head', 'department_head')
ORDER BY u.id, d.id;

START TRANSACTION;

-- Update only heads with exactly one department assignment. Heads attached to
-- multiple departments are intentionally left unchanged for manual review.
UPDATE users u
JOIN departments d ON d.head_id = u.id
SET u.assigned_dept_id = d.id
WHERE LOWER(TRIM(u.role)) IN ('head', 'department head', 'department_head')
  AND u.assigned_dept_id IS NULL
  AND (
      SELECT COUNT(DISTINCT d2.id)
      FROM departments d2
      WHERE d2.head_id = u.id
  ) = 1;

COMMIT;

-- Confirm which department-head accounts remain without an assignment and
-- whether they have no department or more than one candidate.
SELECT u.id, u.username, u.role, u.assigned_dept_id,
       COUNT(DISTINCT d.id) AS matching_departments,
       GROUP_CONCAT(DISTINCT CONCAT(d.id, ': ', d.name) ORDER BY d.id SEPARATOR '; ') AS candidates
FROM users u
LEFT JOIN departments d ON d.head_id = u.id
WHERE LOWER(TRIM(u.role)) IN ('head', 'department head', 'department_head')
  AND u.assigned_dept_id IS NULL
GROUP BY u.id, u.username, u.role, u.assigned_dept_id
ORDER BY u.id;
