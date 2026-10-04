import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';
import './ManageDepartments.css';

const normalizeDepartmentsPayload = (payload) => {
  if (!payload) return [];
  const topLevel = payload.data ?? payload;
  if (Array.isArray(topLevel)) return topLevel.filter(Boolean);
  if (Array.isArray(topLevel?.departments)) return topLevel.departments.filter(Boolean);
  if (Array.isArray(topLevel?.data)) return topLevel.data.filter(Boolean);
  if (topLevel && typeof topLevel === 'object' && topLevel?.name) return [topLevel];
  return [];
};

const getDepartmentStream = (department) => {
  const rawStream = String(
    department?.stream || department?.academic_stream || department?.category || ''
  ).trim();
  if (/^social( science)?$/i.test(rawStream)) return 'Social';
  if (/^natural( science)?$/i.test(rawStream)) return 'Natural';
  if (rawStream) return rawStream;

  const college = String(
    department?.college_name || department?.college || department?.faculty || ''
  ).toLowerCase();
  const name = String(department?.name || '').toLowerCase();

  if (college.includes('business') || college.includes('economics')) return 'Social';
  if (college.includes('social') || college.includes('humanit') || college.includes('law')) return 'Social';
  if (college.includes('agric') || college.includes('health') || college.includes('engineer')) return 'Natural';
  if (college.includes('natural') || college.includes('comput') || college.includes('environment')) return 'Natural';
  if (/biology|chemistry|physics|mathematics|computer|engineering|agric/.test(name)) return 'Natural';

  return 'Natural';
};


  const collegesByStream = {
  'Natural': [
    'Gafat Institute of Technology',
    'College of Natural and Computational Sciences',
    'College of Agriculture and Environmental Sciences',
    'College of Health Science',
    'Freshman Faculty'
  ],
  'Social': [
    'College of Social Sciences and Humanities',
    'College of Business and Economics',
    'School of Law'
  ]
};


const DepartmentRow = ({ department, index, onEdit }) => (
  <tr>
    <td className="ps-4 text-muted">{index + 1}</td>
    <td className="text-primary fw-semibold">{department.stream}</td>
    <td className="small">{department.college_name?.replace(/College of\s+/i, '')}</td>
    <td className="fw-bold">{department.name}</td>
    <td className="fw-bold text-center">
      {department.capacity > 0 ? department.capacity : <span className="text-muted small">Not Set</span>}
    </td>
    <td className="text-center">
      {department.head_name ? (
        <span className="badge bg-primary-subtle text-primary px-3 py-2 rounded-pill border border-primary-subtle">
          {department.head_name}
        </span>
      ) : <span className="text-muted small">Not Assigned</span>}
    </td>
    <td className="department-edit-cell pe-4 text-end">
      <button type="button" className="department-edit-button btn btn-sm rounded-3" onClick={() => onEdit(department.id)} aria-label={`Edit ${department.name}`}>
        Edit
      </button>
    </td>
  </tr>
);

const DepartmentTable = ({ departments, loading, onEdit }) => {
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const departmentsPerPage = 8;
  const tableMessage = message => <tr><td colSpan="7" className="text-center text-muted py-4">{message}</td></tr>;
  const filteredDepartments = departments.filter(department => [
    department.name,
    department.college_name,
    department.stream,
    department.head_name,
  ].filter(Boolean).join(' ').toLowerCase().includes(searchTerm.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filteredDepartments.length / departmentsPerPage));
  const visibleDepartments = filteredDepartments.slice(
    (currentPage - 1) * departmentsPerPage,
    currentPage * departmentsPerPage
  );

  const handleSearch = event => {
    event.preventDefault();
    setSearchTerm(searchInput.trim());
    setCurrentPage(1);
  };

  return (
    <div className="department-table-card card shadow-sm border-0 rounded-4 overflow-hidden">
      <div className="department-table-toolbar d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 p-3">
        <h5 className="mb-0 fw-bold">Departments</h5>
        <form className="department-search d-flex" onSubmit={handleSearch} role="search">
          <label className="visually-hidden" htmlFor="department-search-input">Search departments</label>
          <input id="department-search-input" type="search" className="form-control" placeholder="Search departments..." value={searchInput} onChange={event => setSearchInput(event.target.value)} />
          <button type="submit" className="btn btn-primary ms-2">Search</button>
        </form>
      </div>
      <div className="table-responsive">
        <table className="department-table table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th scope="col" className="ps-4">#</th>
              <th scope="col">STREAM</th>
              <th scope="col">COLLEGE</th>
              <th scope="col">NAME</th>
              <th scope="col">CAPACITY</th>
              <th scope="col" className="text-center">HEAD NAME</th>
              <th scope="col" className="pe-4 text-end">EDIT</th>
            </tr>
          </thead>
          <tbody>
            {loading ? tableMessage('Loading departments...') : visibleDepartments.length === 0 ? tableMessage('No departments found.') : visibleDepartments.map((department, index) => (
              <DepartmentRow key={department.id || `${department.name}-${index}`} department={department} index={index} onEdit={onEdit} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="department-pagination d-flex flex-column flex-sm-row justify-content-between align-items-center gap-2 p-3">
        <span className="text-muted small">Showing {visibleDepartments.length ? (currentPage - 1) * departmentsPerPage + 1 : 0} - {Math.min(currentPage * departmentsPerPage, filteredDepartments.length)} of {filteredDepartments.length}</span>
        <div className="d-flex align-items-center gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1}>Previous</button>
          <span className="small fw-semibold">Page {currentPage} of {totalPages}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>Next</button>
        </div>
      </div>
    </div>
  );
};

const ManageDepartments = () => {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // የፎርም ስቴቶች (Capacity ተወግዷል)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stream, setStream] = useState('Natural');
  const [collegeName, setCollegeName] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Validation state
  const [validationErrors, setValidationErrors] = useState({});

  const loadData = async () => {
    setLoading(true);
    try {
      const resDepts = await api.get('api/common/departments_api.php');
      const normalizedDepartments = normalizeDepartmentsPayload(resDepts.data ?? resDepts);
      setDepartments(normalizedDepartments.map(department => ({
        ...department,
        stream: getDepartmentStream(department),
      })));

      const resUsers = await api.get('api/admin/users_api.php');
    } catch (err) {
      setError('Backend connection error!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Validation function
  const validateForm = () => {
    const errors = {};

    // Validate department name
    if (!name.trim()) {
      errors.name = 'Department name is required';
    } else if (name.trim().length < 2) {
      errors.name = 'Department name must be at least 2 characters';
    } else if (name.trim().length > 100) {
      errors.name = 'Department name must not exceed 100 characters';
    } else if (!/^[a-zA-Z\s]+$/.test(name.trim())) {
      errors.name = 'Department name must be only letters (A-Z, a-z and spaces). Numbers and symbols are not allowed.';
    } else {
      // Check for duplicate department names
      const duplicateExists = departments.some(dept => 
        dept.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (duplicateExists) {
        errors.name = 'A department with this name already exists';
      }
    }

    // Validate college selection
    if (!collegeName.trim()) {
      errors.college = 'Please select a college';
    }

    // Validate description (optional but if provided, validate length)
    if (description.trim().length > 500) {
      errors.description = 'Description must not exceed 500 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form before submission
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      // Capacity እዚህ ጋር አይላክም (በኋላ በHead ይሞላል)
      const res = await api.post('api/common/departments_api.php', {
        name: name.trim(),
        description: description.trim(),
        stream,
        college_name: collegeName,
        status: 'active',
      });
      if (res.data.success) {
        setName(''); setDescription(''); setCollegeName('');
        setValidationErrors({});
        loadData();
      } else {
        alert(res.data.message);
      }
    } catch (err) {
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="department-page container p-0">
      <div className="department-page-header d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 mt-3">
        <div>
          <h3 className="fw-bold text-primary mb-1">Manage DTU Departments</h3>
          <p className="text-muted mb-0">Create academic units and assign leadership.</p>
        </div>

        <div className="d-flex gap-2 mt-3 mt-md-0 align-items-center">
          <button
            type="button"
            className="department-assign-head-button btn rounded-pill px-4 shadow-sm fw-bold"
            onClick={() => navigate('/admin/assign-head')}
          >
            + Assign Head
          </button>
          <span className="badge bg-light text-dark border px-3 py-2 rounded-pill">{departments.length} Depts</span>
        </div>
      </div>

      {error && <div className="alert alert-danger rounded-3">{error}</div>}

      <div className="department-form-card card shadow-sm border-0 mb-5 rounded-4 overflow-hidden">
        <div className="card-header py-3 px-4">
          <h5 className="mb-0 fw-bold">Add New Department</h5>
        </div>
        <div className="card-body p-4">
          <form onSubmit={handleSubmit} className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted">1. STREAM</label>
              <select className="form-select" value={stream} onChange={e => {setStream(e.target.value); setCollegeName('');}}>
                <option value="Natural">Natural Science</option>
                <option value="Social">Social Science</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted">2. COLLEGE</label>
              <select className={`form-select ${validationErrors.college ? 'is-invalid' : ''}`} value={collegeName} onChange={e => setCollegeName(e.target.value)} required>
                <option value="">-- Select College --</option>
                {collegesByStream[stream]?.map(c => <option key={c} value={c}>{c.replace(/\t/g, '')}</option>)}
              </select>
              {validationErrors.college && <div className="invalid-feedback d-block">{validationErrors.college}</div>}
            </div>
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted">3. DEPARTMENT NAME</label>
              <input 
                type="text" 
                className={`form-control ${validationErrors.name ? 'is-invalid' : ''}`}
                placeholder="e.g. Computer Science" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
              />
              {validationErrors.name && <div className="invalid-feedback d-block">{validationErrors.name}</div>}
            </div>
            <div className="col-md-12">
              <label className="form-label fw-bold small text-muted">DESCRIPTION</label>
              <textarea 
                className={`form-control ${validationErrors.description ? 'is-invalid' : ''}`}
                rows={2} 
                placeholder="Optional details..." 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
              />
              {validationErrors.description && <div className="invalid-feedback d-block">{validationErrors.description}</div>}
              {description.trim().length > 0 && (
                <small className="text-muted">{description.length}/500 characters</small>
              )}
            </div>
            <div className="col-md-12 text-end">
              <button className="btn btn-primary px-5 fw-bold rounded-pill shadow" disabled={saving}>
                {saving ? 'Processing...' : 'Register Department'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <DepartmentTable departments={departments} loading={loading} onEdit={id => navigate(`/edit-department/${id}`)} />
    </div>
  );
};

export default ManageDepartments;