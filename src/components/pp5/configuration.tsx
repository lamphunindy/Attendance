import type { AssignmentData } from '@/lib/data';
import type { Field } from '@/lib/admin/config';
import { RecordForm } from '@/components/admin/record-form';
import { ActionButton } from '@/components/ui/action-button';
import { saveAssignmentConfig, defaultCategories } from '@/lib/actions';
const categoryFields: Field[] = [
  { key: 'name', label: 'ชื่อหมวดคะแนน', required: true },
  {
    key: 'max_score',
    label: 'คะแนนเต็มหมวด',
    type: 'number',
    required: true,
    min: 0.01,
    max: 100,
    step: '0.01',
  },
  {
    key: 'weight',
    label: 'น้ำหนักคิดเป็นคะแนนรวม (%)',
    type: 'number',
    required: true,
    min: 0.01,
    max: 100,
    step: '0.01',
  },
  { key: 'sort_order', label: 'ลำดับ', type: 'number', required: true, min: 0, default: 0 },
  {
    key: 'category_type',
    label: 'ประเภท',
    type: 'select',
    required: true,
    default: 'custom',
    options: [
      { value: 'before_midterm', label: 'ก่อนกลางภาค' },
      { value: 'midterm', label: 'กลางภาค' },
      { value: 'after_midterm', label: 'หลังกลางภาค' },
      { value: 'final', label: 'ปลายภาค' },
      { value: 'custom', label: 'กำหนดเอง' },
    ],
  },
];
const indicatorFields: Field[] = [
  { key: 'code', label: 'รหัสตัวชี้วัด เช่น ว 4.2 ป.6/1', required: true },
  { key: 'description', label: 'รายละเอียด', type: 'textarea', required: true },
  { key: 'sort_order', label: 'ลำดับ', type: 'number', required: true, min: 0, default: 0 },
];
export function ScoreConfiguration({ data: d }: { data: AssignmentData }) {
  const editable = d.assignment.workflow === 'draft' && !d.year.archived_at;
  const itemFields: Field[] = [
    {
      key: 'score_category_id',
      label: 'หมวดคะแนน',
      type: 'select',
      required: true,
      options: d.categories.map((c) => ({ value: c.id, label: c.name })),
    },
    { key: 'title', label: 'ชื่องาน / ข้อสอบ', required: true },
    {
      key: 'max_score',
      label: 'คะแนนเต็ม',
      type: 'number',
      min: 0.01,
      max: 100,
      step: '0.01',
      required: true,
    },
    { key: 'description', label: 'คำอธิบาย', type: 'textarea' },
    { key: 'due_date', label: 'กำหนดส่ง', type: 'date' },
    { key: 'sort_order', label: 'ลำดับ', type: 'number', min: 0, required: true, default: 0 },
    {
      key: 'active',
      label: 'เปิดใช้งาน (ยกเลิกเพื่อซ่อนงาน โดยเก็บคะแนนเดิม)',
      type: 'checkbox',
      required: true,
      default: true,
    },
  ];
  return (
    <section className="card stack">
      <div className="page-heading">
        <h2>หมวดคะแนนและงานย่อย</h2>
        {editable && (
          <div className="actions">
            {!d.categories.length && (
              <ActionButton action={defaultCategories.bind(null, d.assignment.id)}>
                ใช้หมวดมาตรฐาน 30/20/30/20
              </ActionButton>
            )}
            <RecordForm
              title="เพิ่มหมวดคะแนน"
              fields={categoryFields}
              action={saveAssignmentConfig.bind(null, d.assignment.id, 'category', null)}
            />
            {d.categories.length > 0 && (
              <RecordForm
                title="เพิ่มงาน / ข้อสอบ"
                fields={itemFields}
                action={saveAssignmentConfig.bind(null, d.assignment.id, 'item', null)}
              />
            )}
          </div>
        )}
      </div>
      <div className={`notice ${d.categories.reduce((n, c) => n + c.weight, 0) === 100 ? '' : 'warning'}`}>
        น้ำหนักรวม {d.categories.reduce((n, c) => n + c.weight, 0)} / 100 · คะแนนหมวด = คะแนนงานรวม ÷
        คะแนนเต็มหมวด × น้ำหนัก · ก่อนยืนยันผล คะแนนเต็มงานต้องครบทุกหมวด
      </div>
      {d.categories.map((c) => (
        <div key={c.id} className="stack">
          <div className="page-heading">
            <h3>
              {c.name}{' '}
              <span className="badge">
                เต็ม {c.max_score} · น้ำหนัก {c.weight}%
              </span>
            </h3>
            {editable && (
              <RecordForm
                title="แก้ไขหมวดคะแนน"
                edit
                fields={categoryFields}
                initial={c}
                action={saveAssignmentConfig.bind(null, d.assignment.id, 'category', c.id)}
              />
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>งาน</th>
                  <th>คะแนนเต็ม</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {d.items
                  .filter((i) => i.score_category_id === c.id)
                  .map((i) => (
                    <tr key={i.id}>
                      <td>{i.title}</td>
                      <td>{i.max_score}</td>
                      <td>{i.active ? 'ใช้งาน' : 'เก็บเข้าคลัง'}</td>
                      <td>
                        {editable && (
                          <RecordForm
                            title="แก้ไขงาน / ปิดใช้งาน"
                            edit
                            confirm
                            fields={itemFields}
                            initial={i}
                            action={saveAssignmentConfig.bind(null, d.assignment.id, 'item', i.id)}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
export function IndicatorConfiguration({ data: d }: { data: AssignmentData }) {
  const editable = d.assignment.workflow === 'draft' && !d.year.archived_at;
  return (
    <section className="card stack">
      <div className="page-heading">
        <h2>ตัวชี้วัดการเรียนรู้</h2>
        {editable && (
          <RecordForm
            title="เพิ่มตัวชี้วัด"
            fields={indicatorFields}
            action={saveAssignmentConfig.bind(null, d.assignment.id, 'indicator', null)}
          />
        )}
      </div>
      {d.indicators.map((i) => (
        <div className="page-heading" key={i.id}>
          <div>
            <strong>{i.code}</strong>
            <p className="muted">{i.description}</p>
          </div>
          {editable && (
            <RecordForm
              title="แก้ไขตัวชี้วัด"
              edit
              fields={indicatorFields}
              initial={i}
              action={saveAssignmentConfig.bind(null, d.assignment.id, 'indicator', i.id)}
            />
          )}
        </div>
      ))}
    </section>
  );
}
