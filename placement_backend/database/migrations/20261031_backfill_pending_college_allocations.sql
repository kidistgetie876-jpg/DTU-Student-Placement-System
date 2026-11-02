UPDATE placement_college_allocations pca
JOIN student_choices sc
    ON TRIM(sc.admission_number) = TRIM(pca.admission_number)
  AND sc.semester = 2
JOIN departments d ON d.id = sc.dept_id
LEFT JOIN colleges c ON c.id = d.college_id
SET pca.college_id = d.college_id,
    pca.college_name = COALESCE(
        NULLIF(TRIM(d.college_name), ''),
        NULLIF(TRIM(c.name), ''),
        pca.college_name
    ),
    pca.stream = COALESCE(NULLIF(TRIM(d.stream), ''), pca.stream),
    pca.placement_group = COALESCE(NULLIF(TRIM(d.placement_group), ''), pca.placement_group)
WHERE pca.target_semester = 2
  AND LOWER(TRIM(pca.status)) = 'pending'
  AND LOWER(TRIM(d.status)) = 'active'
  AND COALESCE(NULLIF(TRIM(d.college_name), ''), NULLIF(TRIM(c.name), '')) IS NOT NULL
  AND sc.id = (
      SELECT sc_second.id
      FROM student_choices sc_second
      WHERE TRIM(sc_second.admission_number) = TRIM(pca.admission_number)
        AND sc_second.semester = 2
      ORDER BY COALESCE(sc_second.priority, 99), sc_second.id
      LIMIT 1
  )
  AND (
      LOWER(TRIM(COALESCE(pca.college_name, ''))) COLLATE utf8mb4_general_ci
        <> LOWER(TRIM(COALESCE(d.college_name, c.name, ''))) COLLATE utf8mb4_general_ci
      OR LOWER(TRIM(COALESCE(pca.placement_group, ''))) COLLATE utf8mb4_general_ci
        <> LOWER(TRIM(COALESCE(d.placement_group, ''))) COLLATE utf8mb4_general_ci
      OR LOWER(TRIM(COALESCE(pca.stream, ''))) COLLATE utf8mb4_general_ci
        <> LOWER(TRIM(COALESCE(d.stream, ''))) COLLATE utf8mb4_general_ci
      OR NOT (pca.college_id <=> d.college_id)
  );