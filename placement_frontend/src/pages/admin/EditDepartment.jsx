import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api.js';

const collegesByStream = {
  Natural: ['Gafat Institute of Technology', 'College of Natural and Computational Sciences', 'College of Agriculture and Environmental Sciences', 'College of Health Science', 'Freshman Faculty'],
  Social: ['College of Social Sciences and Humanities', 'College of Business and Economics', 'School of Law'],
};

const getDepartments = payload => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data.filter(Boolean);
  if (Array.isArray(data?.departments)) return data.departments.filter(Boolean);
  if (Array.isArray(data?.data)) return data.data.filter(Boolean);
  return [];
};

const EditDepartment = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '', stream: 'Natural', college_name: '' });

  useEffect(() => {
    if (!id) { navigate('/admin-dashboard'); return; }
    const loadDepartment = async () => {
      try {
        const response = await api.get('api/common/departments_api.php');
        const department = getDepartments(response.data).find(item => String(item.id) === String(id));
        if (!department) { setError('Department not found.'); return; }
        setForm({
          name: department.name || '',
          description: department.description || '',
          stream: department.stream === 'Social' ? 'Social' : 'Natural',
          college_name: department.college_name || '',
        });
      } catch (requestError) {
        setError('Unable to load department data.');
      } finally { setLoading(false); }
    };
    loadDepartment();
  }, [id, navigate]);

  const updateField = event => {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
    setError('');
  };

  const handleSubmit = async event => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name || !form.college_name) { setError('Department name and college are required.'); return; }
    setSaving(true);
    setError('');
    try {
      const response = await api.put('api/common/departments_api.php', { id: Number(id), name, description: form.description.trim(), stream: form.stream, college_name: form.college_name });
      if (response.data?.success) navigate('/admin-dashboard', { state: { activeTab: 'departments' } });
      else setError(response.data?.message || 'Unable to update department.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update department.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="container text-center mt-5">Loading department...</div>;

  return (
    <div className="container py-4">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4">
        <div><h3 className="fw-bold text-primary mb-1">Edit Department</h3><p className="text-muted mb-0">Update the department details below.</p></div>
        <button type="button" className="btn btn-outline-secondary mt-3 mt-md-0" onClick={() => navigate(-1)}>Back</button>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="card border-0 shadow-sm"><div className="card-body p-4">
        <form onSubmit={handleSubmit}><div className="row g-3">
          <div className="col-md-6"><label className="form-label fw-semibold" htmlFor="department-stream">Stream</label><select id="department-stream" name="stream" className="form-select" value={form.stream} onChange={updateField} disabled={saving}><option value="Natural">Natural Science</option><option value="Social">Social Science</option></select></div>
          <div className="col-md-6"><label className="form-label fw-semibold" htmlFor="department-college">College</label><select id="department-college" name="college_name" className="form-select" value={form.college_name} onChange={updateField} disabled={saving} required><option value="">Select college</option>{collegesByStream[form.stream].map(college => <option key={college} value={college}>{college}</option>)}</select></div>
          <div className="col-12"><label className="form-label fw-semibold" htmlFor="department-name">Department name</label><input id="department-name" name="name" type="text" className="form-control" value={form.name} onChange={updateField} disabled={saving} required /></div>
          <div className="col-12"><label className="form-label fw-semibold" htmlFor="department-description">Description</label><textarea id="department-description" name="description" className="form-control" rows="4" value={form.description} onChange={updateField} disabled={saving} /></div>
          <div className="col-12 d-flex justify-content-end gap-2 pt-2"><button type="button" className="btn btn-light" onClick={() => navigate(-1)} disabled={saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></div>
        </div></form>
      </div></div>
    </div>
  );
};

export default EditDepartment;
