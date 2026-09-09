'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { importStudents } from '@/lib/actions';
import type { ImportedStudent } from '@/lib/validations';
type Preview = { rows: ImportedStudent[]; errors: { row: number; message: string }[] };
export function ImportPanel({ classrooms }: { classrooms: { value: string; label: string }[] }) {
  const [classroom, setClassroom] = useState(classrooms[0]?.value || ''),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [pending, start] = useTransition();
  return (
    <div className="stack">
      <div className="notice">
        เลือกชั้น / ห้องปลายทาง → ดาวน์โหลดแบบฟอร์ม → กรอกข้อมูล → ตรวจตัวอย่าง → ยืนยันนำเข้า
        ระบบบันทึกทั้งชุดหรือยกเลิกทั้งชุด
      </div>
      <a className="button button-outline w-fit" href="/api/export?kind=template">
        <Download size={18} />
        ดาวน์โหลดแบบฟอร์มและตัวอย่าง Excel
      </a>
      <p className="muted">
        กรอกข้อมูลในชีต “นักเรียน” ส่วนชีต “ตัวอย่าง” ใช้ดูวิธีกรอกเท่านั้น เลือกชั้น / ห้องเรียนจากฟอร์มนี้
        ระบบจะใช้ห้องเดียวกันกับนักเรียนทุกแถวในไฟล์ คอลัมน์ student_number คือเลขที่นักเรียนในห้อง
      </p>
      {!classrooms.length && (
        <div className="notice warning">
          ยังไม่มีห้องเรียนที่เปิดรับนักเรียน{' '}
          <Link href="/admin/classrooms" className="underline">
            เพิ่มชั้น / ห้องเรียนก่อนนำเข้า
          </Link>
        </div>
      )}
      <div className="card stack">
        <h2>อัปโหลดรายชื่อนักเรียน</h2>
        <label>
          ห้องเรียนปลายทาง
          <select
            disabled={!classrooms.length || pending}
            value={classroom}
            onChange={(e) => {
              setClassroom(e.target.value);
              setPreview(null);
            }}
          >
            {classrooms.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          ไฟล์รายชื่อนักเรียน (.xlsx ไม่เกิน 3 MB)
          <input
            disabled={pending}
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPreview(null);
            }}
          />
        </label>
        <Button
          disabled={!file || !classroom || pending}
          onClick={() =>
            start(async () => {
              const form = new FormData();
              form.set('file', file!);
              form.set('classroom', classroom);
              try {
                const response = await fetch('/api/import/preview', { method: 'POST', body: form });
                const result = await response.json();
                if (!response.ok) {
                  toast.error(result.error);
                  return;
                }
                setPreview(result as Preview);
              } catch {
                toast.error('ไม่สามารถอ่านไฟล์ได้ กรุณาลองอีกครั้ง');
              }
            })
          }
        >
          <Upload size={18} />
          {pending ? 'กำลังตรวจสอบ…' : 'ตรวจสอบและแสดงตัวอย่าง'}
        </Button>
      </div>
      {preview && (
        <>
          <div className={`notice ${preview.errors.length ? 'warning' : ''}`} role="status">
            อ่านได้ {preview.rows.length} คน · พบข้อผิดพลาด {preview.errors.length} รายการ
          </div>
          {preview.errors.map((e, i) => (
            <p key={i} className="error-text">
              {e.row ? `แถว ${e.row}: ` : ''}
              {e.message}
            </p>
          ))}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>รหัสนักเรียน</th>
                  <th>เลขที่</th>
                  <th>คำนำหน้า</th>
                  <th>ชื่อ</th>
                  <th>นามสกุล</th>
                  <th>ชื่อเล่น</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.student_code}</td>
                    <td>{r.student_number}</td>
                    <td>{r.prefix}</td>
                    <td>{r.first_name}</td>
                    <td>{r.last_name}</td>
                    <td>{r.nickname}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ActionButton
            disabled={preview.errors.length > 0 || preview.rows.length === 0}
            confirm={`ยืนยันนำเข้านักเรียน ${preview.rows.length} คนเข้าห้องที่เลือก?`}
            action={async () => {
              const result = await importStudents(classroom, preview.rows);
              if (!result.error) {
                setPreview(null);
                setFile(null);
              }
              return result;
            }}
          >
            ยืนยันนำเข้าทั้งหมด
          </ActionButton>
        </>
      )}
    </div>
  );
}
