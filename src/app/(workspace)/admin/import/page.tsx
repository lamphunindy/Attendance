import { adminOptions } from '@/lib/admin/data';
import { ImportPanel } from '@/components/admin/import-panel';
export default async function Import() {
  const { options } = await adminOptions();
  return (
    <div className="stack">
      <h1>นำเข้านักเรียนจาก Excel</h1>
      <ImportPanel classrooms={options.open_classrooms} />
    </div>
  );
}
