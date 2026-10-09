import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../services/api.js';
import ManageUsers from './ManageUsers';
import ManageDepartments from './ManageDepartments';
import AssignHead from './AssignHead.jsx';
import SystemConfig from './SystemConfig.jsx';
import AuditLogs from './AuditLogs';
import AdminAccount from './AdminAccount';
import AdminReports from './AdminReports';
import './AdminDashboard.css';
import OfficialPrintLetterhead from '../../components/common/OfficialPrintLetterhead.jsx';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [admin, setAdmin] = useState(null);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalDepartments: 0,
    activeAdmins: 0,
    totalHeads: 0,
    totalRegistrars: 0,
  });
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    const data = localStorage.getItem('user');
    if (!data) {
      navigate('/login');
      return;
    }
    try {
      const parsedUser = JSON.parse(data);
      if (parsedUser.role === 'admin') {
        setAdmin(parsedUser);
      } else {
        navigate('/login');
      }
    } catch (e) {
      localStorage.clear();
      navigate('/login');
    }
  }, [navigate]);

  const [tab, setTab] = useState('dashboard');
  const [cardDetailModal, setCardDetailModal] = useState(null);
  const [cardDetailData, setCardDetailData] = useState([]);
  const [cardDetailLoading, setCardDetailLoading] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [allDepartments, setAllDepartments] = useState([]);

  useEffect(() => {
    const incomingTab = location.state?.activeTab;
    if (incomingTab) {
      setTab(incomingTab);
    }
  }, [location.state]);

  // Fetch statistics from backend
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const [overviewResult, usersResult, departmentsResult] = await Promise.allSettled([
        api.get('api/common/dashboard_overview_api.php'),
        api.get('api/admin/users_api.php'),
        api.get('api/common/departments_api.php')
      ]);

      const overviewResponse = overviewResult.status === 'fulfilled' ? overviewResult.value.data : null;
      const overview = overviewResponse?.success ? overviewResponse.data : null;
      const usersResponse = usersResult.status === 'fulfilled' ? usersResult.value.data : [];
      const usersData = usersResponse?.users || usersResponse;
      const users = Array.isArray(usersData) ? usersData : [];
      const totalStudents = Number(overview?.activeStudents ?? users.filter((user) => user && user.role?.toLowerCase() === 'student').length);
      const activeAdmins = users.filter((user) => {
        if (user?.role?.toLowerCase() !== 'admin') return false;
        const status = String(user.status || '').trim().toLowerCase();
        return !status || ['active', 'approved', 'verified'].includes(status);
      }).length;
      const totalHeads = users.filter(u => {
        const role = u?.role?.toLowerCase();
        return role === 'head' || role === 'coordinator';
      }).length;
      const totalRegistrars = users.filter((user) => user?.role?.toLowerCase() === 'registrar').length;

      const departmentsResponse = departmentsResult.status === 'fulfilled' ? departmentsResult.value.data : [];
      const depts = Array.isArray(departmentsResponse) ? departmentsResponse : departmentsResponse?.departments || [];
      const totalDepartments = Number(overview?.departments ?? depts.filter(Boolean).length);

      setAllUsers(users); // Store all users for modal
      setAllDepartments(depts); // Store all departments for modal

      setStats({
        totalStudents,
        totalDepartments,
        activeAdmins,
        totalHeads,
        totalRegistrars
      });
    } catch (err) {
      console.error('Failed to fetch statistics:', err);
      // Keep default values on error
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (admin && tab === 'dashboard') {
      fetchStats();
    }
  }, [admin, tab]);

  // Handle card clicks to show details
  const handleCardClick = (cardType) => {
    setCardDetailModal(cardType);
    setCardDetailLoading(true);
    setCardDetailData([]);

    try {
      let data = [];

      if (cardType === 'totalStudents') {
        // Filter and format student data
        data = allUsers
          .filter(u => u && u.role?.toLowerCase() === 'student')
          .map((student, idx) => ({
            id: idx + 1,
            username: student.username || 'N/A',
            email: student.email || 'N/A',
            status: student.status || 'Active',
            registeredAt: student.created_at || student.registration_date || 'N/A'
          }));
      } else if (cardType === 'totalDepartments') {
        // Filter and format department data
        data = allDepartments
          .filter(Boolean)
          .map((dept, idx) => ({
            id: idx + 1,
            name: dept.name || dept.department || 'N/A',
            college: dept.college || dept.college_name || 'N/A',
            capacity: dept.capacity || dept.seats || 0,
            stream: dept.stream || dept.academic_stream || 'N/A'
          }));
      } else if (cardType === 'activeAdmins') {
        // Filter and format admin data
        data = allUsers
          .filter(u => u && u.role?.toLowerCase() === 'admin')
          .map((admin, idx) => ({
            id: idx + 1,
            username: admin.username || 'N/A',
            email: admin.email || 'N/A',
            status: admin.status || 'Active',
            registeredAt: admin.created_at || admin.registration_date || 'N/A'
          }));
      } else if (cardType === 'totalHeads') {
        data = allUsers
          .filter(u => {
            const role = u?.role?.toLowerCase();
            return role === 'head' || role === 'coordinator';
          })
          .map((head, idx) => ({
            id: idx + 1,
            username: head.username || 'N/A',
            email: head.email || 'N/A',
            role: head.role || 'N/A',
            registeredAt: head.created_at || head.registration_date || 'N/A'
          }));
      } else if (cardType === 'totalRegistrars') {
        data = allUsers
          .filter((user) => user?.role?.toLowerCase() === 'registrar')
          .map((registrar, idx) => ({
            id: idx + 1,
            username: registrar.username || 'N/A',
            email: registrar.email || 'N/A',
            registeredAt: registrar.created_at || registrar.registration_date || 'N/A'
          }));
      }

      setCardDetailData(data);
    } catch (error) {
      console.error('Error processing card details:', error);
      setCardDetailData([]);
    } finally {
      setCardDetailLoading(false);
    }
  };

  if (!admin) return <div className="text-center mt-5">Loading...</div>;

  return (
    <div className="admin-dashboard container-fluid px-0">
      <OfficialPrintLetterhead
        office="OFFICE OF UNIVERSITY ADMINISTRATION"
        title="OFFICIAL ADMINISTRATIVE RECORD"
        metadata={`Generated on: ${new Date().toLocaleDateString()}`}
      />
      <div className="row g-0">
        <aside className="col-md-2 sidebar bg-dark text-white d-flex flex-column p-4">
          <div className="sidebar-brand mb-5">
            <h4 className="fw-bold text-white mb-1">Placement Admin</h4>
            <p className="text-white-50 small mb-0">Manage users, departments, and reports</p>
          </div>

          <nav className="nav flex-column gap-2 mb-4">
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setTab('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'manage' ? 'active' : ''}`}
              onClick={() => setTab('manage')}
            >
              Manage Users
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'departments' ? 'active' : ''}`}
              onClick={() => setTab('departments')}
            >
              Manage Departments
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'reports' ? 'active' : ''}`}
              onClick={() => setTab('reports')}
            >
              Reports
            </button>
          
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'audit-logs' ? 'active' : ''}`}
              onClick={() => setTab('audit-logs')}
            >
              Audit Logs
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'system-config' ? 'active' : ''}`}
              onClick={() => setTab('system-config')}
            >
              System Settings
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'account-settings' ? 'active' : ''}`}
              onClick={() => setTab('account-settings')}
            >
              Account Settings
            </button>
          </nav>

        </aside>

        <main className="col-md-10 p-5 main-content">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start gap-3 mb-4">
            <div>
              <h2 className="fw-bold mb-1">Welcome back, {admin.username}</h2>
              <p className="text-muted mb-0">Use the navigation panel to review users, departments, and dashboard insights.</p>
            </div>
            <span className="badge bg-primary text-white py-2 px-3">Admin</span>
          </div>

          {tab === 'dashboard' ? (
            <>
              <div className="row g-4">
                <div className="col-lg-4">
                  <div 
                    className="card summary-card shadow-sm" 
                    style={{ cursor: 'pointer', transition: 'all 0.3s ease', border: '2px solid transparent' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = '#0d6efd';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                    onClick={() => handleCardClick('totalStudents')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Total Students</span>
                      <h3 className="summary-value">{statsLoading ? '...' : stats.totalStudents}</h3>
                      <div className="mt-2"><small className="text-primary fw-bold">Click to view details →</small></div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-4">
                  <div 
                    className="card summary-card shadow-sm" 
                    style={{ cursor: 'pointer', transition: 'all 0.3s ease', border: '2px solid transparent' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = '#198754';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                    onClick={() => handleCardClick('totalDepartments')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Total Departments</span>
                      <h3 className="summary-value">{statsLoading ? '...' : stats.totalDepartments}</h3>
                      <div className="mt-2"><small className="text-success fw-bold">Click to view details →</small></div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-4">
                  <div 
                    className="card summary-card shadow-sm" 
                    style={{ cursor: 'pointer', transition: 'all 0.3s ease', border: '2px solid transparent' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = '#ffc107';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                    onClick={() => handleCardClick('activeAdmins')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Active Admins</span>
                      <h3 className="summary-value">{statsLoading ? '...' : stats.activeAdmins}</h3>
                      <div className="mt-2"><small className="text-warning fw-bold">Click to view details →</small></div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-4">
                  <div
                    className="card summary-card shadow-sm"
                    style={{ cursor: 'pointer', transition: 'all 0.3s ease', border: '2px solid transparent' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = '#0dcaf0';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                    onClick={() => handleCardClick('totalHeads')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Total Heads</span>
                      <h3 className="summary-value">{statsLoading ? '...' : stats.totalHeads}</h3>
                      <div className="mt-2"><small className="text-info fw-bold">Click to view details →</small></div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-4">
                  <div
                    className="card summary-card shadow-sm"
                    style={{ cursor: 'pointer', transition: 'all 0.3s ease', border: '2px solid transparent' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = '#6f42c1';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                    onClick={() => handleCardClick('totalRegistrars')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Total Registrars</span>
                      <h3 className="summary-value">{statsLoading ? '...' : stats.totalRegistrars}</h3>
                      <div className="mt-2"><small className="fw-bold" style={{ color: '#6f42c1' }}>Click to view details →</small></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Detail Modal */}
              {cardDetailModal && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999
                }}>
                  <div style={{
                    background: 'white',
                    borderRadius: '12px',
                    width: '90%',
                    maxWidth: '800px',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                    padding: '30px'
                  }}>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h4 className="fw-bold mb-0">
                        {cardDetailModal === 'totalStudents' && 'All Students'}
                        {cardDetailModal === 'totalDepartments' && 'All Departments'}
                        {cardDetailModal === 'activeAdmins' && 'Admin Accounts'}
                        {cardDetailModal === 'totalHeads' && 'Department Heads and Coordinators'}
                        {cardDetailModal === 'totalRegistrars' && 'Registrar Accounts'}
                      </h4>
                      <button 
                        className="btn btn-close" 
                        onClick={() => setCardDetailModal(null)}
                      />
                    </div>

                    {cardDetailLoading ? (
                      <div className="text-center py-5">
                        <div className="spinner-border text-primary" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      </div>
                    ) : cardDetailData.length === 0 ? (
                      <div className="alert alert-info">No data available</div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-hover">
                          <thead className="table-light">
                            <tr>
                              {cardDetailModal === 'totalStudents' && (
                                <>
                                  <th>#</th>
                                  <th>Username</th>
                                  <th>Email</th>
                                  <th>Status</th>
                                  <th>Registered</th>
                                </>
                              )}
                              {cardDetailModal === 'totalDepartments' && (
                                <>
                                  <th>#</th>
                                  <th>Department</th>
                                  <th>College</th>
                                  <th>Capacity</th>
                                  <th>Stream</th>
                                </>
                              )}
                              {cardDetailModal === 'activeAdmins' && (
                                <>
                                  <th>#</th>
                                  <th>Username</th>
                                  <th>Email</th>
                                  <th>Status</th>
                                  <th>Registered</th>
                                </>
                              )}
                              {cardDetailModal === 'totalHeads' && (
                                <>
                                  <th>#</th>
                                  <th>Username</th>
                                  <th>Email</th>
                                  <th>Role</th>
                                  <th>Registered</th>
                                </>
                              )}
                              {cardDetailModal === 'totalRegistrars' && (
                                <>
                                  <th>#</th>
                                  <th>Username</th>
                                  <th>Email</th>
                                  <th>Registered</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {cardDetailData.map((item) => (
                              <tr key={item.id}>
                                {cardDetailModal === 'totalStudents' && (
                                  <>
                                    <td>{item.id}</td>
                                    <td><strong>{item.username}</strong></td>
                                    <td>{item.email}</td>
                                    <td><span className="badge bg-success">{item.status}</span></td>
                                    <td>{item.registeredAt}</td>
                                  </>
                                )}
                                {cardDetailModal === 'totalDepartments' && (
                                  <>
                                    <td>{item.id}</td>
                                    <td><strong>{item.name}</strong></td>
                                    <td>{item.college}</td>
                                    <td>{item.capacity}</td>
                                    <td>{item.stream}</td>
                                  </>
                                )}
                                {cardDetailModal === 'activeAdmins' && (
                                  <>
                                    <td>{item.id}</td>
                                    <td><strong>{item.username}</strong></td>
                                    <td>{item.email}</td>
                                    <td><span className="badge bg-warning text-dark">{item.status}</span></td>
                                    <td>{item.registeredAt}</td>
                                  </>
                                )}
                                {cardDetailModal === 'totalHeads' && (
                                  <>
                                    <td>{item.id}</td>
                                    <td><strong>{item.username}</strong></td>
                                    <td>{item.email}</td>
                                    <td><span className="badge bg-info text-dark">{item.role}</span></td>
                                    <td>{item.registeredAt}</td>
                                  </>
                                )}
                                {cardDetailModal === 'totalRegistrars' && (
                                  <>
                                    <td>{item.id}</td>
                                    <td><strong>{item.username}</strong></td>
                                    <td>{item.email}</td>
                                    <td>{item.registeredAt}</td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="mt-3 text-end">
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => setCardDetailModal(null)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : tab === 'manage' ? (
            <ManageUsers />
          ) : tab === 'departments' ? (
            <ManageDepartments />
          ) : tab === 'reports' ? (
            <AdminReports />
          ) : tab === 'assign-head' ? (
            <AssignHead />
          ) : tab === 'system-config' ? (
            <SystemConfig />
          ) : tab === 'account-settings' ? (
            <AdminAccount />
          ) : (
            <AuditLogs />
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;