import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function thaiDate(value: string | Date) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
  const d = new Date(`${date}T12:00:00`);
  return `${format(d, 'dd/MM')}/${d.getFullYear() + 543}`;
}
export function bangkokToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function fullName(s: { prefix: string; first_name: string; last_name: string }) {
  return `${s.prefix}${s.first_name} ${s.last_name}`;
}
