import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../services/api.js';

const normalizeChoiceText = (value) => String(value ?? '').trim();

const departmentName = (choice) => normalizeChoiceText(
  choice?.dept_name ?? choice?.department_name ?? choice?.department ?? choice?.name,
);

const collegeName = (choice) => normalizeChoiceText(
  choice?.college_name ?? choice?.college ?? choice?.collegeName,
);

const collegeChoiceStyle = (choice) => {
  const college = collegeName(choice).toLocaleLowerCase();
  const streamName = normalizeChoiceText(choice?.stream ?? choice?.academic_stream);
  const stream = streamName.toLocaleLowerCase();

  if (college.includes('health science')) {
    return {
      container: 'bg-blue-50/90 border-blue-200 text-blue-900',
      title: 'text-blue-600',
      department: 'text-blue-950',
      label: collegeName(choice) || streamName,
    };
  }
  if (college.includes('gafat') || college.includes('technology')) {
    return {
      container: 'bg-indigo-50/90 border-indigo-200 text-indigo-900',
      title: 'text-indigo-600',
      department: 'text-indigo-950',
      label: collegeName(choice) || streamName,
    };
  }
  if (
    college.includes('other natural science')
    || college.includes('other social science')
    || stream.includes('natural science')
    || stream.includes('social science')
  ) {
    return {
      container: 'bg-emerald-50/90 border-emerald-200 text-emerald-900',
      title: 'text-emerald-600',
      department: 'text-emerald-950',
      label: streamName || collegeName(choice),
    };
  }
  return {
    container: 'bg-slate-50 border-slate-200 text-slate-900',
    title: 'text-slate-600',
    department: 'text-slate-900',
    label: collegeName(choice) || streamName,
  };
};

const choiceSemester = (choice) => {
  const semester = Number(choice?.semester ?? choice?.semester_number ?? 1);
  return Number.isFinite(semester) && semester === 2 ? 2 : 1;
};

const choicesFromSemesterMap = (choices, semester) => {
  if (!choices || typeof choices !== 'object' || Array.isArray(choices)) return [];
  return Object.entries(choices)
    .map(([key, value]) => {
      const priority = Number(String(key).match(/\d+/)?.[0] || 0);
      if (!priority || !value) return null;
      if (typeof value === 'object') {
        return { ...value, priority: Number(value.priority) || priority, semester };
      }
      return { priority, semester, dept_name: String(value), department: String(value) };
    })
    .filter(Boolean);
};

const studentChoices = (student) => {
  const choices = Array.isArray(student?.choices) ? student.choices : [];
  const semesterOneChoices = choices.filter((choice) => choiceSemester(choice) === 1);
  const semesterTwoChoices = choices.filter((choice) => choiceSemester(choice) === 2);
  return [
    ...semesterOneChoices,
    ...(semesterOneChoices.length ? [] : choicesFromSemesterMap(student?.sem1_choices, 1)),
    ...semesterTwoChoices,
    ...(semesterTwoChoices.length ? [] : choicesFromSemesterMap(student?.sem2_choices, 2)),
  ];
};

const choicesForSemester = (student, semester) => studentChoices(student)
  .filter((choice) => choiceSemester(choice) === semester);

const ordinal = (value) => {
  const number = Number(value);
  const suffix = number % 100 >= 11 && number % 100 <= 13
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] || 'th');
  return `${number}${suffix}`;
};

export const groupChoicesByCollege = (choices = []) => {
  const orderedChoices = (Array.isArray(choices) ? choices : [])
    .filter((choice) => departmentName(choice))
    .sort((left, right) => (
      Number(left?.priority ?? 0) - Number(right?.priority ?? 0)
      || choiceSemester(left) - choiceSemester(right)
    ));
  const groups = new Map();

  orderedChoices.forEach((choice) => {
    const name = collegeName(choice);
    const key = name.toLocaleLowerCase() || 'college-not-recorded';
    if (!groups.has(key)) {
      groups.set(key, { name: name || 'College not recorded', choices: [] });
    }
    groups.get(key).choices.push(choice);
  });

  return [...groups.values()];
};

function ChoiceCard({ choice, fallbackDepartment }) {
  const department = departmentName(choice) || fallbackDepartment || '';
  const collegeStyle = collegeChoiceStyle(choice);

  return (
    <div
      className="rounded-lg border border-slate-300 bg-slate-100/90 p-2.5 text-xs font-semibold text-slate-800 shadow-sm"
      role="group"
      aria-label={`${department} choice`}
    >
      {collegeStyle.label && <span className="mb-1 block text-xs font-medium text-slate-600">{collegeStyle.label}</span>}
      <div className="text-xs font-semibold text-slate-800">{department}</div>
    </div>
  );
}

function RankedSemesterList({ choices, studentStream, semester, hasInvalidStreamChoice }) {
  const semesterChoices = (Array.isArray(choices) ? choices : [])
    .filter((choice) => choiceSemester(choice) === semester)
    .sort((left, right) => Number(left?.priority ?? 0) - Number(right?.priority ?? 0));

  if (!semesterChoices.length) {
    return <p className="text-muted small mb-0">No departments recorded.</p>;
  }

  return (
    <ol className="mb-0 ps-3">
      {semesterChoices.map((choice, index) => {
        const department = departmentName(choice);
        const rank = Number(choice?.priority ?? index + 1) || index + 1;
        const invalidStream = hasInvalidStreamChoice(studentStream, choice?.stream);

        return (
          <li key={`${semester}-${rank}-${department}`} className="mb-2">
            <span className="me-1 rounded-full bg-blue-700 px-2 py-1 text-xs font-bold text-white">{ordinal(rank)}</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{department}</span>
            {collegeName(choice) && <span className="ms-1 text-xs font-semibold text-blue-600 dark:text-blue-400">{collegeName(choice)}</span>}
            {department.trim() === 'Broad Group / Semester 2 Queue' && (
              <span className="badge bg-success-subtle text-success-emphasis ms-2">College queue</span>
            )}
            {invalidStream && (
              <span className="badge bg-danger-subtle text-danger ms-2" title="This department is outside the student's assigned stream">
                Invalid Stream Choice
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ChoiceDetailsModal({ student, onClose, hasInvalidStreamChoice }) {
  const collegeGroups = groupChoicesByCollege(studentChoices(student));

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
      style={{ zIndex: 1050, background: 'rgba(12, 24, 38, 0.55)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="bg-white shadow-lg rounded-3 w-100 p-4"
        style={{ maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="choice-details-title"
      >
        <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
          <div>
            <h5 id="choice-details-title" className="fw-bold mb-1">College and semester choices</h5>
            <div className="text-muted small">
              {student.name} · {student.email} · Stream: {student.stream || 'N/A'}
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {collegeGroups.length === 0 ? (
          <p className="text-muted mb-0">No ranked choices are available for this student.</p>
        ) : collegeGroups.map((group, index) => (
          <section
            key={group.name}
            className="border rounded p-3 mb-3"
            role="group"
            aria-label={`College Choice ${index + 1}: ${group.name}`}
          >
            <h6 className="fw-bold mb-3">College Choice {index + 1}: {group.name}</h6>
            <div className="row g-3">
              {[1, 2].map((semester) => (
                <div className="col-md-6" key={semester}>
                  <h6 className="small fw-bold">Semester {semester} Departments (Ranked)</h6>
                  <RankedSemesterList
                    choices={group.choices}
                    studentStream={student.stream}
                    semester={semester}
                    hasInvalidStreamChoice={hasInvalidStreamChoice}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </section>
    </div>
  );
}

export default function ChoiceMatrix({
  students = [],
  loading = false,
  error = '',
  totalStudentCount = 0,
  totalRecordCount = 0,
  allStudents = students,
  hasInvalidStreamChoice = () => false,
  activeSemester = 1,
  onChoicesDeleted,
}) {
  const [detailsStudent, setDetailsStudent] = useState(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingChoices, setDeletingChoices] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteFeedback, setDeleteFeedback] = useState('');
  const selectAllRef = useRef(null);
  const selectableStudentIds = useMemo(
    () => allStudents
      .map((student) => String(student.id_number || student.id || '').trim())
      .filter(Boolean),
    [allStudents],
  );
  const allStudentsSelected = selectableStudentIds.length > 0
    && selectableStudentIds.every((studentId) => selectedStudentIds.includes(studentId));
  const someStudentsSelected = selectableStudentIds.some((studentId) => selectedStudentIds.includes(studentId));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someStudentsSelected && !allStudentsSelected;
    }
  }, [allStudentsSelected, someStudentsSelected]);

  useEffect(() => {
    const selectableIds = new Set(selectableStudentIds);
    setSelectedStudentIds((current) => current.filter((studentId) => selectableIds.has(studentId)));
  }, [selectableStudentIds]);

  const toggleStudent = (studentId, checked) => {
    setSelectedStudentIds((current) => checked
      ? [...new Set([...current, studentId])]
      : current.filter((selectedId) => selectedId !== studentId));
    setDeleteError('');
    setDeleteFeedback('');
  };

  const toggleAllStudents = (checked) => {
    setSelectedStudentIds((current) => {
      const selectableIds = new Set(selectableStudentIds);
      const remainingIds = current.filter((studentId) => !selectableIds.has(studentId));
      return checked ? [...remainingIds, ...selectableStudentIds] : remainingIds;
    });
    setDeleteError('');
    setDeleteFeedback('');
  };

  const deleteSelectedChoices = async () => {
    if (!selectedStudentIds.length || deletingChoices) return;
    setDeletingChoices(true);
    setDeleteError('');
    setDeleteFeedback('');
    try {
      const response = await api.post(
        'api/registrar/delete_selected_student_choices.php',
        {
          admissionNumbers: selectedStudentIds,
          expectedSemester: Number(activeSemester),
          confirmed: true,
        },
        { withCredentials: true },
      );
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to delete selected student choices.');
      }
      setDeleteFeedback(response.data.message || `Deleted choice records across all semesters for ${selectedStudentIds.length} selected student(s).`);
      setSelectedStudentIds([]);
      setConfirmingDelete(false);
      onChoicesDeleted?.();
    } catch (error) {
      setDeleteError(
        error.response?.data?.message || error.message || 'Unable to delete selected student choices.',
      );
      setConfirmingDelete(false);
    } finally {
      setDeletingChoices(false);
    }
  };
  const semesterChoiceCounts = [1, 2].map((semester) => {
    const choiceCount = allStudents.reduce((maximum, student) => {
      const semesterMax = choicesForSemester(student, semester)
        .reduce((choiceMaximum, choice) => Math.max(choiceMaximum, Number(choice?.priority) || 0), 0);
      const fallbackCount = semester === 1 && !student?.choices?.length
        ? (student?.prioritySlots || []).length
        : 0;
      return Math.max(maximum, semesterMax, fallbackCount);
    }, 0);
    return Math.max(1, choiceCount);
  });
  const tableColumnCount = 5 + semesterChoiceCounts[0] + semesterChoiceCounts[1];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
          {selectedStudentIds.length} student{selectedStudentIds.length === 1 ? '' : 's'} selected
        </span>
        <button
          type="button"
          className="btn btn-outline-danger"
          onClick={() => setConfirmingDelete(true)}
          disabled={!selectedStudentIds.length || deletingChoices || loading}
        >
          Delete Selected Choices{selectedStudentIds.length ? ` (${selectedStudentIds.length})` : ''}
        </button>
      </div>
      {deleteFeedback && <div className="alert alert-success py-2" role="status">{deleteFeedback}</div>}
      {deleteError && <div className="alert alert-danger py-2" role="alert">{deleteError}</div>}
      <div className="table-responsive choice-matrix-table-wrap">
        <table className="table table-bordered table-hover align-middle mb-0 min-w-max">
          <thead className="border-b-2 border-indigo-950 bg-indigo-950 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-white shadow-sm">
            <tr>
              <th rowSpan="2" className="!border-r !border-indigo-900 !bg-indigo-950 px-4 py-3.5 !text-xs !font-bold !tracking-wider !text-white align-middle">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Select all students with choices"
                  checked={allStudentsSelected}
                  onChange={(event) => toggleAllStudents(event.target.checked)}
                  disabled={loading || selectableStudentIds.length === 0}
                />
              </th>
              <th rowSpan="2" className="!border-r !border-indigo-900 !bg-indigo-950 px-4 py-3.5 !text-xs !font-bold !tracking-wider !text-white align-middle">STUDENT ID</th>
              <th rowSpan="2" className="!border-r !border-indigo-900 !bg-indigo-950 px-4 py-3.5 !text-xs !font-bold !tracking-wider !text-white align-middle">STUDENT NAME</th>
              <th rowSpan="2" className="!border-r !border-indigo-900 !bg-indigo-950 px-4 py-3.5 !text-xs !font-bold !tracking-wider !text-white align-middle">STREAM</th>
              <th rowSpan="2" className="!border-r !border-indigo-900 !bg-indigo-950 px-4 py-3.5 !text-xs !font-bold !tracking-wider !text-white align-middle">STATUS</th>
              <th colSpan={semesterChoiceCounts[0]} className="!border-b-2 !border-r-4 !border-r-slate-300 !bg-indigo-700 px-3 py-2 text-center !text-xs !font-extrabold uppercase !tracking-wider !text-white shadow-inner">SEMESTER 1 PREFERENCES</th>
              <th colSpan={semesterChoiceCounts[1]} className="!border-b-2 !border-indigo-800 !bg-indigo-600 px-3 py-2 text-center !text-xs !font-extrabold uppercase !tracking-wider !text-white shadow-inner">SEMESTER 2 PREFERENCES</th>
              <th rowSpan="2" className="!bg-indigo-950 px-4 py-3.5 !text-xs !font-bold !tracking-wider !text-white align-middle">DETAILS</th>
            </tr>
            <tr>
              {[1, 2].flatMap((semester) => Array.from(
                { length: semesterChoiceCounts[semester - 1] },
                (_, index) => (
                  <th
                    key={`semester-${semester}-rank-${index + 1}`}
                    className={`min-w-[180px] whitespace-nowrap rounded border !border-indigo-900 !bg-indigo-900 px-3 py-2 text-center !text-xs !font-bold uppercase !tracking-wider !text-white shadow-sm ${semester === 1 && index === semesterChoiceCounts[0] - 1 ? '!border-r-4 !border-r-slate-300' : ''}`}
                  >
                    {ordinal(index + 1)} Choice
                  </th>
                ),
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={tableColumnCount + 1} className="p-3.5 text-center text-muted" role="status">
                  Loading submitted student preferences...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={tableColumnCount + 1} className="p-3.5 text-center text-danger" role="alert">
                  {error}
                </td>
              </tr>
            ) : totalStudentCount === 0 ? (
              <tr>
                <td colSpan={tableColumnCount + 1} className="p-3.5 text-center text-muted">
                  {totalRecordCount === 0
                    ? 'No student choice data available yet.'
                    : 'No students match the selected search and stream filters.'}
                </td>
              </tr>
            ) : students.map((student) => (
              <tr key={`${student.id}-${student.email}`} className="odd:bg-white even:bg-slate-50/80 odd:[&>td]:!bg-white even:[&>td]:!bg-slate-50/80 hover:bg-slate-100 hover:[&>td]:!bg-slate-100 transition-colors border-b border-slate-200">
              <td className="border-b border-r border-slate-200 p-3.5 text-center">
                <input
                  type="checkbox"
                  aria-label={`Select ${student.name || student.id_number || student.id} choices`}
                  checked={selectedStudentIds.includes(String(student.id_number || student.id || '').trim())}
                  onChange={(event) => toggleStudent(
                    String(student.id_number || student.id || '').trim(),
                    event.target.checked,
                  )}
                  disabled={!String(student.id_number || student.id || '').trim() || deletingChoices}
                />
              </td>
              <td className="border-b border-r border-slate-200 p-3.5">
                  <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-800">
                    {student.id_number || student.id}
                  </span>
                </td>
                <td className="border-b border-r border-slate-200 p-3.5 fw-semibold">{student.name}</td>
                <td className="border-b border-r border-slate-200 p-3.5">{student.stream || 'N/A'}</td>
                <td className="border-b border-r border-slate-200 p-3.5">
                  {(() => {
                    const status = String(student.status || student.placement_status || '').trim() || 'Pending';
                    const normalizedStatus = status.toLowerCase();
                    const statusClass = normalizedStatus === 'approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : normalizedStatus === 'rejected'
                        ? 'bg-rose-100 text-rose-800'
                        : normalizedStatus === 'pending'
                            ? 'border border-amber-300 bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700';
                    return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClass}`}>{status}</span>;
                  })()}
                </td>
                {[1, 2].flatMap((semester) => Array.from(
                  { length: semesterChoiceCounts[semester - 1] },
                  (_, index) => {
                    const priority = index + 1;
                    const choices = choicesForSemester(student, semester)
                      .filter((choice) => Number(choice?.priority ?? 0) === priority)
                      .sort((left, right) => collegeName(left).localeCompare(collegeName(right)));
                    const fallbackDepartment = semester === 1 && !student?.choices?.length
                      ? student?.prioritySlots?.[index]
                      : '';

                    return (
                      <td
                        key={`${student.id}-semester-${semester}-priority-${priority}`}
                        className={`min-w-[160px] border-b border-r border-slate-200 p-3.5 align-top ${semester === 1 && index === semesterChoiceCounts[0] - 1 ? 'border-r-4 border-r-slate-300' : ''}`}
                      >
                        {choices.length ? choices.map((choice) => (
                          <ChoiceCard
                            key={`${semester}-${priority}-${departmentName(choice)}-${collegeName(choice)}`}
                            choice={choice}
                          />
                        )) : fallbackDepartment && fallbackDepartment !== '—' ? (
                          <ChoiceCard
                            choice={{ department: fallbackDepartment, priority }}
                            fallbackDepartment={fallbackDepartment}
                          />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    );
                  },
                ))}
                <td className="border-b border-slate-200 p-3.5">
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setDetailsStudent({
                    ...student,
                    choices: studentChoices(student),
                  })}>
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmingDelete && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1050, background: 'rgba(12, 24, 38, 0.55)' }}
        >
          <section
            className="w-100 rounded-3 bg-white p-4 shadow-lg dark:bg-slate-900"
            style={{ maxWidth: '520px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-selected-choices-title"
          >
            <h5 id="delete-selected-choices-title" className="mb-2 font-bold">
              Delete selected students’ choices across all semesters?
            </h5>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              This permanently removes all saved choice records for the selected students, including both Semester 1 and Semester 2. Student accounts, personal profiles, placement results, and department capacities will remain unchanged.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setConfirmingDelete(false)}
                disabled={deletingChoices}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={deleteSelectedChoices}
                disabled={deletingChoices}
              >
                {deletingChoices ? 'Deleting choices...' : 'Delete Selected Choices'}
              </button>
            </div>
          </section>
        </div>
      )}
      {detailsStudent && (
        <ChoiceDetailsModal
          student={detailsStudent}
          onClose={() => setDetailsStudent(null)}
          hasInvalidStreamChoice={hasInvalidStreamChoice}
        />
      )}
    </>
  );
}