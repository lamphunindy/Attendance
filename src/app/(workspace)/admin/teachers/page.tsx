import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { manageMember, inviteTeacher, cancelInvitation } from '@/lib/actions';
import { RecordForm } from '@/components/admin/record-form';
import { ActionButton } from '@/components/ui/action-button';
import { Empty } from '@/components/ui/states';
import { thaiDate } from '@/lib/utils';
export default async function Teachers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireAdmin(),
    { q = '' } = await searchParams;
  const results = await Promise.all([
    s.db
      .from('profiles')
      .select('id,full_name,email,active,last_login_at,requested_school_id')
      .order('full_name'),
    s.db.from('user_roles').select('user_id,role').eq('school_id', s.role.school_id),
    s.db
      .from('teacher_invitations')
      .select('id,email,role,status,expires_at')
      .eq('school_id', s.role.school_id)
      .order('created_at', { ascending: false })
      .limit(100),
    s.db.from('teacher_assignments').select('id,teacher_id,classroom_id').eq('school_id', s.role.school_id),
    s.db.from('classrooms').select('id,name').eq('school_id', s.role.school_id),
  ]);
  for (const r of results) if (r.error) throw r.error;
  const [profiles, roles, invites, assignments, classes] = results;
  const people = profiles.data!.filter(
    (p) =>
      (p.requested_school_id === s.role.school_id || roles.data!.some((r) => r.user_id === p.id)) &&
      `${p.full_name} ${p.email}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>จัดการครู</h1>
          <p className="muted">อนุมัติบัญชีและกำหนดสิทธิ์ภายในโรงเรียน</p>
        </div>
        <RecordForm
          title="เชิญครูด้วยอีเมล Google"
          confirm
          fields={[
            { key: 'email', label: 'อีเมล Google', type: 'email', required: true },
            {
              key: 'role',
              label: 'สิทธิ์',
              type: 'select',
              required: true,
              default: 'teacher',
              options: [
                { value: 'teacher', label: 'ครูผู้สอน' },
                { value: 'admin', label: 'ผู้ดูแลระบบ' },
              ],
            },
          ]}
          action={inviteTeacher}
        />
      </div>
      <div className="notice">
        คำเชิญเป็นการอนุญาตอีเมลล่วงหน้า อายุ 14 วัน เมื่อครูเข้าสู่ระบบด้วย Google ที่ตรงกันจะได้รับสิทธิ์
        ระบบไม่ส่งอีเมลอัตโนมัติ
      </div>
      <div className="card stack">
        <h2>ให้ครูสมัครบัญชีด้วยตนเอง</h2>
        <p className="muted">
          ให้ครูเปิดหน้าเข้าสู่ระบบ แล้วกด “สร้างบัญชีครูด้วย Google” และเลือกอีเมลของตนเอง
          บัญชีจะปรากฏในรายการด้านล่างพร้อมสถานะรออนุมัติ ให้ตรวจสอบชื่อและอีเมลก่อนกดอนุมัติ
          จากนั้นมอบหมายห้องเรียนและรายวิชาให้ครู
        </p>
        <Link href="/login" className="button button-outline">
          เปิดหน้าสมัครบัญชีครู
        </Link>
      </div>
      <form className="filter-bar">
        <label className="search">
          <span className="sr-only">ค้นหาครู</span>
          <input name="q" defaultValue={q} placeholder="ค้นหาชื่อหรืออีเมลครู" />
        </label>
        <button className="button button-outline">ค้นหา</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ครู / บัญชี</th>
              <th>สิทธิ์</th>
              <th>ห้องที่สอน</th>
              <th>Login ล่าสุด</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const role = roles.data!.find((r) => r.user_id === p.id)?.role;
              return (
                <tr key={p.id}>
                  <td>
                    <strong>{p.full_name}</strong>
                    <p className="small muted">{p.email}</p>
                  </td>
                  <td>
                    <span className={`badge ${!p.active ? 'gray' : role ? 'green' : 'amber'}`}>
                      {!p.active
                        ? 'ปิดใช้งาน'
                        : role === 'admin'
                          ? 'ผู้ดูแลระบบ'
                          : role === 'teacher'
                            ? 'ครู'
                            : 'รออนุมัติ'}
                    </span>
                  </td>
                  <td>
                    {assignments
                      .data!.filter((a) => a.teacher_id === p.id)
                      .map((a) => (
                        <Link key={a.id} href={`/pp5/${a.id}`} className="badge mr-1">
                          {classes.data!.find((c) => c.id === a.classroom_id)?.name}
                        </Link>
                      ))}
                  </td>
                  <td>{p.last_login_at ? thaiDate(p.last_login_at) : '—'}</td>
                  <td>
                    <div className="actions">
                      {!role && (
                        <ActionButton
                          action={manageMember.bind(null, p.id, 'teacher', true)}
                          confirm="อนุมัติบัญชีนี้เป็นครูผู้สอน?"
                        >
                          อนุมัติ
                        </ActionButton>
                      )}
                      {p.id !== s.user.id && (
                        <>
                          <ActionButton
                            variant="outline"
                            action={manageMember.bind(
                              null,
                              p.id,
                              role === 'admin' ? 'teacher' : 'admin',
                              true,
                            )}
                            confirm={`เปลี่ยนบัญชี ${p.email} เป็น${role === 'admin' ? 'ครูผู้สอน' : 'ผู้ดูแลระบบ ซึ่งสามารถดูและแก้ข้อมูลทั้งโรงเรียน'}?`}
                          >
                            {role === 'admin' ? 'เปลี่ยนเป็นครู' : 'กำหนด Admin'}
                          </ActionButton>
                          <ActionButton
                            variant={p.active ? 'destructive' : 'outline'}
                            action={manageMember.bind(null, p.id, role || 'teacher', !p.active)}
                            confirm={`${p.active ? 'ปิด' : 'เปิด'}ใช้งานบัญชีนี้?`}
                          >
                            {p.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          </ActionButton>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!people.length && <Empty text="ไม่พบบัญชีครู" />}
      </div>
      <h2>คำเชิญล่าสุด</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>อีเมล</th>
              <th>สิทธิ์</th>
              <th>สถานะ</th>
              <th>หมดอายุ</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {invites.data!.map((i) => (
              <tr key={i.id}>
                <td>{i.email}</td>
                <td>{i.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ครู'}</td>
                <td>
                  {i.status === 'pending' && new Date(i.expires_at) < new Date()
                    ? 'หมดอายุ'
                    : {
                        pending: 'รอเข้าสู่ระบบ',
                        accepted: 'รับคำเชิญแล้ว',
                        cancelled: 'ยกเลิก',
                        expired: 'หมดอายุ',
                      }[i.status]}
                </td>
                <td>{thaiDate(i.expires_at)}</td>
                <td>
                  {i.status === 'pending' && (
                    <ActionButton
                      variant="outline"
                      confirm="ยกเลิกคำเชิญนี้?"
                      action={cancelInvitation.bind(null, i.id)}
                    >
                      ยกเลิกคำเชิญ
                    </ActionButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
