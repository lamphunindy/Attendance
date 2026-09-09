import Link from 'next/link';
import {
  BookOpen,
  Users,
  ClipboardCheck,
  FileClock,
  ArrowUpRight,
  CalendarDays,
  GraduationCap,
  Search,
} from 'lucide-react';
import { loadDashboard } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/states';
import { thaiDate } from '@/lib/utils';
export async function Dashboard({
  filters = {},
  mode = 'dashboard',
}: {
  filters?: Record<string, string | undefined>;
  mode?: 'dashboard' | 'classrooms' | 'attendance' | 'scores' | 'reports';
}) {
  const d = await loadDashboard(filters);
  const title = {
    dashboard: 'ห้องเรียนของฉัน',
    classrooms: 'ห้องเรียนของฉัน',
    attendance: 'เช็กชื่อเข้าเรียน',
    scores: 'บันทึกคะแนน',
    reports: 'รายงาน ปพ.5',
  }[mode];
  const year = d.years.find((y) => y.id === d.selectedYear),
    term = d.terms.find((t) => t.id === d.termId);
  const totalStudents = new Set(d.cards.flatMap((c) => c.studentIds)).size;
  const stats = [
    ['ห้องเรียนที่สอน', new Set(d.cards.map((c) => c.classroom_id)).size, 'ห้องเรียนในภาคเรียนนี้', BookOpen],
    ['นักเรียนทั้งหมด', totalStudents, 'คน ในห้องที่รับผิดชอบ', Users],
    ['คะแนนที่ยังไม่ครบ', d.cards.reduce((n, c) => n + c.missing, 0), 'ช่องคะแนนที่รอบันทึก', FileClock],
    ['รอเช็กชื่อวันนี้', d.cards.filter((c) => !c.today).length, 'รายวิชา ยังไม่ได้บันทึก', ClipboardCheck],
  ] as const;
  return (
    <div className="stack">
      {mode === 'dashboard' && (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">ภาพรวมการสอน</div>
              <h1>หน้าหลัก</h1>
            </div>
            <div className="muted actions">
              <CalendarDays size={16} />
              {thaiDate(new Date())}
            </div>
          </div>
          <section className="welcome-banner">
            <div>
              <span className="badge mb-3">
                ปีการศึกษา {year?.year || 'ยังไม่ได้ตั้งค่า'} · {term?.name || 'ยังไม่มีภาคเรียน'}
              </span>
              <h1>สวัสดี คุณครู{d.s.profile.full_name.split(' ')[0]} 👋</h1>
              <p className="muted mt-2">พร้อมดูแลการเรียนรู้ของนักเรียนวันนี้แล้วหรือยัง?</p>
            </div>
            <div className="welcome-art">
              <GraduationCap size={64} strokeWidth={1.3} />
            </div>
          </section>
          <div className="stats-grid">
            {stats.map(([label, value, foot, Icon]) => (
              <section key={label} className="card stat">
                <div className="stat-top">
                  <span>{label}</span>
                  <span className="stat-icon">
                    <Icon size={20} />
                  </span>
                </div>
                <div className="stat-value">{value.toLocaleString('th-TH')}</div>
                <div className="stat-foot">{foot}</div>
              </section>
            ))}
          </div>
        </>
      )}
      <div className="page-heading">
        <div>
          {mode === 'dashboard' ? (
            <h2>
              {title} <span className="badge ml-2">{d.cards.length} รายวิชา</span>
            </h2>
          ) : (
            <h1>{title}</h1>
          )}
          <p className="muted">จัดการเวลาเรียน คะแนน และผลการเรียนของแต่ละห้อง</p>
        </div>
        {mode === 'dashboard' && (
          <Link href="/classrooms" className="actions text-blue-600">
            ดูห้องเรียนทั้งหมด
            <ArrowUpRight size={17} />
          </Link>
        )}
      </div>
      <form className="filter-bar">
        {mode !== 'dashboard' && (
          <label>
            ระดับชั้น
            <select name="grade" defaultValue={filters.grade || ''}>
              <option value="">ทุกระดับชั้น</option>
              {d.grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="search">
          <span className="sr-only">ค้นหาห้อง วิชา หรือครู</span>
          <input name="q" defaultValue={filters.q} placeholder="ค้นหาห้องเรียน รายวิชา หรือครู…" />
        </label>
        <label>
          <span className="sr-only">ปีการศึกษา</span>
          <select name="year" defaultValue={d.selectedYear}>
            {d.years.map((y) => (
              <option key={y.id} value={y.id}>
                ปีการศึกษา {y.year}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">ภาคเรียน</span>
          <select name="term" defaultValue={filters.term || ''}>
            <option value="">ภาคเรียนปัจจุบัน</option>
            {d.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {mode !== 'dashboard' && (
          <>
            <label>
              ห้องเรียน
              <select name="classroom" defaultValue={filters.classroom || ''}>
                <option value="">ทุกห้อง</option>
                {d.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              รายวิชา
              <select name="subject" defaultValue={filters.subject || ''}>
                <option value="">ทุกวิชา</option>
                {d.subjects.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {d.s.role.role === 'admin' && (
              <label>
                ครู
                <select name="teacher" defaultValue={filters.teacher || ''}>
                  <option value="">ทุกคน</option>
                  {d.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        <Button variant="outline">
          <Search size={17} />
          ค้นหา
        </Button>
      </form>
      {!d.cards.length ? (
        <div className="card">
          <Empty text="ยังไม่มีห้องเรียนที่ได้รับมอบหมาย">
            {d.s.role.role === 'admin' && (
              <Button asChild>
                <Link href="/admin/setup">เริ่มตั้งค่าโรงเรียน</Link>
              </Button>
            )}
          </Empty>
        </div>
      ) : (
        <div className="class-grid">
          {d.cards.map((c) => (
            <article className="card class-card" key={c.id}>
              <div className="class-card-top">
                <div className="class-title">
                  <h3>{c.classroom?.name}</h3>
                  <span className={`badge ${c.today ? 'green' : 'gray'}`}>
                    {c.today ? 'เช็กชื่อแล้ววันนี้' : 'รอเช็กชื่อ'}
                  </span>
                </div>
                <div>
                  <p className="small muted">{c.subject?.subject_code}</p>
                  <p className="subject-name">{c.subject?.name}</p>
                </div>
                <div className="class-meta">
                  <span className="actions">
                    <Users size={14} />
                    {c.studentCount} คน
                  </span>
                  <span>{c.teacher?.full_name}</span>
                </div>
              </div>
              <div className="class-progress">
                <div className="progress-label">
                  <span>เวลาเรียน</span>
                  <span>
                    {c.hours} / {c.subject?.hours_per_term} ชั่วโมง
                  </span>
                </div>
                <progress
                  value={c.hours}
                  max={c.subject?.hours_per_term || 1}
                  aria-label="เวลาเรียนที่บันทึก"
                />
                <div className="progress-label mt-1">
                  <span>บันทึกคะแนนแล้ว</span>
                  <span>{c.completion}%</span>
                </div>
                <progress value={c.completion} max={100} aria-label="ความครบถ้วนของคะแนน" />
              </div>
              <div className="class-card-foot">
                <Button asChild variant="outline">
                  <Link href={`/pp5/${c.id}/attendance`}>
                    <ClipboardCheck size={15} />
                    เช็กชื่อ
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/pp5/${c.id}/scores`}>คะแนน</Link>
                </Button>
                <Button asChild>
                  <Link href={`/pp5/${c.id}${mode === 'reports' ? '/summary' : ''}`}>
                    เปิด ปพ.5
                    <ArrowUpRight size={14} />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {mode === 'dashboard' && (
        <div className="notice actions">
          <BookOpen size={20} />
          <span>ข้อมูลทุกครั้งที่บันทึกจัดเก็บในระบบ พร้อมเปิดรายงานและพิมพ์ ปพ.5 ได้จากห้องเรียน</span>
        </div>
      )}
    </div>
  );
}
