'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { AssignmentData } from '@/lib/data';
import { fullName } from '@/lib/utils';
import { saveAssessment } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/states';
import { useUnsaved } from '@/components/scores/unsaved';
export function AssessmentEditor({
  data: d,
  kind,
}: {
  data: AssignmentData;
  kind: 'indicators' | 'reading' | 'characteristics';
}) {
  const categories =
    kind === 'indicators'
      ? d.indicators.map((i) => ({ id: i.id, name: `${i.code} ${i.description}` }))
      : kind === 'reading'
        ? d.reading
        : d.characteristics;
  const [categoryValue, setCategory] = useState(categories[0]?.id || ''),
    [changes, setChanges] = useState<Record<string, string>>({}),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [pending, start] = useTransition();
  const category = categories.some((c) => c.id === categoryValue) ? categoryValue : categories[0]?.id || '';
  useUnsaved(Object.keys(changes).length > 0 || Object.keys(notes).length > 0);
  const editable = d.assignment.workflow === 'draft' && !d.year.archived_at;
  const levels =
    kind === 'indicators'
      ? [
          ['excellent', 'ดีเยี่ยม'],
          ['good', 'ดี'],
          ['pass', 'ผ่าน'],
          ['improve', 'ปรับปรุง'],
        ]
      : [
          ['3', '3 — ดีเยี่ยม'],
          ['2', '2 — ดี'],
          ['1', '1 — ผ่าน'],
          ['0', '0 — ไม่ผ่าน / ปรับปรุง'],
        ];
  const existing = (en: string) =>
    kind === 'indicators'
      ? d.indicatorResults.find((r) => r.enrollment_id === en && r.learning_indicator_id === category)
      : kind === 'reading'
        ? d.readingResults.find((r) => r.enrollment_id === en && r.category_id === category)
        : d.characteristicResults.find((r) => r.enrollment_id === en && r.characteristic_id === category);
  const value = (en: string) => {
    const row = existing(en);
    return changes[en] ?? (row ? ('result' in row ? row.result : String(row.level)) : '');
  };
  const note = (en: string) => notes[en] ?? existing(en)?.note ?? '';
  if (!categories.length) return <Empty text="ยังไม่มีหัวข้อประเมิน กรุณาเพิ่มหัวข้อก่อน" />;
  return (
    <div className="stack">
      <label>
        เลือกหัวข้อประเมิน
        <select
          aria-label="เลือกหัวข้อประเมิน"
          value={category}
          onChange={(e) => {
            if (
              (Object.keys(changes).length || Object.keys(notes).length) &&
              !window.confirm('มีข้อมูลยังไม่บันทึก ต้องการเปลี่ยนหัวข้อหรือไม่?')
            )
              return;
            setCategory(e.target.value);
            setChanges({});
            setNotes({});
          }}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">ประเมินตามระดับที่กำหนด โดยไม่เลือกผลล่วงหน้าให้นักเรียน</p>
      <div className="card !p-0">
        {d.enrollments
          .filter((e) => e.status === 'active')
          .map((e) => (
            <div key={e.id} className="student-card">
              <div className="student-identity">
                <span className="number-dot">{e.student_number}</span>
                <strong>{fullName(d.students.find((s) => s.id === e.student_id)!)}</strong>
              </div>
              <label className="min-w-40">
                <span className="sr-only">ผลประเมิน เลขที่ {e.student_number}</span>
                <select
                  value={value(e.id)}
                  disabled={!editable}
                  onChange={(v) => setChanges((c) => ({ ...c, [e.id]: v.target.value }))}
                >
                  <option value="">ยังไม่ประเมิน</option>
                  {levels.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-full small muted">
                หมายเหตุ
                <input
                  value={note(e.id)}
                  maxLength={1000}
                  disabled={!editable}
                  onChange={(v) => setNotes((n) => ({ ...n, [e.id]: v.target.value }))}
                />
              </label>
            </div>
          ))}
      </div>
      {editable && (
        <div className="save-bar">
          <span className="muted">
            {Object.keys(changes).length || Object.keys(notes).length
              ? 'มีข้อมูลที่ยังไม่บันทึก'
              : 'ข้อมูลล่าสุด'}
          </span>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const rows = d.enrollments
                  .filter((e) => e.status === 'active' && value(e.id) !== '')
                  .map((e) => ({
                    enrollment_id: e.id,
                    ...(kind === 'indicators' ? { result: value(e.id) } : { level: Number(value(e.id)) }),
                    note: note(e.id),
                  }));
                const r = await saveAssessment(d.assignment.id, kind, category, rows);
                if (r.error) toast.error(r.error);
                else {
                  toast.success(r.success);
                  setChanges({});
                  setNotes({});
                }
              })
            }
          >
            {pending ? 'กำลังบันทึก…' : 'บันทึกผลประเมินทั้งหมด'}
          </Button>
        </div>
      )}
    </div>
  );
}
