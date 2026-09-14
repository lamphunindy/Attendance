'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavigationPending } from '@/components/layout/navigation-pending';
export function PP5Tabs({ id }: { id: string }) {
  const pathname = usePathname();
  const tabs = [
    ['', 'ข้อมูลรายวิชา'],
    ['students', 'รายชื่อนักเรียน'],
    ['attendance', 'เวลาเรียน'],
    ['scores', 'คะแนน'],
    ['indicators', 'ตัวชี้วัด'],
    ['reading', 'อ่านคิดวิเคราะห์เขียน'],
    ['characteristics', 'คุณลักษณะ'],
    ['summary', 'สรุปผล'],
    ['print', 'พิมพ์ ปพ.5'],
  ];
  return (
    <nav className="tabs" aria-label="หมวดข้อมูล ปพ.5">
      {tabs.map(([path, label]) => {
        const href = `/pp5/${id}${path ? '/' + path : ''}`;
        return (
          <Link
            key={path}
            href={href}
            className={pathname === href ? 'active' : ''}
            aria-current={pathname === href ? 'page' : undefined}
          >
            {label}
            <NavigationPending />
          </Link>
        );
      })}
    </nav>
  );
}
