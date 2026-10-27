import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';

const initialForm = {
  admission_number: '',
  given_name: '',
  father_name: '',
  grandfather_name: '',
  region: '',
  sex: '',
  field_of_study: '',
  total_mark: '',
  cgpa: '',
  coc_score: '',
  disability: 'No',
  minority: 'No',
};

const regions = [
  'Afar',
  'Amhara',
  'Benishangul-Gumuz',
  'Central Ethiopia',
  'Gambella',
  'Harari',
  'Oromia',
  'Sidama',
  'Somali',
  'South Ethiopia',
  "South West Ethiopia Peoples' Region",
  'Tigray',
  'Addis Ababa',
  'Dire Dawa',
];

const StudentRegistration = ({ onBack, onSuccess, isModal = false }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const validateForm = () => {
    if (!form.admission_number.trim()) return 'Admission number is required.';
    if (!form.given_name.trim()) return 'First name is required.';
    if (!form.father_name.trim()) return 'Father name is required.';
    if (!form.grandfather_name.trim()) return 'Grandfather name is required.';
    if (form.total_mark !== '' && (!Number.isFinite(Number(form.total_mark)) || Number(form.total_mark) < 0)) {
      return 'Total Mark (G12) must be zero or greater.';
    }
    if (form.cgpa !== '' && (!Number.isFinite(Number(form.cgpa)) || Number(form.cgpa) < 0 || Number(form.cgpa) > 4)) {
      return 'CGPA must be between 0 and 4.';
    }
    if (form.coc_score !== '' && (!Number.isFinite(Number(form.coc_score)) || Number(form.coc_score) < 0 || Number(form.coc_score) > 30)) {
      return 'COC Score must be between 0 and 30.';
    }
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        admission_number: form.admission_number.trim(),
        given_name: form.given_name.trim(),
        father_name: form.father_name.trim(),
        grandfather_name: form.grandfather_name.trim(),
        total_mark: form.total_mark === '' ? null : Number(form.total_mark),
        cgpa: form.cgpa === '' ? null : Number(form.cgpa),
        coc_score: form.coc_score === '' ? null : Number(form.coc_score),
      };
      const response = await api.post('api/registrar/register_student.php', payload);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to register student.');
      }

      setSuccess('Student registered successfully.');
      setForm(initialForm);
      if (onSuccess) {
        onSuccess();
      } else if (!isModal) {
        setTimeout(() => navigate('/registrar-dashboard'), 1000);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/registrar-dashboard');
    }
  };

  return (
    <div
      className={isModal ? 'student-registration-backdrop' : 'container py-5'}
      style={isModal ? {
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        background: 'rgba(10, 20, 40, 0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      } : undefined}
      onMouseDown={isModal ? (event) => {
        if (event.target === event.currentTarget) close();
      } : undefined}
    >
      <div
        className={`card shadow-lg border-0 ${isModal ? 'w-100' : 'mx-auto'}`}
        style={{
          borderRadius: '18px',
          maxWidth: isModal ? '980px' : '980px',
          maxHeight: isModal ? 'calc(100vh - 2rem)' : undefined,
          overflowY: isModal ? 'auto' : undefined,
        }}
        role={isModal ? 'dialog' : undefined}
        aria-modal={isModal ? 'true' : undefined}
        aria-labelledby="student-registration-title"
      >
        <div className="card-body p-4 p-md-5">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div>
              <h3 id="student-registration-title" className="fw-bold text-primary mb-1">
                Register New Student
              </h3>
              <p className="text-muted mb-0">Enter the official Student Information record.</p>
            </div>
            <button type="button" className="btn btn-outline-secondary" onClick={close} aria-label="Close registration form">
              {isModal ? 'Close' : 'Back'}
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-admission-number">Admission Number</label>
                <input
                  id="student-admission-number"
                  type="text"
                  className="form-control"
                  name="admission_number"
                  placeholder="DTU16R2006"
                  value={form.admission_number}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-first-name">First Name</label>
                <input id="student-first-name" type="text" className="form-control" name="given_name" value={form.given_name} onChange={handleChange} required />
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-father-name">Father Name</label>
                <input id="student-father-name" type="text" className="form-control" name="father_name" value={form.father_name} onChange={handleChange} required />
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-grandfather-name">Grandfather Name</label>
                <input id="student-grandfather-name" type="text" className="form-control" name="grandfather_name" value={form.grandfather_name} onChange={handleChange} required />
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-region">Region</label>
                <select id="student-region" className="form-select" name="region" value={form.region} onChange={handleChange}>
                  <option value="">Select region</option>
                  {regions.map((region) => <option key={region} value={region}>{region}</option>)}
                </select>
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-sex">Sex</label>
                <select id="student-sex" className="form-select" name="sex" value={form.sex} onChange={handleChange}>
                  <option value="">Select sex</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-field-of-study">Field of Study</label>
                <select id="student-field-of-study" className="form-select" name="field_of_study" value={form.field_of_study} onChange={handleChange}>
                  <option value="">Select field of study</option>
                  <option value="Natural Science">Natural Science</option>
                  <option value="Social Science">Social Science</option>
                </select>
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-total-mark">Total Mark (G12)</label>
                <input id="student-total-mark" type="number" min="0" step="0.01" className="form-control" name="total_mark" value={form.total_mark} onChange={handleChange} />
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-cgpa">CGPA</label>
                <input id="student-cgpa" type="number" min="0" max="4" step="0.01" className="form-control" name="cgpa" value={form.cgpa} onChange={handleChange} />
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-coc-score">COC Score</label>
                <input id="student-coc-score" type="number" min="0" max="30" step="0.01" className="form-control" name="coc_score" value={form.coc_score} onChange={handleChange} />
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-disability">Disability Status</label>
                <select id="student-disability" className="form-select" name="disability" value={form.disability} onChange={handleChange}>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
              <div className="col-md-6 col-lg-4">
                <label className="form-label fw-semibold" htmlFor="student-minority">Minority Status</label>
                <select id="student-minority" className="form-select" name="minority" value={form.minority} onChange={handleChange}>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
              <button type="button" className="btn btn-outline-secondary px-4" onClick={close} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary px-4" disabled={loading}>
                {loading ? 'Registering...' : 'Register Student'}
              </button>
            </div>
            {error && <div className="alert alert-danger mt-3 mb-0" role="alert" aria-live="polite">{error}</div>}
            {success && <div className="alert alert-success mt-3 mb-0" role="status" aria-live="polite">{success}</div>}
          </form>
        </div>
      </div>
    </div>
  );
};

export default StudentRegistration;
