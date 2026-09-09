'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import type { AssignmentData } from '@/lib/data';
import { fullName } from '@/lib/utils';
import { totalScore, gradeFor } from '@/lib/grading';
import { saveScoreMatrix } from '@/lib/actions';
import { scoreSchema } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/states';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useUnsaved } from './unsaved';
export function ScoreEditor({ data: d }: { data: AssignmentData }) {
  const items = d.items.filter((i) => i.active),
    [selectedValue, setSelected] = useState(items[0]?.id || ''),
    [changes, setChanges] = useState<Record<string, string>>({}),
    [pending, start] = useTransition(),
    [confirm, setConfirm] = useState<'clear' | 'full' | null>(null),
    [copy, setCopy] = useState(''),
    [mode, setMode] = useState<'table' | 'item'>('table');
  const selected = items.some((item) => item.id === selectedValue) ? selectedValue : items[0]?.id || '';
  const dirty = Object.keys(changes).length > 0;
  useUnsaved(dirty);
  const editable = d.assignment.workflow === 'draft' && !d.year.archived_at;
  const selectedItem = items.find((i) => i.id === selected);
  const roster = d.enrollments.filter((e) => e.status === 'active');
  const decimals = Number(d.settings.find((s) => s.key === 'score_decimal_places')?.value ?? 2);
  const key = (en: string, item: string) => `${en}:${item}`;
  const value = (en: string, item: string) =>
    changes[key(en, item)] ??
    String(d.scores.find((s) => s.enrollment_id === en && s.score_item_id === item)?.score ?? '');
  const change = (en: string, item: string, v: string) => setChanges((c) => ({ ...c, [key(en, item)]: v }));
  const total = (en: string) =>
    totalScore(
      d.categories.map((c) => ({
        ...c,
        scores: items
          .filter((i) => i.score_category_id === c.id)
          .map((i) => (value(en, i.id) === '' ? null : Number(value(en, i.id)))),
      })),
    );
  const grade = (en: string) => {
    try {
      return (
        gradeFor(
          total(en),
          d.scales.map((g) => ({ min: g.min_score, max: g.max_score, grade: g.display_grade })),
        ) || '—'
      );
    } catch {
      return '—';
    }
  };
  function fill(v: string) {
    if (!selectedItem) return;
    if (v !== '' && !scoreSchema(selectedItem.max_score).safeParse(Number(v)).success) {
      toast.error(`คะแนนต้องอยู่ระหว่าง 0–${selectedItem.max_score}`);
      return;
    }
    setChanges((c) => ({ ...c, ...Object.fromEntries(roster.map((e) => [key(e.id, selected), v])) }));
  }
  function save() {
    start(async () => {
      const matrix = items
        .map((item) => ({
          item_id: item.id,
          rows: roster
            .filter((e) => Object.hasOwn(changes, key(e.id, item.id)))
            .map((e) => ({
              enrollment_id: e.id,
              score: value(e.id, item.id) === '' ? null : Number(value(e.id, item.id)),
            })),
        }))
        .filter((i) => i.rows.length);
      for (const entry of matrix) {
        const item = items.find((i) => i.id === entry.item_id)!;
        if (entry.rows.some((r) => !scoreSchema(item.max_score).safeParse(r.score).success)) {
          toast.error('งาน ' + item.title + ': คะแนนต้องอยู่ระหว่าง 0–' + item.max_score);
          return;
        }
      }
      try {
        const r = await saveScoreMatrix(d.assignment.id, matrix);
        if (r.error) {
          toast.error(r.error);
          return;
        }
        setChanges({});
        toast.success('บันทึกคะแนนเรียบร้อยแล้ว');
      } catch {
        toast.error('ไม่สามารถบันทึกคะแนนได้ กรุณาลองใหม่อีกครั้ง');
      }
    });
  }
  function input(en: string, item: (typeof items)[number]) {
    const v = value(en, item.id);
    const invalid = v !== '' && !scoreSchema(item.max_score).safeParse(Number(v)).success;
    return (
      <input
        className={`score-input ${invalid ? '!border-red-500' : ''}`}
        type="number"
        inputMode="decimal"
        min={0}
        max={item.max_score}
        step="0.01"
        value={v}
        disabled={!editable || pending}
        aria-label={`${item.title} เลขที่ ${roster.find((e) => e.id === en)?.student_number}`}
        aria-invalid={invalid}
        onChange={(e) => change(en, item.id, e.target.value)}
      />
    );
  }
  if (!items.length) return <Empty text="ยังไม่มีงานให้คะแนน กรุณาเพิ่มหมวดคะแนนและงานด้านล่าง" />;
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h2>บันทึกคะแนน</h2>
          <p className="muted">ช่องว่าง = ยังไม่บันทึก · 0 = ได้ศูนย์คะแนน · รวม/เกรดในตารางเป็นค่าประมาณ</p>
        </div>
        <div className="actions score-desktop">
          <Button variant="outline" onClick={() => setMode(mode === 'table' ? 'item' : 'table')}>
            {mode === 'table' ? 'กรอกคะแนนทีละงาน' : 'แสดงตารางทั้งหมด'}
          </Button>
        </div>
      </div>
      <div className="card stack">
        <div className="filter-bar">
          <label className="search">
            เลือกงาน
            <select aria-label="เลือกงาน" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {d.categories.find((c) => c.id === i.score_category_id)?.name} · {i.title} ({i.max_score}{' '}
                  คะแนน)
                </option>
              ))}
            </select>
          </label>
          <label>
            คัดลอกคะแนนให้ทุกคน
            <input
              type="number"
              inputMode="decimal"
              value={copy}
              min={0}
              max={selectedItem?.max_score}
              onChange={(e) => setCopy(e.target.value)}
            />
          </label>
          <Button variant="outline" disabled={!editable || pending || copy === ''} onClick={() => fill(copy)}>
            ใช้ค่านี้ทุกคน
          </Button>
        </div>
        <div className="actions">
          <Button variant="outline" disabled={!editable || pending} onClick={() => setConfirm('full')}>
            กรอกเต็มทุกคน
          </Button>
          <Button variant="destructive" disabled={!editable || pending} onClick={() => setConfirm('clear')}>
            ล้างคะแนนงานนี้
          </Button>
          <span className="muted small">คะแนนเต็ม {selectedItem?.max_score}</span>
        </div>
      </div>
      <div className={mode === 'table' ? 'score-desktop table-wrap' : 'hidden'}>
        <table>
          <thead>
            <tr>
              <th className="sticky-number">เลขที่</th>
              <th className="sticky-name">ชื่อ–นามสกุล</th>
              {items.map((i) => (
                <th key={i.id}>
                  {i.title}
                  <div className="small muted">เต็ม {i.max_score}</div>
                </th>
              ))}
              <th>รวม</th>
              <th>เกรด</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((e) => (
              <tr key={e.id}>
                <td className="sticky-number">{e.student_number}</td>
                <td className="sticky-name">{fullName(d.students.find((s) => s.id === e.student_id)!)}</td>
                {items.map((i) => (
                  <td key={i.id}>{input(e.id, i)}</td>
                ))}
                <td>{total(e.id).toFixed(decimals)}</td>
                <td>
                  <span className="badge">{grade(e.id)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`card !p-0 ${mode === 'table' ? 'mobile-score-list' : ''}`}>
        {roster.map((e) => (
          <div className="student-card" key={e.id}>
            <div className="student-identity">
              <span className="number-dot">{e.student_number}</span>
              <div>
                <strong>{fullName(d.students.find((s) => s.id === e.student_id)!)}</strong>
                <p className="small muted">
                  รวม {total(e.id).toFixed(decimals)} · เกรด {grade(e.id)}
                </p>
              </div>
            </div>
            {selectedItem && (
              <label>
                <span className="sr-only">คะแนน</span>
                {input(e.id, selectedItem)}
              </label>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <div className="save-bar">
          <span className={dirty ? 'text-amber-700' : 'muted'}>
            {dirty ? `มีข้อมูลที่ยังไม่บันทึก ${Object.keys(changes).length} ช่อง` : 'บันทึกข้อมูลล่าสุดแล้ว'}
          </span>
          <Button onClick={save} disabled={pending || !dirty}>
            <Save size={18} />
            {pending ? 'กำลังบันทึก…' : 'บันทึกคะแนนทั้งหมด'}
          </Button>
        </div>
      )}
      <Dialog open={confirm !== null} onOpenChange={() => setConfirm(null)}>
        <DialogContent>
          <DialogTitle className="text-lg font-bold">
            {confirm === 'clear' ? 'ล้างคะแนนงานนี้' : 'กรอกคะแนนเต็มทุกคน'}
          </DialogTitle>
          <DialogDescription>
            เปลี่ยนคะแนนงาน {selectedItem?.title} ทุกคน? คุณยังต้องกดบันทึกคะแนนทั้งหมดเพื่อจัดเก็บ
          </DialogDescription>
          <div className="actions">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => {
                fill(confirm === 'clear' ? '' : String(selectedItem?.max_score));
                setConfirm(null);
              }}
            >
              ยืนยัน
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
