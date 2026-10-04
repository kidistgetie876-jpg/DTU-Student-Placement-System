import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';
import StudentRegistration from './StudentRegistration';
import BulkUploadModal from '../../components/common/BulkUploadModal.jsx';
import MissingScoresForm from './MissingScoresForm.jsx';
import '../admin/AdminDashboard.css';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dtuLogo from '../../assets/images6.jpg';
import OfficialPrintLetterhead from '../../components/common/OfficialPrintLetterhead.jsx';
import { FaTrash } from 'react-icons/fa';
import { FiCalendar, FiToggleRight } from 'react-icons/fi';

export const parseYesNo = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  return ['yes', 'y', 'true', '1', 'on'].includes(normalized);
};

const calculateCumulativeScore = (student, rules) => {
  const gpa = Number(student.gpa ?? student.cgpa ?? 0);
  const grade12 = Number(student.grade12 ?? student.grade_12_result ?? 0);
  const coc = Number(student.coc ?? student.coc_result ?? 0);
  const normalizedScores = {
    gpaWeight: Math.min(100, Math.max(0, (gpa <= 4 ? gpa / 4 : gpa / 100) * 100)),
    grade12Weight: Math.min(100, Math.max(0, grade12)),
    cocWeight: Math.min(100, Math.max(0, (coc / 30) * 100)),
    genderWeight: String(student.gender || '').toLowerCase() === 'female' ? 100 : 0,
    disabilityWeight: parseYesNo(student.disability ?? student.hasDisability) ? 100 : 0,
    minorityWeight: parseYesNo(student.minority ?? student.isMinority) ? 100 : 0,
  };
  const totalWeight = Object.keys(normalizedScores).reduce(
    (total, key) => total + Number(rules[key] || 0),
    0
  );
  if (totalWeight <= 0) return 0;

  const weightedScore = Object.entries(normalizedScores).reduce(
    (total, [key, score]) => total + score * Number(rules[key] || 0),
    0
  );
  return Math.round(Math.min(100, Math.max(0, weightedScore / totalWeight)) * 100) / 100;
};

export const filterStudentIdsForPlacement = (studentRecords, selectedStudentIds) => {
  if (!Array.isArray(studentRecords)) return [];

  if (!Array.isArray(selectedStudentIds) || selectedStudentIds.length === 0) {
    return studentRecords;
  }

  const selectedSet = new Set(selectedStudentIds.map((id) => String(id)));
  return studentRecords.filter((student) => selectedSet.has(String(student?.id)));
};

const hasPlacementResult = (student) => {
  if (!student) return false;

  const status = String(student.status || student.placement_status || '').trim();
  const result = student.placementResult ?? student.placement_result ?? student.result ?? student.placement;

  return /placed|approved/i.test(status)
    || (result !== null && result !== undefined && result !== '' && result !== false);
};

const emptyDepartments = [];
const registrarAnnouncementPublisher = 'Office of the University Registrar';
const emptyAnnouncementDraft = {
  title: '',
  category: 'Notice',
  priority: 'Normal',
  deadline: '',
  content: '',
};
const defaultPlacementDates = {
  submissionStart: '2026-10-01',
  submissionDeadline: '2026-10-11',
  processingStart: '2026-08-16',
  processingEnd: '2026-08-24',
  resultsDate: '2026-08-27',
  appealStart: '2026-08-27',
  appealEnd: '2026-08-30',
};
const placementDateFields = [
  ['submissionStart', 'Preference Submission Start Date'],
  ['submissionDeadline', 'Preference Submission Deadline'],
  ['processingStart', 'Placement Processing Start Date'],
  ['processingEnd', 'Placement Processing End Date'],
  ['resultsDate', 'Results Announcement Date'],
  ['appealStart', 'Appeal Window Start Date'],
  ['appealEnd', 'Appeal Window End Date'],
];

const downloadCsv = (filename, headers, rows) => {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  XLSX.writeFile(workbook, filename, { bookType: 'csv' });
};

const downloadExcel = (filename, headers, rows) => {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  XLSX.writeFile(workbook, filename, { bookType: 'xlsx' });
};

const loadDtuLogoData = () => new Promise((resolve) => {
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

const getOfficialRegistrarTitle = (title) => ({
  'student information': 'OFFICIAL STUDENT INFORMATION ROSTER',
  'student choice matrix': 'OFFICIAL STUDENT CHOICE MATRIX',
  'placement results': 'OFFICIAL STUDENT PLACEMENT RESULTS',
  'assigned students': 'OFFICIAL ASSIGNED STUDENT PLACEMENTS',
  'unassigned students': 'OFFICIAL UNASSIGNED STUDENT PLACEMENTS',
}[title.toLowerCase()] || `OFFICIAL ${title.toUpperCase()}`);

const downloadWord = async (filename, title, headers, rows) => {
  const escapeHtml = (value) => String(value ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  const tableRows = rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join('')}</tr>`).join('');
  const tableHeaders = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const logoData = await loadDtuLogoData();
  const metadata = `Academic Year: 2016 E.C. / 2026 G.C. | Generated on: ${new Date().toLocaleDateString()}`;
  const documentContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;color:#333}.letterhead{display:flex;align-items:center;gap:18px;border-bottom:3px solid #f4c95d;padding-bottom:12px;margin-bottom:18px}.letterhead img{width:76px;height:76px;object-fit:contain}.letterhead h1{margin:0;color:#0a2d6d;font-size:20px}.letterhead h2{margin:5px 0;color:#333;font-size:14px}.letterhead h3{margin:4px 0;color:#0a2d6d;font-size:12px}.letterhead small{color:#666}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#0a2d6d;color:#fff}.signoff{display:flex;justify-content:space-between;align-items:flex-start;margin-top:28px}.stamp{width:150px;height:76px;border:1px solid #777;display:flex;align-items:center;justify-content:center;text-align:center}</style></head><body><header class="letterhead">${logoData ? `<img src="${escapeHtml(logoData)}" alt="Debre Tabor University seal">` : ''}<div><h1>DEBRE TABOR UNIVERSITY</h1><h2>OFFICE OF THE UNIVERSITY REGISTRAR</h2><h3>${escapeHtml(getOfficialRegistrarTitle(title))}</h3><small>${escapeHtml(metadata)}</small></div></header><table><thead><tr>${tableHeaders}</tr></thead><tbody>${tableRows}</tbody></table><footer class="signoff"><div>Approved by: University Registrar<br><br>Signature: ____________________ &nbsp; Date: ______________</div><div class="stamp">Official Registrar Seal / Stamp</div></footer></body></html>`;
  const blob = new Blob([documentContent], { type: 'application/msword' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

const downloadPdf = async (filename, title, headers, rows) => {
  const doc = new jsPDF({ orientation: headers.length > 8 ? 'landscape' : 'portrait' });
  const pageWidth = doc.internal.pageSize.width;
  const logoData = await loadDtuLogoData();
  if (logoData) doc.addImage(logoData, 'JPEG', 14, 8, 24, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(10, 45, 109);
  doc.text('DEBRE TABOR UNIVERSITY', 42, 14);
  doc.setFontSize(11);
  doc.setTextColor(51, 51, 51);
  doc.text('OFFICE OF THE UNIVERSITY REGISTRAR', 42, 20);
  doc.setFontSize(10);
  doc.setTextColor(10, 45, 109);
  const reportTitle = getOfficialRegistrarTitle(title);
  doc.text(doc.splitTextToSize(reportTitle, pageWidth - 56), 42, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  doc.text(`Academic Year: 2016 E.C. / 2026 G.C. | Generated on: ${new Date().toLocaleDateString()}`, 42, 32);
  doc.setDrawColor(244, 201, 93);
  doc.setLineWidth(1);
  doc.line(14, 35, pageWidth - 14, 35);

  autoTable(doc, {
    head: [headers],
    body: rows.map((row, index) => headers.map((header) => header === '#' ? index + 1 : row[header] ?? '-')),
    startY: 39,
    styles: { fontSize: headers.length > 8 ? 7 : 9 },
    headStyles: { fillColor: [10, 45, 109], textColor: [255, 255, 255], fontStyle: 'bold' },
  });

  let signoffY = doc.lastAutoTable.finalY + 14;
  if (signoffY + 24 > doc.internal.pageSize.height - 10) {
    doc.addPage();
    signoffY = 24;
  }
  doc.setDrawColor(210, 215, 222);
  doc.setLineWidth(0.4);
  doc.line(14, signoffY - 5, pageWidth - 14, signoffY - 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 51, 51);
  doc.text('Approved by: University Registrar', 14, signoffY);
  doc.text('Signature: ____________________  Date: ______________', 14, signoffY + 8);
  doc.rect(pageWidth - 80, signoffY - 6, 66, 25);
  doc.text(doc.splitTextToSize('Official Registrar Seal / Stamp', 60), pageWidth - 77, signoffY + 4);
  doc.save(filename);
};

export const exportStudentInformation = (students, format = 'csv') => {
  const headers = [' Student ID', 'First Name', 'Last Name', 'Username', 'GPA', 'G12 Result', 'COC', 'Gender', 'Disability', 'Minority', 'Cumulative Score', 'Department', 'Status'];
  const rows = students.map((student) => ({
    ID: student.id_number || student.id,
    'First Name': student.first_name || '',
    'Last Name': student.last_name || '',
    Username: student.username || '',
    GPA: student.cgpa ?? '',
    'G12 Result': student.g12 ?? '',
    COC: student.coc ?? '',
    Gender: student.gender || '',
    Disability: parseYesNo(student.hasDisability ?? student.disability ?? student.specialSupport) ? 'Yes' : 'No',
    Minority: parseYesNo(student.minority ?? student.isMinority ?? student.minorityStatus) ? 'Yes' : 'No',
    'Cumulative Score': student.cumulativeScore ?? '',
    Department: student.department || '',
    Status: student.status || '',
  }));

  if (format === 'pdf') {
    downloadPdf('student-information.pdf', 'Student Information', headers, rows);
  } else if (format === 'excel') {
    downloadExcel('student-information.xlsx', headers, rows);
  } else if (format === 'word') {
    downloadWord('student-information.doc', 'Student Information', headers, rows);
  } else {
    downloadCsv('student-information.csv', headers, rows);
  }
};

export const exportChoiceMatrix = (students, format = 'csv') => {
  const maxChoicesCount = students.length > 0
    ? Math.max(...students.map((student) => Math.max(student.prioritySlots?.length || 0, student.choices?.length || 0)), 1)
    : 5;
  const choiceHeaders = Array.from({ length: maxChoicesCount }, (_, index) => `Choice ${index + 1}`);
  const headers = ['Student ID', 'Student Name', 'Status', ...choiceHeaders];
  const rows = students.map((student) => {
    const row = {
      'Student ID': student.id_number || student.id || '',
      'Student Name': student.name || '',
      Status: student.status || '',
    };
    choiceHeaders.forEach((header, index) => {
      row[header] = student.prioritySlots?.[index] || '-';
    });
    return row;
  });

  if (format === 'pdf') {
    downloadPdf('student-choice-matrix.pdf', 'Student Choice Matrix', headers, rows);
  } else if (format === 'excel') {
    downloadExcel('student-choice-matrix.xlsx', headers, rows);
  } else if (format === 'word') {
    downloadWord('student-choice-matrix.doc', 'Student Choice Matrix', headers, rows);
  } else {
    downloadCsv('student-choice-matrix.csv', headers, rows);
  }
};

export const exportPlacementResults = (placements, format = 'csv', statusFilter = 'all') => {
  const headers = ['Student ID', 'Student Name', 'Merit Score', 'Department', 'College', 'Stream', 'Choice Rank', 'Status'];
  const filteredPlacements = placements.filter((placement) => {
    if (statusFilter === 'assigned') return placement.status === 'placed';
    if (statusFilter === 'unassigned') return placement.status !== 'placed';
    return true;
  });
  const rows = filteredPlacements.map((placement) => ({
    'Student ID': placement.id_number || placement.studentId,
    'Student Name': placement.studentName || '-',
    'Merit Score': placement.score ?? '-',
    Department: placement.department || '-',
    College: placement.college || '-',
    Stream: placement.stream || '-',
    'Choice Rank': placement.choiceRank || '-',
    Status: placement.status === 'placed' ? 'Assigned' : 'Unassigned',
  }));
  const label = statusFilter === 'all' ? 'placement-results' : `${statusFilter}-students`;
  const title = statusFilter === 'all' ? 'Placement Results' : `${statusFilter === 'assigned' ? 'Assigned' : 'Unassigned'} Students`;

  if (format === 'pdf') {
    downloadPdf(`${label}.pdf`, title, headers, rows);
  } else if (format === 'excel') {
    downloadExcel(`${label}.xlsx`, headers, rows);
  } else if (format === 'word') {
    downloadWord(`${label}.doc`, title, headers, rows);
  } else {
    downloadCsv(`${label}.csv`, headers, rows);
  }
};

const getDepartmentStream = (department) => {
  if (department?.stream && String(department.stream).trim()) {
    return String(department.stream).trim();
  }

  const college = String(department?.college || department?.college_name || department?.collegeName || '').toLowerCase().trim();
  const name = String(department?.name || '').toLowerCase();

  if (college.includes('business') || college.includes('economics')) return 'Business & Economics';
  if (college.includes('agric') || name.includes('agric')) return 'Agriculture';
  if (college.includes('medicine') || college.includes('health') || college.includes('nursing')) return 'Medicine & Health Sciences';
  if (college.includes('law') || name.includes('law')) return 'Law';
  if (college.includes('educ') || name.includes('education')) return 'Education';
  if (college.includes('social') || college.includes('humanit') || name.includes('history') || name.includes('english') || name.includes('social') || name.includes('psychology')) return 'Humanities';
  if (college.includes('engineer')) return 'Engineering';
  if (college.includes('natural') || college.includes('computational') || college.includes('environment') || /biology|chemistry|physics|mathematics|computer|statistics/.test(name)) return 'Natural Science';

  return 'Natural Science';
};

const normalizeDepartmentPayload = (payload) => {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.departments)
      ? payload.departments
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  return list.map((dept) => ({
    id: dept.id || dept.department_id || dept.department || dept.name?.toLowerCase().replace(/\s+/g, '-'),
    name: dept.name || dept.department || '',
    capacity: Number(dept.capacity ?? dept.seats ?? dept.quota ?? 0),
    college: dept.college || dept.college_name || dept.collegeName || dept.program_college || '',
    status: dept.status || 'active',
    stream: dept.stream || dept.academic_stream || dept.category || getDepartmentStream({
      name: dept.name || dept.department || '',
      college: dept.college || dept.college_name || dept.collegeName || dept.program_college || '',
    }),
  })).filter((dept) => dept.id && dept.name.trim());
};

const RegistrarDashboard = () => {
  const navigate = useNavigate();
  const [registrar, setRegistrar] = useState(null);
  const [tab, setActiveTab] = useState(() => {
    const savedTab = sessionStorage.getItem('registrarActiveTab');
    return savedTab || 'overview';
  });
  const setTab = (nextTab) => {
    setActiveTab(nextTab);
    sessionStorage.setItem('registrarActiveTab', nextTab);
  };
  const [summary, setSummary] = useState({
    departments: 0,
    activeStudents: 0,
    placementsCompleted: 0,
    unplacedStudents: 0,
    pendingApprovals: 0,
  });
  const [placementRules, setPlacementRules] = useState(() => {
    const defaultRules = {
      gpaWeight: 40,
      grade12Weight: 20,
      cocWeight: 30,
      genderWeight: 3,
      disabilityWeight: 3,
      minorityWeight: 4,
      minGpa: 1.75,
    };
    try {
      const raw = localStorage.getItem('placementRules');
      return raw ? { ...defaultRules, ...JSON.parse(raw), minGpa: Number(JSON.parse(raw).minGpa ?? 1.75) } : defaultRules;
    } catch (e) {
      return defaultRules;
    }
  });
  const [rulesSaved, setRulesSaved] = useState(false);
  const [placementDates, setPlacementDates] = useState(defaultPlacementDates);
  const [deadlineLoading, setDeadlineLoading] = useState(false);
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [deadlineError, setDeadlineError] = useState('');
  const [deadlineSuccess, setDeadlineSuccess] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [pendingResults, setPendingResults] = useState([]);
  const [pendingApprovalRows, setPendingApprovalRows] = useState([]);
  const [pendingApprovalLoading, setPendingApprovalLoading] = useState(false);
  const [publishingResults, setPublishingResults] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState('');
  const [placementError, setPlacementError] = useState('');
  const [departments, setDepartments] = useState(emptyDepartments);
  const [capacityDrafts, setCapacityDrafts] = useState({});
  const [departmentStatusDrafts, setDepartmentStatusDrafts] = useState({});
  const [selectedCollegeStatus, setSelectedCollegeStatus] = useState('');
  const [selectedDepartmentStatus, setSelectedDepartmentStatus] = useState('');
  const [capacitySaving, setCapacitySaving] = useState(false);
  const [capacityMessage, setCapacityMessage] = useState('');
  const [capacityError, setCapacityError] = useState('');
  const [departmentStatusSaving, setDepartmentStatusSaving] = useState(false);
  const [departmentStatusMessage, setDepartmentStatusMessage] = useState('');
  const [departmentStatusError, setDepartmentStatusError] = useState('');
  const [appeals, setAppeals] = useState([]);
  const [appealSavingId, setAppealSavingId] = useState(null);
  const [appealDeletingId, setAppealDeletingId] = useState(null);
  const [appealFeedback, setAppealFeedback] = useState(null);
  const [reportDistributionStatus, setReportDistributionStatus] = useState('');
  const [reportDistributionStatusType, setReportDistributionStatusType] = useState('danger');
  const [reportRecipient, setReportRecipient] = useState('student');
  const [selectedRecipientId, setSelectedRecipientId] = useState('all');
  const [selectedDeptId, setSelectedDeptId] = useState('all');
  const [reportFile, setReportFile] = useState(null);
  const [reportMessage, setReportMessage] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [adminReports, setAdminReports] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementsSaving, setAnnouncementsSaving] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState('');
  const [announcementsMessage, setAnnouncementsMessage] = useState('');
  const [announcementDraft, setAnnouncementDraft] = useState(emptyAnnouncementDraft);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);
  const [adminReportsLoading, setAdminReportsLoading] = useState(false);
  const [adminReportsError, setAdminReportsError] = useState('');
  const [adminReportsRefresh, setAdminReportsRefresh] = useState(0);
  const [sentReports, setSentReports] = useState([]);
  const [sentReportsLoading, setSentReportsLoading] = useState(false);
  const [sentReportsError, setSentReportsError] = useState('');
  const [deletingSentReportId, setDeletingSentReportId] = useState(null);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesError, setRulesError] = useState('');
  
  // State for card detail modals
  const [cardDetailModal, setCardDetailModal] = useState(null); // 'departments', 'activeStudents', 'placementsCompleted', 'unplacedStudents', 'pendingApprovals'
  const [cardDetailData, setCardDetailData] = useState([]);
  const [cardDetailLoading, setCardDetailLoading] = useState(false);
  const [studentRecords, setStudentRecords] = useState([]);
  const [streamFilter, setStreamFilter] = useState('all');
  const [deptSearch, setDeptSearch] = useState('');
  const [studentInfoLoading, setStudentInfoLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [choiceMatrixSearch, setChoiceMatrixSearch] = useState('');
  const [choiceDetailsStudent, setChoiceDetailsStudent] = useState(null);
  const [selectedStream, setSelectedStream] = useState('all');
  const [placementCollege, setPlacementCollege] = useState('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [missingScoresStudent, setMissingScoresStudent] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const reportFileInputRef = useRef(null);
  const PAGE_SIZE = 10;
  const [placementBatch, setPlacementBatch] = useState(() => {
    try {
      return localStorage.getItem('dtuPlacementBatch') || 'DTU-2026/1';
    } catch (error) {
      return 'DTU-2026/1';
    }
  });

  const fetchAnnouncements = useCallback(async () => {
    setAnnouncementsLoading(true);
    setAnnouncementsError('');
    try {
      const response = await api.get('api/common/announcements_api.php');
      const payload = response.data?.announcements ?? response.data ?? [];
      setAnnouncements(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setAnnouncements([]);
      setAnnouncementsError(error.response?.data?.message || 'Unable to load announcements.');
    } finally {
      setAnnouncementsLoading(false);
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    const response = await api.get('api/common/departments_api.php');
    if (response.data?.success === false) {
      throw new Error(response.data?.message || 'Unable to load departments.');
    }
    const normalized = normalizeDepartmentPayload(response.data ?? {});
    setDepartments(normalized);
    setCapacityDrafts(Object.fromEntries(normalized.map((department) => [String(department.id), department.capacity])));
    setDepartmentStatusDrafts(Object.fromEntries(normalized.map((department) => [String(department.id), String(department.status || 'active').toLowerCase()])));
    return normalized;
  }, []);

  const saveCapacityUpdates = async (updates) => {
    if (!updates.length) {
      setCapacityError('No department capacities are available to approve.');
      setCapacityMessage('');
      return;
    }
    if (updates.some((department) => String(department.capacity).trim() === '' || !Number.isInteger(Number(department.capacity)) || Number(department.capacity) < 0)) {
      setCapacityError('Capacities must be whole numbers greater than or equal to zero.');
      setCapacityMessage('');
      return;
    }

    setCapacitySaving(true);
    setCapacityError('');
    setCapacityMessage('');
    try {
      const response = await api.post('api/common/departments_update.php', {
        departments: updates,
        approve_capacities: true,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save department capacities.');
      }
      const refreshedDepartments = await fetchDepartments();
      const refreshedById = new Map(refreshedDepartments.map((department) => [String(department.id), Number(department.capacity)]));
      const hasUnpersistedUpdates = updates.some((department) => refreshedById.get(String(department.id)) !== Number(department.capacity));
      if (hasUnpersistedUpdates) {
        throw new Error('Some capacities were not updated. Refresh the page and try again.');
      }
      setCapacityMessage('Department capacities successfully approved and updated.');
    } catch (error) {
      setCapacityError(error.response?.data?.message || error.message || 'Unable to save department capacities.');
    } finally {
      setCapacitySaving(false);
    }
  };

  const approveAllDepartmentCapacities = () => {
    const updates = departments.map((department) => ({
      id: department.id,
      capacity: capacityDrafts[String(department.id)] ?? department.capacity,
    }));
    saveCapacityUpdates(updates);
  };

  const departmentStatusGroups = useMemo(() => {
    const groups = departments.reduce((currentGroups, department) => {
      const collegeName = String(department.college || department.college_name || department.collegeName || 'General').trim() || 'General';
      if (!currentGroups[collegeName]) currentGroups[collegeName] = [];
      currentGroups[collegeName].push(department);
      return currentGroups;
    }, {});

    return Object.entries(groups)
      .map(([collegeName, collegeDepartments]) => ({
        collegeName,
        departments: collegeDepartments,
        streamLabel: [...new Set(collegeDepartments.map((department) => getDepartmentStream(department)).filter(Boolean))].join(' / ') || 'Unspecified',
      }))
      .sort((left, right) => left.collegeName.localeCompare(right.collegeName));
  }, [departments]);

  useEffect(() => {
    if (departmentStatusGroups.length === 0) {
      setSelectedCollegeStatus('');
      setSelectedDepartmentStatus('');
      return;
    }

    setSelectedCollegeStatus((current) => (
      departmentStatusGroups.some((group) => group.collegeName === current)
        ? current
        : departmentStatusGroups[0].collegeName
    ));
  }, [departmentStatusGroups]);

  const selectedCollegeGroup = departmentStatusGroups.find((group) => group.collegeName === selectedCollegeStatus);
  const selectedCollegeDepartments = selectedCollegeGroup?.departments || emptyDepartments;
  const selectedDepartment = selectedCollegeDepartments.find((department) => String(department.id) === selectedDepartmentStatus);

  useEffect(() => {
    if (selectedCollegeDepartments.length === 0) {
      setSelectedDepartmentStatus('');
      return;
    }

    setSelectedDepartmentStatus((current) => (
      selectedCollegeDepartments.some((department) => String(department.id) === current)
        ? current
        : String(selectedCollegeDepartments[0].id)
    ));
  }, [selectedCollegeDepartments]);

  const collegeHasActiveDepartment = (collegeName) => {
    const collegeDepartments = departments.filter((department) => (
      String(department.college || department.college_name || department.collegeName || 'General').trim() === collegeName
    ));
    return collegeDepartments.some((department) => (
      String(departmentStatusDrafts[String(department.id)] ?? department.status ?? 'active').toLowerCase() === 'active'
    ));
  };

  const toggleEntireCollege = (collegeName) => {
    const nextStatus = collegeHasActiveDepartment(collegeName) ? 'inactive' : 'active';
    setDepartmentStatusDrafts((current) => ({
      ...current,
      ...Object.fromEntries(departments
        .filter((department) => (
          String(department.college || department.college_name || department.collegeName || 'General').trim() === collegeName
        ))
        .map((department) => [String(department.id), nextStatus])),
    }));
    setDepartmentStatusMessage('');
    setDepartmentStatusError('');
  };

  const toggleDepartmentStatus = (department) => {
    const departmentId = String(department.id);
    const currentStatus = departmentStatusDrafts[departmentId] ?? department.status ?? 'active';
    setDepartmentStatusDrafts((current) => ({
      ...current,
      [departmentId]: String(currentStatus).toLowerCase() === 'active' ? 'inactive' : 'active',
    }));
    setDepartmentStatusMessage('');
    setDepartmentStatusError('');
  };

  const saveDepartmentStatuses = async () => {
    const updates = departments.map((department) => ({
      id: department.id,
      capacity: Number(department.capacity ?? 0),
      status: departmentStatusDrafts[String(department.id)] ?? department.status ?? 'active',
    }));
    if (!updates.length) {
      setDepartmentStatusError('No department statuses are available to save.');
      setDepartmentStatusMessage('');
      return;
    }

    setDepartmentStatusSaving(true);
    setDepartmentStatusMessage('');
    setDepartmentStatusError('');
    try {
      const response = await api.post('api/common/departments_update.php', { departments: updates });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save department statuses.');
      }
      const statusesById = new Map(updates.map((department) => [String(department.id), department.status]));
      setDepartments((current) => current.map((department) => ({
        ...department,
        status: statusesById.get(String(department.id)) ?? department.status,
      })));
      setDepartmentStatusDrafts(Object.fromEntries(updates.map((department) => [String(department.id), department.status])));
      setDepartmentStatusMessage('✓ Department placement statuses updated successfully!');
    } catch (error) {
      setDepartmentStatusError(error.response?.data?.message || error.message || 'Unable to save department statuses.');
    } finally {
      setDepartmentStatusSaving(false);
    }
  };

  useEffect(() => {
    if (!registrar || tab !== 'announcements') return;
    fetchAnnouncements();
  }, [registrar, tab, fetchAnnouncements]);

  const resetAnnouncementDraft = () => {
    setAnnouncementDraft(emptyAnnouncementDraft);
    setEditingAnnouncementId(null);
  };

  const saveAnnouncement = async (event) => {
    event.preventDefault();
    setAnnouncementsSaving(true);
    setAnnouncementsError('');
    setAnnouncementsMessage('');
    const payload = {
      ...announcementDraft,
      publisher: registrarAnnouncementPublisher,
    };

    try {
      const response = editingAnnouncementId
        ? await api.put(`api/common/announcements_api.php?id=${encodeURIComponent(editingAnnouncementId)}`, payload)
        : await api.post('api/common/announcements_api.php', payload);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save announcement.');
      }
      await fetchAnnouncements();
      setAnnouncementsMessage(editingAnnouncementId ? 'Announcement updated.' : 'Announcement published.');
      resetAnnouncementDraft();
    } catch (error) {
      setAnnouncementsError(error.response?.data?.message || error.message || 'Unable to save announcement.');
    } finally {
      setAnnouncementsSaving(false);
    }
  };

  const editAnnouncement = (announcement) => {
    setAnnouncementDraft({
      title: announcement.title || '',
      category: announcement.category || 'Notice',
      priority: announcement.priority || 'Normal',
      deadline: announcement.deadline || '',
      content: announcement.content || announcement.message || '',
    });
    setEditingAnnouncementId(announcement.id);
    setAnnouncementsMessage('');
    setAnnouncementsError('');
  };

  const deleteAnnouncement = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    setAnnouncementsSaving(true);
    setAnnouncementsError('');
    setAnnouncementsMessage('');
    try {
      await api.delete(`api/common/announcements_api.php?id=${encodeURIComponent(id)}`);
      await fetchAnnouncements();
      if (editingAnnouncementId === id) resetAnnouncementDraft();
      setAnnouncementsMessage('Announcement deleted.');
    } catch (error) {
      setAnnouncementsError(error.response?.data?.message || 'Unable to delete announcement.');
    } finally {
      setAnnouncementsSaving(false);
    }
  };

  const needsAcademicScores = (student) => {
    const gpa = student?.gpa ?? student?.cgpa ?? null;
    const g12 = student?.g12 ?? student?.grade_12_result ?? null;
    const coc = student?.coc ?? student?.coc_result ?? null;

    const isMissing = (value) => value === null || value === undefined || value === '' || value === 'N/A' || value === 'NA';
    return isMissing(gpa) || isMissing(g12) || isMissing(coc);
  };

  useEffect(() => {
    const data = localStorage.getItem('user');
    if (!data) {
      navigate('/login');
      return;
    }

    try {
      const parsed = JSON.parse(data);
      if (parsed.role === 'registrar') {
        setRegistrar(parsed);
      } else {
        navigate('/login');
      }
    } catch (error) {
      localStorage.clear();
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    if (!registrar) return;

    const loadAppeals = async () => {
      try {
        const response = await api.get('api/student/submit_appeal.php');
        if (response.data?.success) {
          setAppeals(Array.isArray(response.data.appeals) ? response.data.appeals : []);
        }
      } catch (error) {
        console.error('Failed to load student appeals:', error);
      }
    };

    loadAppeals();
  }, [registrar]);

  useEffect(() => {
    if (!registrar || tab !== 'reports') return;

    let active = true;
    const loadAdminReports = async () => {
      setAdminReportsLoading(true);
      setAdminReportsError('');
      try {
        const response = await api.get('api/registrar/get_registrar_reports.php');
        if (!response.data?.success) {
          throw new Error(response.data?.message || 'Unable to load Admin messages.');
        }
        if (active) setAdminReports(Array.isArray(response.data.reports) ? response.data.reports : []);
      } catch (error) {
        if (active) {
          setAdminReports([]);
          setAdminReportsError(error.response?.data?.message || error.message || 'Unable to load Admin messages.');
        }
      } finally {
        if (active) setAdminReportsLoading(false);
      }
    };

    loadAdminReports();
    return () => { active = false; };
  }, [registrar, tab, adminReportsRefresh]);

  useEffect(() => {
    if (!registrar || tab !== 'reports') return;

    let active = true;
    const loadSentReports = async () => {
      setSentReportsLoading(true);
      setSentReportsError('');
      try {
        const response = await api.get('api/registrar/get_sent_reports.php');
        if (!response.data?.success) {
          throw new Error(response.data?.message || 'Unable to load sent report history.');
        }
        if (active) setSentReports(Array.isArray(response.data.reports) ? response.data.reports : []);
      } catch (error) {
        if (active) {
          setSentReports([]);
          setSentReportsError(error.response?.data?.message || error.message || 'Unable to load sent report history.');
        }
      } finally {
        if (active) setSentReportsLoading(false);
      }
    };

    loadSentReports();
    return () => { active = false; };
  }, [registrar, tab, adminReportsRefresh]);

  const markAdminReportRead = async (report) => {
    if (report.is_read) return;
    try {
      await api.post('api/registrar/mark_report_read.php', { report_id: report.id });
      setAdminReports((current) => current.map((item) => (
        item.id === report.id ? { ...item, is_read: 1 } : item
      )));
    } catch (error) {
      setAdminReportsError(error.response?.data?.message || 'Unable to mark the message as read.');
    }
  };

  const deleteSentReport = async (report) => {
    if (!window.confirm('Delete this sent report?')) return;

    setDeletingSentReportId(report.id);
    setSentReportsError('');
    try {
      const response = await api.post('api/registrar/delete_sent_report.php', { report_id: report.id });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to delete the sent report.');
      }
      setSentReports((current) => current.filter((item) => item.id !== report.id));
    } catch (error) {
      setSentReportsError(error.response?.data?.message || error.message || 'Unable to delete the sent report.');
    } finally {
      setDeletingSentReportId(null);
    }
  };

  useEffect(() => {
    if (!registrar) return;

    const loadPlacementRules = async () => {
      try {
        const response = await api.get('api/registrar/get_placement_settings.php');
        const settings = response.data || {};

        if (settings.id) {
          const loadedRules = {
            gpaWeight: Number(settings.gpa_weight ?? 40),
            grade12Weight: Number(settings.grade_12_weight ?? 20),
            cocWeight: Number(settings.coc_weight ?? 30),
            genderWeight: Number(settings.gender_weight ?? 3),
            disabilityWeight: Number(settings.disability_weight ?? 3),
            minorityWeight: Number(settings.minority_weight ?? 4),
            minGpa: Number(settings.min_gpa ?? 1.75),
          };

          setPlacementRules(loadedRules);
          localStorage.setItem('placementRules', JSON.stringify(loadedRules));
        }
      } catch (error) {
        console.error('Failed to load placement rules:', error);
      }
    };

    loadPlacementRules();
  }, [registrar]);

  useEffect(() => {
    if (!registrar || tab !== 'deadlines') return undefined;

    let isCurrent = true;
    const loadPlacementDates = async () => {
      setDeadlineLoading(true);
      setDeadlineError('');
      try {
        const response = await api.get('api/common/system_settings_api.php');
        if (!isCurrent) return;
        const savedDates = response.data?.settings?.placement || response.data?.placement || {};
        setPlacementDates((current) => ({ ...current, ...savedDates }));
      } catch (error) {
        if (isCurrent) {
          setDeadlineError(error.response?.data?.message || 'Unable to load the placement schedule.');
        }
      } finally {
        if (isCurrent) setDeadlineLoading(false);
      }
    };

    loadPlacementDates();
    return () => {
      isCurrent = false;
    };
  }, [registrar, tab]);

  const savePlacementDates = async (event) => {
    event.preventDefault();
    setDeadlineSaving(true);
    setDeadlineError('');
    setDeadlineSuccess('');
    try {
      const payload = {
        settings: {
          placement: {
            submissionStart: placementDates.submissionStart,
            submissionDeadline: placementDates.submissionDeadline,
            processingStart: placementDates.processingStart,
            processingEnd: placementDates.processingEnd,
            resultsDate: placementDates.resultsDate,
            appealStart: placementDates.appealStart,
            appealEnd: placementDates.appealEnd,
          },
        },
      };
      const response = await api.post('api/common/system_settings_api.php', payload);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save the placement schedule.');
      }

      const savedDates = response.data?.settings?.placement || placementDates;
      setPlacementDates((current) => ({ ...current, ...savedDates }));
      setDeadlineSuccess('✓ Placement schedule and deadlines updated successfully!');
      window.dispatchEvent(new Event('system-settings-updated'));
    } catch (error) {
      setDeadlineError(error.response?.data?.message || error.message || 'Unable to save the placement schedule.');
    } finally {
      setDeadlineSaving(false);
    }
  };

  const updateAppeal = async (appeal) => {
    setAppealSavingId(appeal.id);
    setAppealFeedback(null);
    try {
      const response = await api.post('api/student/submit_appeal.php', {
        action: 'update',
        appeal_id: appeal.id,
        status: appeal.status,
        response: appeal.response || '',
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to update appeal.');
      }
      setAppealFeedback({ id: appeal.id, type: 'success', message: 'Appeal response saved.' });
    } catch (error) {
      setAppealFeedback({ id: appeal.id, type: 'danger', message: error.response?.data?.message || error.message || 'Unable to update appeal.' });
    } finally {
      setAppealSavingId(null);
    }
  };

  const deleteAppeal = async (appeal) => {
    if (!window.confirm('Delete this appeal permanently?')) return;

    setAppealDeletingId(appeal.id);
    setAppealFeedback(null);
    try {
      const response = await api.post('api/student/submit_appeal.php', {
        action: 'delete',
        appeal_id: appeal.id,
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to delete appeal.');
      }

      setAppeals((current) => current.filter((item) => item.id !== appeal.id));
    } catch (error) {
      setAppealFeedback({ id: appeal.id, type: 'danger', message: error.response?.data?.message || error.message || 'Unable to delete appeal.' });
    } finally {
      setAppealDeletingId(null);
    }
  };

  // Card detail handlers - fetch data when cards are clicked
  const handleCardClick = async (cardType) => {
    setCardDetailModal(cardType);
    setCardDetailLoading(true);
    setCardDetailData([]);

    try {
      let data = [];
      
      if (cardType === 'departments') {
        // Fetch all departments
        data = departments.map((dept, idx) => ({
          id: idx + 1,
          name: dept.name,
          capacity: dept.capacity,
          college: dept.college,
          stream: dept.stream
        }));
      } 
      else if (cardType === 'activeStudents') {
        // Show active students
        data = studentRecords
          .filter((student) => student.status !== 'Rejected' && student.status !== 'Inactive')
          .map((student) => ({
            id: student.id,
            id_number: student.id_number || student.id,
            name: student.name,
            email: student.email,
            gpa: student.gpa || student.cgpa || '0.00',
            stream: student.stream || 'Natural',
            status: student.status
          }));
      } 
      else if (cardType === 'placementsCompleted') {
        // Show placed students
        data = studentRecords
          .filter((student) => /placed|approved/i.test(student.status))
          .slice(0, 20)
          .map((student) => ({
            id: student.id,
            name: student.name,
            email: student.email,
            status: student.status,
            department: student.department,
            cumulativeScore: student.cumulativeScore
          }));
      } 
      else if (cardType === 'unplacedStudents') {
        const pendingResponse = await api.get('api/registrar/get_pending_results.php');
        if (!pendingResponse.data?.success) {
          throw new Error(pendingResponse.data?.message || 'Unable to load pending placement results.');
        }
        const pendingResults = Array.isArray(pendingResponse.data.results) ? pendingResponse.data.results : [];
        const pendingStudentIds = new Set(pendingResults.map((result) => String(result.student_id)));

        data = studentRecords
          .filter((student) => !hasPlacementResult(student) && !pendingStudentIds.has(String(student.id)))
          .map((student) => ({
            id: student.id,
            id_number: student.id_number || student.id,
            name: student.name,
            email: student.email,
            stream: student.stream || 'Natural',
            status: student.status,
          }));
      }
      else if (cardType === 'pendingApprovals') {
        const response = await api.get('api/registrar/get_pending_results.php');
        if (!response.data?.success) {
          throw new Error(response.data?.message || 'Unable to load pending placement results.');
        }
        data = (Array.isArray(response.data.results) ? response.data.results : []).map((result) => ({
          ...result,
          name: [result.first_name, result.last_name].filter(Boolean).join(' ') || 'Not available',
        }));
      }

      setCardDetailData(data);
    } catch (error) {
      console.error('Error fetching card details:', error);
      setCardDetailData([]);
    } finally {
      setCardDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments().catch(() => {
      // Keep the dashboard available when the departments API is offline.
    });
  }, [fetchDepartments]);

  useEffect(() => {
    if (!registrar || tab !== 'approve-results') return;

    const loadPendingApprovalRows = async () => {
      setPendingApprovalLoading(true);

      try {
        const response = await api.get('api/registrar/get_pending_results.php');
        const payload = response.data || {};

        if (!payload.success) {
          throw new Error(payload.message || 'Unable to load pending placement results.');
        }

        setPendingApprovalRows(Array.isArray(payload.results) ? payload.results : []);
      } catch (error) {
        setPlacementError(error?.response?.data?.message || error?.message || 'Unable to load pending placement results.');
        setPendingApprovalRows([]);
      } finally {
        setPendingApprovalLoading(false);
      }
    };

    loadPendingApprovalRows();
  }, [registrar, tab]);

  useEffect(() => {
    try {
      localStorage.setItem('dtuPlacementBatch', placementBatch);
    } catch (error) {
      // Ignore localStorage write issues in restricted environments.
    }
  }, [placementBatch]);

  useEffect(() => {
    const fetchStudentRecords = async () => {
      setStudentInfoLoading(true);

      try {
        const usersResponse = await api.get('api/admin/users_api.php');
        const usersPayload = Array.isArray(usersResponse.data)
          ? usersResponse.data
          : Array.isArray(usersResponse.data?.users)
            ? usersResponse.data.users
            : Array.isArray(usersResponse.data?.data)
              ? usersResponse.data.data
              : [];

        const studentUsers = usersPayload.filter((user) => {
          const role = String(user?.role || '').trim().toLowerCase();
          return role === 'student';
        });

        const records = await Promise.all(
          studentUsers.map(async (user) => {
            const email = user?.email || '';
            let profile = {};

            if (email) {
              try {
                const profileResponse = await api.get(`api/student/student_profile.php?email=${encodeURIComponent(email)}`);
                profile = profileResponse.data?.student || profileResponse.data?.data || {};
              } catch (error) {
                profile = {};
              }
            }

            // ===== DATABASE COLUMN MAPPING =====
            // Map all fields to their exact MySQL column names
            const cgpaValue = Number(profile?.cgpa ?? profile?.gpa ?? user?.cgpa ?? 0);
            const numericCgpa = Number.isFinite(cgpaValue) ? cgpaValue : 0;

            // Grade 12 Result - Map from database column
            const g12 = profile?.grade_12_result ?? profile?.g12 ?? profile?.g12_score ?? null;

            // Certificate of Competence Result - Map from database column (numeric score)
            const coc = profile?.coc_result ?? profile?.coc ?? profile?.certificate_of_competence ?? null;
            // Ensure COC is a number if it exists
            const cocValue = coc ? Number(coc) : null;

            // Additional Student Attributes
            const gender = (profile?.gender || user?.gender || '').toString();
            const hasDisability = parseYesNo(profile?.disability ?? profile?.has_disability ?? profile?.hasDisability ?? profile?.specialSupport);
            const minority = parseYesNo(profile?.minority ?? profile?.is_minority ?? profile?.isMinority);

            const cumulativeScore = calculateCumulativeScore({
              gpa: numericCgpa,
              grade12: g12,
              coc: cocValue,
              gender,
              disability: hasDisability,
              minority,
            }, placementRules);

            // ===== FETCH STUDENT PREFERENCES =====
            let choices = [];
            const studentId = user?.id ?? user?.student_id ?? profile?.student_id ?? profile?.id ?? null;
            if (studentId) {
              try {
                const preferencesResponse = await api.get(`api/student/student_preferences.php?student_id=${encodeURIComponent(studentId)}`);
                const preferencesPayload = preferencesResponse.data || {};
                const preferences = Array.isArray(preferencesPayload.choices)
                  ? preferencesPayload.choices
                  : Array.isArray(preferencesPayload.data)
                    ? preferencesPayload.data
                    : Array.isArray(preferencesPayload)
                      ? preferencesPayload
                      : [];

                choices = preferences
                  .map((preference, index) => {
                    const name = preference?.department || preference?.name || preference?.dept_name || preference?.department_name || preference?.label || '';
                    if (!name) return null;
                    return {
                      priority: Number(preference?.priority ?? preference?.rank ?? index + 1),
                      department: name,
                      college: preference?.college_name || preference?.collegeName || preference?.college || '',
                      stream: preference?.stream || '',
                    };
                  })
                  .filter(Boolean)
                  .sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99));
              } catch (error) {
                choices = [];
              }
            }

            // ===== BUILD STUDENT RECORD OBJECT =====
            return {
              id: user?.id ?? user?.student_id ?? profile?.student_id ?? profile?.id ?? null,
              id_number: user?.id_number || profile?.id_number || `DTU16R${user?.id}`,
              first_name: user?.first_name || profile?.first_name || '',
              last_name: user?.last_name || profile?.last_name || '',
              username: user?.username || profile?.username || '',
              name: profile?.fullname || profile?.full_name || profile?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || '',
              email: profile?.email || user?.email || '',
              phone: profile?.phone || profile?.phone_number || profile?.contact || user?.phone_number || '',
              gpa: numericCgpa.toFixed(2),
              cgpa: numericCgpa.toFixed(2),
              stream: profile?.stream || user?.stream || 'Natural',
              g12: g12,
              coc: cocValue,
              gender,
              hasDisability: hasDisability,
              minority: minority,
              cumulativeScore: cumulativeScore,
              placement_result_score: profile?.placement_result_score ?? null,
              department: profile?.placement_result_department || profile?.department || profile?.program || profile?.department_name || user?.department || '',
              status: profile?.placement_result_department
                ? (profile?.placement_result_status === 'Approved' ? 'Approved' : 'Placed')
                : (profile?.placement_status || profile?.status || profile?.placementStatus || 'Pending'),
              placementResult: profile?.placement_result_department || profile?.placement_result || profile?.placementResult || profile?.placement || profile?.result || null,
              choices,
            };
          })
        );

        setStudentRecords(records.filter((record) => record.id !== null && record.name.trim()));
      } catch (error) {
        console.error('Failed to fetch student records:', error);
        setStudentRecords([]);
      } finally {
        setStudentInfoLoading(false);
      }
    };

    if (registrar) {
      fetchStudentRecords();
    }
  }, [placementRules, registrar]);

  // Refresh overview counts from the database-backed dashboard API when Overview opens.
  useEffect(() => {
    const fetchDashboardOverview = async () => {
      try {
        const response = await api.get('api/common/dashboard_overview_api.php');
        
        if (response.data?.success && response.data?.data) {
          const { departments, activeStudents, placementsCompleted, unplacedStudents, pendingApprovals } = response.data.data;
          setSummary({
            departments: Number(departments ?? 0),
            activeStudents: Number(activeStudents ?? 0),
            placementsCompleted: Number(placementsCompleted ?? 0),
            unplacedStudents: Number(unplacedStudents ?? 0),
            pendingApprovals: Number(pendingApprovals ?? 0),
          });
        }
      } catch (error) {
        console.error('Failed to fetch dashboard overview:', error);
      }
    };

    if (registrar && tab === 'overview') {
      fetchDashboardOverview();
    }
  }, [registrar, tab]);

  const departmentPreferenceCounts = studentRecords.reduce((accumulator, student) => {
    (student.choices || []).forEach((choice) => {
      const departmentName = String(choice.department || '').trim();
      if (!departmentName) return;
      accumulator[departmentName] = (accumulator[departmentName] || 0) + 1;
    });
    return accumulator;
  }, {});

  const maxChoicesCount = useMemo(() => {
    const counts = studentRecords.map((student) => (student.choices || []).length);
    return counts.length > 0 ? Math.max(...counts, 1) : 5;
  }, [studentRecords]);

  const choiceMatrixRows = studentRecords
    .map((student) => {
      const prioritySlots = Array.from({ length: maxChoicesCount }, (_, index) => {
        const preferredChoice = (student.choices || []).find((choice) => Number(choice.priority || 0) === index + 1);
        return preferredChoice?.department || '—';
      });

      return {
        ...student,
        prioritySlots,
      };
    })
    .filter((student) => {
      const term = choiceMatrixSearch.trim().toLowerCase();
      if (!term) return true;

      const searchableText = [
        student.name,
        student.email,
        student.department,
        student.status,
        ...student.prioritySlots,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(term);
    });

  const filteredStudents = studentRecords.filter((student) => {
    const searchTerm = studentSearch.trim().toLowerCase();
    if (!searchTerm) return true;

    const searchableText = [
      student.name,
      student.email,
      student.department,
      student.status,
      student.id,
      student.gender,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(searchTerm);
  });

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const latestPlacementRun = pendingResults[0] || null;

  const handleReportFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    if (!selectedFile) return;

    const fileName = selectedFile.name.toLowerCase();
    const supportedFile = /\.(pdf|xls|xlsx|doc|docx)$/.test(fileName);
    if (!supportedFile) {
      setReportFile(null);
      setReportDistributionStatus('Please select a PDF, Excel, or Word file.');
      setReportDistributionStatusType('danger');
      event.target.value = '';
      return;
    }

    setReportFile(selectedFile);
    setReportDistributionStatus('');
    setReportDistributionStatusType('danger');
  };

  const sendReportFile = async () => {
    setReportDistributionStatus('');
    if (!reportMessage.trim()) {
      setReportDistributionStatus('Write a message before sending. The file attachment is optional.');
      setReportDistributionStatusType('danger');
      return;
    }

    const formData = new FormData();
    formData.append('recipient', reportRecipient);
    formData.append('target_id', selectedRecipientId);
    formData.append('dept_id', selectedDeptId);
    formData.append('message', reportMessage.trim());
    if (reportFile) formData.append('report_file', reportFile);
    if (registrar?.id) formData.append('sender_id', registrar.id);

    setReportSending(true);
    try {
      const response = await api.post('api/common/send_report.php', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to send the report.');
      }

      const recipientLabel = reportRecipient === 'student' ? 'student' : reportRecipient === 'head' ? 'department head' : 'admin';
      setReportDistributionStatus(`✓ Report sent to ${recipientLabel}.`);
      setReportDistributionStatusType('success');
      setReportFile(null);
      setReportMessage('');
      if (reportFileInputRef.current) reportFileInputRef.current.value = '';
    } catch (error) {
      setReportDistributionStatus(error.response?.data?.message || error.message || 'Unable to send the report.');
      setReportDistributionStatusType('danger');
    } finally {
      setReportSending(false);
    }
  };

  const streamOptions = ['Natural Science', 'Social Science'];

  const matchesSelectedStream = (department) => {
    if (selectedStream === 'all') return true;

    const streamName = String(getDepartmentStream(department) || '').toLowerCase();
    const collegeName = String(department?.college || '').toLowerCase();

    if (selectedStream === 'Natural Science') {
      return (
        streamName === 'natural science' ||
        streamName.includes('natural') ||
        collegeName.includes('natural') ||
        collegeName.includes('environment')
      );
    }

    if (selectedStream === 'Social Science') {
      return (
        streamName === 'humanities' ||
        streamName === 'social science' ||
        streamName.includes('social') ||
        streamName.includes('human') ||
        collegeName.includes('social') ||
        collegeName.includes('human') ||
        collegeName.includes('business') ||
        collegeName.includes('economics') ||
        collegeName.includes('law') ||
        collegeName.includes('education')
      );
    }

    return true;
  };

  const placementCollegeOptions = Array.from(
    new Set(
      departments
        .filter((dept) => matchesSelectedStream(dept))
        .map((dept) => dept.college)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const placementCandidates = studentRecords.filter((student) => {
    if (hasPlacementResult(student)) {
      return false;
    }

    const studentChoices = Array.isArray(student.choices) ? student.choices : [];
    const departmentMatch = departments.some((dept) => {
      const matchesStream = matchesSelectedStream(dept);
      const matchesCollege = placementCollege === 'all' || String(dept.college || '').toLowerCase() === String(placementCollege).toLowerCase();
      const hasPreference = studentChoices.some((choice) => {
        const choiceDepartment = String(choice.department || '').toLowerCase().trim();
        const matchesChoiceName = choiceDepartment === String(dept.name || '').toLowerCase().trim();
        const matchesChoiceId = choiceDepartment === String(dept.id || '').toLowerCase().trim();
        return matchesChoiceName || matchesChoiceId;
      });

      return hasPreference && matchesStream && matchesCollege;
    });

    if (!departmentMatch) {
      return false;
    }

    return true;
  });

  const savePlacementRules = async (event) => {
    event.preventDefault();
    setRulesSaving(true);
    setRulesError('');

    try {
      const response = await api.post('api/registrar/update_placement_settings.php', {
        gpa_weight: placementRules.gpaWeight,
        grade_12_weight: placementRules.grade12Weight,
        coc_weight: placementRules.cocWeight,
        gender_weight: placementRules.genderWeight,
        disability_weight: placementRules.disabilityWeight,
        minority_weight: placementRules.minorityWeight,
        min_gpa: placementRules.minGpa,
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save placement rules.');
      }

      localStorage.setItem('placementRules', JSON.stringify(placementRules));
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save placement rules:', error);
      setRulesError(error.response?.data?.message || error.message || 'Unable to save placement rules.');
    } finally {
      setRulesSaving(false);
    }
  };
  useEffect(() => {
    setPlacementCollege('all');
  }, [selectedStream]);

  useEffect(() => {
    if (!studentRecords.length) {
      setSelectedStudentIds([]);
      return;
    }

    setSelectedStudentIds((prev) => prev.filter((id) => studentRecords.some((student) => String(student.id) === String(id))));
  }, [studentRecords]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [studentRecords.length, studentSearch]);

  if (!registrar) return <div className="text-center mt-5">Loading...</div>;

  return (
    <div className="admin-dashboard container-fluid px-0">
      <OfficialPrintLetterhead
        office="OFFICE OF THE UNIVERSITY REGISTRAR"
        title="OFFICIAL UNIVERSITY REGISTRAR DOCUMENT"
        metadata={`Academic Year: 2016 E.C. / 2026 G.C. | Generated on: ${new Date().toLocaleDateString()}`}
      />
      <div className="row g-0">
        <aside className="col-md-2 sidebar bg-dark text-white d-flex flex-column p-4">
          <div className="sidebar-brand mb-5">
            <h4 className="fw-bold text-white mb-1">Registrar Portal</h4>
            <p className="text-white-50 small mb-0">Review placements, departments, and approvals.</p>
          </div>

          <nav className="nav flex-column gap-2 mb-4">
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'overview' ? 'active' : ''}`}
              onClick={() => setTab('overview')}
            >
              Overview
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'student-info' ? 'active' : ''}`}
              onClick={() => setTab('student-info')}
            >
              Student Information
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'choice-matrix' ? 'active' : ''}`}
              onClick={() => setTab('choice-matrix')}
            >
              Student Choice Matrix
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'capacity' ? 'active' : ''}`}
              onClick={() => setTab('capacity')}
            >
              Department Capacity
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'department-status' ? 'active' : ''}`}
              onClick={() => setTab('department-status')}
            >
              <FiToggleRight className="me-2" aria-hidden="true" />
              Department Status
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'placement-rules' ? 'active' : ''}`}
              onClick={() => setTab('placement-rules')}
            >
              Placement Rules
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'deadlines' ? 'active' : ''}`}
              onClick={() => setTab('deadlines')}
            >
              <FiCalendar className="me-2" aria-hidden="true" />
              Placement Deadlines
            </button>
            {/* <button
              className={`btn dashboard-nav-btn text-start ${tab === 'placements' ? 'active' : ''}`}
              onClick={() => setTab('placements')}
            >
              Placements
            </button> */}
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'run-placement' ? 'active' : ''}`}
              onClick={() => setTab('run-placement')}
            >
              Run Placement
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'approve-results' ? 'active' : ''}`}
              onClick={() => setTab('approve-results')}
            >
              Approve & Publish Results
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'appeals' ? 'active' : ''}`}
              onClick={() => setTab('appeals')}
            >
              Handle Appeals
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'reports' ? 'active' : ''}`}
              onClick={() => setTab('reports')}
            >
              Reports
            </button>
            <button
              className={`btn dashboard-nav-btn text-start ${tab === 'announcements' ? 'active' : ''}`}
              onClick={() => setTab('announcements')}
            >
              Announcements
            </button>
          </nav>
        </aside>

        <main className="col-md-10 p-5 main-content">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start gap-3 mb-4">
            <div>
              <h2 className="fw-bold mb-1">Welcome back, {registrar.username}</h2>
              <p className="text-muted mb-0">Debre Tabor University registrar workflow: department review, placement approval, and publishing decisions.</p>
            </div>
            <span className="badge bg-primary text-white py-2 px-3">Registrar</span>
          </div>

          {tab === 'overview' ? (
            <>
              <div className="row g-4 mb-4">
                <div className="col-lg-3 col-md-6">
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
                    onClick={() => handleCardClick('departments')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Departments</span>
                      <h3 className="summary-value">{summary.departments}</h3>
                      <small className="text-muted">DTU academic departments</small>
                      <div className="mt-2"><small className="text-primary fw-bold">Click to view details →</small></div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-3 col-md-6">
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
                    onClick={() => handleCardClick('activeStudents')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Active Students</span>
                      <h3 className="summary-value">{summary.activeStudents}</h3>
                      <small className="text-muted">Verified for this cycle</small>
                      <div className="mt-2"><small className="text-success fw-bold">Click to view details →</small></div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-3 col-md-6">
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
                    onClick={() => handleCardClick('placementsCompleted')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Placements Completed</span>
                      <h3 className="summary-value">{summary.placementsCompleted}</h3>
                      <small className="text-muted">Department assignments finalized</small>
                      <div className="mt-2"><small className="text-warning fw-bold">Click to view details →</small></div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-3 col-md-6">
                  <div
                    className="card summary-card shadow-sm"
                    style={{ cursor: 'pointer', transition: 'all 0.3s ease', border: '2px solid transparent' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = '#fd7e14';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                    onClick={() => handleCardClick('unplacedStudents')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Unplaced Students</span>
                      <h3 className="summary-value">{summary.unplacedStudents}</h3>
                      <small className="text-muted">Awaiting placement run</small>
                      <div className="mt-2"><small className="fw-bold" style={{ color: '#fd7e14' }}>Click to view details →</small></div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-3 col-md-6">
                  <div 
                    className="card summary-card shadow-sm" 
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
                    onClick={() => handleCardClick('pendingApprovals')}
                  >
                    <div className="card-body">
                      <span className="summary-label">Pending Approvals</span>
                      <h3 className="summary-value">{summary.pendingApprovals}</h3>
                      <small className="text-muted">Awaiting registrar approval</small>
                      <div className="mt-2"><small className="text-danger fw-bold">Click to view details →</small></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="row g-4">
                <div className="col-lg-6">
                  <div className="card shadow-sm">
                    <div className="card-body">
                      <h5 className="card-title">DTU Registrar Workflow</h5>
                      <p className="text-muted">The registrar office verifies departmental capacity, checks applicant records, and approves the final placement batch before publishing outcomes to students.</p>
                      <ul className="list-group list-group-flush">
                        <li className="list-group-item">Review department capacity and college seat allocation.</li>
                        <li className="list-group-item">Validate student data for placement batch {placementBatch}.</li>
                        <li className="list-group-item">Approve final placement results and publish outcomes.</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="col-lg-6">
                  <div className="card shadow-sm">
                    <div className="card-body">
                      <h5 className="card-title">Quick actions</h5>
                      <div className="d-grid gap-2">
                        <button className="btn btn-outline-primary" onClick={() => setTab('student-info')}>
                          Student Information
                        </button>
                        <button className="btn btn-outline-primary" onClick={() => setTab('capacity')}>
                          Review Department Capacity
                        </button>
                        <button className="btn btn-outline-primary" onClick={() => setTab('placements')}>
                          Review Placement Requests
                        </button>
                        <button className="btn btn-outline-primary" onClick={() => setTab('reports')}>
                          Open Placements Report
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
                    maxWidth: '800px',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                    padding: '30px'
                  }}>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h4 className="fw-bold mb-0">
                        {cardDetailModal === 'departments' && 'All Departments'}
                        {cardDetailModal === 'activeStudents' && 'Active Students'}
                        {cardDetailModal === 'placementsCompleted' && 'Placed Students'}
                        {cardDetailModal === 'unplacedStudents' && 'Unplaced Students'}
                        {cardDetailModal === 'pendingApprovals' && 'Pending Placement Approvals'}
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
                              {cardDetailModal === 'departments' && (
                                <>
                                  <th>Department</th>
                                  <th>Capacity</th>
                                  <th>College</th>
                                  <th>Stream</th>
                                </>
                              )}
                              {cardDetailModal === 'activeStudents' && (
                                <>
                                  <th>#</th>
                                  <th>Student ID</th>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>GPA</th>
                                  <th>Stream</th>
                                  <th>Status</th>
                                </>
                              )}
                              {cardDetailModal === 'placementsCompleted' && (
                                <>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>Department</th>
                                  <th>Score</th>
                                  <th>Status</th>
                                </>
                              )}
                              {cardDetailModal === 'unplacedStudents' && (
                                <>
                                  <th>Student ID</th>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>Stream</th>
                                  <th>Status</th>
                                </>
                              )}
                              {cardDetailModal === 'pendingApprovals' && (
                                <>
                                  <th>Student ID</th>
                                  <th>Name</th>
                                  <th>Department</th>
                                  <th>Score</th>
                                  <th>Choice Rank</th>
                                  <th>Status</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {cardDetailData.map((item, idx) => (
                              <tr key={idx}>
                                {cardDetailModal === 'departments' && (
                                  <>
                                    <td>{item.name}</td>
                                    <td>{item.capacity}</td>
                                    <td>{item.college}</td>
                                    <td>{item.stream}</td>
                                  </>
                                )}
                                {cardDetailModal === 'activeStudents' && (
                                  <>
                                    <td>{idx + 1}</td>
                                    <td>{item.id_number}</td>
                                    <td><strong>{item.name}</strong></td>
                                    <td>{item.email}</td>
                                    <td>{item.gpa}</td>
                                    <td><span className="badge bg-primary-subtle text-primary">{item.stream}</span></td>
                                    <td><span className="badge bg-success">{item.status}</span></td>
                                  </>
                                )}
                                {cardDetailModal === 'placementsCompleted' && (
                                  <>
                                    <td><strong>{item.name}</strong></td>
                                    <td>{item.email}</td>
                                    <td>{item.department}</td>
                                    <td>{item.cumulativeScore?.toFixed(2) || 'N/A'}</td>
                                    <td><span className="badge bg-success">{item.status}</span></td>
                                  </>
                                )}
                                {cardDetailModal === 'unplacedStudents' && (
                                  <>
                                    <td>{item.id_number}</td>
                                    <td><strong>{item.name}</strong></td>
                                    <td>{item.email}</td>
                                    <td>{item.stream}</td>
                                    <td><span className="badge bg-secondary">{item.status}</span></td>
                                  </>
                                )}
                                {cardDetailModal === 'pendingApprovals' && (
                                  <>
                                    <td>{item.official_id_number || item.id_number || item.student_id}</td>
                                    <td><strong>{item.name}</strong></td>
                                    <td>{item.dept_name}</td>
                                    <td>{Number(item.final_score ?? 0).toFixed(2)}</td>
                                    <td>{item.choice_rank}</td>
                                    <td><span className="badge bg-warning text-dark">{item.status}</span></td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="mt-3 text-end">
                      {cardDetailModal === 'unplacedStudents' && (
                        <button
                          className="btn btn-warning me-2"
                          onClick={() => { setCardDetailModal(null); setTab('run-placement'); }}
                        >
                          Go to Run Placement →
                        </button>
                      )}
                      {cardDetailModal === 'pendingApprovals' && (
                        <button
                          className="btn btn-danger me-2"
                          onClick={() => { setCardDetailModal(null); setTab('approve-results'); }}
                        >
                          Go to Approve &amp; Publish Results →
                        </button>
                      )}
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
          ) : tab === 'student-info' ? (
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <h4 className="card-title mb-0">Student Information</h4>
                  <div className="d-flex gap-2 flex-wrap">
                    {/* <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => window.location.reload()}
                      title="Reload student records from the database"
                    >
                      Refresh data
                    </button> */}
                    <button
                      className="btn btn-outline-info btn-sm"
                      onClick={() => setTab('choice-matrix')}
                    >
                      📊 Student Choice Matrix
                    </button>
                    <div className="btn-group btn-group-sm" role="group" aria-label="Export student information">
                      <button type="button" className="btn btn-outline-success" onClick={() => exportStudentInformation(filteredStudents, 'csv')}>
                        Export CSV
                      </button>
                      <button type="button" className="btn btn-outline-danger" onClick={() => exportStudentInformation(filteredStudents, 'pdf')}>
                        Export PDF
                      </button>
                    </div>
                    <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => window.print()}>
                      🖨️ Print List
                    </button>
                    {/* <button 
                      className="btn btn-outline-success btn-sm" 
                      onClick={() => setShowBulkUpload(true)}
                      title="Upload multiple students from CSV or Excel"
                    >
                      📤 Bulk Upload
                    </button> */}
                    <button className="btn btn-primary btn-sm register-new-student-btn" onClick={() => setTab('student-registration')}>
                      ➕ Register New Student
                    </button>
                  </div>
                </div>
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-2 mb-3">
                  <div className="text-muted">
                    Showing {filteredStudents.length} student record{filteredStudents.length === 1 ? '' : 's'} for placement batch {placementBatch}.
                  </div>
                  <div className="d-flex gap-2 align-items-center">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Search student name, email, ID..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      style={{ minWidth: 260 }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setCurrentPage(1)}
                    >
                      Search
                    </button>
                  </div>
                </div>

                {studentInfoLoading ? (
                  <div className="text-muted">Loading student records from the database...</div>
                ) : studentRecords.length === 0 ? (
                  <div className="alert alert-info mb-0">
                    No student profile records are available in the database yet.
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="alert alert-warning mb-0">
                    No students match your search. Try another name, email, ID, or department.
                  </div>
                ) : (
                  <>
                    <div className="table-responsive">
                      <table className="table table-hover align-middle table-bordered">
                        <thead className="table-light">
                          <tr>
                            <th> Student ID</th>
                            <th>First Name</th>
                            <th>Last Name</th>
                            <th>Username</th>
                            <th title="Cumulative GPA">GPA</th>
                            <th title="Grade 12 / Secondary School Score">G12 Result</th>
                            <th title="Certificate of Competence">COC</th>
                            <th>Gender</th>
                            <th>Disability</th>
                            <th>Minority</th>
                            <th title="Computed from GPA, G12, and other factors">Cumulative Score</th>
                            <th>Department</th>
                            <th>Action</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedStudents.map((student) => {
                            const disabilityFlag = parseYesNo(student.hasDisability ?? student.disability ?? student.specialSupport);
                            const minorityFlag = parseYesNo(student.minority ?? student.isMinority ?? student.minorityStatus);

                            return (
                            <tr key={`${student.id}-${student.email || student.name}`}>
                              {/* Student ID */}
                              <td className="fw-bold text-primary">{student.id_number || student.id}</td>

                              {/* Student Names */}
                              <td className="fw-semibold">{student.first_name || 'N/A'}</td>
                              <td className="fw-semibold">{student.last_name || 'N/A'}</td>
                              <td>{student.username || 'N/A'}</td>

                              {/* CGPA / GPA */}
                              <td className="text-center">
                                <span className="badge bg-primary-subtle text-primary px-3 py-2">
                                  {student.cgpa}
                                </span>
                              </td>

                              {/* Grade 12 Result (grade_12_result column) */}
                              <td className="text-center" title="Grade 12 / Secondary School Score">
                                {student.g12 !== null && student.g12 !== undefined && student.g12 !== 'N/A' ? (
                                  <span className="badge bg-info-subtle text-info px-3 py-2">
                                    {typeof student.g12 === 'number' ? student.g12.toFixed(2) : student.g12}
                                  </span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>

                              {/* Certificate of Competence (coc_result column) - Display numeric score */}
                              <td className="text-center" title="Certificate of Competence Score">
                                {student.coc !== null && student.coc !== undefined && student.coc !== 'N/A' ? (
                                  <span className="badge bg-success-subtle text-success px-3 py-2">
                                    {typeof student.coc === 'number' ? student.coc.toFixed(2) : student.coc}
                                  </span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>

                              {/* Gender */}
                              <td className="text-center">
                                <span className={`badge ${String(student.gender || '').toLowerCase() === 'female'
                                  ? 'bg-danger-subtle text-danger'
                                  : String(student.gender || '').toLowerCase() === 'male'
                                    ? 'bg-primary-subtle text-primary'
                                    : 'bg-secondary-subtle text-secondary'}`}>
                                  {student.gender && student.gender !== 'N/A' ? student.gender : 'Not specified'}
                                </span>
                              </td>

                              {/* Disability Status */}
                              <td className="text-center">
                                {disabilityFlag ? (
                                  <span className="badge bg-danger text-white px-3 py-2">Yes</span>
                                ) : (
                                  <span className="badge bg-secondary text-white px-3 py-2">No</span>
                                )}
                              </td>

                              {/* Minority Status */}
                              <td className="text-center">
                                {minorityFlag ? (
                                  <span className="badge bg-info text-white px-3 py-2">Yes</span>
                                ) : (
                                  <span className="badge bg-secondary text-white px-3 py-2">No</span>
                                )}
                              </td>

                              {/* Cumulative Score (from cumulative_avg column) */}
                              <td className="text-center">
                                <span className="badge bg-warning-subtle text-warning px-3 py-2 fw-bold">
                                  {Number(student.placement_result_score || student.cumulativeScore).toFixed(2)}
                                </span>
                              </td>

                              {/* Department Assignment */}
                              <td>
                                <div className="small">{student.department}</div>
                              </td>

                              <td className="text-center">
                                <button
                                  type="button"
                                  className={`btn btn-sm ${needsAcademicScores(student) ? 'btn-warning text-dark' : 'btn-outline-secondary'}`}
                                  onClick={() => {
                                    const studentId = student.id ?? student.user_id ?? student.email;
                                    navigate(`/student-score-form/${encodeURIComponent(studentId)}`, {
                                      state: { student },
                                    });
                                  }}
                                >
                                  {needsAcademicScores(student) ? 'Fill Scores' : 'Update'}
                                </button>
                              </td>

                              {/* Placement Status */}
                              <td className="text-center">
                                <span className={`badge px-3 py-2 ${
                                  student.status === 'Placed' || student.status === 'Approved' 
                                    ? 'bg-success text-white' 
                                    : student.status === 'Pending' 
                                      ? 'bg-warning text-dark' 
                                      : 'bg-secondary text-white'
                                }`}>
                                  {student.status}
                                </span>
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {missingScoresStudent && (
                      <div className="mt-4">
                        <MissingScoresForm
                          student={missingScoresStudent}
                          onClose={() => setMissingScoresStudent(null)}
                          onSaved={() => {
                            setMissingScoresStudent(null);
                            const loadStudentInfo = async () => {
                              try {
                                setStudentInfoLoading(true);
                                const response = await api.get('api/student/student_data_api.php');
                                const students = Array.isArray(response.data) ? response.data : response.data?.students || [];
                                setStudentRecords(students);
                              } catch (error) {
                                console.error('Failed to refresh student records after score update:', error);
                              } finally {
                                setStudentInfoLoading(false);
                              }
                            };
                            loadStudentInfo();
                          }}
                        />
                      </div>
                    )}

                    {studentRecords.length > PAGE_SIZE && (
                      <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                        <div className="text-muted small">
                          Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredStudents.length)}-{Math.min(currentPage * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length}
                        </div>
                        <div className="btn-group" role="group" aria-label="Student pagination">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                            disabled={currentPage === 1}
                          >
                            Previous
                          </button>
                          <button type="button" className="btn btn-sm btn-light" disabled>
                            Page {currentPage} of {totalPages}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                            disabled={currentPage === totalPages}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : tab === 'choice-matrix' ? (
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <div>
                    <h4 className="card-title mb-1">Student Choice Matrix</h4>
                    <p className="text-muted mb-0">View each student’s ranked department selections for registrar review.</p>
                  </div>
                  <button className="btn btn-outline-primary btn-sm" onClick={() => setTab('student-info')}>
                    Back 
                  </button>
                  <div className="btn-group btn-group-sm" role="group" aria-label="Export student choice matrix">
                    <button type="button" className="btn btn-outline-success" onClick={() => exportChoiceMatrix(choiceMatrixRows, 'csv')}>
                      Export CSV
                    </button>
                    <button type="button" className="btn btn-outline-danger" onClick={() => exportChoiceMatrix(choiceMatrixRows, 'pdf')}>
                      Export PDF
                    </button>
                  </div>
                  <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => window.print()}>
                    🖨️ Print Matrix
                  </button>
                </div>

                <div className="row g-3 mb-3">
                  <div className="col-md-7">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search by student name, email, department, or ranking..."
                      value={choiceMatrixSearch}
                      onChange={(e) => setChoiceMatrixSearch(e.target.value)}
                    />
                  </div>
                  <div className="col-md-5">
                    <div className="alert alert-light border mb-0 py-2 px-3">
                      <strong>{Object.keys(departmentPreferenceCounts).length}</strong> departments with preference entries
                    </div>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table table-bordered table-hover align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>STUDENT ID</th>
                        <th>STUDENT NAME</th>
                        <th>Status</th>
                        {Array.from({ length: maxChoicesCount }, (_, index) => (
                          <th key={index}>CHOICE {index + 1}</th>
                        ))}
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {choiceMatrixRows.length === 0 ? (
                        <tr>
                          <td colSpan={maxChoicesCount + 4} className="text-center text-muted py-4">
                            No student choice data available yet.
                          </td>
                        </tr>
                      ) : (
                        choiceMatrixRows.map((student) => (
                          <tr key={`${student.id}-${student.email}`}>
                            <td>
                              <span className="badge px-3 py-2 fw-bold" style={{ backgroundColor: '#e2edff', color: '#0d6efd', borderRadius: '8px' }}>
                                {student.id_number || student.id}
                              </span>
                            </td>
                            <td className="fw-semibold">{student.name}</td>
                            <td>{student.status || '—'}</td>
                            {student.prioritySlots.map((department, index) => (
                              <td key={`${student.id}-priority-${index}`}>
                                {department !== '—' ? (
                                  <span className="badge bg-primary-subtle text-primary-emphasis">{department}</span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                            ))}
                            <td>
                              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setChoiceDetailsStudent(student)}>
                                Details
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {choiceDetailsStudent && (
                  <div
                    className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
                    style={{ zIndex: 1050, background: 'rgba(12, 24, 38, 0.55)' }}
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) setChoiceDetailsStudent(null);
                    }}
                  >
                    <section
                      className="bg-white shadow-lg rounded-3 w-100 p-4"
                      style={{ maxWidth: '760px', maxHeight: '90vh', overflowY: 'auto' }}
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="choice-details-title"
                    >
                      <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                        <div>
                          <h5 id="choice-details-title" className="fw-bold mb-1">Ranked choices</h5>
                          <div className="text-muted small">{choiceDetailsStudent.name} · {choiceDetailsStudent.email}</div>
                        </div>
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setChoiceDetailsStudent(null)}>
                          Close
                        </button>
                      </div>
                      {(choiceDetailsStudent.choices || []).length === 0 ? (
                        <p className="text-muted mb-0">No ranked choices are available for this student.</p>
                      ) : (
                        <div className="table-responsive">
                          <table className="table table-bordered align-middle mb-0">
                            <thead className="table-light">
                              <tr>
                                <th>Priority</th>
                                <th>Department</th>
                                <th>College</th>
                                <th>Stream</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...(choiceDetailsStudent.choices || [])]
                                .sort((leftChoice, rightChoice) => Number(leftChoice.priority || 0) - Number(rightChoice.priority || 0))
                                .map((choice, index) => (
                                  <tr key={`${choice.priority || index}-${choice.department}`}>
                                    <td>{choice.priority || index + 1}</td>
                                    <td className="fw-semibold">{choice.department || '—'}</td>
                                    <td>{choice.college || '—'}</td>
                                    <td>{choice.stream || '—'}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </div>
          ) : tab === 'student-registration' ? (
            <StudentRegistration onBack={() => setTab('student-info')} onSuccess={() => setTab('student-info')} />
          ) : tab === 'capacity' ? (
            <div className="card shadow-sm border-0">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                  <div>
                    <h4 className="fw-bold mb-1" style={{ color: '#123153' }}>
                      Department Capacity / Quota
                    </h4>
                    <p className="text-muted mb-0">
                      Review and approve final department quotas for this cycle. Adjust seat capacities as needed before running placement.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={approveAllDepartmentCapacities}
                    disabled={capacitySaving || departments.length === 0}
                  >
                    {capacitySaving ? 'Saving capacities...' : 'Save & Approve Capacities'}
                  </button>
                  <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => window.print()}>
                    🖨️ Print Capacity Report
                  </button>
                </div>

                {capacityMessage && <div className="alert alert-success py-2" role="status">{capacityMessage}</div>}
                {capacityError && <div className="alert alert-danger py-2" role="alert">{capacityError}</div>}

                <div className="row g-3 mb-4">
                  <div className="col-md-4">
                    <label className="form-label dtu-label">Stream</label>
                    <select
                      className="form-select dtu-form-control"
                      value={streamFilter}
                      onChange={(e) => setStreamFilter(e.target.value)}
                    >
                      <option value="all">All Streams</option>
                      {Array.from(
                        new Set(
                          departments.map((dept) => getDepartmentStream(dept))
                        )
                      )
                        .sort((a, b) => a.localeCompare(b))
                        .map((streamOption) => (
                          <option key={streamOption} value={streamOption}>{streamOption}</option>
                        ))}
                    </select>
                  </div>

                  <div className="col-md-8">
                    <label className="form-label dtu-label">Search Department</label>
                    <input
                      className="form-control dtu-form-control"
                      placeholder="Search by department name"
                      value={deptSearch}
                      onChange={(e) => setDeptSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="table-responsive dtu-table-wrap">
                  <table className="table table-hover align-middle dtu-table">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>#</th>
                        <th style={{ width: 180 }}>Stream</th>
                        <th style={{ width: 320 }}>College</th>
                        <th>Department Name</th>
                        <th style={{ width: 140 }}>Capacity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(departments || [])
                        .filter((d) => {
                          const name = String(d.name || '').toLowerCase().trim();
                          const college = String(d.college || '').toLowerCase().trim();
                          const streamName = getDepartmentStream(d);
                          const currentStream = (streamFilter || 'all').toLowerCase().trim();

                          if (currentStream !== 'all' && streamName.toLowerCase().trim() !== currentStream) {
                            return false;
                          }

                          const query = (deptSearch || '').trim().toLowerCase();
                          if (query) {
                            const searchableText = `${name} ${college} ${streamName}`.toLowerCase();
                            if (!searchableText.includes(query)) {
                              return false;
                            }
                          }

                          return true;
                        })
                        .map((d, index) => {
                          const streamName = getDepartmentStream(d);
                          const collegeText = String(d.college || 'General')
                            .replace(/^\s*college\s+of\s+/i, '')
                            .replace(/^\s*College\s+of\s+/i, '')
                            .replace(/^\s*school\s+of\s+/i, '')
                            .replace(/^\s*School\s+of\s+/i, '')
                            .trim() || 'General';

                          return (
                            <tr key={d.id || `${d.name}-${index}`}>
                              <td>{index + 1}</td>
                              <td className="fw-semibold text-primary">{streamName}</td>
                              <td>{collegeText}</td>
                              <td className="fw-bold dtu-department-name">{d.name}</td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  required
                                  className="form-control form-control-sm dtu-form-control"
                                  aria-label={`Capacity for ${d.name}`}
                                  value={capacityDrafts[String(d.id)] ?? d.capacity}
                                  onChange={(event) => {
                                    setCapacityDrafts((current) => ({ ...current, [String(d.id)]: event.target.value }));
                                    setCapacityMessage('');
                                    setCapacityError('');
                                  }}
                                  disabled={capacitySaving}
                                />
                                <span className="d-none d-print-inline">{capacityDrafts[String(d.id)] ?? d.capacity}</span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

              </div>
            </div>
          ) : tab === 'department-status' ? (
            <section className="card shadow-sm border-0" aria-labelledby="department-status-title">
              <div className="card-body p-4">
                <div className="mb-4">
                  <h4 id="department-status-title" className="fw-bold mb-1" style={{ color: '#123153' }}>
                    Department &amp; College Placement Status
                  </h4>
                  <p className="text-muted mb-0">
                    Control which colleges and departments are open (Active) for Year 1 placement, or closed (Inactive) for Year 2.
                  </p>
                </div>

                {departmentStatusGroups.length === 0 ? (
                  <div className="alert alert-light border">No departments are available.</div>
                ) : (
                  <div className="d-grid gap-3">
                    <div className="border rounded-3 bg-light p-3">
                      <div className="row g-3 align-items-end">
                        <div className="col-12">
                          <label className="form-label fw-semibold" htmlFor="status-college-select">Select College</label>
                          <div className="d-flex gap-2 flex-wrap">
                            <select
                              id="status-college-select"
                              className="form-select flex-grow-1"
                              value={selectedCollegeStatus}
                              onChange={(event) => setSelectedCollegeStatus(event.target.value)}
                              disabled={departmentStatusSaving}
                            >
                              {departmentStatusGroups.map((group) => (
                                <option key={group.collegeName} value={group.collegeName}>{group.collegeName}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className={`btn fw-semibold ${collegeHasActiveDepartment(selectedCollegeStatus) ? 'btn-outline-danger' : 'btn-success'}`}
                              onClick={() => toggleEntireCollege(selectedCollegeStatus)}
                              disabled={departmentStatusSaving || !selectedCollegeStatus}
                            >
                              {collegeHasActiveDepartment(selectedCollegeStatus)
                                ? '✕ Deactivate Entire College'
                                : '✓ Activate Entire College'}
                            </button>
                          </div>
                        </div>

                        <div className="col-12">
                          <label className="form-label fw-semibold" htmlFor="status-department-select">Select Department</label>
                          <div className="d-flex gap-2 align-items-center flex-wrap">
                            <select
                              id="status-department-select"
                              className="form-select flex-grow-1"
                              value={selectedDepartmentStatus}
                              onChange={(event) => setSelectedDepartmentStatus(event.target.value)}
                              disabled={departmentStatusSaving || selectedCollegeDepartments.length === 0}
                            >
                              {selectedCollegeDepartments.map((department) => (
                                <option key={department.id} value={String(department.id)}>{department.name}</option>
                              ))}
                            </select>
                            {selectedDepartment && (() => {
                              const isActive = String(departmentStatusDrafts[String(selectedDepartment.id)] ?? selectedDepartment.status ?? 'active').toLowerCase() === 'active';
                              return (
                                <>
                                  <span className={`badge ${isActive ? 'bg-success' : 'bg-secondary'}`}>
                                    {isActive ? 'Active' : 'Inactive'}
                                  </span>
                                  <button
                                    type="button"
                                    className={`btn btn-sm ${isActive ? 'btn-outline-danger' : 'btn-success'}`}
                                    onClick={() => toggleDepartmentStatus(selectedDepartment)}
                                    disabled={departmentStatusSaving}
                                  >
                                    {isActive ? '🔴 Set to Inactive' : '🟢 Set to Active'}
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="table-responsive">
                      <table className="table table-sm table-hover align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th scope="col">#</th>
                            <th scope="col">Department Name</th>
                            <th scope="col">Stream</th>
                            <th scope="col">Current Status</th>
                            <th scope="col">Toggle Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCollegeDepartments.map((department, index) => {
                            const departmentId = String(department.id);
                            const isActive = String(departmentStatusDrafts[departmentId] ?? department.status ?? 'active').toLowerCase() === 'active';
                            return (
                              <tr key={departmentId}>
                                <th scope="row">{index + 1}</th>
                                <td className="fw-semibold">{department.name}</td>
                                <td>{getDepartmentStream(department)}</td>
                                <td>
                                  <span className={`badge ${isActive ? 'bg-success' : 'bg-secondary'}`}>
                                    {isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className={`btn btn-sm ${isActive ? 'btn-outline-danger' : 'btn-outline-success'}`}
                                    onClick={() => toggleDepartmentStatus(department)}
                                    disabled={departmentStatusSaving}
                                    aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${department.name}`}
                                  >
                                    {isActive ? 'Set to Inactive' : 'Set to Active'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={saveDepartmentStatuses}
                    disabled={departmentStatusSaving || departments.length === 0}
                  >
                    {departmentStatusSaving ? 'Saving statuses...' : 'Save Status Changes'}
                  </button>
                  {departmentStatusMessage && (
                    <div className="alert alert-success mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="status">
                      {departmentStatusMessage}
                    </div>
                  )}
                  {departmentStatusError && (
                    <div className="alert alert-danger mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="alert">
                      {departmentStatusError}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : tab === 'deadlines' ? (
            <div className="card shadow-sm border-0">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-start gap-3 mb-4 flex-wrap">
                  <div className="d-flex align-items-start gap-3">
                    <span className="d-inline-flex align-items-center justify-content-center rounded bg-primary-subtle text-primary p-3">
                      <FiCalendar size={22} aria-hidden="true" />
                    </span>
                    <div>
                      <h4 className="fw-bold mb-1" style={{ color: '#123153' }}>Placement Schedule &amp; Deadlines</h4>
                      <p className="text-muted mb-0">Manage the official placement timeline. The submission deadline controls the student preference form lock.</p>
                    </div>
                  </div>
                  <button type="button" className="btn btn-outline-dark btn-sm ms-auto" onClick={() => window.print()}>
                    🖨️ Print Schedule
                  </button>
                </div>

                {deadlineLoading && <div className="small text-muted mb-3" role="status">Loading saved schedule...</div>}
                <form onSubmit={savePlacementDates}>
                  <div className="row g-3">
                    {placementDateFields.map(([key, label]) => (
                      <div className="col-md-6" key={key}>
                        <label className="form-label fw-semibold" htmlFor={`registrar-${key}`}>{label}</label>
                        <input
                          id={`registrar-${key}`}
                          type="date"
                          className="form-control"
                          value={placementDates[key] || ''}
                          onChange={(event) => {
                            setPlacementDates((current) => ({ ...current, [key]: event.target.value }));
                            setDeadlineSuccess('');
                          }}
                          required
                        />
                        <span className="d-none d-print-inline">{placementDates[key] || ''}</span>
                      </div>
                    ))}
                  </div>
                  <button type="submit" className="btn btn-primary mt-4" disabled={deadlineSaving || deadlineLoading}>
                    <FiCalendar className="me-2" aria-hidden="true" />
                    {deadlineSaving ? 'Saving schedule...' : 'Save Placement Schedule & Deadlines'}
                  </button>
                  {deadlineSuccess && <div className="alert alert-success mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="status">{deadlineSuccess}</div>}
                  {deadlineError && <div className="alert alert-danger mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="alert">{deadlineError}</div>}
                </form>
              </div>
            </div>
          ) : tab === 'placement-rules' ? (
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
                  <h4 className="card-title mb-0">Placement Rules &amp; Criteria</h4>
                  <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => window.print()}>
                    🖨️ Print Rules
                  </button>
                </div>
                <p className="text-muted">Define algorithm criteria used for automated placements.</p>
                <form onSubmit={savePlacementRules}>
                  <div className="row g-3 mb-3">
                                <div className="col-md-4">
                                  <label className="form-label">Minimum GPA Threshold for Placement </label>
                                  <input type="number" className="form-control" value={placementRules.minGpa} onChange={(e) => setPlacementRules((prev) => ({ ...prev, minGpa: Number(e.target.value) }))} min={0} max={4} step="0.01" />
                                  <span className="d-none d-print-inline">{Number(placementRules.minGpa).toFixed(2)}</span>
                                </div>
                    <div className="col-md-4">
                      <label className="form-label">GPA Weight (%)</label>
                      <input type="number" className="form-control" value={placementRules.gpaWeight} onChange={(e) => setPlacementRules(prev => ({...prev, gpaWeight: Number(e.target.value)}))} min={0} max={100} />
                      <span className="d-none d-print-inline">{placementRules.gpaWeight}%</span>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Grade 12 Weight or Remedial Result (%)</label>
                      <input type="number" className="form-control" value={placementRules.grade12Weight} onChange={(e) => setPlacementRules(prev => ({...prev, grade12Weight: Number(e.target.value)}))} min={0} max={100} />
                      <span className="d-none d-print-inline">{placementRules.grade12Weight}%</span>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">COC Weight (%)</label>
                      <input type="number" className="form-control" value={placementRules.cocWeight} onChange={(e) => setPlacementRules(prev => ({...prev, cocWeight: Number(e.target.value)}))} min={0} max={100} />
                      <span className="d-none d-print-inline">{placementRules.cocWeight}%</span>
                    </div>
                  </div>
                  <div className="row g-3 mb-3">
                    <div className="col-md-4">
                      <label className="form-label">Gender Weight (%)</label>
                      <input type="number" className="form-control" value={placementRules.genderWeight} onChange={(e) => setPlacementRules(prev => ({...prev, genderWeight: Number(e.target.value)}))} min={0} max={100} />
                      <span className="d-none d-print-inline">{placementRules.genderWeight}%</span>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Disability Weight (%)</label>
                      <input type="number" className="form-control" value={placementRules.disabilityWeight} onChange={(e) => setPlacementRules(prev => ({...prev, disabilityWeight: Number(e.target.value)}))} min={0} max={100} />
                      <span className="d-none d-print-inline">{placementRules.disabilityWeight}%</span>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Minority Weight (%)</label>
                      <input type="number" className="form-control" value={placementRules.minorityWeight} onChange={(e) => setPlacementRules(prev => ({...prev, minorityWeight: Number(e.target.value)}))} min={0} max={100} />
                      <span className="d-none d-print-inline">{placementRules.minorityWeight}%</span>
                    </div>
                  </div>
                  <div className="d-flex gap-2 align-items-center flex-wrap">
                    <button className="btn btn-primary" type="submit" disabled={rulesSaving}>
                      {rulesSaving ? 'Saving...' : 'Save Rules'}
                    </button>
                    <button className="btn btn-outline-secondary" type="button" onClick={() => { setPlacementRules({ gpaWeight: 40, grade12Weight: 20, cocWeight: 30, genderWeight: 3, disabilityWeight: 3, minorityWeight: 4, minGpa: 1.75 }); localStorage.removeItem('placementRules'); }}>Reset</button>
                    {rulesSaved && <div className="alert alert-success mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="status">Saved</div>}
                    {rulesError && <div className="alert alert-danger mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="alert">{rulesError}</div>}
                  </div>
                </form>
              </div>
            </div>
          ) : tab === 'placements' ? (
            <div className="card shadow-sm">
              <div className="card-body">
                <h4 className="card-title mb-3">Placement Management</h4>
                <p className="text-muted mb-4">Track student placement progress and review the latest placement requests.</p>
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead className="table-light">
                      <tr>
                        <th>Request</th>
                        <th>Student</th>
                        <th>Status</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Internship approval</td>
                        <td>John Doe</td>
                        <td><span className="badge bg-warning text-dark">Pending</span></td>
                        <td>2 days ago</td>
                      </tr>
                      <tr>
                        <td>Department placement</td>
                        <td>Mary Johnson</td>
                        <td><span className="badge bg-success">Approved</span></td>
                        <td>5 days ago</td>
                      </tr>
                      <tr>
                        <td>Capacity review</td>
                        <td>Placement Office</td>
                        <td><span className="badge bg-secondary">In review</span></td>
                        <td>1 week ago</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : tab === 'run-placement' ? (
            <div className="card shadow-sm border-0" style={{ background: 'linear-gradient(135deg, #f8fbff 0%, #eef5ff 100%)' }}>
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <div>
                    <h4 className="card-title mb-1" style={{ color: '#123153' }}>Run Placement Process</h4>
                    <p className="text-muted mb-0">Choose the stream, narrow the college, and select the exact students to place.</p>
                  </div>
                  <span className="badge rounded-pill px-3 py-2" style={{ background: '#dfeeff', color: '#0d5cb8' }}>
                    Controlled selection
                  </span>
                </div>

                <div className="card border-0 shadow-sm mb-4" style={{ background: 'rgba(255,255,255,0.88)', borderRadius: '18px' }}>
                  <div className="card-body p-4">
                    <div className="row g-3 align-items-end">
                      <div className="col-md-4">
                        <label className="form-label fw-semibold" style={{ color: '#123153' }}>Stream</label>
                        <select
                          className="form-select form-select-lg"
                          value={selectedStream}
                          onChange={(e) => setSelectedStream(e.target.value)}
                          style={{ borderRadius: '12px' }}
                        >
                          <option value="all">All streams</option>
                          {streamOptions.map((stream) => (
                            <option key={stream} value={stream}>{stream}</option>
                          ))}
                        </select>
                      </div>

                      <div className="col-md-4">
                        <label className="form-label fw-semibold" style={{ color: '#123153' }}>College</label>
                        <select
                          className="form-select form-select-lg"
                          value={placementCollege}
                          onChange={(e) => setPlacementCollege(e.target.value)}
                          style={{ borderRadius: '12px' }}
                          disabled={selectedStream === 'all' && placementCollegeOptions.length === 0}
                        >
                          <option value="all">All colleges</option>
                          {placementCollegeOptions.map((college) => (
                            <option key={college} value={college}>{college}</option>
                          ))}
                        </select>
                      </div>

                      <div className="col-md-4 d-flex align-items-end">
                        <div className="alert alert-info mb-0 w-100">
                          College-wide placement: students are matched to their saved choices using merit and department capacity.
                        </div>
                      </div>
                    </div>

                    <div className="d-flex justify-content-end gap-2 flex-wrap mt-4">
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => {
                          const visibleIds = placementCandidates.map((student) => String(student.id));
                          setSelectedStudentIds((prev) => {
                            const merged = new Set([...prev, ...visibleIds]);
                            return Array.from(merged);
                          });
                        }}
                      >
                        Select visible
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setSelectedStudentIds([])}
                      >
                        Clear selection
                      </button>
                    </div>

                    {!latestPlacementRun && (
                    <div className="mt-4">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="fw-semibold" style={{ color: '#123153' }}>Candidate students</span>
                        <span className="text-muted small">
                          {selectedStudentIds.length > 0
                            ? `${selectedStudentIds.length} student${selectedStudentIds.length === 1 ? '' : 's'} selected`
                            : 'Select one or more students to process'}
                        </span>
                      </div>

                      <div className="border rounded bg-white" style={{ maxHeight: '280px', overflowY: 'auto', borderRadius: '16px' }}>
                        {placementCandidates.length === 0 ? (
                          <div className="p-3 text-muted">No students match the current stream, college, and department filters.</div>
                        ) : (
                          placementCandidates.map((student) => {
                            const checked = selectedStudentIds.includes(String(student.id));

                            return (
                              <label
                                key={`${student.id}-${student.email || student.name}`}
                                className="d-flex align-items-center justify-content-between gap-3 p-3 border-bottom"
                                style={{ cursor: 'pointer', background: checked ? '#f0f8ff' : '#fff' }}
                              >
                                <div className="d-flex align-items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedStudentIds((prev) => {
                                        const studentId = String(student.id);
                                        return prev.includes(studentId)
                                          ? prev.filter((id) => id !== studentId)
                                          : [...prev, studentId];
                                      });
                                    }}
                                    style={{ width: 18, height: 18, accentColor: '#0d5cb8' }}
                                  />
                                  <div>
                                    <div className="fw-semibold" style={{ color: '#123153' }}>{student.name}</div>
                                    <div className="small text-muted">{student.email} • {student.department}</div>
                                  </div>
                                </div>
                                <span className="badge rounded-pill px-2 py-2" style={{ background: '#edf3ff', color: '#123153' }}>{student.status}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                    )}
                  </div>
                </div>

                <div className="d-flex gap-2 flex-wrap">
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      const studentsToPlace = filterStudentIdsForPlacement(placementCandidates, selectedStudentIds);

                      if (!studentsToPlace.length) {
                        setRunResult({ assigned: 0, unassigned: 0, error: 'Please select at least one student before running placement.' });
                        setPlacementError('No student selected.');
                        return;
                      }

                      setRunning(true);
                      setRunResult(null);
                      setPlacementError('');

                      try {
                        const studentCandidates = await Promise.all(
                          studentsToPlace.map(async (record) => {
                            try {
                              let preferences = Array.isArray(record.choices) ? record.choices : [];

                              if (preferences.length === 0) {
                                const preferenceResponse = await api.get(`api/student/student_preferences.php?student_id=${encodeURIComponent(record.id)}`);
                                const payload = preferenceResponse.data || {};
                                preferences = Array.isArray(payload.choices)
                                  ? payload.choices
                                  : Array.isArray(payload.data)
                                    ? payload.data
                                    : Array.isArray(payload)
                                      ? payload
                                      : [];
                              }

                              const formattedPreferences = preferences
                                .map((pref, index) => ({
                                  priority: Number(pref?.priority ?? pref?.rank ?? index + 1),
                                  department: pref?.department || pref?.name || pref?.dept_name || pref?.college || pref?.stream || '',
                                }))
                                .filter((pref) => pref.department)
                                .sort((a, b) => a.priority - b.priority);

                              if (formattedPreferences.length === 0) {
                                return null;
                              }

                              return {
                                id: record.id,
                                id_number: record.id_number,
                                name: record.name,
                                email: record.email,
                                cgpa: Number(record.cgpa || 0),
                                grade12: Number(record.g12 === 'N/A' ? 0 : record.g12 || 0),
                                coc: record.coc === null || record.coc === undefined || record.coc === 'N/A' ? 0 : Number(record.coc),
                                gender: record.gender || '',
                                disability: parseYesNo(record.hasDisability),
                                minority: parseYesNo(record.minority),
                                specialSupport: parseYesNo(record.hasDisability || record.minority),
                                preferences: formattedPreferences,
                              };
                            } catch (error) {
                              return null;
                            }
                          })
                        );

                        const students = studentCandidates.filter(Boolean);

                        if (students.length === 0) {
                          setRunResult({ assigned: 0, unassigned: 0, error: 'No valid student placement preferences were found for the selected students.' });
                          setPlacementError('Please ensure selected students have saved their preferences before running placement.');
                          return;
                        }

                        const finalizedDepartments = await fetchDepartments();
                        const payload = {
                          students,
                          departments: finalizedDepartments,
                          rules: placementRules,
                          selectedDepartment: 'all',
                          selectedCollege: placementCollege,
                          placementScope: 'college-wide',
                          selectedStudentIds: students.map((student) => student.id),
                        };
                                const response = await api.post('api/registrar/placement_engine.php', payload);
                        const result = response.data;

                        if (!result?.success) {
                          const message = String(result?.message || '').toLowerCase();
                          if (message.includes('already has a placement') || message.includes('already placed')) {
                            const alreadyPlaced = students.length;
                            setRunResult({ assigned: 0, unassigned: 0, alreadyPlaced, total: students.length });
                            setSelectedStudentIds((prev) => prev.filter((id) => !students.some((student) => String(student.id) === String(id))));
                            setPlacementError('The selected student already has a placement result and was removed from this run.');
                            return;
                          }
                          throw new Error(result?.message || 'Placement run failed.');
                        }

                        const summary = result.summary || {};
                        const assigned = Number(summary.assignedStudents || 0);
                        const unassigned = Number(summary.unassignedStudents || 0);
                        const alreadyPlaced = Number(summary.alreadyPlacedStudents || result.already_placed || 0);
                        const outcome = { assigned, unassigned, alreadyPlaced, total: students.length };

                        setRunResult(outcome);
                        setPlacementBatch((prev) => prev || 'DTU-2026/1');
                        localStorage.setItem('dtuPlacementBatch', placementBatch || 'DTU-2026/1');
                        setPendingResults((prev) => [{ id: Date.now(), summary: outcome, placements: result.placements || [], createdAt: new Date().toISOString() }, ...prev]);
                        if (Array.isArray(result.placements)) {
                          localStorage.setItem('studentPlacementSummary', JSON.stringify({
                            studentId: registrar?.id || 'registrar-run',
                            batch: placementBatch || 'DTU-2026/1',
                            date: new Date().toISOString(),
                            placementRuns: result.placements,
                            status: 'run-complete',
                          }));
                        }
                      } catch (error) {
                        console.error(error);
                        const backendMessage = error?.response?.data?.message;
                        const normalizedBackendMessage = String(backendMessage || '').toLowerCase();
                        if (normalizedBackendMessage.includes('already has a placement') || normalizedBackendMessage.includes('already placed')) {
                          const alreadyPlaced = studentsToPlace.length;
                          setRunResult({ assigned: 0, unassigned: 0, alreadyPlaced, total: studentsToPlace.length });
                          setSelectedStudentIds((prev) => prev.filter((id) => !studentsToPlace.some((student) => String(student.id) === String(id))));
                          setPlacementError('The selected student already has a placement result and was removed from this run.');
                          return;
                        }
                        setRunResult({
                          assigned: 0,
                          unassigned: 0,
                          error: backendMessage || error?.message || 'Unable to run placement engine.',
                        });
                      } finally {
                        setRunning(false);
                      }
                    }}
                    disabled={running || studentRecords.length === 0}
                  >
                    {running
                      ? 'Running...'
                      : selectedStudentIds.length === 1
                        ? 'Run Selected Student'
                        : 'Run Placement'}
                  </button>
                  <button className="btn btn-outline-secondary" onClick={() => { setPendingResults([]); setRunResult(null); setPlacementError(''); }}>Clear</button>
                </div>
                {runResult && (
                  <div className="mt-3">
                    {placementError && <div className="alert alert-warning py-2">{placementError}</div>}
                    <div>Assigned: <strong>{runResult.assigned}</strong></div>
                    <div>Unassigned: <strong>{runResult.unassigned}</strong></div>
                    {runResult.alreadyPlaced > 0 && (
                      <div>Already placed: <strong>{runResult.alreadyPlaced}</strong> (no duplicate rows created)</div>
                    )}
                    {runResult.error && <div className="text-danger">{runResult.error}</div>}

                    {latestPlacementRun?.placements?.length > 0 && (
                      <div className="mt-4">
                        <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                          <div>
                            <h5 className="mb-1" style={{ color: '#123153' }}>Latest Placement Assignments</h5>
                            <p className="text-muted small mb-0">
                              Students assigned by the latest placement run. Results remain pending approval.
                            </p>
                          </div>
                          <span className="badge bg-primary-subtle text-primary px-3 py-2">
                            {latestPlacementRun.placements.filter((placement) => placement.status === 'placed').length} assigned
                          </span>
                          <div className="btn-group btn-group-sm" role="group" aria-label="Export placement results">
                            <button type="button" className="btn btn-outline-success" onClick={() => exportPlacementResults(latestPlacementRun.placements, 'csv', 'assigned')}>
                              Assigned CSV
                            </button>
                            <button type="button" className="btn btn-outline-danger" onClick={() => exportPlacementResults(latestPlacementRun.placements, 'pdf', 'assigned')}>
                              Assigned PDF
                            </button>
                            <button type="button" className="btn btn-outline-success" onClick={() => exportPlacementResults(latestPlacementRun.placements, 'csv', 'unassigned')}>
                              Unassigned CSV
                            </button>
                            <button type="button" className="btn btn-outline-danger" onClick={() => exportPlacementResults(latestPlacementRun.placements, 'pdf', 'unassigned')}>
                              Unassigned PDF
                            </button>
                          </div>
                          <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => window.print()}>
                            🖨️ Print Placements
                          </button>
                        </div>

                        <div className="table-responsive border rounded">
                          <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                              <tr>
                                <th>Student ID</th>
                                <th>Student Name</th>
                                <th>Merit Score</th>
                                <th>Department</th>
                                <th>College</th>
                                <th>Stream</th>
                                <th>Choice Rank</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {latestPlacementRun.placements.map((placement) => {
                                const assigned = placement.status === 'placed';

                                return (
                                  <tr key={`${placement.studentId}-${placement.department || 'unassigned'}`}>
                                    <td className="fw-semibold text-primary">{placement.id_number || placement.studentId}</td>
                                    <td>{placement.studentName || '—'}</td>
                                    <td>{placement.score !== null && placement.score !== undefined ? Number(placement.score).toFixed(2) : '—'}</td>
                                    <td>{placement.department || '—'}</td>
                                    <td>{placement.college || '—'}</td>
                                    <td>{placement.stream || '—'}</td>
                                    <td className="text-center">{placement.choiceRank || '—'}</td>
                                    <td>
                                      <span className={`badge ${assigned ? 'bg-success' : 'bg-secondary'}`}>
                                        {assigned ? 'Assigned' : 'Unassigned'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : tab === 'approve-results' ? (
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <div>
                    <h4 className="card-title mb-1">Approve &amp; Publish Results</h4>
                    <p className="text-muted mb-0">Review pending placement results before publishing them to students.</p>
                  </div>
                  <button
                    className="btn btn-success"
                    type="button"
                    disabled={publishingResults || pendingApprovalLoading || pendingApprovalRows.length === 0}
                    onClick={async () => {
                      setPublishingResults(true);
                      setPlacementError('');
                      setPublishSuccess('');

                      try {
                                const response = await api.post('api/registrar/publish_all_results.php');
                        const payload = response.data || {};

                        if (!payload.success) {
                          throw new Error(payload.message || 'Unable to publish placement results.');
                        }

                        setPendingApprovalRows([]);
                        setPublishSuccess('✓ Placement results published successfully.');
                      } catch (error) {
                        setPlacementError(error?.response?.data?.message || error?.message || 'Unable to publish placement results.');
                      } finally {
                        setPublishingResults(false);
                      }
                    }}
                  >
                    {publishingResults ? 'Publishing...' : `Approve & Publish (${pendingApprovalRows.length})`}
                  </button>
                  <div className="w-100">
                    {publishSuccess && <div className="alert alert-success mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="status">{publishSuccess}</div>}
                    {placementError && <div className="alert alert-danger mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="alert">{placementError}</div>}
                  </div>
                </div>

                {pendingApprovalLoading ? (
                  <div className="text-muted">Loading pending results...</div>
                ) : pendingApprovalRows.length === 0 ? (
                  <div className="text-muted">No pending results to approve.</div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>Student ID</th>
                          <th>First Name</th>
                          <th>Last Name</th>
                          <th>Department</th>
                          <th>Final Score</th>
                          <th>Choice Rank</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingApprovalRows.map((result) => (
                          <tr key={`${result.student_id}-${result.dept_name}`}>
                            <td>
                              <span className="badge px-3 py-2" style={{ backgroundColor: '#e2edff', color: '#0d6efd', borderRadius: '8px' }}>
                                {result.official_id_number || result.id_number || result.student_id}
                              </span>
                            </td>
                            <td>{result.first_name || '—'}</td>
                            <td>{result.last_name || '—'}</td>
                            <td>{result.dept_name}</td>
                            <td>{Number(result.final_score).toFixed(2)}</td>
                            <td>{result.choice_rank}</td>
                            <td><span className="badge bg-warning text-dark">{result.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : tab === 'announcements' ? (
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-4">
                  <div>
                    <h4 className="card-title mb-1">Announcements Management</h4>
                    <p className="text-muted mb-0">Publish official placement notices for the public portal.</p>
                  </div>
                  <span className="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle px-3 py-2">
                    Office of the University Registrar
                  </span>
                </div>

                {announcementsError && <div className="alert alert-danger py-2" role="alert">{announcementsError}</div>}
                {announcementsMessage && <div className="alert alert-success py-2" role="status">{announcementsMessage}</div>}

                <div className="row g-4">
                  <div className="col-lg-5">
                    <form onSubmit={saveAnnouncement}>
                      <h5 className="h6 fw-bold mb-3">{editingAnnouncementId ? 'Edit announcement' : 'Post an announcement'}</h5>
                      <div className="mb-3">
                        <label className="form-label" htmlFor="registrar-announcement-title">Title</label>
                        <input
                          id="registrar-announcement-title"
                          className="form-control"
                          value={announcementDraft.title}
                          onChange={(event) => setAnnouncementDraft({ ...announcementDraft, title: event.target.value })}
                          required
                        />
                      </div>
                      <div className="row g-3 mb-3">
                        <div className="col-sm-6">
                          <label className="form-label" htmlFor="registrar-announcement-category">Category</label>
                          <select
                            id="registrar-announcement-category"
                            className="form-select"
                            value={announcementDraft.category}
                            onChange={(event) => setAnnouncementDraft({ ...announcementDraft, category: event.target.value })}
                          >
                            <option>Notice</option>
                            <option>Deadline</option>
                            <option>Placement</option>
                            <option>Event</option>
                            <option>General</option>
                          </select>
                        </div>
                        <div className="col-sm-6">
                          <label className="form-label" htmlFor="registrar-announcement-priority">Priority</label>
                          <select
                            id="registrar-announcement-priority"
                            className="form-select"
                            value={announcementDraft.priority}
                            onChange={(event) => setAnnouncementDraft({ ...announcementDraft, priority: event.target.value })}
                          >
                            <option>Normal</option>
                            <option>High</option>
                            <option>Urgent</option>
                          </select>
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="form-label" htmlFor="registrar-announcement-deadline">Deadline date</label>
                        <input
                          id="registrar-announcement-deadline"
                          type="date"
                          className="form-control"
                          value={announcementDraft.deadline}
                          onChange={(event) => setAnnouncementDraft({ ...announcementDraft, deadline: event.target.value })}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label" htmlFor="registrar-announcement-content">Content</label>
                        <textarea
                          id="registrar-announcement-content"
                          className="form-control"
                          rows="5"
                          value={announcementDraft.content}
                          onChange={(event) => setAnnouncementDraft({ ...announcementDraft, content: event.target.value })}
                          required
                        />
                      </div>
                      <div className="d-flex gap-2">
                        <button type="submit" className="btn btn-primary" disabled={announcementsSaving}>
                          {announcementsSaving ? 'Saving...' : editingAnnouncementId ? 'Save Changes' : 'Publish Announcement'}
                        </button>
                        {editingAnnouncementId && (
                          <button type="button" className="btn btn-outline-secondary" onClick={resetAnnouncementDraft}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </form>
                  </div>

                  <div className="col-lg-7">
                    <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
                      <h5 className="h6 fw-bold mb-0">Published announcements</h5>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={fetchAnnouncements} disabled={announcementsLoading}>
                        {announcementsLoading ? 'Refreshing...' : 'Refresh'}
                      </button>
                    </div>
                    {announcementsLoading && <div className="text-muted small mb-2" role="status">Loading announcements...</div>}
                    {!announcementsLoading && announcements.length === 0 ? (
                      <div className="alert alert-light border">No announcements have been published.</div>
                    ) : announcements.length > 0 && (
                      <div className="table-responsive border rounded">
                        <table className="table table-sm align-middle mb-0">
                          <thead className="table-light">
                            <tr><th>Announcement</th><th>Priority</th><th>Deadline</th><th>Publisher</th><th>Actions</th></tr>
                          </thead>
                          <tbody>
                            {announcements.map((announcement) => (
                              <tr key={announcement.id}>
                                <td>
                                  <div className="fw-semibold">{announcement.title}</div>
                                  <div className="small text-muted">{announcement.category || 'Notice'}</div>
                                </td>
                                <td>{announcement.priority || 'Normal'}</td>
                                <td>{announcement.deadline ? new Date(`${announcement.deadline}T00:00:00`).toLocaleDateString() : '—'}</td>
                                <td className="small">{announcement.publisher || registrarAnnouncementPublisher}</td>
                                <td className="text-nowrap">
                                  <button type="button" className="btn btn-sm btn-outline-primary me-1" onClick={() => editAnnouncement(announcement)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => deleteAnnouncement(announcement.id)}
                                    disabled={announcementsSaving}
                                    aria-label={`Delete ${announcement.title}`}
                                  >
                                    <FaTrash aria-hidden="true" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : tab === 'appeals' ? (
            <div className="card shadow-sm">
              <div className="card-body">
                <h4 className="card-title mb-3">Handle Appeals</h4>
                <p className="text-muted mb-3">Review and resolve student appeals for placement results.</p>
                {appeals.length === 0 ? (
                  <div className="text-muted">No appeals at this time.</div>
                ) : (
                  <div className="d-grid gap-3">
                    {appeals.map((appeal) => (
                      <div key={appeal.id} className="border rounded-3 p-3">
                        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-2">
                          <div>
                            <div className="fw-bold">{appeal.username || `Student #${appeal.student_id}`}</div>
                            <div className="small text-muted">{appeal.email}</div>
                          </div>
                          <small className="text-muted">{appeal.created_at}</small>
                        </div>
                        <h6 className="fw-bold mb-2">{appeal.subject}</h6>
                        <p className="mb-3">{appeal.message}</p>
                        <div className="row g-2 align-items-end">
                          <div className="col-md-3">
                            <label className="form-label small fw-semibold" htmlFor={`appeal-status-${appeal.id}`}>Status</label>
                            <select
                              id={`appeal-status-${appeal.id}`}
                              className="form-select form-select-sm"
                              value={appeal.status}
                              onChange={(event) => setAppeals((current) => current.map((item) => item.id === appeal.id ? { ...item, status: event.target.value } : item))}
                            >
                              <option>Received</option>
                              <option>Under Review</option>
                              <option>Resolved</option>
                            </select>
                          </div>
                          <div className="col-md-7">
                            <label className="form-label small fw-semibold" htmlFor={`appeal-response-${appeal.id}`}>Registrar response</label>
                            <textarea
                              id={`appeal-response-${appeal.id}`}
                              className="form-control form-control-sm"
                              rows="2"
                              value={appeal.response || ''}
                              onChange={(event) => setAppeals((current) => current.map((item) => item.id === appeal.id ? { ...item, response: event.target.value } : item))}
                              placeholder="Write a response to the student"
                            />
                          </div>
                          <div className="col-md-2">
                            <div className="d-flex gap-2">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm w-100"
                                onClick={() => updateAppeal(appeal)}
                                disabled={appealSavingId === appeal.id || appealDeletingId === appeal.id}
                              >
                                {appealSavingId === appeal.id ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm w-100"
                                onClick={() => deleteAppeal(appeal)}
                                disabled={appealSavingId === appeal.id || appealDeletingId === appeal.id}
                              >
                                {appealDeletingId === appeal.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                            {appealFeedback?.id === appeal.id && (
                              <div className={`alert alert-${appealFeedback.type} mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0`} role={appealFeedback.type === 'danger' ? 'alert' : 'status'}>
                                {appealFeedback.message}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                  <div>
                    <h4 className="card-title mb-1">Registrar Reports</h4>
                    <p className="text-muted mb-0">Generate and review reports that highlight placement trends, department utilization, and student assignment history.</p>
                  </div>
                </div>
                <section className="mb-4" aria-labelledby="admin-messages-heading">
                  <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
                    <div>
                      <h5 id="admin-messages-heading" className="mb-1">Messages from Admin</h5>
                      <p className="text-muted small mb-0">Messages sent by the Administrator appear here.</p>
                    </div>
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setAdminReportsRefresh((value) => value + 1)}>Refresh</button>
                  </div>
                  {adminReportsLoading && <div className="alert alert-info py-2">Loading Admin messages...</div>}
                  {!adminReportsLoading && adminReportsError && <div className="alert alert-danger py-2">{adminReportsError}</div>}
                  {!adminReportsLoading && !adminReportsError && adminReports.length === 0 && (
                    <div className="alert alert-light border py-2">No messages from Admin yet.</div>
                  )}
                  {!adminReportsLoading && !adminReportsError && adminReports.length > 0 && (
                    <div className="list-group">
                      {adminReports.map((report) => (
                        <article
                          key={report.id}
                          className={`list-group-item ${!Number(report.is_read) ? 'fw-semibold' : ''}`}
                          onClick={() => markAdminReportRead(report)}
                          role={!Number(report.is_read) ? 'button' : undefined}
                          tabIndex={!Number(report.is_read) ? 0 : undefined}
                          onKeyDown={(event) => { if (event.key === 'Enter') markAdminReportRead(report); }}
                        >
                          <div className="d-flex justify-content-between align-items-start gap-3">
                            <div>
                              {!Number(report.is_read) && <span className="badge bg-primary me-2">New</span>}
                              <strong>{report.title || 'Message from Admin'}</strong>
                            </div>
                            <small className="text-muted text-nowrap">{report.created_at}</small>
                          </div>
                          <p className="mb-0 mt-2">{report.message}</p>
                          {report.file_url && (
                            <a className="btn btn-sm btn-outline-primary mt-2" href={report.file_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                              Open attachment
                            </a>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
                <section className="mb-4 pt-4 border-top" aria-labelledby="sent-reports-heading">
                  <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
                    <div>
                      <h5 id="sent-reports-heading" className="mb-1">Sent Report History</h5>
                      <p className="text-muted small mb-0">Reports and files sent by this Registrar.</p>
                    </div>
                  </div>
                  {sentReportsLoading && <div className="alert alert-info py-2">Loading sent history...</div>}
                  {!sentReportsLoading && sentReportsError && <div className="alert alert-danger py-2">{sentReportsError}</div>}
                  {!sentReportsLoading && !sentReportsError && sentReports.length === 0 && (
                    <div className="alert alert-light border py-2">No sent reports yet.</div>
                  )}
                  {!sentReportsLoading && !sentReportsError && sentReports.length > 0 && (
                    <div className="list-group">
                      {sentReports.map((report) => (
                        <article key={report.id} className="list-group-item">
                          <div className="d-flex justify-content-between align-items-start gap-3">
                            <div>
                              <span className="badge bg-secondary me-2">Sent to {report.recipient_role}</span>
                              <strong>{report.title || 'Registrar Report'}</strong>
                            </div>
                            <small className="text-muted text-nowrap">{report.created_at}</small>
                          </div>
                          <p className="mb-0 mt-2">{report.message}</p>
                          {report.file_url && (
                            <a className="btn btn-sm btn-outline-primary mt-2" href={report.file_url} target="_blank" rel="noreferrer">
                              Open attachment
                            </a>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger mt-2 ms-2"
                            title="Delete sent report"
                            aria-label="Delete sent report"
                            onClick={() => deleteSentReport(report)}
                            disabled={deletingSentReportId === report.id}
                          >
                            <FaTrash aria-hidden="true" />
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
                <section className="mt-4 pt-4 border-top" aria-labelledby="send-report-file-heading">
                  <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                    <div>
                      <h5 id="send-report-file-heading" className="mb-1">Send Report File</h5>
                      <p className="text-muted small mb-0">Write a message or attach a PDF, Excel, or Word report.</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={() => reportFileInputRef.current?.click()}
                    >
                      Bulk Upload Report
                    </button>
                    <input
                      ref={reportFileInputRef}
                      type="file"
                      className="d-none"
                      accept=".pdf,.xls,.xlsx,.doc,.docx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleReportFileChange}
                    />
                  </div>

                  <div className="row g-3 align-items-end">
                    <div className="col-lg-2">
                      <label className="form-label small fw-semibold" htmlFor="report-file-recipient">Send to</label>
                      <select
                        id="report-file-recipient"
                        className="form-select"
                        value={reportRecipient}
                        onChange={(event) => {
                          setReportRecipient(event.target.value);
                          setSelectedRecipientId('all');
                          setSelectedDeptId('all');
                        }}
                      >
                        <option value="student">Student</option>
                        <option value="head">Head</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    {reportRecipient === 'head' && (
                      <div className="col-lg-3">
                        <label className="form-label small fw-semibold" htmlFor="report-file-head-recipient">Select Department / Head</label>
                        <select
                          id="report-file-head-recipient"
                          className="form-select"
                          value={selectedDeptId}
                          onChange={(event) => setSelectedDeptId(event.target.value)}
                        >
                          <option value="all">All Department Heads</option>
                          {departments
                            .filter((department) => String(department.status || '').toLowerCase() === 'active')
                            .map((department) => (
                              <option key={department.id} value={department.id}>{department.name} (Head)</option>
                            ))}
                        </select>
                      </div>
                    )}
                    {reportRecipient === 'student' && (
                      <div className="col-lg-3">
                        <label className="form-label small fw-semibold" htmlFor="report-file-student-recipient">Select Specific Student</label>
                        <select
                          id="report-file-student-recipient"
                          className="form-select"
                          value={selectedRecipientId}
                          onChange={(event) => setSelectedRecipientId(event.target.value)}
                        >
                          <option value="all">All Students</option>
                          {studentRecords.map((student) => (
                            <option key={student.id} value={student.id}>{student.name} ({student.id_number || student.id})</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className={reportRecipient === 'admin' ? 'col-lg-5' : 'col-lg-3'}>
                      <label className="form-label small fw-semibold" htmlFor="report-file-message">Message</label>
                      <textarea
                        id="report-file-message"
                        className="form-control"
                        rows="2"
                        value={reportMessage}
                        onChange={(event) => setReportMessage(event.target.value)}
                        placeholder="Write a message for the recipient"
                      />
                    </div>
                    <div className="col-lg-2">
                      <div className="small text-muted mb-2">Selected file</div>
                      <div className="border rounded p-2 text-truncate" title={reportFile?.name || ''}>
                        {reportFile?.name || 'No file selected'}
                      </div>
                    </div>
                    <div className="col-lg-2 d-grid">
                      <button type="button" className="btn btn-primary" onClick={sendReportFile} disabled={reportSending}>
                        {reportSending ? 'Sending...' : 'Send File'}
                      </button>
                      {reportDistributionStatus && (
                        <div className={`alert alert-${reportDistributionStatusType} mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0`} role={reportDistributionStatusType === 'danger' ? 'alert' : 'status'}>
                          {reportDistributionStatus}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
        </main>
      </div>

      <BulkUploadModal 
        isOpen={showBulkUpload} 
        onClose={() => setShowBulkUpload(false)}
        onSuccess={() => {
          setShowBulkUpload(false);
          setStudentInfoLoading(true);
          // Refresh student records
          if (registrar) {
            const fetchStudentRecords = async () => {
              try {
                        const usersResponse = await api.get('api/admin/users_api.php');
                const usersPayload = Array.isArray(usersResponse.data)
                  ? usersResponse.data
                  : Array.isArray(usersResponse.data?.users)
                    ? usersResponse.data.users
                    : Array.isArray(usersResponse.data?.data)
                      ? usersResponse.data.data
                      : [];

                const studentUsers = usersPayload.filter((user) => {
                  const role = String(user?.role || '').trim().toLowerCase();
                  return role === 'student';
                });

                const records = await Promise.all(
                  studentUsers.map(async (user) => {
                    const email = user?.email || '';
                    let profile = {};

                    if (email) {
                      try {
                        const profileResponse = await api.get(`api/student/student_profile.php?email=${encodeURIComponent(email)}`);
                        profile = profileResponse.data?.student || profileResponse.data?.data || {};
                      } catch (error) {
                        profile = {};
                      }
                    }

                    const cgpaValue = Number(profile.cgpa ?? profile.gpa ?? user.cgpa ?? 0);
                    const numericCgpa = Number.isFinite(cgpaValue) ? cgpaValue : 0;

                    const g12 = profile?.grade_12_result ?? profile?.g12 ?? profile?.g12_score ?? null;
                    const coc = profile?.coc_result ?? profile?.coc ?? profile?.certificateOfCompetence ?? null;
                    // Ensure COC is a number if it exists
                    const cocValue = coc ? Number(coc) : null;
                    const gender = (profile?.gender || user?.gender || '').toString();
                    const hasDisability = parseYesNo(profile?.disability ?? profile?.has_disability ?? profile?.hasDisability ?? profile?.specialSupport);
                    const minority = parseYesNo(profile?.minority ?? profile?.is_minority ?? profile?.isMinority);

                    const cumulative = calculateCumulativeScore({
                      gpa: numericCgpa,
                      grade12: g12,
                      coc: cocValue,
                      gender,
                      disability: hasDisability,
                      minority,
                    }, placementRules);

                    return {
                      id: user?.id ?? user?.student_id ?? profile?.studentId ?? profile?.id ?? null,
                      first_name: user?.first_name || profile?.first_name || '',
                      last_name: user?.last_name || profile?.last_name || '',
                      username: user?.username || profile?.username || '',
                      name: profile?.fullname || profile?.full_name || profile?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || '',
                      email: profile?.email || user?.email || '',
                      phone: profile?.phone || profile?.phoneNumber || profile?.contact || profile?.mobile || '',
                      cgpa: numericCgpa.toFixed(2),
                      g12: g12 ?? 'N/A',
                      coc: cocValue,
                      gender,
                      hasDisability: hasDisability,
                      minority: minority,
                      cumulativeScore: cumulative,
                      department: profile?.placement_result_department || profile?.department || profile?.program || profile?.stream || profile?.major || user?.department || '',
                      status: profile?.placement_result_department
                        ? (profile?.placement_result_status === 'Approved' ? 'Approved' : 'Placed')
                        : (profile?.placementStatus || profile?.status || profile?.placement_status || 'Pending'),
                      placementResult: profile?.placement_result_department || profile?.placement_result || profile?.placementResult || profile?.placement || profile?.result || null,
                    };
                  })
                );

                setStudentRecords(records.filter((record) => record.id !== null && record.name.trim()));
              } catch (error) {
                console.error('Failed to fetch student records:', error);
              } finally {
                setStudentInfoLoading(false);
              }
            };

            fetchStudentRecords();
          }
        }}
        departments={departments} 
      />
    </div>
  );
};

export default RegistrarDashboard;
