'use client';

import { useLinkStatus } from 'next/link';
import { LoaderCircle } from 'lucide-react';

export function NavigationPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <span className="navigation-progress" aria-hidden="true">
        <span />
      </span>
      <span className="navigation-pending" role="status" aria-label="กำลังเปิดหน้า">
        <LoaderCircle size={16} className="loading-spinner" aria-hidden="true" />
      </span>
    </>
  );
}
