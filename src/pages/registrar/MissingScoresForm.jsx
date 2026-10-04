import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api.js';
import dtuLogo from '../../assets/image.png';

const MissingScoresForm = () => {
  const navigate = useNavigate();
  const { studentId } = useParams();

  const [form, setForm] = useState({
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
    status: 'Approved'
  });

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadStudentData = async () => {
      try {
        setFetching(true);
        const response = await api.get(`api/student/student_data_api.php?student_id=${studentId}`);
        console.log('DEBUG: load student response', response?.data);

        if (response.data && response.data.student) {
          const s = response.data.student;
          setForm({
            user_id: s.user_id || s.id || studentId,
            username: s.username || '',
            email: s.email || '',
            first_name: s.first_name || '',
            last_name: s.last_name || '',
            gender: s.gender == null
              ? 'Male'
              : String(s.gender).toLowerCase() === 'female'
                ? 'Female'
                : String(s.gender).toLowerCase() === 'male'
                  ? 'Male'
                  : s.gender,
            gpa: s.gpa || '',
            grade_12_result: s.grade_12_result || '',
            coc_result: s.coc_result || '',
            disability: s.disability || 'No',
            minority: s.minority || 'No',
            status: s.status || 'Approved'
          });
        }
      } catch (err) {
        console.error('DEBUG: load student failed', err);
        setError('Failed to load student details.');
      } finally {
        setFetching(false);
      }
    };

    if (studentId) {
      loadStudentData();
    }
  }, [studentId]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');
  setSuccess('');

  try {
    const response = await api.post('api/common/profile_update.php', {
      ...form,
      user_id: form.user_id || studentId,
      gender: form.gender,
    });
    
    if (response.data.success) {
      setSuccess(`Success! Score: ${response.data.cumulative_score}`);
      setTimeout(() => navigate('/registrar-dashboard'), 1500);
    } else {
      // PHP የመለሰውን ትክክለኛ የዳታቤዝ ስህተት እዚህ ያሳያል
      setError(response.data.message);
    }
  } catch (err) {
    // ሰርቨሩ ሙሉ በሙሉ ካልመለሰ
    setError(err.response?.data?.message || 'Server Error. Check Database Connection.');
  } finally {
    setLoading(false);
  }
};

  if (fetching) return <div className="p-5 text-center">Loading Student Data...</div>;

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh' }}>
      <div style={{ background: '#0a2d6d', color: '#fff', padding: '20px' }}>
        <div className="container d-flex align-items-center">
          <img src={dtuLogo} alt="Logo" style={{ width: 50 }} />
          <div className="ms-3">
            <h2 className="mb-0">DEBRE TABOR UNIVERSITY</h2>
            <small>Student Placement System</small>
          </div>
        </div>
      </div>

      <div className="container py-5">
        <div className="card shadow-lg border-0" style={{ borderRadius: '15px' }}>
          <div className="card-header bg-dark text-white d-flex justify-content-between p-3">
            <h4 className="mb-0">Update Student Scores</h4>
            <button className="btn btn-sm btn-outline-light" onClick={() => navigate('/registrar-dashboard')}>Back</button>
          </div>

          <div className="card-body p-4">
            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label fw-bold">Email (Read Only)</label>
                  <input type="email" className="form-control bg-light" name="email" value={form.email} readOnly />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold">GPA (4.0)</label>
                  <input type="number" step="0.01" min="0" max="4" className="form-control" name="gpa" value={form.gpa} onChange={handleChange} required />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold">Grade 12 Result</label>
                  <input type="number" step="0.01" className="form-control" name="grade_12_result" value={form.grade_12_result} onChange={handleChange} required />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold">COC Result</label>
                  <input type="number" step="0.01" className="form-control" name="coc_result" value={form.coc_result} onChange={handleChange} required />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold">Gender</label>
                  <select className="form-select" name="gender" value={form.gender} onChange={handleChange} required>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold">Disability</label>
                  <select className="form-select" name="disability" value={form.disability} onChange={handleChange}>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold">Minority</label>
                  <select className="form-select" name="minority" value={form.minority} onChange={handleChange}>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 text-end">
                <button type="button" className="btn btn-secondary me-2" onClick={() => navigate('/registrar-dashboard')}>Cancel</button>
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