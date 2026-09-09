export type Role = 'admin' | 'teacher';
export function canAccessAssignment(
  userId: string,
  roles: { school_id: string; role: Role }[],
  assignment: { school_id: string; teacher_id: string; active: boolean },
  active = true,
) {
  return (
    active &&
    roles.some(
      (r) =>
        r.school_id === assignment.school_id &&
        (r.role === 'admin' || (assignment.active && assignment.teacher_id === userId)),
    )
  );
}
export function canEditWorkflow(workflow: string, archived = false) {
  return workflow === 'draft' && !archived;
}
