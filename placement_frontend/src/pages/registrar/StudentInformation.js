import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';
import MissingScoresForm from './MissingScoresForm';

const parseYesNo = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  return ['yes', 'y', 'true', '1', 'on'].includes(normalized);
};

const needsAcademicScores = (student) => {
  const gpa = student?.gpa ?? student?.cgpa ?? null;
  const g12 = student?.g12 ?? student?.grade_12_result ?? null;
  const coc = student?.coc ?? student?.coc_result ?? null;

  const isMissing = (value) =>
    value === null ||
    value === undefined ||
    value === '' ||
    value === 'N/A' ||
    value === 'NA' ||
    (Number.isFinite(Number(value)) && Number(value) <= 0);

  return isMissing(gpa) || isMissing(g12) || isMissing(coc);
};

const normalizeStream = (value) => {
  const stream = String(value ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
  const singularized = stream.replace(/sciences$/, 'science');
  if (singularized === 'natural' || singularized === 'naturalscience') return 'naturalscience';
  if (singularized === 'social' || singularized === 'socialscience') return 'socialscience';
  return stream;
};

const StudentInformation = ({ students: initialStudents = [] }) => {
  const navigate = useNavigate();
  const [students, setStudents] = useState(initialStudents);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [streamFilter, setStreamFilter] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [deletingStudentId, setDeletingStudentId] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const itemsPerPage = 5;

  const loadStudents = async () => {
    setLoading(true);
    try {
      const response = await api.get('api/student/student_data_api.php');
      const rows = Array.isArray(response.data)
        ? response.data
        : response.data?.students || [];

      setStudents(rows);
    } catch (error) {
      console.error('Failed to load student records:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialStudents && initialStudents.length) {
      setStudents(initialStudents);
      return;
    }

    loadStudents();
  }, [initialStudents]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return students.filter((student) => {
      const stream = student?.stream ?? student?.department_stream;
      const fields = [
        student?.id,
        student?.user_id,
        student?.name,
        student?.email,
        student?.username,
        student?.department,
        student?.gender,
        student?.status,
        stream,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      const matchesSearch = !query || fields.some((value) => value.includes(query));
      const matchesStream = streamFilter === 'all' || normalizeStream(stream) === streamFilter;
      return matchesSearch && matchesStream;
    });
  }, [students, search, streamFilter]);

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentStudents = filteredStudents.slice(indexOfFirstItem, indexOfLastItem);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, streamFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(totalPages, 1));
    }
  }, [currentPage, totalPages]);

  const refreshStudents = async () => {
    await loadStudents();
  };

  const handleDelete = async (studentId) => {
    studentId = Number(studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      setDeleteError('Unable to delete this student because the student ID is invalid.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this student?')) {
      return;
    }

    setDeleteError('');
    setDeletingStudentId(studentId);
    try {
      await api.delete('api/registrar/delete_student.php', {
        data: { student_id: studentId },
      });
      setStudents((currentStudents) => currentStudents.filter(
        (currentStudent) => Number(
          currentStudent.student_id ?? currentStudent.id ?? currentStudent.user_id,
        ) !== studentId,
      ));
    } catch (error) {
      setDeleteError(error.response?.data?.message || 'Failed to delete student information. Please try again.');
    } finally {
      setDeletingStudentId(null);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div className="card shadow-sm border-0" style={{ borderRadius: '16px', overflow: 'hidden' }}>
        <div
          className="d-flex justify-content-between align-items-center px-4 py-3 text-white"
          style={{ background: '#0c1f4d', borderBottom: '3px solid #f3c84d' }}
        >
          <div>
            <h4 className="mb-0 fw-bold">Student Information</h4>
          </div>

          <div className="d-flex gap-2 align-items-center flex-wrap justify-content-end">
            <select
              className="form-select form-select-sm"
              aria-label="Filter by stream"
              value={streamFilter}
              onChange={(e) => setStreamFilter(e.target.value)}
              style={{ minWidth: '180px' }}
            >
              <option value="all">All Streams</option>
              <option value="naturalscience">Natural Science</option>
              <option value="socialscience">Social Science</option>
            </select>

            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search student..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: '260px' }}
            />

            <button
              type="button"
              className="btn btn-light btn-sm fw-semibold"
              onClick={refreshStudents}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="card-body p-0">
          {deleteError && (
            <div className="alert alert-danger m-3 mb-0" role="alert">
              {deleteError}
            </div>
          )}
          {loading && students.length === 0 ? (
            <div className="p-4 text-muted">Loading student records...</div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-4 text-center text-muted">No student records found.</div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ minWidth: '1300px' }}>
                <thead className="table-light">
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Stream</th>
                    <th>Email</th>
                    <th>GPA</th>
                    <th>CGPA</th>
                    <th>G12</th>
                    <th>COC</th>
                    <th>Gender</th>
                    <th>Disability</th>
                    <th>Minority</th>
                    <th>Cumulative</th>
                    <th>Department</th>
                    <th>Action</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {currentStudents.map((student) => {
                    const disabilityFlag = parseYesNo(student?.hasDisability ?? student?.disability ?? student?.specialSupport);
                    const minorityFlag = parseYesNo(student?.minority ?? student?.isMinority ?? student?.minorityStatus);

                    return (
                      <tr key={`${student.id ?? student.user_id ?? student.email}-${student.email || student.username || 'student'}`}>
                        <td className="fw-bold text-primary">{student.id ?? student.user_id ?? '—'}</td>

                        <td>
                          <div className="fw-semibold">{student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown Student'}</div>
                        </td>

                        <td>{student.stream || student.department_stream || '—'}</td>

                        <td className="text-center text-muted small">
                          {student.email || student.username || '—'}
                        </td>

                        <td className="text-center">
                          <span className="badge bg-primary-subtle text-primary px-3 py-2">
                            {student.gpa ?? student.cgpa ?? '—'}
                          </span>
                        </td>

                        <td className="text-center">
                          <span className="badge bg-primary-subtle text-primary px-3 py-2">
                            {student.cgpa ?? '—'}
                          </span>
                        </td>

                        <td className="text-center">
                          {student.g12 !== null && student.g12 !== undefined && student.g12 !== 'N/A' ? (
                            <span className="badge bg-info-subtle text-info px-3 py-2">
                              {typeof student.g12 === 'number' ? student.g12.toFixed(2) : student.g12}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        <td className="text-center">
                          {student.coc !== null && student.coc !== undefined && student.coc !== 'N/A' ? (
                            <span className="badge bg-success-subtle text-success px-3 py-2">
                              {typeof student.coc === 'number' ? student.coc.toFixed(2) : student.coc}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        <td className="text-center">
                          {student.gender ? (
                            <span className={`badge ${student.gender.toLowerCase() === 'female' ? 'bg-danger-subtle text-danger' : 'bg-secondary-subtle text-secondary'}`}>
                              {student.gender}
                            </span>
                          ) : (
                            <span className="text-muted">N/A</span>
                          )}
                        </td>

                        <td className="text-center">
                          <span className={`badge px-3 py-2 ${disabilityFlag ? 'bg-danger text-white' : 'bg-secondary text-white'}`}>
                            {disabilityFlag ? 'Yes' : 'No'}
                          </span>
                        </td>

                        <td className="text-center">
                          <span className={`badge px-3 py-2 ${minorityFlag ? 'bg-info text-white' : 'bg-secondary text-white'}`}>
                            {minorityFlag ? 'Yes' : 'No'}
                          </span>
                        </td>

                        <td className="text-center">
                          <span className="badge bg-warning-subtle text-warning px-3 py-2 fw-bold">
                            {typeof student.cumulativeScore === 'number'
                              ? student.cumulativeScore.toFixed(2)
                              : student.cumulative_avg ?? student.cumulativeScore ?? '—'}
                          </span>
                        </td>

                        <td>{student.department || 'Not assigned'}</td>

                        <td className="text-center">
                          <div className="d-flex justify-content-center gap-2">
                            <button
                              type="button"
                              className={`btn btn-sm ${needsAcademicScores(student) ? 'btn-warning text-dark' : 'btn-outline-secondary'}`}
                              onClick={() => {
                                const studentId = student.id ?? student.user_id ?? student.email;
                                navigate(`/student-score-form/${encodeURIComponent(studentId)}`, {
                                  state: { student },
                                });
                              }}
                            >
                              {needsAcademicScores(student) ? 'Fill Scores' : 'Update'}
                            </button>
                            <button
                              type="button"
                              className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:hover:bg-red-900/60 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800 text-xs font-semibold transition-all"
                              onClick={() => handleDelete(
                                student.student_id ?? student.id ?? student.user_id,
                                student.first_name,
                              )}
                              disabled={deletingStudentId !== null}
                            >
                              {deletingStudentId === Number(
                                student.student_id ?? student.id ?? student.user_id,
                              ) ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>

                        <td className="text-center">
                          <span className={`badge px-3 py-2 ${
                            student.status === 'Placed' || student.status === 'Approved'
                              ? 'bg-success text-white'
                              : student.status === 'Pending'
                                ? 'bg-warning text-dark'
                                : 'bg-secondary text-white'
                          }`}>
                            {student.status || 'Pending'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </div>
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-center gap-3 border-top px-3 py-3">
                <p className="mb-0 text-sm text-gray-600">
                  Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredStudents.length)} of {filteredStudents.length} entries
                </p>
                <nav className="d-flex align-items-center gap-1" aria-label="Student records pagination">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm px-3 py-2 rounded-md border-gray-300 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setCurrentPage((previousPage) => Math.max(previousPage - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={`btn btn-sm min-w-9 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                        currentPage === page
                          ? 'btn-primary border-blue-600 bg-blue-600 text-white'
                          : 'btn-outline-secondary border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => setCurrentPage(page)}
                      aria-label={`Page ${page}`}
                      aria-current={currentPage === page ? 'page' : undefined}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm px-3 py-2 rounded-md border-gray-300 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setCurrentPage((previousPage) => Math.min(previousPage + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </nav>
              </div>
            </>
          )}
        </div>
      </div>

      {selectedStudent && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          role="dialog"
          style={{
            background: 'rgba(0,0,0,0.45)',
            position: 'fixed',
            inset: 0,
            zIndex: 1050,
          }}
        >
          <div className="modal-dialog modal-xl modal-dialog-centered" role="document">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '18px', overflow: 'hidden' }}>
              <MissingScoresForm
                student={selectedStudent}
                onClose={() => setSelectedStudent(null)}
                onSaved={async () => {
                  setSelectedStudent(null);
                  await refreshStudents();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentInformation;
