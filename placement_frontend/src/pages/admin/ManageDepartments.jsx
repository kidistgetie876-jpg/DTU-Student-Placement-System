import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '../../services/api.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { getDepartmentPlacementMetadata } from '../../utils/placementColleges.js';
import EditDepartment from './EditDepartment.jsx';
import DepartmentCatalogFields from './DepartmentCatalogFields.jsx';
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

const getDepartmentHeadName = (department = {}) => {
  const directHeadName = [
    department.head_name,
    department.headName,
    department.assigned_head_name,
    department.assignedHeadName,
  ].find(value => typeof value === 'string' && value.trim());

  if (directHeadName) return directHeadName.trim();

  const firstName = [department.head_first_name, department.first_name].find(value => typeof value === 'string' && value.trim());
  const lastName = [department.head_last_name, department.last_name].find(value => typeof value === 'string' && value.trim());
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (combinedName) return combinedName;

  const username = department.head_username || department.headUserName || department.username;
  if (typeof username === 'string' && username.trim()) return username.trim();

  return '';
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


  const DepartmentRow = ({ department, index, onEdit, onAssignHead }) => {
    const { t } = useLanguage();
    return (
      <tr>
        <td className="ps-4 text-muted">{index + 1}</td>
        <td className="text-primary fw-semibold">{department.stream}</td>
        <td className="small">{department.college_name?.replace(/College of\s+/i, '')}</td>
        <td className="fw-bold">{department.name}</td>
        <td className="fw-bold text-center">
          {department.capacity > 0 ? department.capacity : <span className="text-muted small">{t('Not Set')}</span>}
        </td>
        <td className="text-center">
          {department.head_name ? (
            <span className="badge bg-primary-subtle text-primary px-3 py-2 rounded-pill border border-primary-subtle">
              {department.head_name}
            </span>
          ) : <span className="text-muted small">{t('Not Assigned')}</span>}
        </td>
        <td className="department-actions-cell pe-4 text-end">
          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              className="department-assign-head-button btn btn-sm rounded-3"
              onClick={() => onAssignHead(department)}
              aria-label={`${t('Assign Head')} ${department.name}`}
            >
              {t('Assign Head')}
            </button>
            <button type="button" className="department-edit-button btn btn-sm rounded-3" onClick={() => onEdit(department.id)} aria-label={`${t('Edit')} ${department.name}`}>
              {t('Edit')}
            </button>
          </div>
        </td>
      </tr>
    );
  };

const DepartmentTable = ({ departments, loading, onEdit, onAssignHead }) => {
  const { t } = useLanguage();
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
        <h5 className="mb-0 fw-bold">{t('Departments')}</h5>
        <form className="department-search d-flex" onSubmit={handleSearch} role="search">
          <label className="visually-hidden" htmlFor="department-search-input">{t('Search departments')}</label>
          <input id="department-search-input" type="search" className="form-control" placeholder={t('Search departments...')} value={searchInput} onChange={event => setSearchInput(event.target.value)} />
          <button type="submit" className="btn btn-primary ms-2">{t('Search')}</button>
        </form>
      </div>
      <div className="table-responsive">
        <table className="department-table table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th scope="col" className="ps-4">#</th>
              <th scope="col">{t('STREAM')}</th>
              <th scope="col">{t('COLLEGE')}</th>
              <th scope="col">{t('NAME')}</th>
              <th scope="col">{t('CAPACITY')}</th>
              <th scope="col" className="text-center">{t('HEAD NAME')}</th>
              <th scope="col" className="pe-4 text-end">{t('ACTIONS')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? tableMessage(t('Loading departments...')) : visibleDepartments.length === 0 ? tableMessage(t('No departments found.')) : visibleDepartments.map((department, index) => (
              <DepartmentRow
                key={department.id || `${department.name}-${index}`}
                department={department}
                index={index}
                onEdit={onEdit}
                onAssignHead={onAssignHead}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="department-pagination d-flex flex-column flex-sm-row justify-content-between align-items-center gap-2 p-3">
        <span className="text-muted small">{t('Showing {start} - {end} of {total}', {
          start: visibleDepartments.length ? (currentPage - 1) * departmentsPerPage + 1 : 0,
          end: Math.min(currentPage * departmentsPerPage, filteredDepartments.length),
          total: filteredDepartments.length,
        })}</span>
        <div className="d-flex align-items-center gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1}>{t('Previous')}</button>
          <span className="small fw-semibold">{t('Page {current} of {total}', { current: currentPage, total: totalPages })}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>{t('Next')}</button>
        </div>
      </div>
    </div>
  );
};

const ManageDepartments = () => {
  const { t } = useLanguage();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // የፎርም ስቴቶች (Capacity ተወግዷል)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedStreamId, setSelectedStreamId] = useState('default-natural');
  const [selectedStreamName, setSelectedStreamName] = useState('Natural');
  const [collegeName, setCollegeName] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [assignmentDepartment, setAssignmentDepartment] = useState(null);
  const [departmentHeads, setDepartmentHeads] = useState([]);
  const [selectedHeadId, setSelectedHeadId] = useState('');
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState('');
  const [editingDepartmentId, setEditingDepartmentId] = useState(null);
  
  // Validation state
  const [validationErrors, setValidationErrors] = useState({});

  const handleCatalogsLoaded = useCallback(loadedStreams => {
    const selected = loadedStreams.find(item => /^(natural|natural science)$/i.test(item.name))
      ?? loadedStreams[0];
    setSelectedStreamId(String(selected?.id ?? ''));
    setSelectedStreamName(selected?.name || '');
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const resDepts = await api.get('api/common/departments_api.php', { params: { status: 'all' } });
      const normalizedDepartments = normalizeDepartmentsPayload(resDepts.data ?? resDepts);
      setDepartments(normalizedDepartments.map(department => ({
        ...department,
        head_id: department.head_id !== undefined && department.head_id !== null ? Number(department.head_id) : null,
        head_name: getDepartmentHeadName(department),
        stream: getDepartmentStream(department),
      })));

    } catch (err) {
      setError('Backend connection error!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStreamChange = (streamName, streamId) => {
    setSelectedStreamId(String(streamId));
    setSelectedStreamName(streamName);
    setCollegeName('');
    setCollegeId('');
    setValidationErrors(current => ({ ...current, college: '' }));
  };

  const handleCollegeChange = (value, id) => {
    setCollegeName(value);
    setCollegeId(id);
    setValidationErrors(current => ({ ...current, college: '' }));
  };

  const handleOpenAssignment = async department => {
    setAssignmentDepartment(department);
    setSelectedHeadId(String(department.head_id ?? ''));
    setAssignmentError('');
    setDepartmentHeads([]);
    setAssignmentLoading(true);

    try {
      const response = await api.get('api/admin/users_api.php');
      const payload = response.data?.users ?? response.data ?? [];
      const users = Array.isArray(payload) ? payload : [];
      setDepartmentHeads(users.filter(user => String(user.role || '').trim().toLowerCase() === 'head'));
    } catch (err) {
      setAssignmentError(err.response?.data?.message || err.message || 'Unable to load department head accounts.');
    } finally {
      setAssignmentLoading(false);
    }
  };

  const handleSaveAssignment = async event => {
    event.preventDefault();
    if (!assignmentDepartment || !selectedHeadId) {
      setAssignmentError('Select a department head before saving.');
      return;
    }

    setAssignmentSaving(true);
    setAssignmentError('');
    try {
      const response = await api.post('api/admin/assign_department_head.php', {
        department_id: Number(assignmentDepartment.id),
        head_id: Number(selectedHeadId),
      });
      const result = response.data ?? response;
      if (!result.success) {
        throw new Error(result.message || 'Unable to save department head assignment.');
      }

      const assignedHead = departmentHeads.find(head => String(head.id) === String(selectedHeadId));
      const headName = [assignedHead?.first_name, assignedHead?.last_name].filter(Boolean).join(' ')
        || assignedHead?.username
        || assignedHead?.email
        || result?.department?.head_name
        || '';
      setDepartments(current => current.map(department => (
        String(department.id) === String(assignmentDepartment.id)
          ? { ...department, head_id: Number(selectedHeadId), head_name: headName }
          : department
      )));
      setAssignmentDepartment(null);
    } catch (err) {
      setAssignmentError(err.response?.data?.message || err.message || 'Unable to save department head assignment.');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleRemoveAssignment = async () => {
    if (!assignmentDepartment) return;

    setAssignmentSaving(true);
    setAssignmentError('');
    try {
      const response = await api.delete('api/admin/assign_department_head.php', {
        data: { department_id: Number(assignmentDepartment.id) },
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to remove the department head.');
      }

      setDepartments(current => current.map(department => (
        String(department.id) === String(assignmentDepartment.id)
          ? { ...department, head_id: null, head_name: null }
          : department
      )));
      setAssignmentDepartment(null);
    } catch (err) {
      setAssignmentError(err.response?.data?.message || err.message || 'Unable to remove the department head.');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const getAssignedDepartment = headId => departments.find(department => (
    String(department.head_id ?? '') === String(headId)
    && String(department.id) !== String(assignmentDepartment?.id)
  ));

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
        stream: selectedStreamName,
        college_name: collegeName,
        college_id: collegeId !== '' && Number.isInteger(Number(collegeId)) ? Number(collegeId) : null,
        ...getDepartmentPlacementMetadata(collegeName, selectedStreamName),
        status: 'active',
      });
      if (res.data.success) {
        setName(''); setDescription(''); setCollegeName(''); setCollegeId('');
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
          <h3 className="fw-bold text-primary mb-1">{t('Manage DTU Departments')}</h3>
          <p className="text-muted mb-0">{t('Create academic units and assign leadership.')}</p>
        </div>

        <div className="d-flex gap-2 mt-3 mt-md-0 align-items-center">
          <span className="badge bg-light text-dark border px-3 py-2 rounded-pill">{departments.length} {t('Depts')}</span>
        </div>
      </div>

      {error && <div className="alert alert-danger rounded-3">{error}</div>}

      <div className="department-form-card card shadow-sm border-0 mb-5 rounded-4 overflow-hidden">
        <div className="card-header py-3 px-4">
          <h5 className="mb-0 fw-bold">{t('Add New Department')}</h5>
        </div>
        <div className="card-body p-4">
          <form onSubmit={handleSubmit} className="row g-3 align-items-end">
            <DepartmentCatalogFields
              streamValue={selectedStreamId}
              collegeValue={collegeName}
              onStreamChange={handleStreamChange}
              onCollegeChange={handleCollegeChange}
              onCatalogsLoaded={handleCatalogsLoaded}
              streamLabel={`1. ${t('STREAM')}`}
              collegeLabel={`2. ${t('COLLEGE')}`}
              collegeError={validationErrors.college}
              streamContainerClassName="col-md-4"
              collegeContainerClassName="col-md-4"
              collegeSelectClassName={`form-select ${validationErrors.college ? 'is-invalid' : ''}`}
            />
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted">3. {t('Department Name')}</label>
              <input 
                type="text" 
                className={`form-control ${validationErrors.name ? 'is-invalid' : ''}`}
                placeholder={t('e.g. Computer Science')}
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
              />
              {validationErrors.name && <div className="invalid-feedback d-block">{validationErrors.name}</div>}
            </div>
            <div className="col-md-12">
              <label className="form-label fw-bold small text-muted">{t('Description')}</label>
              <textarea 
                className={`form-control ${validationErrors.description ? 'is-invalid' : ''}`}
                rows={2} 
                placeholder={t('Optional details...')}
                value={description} 
                onChange={e => setDescription(e.target.value)} 
              />
              {validationErrors.description && <div className="invalid-feedback d-block">{validationErrors.description}</div>}
              {description.trim().length > 0 && (
                <small className="text-muted">{description.length}/500 {t('characters')}</small>
              )}
            </div>
            <div className="col-md-12 text-end">
              <button className="btn btn-primary px-5 fw-bold rounded-pill shadow" disabled={saving}>
                {saving ? t('Processing...') : t('Register Department')}
              </button>
            </div>
          </form>
        </div>
      </div>

      <DepartmentTable
        departments={departments}
        loading={loading}
        onEdit={id => setEditingDepartmentId(id)}
        onAssignHead={handleOpenAssignment}
      />

      {editingDepartmentId !== null && (
        <EditDepartment
          key={editingDepartmentId}
          id={editingDepartmentId}
          onClose={() => setEditingDepartmentId(null)}
          onSaved={async () => {
            await loadData();
            setEditingDepartmentId(null);
          }}
        />
      )}

      {assignmentDepartment && (
        <div className="department-assign-modal-overlay" role="presentation">
          <div
            className="department-assign-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="department-assign-title"
            aria-describedby={assignmentError ? 'department-assign-error' : undefined}
          >
            <form onSubmit={handleSaveAssignment}>
              <div className="department-assign-modal-header">
                <div>
                  <h2 className="department-assign-modal-title" id="department-assign-title">Assign Department Head</h2>
                  <p className="small text-muted mb-0">Assign a head to {assignmentDepartment.name}.</p>
                </div>
                <button
                  type="button"
                  className="department-catalog-modal-close"
                  aria-label="Close"
                  onClick={() => setAssignmentDepartment(null)}
                  disabled={assignmentSaving}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              <dl className="department-assign-details">
                <div><dt>Name</dt><dd>{assignmentDepartment.name}</dd></div>
                <div><dt>Stream</dt><dd>{assignmentDepartment.stream || 'Not set'}</dd></div>
                <div><dt>College</dt><dd>{assignmentDepartment.college_name || 'Not set'}</dd></div>
              </dl>
              <label className="department-catalog-modal-label" htmlFor="department-head-select">Department Head</label>
              <select
                id="department-head-select"
                className="form-select"
                value={selectedHeadId}
                onChange={event => setSelectedHeadId(event.target.value)}
                disabled={assignmentLoading || assignmentSaving}
                required
              >
                <option value="">-- Select a Department Head --</option>
                {departmentHeads.map(head => {
                  const assignedDepartment = getAssignedDepartment(head.id);
                  const displayName = [head.first_name, head.last_name].filter(Boolean).join(' ')
                    || head.username
                    || head.email
                    || `User ${head.id}`;
                  return (
                    <option
                      key={head.id}
                      value={head.id}
                      disabled={Boolean(assignedDepartment)}
                    >
                      {displayName}{assignedDepartment ? ` — assigned to ${assignedDepartment.name}` : ''}
                    </option>
                  );
                })}
              </select>
              {assignmentLoading && <div className="form-text">Loading department head accounts...</div>}
              {!assignmentLoading && departmentHeads.length === 0 && (
                <div className="form-text">No Department Head accounts are available.</div>
              )}
              {assignmentError && (
                <div className="department-catalog-modal-error" id="department-assign-error" role="alert">
                  {assignmentError}
                </div>
              )}
              <div className="department-catalog-modal-actions">
                {assignmentDepartment.head_id && (
                  <button
                    type="button"
                    className="btn btn-outline-danger me-auto"
                    onClick={handleRemoveAssignment}
                    disabled={assignmentLoading || assignmentSaving}
                  >
                    {assignmentSaving ? 'Saving...' : 'Remove Head'}
                  </button>
                )}
                <button
                  type="button"
                  className="department-catalog-modal-cancel"
                  onClick={() => setAssignmentDepartment(null)}
                  disabled={assignmentSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="department-assign-modal-submit"
                  disabled={assignmentLoading || assignmentSaving || departmentHeads.length === 0}
                >
                  {assignmentSaving ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
          <button
            type="button"
            className="department-catalog-modal-backdrop-dismiss"
            aria-label="Close assignment dialog"
            onClick={() => setAssignmentDepartment(null)}
            disabled={assignmentSaving}
          />
        </div>
      )}

    </div>
  );
};

export default ManageDepartments;