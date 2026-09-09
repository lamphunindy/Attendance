import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'ระบบ ปพ.5 ออนไลน์', template: '%s | ระบบ ปพ.5 ออนไลน์' },
  description: 'ระบบบริหารจัดการผลการเรียนและเวลาเรียน',
  icons: { icon: '/logo.svg' },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        {children}
        <Toaster richColors position="top-center" closeButton />
      </body>
    </html>
  );
}
