import { compareStudentIds, needsAcademicScores } from './RegistrarDashboard.jsx';

describe('needsAcademicScores', () => {
  it('flags default zero scores as requiring registrar input', () => {
    expect(needsAcademicScores({ gpa: '0.00', g12: 0, coc: 0 })).toBe(true);
  });

  describe('compareStudentIds', () => {
    it('sorts student ID numbers in increasing numeric order', () => {
      const students = [
        { id_number: 'DTU16R1010' },
        { id_number: 'DTU16R1002' },
        { id_number: 'DTU16R1001' },
      ];

      expect(students.sort(compareStudentIds).map((student) => student.id_number)).toEqual([
        'DTU16R1001',
        'DTU16R1002',
        'DTU16R1010',
      ]);
    });
  });

  it('does not flag a student with completed non-zero scores', () => {
    expect(needsAcademicScores({ gpa: '3.20', g12: 85, coc: 24 })).toBe(false);
  });
});
