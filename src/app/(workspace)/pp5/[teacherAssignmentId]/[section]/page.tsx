import { notFound } from 'next/navigation';
import { loadAssignment } from '@/lib/data';
import { AttendanceEditor } from '@/components/attendance/attendance-editor';
import { ScoreEditor } from '@/components/scores/score-editor';
import { ScoreConfiguration, IndicatorConfiguration } from '@/components/pp5/configuration';
import { AssessmentEditor } from '@/components/pp5/assessment-editor';
import { Summary } from '@/components/pp5/summary';
import { StudentRoster } from '@/components/pp5/student-roster';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ teacherAssignmentId: string; section: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { teacherAssignmentId, section } = await params,
    d = await loadAssignment(teacherAssignmentId);
  if (section === 'attendance') return <AttendanceEditor data={d} />;
  if (section === 'scores')
    return (
      <div className="stack">
        <ScoreEditor data={d} />
        <ScoreConfiguration data={d} />
      </div>
    );
  if (section === 'indicators')
    return (
      <div className="stack">
        <IndicatorConfiguration data={d} />
        <AssessmentEditor data={d} kind="indicators" />
      </div>
    );
  if (section === 'reading' || section === 'characteristics')
    return <AssessmentEditor data={d} kind={section} />;
  if (section === 'summary') return <Summary data={d} />;
  if (section === 'students') return <StudentRoster data={d} query={(await searchParams).q || ''} />;
  notFound();
}
