import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import api from '../../services/api.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import './ManageDepartments.css';

const DEFAULT_STREAMS = [
  { id: 'default-natural', name: 'Natural Science' },
  { id: 'default-social', name: 'Social Science' },
];

const DEFAULT_COLLEGES = [
  { id: 'default-technology', name: 'Gafat Institute of Technology', stream_id: 'default-natural' },
  {
    id: 'default-agriculture',
    name: 'Agriculture and Environmental Sciences',
    stream_id: 'default-natural',
  },
  {
    id: 'default-natural-sciences',
    name: 'Natural and Computational Sciences',
    stream_id: 'default-natural',
  },
  { id: 'default-health', name: 'Health Science', stream_id: 'default-natural' },
  { id: 'default-freshman', name: 'Freshman Faculty', stream_id: 'default-natural' },
  {
    id: 'default-social-sciences',
    name: 'Social Sciences and Humanities',
    stream_id: 'default-social',
  },
  {
    id: 'default-business',
    name: 'Business and Economics',
    stream_id: 'default-social',
  },
  { id: 'default-law', name: 'Law', stream_id: 'default-social' },
];

const normalizeStreamName = name => {
  const normalized = String(name || '').trim().toLowerCase();
  if (normalized === 'natural' || normalized === 'natural science') return 'natural science';
  if (normalized === 'social' || normalized === 'social science') return 'social science';
  return normalized;
};

const normalizeCollegeName = name => String(name || '')
  .trim()
  .toLowerCase()
  .replace(/^(college|school) of\s+/i, '');

const getCollegeKey = name => {
  const normalized = normalizeCollegeName(name).replace(/\s+/g, ' ');
  if (['technology', 'gafat institute of technology', 'gefat institute of technology'].includes(normalized)) {
    return 'gafat institute of technology';
  }
  return normalized;
};

const getCollegeDisplayName = name => (
  getCollegeKey(name) === 'gafat institute of technology'
    ? 'Gafat Institute of Technology'
    : String(name || '').trim()
);

const mergeStreams = dynamicStreams => {
  const streams = DEFAULT_STREAMS.map(stream => ({ ...stream }));
  const defaultByName = new Map(streams.map(stream => [normalizeStreamName(stream.name), stream]));

  dynamicStreams.forEach(stream => {
    const normalizedName = normalizeStreamName(stream.name);
    const matchingDefault = defaultByName.get(normalizedName);
    if (matchingDefault) {
      matchingDefault.id = stream.id;
      return;
    }
    if (!streams.some(item => normalizeStreamName(item.name) === normalizedName)) {
      streams.push(stream);
    }
  });

  return streams;
};

const mergeColleges = (dynamicColleges, streams) => {
  const defaultStreamId = {
    'default-natural': streams.find(stream => normalizeStreamName(stream.name) === 'natural science')?.id,
    'default-social': streams.find(stream => normalizeStreamName(stream.name) === 'social science')?.id,
  };
  const colleges = DEFAULT_COLLEGES.map(college => ({
    ...college,
    stream_id: defaultStreamId[college.stream_id] ?? college.stream_id,
  }));
  const collegeIndexes = new Map(colleges.map((college, index) => [
    `${college.stream_id}:${getCollegeKey(college.name)}`,
    index,
  ]));
  const dynamicCollegeKeys = new Set();

  dynamicColleges.forEach(college => {
    const stream = streams.find(item =>
      String(item.id) === String(college.stream_id)
      || normalizeStreamName(item.name) === normalizeStreamName(college.stream_name)
    );
    const mappedCollege = {
      ...college,
      name: getCollegeDisplayName(college.name),
      stream_id: stream?.id ?? college.stream_id,
    };
    const key = `${mappedCollege.stream_id}:${getCollegeKey(mappedCollege.name)}`;
    const existingIndex = collegeIndexes.get(key);
    if (existingIndex !== undefined) {
      if (!dynamicCollegeKeys.has(key)) colleges[existingIndex] = mappedCollege;
    } else {
      collegeIndexes.set(key, colleges.length);
      colleges.push(mappedCollege);
    }
    dynamicCollegeKeys.add(key);
  });

  return colleges;
};

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


  const DepartmentRow = ({ department, index, onEdit }) => {
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
        <td className="department-edit-cell pe-4 text-end">
          <button type="button" className="department-edit-button btn btn-sm rounded-3" onClick={() => onEdit(department.id)} aria-label={`${t('Edit')} ${department.name}`}>
            {t('Edit')}
          </button>
        </td>
      </tr>
    );
  };

const DepartmentTable = ({ departments, loading, onEdit }) => {
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
              <th scope="col" className="pe-4 text-end">{t('EDIT')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? tableMessage(t('Loading departments...')) : visibleDepartments.length === 0 ? tableMessage(t('No departments found.')) : visibleDepartments.map((department, index) => (
              <DepartmentRow key={department.id || `${department.name}-${index}`} department={department} index={index} onEdit={onEdit} />
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
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [streams, setStreams] = useState(DEFAULT_STREAMS);
  const [colleges, setColleges] = useState(DEFAULT_COLLEGES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  
  // የፎርም ስቴቶች (Capacity ተወግዷል)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedStreamId, setSelectedStreamId] = useState('default-natural');
  const [collegeName, setCollegeName] = useState('');
  const [saving, setSaving] = useState(false);
  const [catalogModalType, setCatalogModalType] = useState('');
  const [catalogName, setCatalogName] = useState('');
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogModalError, setCatalogModalError] = useState('');
  
  // Validation state
  const [validationErrors, setValidationErrors] = useState({});

  const loadCatalogs = async () => {
    const [streamsResult, collegesResult] = await Promise.allSettled([
      api.get('api/admin/get_streams.php'),
      api.get('api/admin/get_colleges.php'),
    ]);
    const errors = [];
    const readCatalog = (result, key, label) => {
      if (result.status === 'rejected') {
        errors.push(`${label}: ${result.reason?.response?.data?.message || result.reason?.message || 'Unable to load options.'}`);
        return [];
      }
      const payload = result.value.data ?? result.value;
      if (payload?.success === false) {
        errors.push(`${label}: ${payload.message || 'Unable to load options.'}`);
        return [];
      }
      if (Array.isArray(payload?.[key])) return payload[key];
      return Array.isArray(payload) ? payload : [];
    };

    const loadedStreams = readCatalog(streamsResult, 'streams', 'Streams');
    const loadedColleges = readCatalog(collegesResult, 'colleges', 'Colleges');
    const mergedStreams = mergeStreams(loadedStreams);
    setStreams(mergedStreams);
    setColleges(mergeColleges(loadedColleges, mergedStreams));
    setSelectedStreamId(currentId => {
      if (mergedStreams.some(item => String(item.id) === String(currentId))) return String(currentId);
      const naturalStream = mergedStreams.find(item => normalizeStreamName(item.name) === 'natural science');
      return String(naturalStream?.id ?? mergedStreams[0]?.id ?? '');
    });
    setCatalogError(errors.join(' '));
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const resDepts = await api.get('api/common/departments_api.php');
      const normalizedDepartments = normalizeDepartmentsPayload(resDepts.data ?? resDepts);
      setDepartments(normalizedDepartments.map(department => ({
        ...department,
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
    loadCatalogs();
  }, []);

  const selectedStream = streams.find(item => String(item.id) === String(selectedStreamId));
  const streamColleges = [...new Map(
    colleges
      .filter(college => String(college.stream_id) === String(selectedStreamId))
      .map(college => [getCollegeKey(college.name), college])
  ).values()];

  const handleCatalogSelect = (event, type) => {
    if (event.target.value === '__add_new__') {
      if (type === 'college' && !Number.isInteger(Number(selectedStreamId))) {
        setCatalogError('A saved stream is required before adding a college.');
        return;
      }
      setCatalogName('');
      setCatalogModalError('');
      setCatalogModalType(type);
    } else if (type === 'stream') {
      setSelectedStreamId(event.target.value);
      setCollegeName('');
      setValidationErrors(current => ({ ...current, college: '' }));
    } else {
      setCollegeName(event.target.value);
      setValidationErrors(current => ({ ...current, college: '' }));
    }
  };

  const handleCatalogSubmit = async event => {
    event.preventDefault();
    const trimmedName = catalogName.trim();
    if (!trimmedName) {
      setCatalogModalError(`${catalogModalType === 'stream' ? 'Stream' : 'College'} name is required.`);
      return;
    }
    if (catalogModalType === 'college' && colleges.some(college => (
      String(college.stream_id) === String(selectedStreamId)
      && getCollegeKey(college.name) === getCollegeKey(trimmedName)
    ))) {
      setCatalogModalError('A college with this name already exists for the selected stream.');
      return;
    }

    setCatalogSaving(true);
    setCatalogModalError('');
    const endpoint = catalogModalType === 'stream'
      ? 'api/admin/add_stream.php'
      : 'api/admin/add_college.php';
    const payload = catalogModalType === 'stream'
      ? { name: trimmedName }
      : { name: trimmedName, stream_id: Number(selectedStreamId) };

    try {
      const response = await api.post(endpoint, payload);
      const result = response.data ?? response;
      if (!result.success) {
        throw new Error(result.message || `Unable to add ${catalogModalType}.`);
      }

      if (catalogModalType === 'stream') {
        const createdStream = result.stream;
        setStreams(current => [...current, createdStream]);
        setSelectedStreamId(String(createdStream.id));
        setCollegeName('');
      } else {
        const createdCollege = result.college;
        setColleges(current => mergeColleges([...current, createdCollege], streams));
        setCollegeName(getCollegeDisplayName(createdCollege.name));
      }
      setCatalogModalType('');
      setCatalogName('');
      setValidationErrors(current => ({ ...current, college: '' }));
    } catch (err) {
      setCatalogModalError(err.response?.data?.message || err.message || `Unable to add ${catalogModalType}.`);
    } finally {
      setCatalogSaving(false);
    }
  };

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
        stream: selectedStream?.name || '',
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
          <h3 className="fw-bold text-primary mb-1">{t('Manage DTU Departments')}</h3>
          <p className="text-muted mb-0">{t('Create academic units and assign leadership.')}</p>
        </div>

        <div className="d-flex gap-2 mt-3 mt-md-0 align-items-center">
          <button
            type="button"
            className="department-assign-head-button btn rounded-pill px-4 shadow-sm fw-bold"
            onClick={() => navigate('/admin/assign-head')}
          >
            {t('+ Assign Head')}
          </button>
          <span className="badge bg-light text-dark border px-3 py-2 rounded-pill">{departments.length} {t('Depts')}</span>
        </div>
      </div>

      {error && <div className="alert alert-danger rounded-3">{error}</div>}
      {catalogError && <div className="alert alert-danger rounded-3" role="alert">{catalogError}</div>}

      <div className="department-form-card card shadow-sm border-0 mb-5 rounded-4 overflow-hidden">
        <div className="card-header py-3 px-4">
          <h5 className="mb-0 fw-bold">{t('Add New Department')}</h5>
        </div>
        <div className="card-body p-4">
          <form onSubmit={handleSubmit} className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted">1. {t('STREAM')}</label>
              <select
                className="form-select"
                aria-label="Stream"
                value={selectedStreamId}
                onChange={event => handleCatalogSelect(event, 'stream')}
              >
                <option value="">-- {t('Select Stream')} --</option>
                {streams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                <option value="__add_new__">+ {t('Add New Stream')}</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted">2. {t('COLLEGE')}</label>
              <select
                className={`form-select ${validationErrors.college ? 'is-invalid' : ''}`}
                aria-label="College"
                value={collegeName}
                onChange={event => handleCatalogSelect(event, 'college')}
                required
              >
                <option value="">-- {t('Select College')} --</option>
                {streamColleges.map(college => <option key={college.id} value={college.name}>{college.name}</option>)}
                <option value="__add_new__" disabled={!Number.isInteger(Number(selectedStreamId))}>+ {t('Add New College')}</option>
              </select>
              {validationErrors.college && <div className="invalid-feedback d-block">{validationErrors.college}</div>}
            </div>
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

      <DepartmentTable departments={departments} loading={loading} onEdit={id => navigate(`/edit-department/${id}`)} />

      {catalogModalType && (
        <div className="department-catalog-modal-overlay" role="presentation">
          <div
            className="department-catalog-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-modal-title"
            aria-describedby={catalogModalError ? 'catalog-modal-error' : undefined}
          >
            <form onSubmit={handleCatalogSubmit}>
              <div className="department-catalog-modal-header">
                <h2 className="department-catalog-modal-title" id="catalog-modal-title">
                  Add New {catalogModalType === 'stream' ? 'Stream' : 'College'}
                </h2>
                <button
                  type="button"
                  className="department-catalog-modal-close"
                  aria-label="Close"
                  onClick={() => setCatalogModalType('')}
                  disabled={catalogSaving}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              <div className="department-catalog-modal-body">
                <label htmlFor="catalog-name" className="department-catalog-modal-label">
                  {catalogModalType === 'stream' ? 'Stream Name' : 'College Name'}
                </label>
                <input
                  id="catalog-name"
                  className="department-catalog-modal-input"
                  value={catalogName}
                  onChange={event => setCatalogName(event.target.value)}
                  autoFocus
                  maxLength={150}
                  required
                />
                {catalogModalError && (
                  <div className="department-catalog-modal-error" id="catalog-modal-error" role="alert">
                    {catalogModalError}
                  </div>
                )}
              </div>
              <div className="department-catalog-modal-actions">
                <button
                  type="button"
                  className="department-catalog-modal-cancel"
                  onClick={() => setCatalogModalType('')}
                  disabled={catalogSaving}
                >
                  Cancel
                </button>
                <button type="submit" className="department-catalog-modal-submit" disabled={catalogSaving}>
                  {catalogSaving ? 'Saving...' : 'Add'}
                </button>
              </div>
            </form>
          </div>
          <button
            type="button"
            className="department-catalog-modal-backdrop-dismiss"
            aria-label="Close add dialog"
            onClick={() => setCatalogModalType('')}
            disabled={catalogSaving}
          />
        </div>
      )}
    </div>
  );
};

export default ManageDepartments;