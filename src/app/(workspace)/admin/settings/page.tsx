import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { schoolFields } from '@/lib/admin/config';
import { saveSchool, saveSettings } from '@/lib/actions';
import { RecordForm } from '@/components/admin/record-form';
export default async function Settings() {
  const s = await requireAdmin();
  const [school, settings] = await Promise.all([
    s.db
      .from('schools')
      .select('name,code,logo_url,address,phone,director_name,education_area')
      .eq('id', s.role.school_id)
      .single(),
    s.db.from('school_settings').select('key,value').eq('school_id', s.role.school_id),
  ]);
  if (school.error) throw school.error;
  if (settings.error) throw settings.error;
  return (
    <div className="stack">
      <h1>ตั้งค่าระบบ</h1>
      <section className="card stack">
        <h2>ข้อมูลโรงเรียน</h2>
        <RecordForm
          title="ข้อมูลโรงเรียน"
          fields={schoolFields}
          initial={school.data}
          action={saveSchool}
          inline
          edit
        />
      </section>
      <section className="card stack">
        <h2>เกณฑ์และสิทธิ์การใช้งาน</h2>
        <RecordForm
          title="ตั้งค่าระบบ"
          inline
          edit
          confirm
          fields={[
            {
              key: 'minimum_attendance_percentage',
              label: 'เวลาเรียนขั้นต่ำ (%)',
              type: 'number',
              min: 0,
              max: 100,
              default: 80,
              required: true,
            },
            {
              key: 'score_decimal_places',
              label: 'จำนวนทศนิยมที่แสดง',
              type: 'number',
              min: 0,
              max: 2,
              default: 2,
              required: true,
            },
            {
              key: 'teacher_edit_students',
              label: 'อนุญาตให้ครูแก้ชื่อ / ชื่อเล่นนักเรียนในห้องที่รับผิดชอบ',
              type: 'checkbox',
              default: false,
              required: true,
            },
          ]}
          initial={Object.fromEntries(settings.data.map((x) => [x.key, x.value]))}
          action={saveSettings}
        />
      </section>
      <div className="actions">
        <Link className="button button-outline" href="/admin/characteristics">
          เกณฑ์คุณลักษณะ
        </Link>
        <Link className="button button-outline" href="/admin/reading">
          เกณฑ์อ่านคิดวิเคราะห์เขียน
        </Link>
        <Link className="button button-outline" href="/admin/grading">
          เกณฑ์เกรด
        </Link>
      </div>
    </div>
  );
}
