import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api.js';
import './EditUser.css';

const EditUser = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const selectedUser = location.state?.user;
  const returnTo = location.state?.returnTo === '/admin-dashboard'
    ? location.state.returnTo
    : '/admin-dashboard';
  const returnTab = location.state?.returnTab || 'manage';
  const [loading, setLoading] = useState(!selectedUser);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [user, setUser] = useState(selectedUser || null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('student');
  const [phoneNumber, setPhoneNumber] = useState('');

  const apiPath = 'api/admin/users_api.php';

  const populateForm = useCallback((userData) => {
    const fullName = String(userData?.full_name || userData?.name || '').trim();
    const nameParts = fullName ? fullName.split(/\s+/) : [];
    setUser(userData);
    setFirstName(userData?.first_name || nameParts[0] || '');
    setLastName(userData?.last_name || nameParts.slice(1).join(' ') || '');
    setUsername(userData?.username || '');
    setEmail(userData?.email || '');
    setRole(userData?.role || 'student');
    setPhoneNumber(userData?.phone_number || '');
  }, []);

  useEffect(() => {
    if (!id) {
      navigate(returnTo, { replace: true, state: { activeTab: returnTab } });
      return;
    }

    if (selectedUser && String(selectedUser.id) === String(id)) {
      populateForm(selectedUser);
      setLoading(false);
      return;
    }

    const fetchUser = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await api.get(apiPath);
        const payload = Array.isArray(response.data) ? response.data : (response.data.users ?? []);
        const user = payload.find(u => String(u.id) === String(id));
        if (!user) {
          setError('User not found.');
        } else {
          populateForm(user);
        }
      } catch (err) {
        console.error('Failed to fetch user:', err);
        setError('Unable to load user data.');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [id, navigate, populateForm, returnTab, returnTo, selectedUser]);

  const validate = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required.');
      return false;
    }
    if (!username.trim()) {
      setError('Username is required.');
      return false;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return false;
    }
    if (!role) {
      setError('Role is required.');
      return false;
    }
    if (phoneNumber && !/^(09|\+251)\d{8,9}$/.test(phoneNumber)) {
      setError('Please enter a valid Ethiopian phone number (09XXXXXXXX or +251XXXXXXXXX).');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setSaving(true);
    try {
      const response = await api.put(`${apiPath}?id=${encodeURIComponent(id)}`, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: username.trim(),
        email: email.trim(),
        role: role.trim(),
        phone_number: phoneNumber.trim(),
        id_number: user?.id_number || '',
      });

      if (response.data?.success) {
        navigate(returnTo, {
          replace: true,
          state: {
            activeTab: returnTab,
            updatedUserId: id,
          },
        });
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

  if (loading) return <div className="text-center mt-5" role="status">Loading user...</div>;

  return (
    <div className="edit-user-page container">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="m-0">Edit User</h3>
        <div>
          <button
            type="button"
            className="btn btn-outline-secondary me-2"
            onClick={() => navigate(returnTo, { state: { activeTab: returnTab } })}
          >
            Back
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2" role="alert">
          {error}
        </div>
      )}

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-md-3">
                <label className="form-label" htmlFor="edit-first-name">First Name</label>
                <input
                  id="edit-first-name"
                  type="text"
                  className="form-control"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={saving}
                  required
                />
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="edit-last-name">Last Name</label>
                <input
                  id="edit-last-name"
                  type="text"
                  className="form-control"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
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
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                  required
                />
              </div>

              <div className="col-md-3">
                <label className="form-label" htmlFor="edit-phone">Phone Number</label>
                <input
                  id="edit-phone"
                  type="tel"
                  className="form-control"
                  placeholder="09XXXXXXXX"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={saving}
                />
                <div className="form-text">09... or +251...</div>
              </div>

              <div className="col-md-3">
                <label className="form-label" htmlFor="edit-role">Role</label>
                <select
                  id="edit-role"
                  className="form-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={saving}
                  required
                >
                  <option value="student">Student</option>
                  <option value="Head">Head</option>
                  <option value="admin">Admin</option>
                  <option value="registrar">Registrar</option>
                </select>
              </div>

              <div className="col-md-3 d-flex align-items-end">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditUser;
