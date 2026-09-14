import { Inbox, LoaderCircle } from 'lucide-react';
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
    <div className="stack page-skeleton" aria-busy="true">
      <div className="loading-status" role="status">
        <LoaderCircle size={18} className="loading-spinner" aria-hidden="true" />
        <span>กำลังโหลดข้อมูล กรุณารอสักครู่</span>
      </div>
      <div className="stack" aria-hidden="true">
        <div className="grid gap-3">
          <div className="skeleton h-8 w-48 max-w-full" />
          <div className="skeleton h-4 w-72 max-w-full" />
        </div>
        <div className="stats-grid">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="card grid gap-4">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-8 w-1/3" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          ))}
        </div>
        <div className="card grid gap-5 overflow-hidden">
          <div className="flex flex-wrap justify-between gap-4">
            <div className="skeleton h-10 w-60 max-w-full" />
            <div className="skeleton h-10 w-28" />
          </div>
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="skeleton-table-row">
              <div className="skeleton size-9 rounded-full" />
              <div className="grid gap-2">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/2" />
              </div>
              <div className="skeleton h-6 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
