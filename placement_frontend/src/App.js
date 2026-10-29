import React, { useEffect, useState } from 'react';
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import api from './services/api.js';
import Header from "./components/layout/Header.jsx";
import PublicLayout from "./components/layout/PublicLayout.jsx";
import Home from "./pages/public/Home.jsx";
import Services from "./pages/public/Services.jsx";
import PlacementInfo from "./pages/public/PlacementInfo.jsx";
import Announcements from "./pages/public/Announcements.jsx";
import Contact from "./pages/public/Contact.jsx";
import Login from "./pages/public/Login.jsx";
import AdminDashboard from "./pages/admin/Admin_Dashboard.jsx";
import RegistrarDashboard from "./pages/registrar/RegistrarDashboard.jsx";
import EditUser from "./pages/admin/EditUser.jsx";
import EditDepartment from "./pages/admin/EditDepartment.jsx";
import StudentDashboard from "./pages/student/StudentDashboard.jsx";
import HeadDashboard from "./pages/head/HeadDashboard.jsx";
import StudentRegistration from "./pages/registrar/StudentRegistration.jsx";
import AssignHead from "./pages/admin/AssignHead.jsx";
import MissingScoresForm from "./pages/registrar/MissingScoresForm.jsx";
import Maintenance from './pages/public/Maintenance.jsx';
import { LanguageProvider } from './contexts/LanguageContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { RolePermissionsProvider, useRolePermissions } from './contexts/RolePermissionsContext.jsx';
import { roleFeatures } from './permissions/roleFeatures.js';

const DEFAULT_MAINTENANCE = {
  enabled: false,
  reason: 'Scheduled System Maintenance & Updates',
  title: 'Scheduled System Maintenance',
  message: 'We are performing scheduled maintenance and system updates to improve the reliability and performance of the DTU Placement Portal. Please check back soon.',
  expectedReturn: 'Soon',
};

const getStoredUser = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user && typeof user === 'object' ? user : null;
  } catch {
    return null;
  }
};

const isMaintenanceEnabled = (value) => value === true || value === 1 || ['true', '1', 'yes'].includes(String(value).toLowerCase());

function AppRoutes() {
  const location = useLocation();
  const { isOpen } = useRolePermissions();
  const [maintenance, setMaintenance] = useState(DEFAULT_MAINTENANCE);
  const [maintenanceLoaded, setMaintenanceLoaded] = useState(false);
  const [, setUserRevision] = useState(0);
  const user = getStoredUser();

  useEffect(() => {
    let isCurrent = true;
    const loadMaintenance = async () => {
      try {
        const response = await api.get('api/common/system_settings_api.php');
        if (!isCurrent) return;
        const savedMaintenance = response.data?.settings?.maintenance || {};
        setMaintenance({
          ...DEFAULT_MAINTENANCE,
          ...savedMaintenance,
          enabled: isMaintenanceEnabled(savedMaintenance.enabled),
        });
      } catch {
        if (isCurrent) setMaintenance(DEFAULT_MAINTENANCE);
      } finally {
        if (isCurrent) setMaintenanceLoaded(true);
      }
    };

    loadMaintenance();
    window.addEventListener('system-settings-updated', loadMaintenance);
    return () => {
      isCurrent = false;
      window.removeEventListener('system-settings-updated', loadMaintenance);
    };
  }, []);

  useEffect(() => {
    const syncUser = (event) => {
      if (event.key === 'user') setUserRevision((revision) => revision + 1);
    };
    window.addEventListener('storage', syncUser);
    return () => window.removeEventListener('storage', syncUser);
  }, []);

  if (!maintenanceLoaded) {
    return <main className="d-flex min-vh-100 align-items-center justify-content-center text-muted" role="status">Checking system status...</main>;
  }

  const isAdminUser = String(user?.role || '').trim().toLowerCase() === 'admin';
  const isLoginRoute = location.pathname === '/login';
  if (maintenance.enabled && !isAdminUser && !isLoginRoute) {
    return <Maintenance settings={maintenance} />;
  }

  const isAdmin = location.pathname.startsWith('/admin-dashboard') || location.pathname.startsWith('/registrar-dashboard') || location.pathname.startsWith('/head-dashboard') || location.pathname.startsWith('/student-dashboard') || location.pathname.startsWith('/edit-user') || location.pathname.startsWith('/edit-department') || location.pathname.startsWith('/admin/assign-head');
  const isAssignHeadPage = location.pathname === '/admin/assign-head';
  const isPublicPage = ['/', '/services', '/placement-info', '/announcements', '/contact', '/login'].includes(location.pathname);
  const workspaceRole = String(user?.role || '').trim().toLowerCase();
  const permissionsRole = ['head', 'hod', 'coordinator', 'department_head', 'department head'].includes(workspaceRole)
    ? 'head'
    : workspaceRole;
  const studentFeatureKeys = {
    overview: 'student.overview',
    preferences: 'student.preferences',
    result: 'student.results',
    appeal: 'student.appeals',
    notifications: 'student.notifications',
  };
  const registrarFeatureKeys = {
    overview: 'registrar.overview',
    'student-info': 'registrar.student-information',
    'data-import': 'registrar.data-import',
    'choice-matrix': 'registrar.choice-matrix',
    capacity: 'registrar.capacity',
    'department-status': 'registrar.department-status',
    'placement-rules': 'registrar.placement-rules',
    settings: 'registrar.settings',
    deadlines: 'registrar.deadlines',
    'run-placement': 'registrar.run-placement',
    'approve-results': 'registrar.approve-results',
    'placed-students': 'registrar.placed-students',
    'unassigned-students': 'registrar.unassigned-students',
    appeals: 'registrar.appeals',
    reports: 'registrar.reports',
    announcements: 'registrar.announcements',
  };
  const headFeatureKeys = {
    overview: 'head.overview',
    approvals: 'head.approvals',
    capacity: 'head.capacity',
    students: 'head.students',
    reports: 'head.reports',
  };
  const firstOpenFeature = (role) => roleFeatures[role]?.features.find(({ id }) => isOpen(id));
  let blockedFeature = null;
  if (workspaceRole === 'student' && location.pathname.startsWith('/student-dashboard')) {
    const activeTab = new URLSearchParams(location.search).get('tab')
      || localStorage.getItem('activeTab')
      || 'overview';
    const featureId = studentFeatureKeys[activeTab];
    if (featureId && !isOpen(featureId)) blockedFeature = firstOpenFeature('student');
  } else if (workspaceRole === 'registrar' && location.pathname.startsWith('/registrar-dashboard')) {
    const activeTab = location.pathname.split('/')[2] || 'overview';
    const featureId = registrarFeatureKeys[activeTab];
    if (featureId && !isOpen(featureId)) blockedFeature = firstOpenFeature('registrar');
  } else if (['head', 'hod', 'coordinator', 'department_head', 'department head'].includes(workspaceRole)
      && location.pathname.startsWith('/head-dashboard')) {
    const activeTab = localStorage.getItem('activeTab') || 'overview';
    const featureId = headFeatureKeys[activeTab];
    if (featureId && !isOpen(featureId)) blockedFeature = firstOpenFeature('head');
  }
  if (blockedFeature) {
    const roleHome = workspaceRole === 'student'
      ? `/student-dashboard?tab=${blockedFeature.navigationKey}`
      : workspaceRole === 'registrar'
        ? `/registrar-dashboard/${blockedFeature.navigationKey}`
        : '/head-dashboard';
    return <Navigate to={roleHome} replace />;
  }
  const currentRoleFeatureIds = roleFeatures[permissionsRole]?.features.map(({ id }) => id) || [];
  if (
    (workspaceRole === 'student' && location.pathname.startsWith('/student-dashboard'))
    || (workspaceRole === 'registrar' && location.pathname.startsWith('/registrar-dashboard'))
    || (['head', 'hod', 'coordinator', 'department_head', 'department head'].includes(workspaceRole)
      && location.pathname.startsWith('/head-dashboard'))
  ) {
    if (currentRoleFeatureIds.length > 0 && currentRoleFeatureIds.every((featureId) => !isOpen(featureId))) {
      return <main className="container py-5"><div className="alert alert-warning" role="status">This workspace is currently unavailable. Contact an Administrator.</div></main>;
    }
  }
  if (permissionsRole === 'admin') {
    const adminRoutePermissions = [
      ['/edit-user/', 'admin.users'],
      ['/edit-department/', 'admin.departments'],
      ['/admin/assign-head', 'admin.assign-head'],
    ];
    const blockedAdminRoute = adminRoutePermissions.find(([path, permissionId]) => (
      location.pathname.startsWith(path) && !isOpen(permissionId)
    ));
    if (blockedAdminRoute) {
      return <Navigate to="/admin-dashboard" state={{ activeTab: 'role-permissions' }} replace />;
    }
  }
  const routes = (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/services" element={<Services />} />
      <Route path="/placement-info" element={<PlacementInfo />} />
      <Route path="/announcements" element={<Announcements />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin-dashboard" element={<AdminDashboard />} />
      <Route path="/registrar-dashboard" element={<Navigate to="/registrar-dashboard/overview" replace />} />
      <Route path="/registrar-dashboard/:tab" element={<RegistrarDashboard />} />
      <Route path="/student-registration" element={<StudentRegistration />} />
      <Route path="/student-score-form/:studentId" element={<MissingScoresForm />} />
      <Route path="/head-dashboard" element={<HeadDashboard />} />
      <Route path="/admin/assign-head" element={<AssignHead />} />
      <Route path="/edit-user/:id" element={<EditUser />} />
      <Route path="/edit-department/:id" element={<EditDepartment />} />
      <Route path="/student-dashboard" element={<StudentDashboard />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );

  if (isPublicPage) {
    return (
      <PublicLayout
        isLogin={isLoginRoute}
        mainClassName={isLoginRoute ? 'login-route-main' : 'app-main container pt-0'}
      >
        {routes}
      </PublicLayout>
    );
  }

  return (
    <>
      <Header />
      <main className={`app-main ${isAdmin && !isAssignHeadPage ? 'dashboard-main' : 'container pt-0'} ${isAssignHeadPage ? 'assign-head-main' : ''}`}>
        {routes}
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <RolePermissionsProvider>
              <AppRoutes />
            </RolePermissionsProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
