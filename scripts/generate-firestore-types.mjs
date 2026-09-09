import { readFile, writeFile } from 'node:fs/promises';
const schema = JSON.parse(await readFile('src/lib/firebase/schema.json', 'utf8'));
const enums = {
  app_role: "'admin' | 'teacher'",
  result_workflow: "'draft' | 'submitted' | 'approved' | 'locked'",
};
const type = (c) =>
  (enums[c.type] ||
    { integer: 'number', numeric: 'number', boolean: 'boolean', jsonb: 'Json' }[c.type] ||
    'string') + (c.nullable ? ' | null' : '');
let out = `// Generated from the Firestore domain schema. Run npm run db:types.\n// The public/Tables envelope preserves the application data contract; it does not connect to SQL.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport type Database = { public: { Tables: {\n`;
for (const [table, columns] of Object.entries(schema)) {
  const cols = Object.entries(columns);
  out += `${table}: { Row: { ${cols.map(([n, c]) => `${n}: ${type(c)}`).join('; ')} };\nInsert: { ${cols.map(([n, c]) => `${n}${c.hasDefault || c.nullable ? '?' : ''}: ${type(c)}`).join('; ')} };\nUpdate: { ${cols.map(([n, c]) => `${n}?: ${type(c)}`).join('; ')} }; Relationships: [] };\n`;
}
const operations = {
  manage_member: [
    'p_school: string; p_user: string; p_role: "admin" | "teacher"; p_active: boolean',
    'undefined',
  ],
  bulk_save_scores: ['p_assignment: string; p_item: string; p_rows: Json', 'undefined'],
  bulk_score_matrix: ['p_assignment: string; p_items: Json', 'undefined'],
  bulk_attendance: [
    'p_assignment: string; p_date: string; p_period: number; p_hours: number; p_topic: string; p_rows: Json',
    'string',
  ],
  bulk_assessments: ['p_assignment: string; p_kind: string; p_category: string; p_rows: Json', 'undefined'],
  default_score_categories: ['p_assignment: string', 'undefined'],
  calculate_final_results: ['p_assignment: string', 'undefined'],
  set_result_status: [
    'p_assignment: string; p_enrollment: string; p_status: string; p_note: string',
    'undefined',
  ],
  transition_results: [
    'p_assignment: string; p_state: "draft" | "submitted" | "approved" | "locked"; p_reason: string',
    'undefined',
  ],
  import_students: ['p_classroom: string; p_rows: Json', 'number'],
  move_student: ['p_enrollment: string; p_classroom: string; p_number: number', 'undefined'],
  update_student_basics: [
    'p_student: string; p_prefix: string; p_first: string; p_last: string; p_nickname: string',
    'undefined',
  ],
  log_export: ['p_school: string; p_assignment: string | null; p_kind: string', 'undefined'],
  assignment_statistics: ['p_assignment: string', 'Json'],
};
out += '}; Functions: {\n';
for (const [name, [args, returns]] of Object.entries(operations))
  out += `${name}: { Args: {${args}}; Returns: ${returns} };\n`;
out +=
  '}; } };\nexport type TableName = keyof Database["public"]["Tables"];\nexport type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];\n';
await writeFile('src/types/database.types.ts', out);
console.log('Generated 27 Firestore collection types and 14 server operation contracts');
