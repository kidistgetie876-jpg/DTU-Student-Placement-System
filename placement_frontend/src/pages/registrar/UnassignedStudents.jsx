import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api.js';
import './UnassignedStudents.css';

const endpoint = 'api/registrar/unassigned_students_api.php';
const manualAssignmentEndpoint = 'api/registrar/assign_manual_student.php';
const getAssignmentIdentity = (student) => (
  student.accountLinked === false
    ? { admission_number: student.admissionNumber || student.idNumber }
    : { student_id: student.studentId }
);
const getStudentIdentity = (student) => (
  student.student_id ?? student.id ?? student.studentId ?? student.admission_number ?? student.admissionNumber
);
const getReasonCode = (student) => {
  if (student.reasonCode && student.reasonCode !== 'UNKNOWN') return student.reasonCode;

  const reasonText = String(student.reason || '').toLowerCase();
  if (reasonText.includes('capacity') || reasonText.includes('full')) return 'CAPACITY_FULL';
  if (reasonText.includes('score') || reasonText.includes('cut-off') || reasonText.includes('cutoff')) return 'LOW_SCORE';
  return '';
};

const getUnassignmentReason = (student) => {
  const details = student.reasonDetails || {};
  const serverReason = student.unassigned_reason;

  switch (getReasonCode(student)) {
    case 'CAPACITY_FULL':
      return {
        label: student.reason || 'Department Capacity Full',
        badgeClass: 'bg-warning text-dark',
        detail: serverReason || (Array.isArray(details.departments) && details.departments.length > 0
          ? `Full selected departments: ${details.departments.join(', ')}`
          : 'All matching selected departments were full.'),
      };
    case 'LOW_SCORE': {
      const hasScore = student.totalScore !== null && student.totalScore !== undefined;
      const hasCutoff = student.cutoffScore !== null && student.cutoffScore !== undefined;
      return {
        label: student.reason || 'Low Total Placement Score',
        badgeClass: 'bg-danger',
        detail: serverReason || (hasScore && hasCutoff
          ? `Total score: ${student.totalScore} / Cut-off: ${student.cutoffScore}`
          : 'The total placement score did not meet the department cut-off.'),
      };
    }
    case 'UNMET_PREREQUISITES':
      return {
        label: 'Unmet Prerequisites',
        badgeClass: 'bg-warning text-dark',
        detail: serverReason || details.message || 'One or more department prerequisites were not met.',
      };
    case 'NO_CHOICES':
      return {
        label: 'No Department Choices',
        badgeClass: 'bg-secondary',
        detail: serverReason || details.message || 'No department choices were submitted for this placement run.',
      };
    case 'NO_ELIGIBLE_DEPARTMENT':
      return {
        label: student.reason || 'No Eligible Selected Department',
        badgeClass: 'bg-warning text-dark',
        detail: serverReason || details.message || 'No active selected department matched this placement run.',
      };
    case 'PLACEMENT_NOT_COMPLETED':
      return {
        label: student.reason || 'Placement Not Completed',
        badgeClass: 'bg-secondary',
        detail: serverReason || details.message || 'The placement run did not record a specific failure reason.',
      };
    default:
      return {
        label: student.reason || 'Placement reason unavailable',
        badgeClass: 'bg-secondary',
        detail: serverReason || details.message || 'The available placement data does not identify a more specific reason.',
      };
  }
};

const UnassignedStudents = ({ refreshToken = 0 }) => {
  const [unassignedStudents, setUnassignedStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [assignmentStudent, setAssignmentStudent] = useState(null);
  const [availableDepartments, setAvailableDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(endpoint);
      if (!response.data?.success || !Array.isArray(response.data.students)) {
        throw new Error(response.data?.message || 'Unable to load unassigned students.');
      }
      setUnassignedStudents(response.data.students);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to load unassigned students.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents, refreshToken]);

  const downloadReport = async () => {
    setDownloading(true);
    setError('');
    setFeedback(null);
    try {
      const response = await api.get(endpoint, {
        params: { format: 'csv' },
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'unassigned_students_report.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      setFeedback({ type: 'success', message: 'Unassigned student report downloaded.' });
    } catch (requestError) {
      let message = requestError.response?.data?.message || requestError.message || 'Unable to download the report.';
      if (requestError.response?.data instanceof Blob) {
        try {
          const responseBody = JSON.parse(await requestError.response.data.text());
          message = responseBody.message || message;
        } catch {
          message = 'Unable to download the report.';
        }
      }
      setError(message);
    } finally {
      setDownloading(false);
    }
  };

  const openManualAssignment = async (student) => {
    setAssignmentStudent(student);
    setAvailableDepartments([]);
    setSelectedDepartmentId('');
    setError('');
    setFeedback(null);
    setLoadingDepartments(true);
    try {
      const response = await api.get(manualAssignmentEndpoint, {
        params: getAssignmentIdentity(student),
      });
      if (!response.data?.success || !Array.isArray(response.data.departments)) {
        throw new Error(response.data?.message || 'Unable to load available departments.');
      }
      setAvailableDepartments(response.data.departments);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to load available departments.');
      setAssignmentStudent(null);
    } finally {
      setLoadingDepartments(false);
    }
  };

  const confirmManualAssignment = async (event) => {
    event.preventDefault();
    if (!assignmentStudent || !selectedDepartmentId) return;

    setAssigning(true);
    setError('');
    setFeedback(null);
    try {
      const response = await api.post(manualAssignmentEndpoint, {
        ...getAssignmentIdentity(assignmentStudent),
        department_id: Number(selectedDepartmentId),
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to assign the student.');
      }
      setUnassignedStudents((current) => current.filter(
        (student) => getStudentIdentity(student) !== getStudentIdentity(assignmentStudent)
      ));
      setFeedback({ type: 'success', message: response.data.message || 'Student assigned successfully.' });
      setAssignmentStudent(null);
      await loadStudents();
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to assign the student.');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <section className="unassigned-students-page" aria-labelledby="unassigned-students-heading">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 id="unassigned-students-heading" className="mb-0 text-2xl font-bold text-slate-800">
          Unassigned Students
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={loadStudents}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={downloadReport}
            disabled={downloading}
          >
            {downloading ? 'Preparing report…' : 'Download Unassigned Report'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {feedback && <div className="alert alert-success" role="status">{feedback.message}</div>}

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500" role="status">Loading unassigned students…</div>
        ) : unassignedStudents.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600" role="status">
            There are no unassigned students to display.
          </div>
        ) : (
          <div className="overflow-x-auto unassigned-table-wrap">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-3">Student ID</th>
                  <th scope="col" className="px-4 py-3">Full Name</th>
                  <th scope="col" className="px-4 py-3">Email</th>
                  <th scope="col" className="px-4 py-3">Stream</th>
                  <th scope="col" className="px-4 py-3">College</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Reason for Unassignment</th>
                  <th scope="col" className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {unassignedStudents.map((student) => {
                  const reason = getUnassignmentReason(student);
                  return (
                    <tr key={student.studentId} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50/80">
                      <td className="px-4 py-3.5 font-semibold text-blue-800">{student.idNumber || student.studentId}</td>
                      <td className="px-4 py-3.5 text-slate-800">{student.fullName || '—'}</td>
                      <td className="px-4 py-3.5 text-slate-700">{student.email || '—'}</td>
                      <td className="px-4 py-3.5 text-slate-700">{student.stream || '—'}</td>
                      <td className="px-4 py-3.5 text-slate-700">{student.college_name || student.college || 'N/A'}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">{student.status || 'Not assigned'}</span>
                        {student.accountLinked === false && <div className="mt-1 text-xs text-slate-500">Portal account not linked</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`badge ${reason.badgeClass}`}>{reason.label}</span>
                        <div className="unassigned-reason-alert mt-1">{reason.detail}</div>
                        {student.totalScore !== null && student.totalScore !== undefined && getReasonCode(student) !== 'LOW_SCORE' && (
                          <div className="text-xs text-slate-500">Merit score: {student.totalScore}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          className="rounded-lg border border-blue-700 px-3 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-50"
                          onClick={() => openManualAssignment(student)}
                        >
                          Manually Assign
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {assignmentStudent && (
        <>
          <div className="modal-backdrop show" />
          <div
            className="modal show d-block"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-assignment-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !assigning) setAssignmentStudent(null);
            }}
          >
            <div className="modal-dialog modal-dialog-centered">
              <form className="modal-content" onSubmit={confirmManualAssignment}>
                <div className="modal-header">
                  <div>
                    <h5 className="modal-title" id="manual-assignment-title">Manually Assign Student</h5>
                    <div className="small text-muted">
                      {assignmentStudent.fullName} ({assignmentStudent.idNumber || assignmentStudent.studentId})
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setAssignmentStudent(null)}
                    disabled={assigning}
                  />
                </div>
                <div className="modal-body">
                  {loadingDepartments ? (
                    <div role="status" className="text-muted">Loading available departments…</div>
                  ) : availableDepartments.length === 0 ? (
                    <div className="alert alert-warning mb-0" role="status">
                      No departments with available seats match this student’s stream.
                    </div>
                  ) : (
                    <>
                      <label className="form-label" htmlFor="manual-assignment-department">Department</label>
                      <select
                        id="manual-assignment-department"
                        className="form-select"
                        value={selectedDepartmentId}
                        onChange={(event) => setSelectedDepartmentId(event.target.value)}
                        required
                      >
                        <option value="">Select a department</option>
                        {availableDepartments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name} ({department.available} {department.available === 1 ? 'seat' : 'seats'} left)
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setAssignmentStudent(null)}
                    disabled={assigning}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loadingDepartments || assigning || !selectedDepartmentId}
                  >
                    {assigning ? 'Assigning…' : 'Confirm Assignment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default UnassignedStudents;
