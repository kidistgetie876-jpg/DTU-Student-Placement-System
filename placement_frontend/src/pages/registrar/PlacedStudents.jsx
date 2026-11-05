import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, RefreshCw, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../services/api.js';

const endpoint = 'api/registrar/get_placed_students.php';
const departmentsEndpoint = 'api/common/departments_api.php';
const defaultStreams = ['Natural Science', 'Social Science'];

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const getPlacementSemester = (student) => {
  if (normalize(student?.status) === 'pending 2nd semester') return 2;
  const semester = Number(student?.placement_semester);
  return semester === 1 || semester === 2 ? semester : null;
};
const deduplicateStudentsByCurrentSemester = (records) => {
  const byIdentity = new Map();
  records.forEach((student, index) => {
    const identity = normalize(student.student_id || student.university_student_id || student.account_id || student.id);
    if (!identity) {
      byIdentity.set(`row-${index}`, student);
      return;
    }
    const current = byIdentity.get(identity);
    const studentSemester = getPlacementSemester(student);
    const currentSemester = getPlacementSemester(current);
    if (!current
      || (studentSemester !== null && currentSemester === null)
      || (studentSemester === 2 && currentSemester !== 2)) {
      byIdentity.set(identity, student);
    }
  });
  return [...byIdentity.values()];
};
const normalizeStream = (value) => {
  const normalized = normalize(value).replace(/[\s_-]+/g, '');
  if (['natural', 'naturalscience', 'naturalsciences'].includes(normalized)) return 'Natural Science';
  if (['social', 'socialscience', 'socialsciences'].includes(normalized)) return 'Social Science';
  return String(value ?? '').trim();
};

const getDepartmentStream = (department) => {
  if (department.stream || department.academic_stream) {
    return normalizeStream(department.stream || department.academic_stream);
  }
  const college = normalize(department.college_name || department.college);
  if (/business|economics|law|education|social|humanit/.test(college)) return 'Social Science';
  return 'Natural Science';
};

const displayStatus = (status) => {
  const normalized = normalize(status);
  if (normalized === 'pending') return 'Pending Approval';
  if (normalized === 'placed') return 'Placed';
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'published') return 'Published';
  return status || 'Placed';
};

const statusClass = (status) => {
  const normalized = normalize(status);
  if (normalized === 'published' || normalized === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (normalized.startsWith('pending')) return 'bg-amber-100 text-amber-800';
  return 'bg-blue-100 text-blue-800';
};

const SemesterTable = ({ semester, students }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(students.length / itemsPerPage);
  const page = Math.min(currentPage, Math.max(totalPages, 1));
  const indexOfLastItem = page * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = students.slice(indexOfFirstItem, indexOfLastItem);
  const heading = `${semester === 1 ? '1st' : '2nd'} Semester`;

  useEffect(() => {
    setCurrentPage(1);
  }, [students]);

  return (
    <section className="mb-6 last:mb-0" aria-labelledby={`semester-${semester}-heading`}>
      <div className="mb-3 flex items-center gap-3">
        <h2 id={`semester-${semester}-heading`} className="text-lg font-bold text-slate-800">{heading}</h2>
        <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
          Semester {semester}
        </span>
        <span className="text-sm text-slate-500">{students.length} students</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm" aria-label={`${heading} placed students`}>
          <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-700">
            <tr>
              <th scope="col" className="px-4 py-3">Student ID &amp; Full Name</th>
              <th scope="col" className="px-4 py-3">Stream &amp; College</th>
              <th scope="col" className="px-4 py-3">Final Cumulative Score</th>
              <th scope="col" className="px-4 py-3">Assigned Department</th>
              <th scope="col" className="px-4 py-3">Matched Preference</th>
              <th scope="col" className="px-4 py-3">Placement Status</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-4 py-8 text-center text-sm text-slate-500">
                  No students in this semester.
                </td>
              </tr>
            ) : currentItems.map((student, index) => {
              const score = Number(student.final_score ?? student.cumulativeScore);
              const choiceRank = Number(student.choice_rank);
              return (
                <tr
                  key={`${student.student_id || student.university_student_id || student.name}-${semester}-${index}`}
                  className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50/80"
                >
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-slate-800">{student.name || '—'}</div>
                    <div className="text-xs text-slate-500">{student.student_id || student.university_student_id || '—'}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-slate-800">{student.stream || '—'}</div>
                    <div className="text-xs text-slate-500">{student.college || '—'}</div>
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-slate-800">{Number.isFinite(score) ? score.toFixed(2) : '—'}</td>
                  <td className="px-4 py-3.5 text-slate-700">{student.department || '—'}</td>
                  <td className="px-4 py-3.5">
                    {choiceRank > 0
                      ? <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">Choice {choiceRank}</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(student.status)}`}>
                      {displayStatus(student.status)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex flex-col gap-3 border-t border-slate-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-slate-600">
            Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, students.length)} of {students.length} entries
          </span>
          <nav className="flex flex-wrap items-center justify-end gap-2" aria-label={`${heading} pagination`}>
            <button
              type="button"
              onClick={() => setCurrentPage((previousPage) => Math.max(previousPage - 1, 1))}
              disabled={page === 1}
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                type="button"
                key={pageNumber}
                onClick={() => setCurrentPage(pageNumber)}
                aria-label={`Page ${pageNumber}`}
                aria-current={pageNumber === page ? 'page' : undefined}
                className={`rounded border px-3 py-1 text-sm ${
                  pageNumber === page
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage((previousPage) => Math.min(previousPage + 1, totalPages))}
              disabled={page === totalPages}
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </section>
  );
};

const PlacedStudents = ({ refreshToken = 0 }) => {
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [streamFilter, setStreamFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [exportFormat, setExportFormat] = useState('xlsx');

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(endpoint);
      if (!response.data?.success || !Array.isArray(response.data.students)) {
        throw new Error(response.data?.message || 'Unable to load placement results.');
      }
      setStudents(deduplicateStudentsByCurrentSemester(response.data.students));
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to load placement results.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents, refreshToken]);

  useEffect(() => {
    let active = true;
    api.get(departmentsEndpoint)
      .then((response) => {
        const payload = response.data?.departments ?? response.data?.data ?? response.data;
        if (active && Array.isArray(payload)) setDepartments(payload);
      })
      .catch(() => {
        if (active) setDepartments([]);
      })
      .finally(() => {
        if (active) setDepartmentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const options = useMemo(() => {
    const streamValues = [
      ...defaultStreams,
      ...departments.map(getDepartmentStream),
      ...students.map((student) => normalizeStream(student.stream)),
    ];
    const streams = [...new Set(streamValues.map((value) => normalizeStream(value)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    const selectedStream = streamFilter === 'all' ? 'all' : normalizeStream(streamFilter);
    const matchingDepartments = departments.filter((department) => {
      const departmentStream = getDepartmentStream(department);
      return selectedStream === 'all' || departmentStream === selectedStream;
    });
    const catalogDepartmentNames = matchingDepartments
      .map((department) => String(department.name || department.department || department.dept_name || '').trim());
    const resultDepartmentNames = students
      .filter((student) => selectedStream === 'all' || normalizeStream(student.stream) === selectedStream)
      .map((student) => String(student.department || '').trim());
    const departmentsInResults = [...new Set([...catalogDepartmentNames, ...resultDepartmentNames].filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    return {
      streams,
      departments: departmentsInResults,
    };
  }, [students, departments, streamFilter]);

  const filteredStudents = useMemo(() => {
    const query = normalize(search);
    return students.filter((student) => {
      const matchesSearch = !query
        || normalize(student.name).includes(query)
        || normalize(student.student_id || student.university_student_id).includes(query);
      return matchesSearch
        && (streamFilter === 'all' || normalizeStream(student.stream) === normalizeStream(streamFilter))
        && (departmentFilter === 'all' || student.department === departmentFilter)
        && getPlacementSemester(student) !== null
        && (semesterFilter === 'all' || getPlacementSemester(student) === Number(semesterFilter));
    });
  }, [students, search, streamFilter, departmentFilter, semesterFilter]);

  const changeStream = (event) => {
    setStreamFilter(event.target.value);
    setDepartmentFilter('all');
  };

  const exportResults = () => {
    const headers = [
      'Student ID',
      'Full Name',
      'Semester',
      'Stream',
      'College',
      'Final Cumulative Score',
      'Assigned Department',
      'Matched Choice',
      'Placement Status',
    ];
    const rows = filteredStudents.map((student) => [
      student.student_id || student.university_student_id || '',
      student.name || '',
      getPlacementSemester(student) === 2 ? '2nd Semester' : '1st Semester',
      student.stream || '',
      student.college || '',
      student.final_score ?? student.cumulativeScore ?? '',
      student.department || '',
      Number(student.choice_rank) > 0 ? `Choice ${student.choice_rank}` : '',
      displayStatus(student.status),
    ]);
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Placement Results');
    const extension = exportFormat === 'csv' ? 'csv' : 'xlsx';
    XLSX.writeFile(workbook, `placed_students_results.${extension}`, { bookType: extension });
  };

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      aria-labelledby="placed-students-heading"
    >
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 id="placed-students-heading" className="mb-1 text-2xl font-bold text-slate-800">
            Placed Students
          </h1>
          <p className="mb-0 text-sm text-slate-500">
            Track and export student placement allocations by semester.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={loadStudents}
            disabled={loading}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <label className="sr-only" htmlFor="placed-students-export-format">Export format</label>
          <select
            id="placed-students-export-format"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value)}
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={exportResults}
            disabled={filteredStudents.length === 0}
          >
            <FileDown size={16} aria-hidden="true" />
            Export Results
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800" role="alert">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 items-end gap-4 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="placed-students-search">
            Search by student name or ID
          </label>
          <div className="flex h-10 rounded-lg border border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
            <span className="flex items-center pl-3 text-slate-400">
              <Search size={16} aria-hidden="true" />
            </span>
            <input
              id="placed-students-search"
              className="h-full min-w-0 flex-1 rounded-lg bg-transparent px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or student ID"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="placed-students-semester">
            Semester
          </label>
          <select
            id="placed-students-semester"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={semesterFilter}
            onChange={(event) => setSemesterFilter(event.target.value)}
          >
            <option value="all">All semesters</option>
            <option value="1">1st Semester</option>
            <option value="2">2nd Semester</option>
          </select>
        </div>
        {[
          ['placed-students-stream', 'Stream', streamFilter, changeStream, options.streams],
          ['placed-students-department', 'Assigned Department', departmentFilter, setDepartmentFilter, options.departments],
        ].map(([id, label, value, onChange, values]) => (
          <div key={id}>
            <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor={id}>{label}</label>
            <select
              id={id}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={value}
              onChange={id === 'placed-students-stream'
                ? onChange
                : (event) => onChange(event.target.value)}
            >
              <option value="all">All {label === 'Assigned Department' ? 'departments' : 'streams'}</option>
              {id === 'placed-students-department' && departmentsLoading && (
                <option value="loading" disabled>Loading departments…</option>
              )}
              {values.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="mb-3 text-sm text-slate-500" role="status">
        {filteredStudents.length} of {students.length} students
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500" role="status">Loading placement results…</div>
      ) : (
        <>
          {filteredStudents.length === 0 && (
            <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-600" role="status">
              {students.length === 0
                ? 'There are no placed students to display.'
                : 'No placement results match the selected filters.'}
            </div>
          )}
          {[1, 2].map((semester) => (
            <SemesterTable
              key={semester}
              semester={semester}
              students={filteredStudents.filter((student) => getPlacementSemester(student) === semester)}
            />
          ))}
        </>
      )}
    </section>
  );
};

export default PlacedStudents;