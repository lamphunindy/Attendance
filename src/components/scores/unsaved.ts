'use client';
import { useEffect } from 'react';
export function useUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (
        anchor &&
        anchor.href !== location.href &&
        !window.confirm('มีข้อมูลที่ยังไม่บันทึก ต้องการออกจากหน้านี้หรือไม่?')
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', before);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', before);
      document.removeEventListener('click', click, true);
    };
  }, [dirty]);
}
