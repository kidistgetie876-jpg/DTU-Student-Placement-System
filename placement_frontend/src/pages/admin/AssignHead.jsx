import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';

const AssignHead = () => {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [heads, setHeads] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedHeadId, setSelectedHeadId] = useState('');
  const [headSearchInput, setHeadSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const resDepts = await api.get('api/common/departments_api.php');
        const departmentList = resDepts.data.departments || resDepts.data || [];
        setDepartments(departmentList);

        const resUsers = await api.get('api/admin/users_api.php');
        const userList = resUsers.data.users || resUsers.data || [];

        const validHeads = userList.filter((user) => {
          const role = String(user.role || '').toLowerCase();
          return role === 'head' || role === 'coordinator';
        });

        setHeads(validHeads);
      } catch (err) {
        setError('Failed to load data.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const filteredHeads = heads.filter((head) => {
    const term = headSearchInput.trim().toLowerCase();
    if (!term) return true;
    return [
      head.first_name,
      head.last_name,
      head.full_name,
      head.username,
      head.email,
      head.id,
    ]
      .filter((value) => value !== null && value !== undefined)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  useEffect(() => {
    const department = departments.find((item) => String(item.id) === String(selectedDeptId));
    const departmentHeadId = department?.head_id ?? department?.headId ?? department?.head ?? '';
    if (!departmentHeadId) {
      setSelectedHeadId('');
      return;
    }

    const matchingDepartmentHead = heads.find((head) =>
      String(head.id) === String(departmentHeadId) &&
      (!headSearchInput.trim() || [
        head.first_name,
        head.last_name,
        head.full_name,
        head.username,
        head.email,
        head.id,
      ]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(headSearchInput.trim().toLowerCase())))
    );
    setSelectedHeadId(matchingDepartmentHead ? String(departmentHeadId) : '');
  }, [selectedDeptId, departments, heads, headSearchInput]);

  const getAssignedDepartment = (headId) => departments.find((department) => {
    const assignedHeadId = department.head_id ?? department.headId ?? department.head;
    return assignedHeadId !== null &&
      assignedHeadId !== undefined &&
      assignedHeadId !== '' &&
      String(assignedHeadId) === String(headId) &&
      String(department.id) !== String(selectedDeptId);
  });

  const handleAssign = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedDeptId || !selectedHeadId) {
      setError('Please select both a department and a head.');
      return;
    }

    setSaving(true);
    try {
      const response = await api.put('api/common/departments_api.php', {
        id: Number(selectedDeptId),
        head_id: Number(selectedHeadId)
      });

      if (response.data?.success === true) {
        navigate('/admin-dashboard', { state: { activeTab: 'departments' } });
      } else {
        setError(response.data?.message || 'Failed to assign department head.');
      }
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Connection error.';
      setError(message.includes('already') || message.includes('assigned') || message.includes('Conflict')
        ? 'This head is already assigned to another department.'
        : message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center mt-5">Loading...</div>;

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="card shadow-lg border-0 rounded-4">
            <div className="card-header bg-primary text-white p-4 rounded-top-4 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
              <div>
                <h4 className="mb-0 fw-bold">Assign Department Head</h4>
                <p className="small mb-0 opacity-75">Select a department and assign its official coordinator.</p>
              </div>
              <div role="search" style={{ maxWidth: 320, width: '100%' }}>
                <label className="visually-hidden" htmlFor="head-search">Search available heads</label>
                <input
                  id="head-search"
                  type="search"
                  className="form-control form-control-sm"
                  placeholder="Search heads..."
                  value={headSearchInput}
                  onChange={(event) => setHeadSearchInput(event.target.value)}
                />
              </div>
            </div>
            <div className="card-body p-5">
              {error && <div className="alert alert-danger">{error}</div>}
              
              <form onSubmit={handleAssign}>
                <div className="row g-4">
                  <div className="col-md-6">
                    <label className="form-label fw-bold">Select Department</label>
                    <select 
                      className="form-select py-2" 
                      value={selectedDeptId} 
                      onChange={(e) => setSelectedDeptId(e.target.value)} 
                      required
                    >
                      <option value="">-- Choose Department --</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-bold">Select Head / Coordinator</label>
                    <select className="form-select py-2" value={selectedHeadId} onChange={(e) => setSelectedHeadId(e.target.value)} required>
                      <option value="">-- Choose Coordinator --</option>
                      {filteredHeads.map((head) => {
                        const assignedDepartment = getAssignedDepartment(head.id);
                        const displayName = [head.first_name, head.last_name].filter(Boolean).join(' ') ||
                          head.full_name || head.username || head.email || `User ${head.id}`;
                        return (
                          <option key={head.id} value={head.id} disabled={Boolean(assignedDepartment)}>
                            {displayName}
                            {head.username && head.first_name && ` (${head.username})`}
                            {assignedDepartment ? ` — assigned to ${assignedDepartment.name}` : ''}
                          </option>
                        );
                      })}
                    </select>
                    {headSearchInput.trim() && filteredHeads.length === 0 && (
                      <div className="form-text">No heads match your search.</div>
                    )}
                  </div>
                  <div className="col-12 mt-4 d-flex gap-2">
                    <button type="submit" className="btn btn-primary px-5 py-2 fw-bold rounded-pill" disabled={saving}>
                      {saving ? 'Saving...' : 'Confirm Assignment'}
                    </button>
                    <button type="button" className="btn btn-light px-4 py-2 rounded-pill" onClick={() => navigate('/admin-dashboard', { state: { activeTab: 'departments' } })}>Cancel</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignHead;