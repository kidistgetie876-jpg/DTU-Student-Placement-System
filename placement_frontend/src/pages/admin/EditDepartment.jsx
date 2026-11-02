import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api.js';
import { getDepartmentPlacementMetadata } from '../../utils/placementColleges.js';
import DepartmentCatalogFields from './DepartmentCatalogFields.jsx';
import {
  normalizeCatalogCollegeName,
  normalizeCatalogStreamName,
} from './departmentCatalog.js';

const getDepartments = payload => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data.filter(Boolean);
  if (Array.isArray(data?.departments)) return data.departments.filter(Boolean);
  if (Array.isArray(data?.data)) return data.data.filter(Boolean);
  return [];
};

const EditDepartment = ({ id: departmentId, onClose, onSaved }) => {
  const { id: routeDepartmentId } = useParams();
  const id = departmentId ?? routeDepartmentId;
  const navigate = useNavigate();
  const isModal = typeof onClose === 'function';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    stream: 'Natural',
    college_name: '',
    college_id: '',
  });

  useEffect(() => {
    if (!id) {
      setError('Department ID is required.');
      setLoading(false);
      return;
    }
    const loadDepartment = async () => {
      try {
        const response = await api.get('api/common/departments_api.php');
        const department = getDepartments(response.data).find(item => String(item.id) === String(id));
        if (!department) { setError('Department not found.'); return; }
        setForm({
          name: department.name || '',
          description: department.description || '',
          stream: department.stream ? normalizeCatalogStreamName(department.stream) : 'Natural',
          college_name: normalizeCatalogCollegeName(department.college_name, department.stream),
          college_id: department.college_id || '',
        });
      } catch (requestError) {
        setError('Unable to load department data.');
      } finally { setLoading(false); }
    };
    loadDepartment();
  }, [id]);

  const updateField = event => {
    const { name, value } = event.target;
    setForm(current => ({
      ...current,
      [name]: value,
      ...(name === 'stream' || name === 'college_name'
        ? { college_id: '' }
        : {}),
      ...(name === 'stream' ? { college_name: '' } : {}),
    }));
    setError('');
  };

  const handleSubmit = async event => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name || !form.college_name) { setError('Department name and college are required.'); return; }
    setSaving(true);
    setError('');
    try {
      const response = await api.put('api/common/departments_api.php', {
        id: Number(id),
        name,
        description: form.description.trim(),
        stream: form.stream,
        college_name: form.college_name,
        college_id: form.college_id || null,
        ...getDepartmentPlacementMetadata(form.college_name, form.stream),
      });
      if (response.data?.success) {
        if (onSaved) {
          await onSaved();
        } else {
          navigate('/admin-dashboard?tab=departments', { replace: true });
        }
      } else {
        setError(response.data?.message || 'Unable to update department.');
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update department.');
    } finally { setSaving(false); }
  };

  if (loading) {
    const loadingContent = <div className="text-center py-5" role="status">Loading department...</div>;
    return isModal ? (
      <div className="department-edit-modal-overlay">
        <div className="department-edit-modal" role="dialog" aria-modal="true" aria-label="Loading department editor">
          {loadingContent}
        </div>
      </div>
    ) : <div className="container mt-5">{loadingContent}</div>;
  }

  return (
    <div className={isModal ? 'department-edit-modal-overlay' : ''}>
      <div
        className={isModal ? 'department-edit-modal' : 'container py-4'}
        role={isModal ? 'dialog' : undefined}
        aria-modal={isModal || undefined}
        aria-labelledby="department-edit-title"
      >
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4">
          <div>
            <h3 className="fw-bold text-primary mb-1" id="department-edit-title">Edit Department</h3>
            <p className="text-muted mb-0">Update the department details below.</p>
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary mt-3 mt-md-0"
            onClick={() => (isModal ? onClose() : navigate('/admin-dashboard?tab=departments'))}
            disabled={saving}
          >
            Back to Departments
          </button>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                <DepartmentCatalogFields
                  streamValue={form.stream}
                  collegeValue={form.college_name}
                  onStreamChange={stream => {
                    setForm(current => ({ ...current, stream, college_name: '', college_id: '' }));
                    setError('');
                  }}
                  onCollegeChange={(college_name, collegeId) => {
                    const validCollegeId = collegeId !== '' && Number.isInteger(Number(collegeId))
                      ? Number(collegeId)
                      : '';
                    setForm(current => ({ ...current, college_name, college_id: validCollegeId }));
                    setError('');
                  }}
                  disabled={saving}
                  streamLabel="Stream"
                  collegeLabel="College"
                  streamContainerClassName="col-md-6"
                  collegeContainerClassName="col-md-6"
                />
                <div className="col-12">
                  <label className="form-label fw-semibold" htmlFor="department-name">Department name</label>
                  <input id="department-name" name="name" type="text" className="form-control" value={form.name} onChange={updateField} disabled={saving} required />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold" htmlFor="department-description">Description</label>
                  <textarea id="department-description" name="description" className="form-control" rows="4" value={form.description} onChange={updateField} disabled={saving} />
                </div>
                <div className="col-12 d-flex justify-content-end gap-2 pt-2">
                  <button type="button" className="btn btn-light" onClick={() => (isModal ? onClose() : navigate('/admin-dashboard?tab=departments'))} disabled={saving}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditDepartment;
