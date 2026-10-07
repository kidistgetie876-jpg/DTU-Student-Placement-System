import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api.js';
import dtuLogo from '../../assets/image.png';

const emptyForm = {
  user_id: '',
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  gender: 'Male',
  gpa: '',
  grade_12_result: '',
  coc_result: '',
  disability: 'No',
  minority: 'No',
  status: 'Approved',
};

const yesNo = (value) => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value !== 0 ? 'Yes' : 'No';
  return ['yes', 'y', 'true', '1', 'on'].includes(String(value || '').trim().toLowerCase())
    ? 'Yes'
    : 'No';
};

const toFormValues = (student, fallbackId = '') => ({
  ...emptyForm,
  user_id: student.user_id ?? student.id ?? fallbackId,
  username: student.username || '',
  email: student.email || '',
  first_name: student.first_name || '',
  last_name: student.last_name || '',
  gender: String(student.gender || '').toLowerCase() === 'female' ? 'Female' : 'Male',
  gpa: student.gpa ?? student.cgpa ?? '',
  grade_12_result: student.grade_12_result ?? student.g12 ?? '',
  coc_result: student.coc_result ?? student.coc ?? '',
  disability: yesNo(student.disability ?? student.hasDisability ?? student.specialSupport),
  minority: yesNo(student.minority ?? student.isMinority ?? student.minorityStatus),
  status: student.status || 'Approved',
});

const MissingScoresForm = ({ student, onClose, onSaved }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { studentId } = useParams();
  const selectedStudent = student || location.state?.student;
  const returnTo = location.state?.returnTo === '/registrar-dashboard'
    ? location.state.returnTo
    : '/registrar-dashboard';
  const returnTab = location.state?.returnTab || 'student-info';
  const isEmbedded = typeof onClose === 'function';
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!selectedStudent);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadStudentData = async () => {
      if (selectedStudent) {
        setForm(toFormValues(selectedStudent, studentId));
        setError('');
        setFetching(false);
        return;
      }

      if (!studentId) {
        setError('A student ID is required.');
        setFetching(false);
        return;
      }

      try {
        setFetching(true);
        const lookup = /^\d+$/.test(studentId)
          ? `student_id=${encodeURIComponent(studentId)}`
          : `email=${encodeURIComponent(studentId)}`;
        const response = await api.get(`api/student/student_data_api.php?${lookup}`);
        const loadedStudent = response.data?.student;
        if (!loadedStudent) {
          throw new Error(response.data?.message || 'Student record was not found.');
        }
        if (!cancelled) {
          setForm(toFormValues(loadedStudent, studentId));
          setError('');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.response?.data?.message || loadError.message || 'Failed to load student details.');
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    };

    loadStudentData();
    return () => {
      cancelled = true;
    };
  }, [selectedStudent, studentId]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleCancel = () => {
    if (onClose) {
      onClose();
    } else {
      navigate(returnTo, { state: { activeTab: returnTab } });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('api/common/profile_update.php', {
        ...form,
        user_id: form.user_id || studentId,
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save student scores.');
      }

      if (onSaved) {
        await onSaved(response.data);
      } else {
        navigate(returnTo, {
          replace: true,
          state: {
            activeTab: returnTab,
            savedStudentId: form.user_id || studentId,
          },
        });
      }
    } catch (saveError) {
      setError(saveError.response?.data?.message || saveError.message || 'Unable to save student scores.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="p-5 text-center" role="status">Loading student data...</div>;
  }

  return (
    <div className={isEmbedded ? '' : 'min-vh-100'} style={isEmbedded ? undefined : { background: '#f3f4f6' }}>
      {!isEmbedded && (
        <div style={{ background: '#0a2d6d', color: '#fff', padding: '20px' }}>
          <div className="container d-flex align-items-center">
            <img src={dtuLogo} alt="Logo" style={{ width: 50 }} />
            <div className="ms-3">
              <h2 className="mb-0">DEBRE TABOR UNIVERSITY</h2>
              <small>Student Placement System</small>
            </div>
          </div>
        </div>
      )}

      <div className={isEmbedded ? '' : 'container py-5'}>
        <div className="card shadow-lg border-0" style={{ borderRadius: '15px' }}>
          <div className="card-header bg-dark text-white d-flex justify-content-between p-3">
            <h4 className="mb-0">Update Student Scores</h4>
            <button type="button" className="btn btn-sm btn-outline-light" onClick={handleCancel}>
              {isEmbedded ? 'Close' : 'Back'}
            </button>
          </div>

          <div className="card-body p-4">
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {success && <div className="alert alert-success" role="status">{success}</div>}

            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label fw-bold" htmlFor="student-email">Email (Read Only)</label>
                  <input id="student-email" type="email" className="form-control bg-light" name="email" value={form.email} readOnly />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold" htmlFor="student-gpa">GPA (4.0)</label>
                  <input id="student-gpa" type="number" step="0.01" min="0" max="4" className="form-control" name="gpa" value={form.gpa} onChange={handleChange} required />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold" htmlFor="student-grade-12">Grade 12 Result</label>
                  <input id="student-grade-12" type="number" step="0.01" min="0" max="100" className="form-control" name="grade_12_result" value={form.grade_12_result} onChange={handleChange} required />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold" htmlFor="student-coc">COC Result</label>
                  <input id="student-coc" type="number" step="0.01" min="0" max="30" className="form-control" name="coc_result" value={form.coc_result} onChange={handleChange} required />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold" htmlFor="student-gender">Gender</label>
                  <select id="student-gender" className="form-select" name="gender" value={form.gender} onChange={handleChange} required>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold" htmlFor="student-disability">Disability</label>
                  <select id="student-disability" className="form-select" name="disability" value={form.disability} onChange={handleChange}>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold" htmlFor="student-minority">Minority</label>
                  <select id="student-minority" className="form-select" name="minority" value={form.minority} onChange={handleChange}>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 text-end">
                <button type="button" className="btn btn-secondary me-2" onClick={handleCancel}>Cancel</button>
                <button type="submit" className="btn btn-primary px-4" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Academic Scores'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissingScoresForm;
