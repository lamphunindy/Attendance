import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { thaiDate } from '@/lib/utils';
import { Empty } from '@/components/ui/states';
export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireAdmin(),
    f = await searchParams,
    page = Math.max(1, Number(f.page) || 1);
  let query = s.db
    .from('audit_logs')
    .select('id,actor_user_id,action,entity_type,entity_id,before_data,after_data,metadata,created_at', {
      count: 'exact',
    })
    .eq('school_id', s.role.school_id)
    .order('created_at', { ascending: false })
    .range((page - 1) * 50, page * 50 - 1);
  if (f.action) query = query.eq('action', f.action);
  if (f.entity) query = query.eq('entity_type', f.entity);
  if (f.actor) query = query.eq('actor_user_id', f.actor);
  if (f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) {
    query = query
      .gte('created_at', `${f.date}T00:00:00+07:00`)
      .lt('created_at', new Date(new Date(`${f.date}T00:00:00+07:00`).getTime() + 86400000).toISOString());
  }
  const [logs, profiles] = await Promise.all([query, s.db.from('profiles').select('id,full_name')]);
  if (logs.error) throw logs.error;
  if (profiles.error) throw profiles.error;
  return (
    <div className="stack">
      <div>
        <h1>ประวัติการแก้ไขข้อมูล</h1>
        <p className="muted">Audit Log · {logs.count} รายการ</p>
      </div>
      <form className="filter-bar">
        <label>
          การกระทำ
          <select name="action" defaultValue={f.action || ''}>
            <option value="">ทั้งหมด</option>
            {['insert', 'update', 'delete', 'login', 'export', 'manage_member', 'bootstrap_admin'].map(
              (a) => (
                <option key={a}>{a}</option>
              ),
            )}
          </select>
        </label>
        <label>
          ประเภทข้อมูล
          <select name="entity" defaultValue={f.entity || ''}>
            <option value="">ทั้งหมด</option>
            {[
              'student_scores',
              'students',
              'attendance_records',
              'final_results',
              'teacher_assignments',
              'user_roles',
              'profiles',
              'school_settings',
              'schools',
            ].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          ผู้ใช้งาน
          <select name="actor" defaultValue={f.actor || ''}>
            <option value="">ทุกคน</option>
            {profiles.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          วันที่
          <input type="date" name="date" defaultValue={f.date} />
        </label>
        <button className="button button-outline">กรองข้อมูล</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>เวลา</th>
              <th>ผู้ใช้งาน</th>
              <th>การกระทำ</th>
              <th>ประเภทข้อมูล</th>
              <th>รายการ</th>
              <th>ก่อนแก้</th>
              <th>หลังแก้</th>
            </tr>
          </thead>
          <tbody>
            {logs.data.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap">
                  {thaiDate(l.created_at)}
                  <p className="small muted">
                    {new Date(l.created_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })}
                  </p>
                </td>
                <td>{profiles.data.find((p) => p.id === l.actor_user_id)?.full_name || 'ระบบ'}</td>
                <td>{l.action}</td>
                <td>{l.entity_type}</td>
                <td>
                  <code className="small">{l.entity_id?.slice(0, 8) || '—'}</code>
                </td>
                {[l.before_data, l.after_data].map((data, i) => (
                  <td key={i}>
                    {data ? (
                      <details>
                        <summary className="button button-outline">ดู JSON</summary>
                        <pre className="json-view min-w-64">{JSON.stringify(data, null, 2)}</pre>
                      </details>
                    ) : (
                      '—'
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!logs.data.length && <Empty text="ไม่พบประวัติที่ตรงกับตัวกรอง" />}
      </div>
      <div className="actions">
        <span>หน้า {page}</span>
        {page > 1 && (
          <Link
            className="button button-outline"
            href={`?${new URLSearchParams({ ...f, page: String(page - 1) })}`}
          >
            ก่อนหน้า
          </Link>
        )}
        {page * 50 < (logs.count || 0) && (
          <Link
            className="button button-outline"
            href={`?${new URLSearchParams({ ...f, page: String(page + 1) })}`}
          >
            ถัดไป
          </Link>
        )}
      </div>
    </div>
  );
}
