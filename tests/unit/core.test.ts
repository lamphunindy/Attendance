import { describe, it, expect } from 'vitest';
import { gradeFor, totalScore } from '@/lib/grading';
import { scoreSchema, validateImport } from '@/lib/validations';
import { attendanceSummary } from '@/lib/attendance';
import { canAccessAssignment, canEditWorkflow } from '@/lib/permissions';
import { safeRedirect } from '@/lib/auth/redirect';
describe('Grade calculation', () => {
  it.each([
    [100, '4'],
    [80, '4'],
    [79.99, '3.5'],
    [75, '3.5'],
    [74.99, '3'],
    [70, '3'],
    [65, '2.5'],
    [60, '2'],
    [55, '1.5'],
    [50, '1'],
    [49.99, '0'],
    [0, '0'],
  ])('maps %s to %s', (n, g) => expect(gradeFor(Number(n))).toBe(g));
  it('normalizes floating precision at two decimals', () => expect(gradeFor(79.999)).toBe('4'));
  it('rejects nonfinite/out of range scores', () => {
    expect(() => gradeFor(NaN)).toThrow();
    expect(() => gradeFor(101)).toThrow();
  });
  it('weights arbitrary categories', () =>
    expect(
      totalScore([
        { max_score: 50, weight: 30, scores: [20, 20] },
        { max_score: 20, weight: 70, scores: [10] },
      ]),
    ).toBe(59));
});
describe('Score validation', () => {
  it.each([0, 10, null])('accepts %s', (v) => expect(scoreSchema(10).safeParse(v).success).toBe(true));
  it.each([-1, 11, NaN, Infinity, '10'])('rejects %s', (v) =>
    expect(scoreSchema(10).safeParse(v).success).toBe(false),
  );
});
describe('Attendance percentage', () => {
  it('counts present/late hours and includes absence', () =>
    expect(
      attendanceSummary([
        { hours: 2, status: 'present' },
        { hours: 1, status: 'late' },
        { hours: 1, status: 'absent' },
        { hours: 1, status: 'leave' },
      ]),
    ).toMatchObject({ total: 5, attended: 3, percentage: 60 }));
  it('returns zero for no sessions', () => expect(attendanceSummary([]).percentage).toBe(0));
  it('does not count unrecorded as present', () =>
    expect(attendanceSummary([{ hours: 1, status: null }])).toMatchObject({ unrecorded: 1, attended: 0 }));
});
describe('Permissions', () => {
  const a = { school_id: 'A', teacher_id: 'T1', active: true };
  it('allows assigned teacher', () =>
    expect(canAccessAssignment('T1', [{ school_id: 'A', role: 'teacher' }], a)).toBe(true));
  it('rejects another teacher', () =>
    expect(canAccessAssignment('T2', [{ school_id: 'A', role: 'teacher' }], a)).toBe(false));
  it('rejects foreign admin', () =>
    expect(canAccessAssignment('X', [{ school_id: 'B', role: 'admin' }], a)).toBe(false));
  it('rejects disabled user', () =>
    expect(canAccessAssignment('T1', [{ school_id: 'A', role: 'admin' }], a, false)).toBe(false));
  it('allows own-school admin', () =>
    expect(canAccessAssignment('X', [{ school_id: 'A', role: 'admin' }], a)).toBe(true));
  it('locks submitted, approved, locked and archived', () => {
    for (const s of ['submitted', 'approved', 'locked']) expect(canEditWorkflow(s)).toBe(false);
    expect(canEditWorkflow('draft', true)).toBe(false);
  });
});
describe('Safe redirects', () => {
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/%2f%2fevil.test',
    '/%5cevil.test',
    '/\nevil',
    'javascript:alert(1)',
    '/%zz',
  ])('blocks %s', (v) => expect(safeRedirect(v)).toBe('/dashboard'));
  it('accepts internal path/query', () =>
    expect(safeRedirect('/classrooms?year=2569')).toBe('/classrooms?year=2569'));
});
describe('Excel validation', () => {
  const row = {
    student_code: 'S001',
    student_number: 1,
    prefix: 'ด.ช.',
    first_name: 'ตัวอย่าง',
    last_name: 'ทดสอบ',
    nickname: '',
  };
  it('rejects duplicate code and number', () => expect(validateImport([row, row]).errors).toHaveLength(2));
  it('checks existing codes', () => expect(validateImport([row], ['S001']).errors[0].row).toBe(2));
  it('rejects missing names', () =>
    expect(validateImport([{ ...row, first_name: '' }]).errors).toHaveLength(1));
  it('accepts complete rows', () => expect(validateImport([row]).errors).toHaveLength(0));
});
