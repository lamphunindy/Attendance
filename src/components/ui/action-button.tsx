'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from './button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';
export type ActionResult = { error?: string; success?: string };
export function ActionButton({
  children,
  action,
  confirm,
  reason = false,
  variant = 'default',
  disabled = false,
}: {
  children: React.ReactNode;
  action: (reason: string) => Promise<ActionResult>;
  confirm?: string;
  reason?: boolean;
  variant?: 'default' | 'outline' | 'destructive';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [note, setNote] = useState(''),
    [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      try {
        const r = await action(note);
        if (r.error) toast.error(r.error);
        else {
          toast.success(r.success || 'บันทึกเรียบร้อยแล้ว');
          setOpen(false);
        }
      } catch {
        toast.error('ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      }
    });
  return (
    <>
      <Button
        variant={variant}
        disabled={pending || disabled}
        onClick={() => (confirm ? setOpen(true) : run())}
      >
        {pending ? 'กำลังบันทึก…' : children}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="text-lg font-bold">ยืนยันการดำเนินการ</DialogTitle>
          <DialogDescription>{confirm}</DialogDescription>
          {reason && (
            <label>
              เหตุผล
              <textarea value={note} onChange={(e) => setNote(e.target.value)} minLength={5} />
            </label>
          )}
          <div className="actions">
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={run} disabled={pending || (reason && note.trim().length < 5)}>
              ยืนยัน
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
