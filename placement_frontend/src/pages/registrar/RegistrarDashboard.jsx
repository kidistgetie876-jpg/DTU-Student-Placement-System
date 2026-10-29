import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api.js';
import getAttachmentUrl from '../../utils/getAttachmentUrl';
import StudentRegistration from './StudentRegistration';
import PlacedStudents from './PlacedStudents.jsx';
import UnassignedStudents from './UnassignedStudents.jsx';
import MinistryImport from './MinistryImport.jsx';
import SIMSImport from './SIMSImport.jsx';
import BulkUploadModal from '../../components/common/BulkUploadModal.jsx';
import '../admin/AdminDashboard.css';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dtuLogo from '../../assets/images6.jpg';
import OfficialPrintLetterhead from '../../components/common/OfficialPrintLetterhead.jsx';
import Sidebar from '../../components/layout/Sidebar.jsx';
import DashboardHeader from '../../components/layout/DashboardHeader.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { FaTrash } from 'react-icons/fa';
import { FiCalendar } from 'react-icons/fi';
import { ChevronDown, ChevronUp, Eye, Info, Pencil, Save } from 'lucide-react';
import ChoiceMatrix from './ChoiceMatrix.jsx';
import SecondSemToggle from './SecondSemToggle.jsx';
import ResetStudentChoices from './ResetStudentChoices.jsx';

const capacitySelectionCheckboxStyle = {
  width: '1.15rem',
  height: '1.15rem',
  border: '2px solid #334155',
  accentColor: '#2563eb',
  appearance: 'auto',
};

export const parseYesNo = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  return ['yes', 'y', 'true', '1', 'on'].includes(normalized);
};

const formatCumulativeScore = (value) => {
  const score = Number(value);
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)).toFixed(2) : '0.00';
};

const calculateCumulativeScoreBreakdown = (student, rules = {}) => {
  const gpa = Number(student.gpa ?? student.cgpa ?? 0);
  const grade12 = Number(student.grade12 ?? student.grade_12_result ?? 0);
  const coc = Number(student.coc ?? student.coc_result ?? 0);
  const benefitGroup = String(student.benefitGroup ?? student.benefit_group ?? '').toLowerCase();
  const region = String(student.region ?? '').toLowerCase();
  const minorityStatus = String(student.minority ?? student.isMinority ?? '').toLowerCase();
  const isFemale = String(student.gender ?? student.sex ?? '').toLowerCase() === 'female';
  const hasDisability = parseYesNo(student.disability ?? student.hasDisability)
    || /disability|disabled/.test(benefitGroup);
  const developingRegion = parseYesNo(student.developingRegion ?? minorityStatus)
    || /developing|emerging|\byes\b|minority/.test(`${region} ${benefitGroup} ${minorityStatus}`)
    || /\b(afar|somali|gambella|benishangul[\s-]*gumuz|benishangul|harari)\b/.test(region);
  const grade12TotalBase = Math.max(0.01, Number(rules.g12TotalBase ?? 600));
  const cgpaContribution = Math.min(4, Math.max(0, gpa)) / 4 * Number(rules.gpaWeight ?? rules.gpa_weight ?? 50);
  const grade12Contribution = Math.min(grade12TotalBase, Math.max(0, grade12)) / grade12TotalBase * Number(rules.grade12Weight ?? rules.grade_12_weight ?? 20);
  const cocContribution = Math.min(30, Math.max(0, coc)) / 30 * Number(rules.cocWeight ?? rules.coc_weight ?? 30);
  const femaleRule = Number(rules.femaleBonusPoints ?? 5);
  const disabilityRule = Number(rules.disabilityBonusPoints ?? 5);
  const minorityMaleRule = Number(rules.minorityMaleBonusPoints ?? rules.minorityBonusPoints ?? 5);
  const minorityFemaleRule = Number(rules.minorityFemaleBonusPoints ?? (femaleRule + minorityMaleRule));
  const minorityDisabilityRule = Number(rules.minorityDisabilityBonusPoints ?? (disabilityRule + minorityMaleRule));
  const femaleDisabilityMinorityRule = Number(
    rules.femaleDisabilityMinorityBonusPoints ?? (femaleRule + disabilityRule + minorityMaleRule),
  );
  let appliedScenario = '';
  let scenarioBonus = 0;
  let femaleBonus = isFemale ? femaleRule : 0;
  let disabilityBonus = hasDisability ? disabilityRule : 0;
  let minorityBonus = developingRegion ? minorityMaleRule : 0;
  if (developingRegion) {
    if (isFemale && hasDisability) {
      appliedScenario = 'female_disability_minority';
      scenarioBonus = femaleDisabilityMinorityRule;
    } else if (isFemale) {
      appliedScenario = 'minority_female';
      scenarioBonus = minorityFemaleRule;
    } else if (hasDisability) {
      appliedScenario = 'minority_disability';
      scenarioBonus = minorityDisabilityRule;
    } else {
      appliedScenario = 'minority_male';
      scenarioBonus = minorityMaleRule;
    }
    femaleBonus = 0;
    disabilityBonus = 0;
    minorityBonus = 0;
  }
  const baseScore = cgpaContribution + grade12Contribution + cocContribution;
  const affirmativeActionBonus = developingRegion
    ? scenarioBonus
    : femaleBonus + disabilityBonus;
  const roundScore = (score) => Math.round(score * 100) / 100;
  const configuredScoreCap = Number(rules.maxCumulativeScore ?? rules.max_cumulative_score ?? rules.maxScoreCap ?? rules.max_score_cap ?? 100);
  const scoreCap = Number.isFinite(configuredScoreCap)
    ? Math.min(100, Math.max(0, configuredScoreCap))
    : 100;

  return {
    cgpa_contribution: roundScore(cgpaContribution),
    grade12_contribution: roundScore(grade12Contribution),
    coc_contribution: roundScore(cocContribution),
    base_score: roundScore(baseScore),
    female_bonus: roundScore(femaleBonus),
    disability_bonus: roundScore(disabilityBonus),
    minority_bonus: roundScore(minorityBonus),
    scenario_bonus: roundScore(scenarioBonus),
    applied_scenario: appliedScenario,
    affirmative_action_bonus: roundScore(affirmativeActionBonus),
    score_cap: scoreCap,
    cumulative_score: roundScore(Math.min(scoreCap, Math.max(0, baseScore + affirmativeActionBonus))),
    female_flag: isFemale,
    disability_flag: hasDisability,
    minority_flag: developingRegion,
  };
};

const calculateCumulativeScore = (student, rules = {}) => (
  calculateCumulativeScoreBreakdown(student, rules).cumulative_score
);
const placementScenarioLabels = {
  minority_male: 'Minority / Developing Region (Male)',
  minority_female: 'Minority / Developing Region (Female)',
  minority_disability: 'Minority / Developing Region (Disability)',
  female_disability_minority: 'Female + Disability + Minority',
};

export const filterStudentIdsForPlacement = (studentRecords, selectedStudentIds) => {
  if (!Array.isArray(studentRecords) || !Array.isArray(selectedStudentIds) || selectedStudentIds.length === 0) return [];

  const selectedSet = new Set(selectedStudentIds.map((id) => String(id)));
  return studentRecords.filter((student) => selectedSet.has(String(student?.id)));
};

const hasPlacementResult = (student) => {
  if (!student) return false;

  const status = String(student.status || student.placement_status || '').trim().toLowerCase();
  const result = student.placementResult ?? student.placement_result ?? student.result ?? student.placement;

  return ['placed', 'approved'].includes(status)
    || (result !== null && result !== undefined && result !== '' && result !== false);
};

const isActivePlacementCandidate = (student) => {
  if (!student || hasPlacementResult(student)) return false;
  const status = String(student.status || student.placement_status || '').trim().toLowerCase();
  return !['inactive', 'disabled'].includes(status);
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
const getPlacementBatchForSemester = (batch, semester) => {
  const batchPrefix = String(batch || '').replace(/\/\d+$/, '') || `DTU-${new Date().getFullYear()}`;
  return `${batchPrefix}/${semester}`;
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
const registrarTabs = [
  'overview',
  'student-info',
  'data-import',
  'choice-matrix',
  'capacity',
  'department-status',
  'placement-rules',
  'settings',
  'deadlines',
  'placements',
  'run-placement',
  'approve-results',
  'placed-students',
  'unassigned-students',
  'appeals',
  'reports',
  'announcements',
  'student-registration',
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
  const headers = ['Admission Number', 'First Name', 'Father Name', 'Grandfather Name', 'Region', 'Sex', 'Field of Study', 'Total Mark (G12)', 'CGPA', 'COC Score', 'Disability', 'Minority', 'Cumulative Score', 'Placement Status'];
  const rows = students.map((student) => ({
    'Admission Number': student.admission_number || '',
    'First Name': student.given_name || '',
    'Father Name': student.father_name || '',
    'Grandfather Name': student.grandfather_name || '',
    Region: student.region || '',
    Sex: student.sex || '',
    'Field of Study': student.field_of_study || '',
    'Total Mark (G12)': student.total_mark ?? '',
    CGPA: student.cgpa ?? '',
    'COC Score': student.coc_score ?? '',
    Disability: parseYesNo(student.disability) ? 'Yes' : 'No',
    Minority: parseYesNo(student.minority) ? 'Yes' : 'No',
    'Cumulative Score': formatCumulativeScore(student.cumulativeScore ?? student.cumulative_score),
    'Placement Status': student.placement_status || '',
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
  const normalizeChoiceDepartment = (choice) => String(
    choice?.dept_name ?? choice?.department_name ?? choice?.department ?? choice?.name ?? '',
  ).trim();
  const getPrioritySlotLabel = (student, index) => {
    const priority = index + 1;
    const rankedChoices = (Array.isArray(student?.choices) ? student.choices : [])
      .filter((choice) => Number(choice?.priority ?? 0) === priority)
      .sort((left, right) => Number(left?.semester ?? 1) - Number(right?.semester ?? 1));

    if (rankedChoices.length > 0) {
      return rankedChoices.map((choice) => {
        const department = normalizeChoiceDepartment(choice);
        const college = String(choice?.college_name ?? choice?.college ?? choice?.collegeName ?? '').trim();
        return college ? `[${college}] ${department}` : department;
      }).join(' / ');
    }

    return student?.prioritySlots?.[index] || '-';
  };

  const maxChoicesCount = students.length > 0
    ? Math.max(1, ...students.map((student) => Math.max(
      student.prioritySlots?.length || 0,
      ...(student.choices || []).map((choice) => Number(choice?.priority) || 0),
    )))
    : 1;
  const choiceHeaders = Array.from({ length: maxChoicesCount }, (_, index) => `Choice ${index + 1}`);
  const headers = ['Student ID', 'Student Name', 'Stream', 'Status', ...choiceHeaders];
  const rows = students.map((student) => {
    const row = {
      'Student ID': student.id_number || student.id || '',
      'Student Name': student.name || '',
      Stream: student.stream || '',
      Status: student.status || '',
    };
    choiceHeaders.forEach((header, index) => {
      row[header] = getPrioritySlotLabel(student, index);
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

export const isDeferredPlacement = (placement) => {
  const status = String(placement?.status || '').trim().toLowerCase().replace(/_/g, ' ');
  return status === 'deferred'
    || status === 'pending 2nd semester'
    || status === 'pending second semester';
};

export const exportPlacementResults = (placements, format = 'csv', statusFilter = 'all') => {
  const headers = ['Student ID', 'Student Name', 'Merit Score', 'Department', 'College', 'Stream', 'Choice Rank', 'Status'];
  const filteredPlacements = placements.filter((placement) => {
    if (statusFilter === 'assigned') return placement.status === 'placed';
    if (statusFilter === 'deferred') return isDeferredPlacement(placement);
    if (statusFilter === 'unassigned') return placement.status === 'unassigned';
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
    Status: placement.status === 'placed'
      ? 'Assigned'
      : isDeferredPlacement(placement)
        ? 'Pending 2nd Semester'
        : 'Unassigned',
  }));
  const exportLabels = {
    assigned: 'Assigned',
    deferred: 'Pending 2nd Semester',
    unassigned: 'Unassigned',
  };
  const label = statusFilter === 'all'
    ? 'placement-results'
    : `${String(statusFilter).replace(/_/g, '-')}-students`;
  const title = statusFilter === 'all'
    ? 'Placement Results'
    : `${exportLabels[statusFilter] || 'Placement'} Students`;

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

  if (
    college.includes('business') || college.includes('economics') || college.includes('law')
    || college.includes('educ') || college.includes('social') || college.includes('humanit')
    || name.includes('law') || name.includes('education') || name.includes('history')
    || name.includes('english') || name.includes('social') || name.includes('psychology')
  ) return 'Social Science';
  if (
    college.includes('agric') || college.includes('medicine') || college.includes('health')
    || college.includes('nursing') || college.includes('engineer') || college.includes('technology')
    || college.includes('natural') || college.includes('computational') || college.includes('environment')
    || /biology|chemistry|physics|mathematics|computer|statistics/.test(name)
  ) return 'Natural Science';

  return 'Natural Science';
};

const formatStudentStream = (value) => {
  const stream = String(value ?? '').trim();
  const normalized = stream.toLowerCase().replace(/[^a-z]/g, '');
  const singularStream = normalized.replace(/sciences$/, 'science');
  if (
    singularStream.includes('natural') || /agricultur|medicine|health|nursing|engineer|technology/.test(singularStream)
  ) return 'Natural Science';
  if (
    singularStream.includes('social') || /business|economics|law|education|humanit/.test(singularStream)
  ) return 'Social Science';
  return stream;
};

export const normalizePlacementStream = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === '' || normalized === 'all') return 'all';
  if (['natural', 'naturalscience', 'naturalsciences'].includes(normalized)) return 'naturalscience';
  if (['social', 'socialscience', 'socialsciences'].includes(normalized)) return 'socialscience';
  return normalized;
};

export const hasInvalidStreamChoice = (studentStream, choiceStream) => {
  const studentStreamKey = normalizePlacementStream(formatStudentStream(studentStream));
  const choiceStreamKey = normalizePlacementStream(formatStudentStream(choiceStream));
  return ['naturalscience', 'socialscience'].includes(studentStreamKey)
    && ['naturalscience', 'socialscience'].includes(choiceStreamKey)
    && studentStreamKey !== choiceStreamKey;
};

export const getPlacementStreamOptions = (departments = []) => {
  const streams = new Map([
    ['naturalscience', 'Natural Science'],
    ['socialscience', 'Social Science'],
  ]);

  departments.forEach((department) => {
    const stream = formatStudentStream(getDepartmentStream(department));
    const streamKey = normalizePlacementStream(stream);
    if (streamKey !== 'all' && !streams.has(streamKey)) streams.set(streamKey, stream);
  });

  return Array.from(streams.values()).sort((left, right) => left.localeCompare(right));
};

const normalizePlacementCollege = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const getPlacementCollegeOptions = (departments, selectedStream) => {
  const selectedStreamKey = normalizePlacementStream(selectedStream);
  const colleges = new Map();

  departments.forEach((department) => {
    if (
      selectedStreamKey !== 'all'
      && normalizePlacementStream(formatStudentStream(getDepartmentStream(department))) !== selectedStreamKey
    ) return;

    const college = String(department.college || department.college_name || department.collegeName || '').trim();
    const collegeKey = normalizePlacementCollege(college);
    if (collegeKey && !colleges.has(collegeKey)) colleges.set(collegeKey, college);
  });

  return Array.from(colleges.values()).sort((left, right) => left.localeCompare(right));
};

export const filterPlacementCandidates = (
  students,
  selectedStream,
  selectedCollege,
  loadAllStudentsInStream = false,
) => {
  const selectedStreamKey = normalizePlacementStream(selectedStream);
  const selectedCollegeKey = normalizePlacementCollege(selectedCollege);

  return students.filter((student) => {
    const choices = Array.isArray(student.choices)
      ? student.choices.filter((choice) => String(
        choice.dept_name || choice.department_name || choice.department || '',
      ).trim() !== '')
      : [];
    if (choices.length === 0) return false;
    if (selectedStreamKey !== 'all' && normalizePlacementStream(student.stream) !== selectedStreamKey) return false;
    if (
      !loadAllStudentsInStream
      && selectedCollegeKey !== 'all'
      && !choices.some((choice) => normalizePlacementCollege(choice.college_name || choice.college) === selectedCollegeKey)
    ) return false;
    return true;
  });
};

export const normalizePlacementCandidateChoices = (student, semester) => {
  const semesterChoicesKey = semester === 2 ? 'semester_2_choices' : 'semester_1_choices';
  const hasSemesterChoices = Object.prototype.hasOwnProperty.call(student || {}, semesterChoicesKey);
  const sourceChoices = hasSemesterChoices
    ? (Array.isArray(student[semesterChoicesKey]) ? student[semesterChoicesKey] : [])
    : Array.isArray(student?.choices)
      ? student.choices
      : [];
  const choices = sourceChoices
    .map((choice, index) => {
      const department = String(
        choice?.dept_name
          ?? choice?.department_name
          ?? choice?.department
          ?? choice?.name
          ?? '',
      ).trim();
      const priority = Number(
        choice?.priority
          ?? choice?.choice_rank
          ?? choice?.rank
          ?? choice?.choice_order
          ?? index + 1,
      );
      return {
        ...choice,
        dept_name: department,
        department,
        priority: Number.isFinite(priority) && priority >= 1 ? priority : index + 1,
      };
    })
    .filter((choice) => choice.dept_name !== '')
    .sort((left, right) => left.priority - right.priority);

  return {
    ...student,
    choices,
    [semesterChoicesKey]: choices,
  };
};

export const getPlacementCandidateIneligibility = (student, semester, minimumGpa = 1.75) => {
  const choices = Array.isArray(student?.choices) ? student.choices : [];
  const qualifyingChoices = choices.filter((choice) => (
    String(choice?.dept_name || choice?.department_name || choice?.department || '').trim() !== ''
    && Number(choice?.priority ?? 1) >= 1
  ));
  if (qualifyingChoices.length === 0) {
    return 'No qualifying preferences are saved for this placement stage.';
  }

  const placementStatus = String(student?.placement_status || student?.status || '').trim().toLowerCase();
  if (semester === 2 && placementStatus && ![
    'pending',
    'pending 1st semester',
    'pending 2nd semester',
    'not assigned',
    'unassigned',
    'placed in semester 1',
    'allocated',
    'eligible',
    'unplaced',
  ].includes(placementStatus)) {
    return 'Student is not eligible for second-semester placement.';
  }
  if (semester === 1 && placementStatus && ![
    'pending',
    'pending 1st semester',
    'not assigned',
    'unassigned',
    ...(!student?.has_first_semester_placement ? ['pending 2nd semester'] : []),
  ].includes(placementStatus)) {
    return 'Student is not eligible for first-semester placement.';
  }

  const scores = [
    student?.cgpa,
    student?.g12 ?? student?.grade12,
    student?.coc,
    student?.cumulative_score,
  ].map(Number).filter(Number.isFinite);
  if (!scores.some((score) => score > 0)) {
    return 'Academic score data is missing.';
  }
  const cgpa = Number(student?.cgpa);
  if (cgpa > 0 && cgpa < minimumGpa) {
    return `CGPA is below the minimum requirement of ${minimumGpa}.`;
  }

  return '';
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
    approval_status: String(dept.approval_status || (Number(dept.capacity_approved) === 1 ? 'approved' : 'pending'))
      .trim()
      .toLowerCase(),
    is_locked: Number(dept.is_locked ?? dept.capacity_approved ?? 0) === 1,
    college: dept.college || dept.college_name || dept.collegeName || dept.program_college || '',
    standardized_college_name: dept.standardized_college_name || '',
    status: dept.status || 'active',
    stream: dept.stream || dept.academic_stream || dept.category || getDepartmentStream({
      name: dept.name || dept.department || '',
      college: dept.college || dept.college_name || dept.collegeName || dept.program_college || '',
    }),
  })).filter((dept) => dept.id && dept.name.trim());
};

const RegistrarDashboard = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { tab: routeTab } = useParams();
  const [registrar, setRegistrar] = useState(null);
  const [studentRecordsRefreshToken, setStudentRecordsRefreshToken] = useState(0);
  const tab = registrarTabs.includes(routeTab) ? routeTab : 'overview';
  const activeSidebarItem = location.pathname.includes('/unassigned-students')
    ? 'unassigned-students'
    : tab;
  const setTab = (nextTab) => {
    if (!registrarTabs.includes(nextTab)) return;
    localStorage.setItem('activeTab', nextTab);
    navigate(nextTab === 'overview'
      ? '/registrar-dashboard/overview'
      : `/registrar-dashboard/${nextTab}`);
  };
  useEffect(() => {
    localStorage.setItem('activeTab', tab);
  }, [tab]);
  useEffect(() => {
    if (routeTab && !registrarTabs.includes(routeTab)) {
      navigate('/registrar-dashboard/overview', { replace: true });
    }
  }, [navigate, routeTab]);
  useEffect(() => {
    if (!routeTab && location.state?.activeTab && registrarTabs.includes(location.state.activeTab)) {
      navigate(`/registrar-dashboard/${location.state.activeTab}`, { replace: true, state: null });
    }
  }, [location.state, navigate, routeTab]);
  const [summary, setSummary] = useState({
    totalDepartments: 0,
    placementsCompleted: 0,
    awaitingPlacement: 0,
  });
  const [placementRules, setPlacementRules] = useState(() => {
    const defaultRules = {
      gpaWeight: 50,
      grade12Weight: 20,
      g12TotalBase: 600,
      cocWeight: 30,
      maxScoreCap: 100,
      femaleBonusPoints: 5,
      disabilityBonusPoints: 5,
      minorityMaleBonusPoints: 5,
      minorityFemaleBonusPoints: 10,
      minorityDisabilityBonusPoints: 10,
      femaleDisabilityMinorityBonusPoints: 15,
      generalQuotaPercent: 80,
      reservedFemaleQuotaPercent: 20,
      minGpa: 1.75,
    };
    try {
      const raw = localStorage.getItem('placementRules');
      const savedRules = raw ? JSON.parse(raw) : {};
      return {
        ...defaultRules,
        ...savedRules,
        minGpa: Number(savedRules.minGpa ?? 1.75),
      };
    } catch (e) {
      return defaultRules;
    }
  });
  const placementRulesRef = useRef(placementRules);
  const [isEditingPlacementRules, setIsEditingPlacementRules] = useState(false);
  const placementRulesSnapshot = useRef(null);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [placementDates, setPlacementDates] = useState(defaultPlacementDates);
  const [deadlineLoading, setDeadlineLoading] = useState(false);
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [deadlineError, setDeadlineError] = useState('');
  const [deadlineSuccess, setDeadlineSuccess] = useState('');
  const [running, setRunning] = useState(false);
  const [rerunningPlacement, setRerunningPlacement] = useState(false);
  const [clearingPlacements, setClearingPlacements] = useState(false);
  const [showRerunConfirmation, setShowRerunConfirmation] = useState(false);
  const [forceRerunAvailable, setForceRerunAvailable] = useState(false);
  const [hasPublishedPlacementResults, setHasPublishedPlacementResults] = useState(false);
  const [hasUnpublishedPlacementResults, setHasUnpublishedPlacementResults] = useState(false);
  const [activeSemester, setActiveSemester] = useState(1);
  const [placementMode, setPlacementMode] = useState(1);
  const [activatingSemester, setActivatingSemester] = useState(null);
  const [semesterActivationError, setSemesterActivationError] = useState('');
  const [semesterActivationNotice, setSemesterActivationNotice] = useState('');
  const [completeSemesterRun, setCompleteSemesterRun] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [unassignedStudentsRefreshToken, setUnassignedStudentsRefreshToken] = useState(0);
  const [pendingResults, setPendingResults] = useState([]);
  const [pendingApprovalRows, setPendingApprovalRows] = useState([]);
  const [pendingApprovalLoading, setPendingApprovalLoading] = useState(false);
  const [publishingResults, setPublishingResults] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState('');
  const [placementError, setPlacementError] = useState('');
  const [departments, setDepartments] = useState(emptyDepartments);
  const [capacityDrafts, setCapacityDrafts] = useState({});
  const [selectedCapacityDepartmentIds, setSelectedCapacityDepartmentIds] = useState([]);
  const [editingRowId, setEditingRowId] = useState(null);
  const capacityInputRef = useRef(null);
  const [departmentStatusDrafts, setDepartmentStatusDrafts] = useState({});
  const [selectedCollegeStatus, setSelectedCollegeStatus] = useState('');
  const [selectedDepartmentStatus, setSelectedDepartmentStatus] = useState('');
  const [capacitySaving, setCapacitySaving] = useState(false);
  const [capacitySavingAction, setCapacitySavingAction] = useState('');
  const [capacityLoading, setCapacityLoading] = useState(true);
  const [capacityMessage, setCapacityMessage] = useState('');
  const [capacityError, setCapacityError] = useState('');
  const [departmentStatusSaving, setDepartmentStatusSaving] = useState(false);
  const [departmentStatusMessage, setDepartmentStatusMessage] = useState('');
  const [departmentStatusError, setDepartmentStatusError] = useState('');
  const [appeals, setAppeals] = useState([]);
  const [expandedAppealId, setExpandedAppealId] = useState(null);
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
  const [deletingAdminReportId, setDeletingAdminReportId] = useState(null);
  const [sentReports, setSentReports] = useState([]);
  const [sentReportsLoading, setSentReportsLoading] = useState(false);
  const [sentReportsError, setSentReportsError] = useState('');
  const [deletingSentReportId, setDeletingSentReportId] = useState(null);
  const [expandedReportId, setExpandedReportId] = useState(null);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesError, setRulesError] = useState('');
  const reportMessageInputRef = useRef(null);
  
  // State for card detail modals
  const [cardDetailModal, setCardDetailModal] = useState(null); // 'departments', 'placementsCompleted', 'unplacedStudents'
  const [cardDetailData, setCardDetailData] = useState([]);
  const [cardDetailLoading, setCardDetailLoading] = useState(false);
  const [cardDetailError, setCardDetailError] = useState('');
  const [studentRecords, setStudentRecords] = useState([]);
  const [expandedStudentScoreId, setExpandedStudentScoreId] = useState(null);
  const [showStudentRegistrationModal, setShowStudentRegistrationModal] = useState(false);
  const [streamFilter, setStreamFilter] = useState('all');
  const [deptSearch, setDeptSearch] = useState('');
  const [studentInfoLoading, setStudentInfoLoading] = useState(false);
  const [studentInfoError, setStudentInfoError] = useState('');
  const [editingStudent, setEditingStudent] = useState(null);
  const [studentEditForm, setStudentEditForm] = useState(null);
  const [savingStudentAttributes, setSavingStudentAttributes] = useState(false);
  const [studentAttributesError, setStudentAttributesError] = useState('');
  const [studentAttributesSuccess, setStudentAttributesSuccess] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedPreferenceAdmissions, setSelectedPreferenceAdmissions] = useState([]);
  const [clearingStudentPreferences, setClearingStudentPreferences] = useState(false);
  const [clearPreferencesFeedback, setClearPreferencesFeedback] = useState('');
  const [clearPreferencesError, setClearPreferencesError] = useState('');
  const [deletingStudents, setDeletingStudents] = useState(false);
  const [deleteStudentsFeedback, setDeleteStudentsFeedback] = useState('');
  const [deleteStudentsError, setDeleteStudentsError] = useState('');
  const [choiceMatrixSearch, setChoiceMatrixSearch] = useState('');
  const [choiceMatrixSelectedStream, setChoiceMatrixSelectedStream] = useState('All');
  const [choiceMatrixPage, setChoiceMatrixPage] = useState(1);
  const [choiceMatrixRecords, setChoiceMatrixRecords] = useState([]);
  const [choiceMatrixLoading, setChoiceMatrixLoading] = useState(false);
  const [choiceMatrixError, setChoiceMatrixError] = useState('');
  const [selectedStream, setSelectedStream] = useState('');
  const [placementCandidatesData, setPlacementCandidatesData] = useState([]);
  const [placementCandidatesLoading, setPlacementCandidatesLoading] = useState(false);
  const [placementCandidatesError, setPlacementCandidatesError] = useState('');
  const [placementPreviewData, setPlacementPreviewData] = useState([]);
  const [placementPreviewLoading, setPlacementPreviewLoading] = useState(false);
  const [placementPreviewError, setPlacementPreviewError] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [expandedCandidateIds, setExpandedCandidateIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [capacityPage, setCapacityPage] = useState(1);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const reportFileInputRef = useRef(null);
  const PAGE_SIZE = 10;
  const CHOICE_MATRIX_PAGE_SIZE = 5;
  const STUDENT_PAGE_SIZE = 5;
  const [placementBatch, setPlacementBatch] = useState(() => {
    try {
      return localStorage.getItem('dtuPlacementBatch') || getPlacementBatchForSemester('', 1);
    } catch (error) {
      return getPlacementBatchForSemester('', 1);
    };
  });

  useEffect(() => {
    if (editingRowId !== null) {
      capacityInputRef.current?.focus();
    }
  }, [editingRowId]);

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
    const response = await api.get('api/common/departments_api.php?status=all');
    if (response.data?.success === false) {
      throw new Error(response.data?.message || 'Unable to load departments.');
    }
    const normalized = normalizeDepartmentPayload(response.data ?? {});
    setDepartments(normalized);
    const departmentIds = new Set(normalized.map((department) => String(department.id)));
    setSelectedCapacityDepartmentIds((current) => current.filter((id) => departmentIds.has(id)));
    setCapacityDrafts(Object.fromEntries(normalized.map((department) => [String(department.id), department.capacity])));
    setDepartmentStatusDrafts(Object.fromEntries(normalized.map((department) => [String(department.id), String(department.status || 'active').toLowerCase()])));
    setCapacityError('');
    return normalized;
  }, []);

  const saveCapacityUpdates = async (updates, approveCapacities = false) => {
    if (!updates.length) {
      setCapacityError('There are no capacity changes to save.');
      setCapacityMessage('');
      return;
    }
    if (updates.some((department) => String(department.capacity).trim() === '' || !Number.isInteger(Number(department.capacity)) || Number(department.capacity) < 0)) {
      setCapacityError('Capacities must be whole numbers greater than or equal to zero.');
      setCapacityMessage('');
      return;
    }

    setCapacitySaving(true);
    setCapacitySavingAction(approveCapacities ? 'approve' : 'save');
    setCapacityError('');
    setCapacityMessage('');
    try {
      const response = await api.post('api/common/departments_update.php', {
        capacities: updates.map((department) => ({
          department_id: department.id,
          capacity: Number(department.capacity),
        })),
        ...(approveCapacities ? { approve_capacities: true } : {}),
      });
      if (!response.data?.success && response.data?.status !== 'success') {
        throw new Error(response.data?.message || 'Unable to save department capacities.');
      }
      if (approveCapacities) {
        const refreshedDepartments = await fetchDepartments();
        const refreshedById = new Map(refreshedDepartments.map((department) => [String(department.id), Number(department.capacity)]));
        const hasUnpersistedUpdates = updates.some((department) => refreshedById.get(String(department.id)) !== Number(department.capacity));
        if (hasUnpersistedUpdates) {
          throw new Error('Some capacities were not updated. Refresh the page and try again.');
        }
        const refreshedByDepartmentId = new Map(
          refreshedDepartments.map((department) => [String(department.id), department]),
        );
        if (updates.some((department) => {
          const refreshedDepartment = refreshedByDepartmentId.get(String(department.id));
          return !refreshedDepartment?.is_locked || refreshedDepartment.approval_status !== 'approved';
        })) {
          throw new Error('Capacity values were saved, but one or more departments did not enter the approved and locked state. Please refresh and try again.');
        }
        setSelectedCapacityDepartmentIds((current) => current.filter(
          (id) => !updates.some((department) => String(department.id) === id),
        ));
      } else {
        const updatedById = new Map(updates.map((department) => [String(department.id), Number(department.capacity)]));
        setDepartments((current) => current.map((department) => (
          updatedById.has(String(department.id))
            ? { ...department, capacity: updatedById.get(String(department.id)), approval_status: 'pending', is_locked: false }
            : department
        )));
        setCapacityDrafts((current) => ({
          ...current,
          ...Object.fromEntries(updates.map((department) => [String(department.id), Number(department.capacity)])),
        }));
      }
      setCapacityError('');
      setCapacityMessage(approveCapacities
        ? 'Department capacities successfully approved and updated.'
        : 'Capacities updated successfully!');
    } catch (error) {
      setCapacityError(error.response?.data?.message || error.message || 'Unable to save department capacities.');
    } finally {
      setCapacitySaving(false);
      setCapacitySavingAction('');
    }
  };

  const approveSelectedDepartmentCapacities = () => {
    const selectedIds = new Set(selectedCapacityDepartmentIds);
    const updates = departments.filter((department) => selectedIds.has(String(department.id))).map((department) => ({
      id: department.id,
      capacity: capacityDrafts[String(department.id)] ?? department.capacity,
    }));
    saveCapacityUpdates(updates, true);
  };

  const unlockDepartmentCapacities = async () => {
    if (!window.confirm('Unlock approved department capacities so department heads can edit and resubmit them?')) {
      return;
    }

    setCapacitySaving(true);
    setCapacitySavingAction('unlock');
    setCapacityError('');
    setCapacityMessage('');
    try {
      const response = await api.post('api/common/departments_update.php', {
        allow_head_edit: true,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to unlock department capacities.');
      }
      await fetchDepartments();
      setCapacityMessage(response.data.message || 'Department capacities are unlocked for editing.');
    } catch (error) {
      setCapacityError(error.response?.data?.message || error.message || 'Unable to unlock department capacities.');
    } finally {
      setCapacitySaving(false);
      setCapacitySavingAction('');
    }
  };

  const lockedCapacityCount = departments.filter((department) => (
    department.is_locked || department.approval_status === 'approved'
  )).length;

  const pendingCapacityUpdates = departments
    .filter((department) => (
      String(capacityDrafts[String(department.id)] ?? department.capacity).trim() === ''
      || Number(capacityDrafts[String(department.id)] ?? department.capacity) !== Number(department.capacity)
    ))
    .map((department) => ({
      id: department.id,
      capacity: capacityDrafts[String(department.id)] ?? department.capacity,
    }));

  const saveEditedDepartmentCapacities = () => {
    saveCapacityUpdates(pendingCapacityUpdates);
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

  useEffect(() => {
    const data = localStorage.getItem('user');
    if (!data) {
      navigate('/login');
      return;
    }

    try {
      const parsed = JSON.parse(data);
      if (String(parsed.role || '').trim().toLowerCase() === 'registrar') {
        setRegistrar(parsed);
      } else {
        navigate('/login');
      }
    } catch (error) {
      localStorage.removeItem('user');
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

  const deleteAdminReport = async (report) => {
    if (!window.confirm('Delete this message from Admin?')) return;

    setDeletingAdminReportId(report.id);
    setAdminReportsError('');
    try {
      const response = await api.post('api/registrar/delete_admin_report.php', { report_id: report.id });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to delete the Admin message.');
      }
      setAdminReports((current) => current.filter((item) => item.id !== report.id));
      setExpandedReportId((current) => (current === `admin-${report.id}` ? null : current));
    } catch (error) {
      setAdminReportsError(error.response?.data?.message || error.message || 'Unable to delete the Admin message.');
    } finally {
      setDeletingAdminReportId(null);
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
      setExpandedReportId((current) => (current === `sent-${report.id}` ? null : current));
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
        const settings = response.data?.data || response.data || {};
        const loadedRules = {
          gpaWeight: Number(settings.gpa_weight ?? 50),
          grade12Weight: Number(settings.grade_12_weight ?? 20),
          g12TotalBase: Number(settings.g12_total_base ?? 600),
          cocWeight: Number(settings.coc_weight ?? 30),
          maxScoreCap: Number(settings.max_cumulative_score ?? settings.max_score_cap ?? 100),
          femaleBonusPoints: Number(settings.female_bonus_points ?? 5),
          disabilityBonusPoints: Number(settings.disability_bonus_points ?? 5),
          minorityMaleBonusPoints: Number(settings.minority_male_bonus_points ?? settings.minority_bonus_points ?? 5),
          minorityFemaleBonusPoints: Number(settings.minority_female_bonus_points ?? 10),
          minorityDisabilityBonusPoints: Number(settings.minority_disability_bonus_points ?? 10),
          femaleDisabilityMinorityBonusPoints: Number(settings.female_disability_minority_bonus_points ?? 15),
          generalQuotaPercent: Number(settings.general_quota_percent ?? 80),
          reservedFemaleQuotaPercent: Number(settings.reserved_female_quota_percent ?? 20),
          minGpa: Number(settings.min_gpa ?? 1.75),
        };

        const configuredSemester = Number(settings.active_semester || 1);
        setActiveSemester(configuredSemester);
        setPlacementMode(configuredSemester);
        setHasPublishedPlacementResults(Boolean(settings.has_published_results));
        setHasUnpublishedPlacementResults(Boolean(settings.has_unpublished_results));
        setPlacementRules(loadedRules);
        localStorage.setItem('placementRules', JSON.stringify(loadedRules));
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
      setExpandedAppealId((current) => (current === appeal.id ? null : current));
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
    setCardDetailError('');

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
      else if (cardType === 'placementsCompleted') {
        const response = await api.get('api/registrar/get_placed_students.php');
        if (!response.data?.success || !Array.isArray(response.data.students)) {
          throw new Error(response.data?.message || 'Unable to load placed students.');
        }
        data = response.data.students;
        setSummary((current) => ({
          ...current,
          placementsCompleted: Number(response.data.count ?? data.length),
        }));
      } 
      else if (cardType === 'unplacedStudents') {
        const response = await api.get('api/registrar/get_unplaced_students.php');
        if (!response.data?.success || !Array.isArray(response.data.students)) {
          throw new Error(response.data?.message || 'Unable to load unplaced students.');
        }
        data = response.data.students;
      }

      setCardDetailData(data);
    } catch (error) {
      console.error('Error fetching card details:', error);
      setCardDetailError(error.response?.data?.message || error.message || 'Unable to load card details.');
      setCardDetailData([]);
    } finally {
      setCardDetailLoading(false);
    }
  };

  useEffect(() => {
    setCapacityLoading(true);
    fetchDepartments()
      .catch((error) => {
        setCapacityError(error.response?.data?.message || error.message || 'Unable to load department capacity data.');
      })
      .finally(() => setCapacityLoading(false));
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
    placementRulesRef.current = placementRules;
  }, [placementRules]);

  useEffect(() => {
    if (!registrar || tab !== 'student-info') {
      setStudentInfoLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let isCurrent = true;
    const fetchStudentRecords = async () => {
      setStudentInfoLoading(true);
      setStudentInfoError('');

      try {
        const [usersResponse, officialResponse] = await Promise.all([
          api.get('api/admin/users_api.php', { signal: controller.signal }),
          api.get('api/registrar/student_information.php', { signal: controller.signal }),
        ]);
        const usersPayload = Array.isArray(usersResponse.data)
          ? usersResponse.data
          : Array.isArray(usersResponse.data?.users)
            ? usersResponse.data.users
            : Array.isArray(usersResponse.data?.data)
              ? usersResponse.data.data
              : [];

        const usersByAdmissionNumber = new Map(usersPayload
          .filter((user) => String(user?.role || '').trim().toLowerCase() === 'student')
          .filter((user) => String(user?.id_number || '').trim() !== '')
          .map((user) => [String(user.id_number).trim(), user]));
        const officialStudents = Array.isArray(officialResponse.data?.students)
          ? officialResponse.data.students
          : [];
        const studentRecordsFromOfficialData = officialStudents.map((official) => ({
          official,
          user: usersByAdmissionNumber.get(String(official.admission_number || '').trim()) || {},
        }));

        const records = await Promise.all(
          studentRecordsFromOfficialData.map(async ({ official, user }) => {
            const studentId = user?.id ?? user?.student_id;
            const email = user?.email || '';
            const admissionNumber = String(official.admission_number || official.id_number || '').trim();
            const optionalRequest = (url) => api.get(url, { signal: controller.signal }).catch((error) => {
              if (controller.signal.aborted) throw error;
              console.error('Optional student details request failed:', error);
              return null;
            });
            const profileLookup = studentId
              ? `student_id=${encodeURIComponent(studentId)}`
              : `email=${encodeURIComponent(email)}`;
            const profileRequest = studentId || email
              ? optionalRequest(`api/student/student_profile.php?${profileLookup}`)
              : Promise.resolve(null);
            const preferenceParams = new URLSearchParams();
            if (studentId) preferenceParams.set('student_id', String(studentId));
            if (admissionNumber) preferenceParams.set('admission_number', admissionNumber);
            const preferencesRequest = studentId || admissionNumber
              ? optionalRequest(`api/student/student_preferences.php?${preferenceParams.toString()}`)
              : Promise.resolve(null);
            const [profileResponse, preferencesResponse] = await Promise.all([
              profileRequest,
              preferencesRequest,
            ]);
            const profile = profileResponse?.data?.student || profileResponse?.data?.data || {};

            const cgpaValue = Number(official.cgpa ?? profile?.cgpa ?? profile?.gpa ?? user?.cgpa ?? 0);
            const numericCgpa = Number.isFinite(cgpaValue) ? cgpaValue : 0;
            const g12 = official.total_mark ?? null;
            const cocValue = official.coc_score === null || official.coc_score === undefined
              ? null
              : Number(official.coc_score);
            const gender = String(official.sex || '');
            const hasDisability = parseYesNo(official.disability);
            const minority = parseYesNo(official.minority);
            const hasCgpaScore = (official.cgpa !== null && official.cgpa !== undefined)
              || (profile?.cgpa !== null && profile?.cgpa !== undefined)
              || (profile?.gpa !== null && profile?.gpa !== undefined)
              || (user?.cgpa !== null && user?.cgpa !== undefined);
            const fullName = [
              official.given_name,
              official.father_name,
              official.grandfather_name,
            ].filter(Boolean).join(' ');
            const calculatedScoreBreakdown = hasCgpaScore && g12 !== null && cocValue !== null
              ? calculateCumulativeScoreBreakdown({
              gpa: numericCgpa,
              grade12: g12,
              coc: cocValue,
              gender,
              region: official.region,
              disability: hasDisability,
              minority,
              }, placementRulesRef.current)
              : null;
            const scoreBreakdown = official.score_breakdown || calculatedScoreBreakdown;
            const cumulativeScore = scoreBreakdown?.cumulative_score
              ?? calculateCumulativeScore({
                gpa: numericCgpa,
                grade12: g12,
                coc: cocValue,
                gender,
                region: official.region,
                disability: hasDisability,
                minority,
              }, placementRulesRef.current);

            const preferencesPayload = preferencesResponse?.data || {};
            const preferences = Array.isArray(preferencesPayload.choices)
              ? preferencesPayload.choices
              : Array.isArray(preferencesPayload.data)
                ? preferencesPayload.data
                : Array.isArray(preferencesPayload)
                  ? preferencesPayload
                  : [];
            const choices = preferences
              .map((preference, index) => {
                const departmentId = preference?.dept_id ?? preference?.department_id ?? null;
                const name = preference?.dept_name || preference?.department || preference?.name || preference?.department_name || preference?.label
                  || (departmentId !== null ? `Department #${departmentId}` : '');
                if (!name) return null;
                return {
                  dept_id: departmentId,
                  priority: Number(preference?.priority ?? preference?.rank ?? index + 1),
                  department: name,
                  college: preference?.college_name || preference?.collegeName || preference?.college || '',
                  stream: preference?.stream || '',
                };
              })
              .filter(Boolean)
              .sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99));

            return {
              id: studentId ?? official.admission_number,
              id_number: official.admission_number,
              admission_number: official.admission_number,
              given_name: official.given_name || '',
              father_name: official.father_name || '',
              first_name: official.given_name || '',
              last_name: official.father_name || '',
              grandfather_name: official.grandfather_name || '',
              region: official.region || official.Region || '',
              username: user?.username || '',
              name: fullName || 'Unknown Student',
              email,
              phone: user?.phone_number || '',
              gpa: numericCgpa.toFixed(2),
              cgpa: numericCgpa.toFixed(2),
              stream: formatStudentStream(official.field_of_study || ''),
              field_of_study: String(
                official.field_of_study
                  || official.fieldOfStudy
                  || official.FieldOfStudy
                  || official.Fieldofstudy
                  || ''
              ).trim(),
              g12,
              total_mark: g12,
              coc: cocValue,
              coc_score: cocValue,
              gender,
              sex: gender,
              hasDisability,
              disability: official.disability,
              minority: official.minority,
              placement_status: profile?.placement_result_department
                ? (profile?.placement_result_status === 'Approved' ? 'Approved' : 'Placed')
                : (official.placement_status || 'Pending'),
              cumulativeScore,
              cumulative_score: cumulativeScore,
              score_breakdown: scoreBreakdown,
              placement_result_score: profile?.placement_result_score ?? null,
              department: profile?.department || profile?.placement_result_department || '',
              department_id: profile?.department_id ?? null,
              status: profile?.placement_result_department
                ? (profile?.placement_result_status === 'Approved' ? 'Approved' : 'Placed')
                : (official.placement_status || 'Pending'),
              placementResult: profile?.placement_result_department || profile?.placement_result || null,
              choices,
            };
          })
        );
        if (isCurrent) setStudentRecords(records.filter((record) => record.name.trim()));
      } catch (error) {
        if (!isCurrent || controller.signal.aborted) return;
        console.error('Failed to fetch student records:', error);
        setStudentRecords([]);
        setStudentInfoError(
          error.response?.data?.message || error.message || 'Unable to load student records.',
        );
      } finally {
        if (isCurrent) setStudentInfoLoading(false);
      }
    };

    fetchStudentRecords();
    return () => {
      isCurrent = false;
      controller.abort();
      setStudentInfoLoading(false);
    };
  }, [registrar, tab, studentRecordsRefreshToken]);

  /*
  useEffect(() => {
    if (!registrar || tab !== 'student-info') return undefined;
    const refreshRecordsOnFocus = () => {
      if (document.visibilityState === 'visible') {
        setStudentRecordsRefreshToken((current) => current + 1);
      }
    };
    window.addEventListener('focus', refreshRecordsOnFocus);
    return () => window.removeEventListener('focus', refreshRecordsOnFocus);
  }, [registrar, tab]);

  // Refresh overview counts from the database-backed dashboard API when Overview opens.
  useEffect(() => {
    const fetchDashboardOverview = async () => {
      try {
        const response = await api.get('api/common/dashboard_overview_api.php');
        
        if (response.data?.success) {
          const stats = response.data?.data ?? response.data;
          setSummary({
            totalDepartments: Number(stats.total_departments ?? stats.departments ?? 0),
            placementsCompleted: Number(stats.placementsCompleted ?? 0),
            awaitingPlacement: Number(stats.awaiting_placement ?? stats.unplacedStudents ?? 0),
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
    });
  */
  /*
          const role = String(user?.role || '').trim().toLowerCase();
          return role === 'student';
        });

        const records = await Promise.all(
          studentUsers.map(async (user) => {
            const studentId = user?.id ?? user?.student_id;
            const email = user?.email || '';
            let profile = {};

            if (studentId || email) {
              try {
                const lookup = studentId
                  ? `student_id=${encodeURIComponent(studentId)}`
                  : `email=${encodeURIComponent(email)}`;
                const profileResponse = await api.get(`api/student/student_profile.php?${lookup}`);
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
            const cocValue = coc !== null && coc !== undefined && coc !== '' ? Number(coc) : null;

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
            const preferenceStudentId = studentId ?? profile?.student_id ?? profile?.id ?? null;
            if (preferenceStudentId) {
              try {
                const preferencesResponse = await api.get(`api/student/student_preferences.php?student_id=${encodeURIComponent(preferenceStudentId)}`);
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
              stream: formatStudentStream(user?.stream || profile?.stream || profile?.department_stream),
              g12: g12,
              coc: cocValue,
              gender,
              hasDisability: hasDisability,
              minority: minority,
              cumulativeScore: cumulativeScore,
              placement_result_score: profile?.placement_result_score ?? null,
              department: profile?.department || profile?.placement_result_department || profile?.program || profile?.department_name || user?.department || '',
              department_id: profile?.department_id ?? null,
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
  }, [placementRules, registrar, studentRecordsRefreshToken]);

  */
  useEffect(() => {
    if (!registrar || tab !== 'student-info') return undefined;
    const refreshRecordsOnFocus = () => {
      if (document.visibilityState === 'visible') {
        setStudentRecordsRefreshToken((current) => current + 1);
      }
    };
    window.addEventListener('focus', refreshRecordsOnFocus);
    return () => window.removeEventListener('focus', refreshRecordsOnFocus);
  }, [registrar, tab]);

  // Refresh overview counts from the database-backed dashboard API when Overview opens.
  useEffect(() => {
    const fetchDashboardOverview = async () => {
      try {
        const response = await api.get('api/common/dashboard_overview_api.php');
        
        if (response.data?.success) {
          const stats = response.data?.data ?? response.data;
          setSummary({
            totalDepartments: Number(stats.total_departments ?? stats.departments ?? 0),
            awaitingPlacement: Number(stats.awaiting_placement ?? stats.unplacedStudents ?? 0),
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

  useEffect(() => {
    if (!registrar || tab !== 'choice-matrix') {
      setChoiceMatrixLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let isCurrent = true;
    const loadChoiceMatrix = async () => {
      setChoiceMatrixLoading(true);
      setChoiceMatrixError('');
      try {
        const response = await api.get('api/registrar/get_student_choice_matrix.php', {
          signal: controller.signal,
        });
        if (response.data?.success !== true) {
          throw new Error(response.data?.message || 'Unable to load student choice data.');
        }
        const rows = Array.isArray(response.data?.data)
          ? response.data.data
          : Array.isArray(response.data?.students)
            ? response.data.students
            : Array.isArray(response.data)
              ? response.data
              : [];
        if (isCurrent) setChoiceMatrixRecords(rows);
      } catch (error) {
        if (!isCurrent || controller.signal.aborted) return;
        console.error('Failed to fetch student choice matrix:', error);
        setChoiceMatrixRecords([]);
        setChoiceMatrixError(
          error.response?.data?.message || error.message || 'Unable to load student choice data.',
        );
      } finally {
        if (isCurrent) setChoiceMatrixLoading(false);
      }
    };

    loadChoiceMatrix();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [registrar, tab, studentRecordsRefreshToken]);

  const departmentPreferenceCounts = choiceMatrixRecords.reduce((accumulator, student) => {
    (student.choices || []).forEach((choice) => {
      const departmentName = String(choice.department || '').trim();
      if (!departmentName || departmentName === 'Broad Group / Semester 2 Queue') return;
      accumulator[departmentName] = (accumulator[departmentName] || 0) + 1;
    });
    return accumulator;
  }, {});

  const maxChoicesCount = Math.max(
    1,
    ...choiceMatrixRecords.flatMap((record) => (
      (record.choices || []).map((choice) => Number(choice.priority) || 0)
    )),
  );
  const choiceMatrixRows = choiceMatrixRecords
    .map((record) => {
      const choices = Array.isArray(record.choices) ? record.choices : [];
      const prioritySlots = Array.from({ length: maxChoicesCount }, (_, index) => (
        record[`choice_${index + 1}`]
        || choices.find((choice) => Number(choice.priority || 0) === index + 1)?.department
        || '—'
      ));
      return {
        ...record,
        id: record.student_id,
        id_number: record.student_id,
        name: record.student_name || record.name || 'Unknown Student',
        email: record.email || '',
        choices,
        prioritySlots,
      };
    })
    .filter((student) => {
      const term = choiceMatrixSearch.trim().toLowerCase();
      const searchableText = [
        student.name,
        student.id_number,
        student.id,
        student.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !term || searchableText.includes(term);
      const matchesStream = choiceMatrixSelectedStream === 'All'
        || formatStudentStream(student.stream) === choiceMatrixSelectedStream;

      return matchesSearch && matchesStream;
    })
    .sort((left, right) => {
      const leftId = String(left.id_number || left.id || '');
      const rightId = String(right.id_number || right.id || '');
      return leftId.localeCompare(rightId, undefined, { numeric: true, sensitivity: 'base' });
    });
  const choiceMatrixTotalPages = Math.max(1, Math.ceil(choiceMatrixRows.length / CHOICE_MATRIX_PAGE_SIZE));
  const paginatedChoiceMatrixRows = choiceMatrixRows.slice(
    (choiceMatrixPage - 1) * CHOICE_MATRIX_PAGE_SIZE,
    choiceMatrixPage * CHOICE_MATRIX_PAGE_SIZE
  );

  const filteredStudents = [...studentRecords]
    .sort((left, right) => {
      const leftId = String(left.id_number || left.id || '');
      const rightId = String(right.id_number || right.id || '');
      if (!leftId) return rightId ? 1 : 0;
      if (!rightId) return -1;
      return leftId.localeCompare(rightId, undefined, { numeric: true, sensitivity: 'base' });
    })
    .filter((student) => {
      const searchTerm = studentSearch.trim().toLowerCase();
      if (!searchTerm) return true;

      const searchableText = [
        student.admission_number,
        student.given_name,
        student.father_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / STUDENT_PAGE_SIZE));
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * STUDENT_PAGE_SIZE,
    currentPage * STUDENT_PAGE_SIZE,
  );
  const visibleStudentAdmissions = paginatedStudents
    .map((student) => String(student.admission_number || student.id_number || '').trim())
    .filter(Boolean);
  const allVisibleStudentsSelected = visibleStudentAdmissions.length > 0
    && visibleStudentAdmissions.every((admissionNumber) => selectedPreferenceAdmissions.includes(admissionNumber));

  const toggleVisibleStudentSelection = (checked) => {
    setSelectedPreferenceAdmissions((current) => {
      const visibleSet = new Set(visibleStudentAdmissions);
      const remaining = current.filter((admissionNumber) => !visibleSet.has(admissionNumber));
      return checked ? [...remaining, ...visibleStudentAdmissions] : remaining;
    });
  };

  const clearSelectedStudentPreferences = async () => {
    const admissionNumbers = selectedPreferenceAdmissions.filter(Boolean);
    if (!admissionNumbers.length || clearingStudentPreferences) return;
    const confirmed = window.confirm(
      `Clear saved preferences for ${admissionNumbers.length} selected student(s)? Student records will not be deleted.`,
    );
    if (!confirmed) return;

    setClearingStudentPreferences(true);
    setClearPreferencesFeedback('');
    setClearPreferencesError('');
    try {
      const response = await api.post(
        'api/registrar/clear_student_preferences.php',
        { admissionNumbers },
        { withCredentials: true },
      );
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to clear selected student preferences.');
      }
      setClearPreferencesFeedback(response.data.message || 'Selected student preferences were cleared.');
      setSelectedPreferenceAdmissions([]);
      setStudentRecordsRefreshToken((current) => current + 1);
    } catch (error) {
      setClearPreferencesError(
        error.response?.data?.message || error.message || 'Unable to clear selected student preferences.',
      );
    } finally {
      setClearingStudentPreferences(false);
    }
  };

  const deleteStudentRecords = async (admissionNumbers) => {
    const studentsToDelete = [...new Set(admissionNumbers.map((value) => String(value || '').trim()).filter(Boolean))];
    if (!studentsToDelete.length || deletingStudents) return;
    const confirmed = window.confirm(
      `Permanently delete ${studentsToDelete.length} student record(s), including their account, profile, preferences, placements, appeals, notifications, and pending allocations? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingStudents(true);
    setDeleteStudentsFeedback('');
    setDeleteStudentsError('');
    try {
      const response = await api.post(
        'api/registrar/delete_student.php',
        { admissionNumbers: studentsToDelete },
        { withCredentials: true },
      );
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to delete selected student records.');
      }
      setDeleteStudentsFeedback(response.data.message || 'Student records deleted successfully.');
      setSelectedPreferenceAdmissions((current) => current.filter((value) => !studentsToDelete.includes(value)));
      setStudentRecordsRefreshToken((current) => current + 1);
    } catch (error) {
      setDeleteStudentsError(
        error.response?.data?.message || error.message || 'Unable to delete selected student records.',
      );
    } finally {
      setDeletingStudents(false);
    }
  };

  const openStudentAttributeEditor = (student) => {
    setEditingStudent(student);
    setStudentEditForm({
      gpa: String(student.gpa ?? student.cgpa ?? ''),
      coc_score: String(student.coc ?? student.coc_result ?? 0),
      field_of_study: formatStudentStream(student.field_of_study ?? student.stream ?? ''),
    });
    setStudentAttributesError('');
    setStudentAttributesSuccess('');
  };

  const handleSaveStudentAttributes = async (event) => {
    event.preventDefault();
    const studentId = Number(editingStudent?.id ?? editingStudent?.student_id);
    const admissionNumber = String(editingStudent?.admission_number ?? editingStudent?.id_number ?? '').trim();
    const hasStudentId = Number.isInteger(studentId) && studentId > 0;
    if (!hasStudentId && !admissionNumber) {
      setStudentAttributesError('Unable to update this student because the student ID is invalid.');
      return;
    }

    setSavingStudentAttributes(true);
    setStudentAttributesError('');
    setStudentAttributesSuccess('');
    try {
      const response = await api.post('api/registrar/update_student.php', {
        student_id: hasStudentId ? studentId : null,
        admission_number: admissionNumber,
        cgpa: studentEditForm.gpa,
        coc_score: studentEditForm.coc_score,
        field_of_study: studentEditForm.field_of_study,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to update student record.');
      }
      const updatedStudent = response.data.student;
      setStudentRecords((records) => records.map((record) => (
        (hasStudentId && Number(record.id) === studentId)
          || (admissionNumber !== '' && String(record.admission_number ?? record.id_number ?? '') === admissionNumber)
          ? {
              ...record,
              ...updatedStudent,
              id: updatedStudent.id ?? record.id,
              gpa: Number(updatedStudent.gpa).toFixed(2),
              cgpa: Number(updatedStudent.gpa).toFixed(2),
              field_of_study: updatedStudent.field_of_study,
              stream: formatStudentStream(updatedStudent.field_of_study),
              coc: updatedStudent.coc_score,
              hasDisability: parseYesNo(updatedStudent.disability),
              name: `${updatedStudent.first_name} ${updatedStudent.last_name}`.trim(),
              cumulativeScore: Number(updatedStudent.cumulative_avg ?? record.cumulativeScore),
            }
          : record
      )));
      setEditingStudent(null);
      setStudentEditForm(null);
      setStudentAttributesSuccess(response.data.message || 'Student record updated successfully.');
    } catch (error) {
      setStudentAttributesError(
        error.response?.data?.message || error.message || 'Unable to update student record.',
      );
    } finally {
      setSavingStudentAttributes(false);
    }
  };

  const filteredCapacityDepartments = (departments || []).filter((department) => {
    const name = String(department.name || '').toLowerCase().trim();
    const college = String(department.standardized_college_name || department.college || '').toLowerCase().trim();
    const streamName = getDepartmentStream(department);
    const currentStream = normalizePlacementStream(streamFilter);
    const departmentStream = normalizePlacementStream(streamName);

    if (
      !['all', 'allstreams'].includes(currentStream)
      && departmentStream !== currentStream
    ) {
      return false;
    }

    const query = (deptSearch || '').trim().toLowerCase();
    return !query || `${name} ${college} ${streamName}`.toLowerCase().includes(query);
  });
  const capacityTotalPages = Math.max(1, Math.ceil(filteredCapacityDepartments.length / PAGE_SIZE));
  const paginatedCapacityDepartments = filteredCapacityDepartments.slice(
    (capacityPage - 1) * PAGE_SIZE,
    capacityPage * PAGE_SIZE
  );
  const visibleCapacityDepartmentIds = paginatedCapacityDepartments.map((department) => String(department.id));
  const allVisibleCapacityDepartmentsSelected = visibleCapacityDepartmentIds.length > 0
    && visibleCapacityDepartmentIds.every((id) => selectedCapacityDepartmentIds.includes(id));
  const selectedCapacityDepartmentCount = selectedCapacityDepartmentIds.filter((id) => (
    departments.some((department) => String(department.id) === id)
  )).length;
  const toggleVisibleCapacitySelection = () => {
    setSelectedCapacityDepartmentIds((current) => {
      if (allVisibleCapacityDepartmentsSelected) {
        return current.filter((id) => !visibleCapacityDepartmentIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleCapacityDepartmentIds]));
    });
  };
  const latestPlacementRun = pendingResults[0] || null;
  const forceRerunRequired = hasPublishedPlacementResults || forceRerunAvailable;

  const activatePlacementSemester = async (semester) => {
    setPlacementMode(semester);
    setSelectedStream('');
    setSelectedStudentIds([]);
    setCompleteSemesterRun(false);
    setPlacementError('');
    setSemesterActivationError('');
    setSemesterActivationNotice('');

    if (activeSemester === semester && semester !== 2) return;

    setActivatingSemester(semester);
    try {
      const response = await api.post(
        'api/registrar/activate_second_semester.php',
        { semester },
        { withCredentials: true },
      );
      const result = response.data || {};
      if (!result.success || Number(result.active_semester) !== semester) {
        throw new Error(result.message || `Unable to activate Semester ${semester}.`);
      }

      setActiveSemester(semester);
      setStudentRecordsRefreshToken((token) => token + 1);
      if (semester === 2 && Number(result.reallocated_count) > 0) {
        const reallocatedStudents = new Set(
          (Array.isArray(result.reallocated_students) ? result.reallocated_students : [])
            .map((admissionNumber) => String(admissionNumber).trim().toUpperCase()),
        );
        setPendingResults((current) => current.map((placementRun) => ({
          ...placementRun,
          placements: placementRun.placements.map((placement) => (
            placement.status === 'pending_second_semester'
              && reallocatedStudents.has(String(placement.id_number || '').trim().toUpperCase())
              ? { ...placement, college: 'College of Other Social Sciences' }
              : placement
          )),
        })));
        setSemesterActivationNotice(
          `${Number(result.reallocated_count)} pending Law student(s) were moved to College of Other Social Sciences because Law has no remaining Semester 2 capacity.`,
        );
      }
    } catch (error) {
      setSemesterActivationError(
        error?.response?.data?.message
          || error?.message
          || `Unable to activate Semester ${semester}.`,
      );
    } finally {
      setActivatingSemester(null);
    }
  };

  const rerunPlacement = async (forceRerun = false) => {
    setRerunningPlacement(true);
    setPlacementError('');
    try {
      const endpoint = activeSemester === 2
        ? 'api/registrar/run_second_semester_placement.php'
        : 'api/registrar/placement_engine.php';
      const forceQuery = forceRerun
        ? '?action=force_rerun_placement&force_rerun=true'
        : '';
      const response = await api.post(`${endpoint}${forceQuery}`, {
        action: forceRerun ? 'force_rerun_placement' : 'rerun_unpublished',
        semester: activeSemester,
        force_rerun: forceRerun === true,
        rerun_unpublished: true,
        selectedStudentIds: [],
        students: [],
        selectedCollege: 'all',
        selectedStream: 'all',
        completeSemesterRun: false,
      });
      const result = response.data || {};
      if (!result.success) {
        throw new Error(result.message || 'Unable to rerun placement.');
      }

      const summary = result.summary || {};
      const outcome = {
        assigned: Number(summary.assignedStudents ?? result.assigned ?? 0),
        unassigned: Number(summary.unassignedStudents ?? result.unassigned ?? 0),
        deferred: Number(summary.deferredStudents ?? 0),
        pending: Number(summary.pendingStudents ?? 0),
        alreadyPlaced: Number(summary.alreadyPlacedStudents ?? result.already_placed ?? 0),
        total: Number(summary.totalStudents ?? result.total_processed ?? 0),
      };
      const placementRun = {
        id: Date.now(),
        summary: outcome,
        placements: Array.isArray(result.placements) ? result.placements : [],
        createdAt: new Date().toISOString(),
      };
      setRunResult(outcome);
      setPendingResults((current) => [placementRun, ...current]);
      setSelectedStudentIds([]);
      setHasPublishedPlacementResults(false);
      setHasUnpublishedPlacementResults(true);
      setForceRerunAvailable(false);
      setUnassignedStudentsRefreshToken((token) => token + 1);
      setStudentRecordsRefreshToken((token) => token + 1);
      localStorage.setItem('studentPlacementSummary', JSON.stringify({
        studentId: registrar?.id || 'registrar-run',
        batch: placementBatch,
        date: placementRun.createdAt,
        placementRuns: placementRun.placements,
        status: 'run-complete',
      }));
      setShowRerunConfirmation(false);
    } catch (error) {
      const serverMessage = error?.response?.data?.message;
      if (
        error?.response?.status === 409
        && typeof serverMessage === 'string'
        && /already been published.*force rerun/i.test(serverMessage)
      ) {
        setForceRerunAvailable(true);
        setHasPublishedPlacementResults(true);
      }
      setPlacementError(serverMessage || error.message || 'Unable to rerun placement.');
    } finally {
      setRerunningPlacement(false);
    }
  };

  const handleClearPlacements = async () => {
    const confirmed = window.confirm('This will clear all placement allocations, reset student placement status, and restore capacity data. Continue?');
    if (!confirmed) {
      return;
    }

    setClearingPlacements(true);
    setPlacementError('');
    try {
      const response = await api.post('api/registrar/clear_placements.php', { clear_placements: true }, { withCredentials: true });
      const result = response.data || {};
      if (!result.success) {
        throw new Error(result.message || 'Unable to clear placements.');
      }

      setPendingResults([]);
      setRunResult(null);
      setSelectedStudentIds([]);
      setHasPublishedPlacementResults(false);
      setHasUnpublishedPlacementResults(false);
      setForceRerunAvailable(false);
      setUnassignedStudentsRefreshToken((token) => token + 1);
      setStudentRecordsRefreshToken((token) => token + 1);
      localStorage.removeItem('studentPlacementSummary');
      setCapacityLoading(true);
      try {
        await fetchDepartments();
      } catch (refreshError) {
        setCapacityError(refreshError.response?.data?.message || refreshError.message || 'Unable to refresh department capacity data.');
      } finally {
        setCapacityLoading(false);
      }
      setPlacementError('');
    } catch (error) {
      const serverMessage = error?.response?.data?.message || error?.message || 'Unable to clear placements.';
      setPlacementError(serverMessage);
    } finally {
      setClearingPlacements(false);
    }
  };

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

  const streamOptions = getPlacementStreamOptions(departments);

  useEffect(() => {
    if (!registrar || tab !== 'run-placement') return undefined;

    let isCurrent = true;
    const params = {
      stream: selectedStream,
      college: 'all',
    };
    setPlacementCandidatesData([]);
    setSelectedStudentIds([]);
    setPlacementCandidatesLoading(true);
    setPlacementCandidatesError('');
    console.debug('[Run Placement] Fetching candidate students', params);

    const candidatesEndpoint = placementMode === 2
      ? 'api/registrar/get_second_semester_candidates.php'
      : 'api/registrar/get_placement_candidates.php';
    api.get(candidatesEndpoint, {
      params: { ...params, semester: placementMode },
      withCredentials: true,
    })
      .then((response) => {
        if (!isCurrent) return;
        if (response.data?.success === false || response.data?.status === 'error') {
          throw new Error(response.data?.message || 'Unable to load candidate students.');
        }
        const responseCandidates = Array.isArray(response.data?.candidates)
          ? response.data.candidates
          : Array.isArray(response.data?.students)
            ? response.data.students
            : Array.isArray(response.data?.data)
              ? response.data.data
              : [];
        const candidates = responseCandidates.map((candidate) => (
          normalizePlacementCandidateChoices(candidate, placementMode)
        ));
        console.debug('[Run Placement] Candidate students response', {
          success: response.data?.success,
          filters: response.data?.filters,
          count: candidates.length,
          candidates: candidates.map(({ id, stream, choices = [] }) => ({
            id,
            stream,
            choices: choices.map(({ dept_name, department, college_name, stream: choiceStream }) => ({
              department: dept_name || department,
              college: college_name,
              stream: choiceStream,
            })),
          })),
        });
        setPlacementCandidatesData(candidates.filter(isActivePlacementCandidate));
      })
      .catch((error) => {
        if (!isCurrent) return;
        console.error('[Run Placement] Failed to fetch candidate students', {
          params,
          response: error.response?.data,
          error,
        });
        setPlacementCandidatesData([]);
        setPlacementCandidatesError(error.response?.data?.message || error.message || 'Unable to load candidate students.');
      })
      .finally(() => {
        if (isCurrent) setPlacementCandidatesLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [registrar, tab, placementMode, selectedStream, studentRecordsRefreshToken]);

  useEffect(() => {
    if (!registrar || tab !== 'run-placement') return undefined;

    let isCurrent = true;
    setPlacementPreviewLoading(true);
    setPlacementPreviewError('');
    api.get('api/registrar/placement_preview.php', { withCredentials: true })
      .then((response) => {
        if (!isCurrent) return;
        setPlacementPreviewData(Array.isArray(response.data?.students) ? response.data.students : []);
      })
      .catch((error) => {
        if (!isCurrent) return;
        setPlacementPreviewData([]);
        setPlacementPreviewError(
          error.response?.data?.message || error.message || 'Unable to load the cumulative score preview.',
        );
      })
      .finally(() => {
        if (isCurrent) setPlacementPreviewLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [registrar, tab, studentRecordsRefreshToken]);

  const placementCandidates = filterPlacementCandidates(
    placementCandidatesData,
    selectedStream,
    'all',
  );
  const eligiblePlacementCandidates = placementCandidates.filter((student) => (
    !getPlacementCandidateIneligibility(student, placementMode, placementRules.minGpa)
  ));
  const missingSemesterTwoAllocations = placementMode === 2
    && eligiblePlacementCandidates.some((student) => Number(student.has_pending_college_allocation) !== 1);
  const selectedPlacementCandidateCount = filterStudentIdsForPlacement(
    eligiblePlacementCandidates,
    selectedStudentIds,
  ).length;
  const isActivePlacementMode = placementMode === activeSemester;
  const placementRulesChanged = Boolean(placementRulesSnapshot.current)
    && Object.keys(placementRules).some((key) => placementRules[key] !== placementRulesSnapshot.current[key]);

  const savePlacementRules = async (event) => {
    event.preventDefault();
    if (!isEditingPlacementRules) return;
    const baseWeightTotal = Number(placementRules.grade12Weight)
      + Number(placementRules.gpaWeight)
      + Number(placementRules.cocWeight);
    const quotaTotal = Number(placementRules.generalQuotaPercent)
      + Number(placementRules.reservedFemaleQuotaPercent);
    if (Math.abs(baseWeightTotal - 100) > 0.00001) {
      setRulesError('Grade 12, CGPA, and COC weights must total 100%.');
      return;
    }
    if (!Number.isFinite(Number(placementRules.g12TotalBase))
      || Number(placementRules.g12TotalBase) <= 0
      || Number(placementRules.g12TotalBase) > 9999.99) {
      setRulesError('Grade 12 total base mark must be greater than 0 and no more than 9,999.99.');
      return;
    }
    if (!Number.isFinite(Number(placementRules.maxScoreCap))
      || Number(placementRules.maxScoreCap) < 0
      || Number(placementRules.maxScoreCap) > 100) {
      setRulesError('Maximum cumulative score must be between 0 and 100.');
      return;
    }
    if (Math.abs(quotaTotal - 100) > 0.00001) {
      setRulesError('General and reserved female quotas must total 100%.');
      return;
    }
    setRulesSaving(true);
    setRulesError('');

    try {
      const response = await api.post('api/registrar/update-rules.php', {
        gpa_weight: placementRules.gpaWeight,
        grade_12_weight: placementRules.grade12Weight,
        g12_total_base: placementRules.g12TotalBase,
        max_cumulative_score: placementRules.maxScoreCap,
        max_score_cap: placementRules.maxScoreCap,
        coc_weight: placementRules.cocWeight,
        female_bonus_points: placementRules.femaleBonusPoints,
        disability_bonus_points: placementRules.disabilityBonusPoints,
        minority_bonus_points: placementRules.minorityMaleBonusPoints,
        minority_male_bonus_points: placementRules.minorityMaleBonusPoints,
        minority_female_bonus_points: placementRules.minorityFemaleBonusPoints,
        minority_disability_bonus_points: placementRules.minorityDisabilityBonusPoints,
        female_disability_minority_bonus_points: placementRules.femaleDisabilityMinorityBonusPoints,
        general_quota_percent: placementRules.generalQuotaPercent,
        reserved_female_quota_percent: placementRules.reservedFemaleQuotaPercent,
        min_gpa: placementRules.minGpa,
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save placement rules.');
      }

      const savedSettings = response.data?.settings || response.data || {};
      const savedRules = {
        ...placementRules,
        gpaWeight: Number(savedSettings.gpa_weight ?? placementRules.gpaWeight),
        grade12Weight: Number(savedSettings.grade_12_weight ?? placementRules.grade12Weight),
        g12TotalBase: Number(savedSettings.g12_total_base ?? placementRules.g12TotalBase),
        maxScoreCap: Number(savedSettings.max_cumulative_score ?? savedSettings.max_score_cap ?? placementRules.maxScoreCap),
        cocWeight: Number(savedSettings.coc_weight ?? placementRules.cocWeight),
        femaleBonusPoints: Number(savedSettings.female_bonus_points ?? placementRules.femaleBonusPoints),
        disabilityBonusPoints: Number(savedSettings.disability_bonus_points ?? placementRules.disabilityBonusPoints),
        minorityMaleBonusPoints: Number(savedSettings.minority_male_bonus_points ?? savedSettings.minority_bonus_points ?? placementRules.minorityMaleBonusPoints),
        minorityFemaleBonusPoints: Number(savedSettings.minority_female_bonus_points ?? placementRules.minorityFemaleBonusPoints),
        minorityDisabilityBonusPoints: Number(savedSettings.minority_disability_bonus_points ?? placementRules.minorityDisabilityBonusPoints),
        femaleDisabilityMinorityBonusPoints: Number(savedSettings.female_disability_minority_bonus_points ?? placementRules.femaleDisabilityMinorityBonusPoints),
        generalQuotaPercent: Number(savedSettings.general_quota_percent ?? placementRules.generalQuotaPercent),
        reservedFemaleQuotaPercent: Number(savedSettings.reserved_female_quota_percent ?? placementRules.reservedFemaleQuotaPercent),
        minGpa: Number(savedSettings.min_gpa ?? placementRules.minGpa),
      };
      setPlacementRules(savedRules);
      localStorage.setItem('placementRules', JSON.stringify(savedRules));
      placementRulesSnapshot.current = null;
      setIsEditingPlacementRules(false);
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save placement rules:', error);
      setRulesError(error.response?.data?.message || error.message || 'Unable to save placement rules.');
    } finally {
      setRulesSaving(false);
    }
  };

  const cancelPlacementRulesEdit = () => {
    if (placementRulesSnapshot.current) {
      setPlacementRules(placementRulesSnapshot.current);
    }
    placementRulesSnapshot.current = null;
    setRulesError('');
    setIsEditingPlacementRules(false);
  };

  const startPlacementRulesEdit = () => {
    placementRulesSnapshot.current = { ...placementRules };
    setRulesError('');
    setRulesSaved(false);
    setIsEditingPlacementRules(true);
  };
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

  useEffect(() => {
    setChoiceMatrixPage(1);
  }, [choiceMatrixRecords.length, choiceMatrixSearch, choiceMatrixSelectedStream]);

  useEffect(() => {
    setCapacityPage(1);
  }, [streamFilter, deptSearch]);

  useEffect(() => {
    if (capacityPage > capacityTotalPages) {
      setCapacityPage(capacityTotalPages);
    }
  }, [capacityPage, capacityTotalPages]);

  useEffect(() => {
    if (choiceMatrixPage > choiceMatrixTotalPages) {
      setChoiceMatrixPage(choiceMatrixTotalPages);
    }
  }, [choiceMatrixPage, choiceMatrixTotalPages]);

  if (!registrar) return <div className="text-center mt-5">Loading...</div>;

  return (
    <div className="admin-dashboard container-fluid px-0 min-h-screen d-flex flex-column">
      <OfficialPrintLetterhead
        office="OFFICE OF THE UNIVERSITY REGISTRAR"
        title="OFFICIAL UNIVERSITY REGISTRAR DOCUMENT"
        metadata={`Academic Year: 2016 E.C. / 2026 G.C. | Generated on: ${new Date().toLocaleDateString()}`}
      />
      <div className="row g-0 flex-grow-1">
        <Sidebar role="registrar" activeItem={activeSidebarItem} onSelect={setTab} />

        <main className="col-md-10 p-5 main-content">
          {tab !== 'placed-students' && (
            <DashboardHeader
              variant="welcome"
              username={registrar.username}
              role="Registrar"
              subtitle="Debre Tabor University registrar workflow: department review, placement approval, and publishing decisions."
              dashboardPath="/registrar-dashboard/overview"
              onSelectTab={setTab}
            />
          )}

          {tab === 'overview' ? (
            <>
              <div className="row g-4 mb-4">
                <div className="col-lg-4 col-md-6">
                  <div
                    className="card summary-card shadow-sm h-100"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleCardClick('departments')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') handleCardClick('departments');
                    }}
                  >
                    <div className="card-body">
                      <span className="summary-label">{t('Departments')}</span>
                      <h3 className="summary-value">{summary.totalDepartments}</h3>
                      <small className="text-muted">DTU academic departments</small>
                      <div className="mt-2"><small className="text-primary fw-bold">Click to view details →</small></div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-4 col-md-6">
                  <div
                    className="card summary-card shadow-sm h-100"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleCardClick('placementsCompleted')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') handleCardClick('placementsCompleted');
                    }}
                  >
                    <div className="card-body">
                      <span className="summary-label">{t('Placements Completed')}</span>
                      <h3 className="summary-value">{summary.placementsCompleted}</h3>
                      <small className="text-muted">Department assignments finalized</small>
                      <div className="mt-2"><small className="text-warning fw-bold">Click to view details →</small></div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-4 col-md-6">
                  <div
                    className="card summary-card shadow-sm h-100"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleCardClick('unplacedStudents')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') handleCardClick('unplacedStudents');
                    }}
                  >
                    <div className="card-body">
                      <span className="summary-label">{t('Unplaced Students')}</span>
                      <h3 className="summary-value">{summary.awaitingPlacement}</h3>
                      <small className="text-muted">Awaiting placement run</small>
                      <div className="mt-2"><small className="fw-bold" style={{ color: '#fd7e14' }}>Click to view details →</small></div>
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
                        {cardDetailModal === 'placementsCompleted' && 'Placed Students'}
                        {cardDetailModal === 'unplacedStudents' && 'Unplaced Students'}
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
                    ) : cardDetailError ? (
                      <div className="alert alert-danger" role="alert">{cardDetailError}</div>
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
                                  <th>College</th>
                                  <th>Stream</th>
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
                                    <td>{item.admission_number || item.student_id}</td>
                                    <td><strong>{item.name || 'Student'}</strong></td>
                                    <td>{item.college || 'Not available'}</td>
                                    <td>{item.stream || 'Not available'}</td>
                                    <td><span className="badge bg-secondary">{item.current_status || 'Unassigned'}</span></td>
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
            <>
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <h4 className="card-title mb-0">Student Information</h4>
                  <div className="d-flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setStudentRecordsRefreshToken((current) => current + 1)}
                      disabled={studentInfoLoading}
                    >
                      {studentInfoLoading ? 'Refreshing...' : 'Refresh'}
                    </button>
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
                    <button
                      type="button"
                      className="btn btn-primary btn-sm register-new-student-btn"
                      onClick={() => setShowStudentRegistrationModal(true)}
                    >
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
                      placeholder="Search admission number, given name, or father name..."
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

                {studentAttributesSuccess && (
                  <div className="alert alert-success py-2" role="status">
                    {studentAttributesSuccess}
                  </div>
                )}
                {clearPreferencesFeedback && (
                  <div className="alert alert-success py-2" role="status">
                    {clearPreferencesFeedback}
                  </div>
                )}
                {clearPreferencesError && (
                  <div className="alert alert-danger py-2" role="alert">
                    {clearPreferencesError}
                  </div>
                )}
                {deleteStudentsFeedback && (
                  <div className="alert alert-success py-2" role="status">
                    {deleteStudentsFeedback}
                  </div>
                )}
                {deleteStudentsError && (
                  <div className="alert alert-danger py-2" role="alert">
                    {deleteStudentsError}
                  </div>
                )}
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                  <span className="text-muted">
                    {selectedPreferenceAdmissions.length} student{selectedPreferenceAdmissions.length === 1 ? '' : 's'} selected
                  </span>
                  <div className="d-flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className="btn btn-outline-danger"
                      onClick={clearSelectedStudentPreferences}
                      disabled={!selectedPreferenceAdmissions.length || clearingStudentPreferences || deletingStudents}
                    >
                      {clearingStudentPreferences
                        ? 'Clearing Preferences...'
                        : `Clear Preferences for Selected Students${selectedPreferenceAdmissions.length ? ` (${selectedPreferenceAdmissions.length})` : ''}`}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => deleteStudentRecords(selectedPreferenceAdmissions)}
                      disabled={!selectedPreferenceAdmissions.length || deletingStudents || clearingStudentPreferences}
                    >
                      {deletingStudents
                        ? 'Deleting Students...'
                        : `Delete Selected Students${selectedPreferenceAdmissions.length ? ` (${selectedPreferenceAdmissions.length})` : ''}`}
                    </button>
                  </div>
                </div>
                {studentInfoLoading ? (
                  <div className="text-muted">Loading student records from the database...</div>
                ) : studentInfoError ? (
                  <div className="alert alert-danger mb-0" role="alert">
                    {studentInfoError}
                  </div>
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
                            <th scope="col" className="text-center">
                              <input
                                type="checkbox"
                                className="form-check-input"
                                aria-label="Select all visible students"
                                checked={allVisibleStudentsSelected}
                                disabled={!visibleStudentAdmissions.length || clearingStudentPreferences || deletingStudents}
                                onChange={(event) => toggleVisibleStudentSelection(event.target.checked)}
                              />
                            </th>
                            <th>Admission Number</th>
                            <th>First Name</th>
                            <th>Father Name</th>
                            <th>Grandfather Name</th>
                            <th>Region</th>
                            <th>Sex</th>
                            <th>Field of Study</th>
                            <th>Total Mark (G12)</th>
                            <th>CGPA</th>
                            <th>COC Score</th>
                            <th>Disability</th>
                            <th>Minority</th>
                            <th>Cumulative Score</th>
                            <th>Placement Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedStudents.map((student, index) => {
                            const disabilityFlag = student.score_breakdown?.disability_flag
                              ?? parseYesNo(student.disability);
                            const minorityFlag = student.score_breakdown?.minority_flag
                              ?? (parseYesNo(student.minority)
                                || /\b(afar|somali|gambella|benishangul[\s-]*gumuz|benishangul|harari|developing|emerging)\b/i.test(String(student.region || '')));
                            const femaleFlag = student.score_breakdown?.female_flag
                              ?? String(student.sex || '').trim().toLowerCase() === 'female';
                            const scoreBreakdown = student.score_breakdown;
                            const scoreExpanded = expandedStudentScoreId === student.admission_number;
                            const fieldOfStudy = String(
                              student.field_of_study
                                || student.fieldOfStudy
                                || student.FieldOfStudy
                                || student.Fieldofstudy
                                || ''
                            ).trim();

                            return (
                            <React.Fragment key={`${student.id ?? student.admission_number ?? student.id_number ?? 'student'}-${index}`}>
                            <tr>
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  aria-label={`Select ${student.admission_number || student.id_number}`}
                                  checked={selectedPreferenceAdmissions.includes(String(student.admission_number || student.id_number || '').trim())}
                                  disabled={(!student.admission_number && !student.id_number) || clearingStudentPreferences || deletingStudents}
                                  onChange={(event) => {
                                    const admissionNumber = String(student.admission_number || student.id_number || '').trim();
                                    if (!admissionNumber) return;
                                    setSelectedPreferenceAdmissions((current) => (
                                      event.target.checked
                                        ? [...new Set([...current, admissionNumber])]
                                        : current.filter((item) => item !== admissionNumber)
                                    ));
                                  }}
                                />
                              </td>
                              <td className="fw-bold text-primary">{student.admission_number || '—'}</td>
                              <td>{student.given_name ?? '—'}</td>
                              <td>{student.father_name ?? '—'}</td>
                              <td>{student.grandfather_name ?? '—'}</td>
                              <td>{student.region || student.Region || '—'}</td>
                              <td>{student.sex || '—'}</td>
                              <td>{fieldOfStudy || '—'}</td>
                              <td className="text-center">{student.total_mark ?? '—'}</td>
                              <td className="text-center">
                                {Number.isFinite(Number(student.cgpa))
                                  ? Number(student.cgpa).toFixed(2)
                                  : '0.00'}
                              </td>
                              <td className="text-center">
                                {student.coc_score !== null && student.coc_score !== undefined
                                  && Number.isFinite(Number(student.coc_score))
                                  ? Number(student.coc_score)
                                  : '—'}
                              </td>
                              <td className="text-center">
                                <span className={`badge px-3 py-2 ${disabilityFlag ? 'bg-danger text-white' : 'bg-secondary text-white'}`}>
                                  {disabilityFlag ? 'Yes' : 'No'}
                                </span>
                              </td>
                              <td className="text-center">
                                <span className={`badge px-3 py-2 ${minorityFlag ? 'bg-info text-white' : 'bg-secondary text-white'}`}>
                                  {minorityFlag ? 'Yes' : 'No'}
                                </span>
                              </td>
                              <td className="text-center">
                                <div>{formatCumulativeScore(student.cumulativeScore ?? student.cumulative_score)}</div>
                                <button
                                  type="button"
                                  className="btn btn-link btn-sm p-0"
                                  aria-expanded={scoreExpanded}
                                  aria-label={`${scoreExpanded ? 'Hide' : 'Show'} score breakdown for ${student.admission_number}`}
                                  onClick={() => setExpandedStudentScoreId(
                                    scoreExpanded ? null : student.admission_number,
                                  )}
                                >
                                  {scoreExpanded ? 'Hide breakdown' : 'Score breakdown'}
                                </button>
                              </td>
                              <td className="text-center">
                                <span className={`badge px-3 py-2 ${
                                  ['placed', 'placed in semester 1', 'allocated', 'approved']
                                    .includes(String(student.placement_status || '').trim().toLowerCase())
                                    ? 'bg-success text-white' 
                                    : String(student.placement_status || '').trim().toLowerCase() === 'pending'
                                      ? 'bg-warning text-dark' 
                                      : 'bg-secondary text-white'
                                }`}>
                                  {student.placement_status || 'Pending'}
                                </span>
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={() => openStudentAttributeEditor(student)}
                                  disabled={deletingStudents || clearingStudentPreferences}
                                >
                                  Update Scores
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger ms-2"
                                  onClick={() => deleteStudentRecords([
                                    student.admission_number || student.id_number,
                                  ])}
                                  disabled={deletingStudents || clearingStudentPreferences}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                            {scoreExpanded && (
                              <tr>
                                <td colSpan={16} className="bg-body-tertiary px-4 py-3">
                                  <section
                                    aria-label={`Cumulative score breakdown for ${student.admission_number}`}
                                    className="border rounded bg-white p-3"
                                  >
                                    <h6 className="fw-bold mb-3">Cumulative Score Breakdown</h6>
                                    {scoreBreakdown ? (
                                      <div className="row g-3">
                                        <div className="col-md-4">
                                          <div className="fw-semibold">Base Score</div>
                                          <div>CGPA contribution: {Number(scoreBreakdown.cgpa_contribution).toFixed(2)}</div>
                                          <div>G12 contribution: {Number(scoreBreakdown.grade12_contribution).toFixed(2)}</div>
                                          <div>COC contribution: {Number(scoreBreakdown.coc_contribution).toFixed(2)}</div>
                                          <div className="fw-semibold mt-1">Base total: {Number(scoreBreakdown.base_score).toFixed(2)}</div>
                                        </div>
                                        <div className="col-md-5">
                                          <div className="fw-semibold">Applied Affirmative Action Bonuses</div>
                                          {scoreBreakdown.applied_scenario ? (
                                            <>
                                              <div>Female: {femaleFlag ? 'Yes' : 'No'}</div>
                                              <div>Minority / developing region{student.region ? ` (${student.region})` : ''}: {minorityFlag ? 'Yes' : 'No'}</div>
                                              <div>Disability: {disabilityFlag ? 'Yes' : 'No'}</div>
                                              <div>Applied rule: {placementScenarioLabels[scoreBreakdown.applied_scenario] || scoreBreakdown.applied_scenario}</div>
                                              <div>Scenario bonus: +{Number(scoreBreakdown.scenario_bonus).toFixed(2)}</div>
                                            </>
                                          ) : (
                                            <>
                                              <div>Female: {femaleFlag ? 'Yes' : 'No'} ({femaleFlag ? '+' : ''}{Number(scoreBreakdown.female_bonus).toFixed(2)})</div>
                                              <div>Minority / developing region{student.region ? ` (${student.region})` : ''}: {minorityFlag ? 'Yes' : 'No'} ({minorityFlag ? '+' : ''}{Number(scoreBreakdown.minority_bonus).toFixed(2)})</div>
                                              <div>Disability: {disabilityFlag ? 'Yes' : 'No'} ({disabilityFlag ? '+' : ''}{Number(scoreBreakdown.disability_bonus).toFixed(2)})</div>
                                            </>
                                          )}
                                          <div className="fw-semibold mt-1">Total bonus: +{Number(scoreBreakdown.affirmative_action_bonus).toFixed(2)}</div>
                                        </div>
                                        <div className="col-md-3">
                                          <div className="fw-semibold">Final Cumulative Score</div>
                                          <div>{Number(scoreBreakdown.base_score).toFixed(2)} + {Number(scoreBreakdown.affirmative_action_bonus).toFixed(2)} = <strong>{Number(scoreBreakdown.cumulative_score).toFixed(2)}</strong></div>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-muted mb-0">Score breakdown is unavailable until CGPA, G12 mark, and COC score are recorded.</p>
                                    )}
                                  </section>
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {filteredStudents.length > STUDENT_PAGE_SIZE && (
                      <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                        <div className="text-muted small">
                          Showing {Math.min((currentPage - 1) * STUDENT_PAGE_SIZE + 1, filteredStudents.length)}-{Math.min(currentPage * STUDENT_PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length}
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
                          {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                            <button
                              key={page}
                              type="button"
                              className={`btn btn-sm ${currentPage === page ? 'btn-primary' : 'btn-outline-secondary'}`}
                              onClick={() => setCurrentPage(page)}
                              aria-label={`Page ${page}`}
                              aria-current={currentPage === page ? 'page' : undefined}
                            >
                              {page}
                            </button>
                          ))}
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
            {editingStudent && (
              <div
                className="modal d-block"
                role="dialog"
                aria-modal="true"
                aria-labelledby="student-attributes-modal-title"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1050 }}
              >
                <div className="modal-dialog modal-dialog-centered">
                  <form className="modal-content" onSubmit={handleSaveStudentAttributes}>
                    <div className="modal-header">
                      <h5 className="modal-title" id="student-attributes-modal-title">
                        Update Student Info (CGPA, COC &amp; Field of Study)
                      </h5>
                      <button
                        type="button"
                        className="btn-close"
                        aria-label="Close"
                        onClick={() => setEditingStudent(null)}
                        disabled={savingStudentAttributes}
                      />
                    </div>
                    <div className="modal-body">
                      <p className="text-muted">
                        {editingStudent.name || `${editingStudent.first_name || ''} ${editingStudent.last_name || ''}`.trim()}
                      </p>
                      {studentAttributesError && (
                        <div className="alert alert-danger py-2" role="alert">{studentAttributesError}</div>
                      )}
                      <div className="row g-3 mb-3">
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="registrar-student-gpa">CGPA</label>
                          <input
                            id="registrar-student-gpa"
                            className="form-control"
                            type="number"
                            min="0"
                            max="4"
                            step="0.01"
                            value={studentEditForm?.gpa || ''}
                            onChange={(event) => setStudentEditForm((current) => ({ ...current, gpa: event.target.value }))}
                            required
                            disabled={savingStudentAttributes}
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="registrar-student-field-of-study">Field of Study</label>
                          <select
                            id="registrar-student-field-of-study"
                            className="form-select"
                            value={studentEditForm?.field_of_study || ''}
                            onChange={(event) => setStudentEditForm((current) => ({ ...current, field_of_study: event.target.value }))}
                            required
                            disabled={savingStudentAttributes}
                          >
                            <option value="">Select field of study</option>
                            <option value="Natural Science">Natural Science</option>
                            <option value="Social Science">Social Science</option>
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="registrar-student-coc">COC score</label>
                          <input
                            id="registrar-student-coc"
                            className="form-control"
                            type="number"
                            min="0"
                            max="30"
                            step="0.01"
                            value={studentEditForm?.coc_score || ''}
                            onChange={(event) => setStudentEditForm((current) => ({ ...current, coc_score: event.target.value }))}
                            required
                            disabled={savingStudentAttributes}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => setEditingStudent(null)}
                        disabled={savingStudentAttributes}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={savingStudentAttributes}>
                        {savingStudentAttributes ? 'Saving...' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            </>
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
                  <div className="col-md-5">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search by student name, ID, or email..."
                      value={choiceMatrixSearch}
                      onChange={(e) => setChoiceMatrixSearch(e.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <select
                      className="form-select"
                      aria-label="Filter students by stream"
                      value={choiceMatrixSelectedStream}
                      onChange={(e) => setChoiceMatrixSelectedStream(e.target.value)}
                    >
                      <option value="All">All Streams</option>
                      <option value="Natural Science">Natural Science</option>
                      <option value="Social Science">Social Science</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <div className="alert alert-light border mb-0 py-2 px-3">
                      <strong>{Object.keys(departmentPreferenceCounts).length}</strong> departments with preference entries
                    </div>
                  </div>
                </div>

                <ChoiceMatrix
                  students={paginatedChoiceMatrixRows}
                  loading={choiceMatrixLoading}
                  error={choiceMatrixError}
                  totalStudentCount={choiceMatrixRows.length}
                  totalRecordCount={choiceMatrixRecords.length}
                  maxChoicesCount={maxChoicesCount}
                  allStudents={choiceMatrixRows}
                  hasInvalidStreamChoice={hasInvalidStreamChoice}
                  activeSemester={activeSemester}
                  onChoicesDeleted={() => setStudentRecordsRefreshToken((current) => current + 1)}
                />
                {choiceMatrixRows.length > CHOICE_MATRIX_PAGE_SIZE && (
                  <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                    <div className="text-muted small">
                      Showing {Math.min((choiceMatrixPage - 1) * CHOICE_MATRIX_PAGE_SIZE + 1, choiceMatrixRows.length)} to {Math.min(choiceMatrixPage * CHOICE_MATRIX_PAGE_SIZE, choiceMatrixRows.length)} of {choiceMatrixRows.length} entries
                    </div>
                    <div className="btn-group" role="group" aria-label="Student choice matrix pagination">
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setChoiceMatrixPage((page) => Math.max(1, page - 1))}
                        disabled={choiceMatrixPage === 1}
                      >
                        Previous
                      </button>
                      <button type="button" className="btn btn-sm btn-light" disabled>
                        Page {choiceMatrixPage} of {choiceMatrixTotalPages}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setChoiceMatrixPage((page) => Math.min(choiceMatrixTotalPages, page + 1))}
                        disabled={choiceMatrixPage === choiceMatrixTotalPages}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : tab === 'student-registration' ? (
            <StudentRegistration onBack={() => setTab('student-info')} onSuccess={() => setTab('student-info')} />
          ) : tab === 'data-import' ? (
            <>
              <MinistryImport onImportSuccess={() => setStudentRecordsRefreshToken((current) => current + 1)} />
              <SIMSImport onImportSuccess={() => setStudentRecordsRefreshToken((current) => current + 1)} />
            </>
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
                    onClick={approveSelectedDepartmentCapacities}
                    disabled={capacityLoading || capacitySaving || selectedCapacityDepartmentCount === 0}
                  >
                    {capacitySavingAction === 'approve'
                      ? 'Approving selected capacities...'
                      : `Approve Selected (${selectedCapacityDepartmentCount})`}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-warning"
                    onClick={unlockDepartmentCapacities}
                    disabled={capacityLoading || capacitySaving || lockedCapacityCount === 0}
                  >
                    {capacitySavingAction === 'unlock' ? 'Unlocking...' : 'Allow Head Edit'}
                  </button>
                  <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => window.print()}>
                    🖨️ Print Capacity Report
                  </button>
                </div>

                {pendingCapacityUpdates.length > 0 && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800" role="status">
                    {pendingCapacityUpdates.length} capacity {pendingCapacityUpdates.length === 1 ? 'change is' : 'changes are'} pending save.
                  </div>
                )}
                {capacityMessage && <div className="alert alert-success py-2" role="status">{capacityMessage}</div>}
                {capacityError && <div className="alert alert-danger py-2" role="alert">{capacityError}</div>}
                {capacityLoading && <div className="alert alert-info py-2" role="status">Loading department capacity data...</div>}

                <div className="row g-3 mb-4">
                  <div className="col-md-4">
                    <label className="form-label dtu-label">Stream</label>
                    <select
                      className="form-select dtu-form-control"
                      value={streamFilter}
                      onChange={(e) => {
                        setStreamFilter(e.target.value);
                        setCapacityPage(1);
                      }}
                    >
                      <option value="all">All Streams</option>
                      <option value="Natural Science">Natural Science</option>
                      <option value="Social Science">Social Science</option>
                    </select>
                  </div>

                  <div className="col-md-8">
                    <label className="form-label dtu-label">Search Department</label>
                    <input
                      className="form-control dtu-form-control"
                      placeholder="Search by department name"
                      value={deptSearch}
                      onChange={(e) => {
                        setDeptSearch(e.target.value);
                        setCapacityPage(1);
                      }}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="align-middle min-w-full divide-y divide-slate-200 table-auto">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-sm font-medium" style={{ width: 56 }}>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            style={capacitySelectionCheckboxStyle}
                            aria-label="Select all department rows on this page"
                            title="Select all visible departments"
                            checked={allVisibleCapacityDepartmentsSelected}
                            onChange={toggleVisibleCapacitySelection}
                            disabled={capacityLoading || capacitySaving || visibleCapacityDepartmentIds.length === 0}
                          />
                        </th>
                        <th className="px-4 py-3 text-sm font-medium" style={{ width: 60 }}>#</th>
                        <th className="px-4 py-3 text-sm font-medium" style={{ width: 180 }}>Stream</th>
                        <th className="px-4 py-3 text-sm font-medium" style={{ width: 320 }}>College</th>
                        <th className="px-4 py-3 text-sm font-medium" style={{ width: 280 }}>Department Name</th>
                        <th className="px-4 py-3 text-sm font-medium" style={{ width: 140 }}>Capacity</th>
                        <th className="px-4 py-3 text-sm font-medium" style={{ width: 220 }}>Approval Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!capacityLoading && paginatedCapacityDepartments.length === 0 && (
                        <tr>
                          <td colSpan="7" className="px-4 py-3 text-sm font-medium text-center text-muted">
                            No departments match the selected stream and search.
                          </td>
                        </tr>
                      )}
                      {paginatedCapacityDepartments.map((d, index) => {
                          const streamName = getDepartmentStream(d);
                          const collegeText = d.standardized_college_name || d.college || 'General';

                          return (
                            <tr key={d.id || `${d.name}-${index}`}>
                              <td className="px-4 py-3 text-sm font-medium">
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  style={capacitySelectionCheckboxStyle}
                                  aria-label={`Select ${d.name} for capacity approval`}
                                  checked={selectedCapacityDepartmentIds.includes(String(d.id))}
                                  onChange={() => {
                                    const departmentId = String(d.id);
                                    setSelectedCapacityDepartmentIds((current) => (
                                      current.includes(departmentId)
                                        ? current.filter((id) => id !== departmentId)
                                        : [...current, departmentId]
                                    ));
                                  }}
                                  disabled={capacityLoading || capacitySaving}
                                />
                              </td>
                              <td className="px-4 py-3 text-sm font-medium">{(capacityPage - 1) * PAGE_SIZE + index + 1}</td>
                              <td className="px-4 py-3 text-sm font-medium fw-semibold text-primary">{streamName}</td>
                              <td className="px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[200px] text-slate-700">{collegeText}</td>
                              <td
                                className="px-4 py-3 text-sm whitespace-nowrap min-w-[160px] font-medium text-slate-900 dtu-department-name"
                                title={d.name}
                              >
                                {d.name}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium">
                                <div className="d-flex align-items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  required
                                  className="form-control form-control-sm dtu-form-control px-2 py-1 text-center fw-medium"
                                  style={{ width: '6rem', minWidth: '6rem' }}
                                  aria-label={`Capacity for ${d.name}`}
                                  value={capacityDrafts[String(d.id)] ?? d.capacity}
                                  ref={editingRowId === String(d.id) ? capacityInputRef : null}
                                  onChange={(event) => {
                                    setCapacityDrafts((current) => ({ ...current, [String(d.id)]: event.target.value }));
                                    setCapacityMessage('');
                                    setCapacityError('');
                                  }}
                                  disabled={capacitySaving || editingRowId !== String(d.id)}
                                />
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary d-print-none"
                                  onClick={() => setEditingRowId(
                                    editingRowId === String(d.id) ? null : String(d.id),
                                  )}
                                  disabled={capacitySaving}
                                  aria-label={`${editingRowId === String(d.id) ? 'Finish editing' : 'Edit'} capacity for ${d.name}`}
                                  title={editingRowId === String(d.id) ? 'Finish editing' : 'Edit capacity'}
                                >
                                  {editingRowId === String(d.id)
                                    ? <Save size={16} aria-hidden="true" />
                                    : <Pencil size={16} aria-hidden="true" />}
                                </button>
                                <span className="d-none d-print-inline">{capacityDrafts[String(d.id)] ?? d.capacity}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm font-medium whitespace-nowrap min-w-[180px]">
                                {d.approval_status === 'reopened'
                                  ? <span className="badge bg-info text-dark whitespace-nowrap">Unlocked for Editing</span>
                                  : d.is_locked || d.approval_status === 'approved'
                                  ? <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-emerald-100 text-emerald-800 border border-emerald-300">Approved &amp; Locked by Registrar</span>
                                  : <span className="badge bg-warning text-dark whitespace-nowrap">Pending approval</span>}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                {filteredCapacityDepartments.length > PAGE_SIZE && (
                  <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                    <div className="text-muted small">
                      Showing {Math.min((capacityPage - 1) * PAGE_SIZE + 1, filteredCapacityDepartments.length)}-{Math.min(capacityPage * PAGE_SIZE, filteredCapacityDepartments.length)} of {filteredCapacityDepartments.length} departments
                    </div>
                    <div className="btn-group" role="group" aria-label="Department capacity pagination">
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setCapacityPage((page) => Math.max(1, page - 1))}
                        disabled={capacityPage === 1}
                      >
                        Previous
                      </button>
                      <button type="button" className="btn btn-sm btn-light" disabled>
                        Page {capacityPage} of {capacityTotalPages}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setCapacityPage((page) => Math.min(capacityTotalPages, page + 1))}
                        disabled={capacityPage === capacityTotalPages}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-4 flex justify-end border-t border-slate-200 pt-3 dark:border-slate-700">
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-md transition-all duration-200 hover:bg-emerald-700 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                    onClick={saveEditedDepartmentCapacities}
                    disabled={capacityLoading || capacitySaving || pendingCapacityUpdates.length === 0}
                  >
                    {capacitySavingAction === 'save' ? (
                      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                    ) : null}
                    <span className="text-white">Save Capacity Changes</span>
                  </button>
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
                  <p className="small text-primary-emphasis bg-primary-subtle rounded-3 px-3 py-2 mt-3 mb-0" role="note">
                    Status toggles are drafts until you click “Save Status Changes”. Student preferences use saved Active departments offered in semester one.
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
          ) : tab === 'settings' ? (
            <section className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-6">
                <h4 className="mb-1 text-2xl font-bold text-indigo-950 dark:text-slate-100">Placement Settings</h4>
                <p className="mb-0 text-sm text-slate-600 dark:text-slate-300">
                  Manage registrar controls for student placement and preference access.
                </p>
              </div>
              <SecondSemToggle />
              <ResetStudentChoices activeSemester={activeSemester} />
            </section>
          ) : tab === 'placement-rules' ? (
            <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm transition-all hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="mb-0 text-2xl font-bold text-indigo-950 dark:text-slate-100">Placement Rules</h4>
                  <div className="flex gap-2">
                    {!isEditingPlacementRules && (
                      <button
                        type="button"
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                        aria-label="Edit placement rules"
                        title="Edit placement rules"
                        onClick={startPlacementRulesEdit}
                      >
                        <Pencil size={16} aria-hidden="true" />
                        <span className="ml-1">Edit Rules</span>
                      </button>
                    )}
                    <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-indigo-950 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => window.print()}>
                      Print
                    </button>
                  </div>
                </div>
                <form onSubmit={savePlacementRules}>
                  <section className="mb-8">
                    <h5 className="mb-4 text-lg font-semibold text-indigo-950 dark:text-slate-100">Academic Criteria</h5>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {[
                        ['placement-g12-weight', 'Grade 12 Weight (%)', placementRules.grade12Weight, 'grade12Weight'],
                        ['placement-g12-total-base', 'Grade 12 Total Base Mark', placementRules.g12TotalBase, 'g12TotalBase'],
                        ['placement-gpa-weight', 'CGPA Weight (%)', placementRules.gpaWeight, 'gpaWeight'],
                        ['placement-coc-weight', 'COC Weight (%)', placementRules.cocWeight, 'cocWeight'],
                        ['placement-min-gpa', 'Minimum GPA', placementRules.minGpa, 'minGpa'],
                        ['placement-max-cumulative-score', 'Maximum Cumulative Score', placementRules.maxScoreCap, 'maxScoreCap'],
                      ].map(([id, label, value, stateKey]) => (
                        <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm transition-all hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900" key={id}>
                          <label className="mb-2 block text-sm font-medium text-indigo-950 dark:text-slate-200" htmlFor={id}>{label}</label>
                          <input
                            id={id}
                            type="number"
                            className="placement-rules-input w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-lg font-bold text-indigo-950 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            value={value}
                            onChange={stateKey ? (event) => setPlacementRules((current) => ({ ...current, [stateKey]: Number(event.target.value) })) : undefined}
                            min={stateKey === 'g12TotalBase' ? 0.01 : 0}
                            max={stateKey === 'g12TotalBase' ? 9999.99 : stateKey === 'minGpa' ? 4 : 100}
                            step="0.01"
                            readOnly={!isEditingPlacementRules}
                            required
                          />
                        </div>
                      ))}
                    </div>
                    <div className={`mt-3 text-sm ${Math.abs(Number(placementRules.grade12Weight) + Number(placementRules.gpaWeight) + Number(placementRules.cocWeight) - 100) <= 0.00001 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} role="status">
                      Academic weights total: {Number(placementRules.grade12Weight) + Number(placementRules.gpaWeight) + Number(placementRules.cocWeight)}%
                    </div>
                  </section>

                  <section className="mb-8">
                    <h5 className="mb-4 text-lg font-semibold text-indigo-950 dark:text-slate-100">Affirmative Action Bonus Points</h5>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {[
                        ['femaleBonusPoints', 'Female Bonus Points', 5],
                        ['disabilityBonusPoints', 'Disability Bonus Points', 5],
                        ['minorityMaleBonusPoints', 'Minority / Developing Region (Male) Bonus Points', 5],
                        ['minorityFemaleBonusPoints', 'Minority / Developing Region (Female) Bonus Points', 10],
                        ['minorityDisabilityBonusPoints', 'Minority / Developing Region (Disability) Bonus Points', 10],
                        ['femaleDisabilityMinorityBonusPoints', 'Female + Disability + Minority Bonus Points', 15],
                      ].map(([key, label, defaultValue]) => (
                        <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm transition-all hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900" key={key}>
                          <label className="mb-2 block text-sm font-medium text-indigo-950 dark:text-slate-200" htmlFor={`placement-${key}`}>{label}</label>
                          <input
                            id={`placement-${key}`}
                            type="number"
                            className="placement-rules-input w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-lg font-bold text-indigo-950 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            value={placementRules[key]}
                            placeholder={String(defaultValue)}
                            onChange={(event) => setPlacementRules((current) => ({ ...current, [key]: Number(event.target.value) }))}
                            min={0}
                            max={100}
                            step="0.01"
                            readOnly={!isEditingPlacementRules}
                            required
                          />
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="mb-8">
                    <h5 className="mb-4 text-lg font-semibold text-indigo-950 dark:text-slate-100">Quota Allocation</h5>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      {[
                        ['placement-open-quota', 'General / Open Competition (%)', 'generalQuotaPercent'],
                        ['placement-female-quota', 'Reserved Female Quota (%)', 'reservedFemaleQuotaPercent'],
                      ].map(([id, label, stateKey]) => (
                        <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm transition-all hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900" key={id}>
                          <label className="mb-2 block text-sm font-medium text-indigo-950 dark:text-slate-200" htmlFor={id}>{label}</label>
                          <input
                            id={id}
                            type="number"
                            className="placement-rules-input w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-lg font-bold text-indigo-950 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            value={placementRules[stateKey]}
                            onChange={(event) => setPlacementRules((current) => ({ ...current, [stateKey]: Number(event.target.value) }))}
                            min={0}
                            max={100}
                            step="0.01"
                            readOnly={!isEditingPlacementRules}
                            required
                          />
                        </div>
                      ))}
                    </div>
                    <div className={`mt-3 text-sm ${Number(placementRules.generalQuotaPercent) + Number(placementRules.reservedFemaleQuotaPercent) === 100 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} role="status">
                      Quota total: {Number(placementRules.generalQuotaPercent) + Number(placementRules.reservedFemaleQuotaPercent)}%
                    </div>
                  </section>
                  <div className="flex flex-wrap items-center gap-3">
                    {isEditingPlacementRules && (
                      <>
                        <button
                          className={`rounded-lg px-6 py-2.5 font-semibold text-white shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${rulesSaving || !placementRulesChanged ? 'cursor-not-allowed bg-indigo-300 opacity-80' : 'cursor-pointer bg-indigo-600 hover:bg-indigo-700'}`}
                          type="submit"
                          disabled={rulesSaving || !placementRulesChanged}
                          aria-busy={rulesSaving}
                        >
                          <span className="inline-flex items-center gap-2">
                            {rulesSaving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />}
                            {rulesSaving ? 'Saving placement rules...' : 'Save Placement Rules'}
                          </span>
                        </button>
                        <button className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-indigo-950 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" type="button" disabled={rulesSaving} onClick={cancelPlacementRulesEdit}>
                          Cancel
                        </button>
                        <button className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-indigo-950 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" type="button" disabled={rulesSaving} onClick={() => {
                          const defaults = { gpaWeight: 50, grade12Weight: 20, g12TotalBase: 600, cocWeight: 30, femaleBonusPoints: 5, disabilityBonusPoints: 5, minorityMaleBonusPoints: 5, minorityFemaleBonusPoints: 10, minorityDisabilityBonusPoints: 10, femaleDisabilityMinorityBonusPoints: 15, generalQuotaPercent: 80, reservedFemaleQuotaPercent: 20, minGpa: 1.75 };
                          setPlacementRules(defaults);
                          setRulesError('');
                        }}>Reset</button>
                      </>
                    )}
                    {rulesSaved && <div className="text-sm font-medium text-green-700 dark:text-green-400" role="status">Placement rules saved.</div>}
                    {rulesError && <div className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300" role="alert">{rulesError}</div>}
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
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div
                  className="mb-6 grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2"
                  role="group"
                  aria-label="Placement semester mode"
                >
                  <button
                    type="button"
                    className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                      placementMode === 1
                        ? 'bg-indigo-700 text-white shadow-sm'
                        : 'bg-transparent text-slate-700 hover:bg-white'
                    }`}
                    aria-pressed={placementMode === 1}
                    disabled={activatingSemester !== null || running || rerunningPlacement}
                    onClick={() => activatePlacementSemester(1)}
                  >
                    {activatingSemester === 1 ? 'Activating Semester 1…' : 'Semester 1 Placement (Stream Allocation)'}
                  </button>
                  <button
                    type="button"
                    className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                      placementMode === 2
                        ? 'bg-indigo-700 text-white shadow-sm'
                        : 'bg-transparent text-slate-700 hover:bg-white'
                    }`}
                    aria-pressed={placementMode === 2}
                    onClick={() => activatePlacementSemester(2)}
                    disabled={activatingSemester !== null || running || rerunningPlacement}
                  >
                    {activatingSemester === 2 ? 'Activating Semester 2…' : 'Semester 2 Placement (Department Allocation)'}
                  </button>
                </div>
                {semesterActivationError && (
                  <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
                    {semesterActivationError}
                  </div>
                )}
                {semesterActivationNotice && (
                  <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
                    {semesterActivationNotice}
                  </div>
                )}
                <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="mb-1 text-xl font-bold text-slate-900">Run Placement</h4>
                    <p className="mb-0 text-sm text-slate-500">
                      {placementMode === 2 ? 'Semester 2 department allocation candidates' : 'Semester 1 stream allocation candidates'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${
                      isActivePlacementMode
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                    }`}>
                      System active: Semester {activeSemester}
                    </span>
                    {(hasUnpublishedPlacementResults || hasPublishedPlacementResults || (runResult && !runResult.error)) && (
                      <button
                        type="button"
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                          hasPublishedPlacementResults
                            ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                            : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'
                        }`}
                        onClick={() => {
                          setPlacementError('');
                          setShowRerunConfirmation(true);
                        }}
                        disabled={running || rerunningPlacement || clearingPlacements}
                      >
                        {forceRerunRequired ? 'Force Re-Run Published Results' : 'Re-Run Placement'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                      onClick={handleClearPlacements}
                      disabled={running || rerunningPlacement || clearingPlacements}
                    >
                      {clearingPlacements ? 'Clearing…' : 'Clear Placements'}
                    </button>
                  </div>
                </div>
                {!isActivePlacementMode && (
                  <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
                    <Info size={18} className="shrink-0" aria-hidden="true" />
                    <span>
                      {semesterActivationError
                        ? `Semester ${placementMode} is available for preview only because activation failed. Semester ${activeSemester} remains active.`
                        : `Previewing Semester ${placementMode}. Semester ${activeSemester} is active for placement.`}
                    </span>
                  </div>
                )}

                <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="d-flex flex-wrap align-items-end gap-3">
                      <div className="flex-grow-1" style={{ minWidth: '180px' }}>
                        <label className="form-label fw-semibold" style={{ color: '#123153' }}>Stream</label>
                        <select
                          className="form-select"
                          value={selectedStream}
                          onChange={(e) => {
                            setSelectedStream(e.target.value);
                            setSelectedStudentIds([]);
                          }}
                          style={{ borderRadius: '10px' }}
                        >
                          <option value="">All streams</option>
                          {streamOptions.map((stream) => (
                            <option key={stream} value={stream}>{formatStudentStream(stream)}</option>
                          ))}
                        </select>
                      </div>

                      <div className="d-flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => setStudentRecordsRefreshToken((current) => current + 1)}
                          disabled={placementCandidatesLoading}
                        >
                          Refresh
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => setSelectedStudentIds([])}
                          disabled={selectedStudentIds.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {(activeSemester === 1 || activeSemester === 2) && placementMode === activeSemester && (
                      <div className="form-check mt-3">
                        <input
                          id={`complete-semester-${activeSemester}-batch`}
                          className="form-check-input"
                          type="checkbox"
                          checked={completeSemesterRun}
                          disabled={selectedStream !== ''
                            || placementCandidatesData.length === 0
                            || eligiblePlacementCandidates.length !== placementCandidates.length
                            || missingSemesterTwoAllocations
                            || !placementCandidatesData.every((student) => selectedStudentIds.includes(String(student.id)))}
                          onChange={(event) => setCompleteSemesterRun(event.target.checked)}
                        />
                        <label className="form-check-label" htmlFor={`complete-semester-${activeSemester}-batch`}>
                          {activeSemester === 1
                            ? 'Complete Semester 1 and open Semester 2 preferences'
                            : 'Complete Semester 2 after checking all remaining university capacity'}
                        </label>
                      </div>
                    )}
                    {missingSemesterTwoAllocations && (
                      <p className="mt-2 text-sm text-slate-600">
                        Candidates without a pending college allocation can run using their saved department choices, but cannot complete the entire semester batch.
                      </p>
                    )}

                    {!latestPlacementRun && (
                    <div className="mt-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h5 className="mb-0 text-base font-semibold text-slate-800">Candidates</h5>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          {placementCandidates.length} available
                        </span>
                      </div>

                      <div className="max-h-[360px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                        {placementCandidatesLoading ? (
                          <div className="p-4 text-sm text-slate-500" role="status">Loading candidates…</div>
                        ) : placementCandidatesError ? (
                          <div className="p-4 text-sm text-rose-700" role="alert">{placementCandidatesError}</div>
                        ) : placementCandidates.length === 0 ? (
                          <div className="p-6 text-center text-sm text-slate-500">
                            No candidates found for this placement stage.
                          </div>
                        ) : (
                          <>
                            <label className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-sm font-medium text-slate-600">
                              <input
                                type="checkbox"
                                aria-label="Select all visible candidates"
                                checked={eligiblePlacementCandidates.length > 0
                                  && eligiblePlacementCandidates.every((student) => selectedStudentIds.includes(String(student.id)))}
                                onChange={(event) => {
                                  const visibleIds = eligiblePlacementCandidates.map((student) => String(student.id));
                                  setSelectedStudentIds((previous) => {
                                    if (event.target.checked) {
                                      return Array.from(new Set([...previous, ...visibleIds]));
                                    }
                                    return previous.filter((id) => !visibleIds.includes(id));
                                  });
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              Select all visible candidates
                            </label>
                            <div className="flex flex-col gap-2 p-2">
                            {placementCandidates.map((student) => {
                            const checked = selectedStudentIds.includes(String(student.id));
                            const expanded = expandedCandidateIds.includes(String(student.id));
                            const ineligibilityReason = getPlacementCandidateIneligibility(
                              student,
                              placementMode,
                              placementRules.minGpa,
                            );

                            return (
                              <div
                                key={`${student.id}-${student.email || student.name}`}
                                className={`rounded-xl border p-3 transition-colors ${
                                  checked
                                    ? 'border-indigo-300 bg-indigo-50/70 shadow-sm'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <div className="d-flex align-items-center justify-content-between gap-3">
                                  <div className="d-flex align-items-center gap-3 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={Boolean(ineligibilityReason)}
                                    aria-label={`Select ${student.name || 'student'} (${student.admission_number || student.id_number || 'no admission number'})`}
                                    onChange={() => {
                                      setSelectedStudentIds((prev) => {
                                        const studentId = String(student.id);
                                        return prev.includes(studentId)
                                          ? prev.filter((id) => id !== studentId)
                                          : [...prev, studentId];
                                      });
                                    }}
                                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <div className="min-w-0">
                                    <div className="truncate font-semibold text-slate-900">
                                      {student.name || 'Student'}
                                      <span className="ml-2 font-normal text-slate-500">
                                        {student.admission_number || student.id_number || 'No admission number'}
                                      </span>
                                    </div>
                                    {placementMode === 2 && (
                                      <span className="badge rounded-pill bg-primary-subtle text-primary-emphasis mt-1">
                                        {student.allocated_college || 'Direct preference placement'}
                                      </span>
                                    )}
                                  </div>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1 flex-shrink-0"
                                    aria-expanded={expanded}
                                    aria-controls={`candidate-details-${student.id}`}
                                    onClick={() => setExpandedCandidateIds((current) => (
                                      current.includes(String(student.id))
                                        ? current.filter((id) => id !== String(student.id))
                                        : [...current, String(student.id)]
                                    ))}
                                  >
                                    {expanded ? 'Hide Details' : 'Show Details'}
                                    {expanded
                                      ? <ChevronUp size={16} aria-hidden="true" />
                                      : <ChevronDown size={16} aria-hidden="true" />}
                                  </button>
                                </div>
                                {ineligibilityReason && (
                                  <div className="mt-2 text-sm text-amber-700" role="status">
                                    Ineligible: {ineligibilityReason}
                                  </div>
                                )}
                                {expanded && (
                                  <div id={`candidate-details-${student.id}`} className="border-top mt-3 pt-3">
                                    <div className="flex flex-wrap gap-2">
                                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                                        {student.stream || 'Stream unavailable'}
                                      </span>
                                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
                                        CGPA: {student.cgpa ?? '—'}
                                      </span>
                                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800">
                                        Cumulative score: {formatCumulativeScore(calculateCumulativeScore({
                                        cgpa: student.cgpa,
                                        grade12: student.g12,
                                        coc: student.coc,
                                        gender: student.gender,
                                        hasDisability: student.hasDisability,
                                        minority: student.minority,
                                        region: student.region,
                                        }, placementRules))}
                                      </span>
                                    </div>
                                    <div className="d-flex flex-wrap gap-1 mt-3">
                                      {student.choices?.length
                                        ? student.choices
                                          .slice()
                                          .filter((choice) => Number(choice.priority) >= 1)
                                          .sort((left, right) => Number(left.priority) - Number(right.priority))
                                          .map((choice) => (
                                            <React.Fragment key={`${student.id}-${choice.priority}-${choice.dept_id || choice.dept_name}`}>
                                              <span
                                                className={`badge rounded-pill ${choice.choice_eligible === false
                                                  ? 'bg-secondary-subtle text-secondary-emphasis'
                                                  : ['bg-primary-subtle text-primary-emphasis', 'bg-info-subtle text-info-emphasis', 'bg-success-subtle text-success-emphasis'][((Number(choice.priority) - 1) % 3)]}`}
                                                title={choice.choice_eligible === false
                                                  ? 'Saved choice is currently inactive or not offered in this placement semester.'
                                                  : undefined}
                                              >
                                                Choice {choice.priority}: {choice.dept_name || choice.department}
                                                {choice.college_name && ` (${choice.college_name})`}
                                                {choice.choice_eligible === false && ' — Unavailable'}
                                              </span>
                                              {hasInvalidStreamChoice(student.stream, choice.stream) && (
                                                <span
                                                  className="badge bg-danger-subtle text-danger rounded-pill me-1 mb-1"
                                                  title="This department is outside the student's assigned stream"
                                                >
                                                  Invalid Stream Choice
                                                </span>
                                              )}
                                            </React.Fragment>
                                          ))
                                        : <span className="text-warning">No saved preferences</span>}
                                    </div>
                                    {placementMode === 2 && student.placement_status && (
                                      <span className="badge bg-secondary-subtle text-secondary-emphasis mt-1">
                                        {student.placement_status}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                            })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    )}
                  </div>

                <section className="mb-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="p-4 sm:p-5">
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                      <div>
                        <h5 className="fw-bold mb-1">Pre-Placement Cumulative Score Preview</h5>
                        <p className="text-muted small mb-0">
                          Scores use available student profile, MoSHE, and SIMS data before placement.
                        </p>
                      </div>
                    </div>
                    {placementPreviewLoading ? (
                      <div className="text-muted" role="status">Loading joined student scores…</div>
                    ) : placementPreviewError ? (
                      <div className="text-danger" role="alert">{placementPreviewError}</div>
                    ) : placementPreviewData.length === 0 ? (
                      <div
                        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center"
                        role="status"
                      >
                        <svg
                          aria-hidden="true"
                          width="36"
                          height="36"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mb-2 text-slate-400"
                        >
                          <path d="M3 3v18h18" />
                          <path d="M18 17V9" />
                          <path d="M13 17V5" />
                          <path d="M8 17v-3" />
                        </svg>
                        <span className="font-semibold text-slate-700">No candidate scores to preview</span>
                        <span className="mt-1 text-sm text-slate-500">Scores appear when candidate data is available.</span>
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle mb-0">
                          <thead className="table-light">
                            <tr>
                              <th>Admission Number</th>
                              <th>Student</th>
                              <th>Grade 12</th>
                              <th>CGPA</th>
                              <th>COC</th>
                              <th>Bonuses</th>
                              <th>Cumulative Score</th>
                              <th>Join Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {placementPreviewData.map((student) => (
                              <tr key={student.admissionNumber}>
                                <td>{student.admissionNumber}</td>
                                <td>{student.name}</td>
                                <td>{student.totalMark}</td>
                                <td>{student.cgpa ?? '—'}</td>
                                <td>{student.cocScore ?? '—'}</td>
                                <td>
                                  +{Number(student.scenarioBonus || 0) + Number(student.femaleBonus || 0) + Number(student.disabilityBonus || 0) + Number(student.minorityBonus || 0)}
                                </td>
                                <td className="fw-bold">{student.cumulativeScore === null ? '—' : `${student.cumulativeScore}%`}</td>
                                <td>
                                  <span className={`badge ${student.ready ? 'bg-success' : 'bg-warning text-dark'}`}>
                                    {student.ready ? 'Ready' : 'Score data incomplete'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </section>

                {selectedPlacementCandidateCount > 0 && (
                <div className="sticky bottom-0 z-20 -mx-4 mt-5 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <p className="mb-0 text-sm font-medium text-slate-600" aria-live="polite">
                    {selectedPlacementCandidateCount} candidate{selectedPlacementCandidateCount === 1 ? '' : 's'} selected
                  </p>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <button
                    type="button"
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    onClick={async () => {
                      if (!isActivePlacementMode) {
                        setPlacementError(`Semester ${activeSemester} is currently active. The selected semester is available for preview only.`);
                        return;
                      }
                      const studentsToPlace = filterStudentIdsForPlacement(
                        eligiblePlacementCandidates,
                        selectedStudentIds,
                      );

                      const fullRosterIds = placementCandidatesData
                        .map((student) => String(student.id));
                      const fullScopeSelected = selectedStream === ''
                        && fullRosterIds.length > 0
                        && fullRosterIds.every((id) => selectedStudentIds.includes(id));
                      if (completeSemesterRun && eligiblePlacementCandidates.length !== placementCandidates.length) {
                        setRunResult({
                          assigned: 0,
                          unassigned: 0,
                          error: 'Resolve all ineligible candidates before completing this semester.',
                        });
                        setPlacementError('The semester cannot be completed while candidates are ineligible.');
                        return;
                      }
                      if (completeSemesterRun && !fullScopeSelected) {
                        setRunResult({ assigned: 0, unassigned: 0, error: 'Select every candidate across all streams and colleges before completing the semester.' });
                        setPlacementError('A partial selection cannot complete the active semester.');
                        return;
                      }

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
                                const preferenceParams = new URLSearchParams();
                                preferenceParams.set('student_id', String(record.id));
                                preferenceParams.set('semester', String(activeSemester));
                                if (record.admission_number || record.id_number) {
                                  preferenceParams.set('admission_number', String(record.admission_number || record.id_number));
                                }
                                const preferenceResponse = await api.get(
                                  `api/student/student_preferences.php?${preferenceParams.toString()}`,
                                  { withCredentials: true },
                                );
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
                                  semester: activeSemester,
                                  dept_id: Number(pref?.dept_id ?? pref?.department_id ?? 0) || null,
                                  priority: Number(pref?.priority ?? pref?.rank ?? index + 1),
                                  department: pref?.dept_name || pref?.department || pref?.name || pref?.college || '',
                                  college_name: pref?.college_name || pref?.collegeName || pref?.college || '',
                                  stream: pref?.stream || '',
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
                                stream: record.stream || '',
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
                        const selectedCollege = 'all';
                        const payload = {
                          semester: activeSemester,
                          stream: selectedStream,
                          college: selectedCollege,
                          student_ids: studentsToPlace.map((student) => String(student.id)),
                          students,
                          departments: finalizedDepartments,
                          rules: placementRules,
                          selectedDepartment: 'all',
                          selectedCollege,
                          selectedStream,
                          placementScope: 'college-wide',
                          completeSemesterRun,
                          selectedStudentIds: studentsToPlace.map((student) => String(student.id)),
                        };
                        const placementEndpoint = activeSemester === 2
                          ? 'api/registrar/run_second_semester_placement.php'
                          : 'api/registrar/placement_engine.php';
                        const response = await api.post(placementEndpoint, payload, { withCredentials: true });
                        const result = response.data;

                        if (!result?.success) {
                          const message = String(result?.message || '').toLowerCase();
                          if (message.includes('already has a placement') || message.includes('already placed')) {
                            const alreadyPlaced = students.length;
                            setRunResult({ assigned: 0, unassigned: 0, alreadyPlaced, total: students.length });
                            setSelectedStudentIds((prev) => prev.filter((id) => !students.some((student) => (
                              String(student.id ?? student.admission_number ?? student.id_number) === String(id)
                            ))));
                            setPlacementError('The selected student already has a placement result and was removed from this run.');
                            return;
                          }
                          throw new Error(result?.message || 'Placement run failed.');
                        }

                        const summary = result.summary || {};
                        const assigned = Number(summary.assignedStudents || 0);
                        const unassigned = Number(summary.unassignedStudents || 0);
                        const alreadyPlaced = Number(summary.alreadyPlacedStudents || result.already_placed || 0);
                        const skipped = Array.isArray(result.skipped)
                          ? result.skipped
                          : Array.isArray(result.student_errors)
                            ? result.student_errors
                            : [];
                        const nextSemester = Number(summary.nextSemester || summary.semester || activeSemester);
                        const stageAdvanced = nextSemester !== activeSemester;
                        const currentBatch = getPlacementBatchForSemester(
                          stageAdvanced ? placementBatch : placementBatch || getPlacementBatchForSemester('', nextSemester),
                          nextSemester,
                        );
                        setActiveSemester(nextSemester);
                        if (stageAdvanced) {
                          setPlacementMode(nextSemester);
                          setPlacementBatch(currentBatch);
                          localStorage.setItem('dtuPlacementBatch', currentBatch);
                          setCompleteSemesterRun(false);
                          setSelectedStudentIds([]);
                          setStudentRecordsRefreshToken((token) => token + 1);
                        }
                        const deferred = Number(summary.deferredStudents || 0);
                        const pending = Number(summary.pendingStudents || 0);
                        const outcome = {
                          assigned,
                          unassigned,
                          deferred,
                          pending,
                          alreadyPlaced,
                          total: Number(summary.totalStudents ?? students.length),
                          skipped,
                        };

                        setRunResult(outcome);
                        if (Number(summary.totalStudents || 0) === 0 && skipped.length > 0) {
                          setPlacementError(result.message || 'No eligible candidates were processed.');
                          return;
                        }
                        setPlacementError(skipped.length > 0
                          ? `${skipped.length} selected candidate${skipped.length === 1 ? ' was' : 's were'} skipped. Review the reasons below.`
                          : '');
                        setUnassignedStudentsRefreshToken((token) => token + 1);
                        setPlacementBatch(currentBatch);
                        setPlacementBatch((prev) => prev || currentBatch);
                        localStorage.setItem('dtuPlacementBatch', currentBatch);
                        setPendingResults((prev) => stageAdvanced
                          ? []
                          : [{ id: Date.now(), summary: outcome, placements: result.placements || [], createdAt: new Date().toISOString() }, ...prev]);
                        setHasUnpublishedPlacementResults(!stageAdvanced);
                        if (stageAdvanced) setHasPublishedPlacementResults(false);
                        if (Array.isArray(result.placements)) {
                          localStorage.setItem('studentPlacementSummary', JSON.stringify({
                            studentId: registrar?.id || 'registrar-run',
                            batch: currentBatch,
                            date: new Date().toISOString(),
                            placementRuns: result.placements,
                            status: 'run-complete',
                          }));
                        }
                      } catch (error) {
                        console.error(error);
                        const backendMessage = error?.response?.data?.message
                          || error?.response?.data?.error
                          || error?.message
                          || 'Unable to run placement engine.';
                        const normalizedBackendMessage = String(backendMessage || '').toLowerCase();
                        if (normalizedBackendMessage.includes('already has a placement') || normalizedBackendMessage.includes('already placed')) {
                          const alreadyPlaced = studentsToPlace.length;
                          setRunResult({ assigned: 0, unassigned: 0, alreadyPlaced, total: studentsToPlace.length });
                          setSelectedStudentIds((prev) => prev.filter((id) => !studentsToPlace.some((student) => (
                            String(student.id ?? student.admission_number ?? student.id_number) === String(id)
                          ))));
                          setPlacementError('The selected student already has a placement result and was removed from this run.');
                          return;
                        }
                        setRunResult({
                          assigned: 0,
                          unassigned: 0,
                          error: backendMessage || error?.message || 'Unable to run placement engine.',
                          skipped: Array.isArray(error?.response?.data?.skipped)
                            ? error.response.data.skipped
                            : Array.isArray(error?.response?.data?.student_errors)
                              ? error.response.data.student_errors
                              : [],
                        });
                      } finally {
                        setRunning(false);
                      }
                    }}
                    disabled={running || placementCandidatesLoading
                      || selectedPlacementCandidateCount === 0
                      || !isActivePlacementMode}
                    >
                      {running
                        ? 'Running...'
                        : `Run Placement for ${selectedPlacementCandidateCount} Selected Candidate${selectedPlacementCandidateCount === 1 ? '' : 's'}`}
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 sm:w-auto"
                      onClick={() => { setPendingResults([]); setRunResult(null); setPlacementError(''); }}
                    >
                      Clear results
                    </button>
                  </div>
                </div>
                )}
                {showRerunConfirmation && (
                  <div
                    className="modal d-block"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="rerun-placement-title"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1050 }}
                  >
                    <div className="modal-dialog modal-dialog-centered">
                      <div className="modal-content">
                        <div className="modal-header">
                          <h5 className="modal-title" id="rerun-placement-title">Re-Run Placement</h5>
                          <button
                            type="button"
                            className="btn-close"
                            aria-label="Close"
                            onClick={() => setShowRerunConfirmation(false)}
                            disabled={rerunningPlacement}
                          />
                        </div>
                        <div className="modal-body">
                          <p className="mb-0">
                            {forceRerunRequired
                              ? 'This will unpublish and replace the current published placement results for the active semester. Continue only if the published results must be corrected.'
                              : 'Are you sure you want to re-run the placement? Current unpublished results will be recalculated.'}
                          </p>
                          <p className="text-muted small mt-2 mb-0">
                            Student profiles, scores, submitted choices, and configured department capacities will be preserved.
                          </p>
                          {forceRerunRequired && (
                            <div className="alert alert-danger mt-3 mb-0" role="alert">
                              This action revokes publication for the active semester and replaces its placement results. Student profiles, scores, submitted choices, and configured capacities are preserved.
                            </div>
                          )}
                          {placementError && <div className="alert alert-danger mt-3 mb-0" role="alert">{placementError}</div>}
                        </div>
                        <div className="modal-footer">
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() => setShowRerunConfirmation(false)}
                            disabled={rerunningPlacement}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={`btn ${forceRerunRequired ? 'btn-danger' : 'btn-primary'}`}
                            onClick={() => rerunPlacement(forceRerunRequired)}
                            disabled={rerunningPlacement}
                          >
                            {rerunningPlacement
                              ? 'Re-Running...'
                              : forceRerunRequired
                                ? 'Confirm Force Re-Run'
                                : 'Confirm Re-Run'}
                          </button>
                      </div>
                    </div>
                  </div>
                  </div>
                )}
                {runResult && (
                  <div className="mt-3">
                    {placementError && <div className="alert alert-warning py-2">{placementError}</div>}
                    <div>Assigned: <strong>{runResult.assigned}</strong></div>
                    {runResult.deferred > 0 && (
                      <div>Pending 2nd Semester: <strong>{runResult.deferred}</strong></div>
                    )}
                    {runResult.pending > 0 && (
                      <div>Pending further placement review: <strong>{runResult.pending}</strong></div>
                    )}
                    <div>Unassigned: <strong>{runResult.unassigned}</strong></div>
                    {runResult.skipped?.length > 0 && (
                    <div className="alert alert-warning mt-2 py-2" role="status">
                      <strong>{runResult.skipped.length} candidate{runResult.skipped.length === 1 ? '' : 's'} skipped:</strong>
                      <ul className="mb-0 mt-1">
                        {runResult.skipped.map((studentError, index) => (
                          <li key={`${studentError.admission_number || studentError.student_id || 'candidate'}-${index}`}>
                            {studentError.admission_number || studentError.student_id || 'Candidate'}: {studentError.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                    )}
                    {runResult.alreadyPlaced > 0 && (
                      <div>Already placed: <strong>{runResult.alreadyPlaced}</strong> (no duplicate rows created)</div>
                    )}
                    {runResult.error && <div className="alert alert-danger py-2" role="alert">{runResult.error}</div>}
                    {!runResult.error && runResult.total > 0 && (
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm mt-2"
                        onClick={() => setTab('unassigned-students')}
                      >
                        View Unassigned Students Report
                      </button>
                    )}

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
                            <button type="button" className="btn btn-outline-primary" onClick={() => exportPlacementResults(latestPlacementRun.placements, 'csv', 'deferred')}>
                              Pending 2nd Semester CSV
                            </button>
                            <button type="button" className="btn btn-outline-primary" onClick={() => exportPlacementResults(latestPlacementRun.placements, 'pdf', 'deferred')}>
                              Pending 2nd Semester PDF
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
                              {latestPlacementRun.placements.map((placement, index) => {
                                const assigned = placement.status === 'placed';
                                const deferred = isDeferredPlacement(placement);

                                return (
                                  <tr key={`${placement.studentId || placement.id_number || placement.admission_number || 'student'}-${placement.department || 'unassigned'}-${index}`}>
                                    <td className="fw-semibold text-primary text-nowrap">{placement.id_number || placement.studentId}</td>
                                    <td>{placement.studentName || '—'}</td>
                                    <td className="text-nowrap">{placement.score !== null && placement.score !== undefined ? Number(placement.score).toFixed(2) : '—'}</td>
                                    <td>{placement.department || '—'}</td>
                                    <td>{placement.college || '—'}</td>
                                    <td>{placement.stream || '—'}</td>
                                    <td className="text-center text-nowrap">{placement.choiceRank || '—'}</td>
                                    <td>
                                      <span className={`badge text-nowrap ${assigned ? 'bg-success' : deferred ? 'bg-info text-dark' : 'bg-secondary'}`}>
                                        {assigned ? 'Assigned' : deferred ? 'Pending 2nd Semester' : 'Unassigned'}
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
            </section>
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
                        if (Number(payload.updated || 0) > 0) {
                          setHasPublishedPlacementResults(true);
                          setHasUnpublishedPlacementResults(false);
                        }
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
          ) : tab === 'placed-students' ? (
            <PlacedStudents refreshToken={studentRecordsRefreshToken} />
          ) : tab === 'unassigned-students' ? (
            <UnassignedStudents refreshToken={unassignedStudentsRefreshToken} />
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
                            className="h-10 border border-slate-200 rounded-lg px-3 text-sm"
                            value={announcementDraft.category}
                            onChange={(event) => setAnnouncementDraft({ ...announcementDraft, category: event.target.value })}
                          >
                            <option value="Notice">Notice (መደበኛ ማስታወቂያ)</option>
                            <option value="Deadline">Deadline (የመጨረሻ ቀን)</option>
                            <option value="Placement">Placement (የምደባ ማስታወቂያ)</option>
                            <option value="Event">Event (መርሐ-ግብር)</option>
                            <option value="General">General (አጠቃላይ)</option>
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
                    <div className="list-group">
                      {appeals.map((appeal) => (
                        <article
                          key={appeal.id}
                          className="list-group-item p-0"
                        >
                          <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap p-3">
                            <div className="flex-grow-1">
                              <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                                <strong>{appeal.username || appeal.name || `Student #${appeal.student_id}`}</strong>
                                <span className={`badge ${
                                  appeal.status === 'Resolved'
                                    ? 'bg-success'
                                    : appeal.status === 'Under Review'
                                      ? 'bg-primary'
                                      : 'bg-warning text-dark'
                                }`}>
                                  {appeal.status || 'Received'}
                                </span>
                              </div>
                              <div className="small text-muted">
                                {appeal.email && <span>{appeal.email} · </span>}
                                {appeal.created_at}
                              </div>
                              <div className="fw-semibold mt-2">{appeal.subject || 'Placement appeal'}</div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2"
                              aria-expanded={expandedAppealId === appeal.id}
                              aria-controls={`appeal-details-${appeal.id}`}
                              onClick={() => {
                                setAppealFeedback(null);
                                setExpandedAppealId((current) => (
                                  current === appeal.id ? null : appeal.id
                                ));
                              }}
                            >
                              <Eye size={16} aria-hidden="true" />
                              {expandedAppealId === appeal.id ? 'Hide Details' : 'View Details'}
                            </button>
                          </div>
                          {expandedAppealId === appeal.id && (
                            <section
                              id={`appeal-details-${appeal.id}`}
                              className="border-top bg-light p-3"
                              aria-label={`Details for ${appeal.subject || 'placement appeal'}`}
                            >
                              <div className="mb-4">
                                <h6 className="fw-semibold">Appeal details</h6>
                                <p className="mb-0 text-break" style={{ whiteSpace: 'pre-wrap' }}>
                                  {appeal.appeal_description || appeal.message || 'No appeal details provided.'}
                                </p>
                              </div>
                              <div className="row g-3">
                                <div className="col-md-4">
                                  <label className="form-label small fw-semibold" htmlFor={`appeal-status-${appeal.id}`}>
                                    Status
                                  </label>
                                  <select
                                    id={`appeal-status-${appeal.id}`}
                                    className="form-select form-select-sm"
                                    value={appeal.status || 'Received'}
                                    onChange={(event) => {
                                      const status = event.target.value;
                                      setAppeals((current) => current.map((item) => (
                                        item.id === appeal.id ? { ...item, status } : item
                                      )));
                                    }}
                                  >
                                    <option>Received</option>
                                    <option>Under Review</option>
                                    <option>Resolved</option>
                                  </select>
                                </div>
                                <div className="col-12">
                                  <label className="form-label small fw-semibold" htmlFor={`appeal-response-${appeal.id}`}>
                                    Registrar response
                                  </label>
                                  <textarea
                                    id={`appeal-response-${appeal.id}`}
                                    className="form-control form-control-sm"
                                    rows="4"
                                    value={appeal.response || ''}
                                    onChange={(event) => {
                                      const response = event.target.value;
                                      setAppeals((current) => current.map((item) => (
                                        item.id === appeal.id ? { ...item, response } : item
                                      )));
                                    }}
                                    placeholder="Write a response to the student"
                                  />
                                </div>
                              </div>
                              {appealFeedback?.id === appeal.id && (
                                <div
                                  className={`alert alert-${appealFeedback.type} mt-3 py-2 px-3 small mb-0`}
                                  role={appealFeedback.type === 'danger' ? 'alert' : 'status'}
                                >
                                  {appealFeedback.message}
                                </div>
                              )}
                              <div className="d-flex justify-content-end gap-2 mt-4">
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm"
                                  onClick={() => deleteAppeal(appeal)}
                                  disabled={appealSavingId === appeal.id || appealDeletingId === appeal.id}
                                >
                                  {appealDeletingId === appeal.id ? 'Deleting...' : 'Delete'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => updateAppeal(appeal)}
                                  disabled={appealSavingId === appeal.id || appealDeletingId === appeal.id}
                                >
                                  {appealSavingId === appeal.id ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </section>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
          ) : (
            <div className="card rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="card-body p-4 p-md-5">
                <div className="mb-4">
                  <h1 className="mb-0 text-2xl font-bold text-slate-800">Registrar Reports</h1>
                </div>
                <section className="mb-4" aria-labelledby="admin-messages-heading">
                  <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
                    <h2 id="admin-messages-heading" className="mb-0 text-lg font-semibold text-slate-800">Messages from Admin</h2>
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setAdminReportsRefresh((value) => value + 1)}>Refresh</button>
                  </div>
                  {adminReportsLoading && <div className="alert alert-info py-2">Loading Admin messages...</div>}
                  {!adminReportsLoading && adminReportsError && <div className="alert alert-danger py-2">{adminReportsError}</div>}
                  {!adminReportsLoading && !adminReportsError && adminReports.length === 0 && (
                    <div className="alert alert-light border py-2">No messages from Admin yet.</div>
                  )}
                  {!adminReportsLoading && !adminReportsError && adminReports.length > 0 && (
                    <div className="space-y-3">
                      {adminReports.map((report) => {
                        const reportKey = `admin-${report.id}`;
                        const isExpanded = expandedReportId === reportKey;
                        const summary = String(report.message || '').replace(/\s+/g, ' ').trim();

                        return (
                          <article
                            key={report.id}
                            className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${!Number(report.is_read) ? 'border-l-4 border-l-indigo-500' : ''}`}
                          >
                            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                              <div className="min-w-0 flex-grow-1">
                                <div className="mb-2 d-flex align-items-center gap-2 flex-wrap">
                                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">From Admin</span>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                    {report.file_path ? 'Report' : 'Message'}
                                  </span>
                                  {!Number(report.is_read) && <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">Unread</span>}
                                </div>
                                <div className="mb-2 text-sm font-semibold text-slate-800">{report.title || 'Message from Admin'}</div>
                                <div className="mb-3 text-xs text-slate-500">
                                  Created {report.created_at || 'date unavailable'} · By Admin
                                </div>
                                {!isExpanded && (
                                  <p className="mb-0 line-clamp-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700" title={summary}>
                                    {summary || 'No description provided.'}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                className="inline-flex flex-shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
                                aria-expanded={isExpanded}
                                aria-controls={`admin-report-details-${report.id}`}
                                onClick={() => {
                                  setExpandedReportId(isExpanded ? null : reportKey);
                                  if (!isExpanded) markAdminReportRead(report);
                                }}
                              >
                                <Eye size={16} aria-hidden="true" />
                                {isExpanded ? 'Hide Details' : 'View Details'}
                                {isExpanded
                                  ? <ChevronUp size={16} aria-hidden="true" />
                                  : <ChevronDown size={16} aria-hidden="true" />}
                              </button>
                            </div>
                            {isExpanded && (
                              <section
                                id={`admin-report-details-${report.id}`}
                              className="mt-4 border-t border-slate-100 pt-4"
                                aria-label={`Details for ${report.title || 'Admin message'}`}
                              >
                              <h3 className="mb-2 text-sm font-semibold text-slate-800">Full details</h3>
                              <p className="mb-3 whitespace-pre-wrap break-words rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                                  {report.message || 'No description provided.'}
                                </p>
                              <div className="mb-3 d-flex flex-wrap gap-2 text-xs text-slate-500">
                                <span className="rounded-md bg-slate-50 px-2 py-1">Direction: Received</span>
                                <span className="rounded-md bg-slate-50 px-2 py-1">From: Admin</span>
                                <span className="rounded-md bg-slate-50 px-2 py-1">Created: {report.created_at || 'Date unavailable'}</span>
                                <span className="rounded-md bg-slate-50 px-2 py-1">Status: {Number(report.is_read) ? 'Read' : 'Unread'}</span>
                                <span className="rounded-md bg-slate-50 px-2 py-1">Notification ID: {report.id}</span>
                                </div>
                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                  {report.file_path && (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-primary"
                                      onClick={() => {
                                        const attachmentUrl = getAttachmentUrl(report.file_path, report.id);
                                        if (attachmentUrl !== '#') window.open(attachmentUrl, '_blank', 'noopener,noreferrer');
                                      }}
                                    >
                                    Download attachment
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => {
                                    setReportRecipient('admin');
                                    setSelectedRecipientId('all');
                                    setSelectedDeptId('all');
                                    setReportMessage(`Re: ${report.title || 'Message from Admin'}\n\n`);
                                    reportMessageInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    reportMessageInputRef.current?.focus();
                                  }}
                                >
                                  Reply
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-2"
                                    title="Delete message from Admin"
                                    onClick={() => deleteAdminReport(report)}
                                    disabled={deletingAdminReportId === report.id}
                                  >
                                    <FaTrash aria-hidden="true" />
                                    {deletingAdminReportId === report.id ? 'Deleting...' : 'Delete'}
                                  </button>
                                </div>
                              </section>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
                <section className="mb-4 pt-4 border-top" aria-labelledby="sent-reports-heading">
                  <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
                    <h2 id="sent-reports-heading" className="mb-0 text-lg font-semibold text-slate-800">Sent Report History</h2>
                  </div>
                  {sentReportsLoading && <div className="alert alert-info py-2">Loading sent history...</div>}
                  {!sentReportsLoading && sentReportsError && <div className="alert alert-danger py-2">{sentReportsError}</div>}
                  {!sentReportsLoading && !sentReportsError && sentReports.length === 0 && (
                    <div className="alert alert-light border py-2">No sent reports yet.</div>
                  )}
                  {!sentReportsLoading && !sentReportsError && sentReports.length > 0 && (
                    <div className="space-y-3">
                      {sentReports.map((report) => {
                        const reportKey = `sent-${report.id}`;
                        const isExpanded = expandedReportId === reportKey;
                        const summary = String(report.message || '').replace(/\s+/g, ' ').trim();

                        return (
                          <article key={report.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                              <div className="min-w-0 flex-grow-1">
                                <div className="mb-2 d-flex align-items-center gap-2 flex-wrap">
                                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">From Registrar</span>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                    {report.file_path ? 'Report' : 'Message'}
                                  </span>
                                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">To {report.recipient_role || 'recipient'}</span>
                                </div>
                                <div className="mb-2 text-sm font-semibold text-slate-800">{report.title || 'Registrar Report'}</div>
                                <div className="mb-3 text-xs text-slate-500">
                                  Created {report.created_at || 'date unavailable'} · By Registrar
                                </div>
                                {!isExpanded && (
                                  <p className="mb-0 line-clamp-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700" title={summary}>
                                    {summary || 'No description provided.'}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                className="inline-flex flex-shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
                                aria-expanded={isExpanded}
                                aria-controls={`sent-report-details-${report.id}`}
                                onClick={() => setExpandedReportId(isExpanded ? null : reportKey)}
                              >
                                <Eye size={16} aria-hidden="true" />
                                {isExpanded ? 'Hide Details' : 'View Details'}
                                {isExpanded
                                  ? <ChevronUp size={16} aria-hidden="true" />
                                  : <ChevronDown size={16} aria-hidden="true" />}
                              </button>
                            </div>
                            {isExpanded && (
                              <section
                                id={`sent-report-details-${report.id}`}
                                className="mt-4 border-t border-slate-100 pt-4"
                                aria-label={`Details for ${report.title || 'Registrar report'}`}
                              >
                                <h3 className="mb-2 text-sm font-semibold text-slate-800">Full details</h3>
                                <p className="mb-3 whitespace-pre-wrap break-words rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                                  {report.message || 'No description provided.'}
                                </p>
                                <div className="mb-3 d-flex flex-wrap gap-2 text-xs text-slate-500">
                                  <span className="rounded-md bg-slate-50 px-2 py-1">Direction: Sent</span>
                                  <span className="rounded-md bg-slate-50 px-2 py-1">By: Registrar</span>
                                  <span className="rounded-md bg-slate-50 px-2 py-1">Recipient: {report.recipient_role || 'Not specified'}</span>
                                  <span className="rounded-md bg-slate-50 px-2 py-1">Created: {report.created_at || 'Date unavailable'}</span>
                                  <span className="rounded-md bg-slate-50 px-2 py-1">Notification ID: {report.id}</span>
                                </div>
                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                  {report.file_path && (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-primary"
                                      onClick={() => {
                                        const attachmentUrl = getAttachmentUrl(report.file_path, report.id);
                                        if (attachmentUrl !== '#') window.open(attachmentUrl, '_blank', 'noopener,noreferrer');
                                      }}
                                    >
                                      Download attachment
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-2"
                                    title="Delete sent report"
                                    onClick={() => deleteSentReport(report)}
                                    disabled={deletingSentReportId === report.id}
                                  >
                                    <FaTrash aria-hidden="true" />
                                    {deletingSentReportId === report.id ? 'Deleting...' : 'Delete'}
                                  </button>
                                </div>
                              </section>
                            )}
                          </article>
                        );
                      })}
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
                        ref={reportMessageInputRef}
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
                    const studentId = user?.id ?? user?.student_id;
                    const email = user?.email || '';
                    let profile = {};

                    if (studentId || email) {
                      try {
                        const lookup = studentId
                          ? `student_id=${encodeURIComponent(studentId)}`
                          : `email=${encodeURIComponent(email)}`;
                        const profileResponse = await api.get(`api/student/student_profile.php?${lookup}`);
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
                    const cocValue = coc !== null && coc !== undefined && coc !== '' ? Number(coc) : null;
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
                      stream: formatStudentStream(user?.stream || profile?.stream || profile?.department_stream),
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
      {showStudentRegistrationModal && (
        <StudentRegistration
          isModal
          onBack={() => setShowStudentRegistrationModal(false)}
          onSuccess={() => {
            setShowStudentRegistrationModal(false);
            setStudentRecordsRefreshToken((current) => current + 1);
          }}
        />
      )}
    </div>
  );
};

export default RegistrarDashboard;
