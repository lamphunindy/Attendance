export const attendanceLabels = {
  present: 'มา',
  late: 'สาย',
  leave: 'ลา',
  sick: 'ป่วย',
  absent: 'ขาด',
} as const;
export type AttendanceStatus = keyof typeof attendanceLabels;
export function attendanceSummary(rows: { hours: number; status: string | null }[]) {
  const summary = {
    total: 0,
    present: 0,
    late: 0,
    leave: 0,
    sick: 0,
    absent: 0,
    unrecorded: 0,
    attended: 0,
    percentage: 0,
  };
  for (const r of rows) {
    summary.total += r.hours;
    if (r.status && r.status in attendanceLabels) summary[r.status as AttendanceStatus] += r.hours;
    else summary.unrecorded += r.hours;
  }
  summary.attended = summary.present + summary.late;
  summary.percentage = summary.total ? Math.round((summary.attended / summary.total) * 10000) / 100 : 0;
  return summary;
}
