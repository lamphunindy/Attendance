import { Inbox } from 'lucide-react';
export function Empty({ text = 'ยังไม่มีข้อมูล', children }: { text?: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={36} />
      <h3>{text}</h3>
      {children}
    </div>
  );
}
export function Skeleton() {
  return (
    <div className="stack" aria-label="กำลังโหลดข้อมูล" role="status">
      <div className="skeleton h-10 w-1/3" />
      <div className="stats-grid">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="skeleton h-32" />
        ))}
      </div>
      <div className="skeleton h-80" />
      <span className="sr-only">กำลังโหลดข้อมูล</span>
    </div>
  );
}
