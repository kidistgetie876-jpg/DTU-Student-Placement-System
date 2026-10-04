import React, { useEffect, useState } from 'react';
import api from '../../services/api.js';
import './ManageUsers.css';

const normalizeRole = (role = '') => String(role || '').trim().toLowerCase();

const getRoleKey = (role = '') => {
  const value = normalizeRole(role);

  if (['head', 'department_head', 'department head', 'head of department', 'hod'].includes(value)) return 'head';
  if (value === 'registrar') return 'registrar';
  if (value === 'admin') return 'admin';
  return 'student';
};

const getRoleLabel = (role = '') => {
  switch (getRoleKey(role)) {
    case 'head':
      return 'head';
    case 'registrar':
      return 'registrar';
    case 'admin':
      return 'admin';
    default:
      return 'student';
  }
};

const getRoleIdFromUser = (user = {}) => {
  return typeof user?.id_number === 'string' ? user.id_number.trim() : '';
};

const getRoleIdConfig = (role = '') => {
  switch (getRoleKey(role)) {
    case 'head':
      return { prefix: 'DTU-HOD-', initialSequence: 0, digits: 3 };
    case 'registrar':
      return { prefix: 'DTU-REG-', initialSequence: 0, digits: 3 };
    case 'admin':
      return { prefix: 'DTU-ADM-', initialSequence: 0, digits: 3 };
    default:
      return { prefix: 'DTU16R', initialSequence: 1000, digits: 4 };
  }
};

const getRoleIdLabel = (role = '') => {
  switch (getRoleKey(role)) {
    case 'head':
      return 'Head of Dept ID (Staff Format)';
    case 'registrar':
      return 'Registrar ID (Staff Format)';
    case 'admin':
      return 'Admin ID (Staff Format)';
    default:
      return 'Student ID (DTU Format)';
  }
};

const getNextRoleId = (usersList = [], role = 'student') => {
  const { prefix, initialSequence, digits } = getRoleIdConfig(role);
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`, 'i');
  const highestSequence = usersList.reduce((maxSequence, user) => {
    if (getRoleKey(user?.role) !== getRoleKey(role)) return maxSequence;

    const roleId = getRoleIdFromUser(user);
    const match = pattern.exec(roleId);

    if (!match) return maxSequence;

    return Math.max(maxSequence, Number(match[1]) || maxSequence);
  }, initialSequence);

  return `${prefix}${String(highestSequence + 1).padStart(digits, '0')}`;
};

const getDisplayUserId = (id, role = '', roleId = '') => {
  const savedRoleId = String(roleId || '').trim();
  if (savedRoleId) return savedRoleId;

  const numericId = Number(id ?? 0) || 0;

  switch (getRoleKey(role)) {
    case 'head':
      return `DTU-HOD-${String(numericId).padStart(3, '0')}`;
    case 'registrar':
      return `DTU-REG-${String(numericId).padStart(3, '0')}`;
    case 'admin':
      return `DTU-ADM-${String(numericId).padStart(3, '0')}`;
    default: {
      return `DTU16R${String(1000 + numericId).padStart(4, '0')}`;
    }
  }
};

const getRoleBadgeClass = (role = '') => {
  switch (getRoleKey(role)) {
    case 'head':
      return 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
    case 'registrar':
      return 'bg-info-subtle text-info-emphasis border border-info-subtle';
    case 'admin':
      return 'bg-dark text-white border border-dark';
    default:
      return 'bg-primary-subtle text-primary-emphasis border border-primary-subtle';
  }
};

const ManageUsers = () => {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('student');
  const [newRoleId, setNewRoleId] = useState('DTU16R1001');
  const [editingUser, setEditingUser] = useState(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('student');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const pageSize = 5;
  const apiPath = 'api/admin/users_api.php';

  const resetNewUserForm = () => {
    setNewFirstName('');
    setNewLastName('');
    setNewUsername('');
    setNewPassword('');
    setNewEmail('');
    setNewRole('student');
    setNewRoleId(getNextRoleId(users, 'student'));
    setNewPhoneNumber('');
  };

  useEffect(() => {
    setNewRoleId(getNextRoleId(users, newRole));
  }, [newRole, users]);

  const cancelEdit = () => {
    setEditingUser(null);
    setEditFirstName('');
    setEditLastName('');
    setEditUsername('');
    setEditEmail('');
    setEditRole('student');
    setEditPhoneNumber('');
  };

  const startEdit = (user) => {
    const fullName = String(user?.full_name || user?.name || '').trim();
    const splitName = fullName ? fullName.split(/\s+/) : [];
    const firstNameFromName = splitName[0] || user?.first_name || 'User';
    const lastNameFromName = splitName.slice(1).join(' ') || user?.last_name || 'User';

    setEditingUser(user);
    setEditFirstName(firstNameFromName);
    setEditLastName(lastNameFromName);
    setEditUsername(user?.username || '');
    setEditEmail(user?.email || '');
    setEditRole(user?.role || 'student');
    setEditPhoneNumber(user?.phone_number || '');
    setError('');
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get(apiPath);
      const payload = response.data?.users ?? response.data ?? [];
      const nextUsers = Array.isArray(payload) ? payload : (payload.users ?? []);
      setUsers(nextUsers);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setError('Unable to load users from the backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filtered = users.filter((u) => {
    const roleKey = getRoleKey(u.role);
    if (roleFilter !== 'all' && roleKey !== roleFilter) return false;

    const q = query.trim().toLowerCase();
    if (!q) return true;

    const firstName = (u.first_name || '').toLowerCase();
    const lastName = (u.last_name || '').toLowerCase();
    const username = (u.username || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const role = (u.role || '').toLowerCase();
    const phone = (u.phone_number || '').toLowerCase();
    const displayId = getDisplayUserId(u.id, u.role, getRoleIdFromUser(u)).toLowerCase();

    return (
      firstName.includes(q) ||
      lastName.includes(q) ||
      username.includes(q) ||
      email.includes(q) ||
      role.includes(q) ||
      phone.includes(q) ||
      displayId.includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user?')) return;

    try {
      await api.delete(`${apiPath}?id=${encodeURIComponent(id)}`);
      const next = users.filter(u => u.id !== id);
      setUsers(next);
    } catch (err) {
      console.error('Failed to delete user:', err);
      setError('Unable to delete the user. Please try again.');
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    const firstName = editFirstName.trim();
    const lastName = editLastName.trim();
    const username = editUsername.trim();
    const email = editEmail.trim();
    const role = editRole.trim();
    const phoneNumber = editPhoneNumber.trim();

    if (!firstName || !lastName || !username || !email || !role) {
      setError('First name, last name, username, email, and role are required.');
      return;
    }

    if (!/[A-Za-z]/.test(username)) {
      setError('Username must contain at least one letter; numbers only are not allowed.');
      return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (phoneNumber && !/^(09|\+251)\d{8,9}$/.test(phoneNumber)) {
      setError('Please enter a valid Ethiopian phone number (09XXXXXXXX or +251XXXXXXXXX).');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        role,
        phone_number: phoneNumber,
        id_number: editingUser.id_number || '',
      };

      const response = await api.put(`${apiPath}?id=${encodeURIComponent(editingUser.id)}`, payload);

      if (response.data?.success) {
        const updatedUser = {
          ...editingUser,
          ...payload,
          ...(response.data?.user || {}),
        };

        setUsers((currentUsers) => currentUsers.map((user) => (user.id === editingUser.id ? updatedUser : user)));
        cancelEdit();
        setPage(1);
      } else {
        setError(response.data?.message || 'Unable to update user.');
      }
    } catch (err) {
      console.error('Failed to update user:', err);
      const backendMessage = err.response?.data?.message;
      setError(backendMessage || 'Unable to update user. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    const firstName = newFirstName.trim();
    const lastName = newLastName.trim();
    const username = newUsername.trim();
    const password = newPassword;
    const email = newEmail.trim();
    const role = newRole.trim();
    const phoneNumber = newPhoneNumber.trim();
    const roleId = newRoleId.trim();

    if (!firstName || !lastName || !username || !password || !role) {
      setError('First name, last name, username, password, and role are all required.');
      return;
    }

    if (!/[A-Za-z]/.test(username)) {
      setError('Username must contain at least one letter; numbers only are not allowed.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (phoneNumber && !/^(09|\+251)\d{8,9}$/.test(phoneNumber)) {
      setError('Please enter a valid Ethiopian phone number (09XXXXXXXX or +251XXXXXXXXX).');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await api.post(apiPath, {
        first_name: firstName,
        last_name: lastName,
        username,
        password,
        email,
        role,
        phone_number: phoneNumber,
        id_number: roleId,
      });

      if (response.data?.success) {
        await fetchUsers();
        resetNewUserForm();
        setPage(1);
      } else {
        setError(response.data?.message || 'Unable to add new user.');
      }
    } catch (err) {
      console.error('Failed to add user:', err);
      const backendMessage = err.response?.data?.message;
      setError(backendMessage || 'Unable to add new user. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const goToPage = (n) => setPage(Math.max(1, Math.min(totalPages, n)));

  return (
    <div className="container">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="m-0">Manage Users</h3>
        <div className="w-50">
          <input
            className="form-control"
            placeholder="Search by name, username, email, phone or role"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2" role="alert">
          {error}
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 mb-3">
        {[
          { key: 'all', label: 'All Users' },
          { key: 'student', label: 'Students' },
          { key: 'head', label: 'Department Heads' },
          { key: 'registrar', label: 'Registrars' },
          { key: 'admin', label: 'Admins' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`btn btn-sm ${roleFilter === tab.key ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => {
              setRoleFilter(tab.key);
              setPage(1);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!editingUser && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h5 className="mb-1">Add New User</h5>
                <p className="small text-muted mb-0">Create a user with username, password, optional email, and role.</p>
              </div>
              <span className="badge bg-secondary text-uppercase small py-2 px-3">
                {saving ? 'Saving...' : 'New user'}
              </span>
            </div>

            <form onSubmit={handleAddUser}>
              <div className="row g-3">
                <div className="col-md-2">
                  <label className="form-label" htmlFor="new-first-name">First Name</label>
                  <input
                    id="new-first-name"
                    type="text"
                    className="form-control"
                    placeholder="First name"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    disabled={saving}
                    required
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="new-last-name">Last Name</label>
                  <input
                    id="new-last-name"
                    type="text"
                    className="form-control"
                    placeholder="Last name"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    disabled={saving}
                    required
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="new-username">Username</label>
                  <input
                    id="new-username"
                    type="text"
                    className="form-control"
                    placeholder="Username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    pattern=".*[A-Za-z].*"
                    title="Username must contain at least one letter."
                    disabled={saving}
                    required
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="new-password">Password</label>
                  <input
                    id="new-password"
                    type="password"
                    className="form-control"
                    placeholder="Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={saving}
                    required
                  />
                  <div className="form-text">At least 6 characters.</div>
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="new-email">Email (Optional)</label>
                  <input
                    id="new-email"
                    type="email"
                    className="form-control"
                    placeholder="user@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="new-phone-number">Phone Number</label>
                  <input
                    id="new-phone-number"
                    type="tel"
                    className="form-control"
                    placeholder="09XXXXXXXX"
                    value={newPhoneNumber}
                    onChange={(e) => setNewPhoneNumber(e.target.value)}
                    disabled={saving}
                  />
                  <div className="form-text">09... or +251...</div>
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="new-role">Role</label>
                  <select
                    id="new-role"
                    className="form-select"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    disabled={saving}
                    required
                  >
                    <option value="student">Student</option>
                    <option value="head">Head</option>
                    <option value="admin">Admin</option>
                    <option value="registrar">Registrar</option>
                  </select>
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="new-role-id">{getRoleIdLabel(newRole)}</label>
                  <input
                    id="new-role-id"
                    type="text"
                    className="form-control"
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value)}
                    disabled={saving}
                    required
                  />
                </div>
                <div className="col-md-1 d-grid">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-hover">
          <thead className="table-light">
            <tr>
              <th style={{ width: 160 }}>User ID</th>
              <th>Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Phone Number</th>
              <th>Role</th>
              <th style={{ width: 160 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-4 text-muted">Loading users...</td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-4 text-muted">No users found.</td>
              </tr>
            ) : (
              paged.map((u, idx) => (
                <tr key={u.id}>
                  <td>
                    <span className="badge px-3 py-2 fw-bold" style={{ backgroundColor: '#e2edff', color: '#0d6efd', borderRadius: '8px' }}>
                      {u.id_number || u.id}
                    </span>
                  </td>
                  <td>{u.full_name || u.name || [u.first_name, u.last_name].filter(Boolean).join(' ') || '-'}</td>
                  <td>{u.username || u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.phone_number || '-'}</td>
                  <td>
                    <span className={`badge rounded-pill ${getRoleBadgeClass(u.role)} fw-semibold`}>
                      {getRoleLabel(u.role)}
                    </span>
                  </td>
                  <td>
                    <button className="manage-users-edit-button btn btn-sm me-2" onClick={() => startEdit(u)}>
                      Edit
                    </button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(u.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div className="card shadow-sm mb-4 border-primary">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h5 className="mb-1">Edit User</h5>
                <p className="small text-muted mb-0">Update the selected user details below.</p>
              </div>
              <button className="btn btn-outline-secondary btn-sm" onClick={cancelEdit}>
                Cancel
              </button>
            </div>

            <form onSubmit={handleEditUser}>
              <div className="row g-3">
                <div className="col-md-2">
                  <label className="form-label" htmlFor="edit-first-name">First Name</label>
                  <input
                    id="edit-first-name"
                    type="text"
                    className="form-control"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    disabled={saving}
                    required
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="edit-last-name">Last Name</label>
                  <input
                    id="edit-last-name"
                    type="text"
                    className="form-control"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    disabled={saving}
                    required
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="edit-username">Username</label>
                  <input
                    id="edit-username"
                    type="text"
                    className="form-control"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    disabled={saving}
                    required
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="edit-email">Email</label>
                  <input
                    id="edit-email"
                    type="email"
                    className="form-control"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    disabled={saving}
                    required
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="edit-phone">Phone Number</label>
                  <input
                    id="edit-phone"
                    type="tel"
                    className="form-control"
                    placeholder="09XXXXXXXX"
                    value={editPhoneNumber}
                    onChange={(e) => setEditPhoneNumber(e.target.value)}
                    disabled={saving}
                  />
                  <div className="form-text">09... or +251...</div>
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="edit-role">Role</label>
                  <select
                    id="edit-role"
                    className="form-select"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    disabled={saving}
                    required
                  >
                    <option value="student">Student</option>
                    <option value="Head">Head</option>
                    <option value="admin">Admin</option>
                    <option value="registrar">Registrar</option>
                  </select>
                </div>
                <div className="col-md-1 d-grid">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mt-3">
        <div className="text-muted">Showing {filtered.length} user{filtered.length !== 1 ? 's' : ''}</div>
        <nav aria-label="User pagination">
          <ul className="pagination mb-0 align-items-center">
            <li className={`page-item ${page === 1 ? 'disabled' : ''}`}>
              <button type="button" className="page-link" onClick={() => goToPage(page - 1)} disabled={page === 1}>Previous</button>
            </li>
            <li className="page-item" aria-current="page">
              <span className="page-link text-dark bg-white">Page {page} of {totalPages}</span>
            </li>
            <li className={`page-item ${page === totalPages ? 'disabled' : ''}`}>
              <button type="button" className="page-link" onClick={() => goToPage(page + 1)} disabled={page === totalPages}>Next</button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
};

export default ManageUsers;
