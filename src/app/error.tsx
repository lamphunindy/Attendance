'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="card stack" role="alert">
      <h1>ไม่สามารถโหลดข้อมูลได้</h1>
      <p className="muted">กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาให้ติดต่อผู้ดูแลระบบ</p>
      <Button onClick={reset}>ลองอีกครั้ง</Button>
    </div>
  );
}
