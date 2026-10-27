import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Award,
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  Download,
  MapPin,
  Printer,
} from 'lucide-react';
import api from '../../services/api.js';
import '../admin/AdminDashboard.css';
import './StudentDashboard.css';
import OfficialPrintLetterhead from '../../components/common/OfficialPrintLetterhead.jsx';
import Sidebar from '../../components/layout/Sidebar.jsx';
import DashboardHeader from '../../components/layout/DashboardHeader.jsx';
import StudentAppeal from './StudentAppeal.jsx';
import SubmitPreferences, {
  hasDuplicateDepartmentChoices,
  updateSemesterTwoPreference,
} from './SubmitPreferences.jsx';
import getAttachmentUrl from '../../utils/getAttachmentUrl.js';

export const parseYesNo = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  return ['yes', 'y', 'true', '1', 'on'].includes(normalized);
};

const normalizeDepartmentsPayload = (payload) => {
  const topLevel = payload?.data ?? payload;
  if (Array.isArray(topLevel)) return topLevel.filter(Boolean);
  if (Array.isArray(topLevel?.departments)) return topLevel.departments.filter(Boolean);
  if (Array.isArray(topLevel?.data)) return topLevel.data.filter(Boolean);
  return [];
};

const isNotificationUnread = (notification) => {
  const readValue = notification.is_read ?? notification.read;
  if (typeof readValue === 'boolean') return !readValue;
  if (readValue !== null && readValue !== undefined) {
    return ['0', 'false', 'unread', 'no'].includes(String(readValue).trim().toLowerCase());
  }
  return String(notification.status || '').trim().toLowerCase() === 'unread';
};

const getStudentNotificationIdentity = (student) => {
  let storedUser = {};
  try {
    const parsedUser = JSON.parse(localStorage.getItem('user') || 'null');
    if (parsedUser && typeof parsedUser === 'object') storedUser = parsedUser;
  } catch {
    storedUser = {};
  }
  return {
    student_id: String(student?.user_id || student?.id || storedUser.user_id || storedUser.id || localStorage.getItem('student_id') || ''),
    admission_number: String(
      student?.admission_number
      || student?.id_number
      || storedUser.admission_number
      || storedUser.id_number
      || localStorage.getItem('admission_number')
      || '',
    ),
  };
};

const isActiveDepartment = (department) => String(department?.status || '').trim().toLowerCase() === 'active';
const hasPlacementLockedChoices = (status) => [
  'assigned',
  'placed',
  'placed in semester 1',
  'allocated',
  'approved',
  'completed',
].includes(String(status || '').trim().toLowerCase());
const isPlacementLockFlagSet = (value) => value === true
  || value === 1
  || ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const isAvailableInSecondSemester = (department) => (
  isActiveDepartment(department)
  && (
    department?.offered_semester === null
    || department?.offered_semester === undefined
    || department?.offered_semester === ''
    || Number(department.offered_semester) === 2
    || (
      Number(department.offered_semester) === 1
      && !['1', 'true', 'yes', 'on'].includes(String(department?.is_first_semester_only ?? '').trim().toLowerCase())
    )
  )
);

const getPreferenceGroup = (department) => {
  const preferenceGroup = normalizePlacementGroup(department?.preference_group);
  if (['health_science', 'git', 'other_natural_science', 'law', 'other_social_science'].includes(preferenceGroup)) {
    return preferenceGroup;
  }
  const placementGroup = normalizePlacementGroup(department?.placement_group);
  if (['health_science', 'git', 'other_natural_science', 'law', 'other_social_science'].includes(placementGroup)) {
    return placementGroup;
  }
  const stream = normalizeStream(department?.stream || department?.academic_stream || department?.category);
  const collegeName = String(department?.college_name || department?.college || department?.faculty || '');
  const normalizedCollege = collegeName.toLowerCase();
  const collegeAlias = normalizedCollege
    .replace(/^(college|school) of /, '')
    .replace(/sciences\b/g, 'science')
    .trim();
  if (['other social science', 'social science'].includes(collegeAlias)) return 'other_social_science';
  if (['other natural science', 'natural science'].includes(collegeAlias)) return 'other_natural_science';
  if (stream === 'Natural Science' && /health science/i.test(normalizedCollege)) return 'health_science';
  if (stream === 'Natural Science' && /gafat institute of technology|\b(?:g?it)\b/i.test(normalizedCollege)) return 'git';
  if (stream === 'Social Science' && normalizedCollege.includes('law')) return 'law';
  if (stream === 'Natural Science') return 'other_natural_science';
  if (stream === 'Social Science') return 'other_social_science';
  return '';
};

const preferenceGroupLabel = (group) => ({
  health_science: 'Health Science',
  git: 'Gafat Institute of Technology',
  other_natural_science: 'Other Natural Science',
  law: 'School of Law',
  other_social_science: 'Other Social Science',
}[group] || group);

const normalizePlacementGroup = (value) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return ({
    health_sciences: 'health_science',
    gafat_institute_of_technology: 'git',
    other_natural_sciences: 'other_natural_science',
    school_of_law: 'law',
    other_social_sciences: 'other_social_science',
  })[normalized] || normalized;
};

const getPlacementGroupFromCollege = (collegeName) => {
  const normalizedCollege = normalizePlacementGroup(collegeName);
  if (normalizedCollege.includes('health')) return 'health_science';
  if (normalizedCollege.includes('gafat') || normalizedCollege.includes('technology')) return 'git';
  if (normalizedCollege.includes('law')) return 'law';
  if (normalizedCollege.includes('other_social') || ['social_science', 'social_sciences'].includes(normalizedCollege)) {
    return 'other_social_science';
  }
  if (normalizedCollege.includes('other_natural') || ['natural_science', 'natural_sciences'].includes(normalizedCollege)) {
    return 'other_natural_science';
  }
  return '';
};

const normalizeCollegeName = (collegeName) => {
  let normalized = String(collegeName || '').trim().replace(/\s+/g, ' ').toLowerCase();
  normalized = normalized.replace(/^(college|school) of /, '').replace(/sciences\b/g, 'science');
  if (normalized.includes('health science')) return 'health science';
  if (normalized.includes('gafat') || normalized.includes('technology')) return 'gafat institute of technology';
  if (normalized.includes('law')) return 'law';
  if (normalized.includes('other social science')) return 'other social science';
  if (normalized.includes('other natural science')) return 'other natural science';
  if (['social science', 'social sciences'].includes(normalized)) return 'other social science';
  return normalized;
};

const filterSecondSemesterDepartments = (departments, allocatedGroup, allocatedCollege) => {
  const hasAllocatedCollege = String(allocatedGroup || '').trim() !== ''
    && String(allocatedCollege || '').trim() !== '';
  if (!hasAllocatedCollege) return [];
  return departments.filter((department) => (
    isAvailableInSecondSemester(department)
    && normalizePlacementGroup(getPreferenceGroup(department)) === normalizePlacementGroup(allocatedGroup)
    && normalizeCollegeName(department.college_name || department.college) === normalizeCollegeName(allocatedCollege)
  ));
};

const normalizeStream = (value) => {
  const stream = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  const normalized = stream.replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (['social', 'social science', 'social sciences', 'socialscience', 'socialsciences'].includes(normalized)) return 'Social Science';
  if (['natural', 'natural science', 'natural sciences', 'naturalscience', 'naturalsciences'].includes(normalized)) return 'Natural Science';
  return '';
};

const normalizeDepartmentName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const isDynamicDepartmentRankingGroup = (group) => ['health_science', 'git'].includes(group);

const reconcileDynamicDepartmentChoices = (choices, departments, targetGroup = '') => choices.map((choice) => {
  if (!isDynamicDepartmentRankingGroup(choice.group) || (targetGroup && choice.group !== targetGroup)) return choice;
  const availableNames = departments
    .filter((department) => (
      isActiveDepartment(department)
      && (targetGroup === choice.group || getPreferenceGroup(department) === choice.group)
    ))
    .map((department) => normalizeDepartmentName(department.name));
  const selectedNames = [];
  (choice.departments || []).forEach((name) => {
    const normalizedName = normalizeDepartmentName(name);
    if (availableNames.includes(normalizedName) && !selectedNames.some(
      (selectedName) => normalizeDepartmentName(selectedName) === normalizedName,
    )) {
      selectedNames.push(name);
    }
  });
  while (selectedNames.length < availableNames.length) selectedNames.push('');
  return { ...choice, departments: selectedNames };
});

const getInitialFirstSemesterPreferences = (choices, departments) => {
  const availableDepartments = departments.filter(isActiveDepartment);

  const rows = [];
  choices.forEach((choice) => {
    const departmentName = choice.dept_name || choice.department_name || choice.department || choice.name || '';
    const group = choice.group || getPreferenceGroup({ name: departmentName, college_name: choice.college_name, stream: choice.stream });
    if (!group) return;

    let existingRow = rows.find((row) => row.group === group);
    if (!existingRow) {
      existingRow = {
        group,
        department: '',
        departments: [],
        college_name: choice.college_name || choice.college || '',
      };
      rows.push(existingRow);
    }

    if (departmentName && !existingRow.departments.includes(departmentName)) {
      existingRow.departments.push(departmentName);
    }
    if (group === 'law' && departmentName) {
      existingRow.department = departmentName;
    }
  });

  // Dynamically pad array length to match active count in DB
  rows.forEach((row) => {
    if (isDynamicDepartmentRankingGroup(row.group)) {
      const activeDeptsInGroup = availableDepartments.filter(d => getPreferenceGroup(d) === row.group);
      while (row.departments.length < activeDeptsInGroup.length) {
        row.departments.push('');
      }
    }
  });

  return rows;
};

const getDepartmentStream = (department) => {
  const rawStream = department?.stream || department?.academic_stream || department?.category;
  return normalizeStream(rawStream);
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTabState] = useState('overview');

  const setTab = (nextTab) => {
    if (nextTab === 'save-page') return;
    localStorage.setItem('activeTab', nextTab);
    setTabState(nextTab);
  };

  const [allDepartments, setAllDepartments] = useState([]);
  const [dynamicGroupDepartments, setDynamicGroupDepartments] = useState({});
  const [profile, setProfile] = useState(null);
  const [firstSemesterPreferences, setFirstSemesterPreferences] = useState([]);
  const [semesterTwoPreferences, setSemesterTwoPreferences] = useState([]);
  const [placementResult, setPlacementResult] = useState(null);
  const [preferenceSemester, setPreferenceSemester] = useState(1);
  const [activePlacementSemester, setActivePlacementSemester] = useState(null);
  const [assignedCollege, setAssignedCollege] = useState('');
  const [assignedPlacementGroup, setAssignedPlacementGroup] = useState('');
  const [placementStatusError, setPlacementStatusError] = useState('');
  const [allowedDepartmentIds, setAllowedDepartmentIds] = useState(null);
  const [minimumPreferenceCount, setMinimumPreferenceCount] = useState(null);
  const [preferencesLocked, setPreferencesLocked] = useState(false);
  const [placementAlreadyExecuted, setPlacementAlreadyExecuted] = useState(false);
  const [choiceEditingAllowed, setChoiceEditingAllowed] = useState(false);
  const [secondSemesterChoicePortalOpen, setSecondSemesterChoicePortalOpen] = useState(false);
  const [secondSemesterChoicePortalMessage, setSecondSemesterChoicePortalMessage] = useState('');
  const [preferenceEligible, setPreferenceEligible] = useState(true);
  const [preferencesSubmitted, setPreferencesSubmitted] = useState(false);
  const [prefError, setPrefError] = useState('');
  const [prefSuccess, setPrefSuccess] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsFeedback, setNotificationsFeedback] = useState('');
  const [editingPreferences, setEditingPreferences] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultError, setResultError] = useState('');
  const [resultPublished, setResultPublished] = useState(false);
  const [deadlineActive, setDeadlineActive] = useState(null);
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [finalScoreDetails, setFinalScoreDetails] = useState(null);
  const [minimumGpa, setMinimumGpa] = useState(1.75);
  const hasSecondSemesterAllocation = preferenceSemester === 2
    && Boolean(assignedPlacementGroup && assignedCollege);
  const isSecondSemesterChoiceFormLocked = preferenceSemester === 2
    && !secondSemesterChoicePortalOpen;

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) { navigate('/login'); return; }
    let parsedUser;
    try {
      parsedUser = JSON.parse(storedUser);
    } catch (error) {
      console.error('Unable to read the stored student account:', error);
      navigate('/login');
      return;
    }
    setStudent(parsedUser);

    const loadData = async () => {
      try {
        const resDepts = await api.get('api/common/departments_api.php', { params: { status: 'active' } });
        const dbDepts = normalizeDepartmentsPayload(resDepts.data);
        const normalizedDepartments = dbDepts.map((department) => ({
          ...department,
          stream: getDepartmentStream(department),
          college_name: /^law$/i.test(String(department.college_name || department.college || department.faculty || '').trim())
            ? 'School of Law'
            : department.college_name || department.college || department.faculty || '',
        }));
        setAllDepartments(normalizedDepartments);

        const resProfile = await api.get(`api/student/student_data_api.php?student_id=${encodeURIComponent(parsedUser.id)}&email=${encodeURIComponent(parsedUser.email || '')}`);
        const studentData = resProfile?.data?.student || (Array.isArray(resProfile?.data?.students) ? resProfile.data.students[0] : null);
        if (resProfile?.data?.success && studentData) {
          setStudent((current) => ({
            ...current,
            id_number: studentData.id_number || current?.id_number,
            field_of_study: studentData.field_of_study || current?.field_of_study,
            stream: studentData.field_of_study || studentData.stream || current?.stream,
          }));
          setProfile({
            ...studentData,
            stream: studentData.field_of_study || studentData.stream || '',
            disability: parseYesNo(studentData.disability),
            minority: parseYesNo(studentData.minority),
          });
        }

        try {
          const rulesResponse = await api.get('api/registrar/get_placement_settings.php');
          setMinimumGpa(Number(rulesResponse.data?.min_gpa ?? 1.75));
        } catch (error) {
          console.error('Unable to load placement eligibility settings:', error);
        }

        const admissionNumber = studentData?.admission_number || studentData?.id_number || parsedUser?.id_number || '';
        const preferenceParams = new URLSearchParams({
          student_id: String(parsedUser.id ?? ''),
          admission_number: String(admissionNumber),
        });
        let placementStatus = {};
        try {
          const statusResponse = await api.get('api/student/placement_status.php', {
            params: { student_id: String(parsedUser.id ?? ''), admission_number: String(admissionNumber) },
          });
          placementStatus = statusResponse.data || {};
          if (placementStatus.success === false) {
            throw new Error(placementStatus.message || 'Unable to load student placement status.');
          }
          setPlacementStatusError('');
        } catch (error) {
          console.error('Unable to load student placement status:', error);
          setChoiceEditingAllowed(false);
          setPlacementStatusError(error.message || 'Unable to load your placement status.');
        }
        const resPrefs = await api.get(`api/student/student_preferences.php?${preferenceParams.toString()}`);
        const statusText = String(
          placementStatus.status
          || placementStatus.placement_status
          || studentData?.placement_status
          || studentData?.status
          || parsedUser?.placement_status
          || parsedUser?.status
          || '',
        ).trim().toLowerCase();
        const statusAllocatedCollege = String(placementStatus.allocated_college || '');
        const activeSemester = Number(
          placementStatus.active_semester
          || resPrefs.data?.activeSemester
          || resPrefs.data?.semester
          || 1,
        );
        const allocatedCollege = statusAllocatedCollege
          || String(resPrefs.data?.assignedCollege || '');
        const allocatedGroup = normalizePlacementGroup(placementStatus.allocated_group)
          || normalizePlacementGroup(resPrefs.data?.placementGroup)
          || getPlacementGroupFromCollege(allocatedCollege);
        const secondSemesterFinalized = placementStatus.second_semester_choice_finalized === true
          || resPrefs.data?.secondSemesterChoiceFinalized === true;
        const hasSecondSemesterAllocation = allocatedCollege.trim() !== '' && allocatedGroup !== '';
        const isSecondSemesterStage = [
          'pending 2nd semester',
          'placed in semester 1',
          'allocated',
        ].includes(statusText);
        const secondSemesterEligible = (activeSemester === 2 && hasSecondSemesterAllocation && isSecondSemesterStage)
          || placementStatus.second_sem_choice_eligible === true
          || resPrefs.data?.secondSemesterChoiceEligible === true
          || statusText === 'pending 2nd semester';
        const registrarPortalOpen = typeof placementStatus.is_second_sem_choice_open === 'boolean'
          ? placementStatus.is_second_sem_choice_open
          : resPrefs.data?.isSecondSemesterChoiceOpen === true;
        const pendingSecondSemesterEditable = hasSecondSemesterAllocation
          && (isSecondSemesterStage || secondSemesterEligible)
          && registrarPortalOpen
          && !secondSemesterFinalized;
        const firstSemesterChoicesEditable = ['pending', 'pending 1st semester'].includes(statusText)
          && !(hasSecondSemesterAllocation && secondSemesterEligible && registrarPortalOpen);
        const isChoiceEditable = !secondSemesterFinalized && (
          isPlacementLockFlagSet(
            placementStatus.is_choice_editable ?? resPrefs.data?.is_choice_editable,
          ) && (activeSemester !== 2 || registrarPortalOpen)
          || firstSemesterChoicesEditable
          || pendingSecondSemesterEditable
        );
        setChoiceEditingAllowed(isChoiceEditable);
        const isSecondSemesterStudent = (
          activeSemester === 2
          || registrarPortalOpen
          || isSecondSemesterStage
        )
          && (secondSemesterEligible || pendingSecondSemesterEditable)
          && hasSecondSemesterAllocation;
        const currentSemester = isSecondSemesterStudent ? 2 : 1;
        setActivePlacementSemester(currentSemester);
        const isSecondSemesterPortalOpen = currentSemester === 2
          && (secondSemesterEligible || pendingSecondSemesterEditable)
          && !secondSemesterFinalized
          && registrarPortalOpen;
        setSecondSemesterChoicePortalOpen(isSecondSemesterPortalOpen);
        setSecondSemesterChoicePortalMessage(currentSemester === 2
          ? (isChoiceEditable && !registrarPortalOpen
            ? 'Your preferences are editable and can be submitted again.'
            : String(resPrefs.data?.message || ''))
          : '');
        setPreferenceSemester(currentSemester);
        if (resPrefs.data?.assignedStream) {
          setStudent((current) => ({ ...current, stream: current?.stream || resPrefs.data.assignedStream }));
        }
        setAssignedCollege(statusAllocatedCollege || resPrefs.data?.assignedCollege || '');
        setAssignedPlacementGroup(allocatedGroup);
        let serverAllowedDepartments = Array.isArray(resPrefs.data?.allowedDepartments)
          ? resPrefs.data.allowedDepartments
          : null;
        if (isSecondSemesterStudent) {
          const allocatedCollege = statusAllocatedCollege || String(resPrefs.data?.assignedCollege || '');
          const activeDepartmentsResponse = await api.get('api/student/get_active_departments.php', {
            params: {
              student_id: String(parsedUser.id ?? ''),
              admission_number: String(admissionNumber),
              semester: 2,
              college_name: allocatedCollege,
              status: 'active',
            },
          });
          if (activeDepartmentsResponse.data?.success === false
            || !Array.isArray(activeDepartmentsResponse.data?.departments)) {
            throw new Error(activeDepartmentsResponse.data?.message || 'Unable to load departments for your allocated college.');
          }
          const normalizedSecondSemesterDepartments = activeDepartmentsResponse.data.departments.map((department) => ({
            ...department,
            stream: getDepartmentStream(department),
            college_name: String(department.college_name || allocatedCollege),
            offered_semester: department.offered_semester === null || department.offered_semester === undefined
              ? 2
              : department.offered_semester,
          }));
          serverAllowedDepartments = filterSecondSemesterDepartments(
            normalizedSecondSemesterDepartments,
            allocatedGroup,
            allocatedCollege,
          );
          setAllDepartments(serverAllowedDepartments);
        }
        setAllowedDepartmentIds(serverAllowedDepartments
          ? serverAllowedDepartments.map((department) => Number(department.id))
          : null);
        setMinimumPreferenceCount(isSecondSemesterStudent
          ? serverAllowedDepartments.length
          : resPrefs.data?.minimumChoices !== null
            && resPrefs.data?.minimumChoices !== undefined
            && resPrefs.data?.minimumChoices !== ''
            && Number.isFinite(Number(resPrefs.data.minimumChoices))
            ? Number(resPrefs.data.minimumChoices)
            : null);
        setPreferenceEligible(resPrefs.data?.isPreferenceEligible !== false);
        setPreferencesLocked(!isChoiceEditable && !isSecondSemesterPortalOpen
          && Boolean(resPrefs.data?.isResultPublished && !resPrefs.data?.isDeadlineActive));
        setPlacementAlreadyExecuted(secondSemesterFinalized || (
          !isChoiceEditable && !isSecondSemesterStudent && (
            isPlacementLockFlagSet(placementStatus.isLocked)
            || isPlacementLockFlagSet(resPrefs.data?.isLocked)
            || hasPlacementLockedChoices(placementStatus.status)
            || resPrefs.data?.placementExecuted === true
            || resPrefs.data?.is_placed === true
          )
        ));
        setDeadlineActive(typeof resPrefs.data?.isDeadlineActive === 'boolean' ? resPrefs.data.isDeadlineActive : null);
        setResultPublished(resPrefs.data?.isResultPublished === true || resPrefs.data?.is_published === true);
        if (typeof resPrefs.data?.submissionDeadline === 'string' && resPrefs.data.submissionDeadline) {
          setSubmissionDeadline(resPrefs.data.submissionDeadline);
        }

        const list = resPrefs.data?.choices || resPrefs.data?.data || [];
        let savedSecondSemesterChoices = [];
        if (currentSemester === 2) {
          const allowedIds = new Set((serverAllowedDepartments || normalizedDepartments)
            .map((department) => String(department.id)));
          savedSecondSemesterChoices = list
            .map((choice) => {
              const id = String(choice.dept_id ?? choice.department_id ?? choice.id ?? '');
              if (id && id !== '0' && allowedIds.has(id)) return `department:${id}`;
              if (!id || id === '0') {
                const college = String(choice.college_name || choice.college || '').trim();
                if (college && String(choice.dept_name || choice.department_name || '').includes('Broad Group / Semester 2 Queue')) {
                  return '';
                }
              }
              return '';
            })
            .filter(Boolean);
          const configuredCount = isSecondSemesterStudent
            ? serverAllowedDepartments.length
            : resPrefs.data?.minimumChoices !== null
            && resPrefs.data?.minimumChoices !== undefined
            && resPrefs.data?.minimumChoices !== ''
            && Number.isFinite(Number(resPrefs.data.minimumChoices))
            ? Math.max(0, Number(resPrefs.data.minimumChoices))
            : (serverAllowedDepartments || []).length;
          const count = Math.max(1, Math.max(configuredCount, savedSecondSemesterChoices.length));
          setSemesterTwoPreferences([
            ...savedSecondSemesterChoices.slice(0, count),
            ...Array(Math.max(0, count - savedSecondSemesterChoices.length)).fill(''),
          ]);
        } else {
          setSemesterTwoPreferences([]);
        }
        const hasCurrentSemesterPreferences = currentSemester === 2
          ? savedSecondSemesterChoices.length > 0
          : Array.isArray(list) && list.length > 0;
        if (resPrefs.data?.success && hasCurrentSemesterPreferences) {
          setFirstSemesterPreferences(currentSemester === 1
            ? getInitialFirstSemesterPreferences(list, normalizedDepartments)
            : []);
          setPreferencesSubmitted(true);
        } else {
          setFirstSemesterPreferences([]);
        }
      } catch (error) {
        console.error("Load Error:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [navigate]);

  useEffect(() => {
    let active = true;
    const loadSubmissionDeadline = async () => {
      try {
        const response = await api.get('api/common/system_settings_api.php');
        if (active) setSubmissionDeadline(response.data?.settings?.placement?.submissionDeadline || '');
      } catch (error) {
        console.error('Unable to load the preference submission deadline:', error);
      }
    };
    loadSubmissionDeadline();
    window.addEventListener('system-settings-updated', loadSubmissionDeadline);
    return () => {
      active = false;
      window.removeEventListener('system-settings-updated', loadSubmissionDeadline);
    };
  }, []);

  const assignedStream = normalizeStream(
    profile?.field_of_study || profile?.stream || student?.field_of_study || student?.stream,
  );

  const firstSemesterGroupOptions = useMemo(() => {
    if (preferenceSemester !== 1 || !assignedStream) return [];
    const groups = assignedStream === 'Natural Science'
      ? ['health_science', 'git', 'other_natural_science']
      : ['law', 'other_social_science'];
    return groups.map((group) => ({ value: group, label: preferenceGroupLabel(group) }));
  }, [assignedStream, preferenceSemester]);

  const getActiveGroupDepartments = useCallback((group) => {
    const source = Array.isArray(dynamicGroupDepartments[group])
      ? dynamicGroupDepartments[group]
      : allDepartments;
    return source.filter((department) => (
      isActiveDepartment(department)
      && getPreferenceGroup(department) === group
    ));
  }, [allDepartments, dynamicGroupDepartments]);

  const handleFirstSemesterChoiceChange = (idx, field, value) => {
    if (field === 'group' && isDynamicDepartmentRankingGroup(value)) {
      setDynamicGroupDepartments((departments) => ({ ...departments, [value]: undefined }));
    }
    setFirstSemesterPreferences((current) => {
      const next = [...current];
      while (next.length <= idx) {
        next.push({ group: '', department: '', departments: [] });
      }

      if (field === 'group') {
        next.forEach((choice, index) => {
          if (value && index !== idx && choice.group === value) {
            next[index] = { group: '', department: '', departments: [] };
          }
        });
        next[idx] = {
          group: value,
          department: '',
          departments: [],
        };
      } else if (field === 'departments') {
        const groupDepartments = getActiveGroupDepartments(next[idx].group);
        const values = [...(next[idx].departments || [])];
        while (values.length < groupDepartments.length) values.push('');
        const previousValue = values[value.index] || '';
        const incomingValue = value.name || '';
        if (previousValue && incomingValue && normalizeDepartmentName(previousValue) === normalizeDepartmentName(incomingValue)) {
          next[idx].departments = values;
          return next;
        }
        values[value.index] = incomingValue;
        next[idx].departments = values;
      } else if (field === 'department') {
        next[idx] = { ...next[idx], department: value };
      }
      return next;
    });
    setPrefError('');
    setPrefSuccess('');
  };

  const handleSave = async () => {
    setPrefError('');
    setPrefSuccess('');
    if (!choiceEditingAllowed
      && (preferencesLocked || (preferencesSubmitted && resultPublished && deadlineActive !== true))) {
      setPrefError('Preference submission is now closed because placement results have already been published.');
      return;
    }
    if (!preferenceEligible) {
      setPrefError('Your academic record does not meet the minimum requirements for placement preferences. Please consult the Registrar Office.');
      return;
    }
    if (preferencesSubmitted && !editingPreferences) {
      setPrefError('Select Update Preferences before changing your submitted choices.');
      return;
    }
    if (!choiceEditingAllowed && placementAlreadyExecuted) {
      setPrefError('Cannot update preferences after placement has been run');
      return;
    }
    const admissionNumber = String(
      profile?.admission_number
      || profile?.id_number
      || student?.admission_number
      || student?.id_number
      || '',
    ).trim();

    if (preferenceSemester === 2) {
      const selectedChoices = semesterTwoPreferences.slice(0, semesterTwoChoiceCount);
      if (!selectedChoices.length || selectedChoices.some((choice) => !choice)) {
        setPrefError('Please rank every active department in your allocated college.');
        return;
      }
      if (new Set(selectedChoices).size !== selectedChoices.length) {
        setPrefError(duplicateSelectionMessage);
        return;
      }
      const selectedCrossGroupChoice = selectedChoices.some((selectedChoice) => {
        if (selectedChoice.startsWith('college:')) return true;
        const departmentId = selectedChoice.slice('department:'.length);
        const department = semesterTwoDepartments.find((item) => String(item.id) === departmentId);
        return !department
          || !assignedPlacementGroup
          || getPreferenceGroup(department) !== assignedPlacementGroup;
      });
      if (selectedCrossGroupChoice) {
        setPrefError('Semester 2 preferences must stay within your allocated placement group.');
        return;
      }
      const formattedChoices = selectedChoices.map((selectedChoice, index) => {
        const departmentId = selectedChoice.slice('department:'.length);
        const department = semesterTwoDepartments.find((item) => String(item.id) === departmentId);
        return department ? { dept_id: Number(department.id), priority: index + 1 } : null;
      });
      if (formattedChoices.some((choice) => !choice)) {
        setPrefError('A selected department is no longer active. Refresh and try again.');
        return;
      }
      try {
        const response = await api.post('api/student/student_preferences.php', {
          ...(admissionNumber ? { admission_number: admissionNumber } : {}),
          student_id: profile?.id || student?.id || student?.student_id || student?.id_number || '',
          semester: preferenceSemester,
          choices: formattedChoices,
        });
        if (!response.data?.success) throw new Error(response.data?.message || 'Failed to submit preferences.');
        setPrefSuccess('Preferences submitted successfully!');
        setPreferencesSubmitted(true);
        setEditingPreferences(false);
      } catch (error) {
        setPrefError(error.response?.data?.message || error.message || 'An error occurred while saving your preferences.');
      }
      return;
    }

    const selectedGroups = preferencesSubmitted && editingPreferences
      ? firstSemesterPreferences
      : firstSemesterPreferences.slice(0, firstSemesterGroupOptions.length);
    const formattedChoices = [];
    for (const [index, choice] of selectedGroups.entries()) {
      if (!choice?.group) continue;
      const available = getActiveGroupDepartments(choice.group);
      let selectedNames = [];
      if (isDynamicDepartmentRankingGroup(choice.group)) {
        if (!available.length) {
          setPrefError(`No active Semester 1 departments are currently available for ${preferenceGroupLabel(choice.group)}.`);
          return;
        }
        selectedNames = (choice.departments || []).filter((name) => name && String(name).trim());
        if (selectedNames.length !== available.length) {
          setPrefError(`Rank every active department in ${preferenceGroupLabel(choice.group)} before submitting.`);
          return;
        }
      } else if (choice.group === 'law') {
        if (!choice.department) {
          setPrefError('Select a department in Law before submitting your preferences.');
          return;
        }
        selectedNames = choice.department ? [choice.department] : [];
      } else {
        const broadGroupName = preferenceGroupLabel(choice.group);
        formattedChoices.push({
          dept_id: null,
          dept_name: broadGroupName,
          college_name: '',
          stream: assignedStream,
          type: 'broad_group',
          priority: formattedChoices.length + 1,
        });
        continue;
      }

      for (const name of selectedNames) {
        const department = available.find((item) => normalizeDepartmentName(item.name) === normalizeDepartmentName(name));
        if (!department) {
          setPrefError(`The selected department for Choice #${index + 1} is no longer active. Refresh and try again.`);
          return;
        }
        formattedChoices.push({ dept_id: Number(department.id), priority: formattedChoices.length + 1 });
      }
    }
    const missingGroupIndex = firstSemesterGroupOptions.findIndex(({ value }) => (
      !selectedGroups.some((choice) => choice?.group === value)
    ));
    if (missingGroupIndex >= 0) {
      setPrefError(`Please select a preference for every available college or placement group in your assigned stream. (Choice #${missingGroupIndex + 1})`);
      return;
    }
    if (!formattedChoices.length) {
      setPrefError('Please select at least one department before submitting your preferences.');
      return;
    }
    const uniqueIds = new Set(formattedChoices.map((choice) => choice.dept_id));
    if (uniqueIds.size !== formattedChoices.length) {
      setPrefError(duplicateSelectionMessage);
      return;
    }
    try {
      const payload = {
        ...(admissionNumber ? { admission_number: admissionNumber } : {}),
        student_id: profile?.id || student?.id || student?.student_id || student?.id_number || '',
        semester: preferenceSemester,
        choices: formattedChoices,
      };
      const res = await api.post('api/student/student_preferences.php', payload);
      if (res.data?.success) {
        setPrefSuccess(preferencesSubmitted
          ? 'Preferences saved successfully. You can update your choices anytime until the Registrar publishes the final results.'
          : 'Preferences submitted successfully!');
        setPreferencesSubmitted(true);
        setEditingPreferences(false);
      } else {
        setPrefError(res.data?.message || 'Failed to submit preferences.');
      }
    } catch (error) {
      setPrefError(error.response?.data?.message || error.message || 'An error occurred while saving your preferences.');
    }
  };

  const handleGroupDepartmentsLoaded = useCallback((group, departments) => {
    setDynamicGroupDepartments((current) => ({ ...current, [group]: departments }));
    setFirstSemesterPreferences((current) => reconcileDynamicDepartmentChoices(current, departments, group));
    setPrefError('');
  }, []);

  const handleGroupDepartmentLoadError = useCallback((message) => {
    setPrefError(message);
  }, []);

  useEffect(() => {
    if (tab !== 'preferences') return undefined;
    let active = true;
    let refreshing = false;
    const refreshDepartments = async () => {
      if (!active || refreshing) return;
      refreshing = true;
      try {
        const studentId = student?.id || student?.student_id || student?.id_number || '';
        const admissionNumber = profile?.admission_number || profile?.id_number || student?.id_number || '';
        const preferenceParams = new URLSearchParams({
          student_id: String(studentId),
          admission_number: String(admissionNumber),
        });
        const [statusResponse, preferencesResponse] = await Promise.all([
          api.get('api/student/placement_status.php', {
            params: { student_id: String(studentId), admission_number: String(admissionNumber) },
          }),
          api.get(`api/student/student_preferences.php?${preferenceParams.toString()}`),
        ]);
        if (!active) return;
        const statusData = statusResponse.data || {};
        if (statusData.success === false) {
          throw new Error(statusData.message || 'Unable to load student placement status.');
        }
        setPlacementStatusError('');
        const statusText = String(
          statusData.status
          || statusData.placement_status
          || profile?.placement_status
          || profile?.status
          || student?.placement_status
          || student?.status
          || '',
        ).trim().toLowerCase();
        const statusAllocatedCollege = String(statusData.allocated_college || '');
        const activeSemester = Number(
          statusData.active_semester
          || preferencesResponse.data?.activeSemester
          || preferencesResponse.data?.semester
          || 1,
        );
        const allocatedCollege = statusAllocatedCollege
          || String(preferencesResponse.data?.assignedCollege || '');
        const allocatedGroup = normalizePlacementGroup(statusData.allocated_group)
          || normalizePlacementGroup(preferencesResponse.data?.placementGroup)
          || getPlacementGroupFromCollege(allocatedCollege);
        const secondSemesterFinalized = statusData.second_semester_choice_finalized === true
          || preferencesResponse.data?.secondSemesterChoiceFinalized === true;
        const hasSecondSemesterAllocation = allocatedCollege.trim() !== '' && allocatedGroup !== '';
        const isSecondSemesterStage = [
          'pending 2nd semester',
          'placed in semester 1',
          'allocated',
        ].includes(statusText);
        const secondSemesterEligible = (activeSemester === 2 && hasSecondSemesterAllocation && isSecondSemesterStage)
          || statusData.second_sem_choice_eligible === true
          || preferencesResponse.data?.secondSemesterChoiceEligible === true
          || statusText === 'pending 2nd semester';
        const registrarPortalOpen = typeof statusData.is_second_sem_choice_open === 'boolean'
          ? statusData.is_second_sem_choice_open
          : preferencesResponse.data?.isSecondSemesterChoiceOpen === true;
        const pendingSecondSemesterEditable = hasSecondSemesterAllocation
          && (isSecondSemesterStage || secondSemesterEligible)
          && registrarPortalOpen
          && !secondSemesterFinalized;
        const firstSemesterChoicesEditable = ['pending', 'pending 1st semester'].includes(statusText)
          && !(hasSecondSemesterAllocation && secondSemesterEligible && registrarPortalOpen);
        const isChoiceEditable = !secondSemesterFinalized && (
          isPlacementLockFlagSet(
            statusData.is_choice_editable ?? preferencesResponse.data?.is_choice_editable,
          ) && (activeSemester !== 2 || registrarPortalOpen)
          || firstSemesterChoicesEditable
          || pendingSecondSemesterEditable
        );
        setChoiceEditingAllowed(isChoiceEditable);
        const isSecondSemesterStudent = (
          activeSemester === 2
          || registrarPortalOpen
          || isSecondSemesterStage
        )
          && (secondSemesterEligible || pendingSecondSemesterEditable)
          && hasSecondSemesterAllocation;
        const response = isSecondSemesterStudent
          ? await api.get('api/student/get_active_departments.php', {
            params: {
              student_id: String(studentId),
              admission_number: String(admissionNumber),
              semester: 2,
              college_name: allocatedCollege,
              status: 'active',
            },
          })
          : await api.get('api/common/departments_api.php', { params: { status: 'active' } });
        if (!active) return;
        const departmentPayload = isSecondSemesterStudent
          ? response.data?.departments
          : normalizeDepartmentsPayload(response.data);
        if (!Array.isArray(departmentPayload)) {
          throw new Error(response.data?.message || 'The department service returned an invalid response.');
        }
        const fetchedDepartments = departmentPayload.map((department) => ({
          ...department,
          stream: getDepartmentStream(department),
          offered_semester: isSecondSemesterStudent
            && (department.offered_semester === null || department.offered_semester === undefined)
            ? 2
            : department.offered_semester,
          college_name: isSecondSemesterStudent
            ? String(department.college_name || allocatedCollege)
            : /^law$/i.test(String(department.college_name || department.college || department.faculty || '').trim())
            ? 'School of Law'
            : department.college_name || department.college || department.faculty || '',
        }));
        const departments = isSecondSemesterStudent
          ? filterSecondSemesterDepartments(
            fetchedDepartments,
            allocatedGroup,
            allocatedCollege,
          )
          : fetchedDepartments;
        setAllDepartments(departments);
        if (preferencesResponse.data?.success) {
          const preferencesData = preferencesResponse.data;
          const semester = isSecondSemesterStudent ? 2 : Number(preferencesData.semester || 1);
          setActivePlacementSemester(isSecondSemesterStudent ? 2 : activeSemester);
          const allowedDepartmentsFromPreferences = Array.isArray(preferencesData.allowedDepartments)
            ? preferencesData.allowedDepartments
            : null;
          const allowedDepartments = isSecondSemesterStudent ? departments : allowedDepartmentsFromPreferences;
          const minimumChoices = preferencesData.minimumChoices !== null
            && preferencesData.minimumChoices !== undefined
            && preferencesData.minimumChoices !== ''
            && Number.isFinite(Number(preferencesData.minimumChoices))
            ? Number(preferencesData.minimumChoices)
            : null;
          setPreferenceSemester(semester);
          setAssignedCollege(allocatedCollege);
          setAssignedPlacementGroup(allocatedGroup);
          setAllowedDepartmentIds(allowedDepartments
            ? allowedDepartments.map((department) => Number(department.id))
            : null);
          setMinimumPreferenceCount(isSecondSemesterStudent ? departments.length : minimumChoices);
          setPreferenceEligible(preferencesData.isPreferenceEligible !== false);
          const isSecondSemesterPortalOpen = semester === 2
            && (secondSemesterEligible || pendingSecondSemesterEditable)
            && !secondSemesterFinalized
            && registrarPortalOpen;
          setSecondSemesterChoicePortalOpen(isSecondSemesterPortalOpen);
          setSecondSemesterChoicePortalMessage(isChoiceEditable && !registrarPortalOpen
            ? 'Your preferences are editable and can be submitted again.'
            : String(preferencesData.message || ''));
          setResultPublished(preferencesData.isResultPublished === true || preferencesData.is_published === true);
          setDeadlineActive(typeof preferencesData.isDeadlineActive === 'boolean'
            ? preferencesData.isDeadlineActive
            : null);
          setPreferencesLocked(!isChoiceEditable && !isSecondSemesterPortalOpen
            && Boolean(preferencesData.isResultPublished && !preferencesData.isDeadlineActive));
          setPlacementAlreadyExecuted(secondSemesterFinalized || (
            !isChoiceEditable && !isSecondSemesterStudent && (
              isPlacementLockFlagSet(statusData.isLocked)
              || isPlacementLockFlagSet(preferencesData.isLocked)
              || hasPlacementLockedChoices(statusData.status)
              || preferencesData.placementExecuted === true
              || preferencesData.is_placed === true
            )
          ));
          if (semester === 2) {
            setSemesterTwoPreferences((currentChoices) => {
              const choiceCount = Math.max(
                1,
                Math.max(
                  isSecondSemesterStudent ? departments.length : minimumChoices ?? (allowedDepartments || []).length,
                  currentChoices.length,
                ),
              );
              return [
                ...currentChoices.slice(0, choiceCount),
                ...Array(Math.max(0, choiceCount - currentChoices.length)).fill(''),
              ];
            });
          } else {
            setSemesterTwoPreferences([]);
          }
        }
      } catch (error) {
        console.error('Unable to refresh student department choices:', error);
        if (active) {
          setChoiceEditingAllowed(false);
          setPlacementStatusError(error.message || 'Unable to load your placement status.');
        }
      } finally {
        refreshing = false;
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshDepartments();
    };
    refreshDepartments();
    const refreshInterval = window.setInterval(refreshDepartments, 30000);
    window.addEventListener('focus', refreshDepartments);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', refreshDepartments);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [
    profile?.admission_number,
    profile?.id_number,
    student?.id,
    student?.id_number,
    student?.student_id,
    tab,
  ]);

  useEffect(() => {
    if (tab !== 'notifications' && tab !== 'overview') return undefined;
    let active = true;
    const loadNotifications = async () => {
      setNotificationsLoading(true);
      try {
        const identity = getStudentNotificationIdentity(student);
        const response = await api.get('api/student/get_student_notifications.php', { params: identity });
        const list = response.data?.notifications || response.data?.data || [];
        if (active) setNotifications(Array.isArray(list) ? list : []);
      } catch (error) {
        if (active) console.error('Unable to load student notifications:', error);
      } finally {
        if (active) setNotificationsLoading(false);
      }
    };
    loadNotifications();
    return () => { active = false; };
  }, [student, tab]);

  useEffect(() => {
    if (tab !== 'result') return undefined;
    let active = true;
    setResultLoading(true);
    setResultError('');
    const studentId = student?.id || student?.student_id || student?.id_number || '';
    api.get(`api/student/get_student_result.php?student_id=${encodeURIComponent(studentId)}`)
      .then((response) => {
        if (active) setPlacementResult(response.data || null);
      })
      .catch((error) => {
        if (active) setResultError(error.response?.data?.message || error.message || 'Unable to load your placement result.');
      })
      .finally(() => {
        if (active) setResultLoading(false);
      });
    return () => { active = false; };
  }, [student, tab]);

  const markNotificationRead = async (notification) => {
    try {
      const response = await api.post('api/student/mark_notification_read.php', {
        notification_id: notification.id,
        ...(notification.notification_type === 'meeting' ? { notification_type: 'meeting' } : {}),
      });
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to mark notification as read.');
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, is_read: 1, read: true, status: 'read' } : item
      )));
      setNotificationsFeedback(response.data.message || 'Notification marked as read.');
    } catch (error) {
      setNotificationsFeedback(error.response?.data?.message || error.message || 'Unable to mark notification as read.');
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      const response = await api.post('api/student/mark_all_notifications_read.php');
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to mark notifications as read.');
      setNotifications((current) => current.map((item) => ({ ...item, is_read: 1, read: true, status: 'read' })));
      setNotificationsFeedback(response.data.message || 'All notifications marked as read.');
    } catch (error) {
      setNotificationsFeedback(error.response?.data?.message || error.message || 'Unable to mark notifications as read.');
    }
  };

  const openFinalScoreDetails = async () => {
    try {
      const id = student?.id || student?.id_number || '';
      const response = await api.get(`api/student/student_data_api.php?student_id=${encodeURIComponent(id)}&email=${encodeURIComponent(student?.email || '')}`);
      setFinalScoreDetails(response.data?.student || response.data?.students?.[0] || profile);
    } catch (error) {
      console.error('Unable to load final score details:', error);
      setFinalScoreDetails(profile);
    }
  };

  const unreadNotifications = notifications.filter(isNotificationUnread).length;
  const groupValues = preferenceSemester === 1
    ? (assignedStream === 'Natural Science'
      ? ['health_science', 'git', 'other_natural_science']
      : assignedStream === 'Social Science' ? ['law', 'other_social_science'] : [])
    : [];
  const semesterTwoDepartments = allDepartments
    .filter((department) => (
      isAvailableInSecondSemester(department)
      && preferenceSemester === 2
      && Array.isArray(allowedDepartmentIds)
      && allowedDepartmentIds.includes(Number(department.id))
      && (!assignedPlacementGroup || getPreferenceGroup(department) === assignedPlacementGroup)
    ))
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  const semesterTwoColleges = [...new Set(semesterTwoDepartments
    .map((department) => String(department.college_name || department.college || '').trim())
    .filter(Boolean))];
  const semesterTwoChoiceCount = Math.max(
    1,
    Math.max(
      semesterTwoDepartments.length,
      minimumPreferenceCount ?? 0,
      semesterTwoColleges.length ? 1 : 0,
    ),
  );
  const hasDuplicateSelections = hasDuplicateDepartmentChoices(
    preferenceSemester,
    firstSemesterPreferences,
    semesterTwoPreferences,
  );
  const duplicateSelectionMessage = 'Duplicate selection: Each choice must be a unique department.';
  const isSecondSemesterChoicePortalOpen = preferenceSemester === 2 && secondSemesterChoicePortalOpen;
  const isPreferenceSemesterInactive = activePlacementSemester !== null && (
    preferenceSemester === 2 && activePlacementSemester !== 2
  );
  const isClosed = !choiceEditingAllowed && !isSecondSemesterChoicePortalOpen
    && (preferencesLocked || (preferencesSubmitted && resultPublished && deadlineActive !== true));
  const hasGpa = (profile?.gpa !== null && profile?.gpa !== undefined)
    || (profile?.cgpa !== null && profile?.cgpa !== undefined);
  const gpaValue = Number(profile?.gpa || profile?.cgpa || 0);
  const studentStatus = String(profile?.status || '').trim().toUpperCase();
  const isIneligible = (hasGpa && gpaValue < minimumGpa)
    || ['NG', 'DISMISSED', 'INELIGIBLE'].includes(studentStatus);
  const deadlineDate = submissionDeadline ? new Date(submissionDeadline) : null;
  if (deadlineDate && !Number.isNaN(deadlineDate.getTime())) deadlineDate.setHours(23, 59, 59, 999);
  const isDeadlinePassed = Boolean(deadlineDate && Date.now() > deadlineDate.getTime());
  const isPreferenceWindowClosed = isPreferenceSemesterInactive || (!choiceEditingAllowed && !isSecondSemesterChoicePortalOpen && (
    placementAlreadyExecuted || isClosed
    || (!preferencesSubmitted && deadlineActive !== true && (deadlineActive === false || isDeadlinePassed))
  ));
  const resultPlacement = placementResult?.placement;
  const resultStudent = placementResult?.student;
  const placementResultStatus = String(
    resultPlacement?.placement_status || resultStudent?.status || '',
  ).trim();
  const normalizedPlacementResultStatus = placementResultStatus.toLowerCase();
  const resultDepartment = String(resultPlacement?.assigned_department || '').trim();
  const isPendingSecondSemesterResult = normalizedPlacementResultStatus === 'pending 2nd semester';
  const isUnderReviewResult = !isPendingSecondSemesterResult && (
    normalizedPlacementResultStatus === 'under review'
    || (Boolean(resultPlacement) && (
      placementResult?.published === false
      || normalizedPlacementResultStatus === 'pending'
    ))
  );
  const isAssignedResult = Boolean(resultDepartment)
    && !isUnderReviewResult
    && !isPendingSecondSemesterResult
    && !(isClosed && !resultPublished);
  const resultFullName = [
    resultStudent?.given_name || resultStudent?.first_name || profile?.given_name || profile?.first_name,
    resultStudent?.father_name || resultStudent?.last_name || profile?.father_name || profile?.last_name,
    resultStudent?.grandfather_name || resultStudent?.grand_father_name
      || profile?.grandfather_name || profile?.grand_father_name,
  ].filter(Boolean).join(' ')
    || resultStudent?.full_name
    || resultStudent?.name
    || resultStudent?.username
    || student?.username
    || 'Not available';
  const resultStudentId = resultStudent?.id_number
    || resultStudent?.admission_number
    || profile?.id_number
    || profile?.admission_number
    || student?.id_number
    || student?.id
    || 'Not available';
  const resultMeritScore = resultPlacement?.merit_score
    ?? resultPlacement?.final_score
    ?? resultPlacement?.cumulative_score
    ?? profile?.cumulative_avg
    ?? profile?.cumulative_score
    ?? 'Not available';
  const displayedPreferenceAlerts = new Set();
  const renderPreferenceAlert = (message, className = 'student-preferences-message is-error', role = 'alert') => {
    const text = String(message || '').trim();
    if (!text || displayedPreferenceAlerts.has(text)) return null;
    displayedPreferenceAlerts.add(text);
    return <div key={text} className={className} role={role}>{text}</div>;
  };

  if (loading) return <div className="p-6 text-center">Loading student portal...</div>;

  return (
    <div className="student-dashboard-container min-h-screen d-flex flex-column">
      <OfficialPrintLetterhead
        office="ADMISSIONS & REGISTRAR OFFICE"
        title={tab === 'result' ? 'OFFICIAL STUDENT DEPARTMENT PLACEMENT CONFIRMATION SLIP' : 'OFFICIAL STUDENT DASHBOARD RECORD'}
        metadata={`Generated on: ${new Date().toLocaleDateString()}`}
      />
      <div className="row g-0 flex-grow-1">
        <Sidebar role="student" activeItem={tab} onSelect={setTab} notificationCount={unreadNotifications} />
        <main className="col-md-10 p-4 main-content">
          <DashboardHeader
            variant="welcome"
            username={student?.username}
            role="Student"
            greeting="Welcome"
            profileDetail={`ID: ${student?.id_number || student?.id}`}
          />

          {tab === 'overview' && (
            <section className="container-fluid">
              <h1 className="visually-hidden">Student dashboard</h1>
              <p>ID: {profile?.id_number || student?.id_number || student?.id || 'Not available'}</p>
              <div className="row g-3">
                <div className="col-md-4"><h2>GPA</h2><p>{Number(profile?.gpa) === 0 && profile?.cgpa ? profile.cgpa : profile?.gpa ?? profile?.cgpa ?? '0.00'}</p></div>
                <div className="col-md-4"><h2>Stream</h2><p>{profile?.field_of_study || profile?.stream || student?.stream || 'Not available'}</p></div>
                <div className="col-md-4"><h2>Final Score</h2><button type="button" aria-label="View Final Score details" onClick={openFinalScoreDetails}>{profile?.cumulative_avg ?? profile?.cumulative_score ?? 'N/A'}</button></div>
              </div>
              <section className="card p-3 my-3">
                <h2 className="h5">Placement status</h2>
                <p>{profile?.status || 'Pending'}</p>
              </section>
              <section className="card p-3">
                <h2 className="h5">Recent announcements</h2>
                {notificationsLoading ? <p role="status">Loading recent notifications...</p> : notifications.slice(0, 3).map((item) => <p key={item.id}>{item.title || item.message}</p>)}
                <button type="button" onClick={() => setTab('notifications')}>View all</button>
              </section>
              {finalScoreDetails && (
                <div role="dialog" aria-label="Final Score Details">
                  <h2>Final Score Details</h2>
                  <p>{finalScoreDetails.cumulative_avg ?? finalScoreDetails.cumulative_score ?? 'N/A'}</p>
                  <p>Current cumulative score</p>
                  <p>Grade 12 result: {finalScoreDetails.grade_12_result ?? finalScoreDetails.grade12 ?? 'N/A'}</p>
                  <button type="button" onClick={() => setFinalScoreDetails(null)}>Close</button>
                </div>
              )}
            </section>
          )}

          {tab === 'preferences' && (
            <section className="container-fluid student-preferences-page">
              <header className="student-preferences-heading">
                <span className="student-section-eyebrow">PLACEMENT PREFERENCES</span>
                <h1>Rank Your Department Preferences</h1>
                <p>{preferenceSemester === 2
                  ? 'Rank the active departments available in your allocated college.'
                  : 'Choose your preferred placement group, then rank the active departments available to you.'}</p>
              </header>
              {renderPreferenceAlert(placementStatusError)}
              {preferenceSemester === 2 && (
                renderPreferenceAlert(
                  secondSemesterChoicePortalMessage || (
                    isSecondSemesterChoicePortalOpen
                      ? 'The Semester 2 choice portal is open.'
                      : 'The Semester 2 choice portal is closed. Preferences cannot be submitted right now.'
                  ),
                  `student-preferences-message ${isSecondSemesterChoicePortalOpen ? 'is-success' : 'is-error'}`,
                  isSecondSemesterChoicePortalOpen ? 'status' : 'alert',
                )
              )}
              {isPreferenceSemesterInactive && renderPreferenceAlert(
                `Semester ${preferenceSemester} choices are locked while Semester ${activePlacementSemester} is active for placement.`,
              )}
              {preferencesSubmitted && !editingPreferences && !isPreferenceWindowClosed && (
                <div className="student-preferences-summary">
                  <div role="status" className="alert bg-emerald-50 text-emerald-800 border border-emerald-200">Preferences submitted</div>
                  <p>Preferences submitted. You can update or re-order your choices anytime until the placement results are published by the Registrar.</p>
                  {assignedStream && <p>{assignedStream.split(' ')[0]}</p>}
                  {firstSemesterPreferences.flatMap((choice) => {
                    const departments = choice.department
                      ? [choice.department]
                      : (choice.departments || []).filter(Boolean);
                    return departments.length
                      ? departments.map((name) => {
                        const department = allDepartments.find((item) => normalizeDepartmentName(item.name) === normalizeDepartmentName(name));
                        return { group: choice.group, name, college: department?.college_name };
                      })
                      : [{ group: choice.group, name: preferenceGroupLabel(choice.group), college: '' }];
                  }).map((row, index) => (
                    <p key={`${row.group}-${row.name}-${index}`}>
                      <span>Rank #{index + 1}</span> <span>{row.name}</span> <span>{row.college}</span>
                    </p>
                  ))}
                  {firstSemesterPreferences.map((choice) => choice.college_name && (
                    <p key={`college-${choice.group}`}>{choice.college_name}</p>
                  ))}
                  <button type="button" disabled={isPreferenceWindowClosed} onClick={() => {
                    const hasWrongStreamPreference = firstSemesterPreferences.some((choice) => (
                      (assignedStream === 'Natural Science' && ['law', 'other_social_science'].includes(choice.group))
                      || (assignedStream === 'Social Science' && ['health_science', 'git', 'other_natural_science'].includes(choice.group))
                    ));
                    if (hasWrongStreamPreference) {
                      setPrefError('You can only select departments within your assigned stream (Social Science / Natural Science).');
                      return;
                    }
                    if (preferenceSemester === 2) {
                      setSemesterTwoPreferences((current) => (
                        Array(Math.max(current.length, semesterTwoChoiceCount)).fill('')
                      ));
                    } else {
                      setFirstSemesterPreferences((current) => current.map((choice) => ({
                        ...choice,
                        department: '',
                        departments: (choice.departments || []).map(() => ''),
                      })));
                    }
                    setEditingPreferences(true);
                    setPrefError('');
                    setPrefSuccess('');
                  }} className="student-preferences-submit">Update Preferences</button>
                  {prefSuccess && <div role="status" className="alert bg-emerald-50 text-emerald-800 border border-emerald-200">{prefSuccess}</div>}
                  {renderPreferenceAlert(prefError)}
                  {prefError.includes('assigned stream') && (
                    <>
                      <select aria-label="Registered Stream (Locked to your profile)" value={assignedStream.split(' ')[0]} disabled>
                        <option value={assignedStream.split(' ')[0]}>{assignedStream.split(' ')[0]}</option>
                      </select>
                      <label>Choice #1
                        <select aria-label="Choice #1" value="" disabled>
                          <option value="">-- Select preference --</option>
                        </select>
                      </label>
                    </>
                  )}
                </div>
              )}
              {placementAlreadyExecuted && renderPreferenceAlert(
                'Placement has already been processed. Choice editing is locked.',
                'student-preferences-message is-error',
                'status',
              )}
              {isClosed && renderPreferenceAlert(
                'Preference submission is now closed because placement results have already been published.',
                '',
                'status',
              )}
              {preferencesSubmitted && resultPublished && isClosed && (
                <select aria-label="Registered Stream (Locked to your profile)" value={assignedStream.split(' ')[0]} disabled>
                  <option value={assignedStream.split(' ')[0]}>{assignedStream.split(' ')[0]}</option>
                </select>
              )}
              {isIneligible && (
                <div role="alert">
                  <strong>Placement Ineligibility Notice</strong>
                  <p>Your academic record does not meet the minimum required placement threshold ({minimumGpa}).</p>
                  <p>Please consult the Registrar Office.</p>
                </div>
              )}
              {!preferencesSubmitted && (deadlineActive === false || (deadlineActive === null && isDeadlinePassed))
                && renderPreferenceAlert(`The preference submission deadline closed on ${submissionDeadline}. New submissions are no longer accepted.`, '', 'alert')}
              {(!preferencesSubmitted || editingPreferences) && !isIneligible && !isPreferenceWindowClosed && !placementStatusError && (
                <>
                  {editingPreferences && <p className="student-preferences-editing" role="status">You are editing your submitted preferences.</p>}
                  <SubmitPreferences
                    assignedStream={assignedStream}
                    preferenceSemester={preferenceSemester}
                    activeSemester={activePlacementSemester}
                    groupValues={groupValues}
                    groupLabel={preferenceGroupLabel}
                    preferences={firstSemesterPreferences}
                    onChoiceChange={handleFirstSemesterChoiceChange}
                    onDepartmentsLoaded={handleGroupDepartmentsLoaded}
                    onDepartmentLoadError={handleGroupDepartmentLoadError}
                    disabled={isPreferenceWindowClosed || isSecondSemesterChoiceFormLocked}
                    semesterTwoDepartments={semesterTwoDepartments}
                    semesterTwoColleges={semesterTwoColleges}
                    semesterTwoPreferences={semesterTwoPreferences}
                    semesterTwoChoiceCount={semesterTwoChoiceCount}
                    allocatedPlacementGroup={assignedPlacementGroup}
                    allocatedCollege={assignedCollege}
                    semesterTwoOpen={activePlacementSemester === 2 || hasSecondSemesterAllocation}
                    onSemesterTwoPreferenceChange={(index, selectedId) => setSemesterTwoPreferences(
                      (current) => updateSemesterTwoPreference(
                        current,
                        index,
                        selectedId,
                        semesterTwoChoiceCount,
                      ),
                    )}
                  />
                  {hasDuplicateSelections && (
                    <div className="student-preferences-message is-error" role="alert">
                      {duplicateSelectionMessage}
                    </div>
                  )}
                  {renderPreferenceAlert(prefError)}
                  {prefSuccess && <div role="status" className="student-preferences-message is-success">{prefSuccess}</div>}
                  {!isPreferenceWindowClosed && <button
                    className="student-preferences-submit"
                    type="button"
                    onClick={handleSave}
                    disabled={isPreferenceWindowClosed || isSecondSemesterChoiceFormLocked || hasDuplicateSelections}
                  >{editingPreferences ? 'Save Updated Preferences' : 'Submit Preferences'}</button>}
                </>
              )}
            </section>
          )}

          {tab === 'result' && (
            <section className="student-placement-result-print mx-auto w-full max-w-5xl space-y-6 rounded-2xl bg-white p-4 shadow-sm sm:p-6 lg:p-8">
              <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="mb-1 text-2xl font-bold text-slate-900 sm:text-3xl">Placement Result</h1>
                  <p className="mb-0 text-sm text-slate-600">Your official department placement information.</p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="print:hidden inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
                >
                  <Printer size={17} aria-hidden="true" />
                  Print Placement Slip
                </button>
              </header>
              {resultLoading ? <p className="text-sm text-slate-600" role="status">Loading your placement result...</p>
                : resultError ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{resultError}</p>
                  : isUnderReviewResult ? (
                    <div className="flex items-start gap-3 rounded-xl border-l-4 border-blue-600 bg-blue-50 p-4 text-blue-950 sm:p-5" role="status">
                      <AlertCircle className="mt-0.5 shrink-0 text-blue-700" size={22} aria-hidden="true" />
                      <div>
                        <h2 className="mb-1 text-lg font-bold">Placement Under Review</h2>
                        <p className="mb-0 text-sm leading-6">Your department assignment is currently being verified and has not been published yet.</p>
                      </div>
                    </div>
                  ) : isPendingSecondSemesterResult ? (
                    <div className="flex items-start gap-3 rounded-xl border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-950 sm:p-5" role="status">
                      <Clock className="mt-0.5 shrink-0 text-amber-700" size={22} aria-hidden="true" />
                      <div>
                        <h2 className="mb-1 text-lg font-bold">Pending 2nd Semester</h2>
                        <p className="mb-0 text-sm leading-6">Your second-semester placement is pending. Please check back for updates.</p>
                      </div>
                    </div>
                  ) : isAssignedResult ? (
                    <div className="flex items-start gap-3 rounded-xl border-l-4 border-emerald-600 bg-emerald-50 p-4 text-emerald-950 sm:p-5" role="status">
                      <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={22} aria-hidden="true" />
                      <div>
                        <h2 className="mb-1 text-lg font-bold">
                          {normalizedPlacementResultStatus === 'approved'
                            ? 'Your placement has been approved and confirmed.'
                            : 'Your placement has been assigned successfully.'}
                        </h2>
                        <p className="mb-0 text-sm leading-6">Assigned Department: <strong>{resultDepartment}</strong></p>
                        {placementResultStatus && (
                          <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                            {placementResultStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 rounded-xl border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-950 sm:p-5" role="alert">
                      <Clock className="mt-0.5 shrink-0 text-amber-700" size={22} aria-hidden="true" />
                      <div>
                        <h2 className="mb-1 text-lg font-bold">You are currently unassigned.</h2>
                        <p className="mb-0 text-sm leading-6">Your placement result is not available yet.</p>
                      </div>
                    </div>
                  )}
              {!resultLoading && !resultError && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ['Full Name', resultFullName],
                    ['Student ID', resultStudentId],
                    ['Merit Score', resultMeritScore],
                  ].map(([label, value]) => (
                    <article key={label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
                      <p className="mb-0 break-words text-lg font-semibold text-slate-900">
                        {label === 'Merit Score' && typeof value === 'number' ? value.toFixed(2) : value}
                      </p>
                      {label === 'Merit Score' && <Award className="mt-3 text-indigo-600" size={19} aria-hidden="true" />}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 'appeal' && <StudentAppeal studentId={student?.id || student?.id_number} placement={placementResult?.placement} />}

          {tab === 'notifications' && (
            <section>
              <h1>Notifications</h1>
              {notificationsLoading ? <p role="status">Loading notifications...</p> : notifications.map((notification) => (
                <article key={notification.id} className="card p-3 my-2">
                  <h2 className="h5">{notification.title || 'System notification'}</h2>
                  <p>{notification.message}</p>
                  {notification.meeting_date && <p>{notification.meeting_date}</p>}
                  {notification.meeting_time && <p>{notification.meeting_time}</p>}
                  {notification.location && <p><MapPin size={16} /> {notification.location}</p>}
                  {notification.file_path && <a href={getAttachmentUrl(notification.file_path, notification.id)} target="_blank" rel="noopener noreferrer"><Download size={16} />Open attachment</a>}
                  {isNotificationUnread(notification) && <button type="button" onClick={() => markNotificationRead(notification)}><CheckCheck size={16} />Mark as read</button>}
                </article>
              ))}
              {notifications.some(isNotificationUnread) && <button type="button" onClick={markAllNotificationsRead}><Bell size={16} />Mark all as read</button>}
              {notificationsFeedback && <p role="status">{notificationsFeedback}</p>}
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default StudentDashboard;