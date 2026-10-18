-- DESTRUCTIVE: test-environment reset only. Back up the selected database first.
-- This repository uses users(role='student'), student_data, placement_results,
-- student_choices, moshe_students, and sims_students rather than tables named
-- students, student_scores, and placements.
-- Preview the affected counts below before running the DELETE statements.

USE placement_db;

SELECT DATABASE() AS selected_database;

SELECT COUNT(*) AS student_accounts
FROM users
WHERE LOWER(role) = 'student';

SELECT COUNT(*) AS student_profiles_and_scores
FROM student_data;

SELECT COUNT(*) AS placement_records
FROM placement_results;

SELECT COUNT(*) AS student_choice_records
FROM student_choices;

SELECT COUNT(*) AS moshe_import_records
FROM moshe_students;

SELECT COUNT(*) AS sims_import_records
FROM sims_students;

-- Run only after confirming this is the local/test database.
START TRANSACTION;

DELETE FROM placement_results;
DELETE FROM student_choices;
DELETE FROM student_appeals
WHERE student_id IN (SELECT id FROM users WHERE LOWER(role) = 'student');
DELETE FROM student_notifications
WHERE student_id IN (SELECT id FROM users WHERE LOWER(role) = 'student');
DELETE FROM password_reset_tokens
WHERE user_id IN (SELECT id FROM users WHERE LOWER(role) = 'student');
DELETE FROM unassigned_students
WHERE student_id IN (SELECT id FROM users WHERE LOWER(role) = 'student');
DELETE FROM student_data
WHERE user_id IN (SELECT id FROM users WHERE LOWER(role) = 'student');
DELETE FROM users
WHERE LOWER(role) = 'student';

DELETE FROM moshe_students;
DELETE FROM sims_students;

COMMIT;
