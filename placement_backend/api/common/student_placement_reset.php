<?php

function resetPlacementStateForFreshRun(mysqli $db, int $semester): void
{
    if (!in_array($semester, [1, 2], true)) {
        throw new InvalidArgumentException('A valid target semester (1 or 2) is required.');
    }

    $lockResult = $db->query("SELECT GET_LOCK('placement_engine', 10) AS lock_acquired");
    if (!$lockResult) {
        throw new RuntimeException('Unable to lock placement data for reset: ' . $db->error);
    }
    $lockAcquired = (int) ($lockResult->fetch_assoc()['lock_acquired'] ?? 0) === 1;
    $lockResult->free();
    if (!$lockAcquired) {
        throw new RuntimeException('Another placement run is already in progress.');
    }

    try {
        if (!studentPlacementTableExists($db, 'placement_results')) {
            throw new RuntimeException('The placement_results table is unavailable.');
        }
        $placementColumns = studentPlacementTableColumns($db, 'placement_results');
        if (!in_array('placement_semester', $placementColumns, true)) {
            throw new RuntimeException('The placement_results.placement_semester column is required for a semester-specific reset.');
        }

        if (!$db->begin_transaction()) {
            throw new RuntimeException('Unable to start the Semester ' . $semester . ' placement reset transaction.');
        }

        $studentColumns = studentPlacementTableColumns($db, 'student_data');
        $placementIdentity = placementResetIdentityJoin('sd', $studentColumns, 'pr', $placementColumns);
        $studentPlacementStatus = in_array('placement_status', $studentColumns, true)
            ? 'placement_status'
            : (in_array('status', $studentColumns, true) ? 'status' : '');
        $pendingStatus = 'Pending ' . ($semester === 1 ? '1st' : '2nd') . ' Semester';
        $eligibleCondition = '';
        foreach (array_unique([$studentPlacementStatus, 'status']) as $statusColumn) {
            if (in_array($statusColumn, $studentColumns, true)) {
                $eligibleCondition .= " AND LOWER(TRIM(COALESCE(sd.`{$statusColumn}`, ''))) NOT IN ('inactive', 'disabled', 'excluded')";
            }
        }
        if ($studentPlacementStatus !== '' && $placementIdentity !== ''
            && !$db->query(
                "UPDATE student_data sd
                 INNER JOIN placement_results pr ON {$placementIdentity}
                 SET sd.`{$studentPlacementStatus}` = '{$pendingStatus}'
                 WHERE pr.placement_semester = {$semester}{$eligibleCondition}"
            )) {
            throw new RuntimeException('Unable to reset placement status for Semester ' . $semester . ' candidates: ' . $db->error);
        }

        if (studentPlacementTableExists($db, 'unassigned_students')) {
            $unassignedColumns = studentPlacementTableColumns($db, 'unassigned_students');
            if (!in_array('placement_semester', $unassignedColumns, true)) {
                throw new RuntimeException('Apply the unassigned placement semester migration before clearing semester-specific records.');
            }
            $unassignedIdentity = placementResetIdentityJoin('sd', $studentColumns, 'us', $unassignedColumns);
            if ($studentPlacementStatus !== '' && $unassignedIdentity !== ''
                && !$db->query(
                    "UPDATE student_data sd
                     INNER JOIN unassigned_students us ON {$unassignedIdentity}
                     SET sd.`{$studentPlacementStatus}` = '{$pendingStatus}'
                     WHERE us.placement_semester = {$semester}{$eligibleCondition}"
                )) {
                throw new RuntimeException('Unable to reset unassigned student status for Semester ' . $semester . ': ' . $db->error);
            }

            $deleteUnassigned = $db->prepare(
                'DELETE FROM unassigned_students WHERE placement_semester = ?'
            );
            if (!$deleteUnassigned) {
                throw new RuntimeException('Unable to prepare unassigned Semester ' . $semester . ' cleanup: ' . $db->error);
            }
            $deleteUnassigned->bind_param('i', $semester);
            if (!$deleteUnassigned->execute()) {
                $error = $deleteUnassigned->error;
                $deleteUnassigned->close();
                throw new RuntimeException('Unable to clear unassigned Semester ' . $semester . ' candidates: ' . $error);
            }
            $deleteUnassigned->close();
        }

        if ($semester === 1 && studentPlacementTableExists($db, 'placement_college_allocations')) {
            $allocationColumns = studentPlacementTableColumns($db, 'placement_college_allocations');
            $allocationIdentity = placementResetIdentityJoin('pca', $allocationColumns, 'pr', $placementColumns);
            if ($allocationIdentity !== ''
                && in_array('target_semester', $allocationColumns, true)) {
                if (!$db->query(
                    'DELETE pca FROM placement_college_allocations pca
                     INNER JOIN placement_results pr ON ' . $allocationIdentity . '
                     WHERE pr.placement_semester = 1 AND pca.target_semester = 2'
                )) {
                    throw new RuntimeException('Unable to clear Semester 1 allocation records: ' . $db->error);
                }
            }
        } elseif ($semester === 2 && studentPlacementTableExists($db, 'placement_college_allocations')) {
            $allocationColumns = studentPlacementTableColumns($db, 'placement_college_allocations');
            if (in_array('target_semester', $allocationColumns, true)
                && in_array('status', $allocationColumns, true)
                && !$db->query(
                    "UPDATE placement_college_allocations
                     SET status = 'pending'
                     WHERE target_semester = 2"
                )) {
                throw new RuntimeException('Unable to reset Semester 2 college allocation statuses: ' . $db->error);
            }
        }

        $deletePlacements = $db->prepare(
            'DELETE FROM placement_results WHERE placement_semester = ?'
        );
        if (!$deletePlacements) {
            throw new RuntimeException('Unable to prepare Semester ' . $semester . ' placement cleanup: ' . $db->error);
        }
        $deletePlacements->bind_param('i', $semester);
        if (!$deletePlacements->execute()) {
            $error = $deletePlacements->error;
            $deletePlacements->close();
            throw new RuntimeException('Unable to clear Semester ' . $semester . ' placement results: ' . $error);
        }
        $deletePlacements->close();

        $departmentColumns = studentPlacementTableColumns($db, 'departments');
        $sourceColumn = in_array('total_capacity', $departmentColumns, true)
            ? 'total_capacity'
            : (in_array('capacity', $departmentColumns, true) ? 'capacity' : '');
        $targetColumn = in_array('available_capacity', $departmentColumns, true)
            ? 'available_capacity'
            : (in_array('remaining_capacity', $departmentColumns, true) ? 'remaining_capacity' : '');
        if ($sourceColumn !== '' && $targetColumn !== '') {
            if (!in_array('offered_semester', $departmentColumns, true)) {
                throw new RuntimeException('Cannot safely restore department capacity without departments.offered_semester.');
            }
            if (!$db->query(
                "UPDATE departments SET `{$targetColumn}` = `{$sourceColumn}` WHERE offered_semester = {$semester}"
            )) {
                throw new RuntimeException('Unable to restore Semester ' . $semester . ' department capacities: ' . $db->error);
            }
        }

        if ($semester === 2) {
            $collegeColumns = studentPlacementTableColumns($db, 'colleges');
            $sourceColumn = in_array('original_second_sem_capacity', $collegeColumns, true)
                ? 'original_second_sem_capacity'
                : (in_array('original_second_semester_capacity', $collegeColumns, true) ? 'original_second_semester_capacity' : '');
            $targetColumn = in_array('second_sem_capacity', $collegeColumns, true)
                ? 'second_sem_capacity'
                : (in_array('second_semester_capacity', $collegeColumns, true) ? 'second_semester_capacity' : '');
            if ($sourceColumn !== '' && $targetColumn !== ''
                && !$db->query("UPDATE colleges SET `{$targetColumn}` = `{$sourceColumn}`")) {
                throw new RuntimeException('Unable to restore Semester 2 college capacities: ' . $db->error);
            }
        }

        if (!$db->commit()) {
            throw new RuntimeException('Unable to commit Semester ' . $semester . ' placement reset: ' . $db->error);
        }
    } catch (Throwable $error) {
        $db->rollback();
        throw $error;
    } finally {
        $releaseResult = $db->query("SELECT RELEASE_LOCK('placement_engine')");
        if ($releaseResult instanceof mysqli_result) {
            $releaseResult->free();
        }
    }
}

function placementResetIdentityJoin(
    string $leftAlias,
    array $leftColumns,
    string $rightAlias,
    array $rightColumns
): string {
    $conditions = [];
    if (in_array('student_id', $leftColumns, true) && in_array('student_id', $rightColumns, true)) {
        $conditions[] = "{$leftAlias}.student_id = {$rightAlias}.student_id";
    }
    if (in_array('user_id', $leftColumns, true) && in_array('student_id', $rightColumns, true)) {
        $conditions[] = "{$leftAlias}.user_id = {$rightAlias}.student_id";
    }
    foreach (['admission_number', 'id_number'] as $leftIdentifier) {
        if (!in_array($leftIdentifier, $leftColumns, true)) {
            continue;
        }
        foreach (['admission_number', 'id_number'] as $rightIdentifier) {
            if (in_array($rightIdentifier, $rightColumns, true)) {
                $conditions[] = "TRIM({$leftAlias}.`{$leftIdentifier}`) = TRIM({$rightAlias}.`{$rightIdentifier}`)";
            }
        }
    }
    return $conditions ? '(' . implode(' OR ', array_unique($conditions)) . ')' : '';
}
