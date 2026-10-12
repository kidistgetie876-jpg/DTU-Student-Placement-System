import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api.js';

const endpoint = 'api/registrar/unassigned_students_api.php';
const manualAssignmentEndpoint = 'api/registrar/assign_manual_student.php';

const getReasonCode = (student) => {
  if (student.reasonCode && student.reasonCode !== 'UNKNOWN') return student.reasonCode;

  const reasonText = String(student.reason || '').toLowerCase();
  if (reasonText.includes('capacity') || reasonText.includes('full')) return 'CAPACITY_FULL';
  if (reasonText.includes('score') || reasonText.includes('cut-off') || reasonText.includes('cutoff')) return 'LOW_SCORE';
  return '';
};

const getUnassignmentReason = (student) => {
  const details = student.reasonDetails || {};

  switch (getReasonCode(student)) {
    case 'CAPACITY_FULL':
      return {
        label: student.reason || 'Department Capacity Full',
        badgeClass: 'bg-warning text-dark',
        detail: Array.isArray(details.departments) && details.departments.length > 0
          ? `Full selected departments: ${details.departments.join(', ')}`
          : 'All matching selected departments were full.',
      };
    case 'LOW_SCORE': {
      const hasScore = student.totalScore !== null && student.totalScore !== undefined;
      const hasCutoff = student.cutoffScore !== null && student.cutoffScore !== undefined;
      return {
        label: student.reason || 'Low Total Placement Score',
        badgeClass: 'bg-danger',
        detail: hasScore && hasCutoff
          ? `Total score: ${student.totalScore} / Cut-off: ${student.cutoffScore}`
          : 'The total placement score did not meet the department cut-off.',
      };
    }
    case 'UNMET_PREREQUISITES':
      return {
        label: 'Unmet Prerequisites',
        badgeClass: 'bg-warning text-dark',
        detail: details.message || 'One or more department prerequisites were not met.',
      };
    case 'NO_CHOICES':
      return {
        label: 'No Department Choices',
        badgeClass: 'bg-secondary',
        detail: details.message || 'No department choices were submitted for this placement run.',
      };
    case 'NO_ELIGIBLE_DEPARTMENT':
      return {
        label: student.reason || 'No Eligible Selected Department',
        badgeClass: 'bg-warning text-dark',
        detail: details.message || 'No active selected department matched this placement run.',
      };
    case 'PLACEMENT_NOT_COMPLETED':
      return {
        label: student.reason || 'Placement Not Completed',
        badgeClass: 'bg-secondary',
        detail: details.message || 'The placement run did not record a specific failure reason.',
      };
    default:
      return {
        label: student.reason || 'Placement reason unavailable',
        badgeClass: 'bg-secondary',
        detail: details.message || 'The available placement data does not identify a more specific reason.',
      };
  }
};

const getToday = () => {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const UnassignedStudents = ({ refreshToken = 0 }) => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [targetType, setTargetType] = useState('all');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [assignmentStudent, setAssignmentStudent] = useState(null);
  const [availableDepartments, setAvailableDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [meeting, setMeeting] = useState({
    meetingDate: '',
    meetingTime: '',
    meetingLocation: '',
    message: '',
  });

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(endpoint);
      if (!response.data?.success || !Array.isArray(response.data.students)) {
        throw new Error(response.data?.message || 'Unable to load unassigned students.');
      }
      setStudents(response.data.students);
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

  const sendMeetingNotifications = async (event) => {
    event.preventDefault();
    setSending(true);
    setError('');
    setFeedback(null);
    try {
      const response = await api.post(endpoint, {
        meeting_date: meeting.meetingDate,
        meeting_time: meeting.meetingTime,
        location: meeting.meetingLocation,
        message: meeting.message,
        target_type: targetType,
        ...(targetType === 'individual' ? { student_id: selectedStudentId } : {}),
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to send meeting notifications.');
      }
      setFeedback({ type: 'success', message: response.data.message || 'Meeting notifications created for the student portals.' });
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to send meeting notifications.');
    } finally {
      setSending(false);
    }
  };

  const updateMeeting = (event) => {
    const { name, value } = event.target;
    setMeeting((current) => ({ ...current, [name]: value }));
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
        params: { student_id: student.studentId },
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
        student_id: assignmentStudent.studentId,
        department_id: Number(selectedDepartmentId),
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to assign the student.');
      }
      setStudents((current) => current.filter((student) => student.studentId !== assignmentStudent.studentId));
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
    <section className="card shadow-sm border-0" aria-labelledby="unassigned-students-heading">
      <div className="card-body p-3 p-md-4">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-3 mb-4">
          <div>
            <h4 id="unassigned-students-heading" className="mb-1">Unassigned Students</h4>
            <p className="text-muted mb-0">
              Review students who could not be assigned in a placement run and coordinate follow-up.
            </p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button type="button" className="btn btn-outline-secondary" onClick={loadStudents} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" className="btn btn-outline-primary" onClick={downloadReport} disabled={downloading}>
              {downloading ? 'Preparing report…' : 'Download Unassigned Report'}
            </button>
          </div>
        </div>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {feedback && <div className="alert alert-success" role="status">{feedback.message}</div>}

        {loading ? (
          <div className="py-4 text-center text-muted" role="status">Loading unassigned students…</div>
        ) : students.length === 0 ? (
          <div className="alert alert-light border mb-4" role="status">There are no unassigned students to display.</div>
        ) : (
          <div className="table-responsive border rounded mb-4">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th scope="col">Student ID</th>
                  <th scope="col">Full Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Stream</th>
                  <th scope="col">College</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reason for Unassignment</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const reason = getUnassignmentReason(student);
                  return (
                    <tr key={student.studentId}>
                      <td className="fw-semibold text-primary">{student.idNumber || student.studentId}</td>
                      <td>{student.fullName || '—'}</td>
                      <td>{student.email || '—'}</td>
                      <td>{student.stream || '—'}</td>
                      <td>{student.college || '—'}</td>
                      <td><span className="badge bg-warning-subtle text-dark">{student.status || 'Not assigned'}</span></td>
                      <td>
                        <span className={`badge ${reason.badgeClass}`}>{reason.label}</span>
                        <div className="small text-muted mt-1">{reason.detail}</div>
                        {student.totalScore !== null && student.totalScore !== undefined && getReasonCode(student) !== 'LOW_SCORE' && (
                          <div className="small text-muted">Merit score: {student.totalScore}</div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
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

        <form className="border rounded-3 p-3 p-md-4 bg-light" onSubmit={sendMeetingNotifications}>
          <h5 className="mb-1">Student portal meeting notification</h5>
          <p className="small text-muted mb-3">
            Publish an internal meeting notice to unassigned student portals for grade remediation or college reassignment.
          </p>
          <div className="row g-3">
            <div className="col-sm-6">
              <label className="form-label" htmlFor="unassigned-meeting-target">Send target</label>
              <select
                id="unassigned-meeting-target"
                className="form-select"
                value={targetType}
                onChange={(event) => setTargetType(event.target.value)}
              >
                <option value="all">All Unassigned Students</option>
                <option value="individual">Specific Student</option>
              </select>
            </div>
            {targetType === 'individual' && (
              <div className="col-sm-6">
                <label className="form-label" htmlFor="unassigned-meeting-student">Student</label>
                <select
                  id="unassigned-meeting-student"
                  className="form-select"
                  value={selectedStudentId}
                  onChange={(event) => setSelectedStudentId(event.target.value)}
                  required
                >
                  <option value="">Select an unassigned student</option>
                  {students.map((student) => (
                    <option key={student.studentId} value={student.studentId}>
                      {student.fullName || 'Unnamed student'} ({student.idNumber || student.studentId})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="col-sm-6 col-lg-3">
              <label className="form-label" htmlFor="unassigned-meeting-date">Meeting date</label>
              <input
                id="unassigned-meeting-date"
                className="form-control"
                type="date"
                name="meetingDate"
                min={getToday()}
                value={meeting.meetingDate}
                onChange={updateMeeting}
                required
              />
            </div>
            <div className="col-sm-6 col-lg-3">
              <label className="form-label" htmlFor="unassigned-meeting-time">Meeting time</label>
              <input
                id="unassigned-meeting-time"
                className="form-control"
                type="time"
                name="meetingTime"
                value={meeting.meetingTime}
                onChange={updateMeeting}
                required
              />
            </div>
            <div className="col-lg-6">
              <label className="form-label" htmlFor="unassigned-meeting-location">Location or meeting link</label>
              <input
                id="unassigned-meeting-location"
                className="form-control"
                type="text"
                name="meetingLocation"
                maxLength="500"
                value={meeting.meetingLocation}
                onChange={updateMeeting}
                placeholder="Enter the room, office, or online meeting link"
                required
              />
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="unassigned-meeting-message">Additional message (optional)</label>
              <textarea
                id="unassigned-meeting-message"
                className="form-control"
                name="message"
                rows="3"
                maxLength="2000"
                value={meeting.message}
                onChange={updateMeeting}
              />
            </div>
            <div className="col-12">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={sending || loading || students.length === 0 || (targetType === 'individual' && !selectedStudentId)}
              >
                {sending ? 'Posting notifications…' : targetType === 'individual' ? 'Send Meeting Notification' : `Send Meeting Notifications (${students.length})`}
              </button>
            </div>
          </div>
        </form>
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
