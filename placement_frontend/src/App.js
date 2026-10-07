import React, { useEffect, useState } from 'react';
import "./App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import api from './services/api.js';
import Header from "./components/layout/Header.jsx";
import Footer from "./components/layout/Footer.jsx";
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

const DEFAULT_MAINTENANCE = {
  enabled: false,
  title: 'System Under Maintenance',
  message: 'The DTU Placement Portal is currently undergoing scheduled system updates. Services will resume shortly.',
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

  return (
    <>
      <Header />
      <main className={`app-main ${isAdmin && !isAssignHeadPage ? 'dashboard-main' : 'container pt-0'} ${isAssignHeadPage ? 'assign-head-main' : ''}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/placement-info" element={<PlacementInfo />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin-dashboard" element={<AdminDashboard />} />
          <Route path="/registrar-dashboard" element={<RegistrarDashboard />} />
          <Route path="/student-registration" element={<StudentRegistration />} />
          <Route path="/student-score-form/:studentId" element={<MissingScoresForm />} />
          <Route path="/head-dashboard" element={<HeadDashboard />} />
          <Route path="/admin/assign-head" element={<AssignHead />} />
          <Route path="/edit-user/:id" element={<EditUser />} />
          <Route path="/edit-department/:id" element={<EditDepartment />} />
          <Route path="/student-dashboard" element={<StudentDashboard />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      {!user && <Footer />}
    </>
  );
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
