import { MoreMenu } from '@/components/layout/navigation';
import { requireMember } from '@/lib/auth/session';
export default async function More() {
  const s = await requireMember();
  return (
    <div className="stack">
      <h1>เพิ่มเติม</h1>
      <MoreMenu admin={s.role.role === 'admin'} />
    </div>
  );
}
