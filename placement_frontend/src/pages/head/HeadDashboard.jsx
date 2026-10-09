import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dtuLogo from '../../assets/images6.jpg';
import OfficialPrintLetterhead from '../../components/common/OfficialPrintLetterhead.jsx';
import api from '../../services/api';
import './HeadDashboard.css';
import Reports from './Reports.jsx';

const normalizeDepartment = (dept, index = 0) => {
  const capacity = Number(dept?.capacity ?? 0);
  const assigned = Number(dept?.assigned ?? dept?.placed ?? dept?.students ?? 0);

  return {
    id: dept?.id ?? dept?.department_id ?? index + 1,
    name: dept?.name || dept?.department || `Department ${index + 1}`,
    description: dept?.description || '',
    stream: dept?.stream || 'Natural',
    college_name: dept?.college_name || dept?.collegeName || dept?.college || 'General',
    capacity,
    assigned,
    available: Math.max(0, capacity - assigned),
    status: dept?.status || 'active',
    head_id: dept?.head_id ?? null,
    created_at: dept?.created_at || dept?.createdAt || null,
  };
};

const emptyDepartment = {
  name: 'Not assigned',
  stream: '—',
  college_name: '—',
  capacity: 0,
  assigned: 0,
  available: 0,
  status: 'unassigned',
};

const HeadDashboard = () => {
  const navigate = useNavigate();
  const [leader, setLeader] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [department, setDepartment] = useState(emptyDepartment);
  const [departmentLoadError, setDepartmentLoadError] = useState('');
  const [departments, setDepartments] = useState([]);
  const [placedStudents, setPlacedStudents] = useState([]);
  const [pendingApprovalStudents, setPendingApprovalStudents] = useState([]);
  const [approvalSavingId, setApprovalSavingId] = useState(null);
  const [approvalError, setApprovalError] = useState('');
  const [approvalErrorId, setApprovalErrorId] = useState(null);
  const [capacityDraft, setCapacityDraft] = useState({});
  const [capacitySaveMsg, setCapacitySaveMsg] = useState('');
  const [capacitySaveMsgType, setCapacitySaveMsgType] = useState('success');
  const [stats, setStats] = useState({
    totalStudents: 0,
    placedStudents: 0,
    approvalRequests: 0,
    capacityUsed: 0,
  });
  const [recentPlacements, setRecentPlacements] = useState([]);
  const [preferences, setPreferences] = useState(() => {
    return { notifications: true, reporting: true };
  });
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesSaveMsg, setPreferencesSaveMsg] = useState('');
  
  // State for card detail modals
  const [cardDetailModal, setCardDetailModal] = useState(null); // 'totalStudents', 'placedStudents', 'approvalRequests', 'capacityUsed'
  const [cardDetailData, setCardDetailData] = useState([]);
  const [cardDetailLoading, setCardDetailLoading] = useState(false);

  const handleExportPdf = async () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.width;
    const collegeName = department.college_name || 'General';
    const deptName = department.name || 'Department';
    const logoData = await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/jpeg'));
      };
      image.onerror = () => resolve(null);
      image.src = dtuLogo;
    });

    if (logoData) doc.addImage(logoData, 'JPEG', 14, 8, 24, 24);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(10, 45, 109);
    doc.text('DEBRE TABOR UNIVERSITY', 42, 14);
    doc.setFontSize(11);
    doc.setTextColor(51, 51, 51);
    doc.text(`${collegeName.toUpperCase()} — DEPARTMENT OF ${deptName.toUpperCase()}`, 42, 20);
    doc.setFontSize(10);
    doc.setTextColor(10, 45, 109);
    doc.text('OFFICIAL STUDENT DEPARTMENT PLACEMENT ROSTER', 42, 26);

    doc.setFontSize(8);
    doc.setTextColor(102, 102, 102);
    let metadataX = 42;
    const addMetadata = (text, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.text(text, metadataX, 32);
      metadataX += doc.getTextWidth(text) + 1.5;
    };
    addMetadata('Issued by:', true);
    addMetadata(' Office of the Department Head |');
    addMetadata(' Academic Batch:', true);
    addMetadata(' 2016 E.C. / 2026 G.C. |');
    addMetadata(' Date:', true);
    addMetadata(` ${new Date().toLocaleDateString()}`);

    doc.setDrawColor(244, 201, 93);
    doc.setLineWidth(1);
    doc.line(14, 35, pageWidth - 14, 35);

    const headers = ['#', 'Student ID', 'Full Name', 'Gender', 'GPA', 'Final Score', 'Choice Rank', 'Disability', 'Phone', 'Status'];
    const rows = placedStudents.map((student, index) => {
      const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.username || '—';
      const hasDisability = ['yes', 'y', 'true', '1', 'on'].includes(String(student.disability ?? '').toLowerCase());
      return [
        index + 1,
        student.id_number || student.student_id || '—',
        fullName,
        student.gender || '—',
        Number.isFinite(Number(student.gpa)) ? Number(student.gpa).toFixed(2) : '—',
        Number.isFinite(Number(student.final_score)) ? Number(student.final_score).toFixed(2) : '—',
        student.choice_rank ? `Choice #${student.choice_rank}` : '—',
        hasDisability ? 'Yes' : 'No',
        student.phone || '-',
        student.status || 'Pending',
      ];
    });
    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 40,
      styles: { fontSize: 7.5, cellPadding: 2.2 },
      headStyles: { fillColor: [10, 45, 109], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [243, 246, 250] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        1: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
      },
    });

    let signoffY = doc.lastAutoTable.finalY + 14;
    if (signoffY + 20 > doc.internal.pageSize.height - 10) {
      doc.addPage();
      signoffY = 24;
    }
    doc.setDrawColor(210, 215, 222);
    doc.setLineWidth(0.4);
    doc.line(14, signoffY - 5, pageWidth - 14, signoffY - 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 51, 51);
    doc.text('Prepared & Verified by: Department Head', 14, signoffY);
    doc.text('Signature: __________________   Date: __________', 14, signoffY + 7);
    doc.rect(pageWidth - 78, signoffY - 6, 64, 24);
    doc.text(doc.splitTextToSize('Official Department Seal / Stamp', 58), pageWidth - 75, signoffY + 3);

    doc.save(`${deptName.replace(/\s+/g, '_')}_Placed_Students.pdf`);
  };

  useEffect(() => {
    const rawUser = localStorage.getItem('user');
    if (!rawUser) {
      navigate('/login');
      return;
    }

    try {
      const parsed = JSON.parse(rawUser);
      const role = String(parsed.role || '').trim().toLowerCase();
      if (['head', 'hod', 'admin', 'coordinator'].includes(role)) {
        setLeader(parsed);
      } else {
        navigate('/login');
      }
    } catch (error) {
      localStorage.clear();
      navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!leader || !['overview', 'students'].includes(tab)) return;

    const loadDepartments = async () => {
      try {
        const response = await api.get('api/head/get_head_dashboard.php');
        const responseData = response?.data ?? {};
        if (!responseData.success || !responseData.department) {
          throw new Error(responseData.message || 'No assigned department found');
        }

        const primary = normalizeDepartment(responseData.department);
        setDepartmentLoadError('');
        const nextDepartments = [primary];
        const students = (Array.isArray(responseData.students) ? responseData.students : []).filter((student) => (
          ['approved', 'published'].includes(String(student.status || '').trim().toLowerCase())
        ));
        const pendingStudents = (Array.isArray(responseData.pendingStudents) ? responseData.pendingStudents : []).filter((student) => (
          String(student.status || '').trim().toLowerCase() === 'pending'
        ));
        const pendingCount = pendingStudents.filter((student) => !student.approved_at).length;

        setDepartments(nextDepartments);
        setDepartment(primary);
        setPlacedStudents(students);
        setPendingApprovalStudents(pendingStudents);
        setStats({
          totalStudents: Number(primary.assigned ?? (students.length + pendingStudents.length)),
          placedStudents: students.length,
          approvalRequests: pendingCount,
          capacityUsed: primary.capacity > 0 ? Math.round((Number(primary.assigned ?? 0) / primary.capacity) * 100) : 0,
        });
        setRecentPlacements(students.slice(0, 5).map((student) => ({
          student: student.username,
          program: student.dept_name,
          status: student.status,
        })));
      } catch (error) {
        console.error('Department load error:', error);
        setDepartment(emptyDepartment);
        setDepartmentLoadError(
          error.response?.data?.message ||
          error.message ||
          'Unable to load your assigned department.'
        );
        setDepartments([]);
        setPlacedStudents([]);
        setPendingApprovalStudents([]);
        setRecentPlacements([]);
        setStats({ totalStudents: 0, placedStudents: 0, approvalRequests: 0, capacityUsed: 0 });
      }
    };

    loadDepartments();
  }, [leader, tab]);

  useEffect(() => {
    if (!leader) return;

    const loadPreferences = async () => {
      setPreferencesLoading(true);
      try {
        const response = await api.get('api/head/head_preferences.php');
        if (!response.data?.success) {
          throw new Error(response.data?.message || 'Unable to load preferences.');
        }
        setPreferences(response.data.preferences || { notifications: true, reporting: true });
      } catch (error) {
        setPreferencesSaveMsg(error.response?.data?.message || error.message || 'Unable to load preferences.');
      } finally {
        setPreferencesLoading(false);
      }
    };

    loadPreferences();
  }, [leader]);

  useEffect(() => {
    const draft = {};
    departments.forEach((dept) => {
      draft[dept.id] = Number(dept.capacity || 0);
    });
    setCapacityDraft(draft);
  }, [departments]);

  const saveCapacityPlan = async () => {
    setCapacitySaveMsg('');
    try {
      const updates = departments.map((dept) => {
        const nextCapacity = Number(capacityDraft[dept.id] ?? dept.capacity ?? 0);
        if (!Number.isInteger(nextCapacity) || nextCapacity < 0) {
          throw new Error(`Capacity for ${dept.name} must be a non-negative whole number.`);
        }
        return { id: dept.id, capacity: nextCapacity };
      });

      if (updates.length === 0) {
        throw new Error('No assigned department capacity is available to update.');
      }

      const response = await api.post('api/common/departments_update.php', { departments: updates });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save the capacity plan.');
      }

      const refreshedResponse = await api.get('api/head/get_head_dashboard.php');
      if (!refreshedResponse.data?.success || !refreshedResponse.data?.department) {
        throw new Error(refreshedResponse.data?.message || 'Unable to verify the saved capacity plan.');
      }
      const refreshedDepartment = normalizeDepartment(refreshedResponse.data.department);
      if (updates.some((update) => (
        String(update.id) === String(refreshedDepartment.id)
        && Number(update.capacity) !== refreshedDepartment.capacity
      ))) {
        throw new Error('The capacity plan was not saved. Refresh and try again.');
      }

      setDepartments([refreshedDepartment]);
      setDepartment(refreshedDepartment);
      setCapacityDraft({ [refreshedDepartment.id]: refreshedDepartment.capacity });
      setCapacitySaveMsg('Capacity plan saved and confirmed.');
      setCapacitySaveMsgType('success');
    } catch (error) {
      setCapacitySaveMsg(error.response?.data?.message || error.message || 'Unable to save capacity plan.');
      setCapacitySaveMsgType('danger');
    }

    setTimeout(() => setCapacitySaveMsg(''), 3000);
  };

  const approvePlacement = async (placement) => {
    setApprovalSavingId(placement.placement_id);
    setApprovalError('');
    setApprovalErrorId(null);
    try {
      const response = await api.post('api/head/head_approval.php', {
        placement_id: placement.placement_id,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to approve placement.');
      }

      setPendingApprovalStudents((current) => current.map((student) => student.placement_id === placement.placement_id
        ? { ...student, approved_at: new Date().toISOString() }
        : student));
      setStats((current) => ({ ...current, approvalRequests: Math.max(0, current.approvalRequests - 1) }));
    } catch (error) {
      setApprovalError(error.response?.data?.message || error.message || 'Unable to approve placement.');
      setApprovalErrorId(placement.placement_id);
    } finally {
      setApprovalSavingId(null);
    }
  };

  // Handle card clicks to show details
  const handleCardClick = (cardType) => {
    setCardDetailModal(cardType);
    setCardDetailLoading(true);
    setCardDetailData([]);

    try {
      let data = [];

      if (cardType === 'totalStudents') {
        // Show all students in the department
        data = [...placedStudents, ...pendingApprovalStudents]
          .slice(0, 20)
          .map((student, idx) => ({
            id: idx + 1,
            username: student.username || 'N/A',
            email: student.email || 'N/A',
            department: student.dept_name || department.name,
            score: Number(student.final_score || 0).toFixed(2),
            status: student.status || 'Pending'
          }));
      } else if (cardType === 'placedStudents') {
        // Show only finalized placements
        data = placedStudents
          .filter((student) => ['approved', 'published'].includes(String(student.status || '').trim().toLowerCase()))
          .slice(0, 20)
          .map((student, idx) => ({
            id: idx + 1,
            username: student.username || 'N/A',
            email: student.email || 'N/A',
            department: student.dept_name || department.name,
            score: Number(student.final_score || 0).toFixed(2),
            choiceRank: student.choice_rank || 'N/A',
            status: student.status
          }));
      } else if (cardType === 'approvalRequests') {
        // Show pending approvals
        data = pendingApprovalStudents
          .filter((student) => String(student.status || '').trim().toLowerCase() === 'pending' && !student.approved_at)
          .slice(0, 20)
          .map((student, idx) => ({
            id: idx + 1,
            username: student.username || 'N/A',
            email: student.email || 'N/A',
            department: student.dept_name || department.name,
            score: Number(student.final_score || 0).toFixed(2),
            status: 'Awaiting Approval'
          }));
      } else if (cardType === 'capacityUsed') {
        // Show capacity breakdown
        data = departments.map((dept, idx) => ({
          id: idx + 1,
          department: dept.name,
          capacity: dept.capacity,
          assigned: dept.assigned,
          available: dept.available,
          utilization: dept.capacity > 0 ? Math.round((dept.assigned / dept.capacity) * 100) : 0
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

  if (loading || !leader) {
    return <div className="text-center mt-5">Loading dashboard…</div>;
  }

  return (
    <div className="head-dashboard container-fluid px-0">
      <div className="row g-0">
        <aside className="col-xl-2 sidebar p-4">
          <div className="sidebar-brand mb-5">
            <h5 className="mb-2">Head Dashboard</h5>
            <p className="small text-white-75 mb-0">Department leadership tools and placement oversight.</p>
          </div>

          <nav className="sidebar-nav d-flex flex-column gap-2">
            <button className={`nav-button ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
            <button className={`nav-button ${tab === 'approvals' ? 'active' : ''}`} onClick={() => setTab('approvals')}>Approvals</button>
            <button className={`nav-button ${tab === 'capacity' ? 'active' : ''}`} onClick={() => setTab('capacity')}>Capacity Plan</button>
            <button className={`nav-button ${tab === 'students' ? 'active' : ''}`} onClick={() => setTab('students')}>Placed Students</button>
            <button className={`nav-button ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>Reports</button>
            <button className={`nav-button ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Preferences</button>
          </nav>
        </aside>

        <main className="col-xl-10 p-5 main-section">
          <header className="dashboard-header mb-5">
            <div>
              <h2 className="fw-bold mb-1">Welcome back, {leader.username}</h2>
              <p className="text-muted mb-0">Track placement progress, approve department allocations, and monitor student outcomes.</p>
            </div>
            <div className="status-chip">Head of Department</div>
          </header>

          {departmentLoadError && (
            <div className="alert alert-warning" role="alert">
              {departmentLoadError} Contact an administrator to assign an active department to your account.
            </div>
          )}

          {tab === 'overview' && (
            <>
              <div className="row g-4 mb-4">
                <div className="col-md-3">
                  <div 
                    className="card summary-card"
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
                      <h3 className="summary-value">{stats.totalStudents}</h3>
                      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <small style={{ color: '#0d6efd', fontWeight: 'bold' }}>Click to view details →</small>
                        <button 
                          className="btn btn-sm btn-outline-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardDetailModal('totalStudents');
                            // Show all students without limit
                            setCardDetailData([...placedStudents, ...pendingApprovalStudents].map((student, idx) => ({
                              id: idx + 1,
                              username: student.username || 'N/A',
                              email: student.email || 'N/A',
                              department: student.dept_name || department.name,
                              score: Number(student.final_score || 0).toFixed(2),
                              status: student.status || 'Pending'
                            })));
                            setCardDetailLoading(false);
                          }}
                          style={{ padding: '2px 6px', fontSize: '11px' }}
                        >
                          View All
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div 
                    className="card summary-card"
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
                    onClick={() => handleCardClick('placedStudents')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Placed Students</span>
                      <h3 className="summary-value">{stats.placedStudents}</h3>
                      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <small style={{ color: '#198754', fontWeight: 'bold' }}>Click to view details →</small>
                        <button 
                          className="btn btn-sm btn-outline-success"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardDetailModal('placedStudents');
                            setCardDetailData(placedStudents
                              .filter((student) => ['approved', 'published'].includes(String(student.status || '').trim().toLowerCase()))
                              .map((student, idx) => ({
                                id: idx + 1,
                                username: student.username || 'N/A',
                                email: student.email || 'N/A',
                                department: student.dept_name || department.name,
                                score: Number(student.final_score || 0).toFixed(2),
                                choiceRank: student.choice_rank || 'N/A',
                                status: student.status
                              })));
                            setCardDetailLoading(false);
                          }}
                          style={{ padding: '2px 6px', fontSize: '11px' }}
                        >
                          View All
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div 
                    className="card summary-card"
                    style={{ cursor: 'pointer', transition: 'all 0.3s ease', border: '2px solid transparent' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = '#dc3545';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                    onClick={() => handleCardClick('approvalRequests')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Pending Approvals</span>
                      <h3 className="summary-value">{stats.approvalRequests}</h3>
                      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <small style={{ color: '#dc3545', fontWeight: 'bold' }}>Click to view details →</small>
                        <button 
                          className="btn btn-sm btn-outline-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardDetailModal('approvalRequests');
                            setCardDetailData(pendingApprovalStudents
                              .filter((student) => String(student.status || '').trim().toLowerCase() === 'pending' && !student.approved_at)
                              .map((student, idx) => ({
                                id: idx + 1,
                                username: student.username || 'N/A',
                                email: student.email || 'N/A',
                                department: student.dept_name || department.name,
                                score: Number(student.final_score || 0).toFixed(2),
                                status: 'Awaiting Approval'
                              })));
                            setCardDetailLoading(false);
                          }}
                          style={{ padding: '2px 6px', fontSize: '11px' }}
                        >
                          View All
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div 
                    className="card summary-card"
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
                    onClick={() => handleCardClick('capacityUsed')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Capacity Utilized</span>
                      <h3 className="summary-value">{stats.capacityUsed}%</h3>
                      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <small style={{ color: '#ffc107', fontWeight: 'bold' }}>Click to view details →</small>
                        <button 
                          className="btn btn-sm btn-outline-warning"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardDetailModal('capacityUsed');
                            setCardDetailData(departments.map((dept, idx) => ({
                              id: idx + 1,
                              department: dept.name,
                              capacity: dept.capacity,
                              assigned: dept.assigned,
                              available: dept.available,
                              utilization: dept.capacity > 0 ? Math.round((dept.assigned / dept.capacity) * 100) : 0
                            })));
                            setCardDetailLoading(false);
                          }}
                          style={{ padding: '2px 6px', fontSize: '11px' }}
                        >
                          View All
                        </button>
                      </div>
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
                    maxWidth: '900px',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                    padding: '30px'
                  }}>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h4 className="fw-bold mb-0">
                        {cardDetailModal === 'totalStudents' && 'Department Students'}
                        {cardDetailModal === 'placedStudents' && 'Placed Students'}
                        {cardDetailModal === 'approvalRequests' && 'Pending Approvals'}
                        {cardDetailModal === 'capacityUsed' && 'Capacity Breakdown'}
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
                                  <th>Student</th>
                                  <th>Email</th>
                                  <th>Department</th>
                                  <th>Score</th>
                                  <th>Status</th>
                                </>
                              )}
                              {cardDetailModal === 'placedStudents' && (
                                <>
                                  <th>#</th>
                                  <th>Student</th>
                                  <th>Email</th>
                                  <th>Department</th>
                                  <th>Score</th>
                                  <th>Choice Rank</th>
                                  <th>Status</th>
                                </>
                              )}
                              {cardDetailModal === 'approvalRequests' && (
                                <>
                                  <th>#</th>
                                  <th>Student</th>
                                  <th>Email</th>
                                  <th>Department</th>
                                  <th>Score</th>
                                  <th>Status</th>
                                </>
                              )}
                              {cardDetailModal === 'capacityUsed' && (
                                <>
                                  <th>#</th>
                                  <th>Department</th>
                                  <th>Capacity</th>
                                  <th>Assigned</th>
                                  <th>Available</th>
                                  <th>Utilization</th>
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
                                    <td>{item.department}</td>
                                    <td>{item.score}</td>
                                    <td><span className="badge bg-info">{item.status}</span></td>
                                  </>
                                )}
                                {cardDetailModal === 'placedStudents' && (
                                  <>
                                    <td>{item.id}</td>
                                    <td><strong>{item.username}</strong></td>
                                    <td>{item.email}</td>
                                    <td>{item.department}</td>
                                    <td>{item.score}</td>
                                    <td>{item.choiceRank}</td>
                                    <td><span className="badge bg-success">{item.status}</span></td>
                                  </>
                                )}
                                {cardDetailModal === 'approvalRequests' && (
                                  <>
                                    <td>{item.id}</td>
                                    <td><strong>{item.username}</strong></td>
                                    <td>{item.email}</td>
                                    <td>{item.department}</td>
                                    <td>{item.score}</td>
                                    <td><span className="badge bg-warning text-dark">{item.status}</span></td>
                                  </>
                                )}
                                {cardDetailModal === 'capacityUsed' && (
                                  <>
                                    <td>{item.id}</td>
                                    <td><strong>{item.department}</strong></td>
                                    <td>{item.capacity}</td>
                                    <td>{item.assigned}</td>
                                    <td>{item.available}</td>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>{item.utilization}%</span>
                                        <div style={{ width: '60px', height: '6px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden' }}>
                                          <div style={{ width: `${item.utilization}%`, height: '100%', background: item.utilization > 80 ? '#dc3545' : item.utilization > 50 ? '#ffc107' : '#198754' }} />
                                        </div>
                                      </div>
                                    </td>
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

              <div className="row g-4">
                <div className="col-lg-6">
                  <div className="card analytics-card h-100">
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-start mb-3">
                        <h5 className="card-title">Department Snapshot</h5>
                        <span className="badge badge-soft">{department.status || 'active'}</span>
                      </div>
                      <ul className="overview-list">
                        <li><span>Department</span><strong>{department.name}</strong></li>
                        <li><span>College</span><strong>{department.college_name}</strong></li>
                        <li><span>Stream</span><strong>{department.stream}</strong></li>
                        <li><span>Total Capacity</span><strong>{department.capacity}</strong></li>
                        <li><span>Assigned Seats</span><strong>{department.assigned}</strong></li>
                        <li><span>Available Seats</span><strong>{department.available}</strong></li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="col-lg-6">
                  <div className="card analytics-card h-100">
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-start mb-3">
                        <h5 className="card-title">Latest Placement Activity</h5>
                        <button className="btn btn-sm btn-outline-primary">View All</button>
                      </div>
                      <div className="activity-list">
                        {recentPlacements.length > 0 ? recentPlacements.map(item => (
                          <div key={item.student} className="activity-item">
                            <div>
                              <div className="fw-semibold">{item.student}</div>
                              <div className="text-muted small">{item.program}</div>
                            </div>
                            <span className={`status-tag ${item.status === 'Confirmed' ? 'status-success' : item.status === 'Matched' ? 'status-primary' : 'status-warning'}`}>
                              {item.status}
                            </span>
                          </div>
                        )) : <p className="text-muted mb-0">No recent placement activity.</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'approvals' && (
            <div className="card analytics-card">
              <div className="card-body">
                <h5 className="card-title mb-4">Approval Queue</h5>
                {pendingApprovalStudents.filter((student) => String(student.status || '').trim().toLowerCase() === 'pending' && !student.approved_at).length === 0 ? (
                  <p className="text-muted mb-0">No pending placement approvals for {department.name}.</p>
                ) : (
                  <div className="task-grid">
                    {pendingApprovalStudents.filter((student) => String(student.status || '').trim().toLowerCase() === 'pending' && !student.approved_at).map((student) => (
                    <div key={student.placement_id} className="task-card">
                      <div>
                        <p className="task-label mb-1">{student.username}</p>
                        <small className="text-muted">{student.dept_name} · score {Number(student.final_score).toFixed(2)}</small>
                      </div>
                      <div className="d-flex flex-column align-items-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-success"
                          onClick={() => approvePlacement(student)}
                          disabled={approvalSavingId === student.placement_id}
                        >
                          {approvalSavingId === student.placement_id ? 'Approving...' : 'Approve'}
                        </button>
                        {approvalErrorId === student.placement_id && approvalError && (
                          <div className="alert alert-danger mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="alert">
                            {approvalError}
                          </div>
                        )}
                      </div>
                    </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'capacity' && (
            <div className="card analytics-card">
              <div className="card-body">
                <h5 className="card-title mb-3">Capacity Planning</h5>
                <p className="text-muted">Review the current intake capacity and update department quotas for the next cycle.</p>

                <div className="table-responsive">
                  <table className="table align-middle">
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th>College</th>
                        <th>Stream</th>
                        <th>Assigned</th>
                        <th>Capacity</th>
                        <th>Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departments.map((dept) => {
                          const draftCapacity = Number(capacityDraft[dept.id] ?? dept.capacity ?? 0);
                          const availableSeats = Math.max(0, draftCapacity - Number(dept.assigned || 0));

                          return (
                            <tr key={dept.id}>
                              <td>
                                <div className="fw-semibold">{dept.name}</div>
                                <small className="text-muted">{dept.status || 'active'}</small>
                              </td>
                              <td>{dept.college_name}</td>
                              <td>{dept.stream}</td>
                              <td>{dept.assigned}</td>
                              <td style={{ minWidth: '130px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  className="form-control"
                                  aria-label={`Capacity for ${dept.name}`}
                                  value={draftCapacity}
                                  onChange={(e) => {
                                    setCapacityDraft((prev) => ({ ...prev, [dept.id]: e.target.value }));
                                  }}
                                />
                              </td>
                              <td>
                                <span className={`badge ${availableSeats > 0 ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}`}>
                                  {availableSeats}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                <div className="d-flex gap-2 mt-3 flex-wrap align-items-center">
                  <button
                    className="btn btn-primary"
                    onClick={saveCapacityPlan}
                  >
                    Save Capacity Plan
                  </button>

                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      const resetDraft = {};
                      departments.forEach((dept) => {
                        resetDraft[dept.id] = Number(dept.capacity || 0);
                      });
                      setCapacityDraft(resetDraft);
                    }}
                  >
                    Reset
                  </button>

                  {capacitySaveMsg && (
                    <div className={`alert alert-${capacitySaveMsgType} mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0`} role={capacitySaveMsgType === 'danger' ? 'alert' : 'status'}>
                      {capacitySaveMsg}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'students' && (
            <div className="card analytics-card head-student-roster-print">
              <div className="card-body">
                <OfficialPrintLetterhead
                  office={`${(department.college_name || 'General').toUpperCase()} — DEPARTMENT OF ${(department.name || 'DEPARTMENT').toUpperCase()}`}
                  title="OFFICIAL STUDENT DEPARTMENT PLACEMENT ROSTER"
                  metadata={`Issued by: Office of the Department Head | Academic Batch: 2016 E.C. / 2026 G.C. | Date: ${new Date().toLocaleDateString()}`}
                />
                <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-4 head-student-roster-actions">
                  <div>
                    <h5 className="card-title mb-1">Placed Students — {department.name}</h5>
                    <p className="text-muted mb-0">Students assigned to this department.</p>
                  </div>
                  <div className="d-flex gap-2 flex-wrap">
                    <button type="button" onClick={() => window.print()} className="btn btn-outline-dark btn-sm">
                      🖨️ Print Student Roster
                    </button>
                    <button type="button" className="btn btn-danger btn-sm fw-semibold shadow-sm" onClick={handleExportPdf}>
                      📄 Export PDF
                    </button>
                  </div>
                </div>
                {placedStudents.length === 0 ? (
                  <div className="text-muted">No placed students found for this department.</div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle head-student-roster-table">
                      <thead className="table-light">
                        <tr>
                          <th>STUDENT ID</th>
                          <th>FULL NAME</th>
                          <th>GENDER</th>
                          <th>GPA</th>
                          <th>FINAL SCORE</th>
                          <th>CHOICE RANK</th>
                          <th>DISABILITY</th>
                          <th>PHONE</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {placedStudents.map((student) => {
                          const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.username || '—';
                          const gender = String(student.gender || '').toLowerCase();
                          const hasDisability = ['yes', 'y', 'true', '1', 'on'].includes(String(student.disability ?? '').toLowerCase());
                          const approved = ['approved', 'published'].includes(String(student.status || '').toLowerCase());

                          return (
                            <tr key={`${student.student_id}-${student.email}`}>
                              <td><span className="badge bg-primary-subtle text-primary px-3 py-2">{student.id_number || student.student_id}</span></td>
                              <td className="fw-semibold">{fullName}</td>
                              <td>
                                {gender === 'female' ? (
                                  <span className="badge px-3 py-1 fw-bold" style={{ backgroundColor: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3' }}>
                                    Female
                                  </span>
                                ) : gender === 'male' ? (
                                  <span className="badge px-3 py-1 fw-bold" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                                    Male
                                  </span>
                                ) : (
                                  <span className="badge bg-secondary px-3 py-1 fw-bold">{student.gender || '—'}</span>
                                )}
                              </td>
                              <td><span className="badge bg-primary">{Number.isFinite(Number(student.gpa)) ? Number(student.gpa).toFixed(2) : '—'}</span></td>
                              <td>{Number.isFinite(Number(student.final_score)) ? Number(student.final_score).toFixed(2) : '—'}</td>
                              <td>{student.choice_rank ? `Choice #${student.choice_rank}` : '—'}</td>
                              <td><span className={`badge ${hasDisability ? 'bg-danger' : 'bg-secondary'}`}>{hasDisability ? 'Yes' : 'No'}</span></td>
                              <td>{student.phone || '-'}</td>
                              <td><span className={`badge ${approved ? 'bg-success' : 'bg-warning text-dark'}`}>{student.status || 'Pending'}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="head-roster-signoff">
                  <div>
                    <strong>Prepared &amp; Verified by: Department Head</strong>
                    <div>Signature: ____________________ &nbsp; Date: ______________</div>
                  </div>
                  <div className="head-roster-stamp">Official Department Seal / Stamp</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'reports' && (
            <div className="row g-4">
              <div className="col-md-6">
                <div className="card analytics-card h-100">
                  <div className="card-body">
                    <h5 className="card-title">Placement Trend</h5>
                    <p className="text-muted mb-0">Current placement performance for {department.name}.</p>
                    <div className="chart-placeholder">{stats.placedStudents} of {department.capacity} seats assigned</div>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="card analytics-card h-100">
                  <div className="card-body">
                    <h5 className="card-title">Action Summary</h5>
                    <ul className="overview-list">
                      <li><span>Department</span><strong>{department.name}</strong></li>
                      <li><span>Placed students</span><strong>{stats.placedStudents}</strong></li>
                      <li><span>Pending approvals</span><strong>{stats.approvalRequests}</strong></li>
                      <li><span>Available seats</span><strong>{department.available}</strong></li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="col-12">
                <Reports leader={leader} department={department} students={placedStudents} />
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="card analytics-card">
              <div className="card-body">
                <h5 className="card-title mb-4">Department Preferences</h5>
                <p className="text-muted">Update notification and reporting preferences for this dashboard.</p>
                {preferencesLoading && <p className="text-muted">Loading preferences...</p>}
                <div className="settings-grid">
                  <div className="settings-card">
                    <h6>Notifications</h6>
                    <label className="d-flex align-items-center gap-2">
                      <input type="checkbox" checked={preferences.notifications} onChange={(event) => setPreferences((current) => ({ ...current, notifications: event.target.checked }))} />
                      <span className="text-muted small">Receive alerts for new placement requests.</span>
                    </label>
                  </div>
                  <div className="settings-card">
                    <h6>Reporting</h6>
                    <label className="d-flex align-items-center gap-2">
                      <input type="checkbox" checked={preferences.reporting} onChange={(event) => setPreferences((current) => ({ ...current, reporting: event.target.checked }))} />
                      <span className="text-muted small">Receive reporting summaries for your department.</span>
                    </label>
                  </div>
                </div>
                <div className="d-flex gap-3 align-items-center mt-4">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={preferencesLoading || preferencesSaving}
                    onClick={async () => {
                      setPreferencesSaving(true);
                      setPreferencesSaveMsg('');
                      try {
                        const response = await api.post('api/head/head_preferences.php', preferences);
                        if (!response.data?.success) {
                          throw new Error(response.data?.message || 'Unable to save preferences.');
                        }
                        setPreferences(response.data.preferences || preferences);
                        setPreferencesSaveMsg(response.data.message || 'Preferences saved successfully.');
                      } catch (error) {
                        setPreferencesSaveMsg(error.response?.data?.message || error.message || 'Unable to save preferences.');
                      } finally {
                        setPreferencesSaving(false);
                      }
                    }}
                  >
                    {preferencesSaving ? 'Saving...' : 'Save Preferences'}
                  </button>
                  {preferencesSaveMsg && <span className={`${preferencesSaveMsg.includes('Unable') || preferencesSaveMsg.includes('must') || preferencesSaveMsg.includes('Only') ? 'text-danger' : 'text-success'} fw-semibold`}>{preferencesSaveMsg}</span>}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default HeadDashboard;
