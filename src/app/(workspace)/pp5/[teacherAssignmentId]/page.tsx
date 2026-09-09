import { loadAssignment } from '@/lib/data';
import { SubjectInfo } from '@/components/pp5/subject-info';
export default async function Page({ params }: { params: Promise<{ teacherAssignmentId: string }> }) {
  return <SubjectInfo data={await loadAssignment((await params).teacherAssignmentId)} />;
}
