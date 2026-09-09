'use client';
import { useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';
import { formSchema, type Field } from '@/lib/admin/config';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { ActionResult } from '@/components/ui/action-button';
export type Options = Record<string, { value: string; label: string }[]>;
export function RecordForm({
  title,
  fields,
  initial = {},
  options = {},
  action,
  edit = false,
  confirm = false,
  inline = false,
}: {
  title: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  options?: Options;
  action: (data: Record<string, unknown>) => Promise<ActionResult>;
  edit?: boolean;
  confirm?: boolean;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [pending, start] = useTransition(),
    [confirmed, setConfirmed] = useState(false);
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(formSchema(fields)),
    defaultValues: Object.fromEntries(
      fields.map((f) => [f.key, initial[f.key] ?? f.default ?? (f.type === 'checkbox' ? false : '')]),
    ),
  });
  const submit = form.handleSubmit((data) => {
    if (confirm && !confirmed) {
      setConfirmed(true);
      return;
    }
    start(async () => {
      try {
        const r = await action(data);
        if (r.error) toast.error(r.error);
        else {
          toast.success(r.success || 'บันทึกเรียบร้อยแล้ว');
          setOpen(false);
          setConfirmed(false);
          if (!edit) form.reset();
        }
      } catch {
        toast.error('ไม่สามารถบันทึกได้ กรุณาลองอีกครั้ง');
      }
    });
  });
  const content = (
    <form onSubmit={submit} className="stack">
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.key} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
            {f.label}
            {f.required && f.type !== 'checkbox' ? ' *' : ''}
            <Controller
              name={f.key}
              control={form.control}
              render={({ field }) => {
                if (f.type === 'checkbox')
                  return (
                    <input
                      type="checkbox"
                      checked={Boolean(field.value)}
                      onChange={(e) => field.onChange(e.target.checked)}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  );
                if (f.type === 'select')
                  return (
                    <select {...field} value={String(field.value ?? '')}>
                      <option value="">เลือก{f.label}</option>
                      {(f.options || options[f.source || ''] || []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  );
                if (f.type === 'textarea') return <textarea {...field} value={String(field.value ?? '')} />;
                return (
                  <input
                    {...field}
                    value={String(field.value ?? '')}
                    type={f.type || 'text'}
                    inputMode={f.type === 'number' ? 'decimal' : undefined}
                    min={f.min}
                    max={f.max}
                    step={f.step || '1'}
                    onChange={(e) =>
                      field.onChange(
                        f.type === 'number' && e.target.value !== ''
                          ? Number(e.target.value)
                          : e.target.value,
                      )
                    }
                  />
                );
              }}
            />
            {form.formState.errors[f.key] && (
              <span className="error-text" role="alert">
                {String(form.formState.errors[f.key]?.message)}
              </span>
            )}
          </label>
        ))}
      </div>
      {confirmed && (
        <div role="alert" className="notice warning">
          กรุณาตรวจสอบข้อมูล การดำเนินการนี้มีผลต่อข้อมูลหรือสิทธิ์ใช้งาน กด “ยืนยันบันทึก” เพื่อดำเนินการ
        </div>
      )}
      <div className="actions">
        <Button type="submit" disabled={pending}>
          {pending ? 'กำลังบันทึก…' : confirmed ? 'ยืนยันบันทึก' : 'บันทึกข้อมูล'}
        </Button>
        {!inline && (
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            ยกเลิก
          </Button>
        )}
      </div>
    </form>
  );
  if (inline) return content;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={edit ? 'outline' : 'default'} size={edit ? 'sm' : 'default'}>
          {edit ? <Pencil size={15} /> : <Plus size={17} />}
          <span>{edit ? 'แก้ไข' : title}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
        <DialogDescription>กรอกข้อมูลให้ครบถ้วน ช่องที่มี * จำเป็นต้องระบุ</DialogDescription>
        {content}
      </DialogContent>
    </Dialog>
  );
}
