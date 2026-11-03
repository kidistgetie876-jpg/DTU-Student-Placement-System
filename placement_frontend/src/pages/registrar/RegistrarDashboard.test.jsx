import {
  filterPlacementCandidates,
  getSecondSemesterCollegeOptions,
  getPlacementCandidateIneligibility,
  isDeferredPlacement,
  filterChoiceMatrixRecordsForSemester,
  getPlacementCandidatePrimaryIdentifier,
  getPlacementPreviewRequestParams,
  getStudentPrimaryIdentifier,
  matchesStudentInformationSearch,
  normalizePlacementCandidateChoices,
} from './RegistrarDashboard.jsx';

describe('getStudentPrimaryIdentifier', () => {
  it('prefers the University Student ID over the Ministry admission number', () => {
    expect(getStudentPrimaryIdentifier({
      student_id: 'DTU16R2001',
      admission_number: 'MOE10001',
    })).toBe('DTU16R2001');
  });
});

describe('getPlacementCandidatePrimaryIdentifier', () => {
  it('prefers the university ID and never displays the Ministry admission number', () => {
    expect(getPlacementCandidatePrimaryIdentifier({
      student_id: 'DTU16R2001',
      admission_number: 'MOE10001',
    })).toBe('DTU16R2001');
    expect(getPlacementCandidatePrimaryIdentifier({
      university_student_id: 'DTU16R2002',
      student_id: 'MOE10002',
    })).toBe('DTU16R2002');
    expect(getPlacementCandidatePrimaryIdentifier({
      id_number: 'MOE10001',
      admission_number: 'MOE10001',
    })).toBe('');
  });
});

describe('getPlacementPreviewRequestParams', () => {
  it('passes candidate University IDs and Ministry references without using Ministry IDs as University IDs', () => {
    expect(getPlacementPreviewRequestParams([
      {
        student_id: 'DTU16R2001',
        admission_number: 'MOE10001',
      },
      {
        student_id: 'DTU16R2002',
        moe_admission_number: 'MOE10002',
      },
      {
        student_id: 'MOE10003',
        admission_number: 'MOE10003',
      },
    ])).toEqual({
      student_ids: ['DTU16R2001', 'DTU16R2002'],
      admission_numbers: ['MOE10001', 'MOE10002', 'MOE10003'],
    });
  });
});

describe('matchesStudentInformationSearch', () => {
  const student = {
    student_id: 'DTU16R2001',
    moe_admission_number: 'MOE10001',
    given_name: 'Aster',
    father_name: 'Mekonnen',
  };

  it('matches the University Student ID but not the Ministry admission number', () => {
    expect(matchesStudentInformationSearch(student, 'dtu16r2001')).toBe(true);
    expect(matchesStudentInformationSearch(student, 'MOE10001')).toBe(false);
    expect(matchesStudentInformationSearch(student, 'MOE10002')).toBe(false);
  });
});

describe('isDeferredPlacement', () => {
  test.each(['pending_second_semester', 'pending-second-semester', 'Pending 2nd Semester', 'deferred'])(
    'recognizes %s as pending for the second semester',
    (status) => {
      expect(isDeferredPlacement({ status })).toBe(true);
    },
  );

  test.each(['placed', 'unassigned', 'pending 1st semester'])(
    'does not treat %s as pending for the second semester',
    (status) => {
      expect(isDeferredPlacement({ status })).toBe(false);
    },
  );
});

describe('filterChoiceMatrixRecordsForSemester', () => {
  it('keeps only deferred students or records with semester-two choices when semester two is active', () => {
    const records = filterChoiceMatrixRecordsForSemester([
      {
        student_id: 'DTU16R1001',
        status: 'pending_second_semester',
        choices: [{ priority: 1, semester: 1, dept_name: 'Medicine' }],
        sem1_choices: { choice1: 'Medicine' },
      },
      {
        student_id: 'DTU16R1002',
        status: 'Pending 1st Semester',
        choices: [
          { priority: 1, semester: 1, dept_name: 'Nursing' },
          { priority: 1, semester: 2, dept_name: 'Biology' },
        ],
      },
      {
        student_id: 'DTU16R1003',
        status: 'Pending 1st Semester',
        choices: [{ priority: 1, semester: 1, dept_name: 'Law' }],
      },
    ], 2);

    expect(records.map((record) => record.student_id)).toEqual(['DTU16R1001', 'DTU16R1002']);
    expect(records[0].choices).toEqual([]);
    expect(records[0].sem1_choices).toEqual({});
    expect(records[1].choices.map((choice) => choice.dept_name)).toEqual(['Biology']);
  });
});

describe('normalizePlacementCandidateChoices', () => {
  it('retains distinct departments with the same rank across colleges', () => {
    const candidate = normalizePlacementCandidateChoices({
      semester_1_choices: [
        { dept_id: 7, dept_name: 'Medicine', college_name: 'Health Science', priority: 1, choice_eligible: false },
        { dept_id: 19, dept_name: 'Biology', college_name: 'Other Natural Science', priority: 1 },
        { dept_id: 25, dept_name: 'Computer Science', college_name: 'Gafat Institute of Technology', priority: 2 },
      ],
    }, 1);

    expect(candidate.choices.map(({ dept_name, college_name, priority, choice_eligible }) => ({
      dept_name,
      college_name,
      priority,
      choice_eligible,
    }))).toEqual([
      { dept_name: 'Medicine', college_name: 'Health Science', priority: 1, choice_eligible: false },
      { dept_name: 'Biology', college_name: 'Other Natural Science', priority: 1, choice_eligible: undefined },
      { dept_name: 'Computer Science', college_name: 'Gafat Institute of Technology', priority: 2, choice_eligible: undefined },
    ]);
  });
});

describe('getPlacementCandidateIneligibility', () => {
  const pendingSecondSemesterCandidate = {
    placement_status: 'Pending 2nd Semester',
    cgpa: 3,
    choices: [{ dept_id: 7, dept_name: 'Medicine', priority: 1 }],
  };

  it('excludes a second-semester candidate from a first-semester run', () => {
    expect(getPlacementCandidateIneligibility({
      ...pendingSecondSemesterCandidate,
      has_first_semester_placement: false,
    }, 1)).toBe('Student is not eligible for first-semester placement.');
  });

  it('keeps candidates without a second-semester designation out of a second-semester run', () => {
    expect(getPlacementCandidateIneligibility({
      placement_status: 'Pending 1st Semester',
      cgpa: 3,
      choices: [{ dept_id: 7, dept_name: 'Medicine', priority: 1 }],
    }, 2)).toBe('Student is not eligible for second-semester placement.');
  });

  it('allows explicitly deferred candidates in a second-semester run', () => {
    expect(getPlacementCandidateIneligibility(pendingSecondSemesterCandidate, 2)).toBe('');
  });
});

describe('Semester 2 college placement filter', () => {
  const candidates = [
    {
      id: 'student-a',
      allocated_college: 'College of Other Natural Sciences',
      choices: [{ dept_name: 'Biology', college_name: 'College of Other Natural Sciences' }],
    },
    {
      id: 'student-b',
      allocated_college: 'College of Other Social Sciences',
      choices: [{ dept_name: 'Economics', college_name: 'College of Other Social Sciences' }],
    },
  ];

  it('lists allocated colleges with candidate counts', () => {
    expect(getSecondSemesterCollegeOptions(candidates)).toEqual([
      { name: 'College of Other Natural Sciences', count: 1 },
      { name: 'College of Other Social Sciences', count: 1 },
    ]);
  });

  it('lists the allocated college when saved choices name another college', () => {
    const mixedPreferenceCandidate = {
      ...candidates[0],
      allocated_college: 'Gafat Institute of Technology',
      choices: [{ dept_name: 'Economics', college_name: 'College of Other Social Sciences' }],
    };

    expect(getSecondSemesterCollegeOptions([mixedPreferenceCandidate])).toEqual([
      { name: 'Gafat Institute of Technology', count: 1 },
    ]);
    expect(filterPlacementCandidates(
      [mixedPreferenceCandidate],
      'all',
      'Gafat Institute of Technology',
      false,
      2,
    ).map(({ id }) => id)).toEqual(['student-a']);
  });

  it('filters semester-two candidates by allocated college', () => {
    const mixedPreferenceCandidate = {
      ...candidates[0],
      allocated_college: 'Gafat Institute of Technology',
      choices: [{ dept_name: 'Economics', college_name: 'College of Other Social Sciences' }],
    };

    expect(filterPlacementCandidates(
      [mixedPreferenceCandidate, candidates[1]],
      'all',
      'Gafat Institute of Technology',
      false,
      2,
    ).map(({ id }) => id)).toEqual(['student-a']);
  });
});