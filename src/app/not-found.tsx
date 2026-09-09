import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="p-8 stack">
      <h1>ไม่พบข้อมูลหรือคุณไม่มีสิทธิ์เข้าถึงห้องเรียนนี้</h1>
      <Link href="/dashboard" className="button button-primary w-fit">
        กลับหน้าหลัก
      </Link>
    </main>
  );
}
