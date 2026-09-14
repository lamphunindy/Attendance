import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), requireAdmin: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ requireAdmin: mocks.requireAdmin }));
import { adminOptions } from '@/lib/admin/data';

describe('admin page option loading', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const rows: Record<string, Record<string, unknown>[]> = {
      academic_years: [
        { id: 'year', year: 2569, archived_at: null },
        { id: 'old', year: 2568, archived_at: 'archived' },
      ],
      classrooms: [
        { id: 'room', name: 'P6/1', academic_year_id: 'year', active: true },
        { id: 'closed', name: 'P6/2', academic_year_id: 'old', active: true },
      ],
      profiles: [
        { id: 'teacher', full_name: 'Teacher', active: true },
        { id: 'outsider', full_name: 'Other', active: true },
      ],
      user_roles: [{ user_id: 'teacher' }],
    };
    mocks.from.mockImplementation((table: string) => {
      const query = Object.assign(Promise.resolve({ data: rows[table] || [], error: null }), {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: () => query,
      });
      return query;
    });
    mocks.requireAdmin.mockResolvedValue({ db: { from: mocks.from }, role: { school_id: 'school' } });
  });

  it('does not read unrelated lists for pages without reference fields', async () => {
    const { options } = await adminOptions([]);
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(options.profiles).toEqual([]);
    expect(options.students).toEqual([]);
  });

  it('loads only classrooms and years for student creation/import and excludes archived classes', async () => {
    const { options } = await adminOptions(['open_classrooms']);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(['academic_years', 'classrooms']);
    expect(options.open_classrooms).toEqual([{ value: 'room', label: 'P6/1 (2569)' }]);
    expect(options.classrooms).toHaveLength(2);
  });

  it('keeps membership filtering when loading teacher options', async () => {
    const { options } = await adminOptions(['profiles']);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(['profiles', 'user_roles']);
    expect(options.profiles).toEqual([{ value: 'teacher', label: 'Teacher' }]);
  });

  it('loads student records only for forms that actually select students', async () => {
    await adminOptions(['students']);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(['students']);
  });

  it('does not read any lists when the admin check fails', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('forbidden'));
    await expect(adminOptions(['profiles'])).rejects.toThrow('forbidden');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
