import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Search, Download } from 'lucide-react';
import { modules, studentCreateFields } from '@/lib/admin/config';
import { adminOptions } from '@/lib/admin/data';
import { saveAdmin, archiveYear, moveStudent, createStudent } from '@/lib/actions';
import { RecordForm } from './record-form';
import { ActionButton } from '@/components/ui/action-button';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/states';
import { thaiDate } from '@/lib/utils';
const captions: Record<string, string> = {
  archived_at: 'เก็บเข้าคลัง',
  workflow: 'สถานะผลการเรียน',
  active: 'สถานะ',
  is_active: 'ปัจจุบัน',
};
export async function ModulePage({ module, filters }: { module: string; filters: Record<string, string> }) {
  const config = modules[module];
  if (!config) notFound();
  const sources = config.fields.flatMap((field) => (field.source ? [field.source] : []));
  if (module === 'students') sources.push('open_classrooms');
  if (['classrooms', 'terms', 'enrollments'].includes(module)) sources.push('academic_years');
  const { s, options } = await adminOptions(sources);
  const page = Math.max(1, Number(filters.page) || 1);
  const columns = Array.from(new Set(['id', ...config.fields.map((f) => f.key), ...config.columns])).join(
    ',',
  );
  let query = s.db
    .from(config.table)
    .select(columns, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * 50, page * 50 - 1);
  if (config.school) query = query.filter('school_id', 'eq', s.role.school_id);
  const q = (filters.q || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').slice(0, 100);
  if (q && config.search.length)
    query = query.or(
      config.search
        .map((key) => (key === 'year' ? `year.eq.${Number(q) || 0}` : `${key}.ilike.%${q}%`))
        .join(','),
    );
  if (filters.classroom && config.table === 'enrollments')
    query = query.filter('classroom_id', 'eq', filters.classroom);
  if (filters.year && ['classrooms', 'terms', 'enrollments'].includes(config.table))
    query = query.filter('academic_year_id', 'eq', filters.year);
  if (!config.school && ['terms', 'enrollments'].includes(config.table))
    query = query.filter(
      'academic_year_id',
      'in',
      `(${options.academic_years.map((o) => o.value).join(',') || '00000000-0000-0000-0000-000000000000'})`,
    );
  const { data, error, count } = await query;
  if (error) throw error;
  const rows = (data || []) as unknown as Record<string, unknown>[];
  const enrollments =
    module === 'students' && rows.length
      ? await s.db
          .from('enrollments')
          .select('student_id,classroom_id,student_number')
          .in(
            'student_id',
            rows.map((row) => String(row.id)),
          )
          .eq('status', 'active')
      : { data: [], error: null };
  if (enrollments.error) throw enrollments.error;
  const label = (key: string) => config.fields.find((f) => f.key === key)?.label || captions[key] || key;
  const display = (row: Record<string, unknown>, key: string) => {
    const v = row[key];
    const f = config.fields.find((f) => f.key === key);
    if (typeof v === 'boolean')
      return <span className={`badge ${v ? 'green' : 'gray'}`}>{v ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>;
    if (!v) return '—';
    if (f?.source) return options[f.source]?.find((o) => o.value === v)?.label || 'ไม่พบข้อมูล';
    if (f?.options) return f.options.find((o) => o.value === v)?.label || String(v);
    if (key === 'archived_at' || f?.type === 'date') return thaiDate(String(v));
    return String(v);
  };
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">บริหารโรงเรียน</div>
          <h1>{config.title}</h1>
          <p className="muted">ทั้งหมด {count || 0} รายการ · แสดงหน้าละ 50 รายการ</p>
        </div>
        <RecordForm
          title={`เพิ่ม${config.singular}`}
          fields={module === 'students' ? studentCreateFields : config.fields}
          options={options}
          action={module === 'students' ? createStudent : saveAdmin.bind(null, module, null)}
        />
      </div>
      {module === 'students' && (
        <div className="actions">
          <Button asChild variant="outline">
            <Link href="/admin/import">นำเข้านักเรียน Excel</Link>
          </Button>
          <Button asChild variant="outline">
            <a href="/api/export?kind=template">
              <Download size={16} />
              ดาวน์โหลดแบบฟอร์มและตัวอย่าง Excel
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/api/export?kind=students">
              <Download size={16} />
              Export Excel
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/enrollments">จัดห้อง / ย้ายนักเรียน</Link>
          </Button>
        </div>
      )}
      {module === 'grading' && (
        <div className="notice">
          หมวดคะแนนและงานย่อยกำหนดในหน้า ปพ.5 ของแต่ละรายวิชา น้ำหนักรวมต้องเท่ากับ 100 ก่อนสรุปผล{' '}
          <Link href="/classrooms" className="underline">
            เปิดห้องเรียน
          </Link>
        </div>
      )}
      <form className="filter-bar">
        <label className="search">
          <span className="sr-only">ค้นหา</span>
          <input name="q" defaultValue={filters.q} placeholder="ค้นหาข้อมูล…" />
        </label>
        {['classrooms', 'terms', 'enrollments'].includes(module) && (
          <label>
            ปีการศึกษา
            <select name="year" defaultValue={filters.year || ''}>
              <option value="">ทุกปี</option>
              {options.academic_years.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {module === 'enrollments' && (
          <label>
            ห้องเรียน
            <select name="classroom" defaultValue={filters.classroom || ''}>
              <option value="">ทุกห้อง</option>
              {options.classrooms.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button variant="outline">
          <Search size={17} />
          ค้นหา
        </Button>
      </form>
      {!rows.length ? (
        <div className="card">
          <Empty text={`ยังไม่มีข้อมูล${config.singular}`} />
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {config.columns.map((k) => (
                  <th key={k}>{label(k)}</th>
                ))}
                {module === 'students' && (
                  <>
                    <th>ชั้น / ห้องเรียน (ปีการศึกษา)</th>
                    <th>เลขที่</th>
                  </>
                )}
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)}>
                  {config.columns.map((k) => (
                    <td key={k}>{display(row, k)}</td>
                  ))}
                  {module === 'students' && (
                    <>
                      <td>
                        {enrollments
                          .data!.filter((e) => e.student_id === row.id)
                          .map((e) => (
                            <div key={e.classroom_id}>
                              {options.classrooms.find((c) => c.value === e.classroom_id)?.label || '—'}
                            </div>
                          ))}
                      </td>
                      <td>
                        {enrollments
                          .data!.filter((e) => e.student_id === row.id)
                          .map((e) => (
                            <div key={e.classroom_id}>{e.student_number}</div>
                          ))}
                      </td>
                    </>
                  )}
                  <td>
                    <div className="actions">
                      <RecordForm
                        title={`แก้ไข${config.singular}`}
                        edit
                        confirm={config.fields.some((f) => f.key === 'active' || f.key === 'is_active')}
                        fields={config.fields}
                        initial={row}
                        options={options}
                        action={saveAdmin.bind(null, module, String(row.id))}
                      />
                      {config.archive && !row.archived_at && (
                        <ActionButton
                          variant="outline"
                          confirm="ปิดปีการศึกษานี้และเก็บเข้าคลัง? ข้อมูลเดิมยังดูและพิมพ์ได้ แต่แก้ผลการเรียนไม่ได้"
                          action={archiveYear.bind(null, String(row.id))}
                        >
                          เก็บเข้าคลัง
                        </ActionButton>
                      )}
                      {module === 'assignments' && (
                        <Button asChild variant="outline">
                          <Link href={`/pp5/${row.id}`}>เปิด ปพ.5</Link>
                        </Button>
                      )}
                      {module === 'enrollments' && row.status === 'active' && (
                        <RecordForm
                          title="ย้ายห้อง"
                          confirm
                          fields={[
                            {
                              key: 'enrollment_id',
                              label: 'การลงทะเบียนเดิม',
                              type: 'select',
                              required: true,
                              options: [{ value: String(row.id), label: String(display(row, 'student_id')) }],
                            },
                            {
                              key: 'classroom_id',
                              label: 'ห้องปลายทาง',
                              type: 'select',
                              source: 'classrooms',
                              required: true,
                            },
                            {
                              key: 'student_number',
                              label: 'เลขที่ใหม่',
                              type: 'number',
                              min: 1,
                              required: true,
                            },
                          ]}
                          initial={{ enrollment_id: row.id }}
                          options={options}
                          action={moveStudent}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="actions">
        <span className="muted">
          หน้า {page} จาก {Math.max(1, Math.ceil((count || 0) / 50))}
        </span>
        {page > 1 && (
          <Link
            className="button button-outline"
            href={`?${new URLSearchParams({ ...filters, page: String(page - 1) })}`}
          >
            ก่อนหน้า
          </Link>
        )}
        {page * 50 < (count || 0) && (
          <Link
            className="button button-outline"
            href={`?${new URLSearchParams({ ...filters, page: String(page + 1) })}`}
          >
            ถัดไป
          </Link>
        )}
      </div>
    </div>
  );
}
