ALTER TABLE placement_results
    ADD COLUMN id_number VARCHAR(50) NULL AFTER student_id;

UPDATE placement_results pr
LEFT JOIN student_data sd ON sd.user_id = pr.student_id
LEFT JOIN users u ON u.id = pr.student_id
SET pr.id_number = COALESCE(NULLIF(sd.id_number, ''), u.id_number)
WHERE pr.id_number IS NULL OR pr.id_number = '';