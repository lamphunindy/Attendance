'use client';
import { useState } from 'react';
import { Printer, Download } from 'lucide-react';
import { toast } from 'sonner';
import { auditPrint } from '@/lib/actions';
import { Button } from '@/components/ui/button';
export function PrintControls({ id }: { id: string }) {
  const [orientation, setOrientation] = useState('landscape'),
    [pending, setPending] = useState(false);
  return (
    <div className="no-print card stack">
      <div className="actions">
        <label>
          แนวกระดาษ
          <select value={orientation} onChange={(e) => setOrientation(e.target.value)}>
            <option value="landscape">A4 แนวนอน</option>
            <option value="portrait">A4 แนวตั้ง</option>
          </select>
        </label>
        <Button
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const r = await auditPrint(id);
            setPending(false);
            if (r.error) toast.error(r.error);
            else window.print();
          }}
        >
          <Printer size={18} />
          พิมพ์ / บันทึก PDF
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/export?assignment=${id}&kind=pp5`}>
            <Download size={18} />
            Export ปพ.5 Excel
          </a>
        </Button>
      </div>
      <p className="muted small">
        เลือก Save as PDF ในหน้าต่างพิมพ์ ปิดส่วนหัว/ท้ายของเบราว์เซอร์ และใช้แนวนอนเมื่อมีหลายหัวข้อประเมิน
      </p>
      <style>{`@page { size: A4 ${orientation}; margin: 12mm; }`}</style>
    </div>
  );
}
