'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavigationPending } from './navigation-pending';
import {
  LayoutDashboard,
  BookOpen,
  ClipboardCheck,
  BarChart3,
  Ellipsis,
  Users,
  School,
  CalendarDays,
  Settings,
  ShieldCheck,
  FileText,
  UserRoundCog,
  GraduationCap,
  ListChecks,
  Layers,
  ClipboardList,
} from 'lucide-react';
const teacherLinks = [
  ['/dashboard', 'หน้าหลัก', LayoutDashboard],
  ['/classrooms', 'ห้องเรียนของฉัน', BookOpen],
  ['/attendance', 'เช็กชื่อ', ClipboardCheck],
  ['/scores', 'บันทึกคะแนน', BarChart3],
  ['/reports', 'รายงาน ปพ.5', FileText],
] as const;
const adminLinks = [
  ['/admin', 'ภาพรวมโรงเรียน', LayoutDashboard],
  ['/admin/teachers', 'จัดการครู', UserRoundCog],
  ['/admin/students', 'นักเรียน', Users],
  ['/admin/classrooms', 'ห้องเรียน', School],
  ['/admin/subjects', 'รายวิชา', BookOpen],
  ['/admin/academic-years', 'ปีการศึกษา', CalendarDays],
  ['/admin/terms', 'ภาคเรียน', CalendarDays],
  ['/admin/grade-levels', 'ระดับชั้น', Layers],
  ['/admin/assignments', 'มอบหมายการสอน', GraduationCap],
  ['/admin/grading', 'เกณฑ์คะแนน / เกรด', ListChecks],
  ['/admin/reports', 'รายงาน', FileText],
  ['/admin/audit', 'ประวัติการแก้ไข', ShieldCheck],
  ['/admin/settings', 'ตั้งค่าระบบ', Settings],
] as const;
export function Navigation({ admin = false, bottom = false }: { admin?: boolean; bottom?: boolean }) {
  const path = usePathname();
  const links = bottom
    ? ([...teacherLinks.slice(0, 4), ['/more', 'เพิ่มเติม', Ellipsis]] as const)
    : admin
      ? adminLinks
      : teacherLinks;
  return (
    <nav
      aria-label={bottom ? 'เมนูมือถือ' : admin ? 'เมนูผู้ดูแลระบบ' : 'เมนูหลัก'}
      className={bottom ? 'bottom-nav' : 'side-nav'}
    >
      {links.map(([href, label, Icon]) => (
        <Link
          key={href}
          href={href}
          className={`${bottom ? '' : 'nav-link '}${path === href || (href != '/admin' && path.startsWith(href + '/')) ? 'active' : ''}`}
        >
          <Icon size={bottom ? 22 : 19} />
          <span>
            {bottom && href === '/classrooms' ? 'ห้องเรียน' : bottom && href === '/scores' ? 'คะแนน' : label}
          </span>
          <NavigationPending />
        </Link>
      ))}
    </nav>
  );
}
export function MoreMenu({ admin }: { admin: boolean }) {
  return (
    <div className="card">
      <Navigation />
      {admin && (
        <>
          <h2 className="mt-6 mb-3 flex items-center gap-2">
            <ClipboardList size={20} />
            ผู้ดูแลระบบ
          </h2>
          <Navigation admin />
        </>
      )}
    </div>
  );
}
