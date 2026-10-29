import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dtuLogo from '../../assets/images6.jpg';
import OfficialPrintLetterhead from '../../components/common/OfficialPrintLetterhead.jsx';
import api from '../../services/api';
import './HeadDashboard.css';
import Reports from './Reports.jsx';
import Sidebar from '../../components/layout/Sidebar.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

const normalizeDepartment = (dept, index = 0) => {
  const capacity = Number(dept?.capacity ?? 0);
  const assigned = Number(dept?.assigned ?? dept?.placed ?? dept?.students ?? 0);

  return {
    id: dept?.id ?? dept?.department_id ?? index + 1,
    name: dept?.name || dept?.dept_name || dept?.department || `Department ${index + 1}`,
    description: dept?.description || '',
    stream: dept?.stream || 'Natural',
    college_name: dept?.college_name || dept?.collegeName || dept?.college || 'General',
    capacity,
    approval_status: String(dept?.approval_status || 'pending').trim().toLowerCase(),
    is_locked: Number(dept?.is_locked ?? 0) === 1,
    assigned,
    available: Math.max(0, capacity - assigned),
    status: dept?.status || 'active',
    head_id: dept?.head_id ?? null,
    created_at: dept?.created_at || dept?.createdAt || null,
  };
};

const HEAD_TABS = ['overview', 'approvals', 'capacity', 'students', 'reports'];

const HeadDashboard = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [leader, setLeader] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTabState] = useState(() => {
    const requestedTab = new URLSearchParams(location.search).get('tab');
    const savedTab = requestedTab || localStorage.getItem('activeTab:head');
    return HEAD_TABS.includes(savedTab) ? savedTab : 'overview';
  });
  const [dashboardError, setDashboardError] = useState('');
  const setTab = (nextTab) => {
    if (!HEAD_TABS.includes(nextTab)) return;
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('tab', nextTab);
    navigate({ pathname: location.pathname, search: `?${searchParams.toString()}` });
    localStorage.setItem('activeTab:head', nextTab);
    localStorage.setItem('activeTab', nextTab);
    setTabState(nextTab);
  };

  useEffect(() => {
    const routeTab = new URLSearchParams(location.search).get('tab');
    if (HEAD_TABS.includes(routeTab)) {
      setTabState(routeTab);
      localStorage.setItem('activeTab:head', routeTab);
      localStorage.setItem('activeTab', routeTab);
    }
  }, [location.search]);
  const [department, setDepartment] = useState({});
  const [departments, setDepartments] = useState([]);
  const [placedStudents, setPlacedStudents] = useState([]);
  const [pendingApprovalStudents, setPendingApprovalStudents] = useState([]);
  const [approvalSavingId, setApprovalSavingId] = useState(null);
  const [approvalError, setApprovalError] = useState('');
  const [approvalErrorId, setApprovalErrorId] = useState(null);
  const [capacityDraft, setCapacityDraft] = useState({});
  const [capacitySaveMsg, setCapacitySaveMsg] = useState('');
  const [capacitySaveMsgType, setCapacitySaveMsgType] = useState('success');
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityError, setCapacityError] = useState('');
  const [departmentLoading, setDepartmentLoading] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const capacityMessageTimeout = useRef(null);
  const [stats, setStats] = useState({
    totalStudents: 0,
    placedStudents: 0,
    approvalRequests: 0,
    capacityUsed: 0,
  });
  const [recentPlacements, setRecentPlacements] = useState([]);
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
      if (['head', 'department_head', 'department head', 'head of department', 'hod', 'admin', 'coordinator'].includes(role)) {
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
    if (!leader) return;

    const controller = new AbortController();
    let isCurrent = true;
    const loadDepartments = async () => {
      setDepartmentLoading(true);
      setDashboardError('');
      try {
        const response = await api.get('api/head/get_head_dashboard.php', {
          signal: controller.signal,
          withCredentials: true,
        });
        const responseData = response?.data ?? {};
        if (!responseData.success || !responseData.department) {
          throw new Error(responseData.message || 'No assigned department found');
        }

        const departmentName = responseData.department.name || responseData.department?.dept_name;
        const primary = normalizeDepartment({
          ...responseData.department,
          name: departmentName,
        });
        const nextDepartments = [primary];
        const students = Array.isArray(responseData.students) ? responseData.students : [];
        const pendingStudents = Array.isArray(responseData.pendingStudents) ? responseData.pendingStudents : [];
        const pendingCount = pendingStudents.filter((student) => !student.approved_at).length;

        if (!isCurrent) return;
        setDepartments(nextDepartments);
        setDepartment(primary);
        setPlacedStudents(students);
        setPendingApprovalStudents(pendingStudents);
        setStats({
          totalStudents: students.length + pendingStudents.length,
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
        if (!isCurrent || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;
        console.error('Department load error:', error);
        setDashboardError(error.response?.data?.message || error.message || 'Unable to load department data.');
        setDepartments([]);
        setPlacedStudents([]);
        setPendingApprovalStudents([]);
        setStats({ totalStudents: 0, placedStudents: 0, approvalRequests: 0, capacityUsed: 0 });
      } finally {
        if (isCurrent) setDepartmentLoading(false);
      }
    };

    loadDepartments();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [leader, tab]);

  useEffect(() => {
    const draft = {};
    departments.forEach((dept) => {
      draft[dept.id] = Number(dept.capacity || 0);
    });
    setCapacityDraft(draft);
  }, [departments]);

  useEffect(() => {
    if (!leader || tab !== 'students') return undefined;

    const controller = new AbortController();
    let isCurrent = true;
    const loadPlacedStudents = async () => {
      setStudentsLoading(true);
      setStudentsError('');
      try {
        const response = await api.get('api/head/get_placed_students.php', {
          signal: controller.signal,
          withCredentials: true,
        });
        if (!response.data?.success || !Array.isArray(response.data.students)) {
          throw new Error(response.data?.message || 'Unable to load placed students.');
        }
        if (isCurrent) setPlacedStudents(response.data.students);
      } catch (error) {
        if (!isCurrent || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;
        setStudentsError(error.response?.data?.message || error.message || 'Unable to load placed students.');
      } finally {
        if (isCurrent) setStudentsLoading(false);
      }
    };

    loadPlacedStudents();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [leader, tab]);

  useEffect(() => {
    if (!leader || tab !== 'capacity') return undefined;

    const controller = new AbortController();
    let isCurrent = true;
    const loadDepartmentCapacity = async () => {
      setCapacityLoading(true);
      setCapacityError('');
      try {
        const response = await api.get('api/head/get_department_capacity.php', {
          signal: controller.signal,
          withCredentials: true,
        });
        if (!response.data?.success || !response.data.department) {
          throw new Error(response.data?.message || 'Unable to load department capacity.');
        }
        if (!isCurrent) return;
        const assignedDepartment = normalizeDepartment(response.data.department);
        setDepartment(assignedDepartment);
        setDepartments([assignedDepartment]);
      } catch (error) {
        if (!isCurrent || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;
        setCapacityError(error.response?.data?.message || error.message || 'Unable to load department capacity.');
      } finally {
        if (isCurrent) setCapacityLoading(false);
      }
    };

    loadDepartmentCapacity();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [leader, tab]);

  useEffect(() => () => {
    window.clearTimeout(capacityMessageTimeout.current);
  }, []);

  const saveCapacityPlan = async () => {
    setCapacitySaveMsg('');
    try {
      const updatedDepartments = departments.map((dept) => {
        const nextCapacity = Number(capacityDraft[dept.id] ?? dept.capacity ?? 0);
        const capacityChanged = nextCapacity !== Number(dept.capacity ?? 0);
        return {
          ...dept,
          capacity: nextCapacity,
          approval_status: capacityChanged ? 'pending' : dept.approval_status,
          available: Math.max(0, nextCapacity - Number(dept.assigned || 0)),
          college_name: dept.college_name || dept.faculty || 'General',
          stream: dept.stream || 'Natural',
          status: dept.status || 'active',
        };
      });

      const payload = {
        departments: updatedDepartments.filter((dept) => !dept.is_locked).map((dept) => ({
          id: dept.id,
          name: dept.name,
          capacity: Number(dept.capacity || 0),
          description: dept.description || '',
          stream: dept.stream || 'Natural',
          college_name: dept.college_name || 'General',
          status: dept.status || 'active',
          head_id: dept.head_id ?? null,
          created_at: dept.created_at || null,
        })),
      };

      try {
        const response = await api.post('api/common/departments_update.php', payload, {
          withCredentials: true,
        });
        if (!response.data?.success) {
          throw new Error(response.data?.message || 'Unable to save capacity plan.');
        }
        setDepartments(updatedDepartments);
        setDepartment(updatedDepartments[0] || department);
        setCapacitySaveMsg('Capacity plan saved successfully.');
        setCapacitySaveMsgType('success');
      } catch (error) {
        console.error('departments_update.php save failed:', error);
        setCapacitySaveMsg(error.response?.data?.message || error.message || 'Unable to save capacity plan.');
        setCapacitySaveMsgType('danger');
      }
    } catch (error) {
      console.error('saveCapacityPlan error:', error);
      setCapacitySaveMsg('Unable to save capacity plan.');
      setCapacitySaveMsgType('danger');
    }

    window.clearTimeout(capacityMessageTimeout.current);
    capacityMessageTimeout.current = window.setTimeout(() => {
      setCapacitySaveMsg('');
      capacityMessageTimeout.current = null;
    }, 3000);
  };

  const approvePlacement = async (placement) => {
    setApprovalSavingId(placement.placement_id);
    setApprovalError('');
    setApprovalErrorId(null);
    try {
      const response = await api.post('api/head/approve_placement.php', {
        placement_id: placement.placement_id,
        student_id: placement.student_id,
        admission_number: placement.id_number,
        department_id: department.id,
      }, {
        withCredentials: true,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to approve placement.');
      }

      const approvedPlacement = {
        ...placement,
        status: 'Approved',
        approved_at: new Date().toISOString(),
      };
      setPendingApprovalStudents((current) => current.filter(
        (student) => student.placement_id !== placement.placement_id
      ));
      setPlacedStudents((current) => [
        approvedPlacement,
        ...current.filter((student) => student.placement_id !== placement.placement_id),
      ]);
      setRecentPlacements((current) => [{
        student: placement.username || placement.id_number || `Student ${placement.student_id}`,
        program: placement.dept_name || department.name,
        status: 'Approved',
      }, ...current.filter((item) => item.student !== placement.username)].slice(0, 5));
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
          .filter((student) => ['approved', 'published', 'placed'].includes(String(student.status || '').trim().toLowerCase()))
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
    return (
      <div className="d-flex justify-content-center align-items-center gap-2 mt-5 text-muted" role="status">
        <span className="spinner-border spinner-border-sm" aria-hidden="true" />
        <span>Loading dashboard…</span>
      </div>
    );
  }

  return (
    <div className="head-dashboard container-fluid px-0 min-h-screen d-flex flex-column">
      <div className="row g-0 flex-grow-1">
        <Sidebar role="head" activeItem={tab} onSelect={setTab} />

        <main className="col-xl-10 p-5 main-section">
          {departmentLoading && (
            <div className="d-flex align-items-center gap-2 text-muted small mb-3" role="status">
              <span className="spinner-border spinner-border-sm" aria-hidden="true" />
              <span>Loading department data…</span>
            </div>
          )}
          {dashboardError && (
            <div className="alert alert-warning py-2" role="alert">
              {dashboardError}
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
                      <span className="summary-label">{t('Total Students')}</span>
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
                      <span className="summary-label">{t('Placed Students')}</span>
                      <h3 className="summary-value">{stats.placedStudents}</h3>
                      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <small style={{ color: '#198754', fontWeight: 'bold' }}>Click to view details →</small>
                        <button 
                          className="btn btn-sm btn-outline-success"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardDetailModal('placedStudents');
                            setCardDetailData(placedStudents
                              .filter((student) => ['approved', 'published', 'placed'].includes(String(student.status || '').trim().toLowerCase()))
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
                      <span className="summary-label">{t('Pending Approvals')}</span>
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
                      <span className="summary-label">{t('Capacity Utilized')}</span>
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
                        {recentPlacements.map(item => (
                          <div key={item.student} className="activity-item">
                            <div>
                              <div className="fw-semibold">{item.student}</div>
                              <div className="text-muted small">{item.program}</div>
                            </div>
                            <span className={`status-tag ${item.status === 'Confirmed' ? 'status-success' : item.status === 'Matched' ? 'status-primary' : 'status-warning'}`}>
                              {item.status}
                            </span>
                          </div>
                        ))}
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
                {capacityError && <div className="alert alert-warning py-2" role="alert">{capacityError}</div>}
                {capacityLoading && (
                  <div className="d-flex align-items-center gap-2 text-muted small mb-3" role="status">
                    <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                    <span>Loading department capacity…</span>
                  </div>
                )}

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
                                {dept.approval_status === 'reopened'
                                  ? <span className="badge bg-info text-dark mt-1">Unlocked for Editing</span>
                                  : dept.is_locked
                                    ? <span className="badge bg-success mt-1">Approved &amp; Locked by Registrar</span>
                                    : <small className="text-muted">{dept.status || 'active'} · Pending Registrar approval</small>}
                              </td>
                              <td>{dept.college_name}</td>
                              <td>{dept.stream}</td>
                              <td>{dept.assigned}</td>
                              <td style={{ minWidth: '130px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  className="form-control px-2 py-1 text-center fw-medium"
                                  style={{ width: '6rem', minWidth: '6rem' }}
                                  value={draftCapacity}
                                  onChange={(e) => {
                                    const nextValue = Number(e.target.value || 0);
                                    setCapacityDraft((prev) => ({ ...prev, [dept.id]: nextValue }));
                                  }}
                                  disabled={dept.is_locked}
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
                    disabled={departments.length === 0 || departments.every((dept) => dept.is_locked)}
                  >
                    Save Capacity Plan
                  </button>

                  <button
                    className="btn btn-outline-secondary"
                    disabled={departments.length === 0 || departments.every((dept) => dept.is_locked)}
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
                {studentsError && <div className="alert alert-warning py-2" role="alert">{studentsError}</div>}
                {studentsLoading && (
                  <div className="d-flex align-items-center gap-2 text-muted small mb-3" role="status">
                    <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                    <span>Loading placed students…</span>
                  </div>
                )}
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
                          const approved = ['approved', 'published', 'placed'].includes(String(student.status || '').toLowerCase());

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
                              <td>{student.choice_rank ? <span className="badge badge-choice">Choice {student.choice_rank}</span> : '—'}</td>
                              <td><span className={`badge ${hasDisability ? 'badge-disability' : 'bg-secondary'}`}>{hasDisability ? 'Yes' : 'No'}</span></td>
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
            <Reports leader={leader} department={department} students={placedStudents} />
          )}

        </main>
      </div>
    </div>
  );
};

export default HeadDashboard;
