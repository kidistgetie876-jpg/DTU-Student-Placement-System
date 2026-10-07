import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';

const initialForm = {
  firstName: '',
  lastName: '',
  username: '',
  email: '',
  password: '',
  phone: '',
  gender: 'Male',
  gpa: '',
  grade12: '',
  coc: '',
  stream: '',
  disability: 'No',
  minority: 'No',
};

const normalizeDepartmentPayload = (payload) => {
  const topLevel = payload?.data ?? payload;
  if (Array.isArray(topLevel)) return topLevel.filter(Boolean);
  if (Array.isArray(topLevel?.departments)) return topLevel.departments.filter(Boolean);
  if (Array.isArray(topLevel?.data)) return topLevel.data.filter(Boolean);
  return [];
};

const StudentRegistration = ({ onBack, onSuccess }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const response = await api.get('api/common/departments_api.php');
        const list = normalizeDepartmentPayload(response.data);
        setDepartments(list);
      } catch (err) {
        console.error('Failed to load departments:', err);
        setDepartments([]);
      }
    };

    loadDepartments();
  }, []);
  

  // ለመምረጥ የሚያስፈልገው ስትሪም (Natural/Social) ብቻ ነው
  const streamOptions = useMemo(
    () => [...new Set(departments.map((department) => (department.stream || department.academic_stream || '').trim()).filter(Boolean))],
    [departments]
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    if (!form.firstName.trim()) return 'First name is required.';
    if (!form.lastName.trim()) return 'Last name is required.';
    if (!form.username.trim()) return 'Username is required.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return 'Valid email is required.';
    if (form.password.length < 6) return 'Password must be at least 6 characters long.';
    if (!form.phone.trim()) return 'Phone number is required.';
    if (!form.stream) return 'Please select a stream.';

    if (Number(form.gpa) < 0 || Number(form.gpa) > 4) return 'CGPA must be between 0 and 4.';
    if (Number(form.grade12) < 0 || Number(form.grade12) > 100) return 'G12 score must be between 0 and 100.';
    if (form.coc !== '' && (Number(form.coc) < 0 || Number(form.coc) > 30)) return 'COC score must be between 0 and 30.';
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
      // 1. ተጠቃሚውን መፍጠር
      const userPayload = {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        username: form.username.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: 'student',
      };

      const userResponse = await api.post('api/admin/users_api.php', userPayload);
      const createdUser = userResponse.data?.user || userResponse.data?.data || userResponse.data || {};
      const userId = Number(
        createdUser.id ||
        createdUser.user_id ||
        createdUser.student_id ||
        userResponse.data?.id ||
        userResponse.data?.user_id ||
        0
      );

      if (!userId) {
        throw new Error('The user account was created, but the API did not return its ID.');
      }

      // 2. የተማሪውን ፕሮፋይል መፍጠር (ያለ ኮሌጅና ዲፓርትመንት)
      const profilePayload = {
        user_id: userId,
        username: form.username.trim(),
        email: form.email.trim().toLowerCase(),
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: form.phone.trim(),
        gender: form.gender,
        gpa: Number(form.gpa) || 0,
        stream: form.stream || null,
        grade_12_result: Number(form.grade12) || 0,
        coc_result: form.coc.trim() !== '' ? form.coc.trim() : null,
        disability: form.disability,
        minority: form.minority,
        status: 'Pending',
      };

      const profileResponse = await api.post('api/common/profile_update.php', profilePayload);
      if (!profileResponse.data?.success) {
        throw new Error(profileResponse.data?.message || 'Could not save profile.');
      }

      setSuccess('Student registered successfully!');
      setForm(initialForm);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        else navigate('/registrar-dashboard');
      }, 1500);

    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="card shadow-lg border-0" style={{ borderRadius: '18px' }}>
            <div className="card-body p-4 p-md-5">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h3 className="fw-bold text-primary mb-0">Student Registration</h3>
                <button className="btn btn-outline-secondary" onClick={() => onBack ? onBack() : navigate('/registrar-dashboard')}>Back</button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">First Name</label>
                    <input type="text" className="form-control" name="firstName" value={form.firstName} onChange={handleChange} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Last Name</label>
                    <input type="text" className="form-control" name="lastName" value={form.lastName} onChange={handleChange} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Username</label>
                    <input type="text" className="form-control" name="username" value={form.username} onChange={handleChange} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Email Address</label>
                    <input type="email" className="form-control" name="email" value={form.email} onChange={handleChange} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Password</label>
                    <input type="password" className="form-control" name="password" value={form.password} onChange={handleChange} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Phone Number</label>
                    <input type="tel" className="form-control" name="phone" value={form.phone} onChange={handleChange} required />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Gender</label>
                    <select className="form-select" name="gender" value={form.gender} onChange={handleChange}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">CGPA</label>
                    <input type="number" step="0.01" className="form-control" name="gpa" value={form.gpa} onChange={handleChange} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">G12 Score</label>
                    <input type="number" min="0" max="100" step="0.01" className="form-control" name="grade12" value={form.grade12} onChange={handleChange} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">COC / Certificate <span className="text-muted fw-normal">(Optional)</span></label>
                    <input type="number" min="0" max="30" step="0.01" className="form-control" name="coc" value={form.coc} onChange={handleChange} placeholder="Leave blank if unavailable" />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Stream</label>
                    <select className="form-select" name="stream" value={form.stream} onChange={handleChange} required>
                      <option value="">Select Stream</option>
                      {streamOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-semibold">Disability</label>
                    <select className="form-select" name="disability" value={form.disability} onChange={handleChange}>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label fw-semibold">Minority</label>
                    <select className="form-select" name="minority" value={form.minority} onChange={handleChange}>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 text-end">
                  <button type="submit" className="btn btn-primary px-5 py-2" disabled={loading}>
                    {loading ? 'Processing...' : 'Register Student'}
                  </button>
                </div>
                {error && <div className="alert alert-danger mt-3 mb-0" role="alert" aria-live="polite">{error}</div>}
                {success && <div className="alert alert-success mt-3 mb-0" role="status" aria-live="polite">{success}</div>}
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentRegistration;