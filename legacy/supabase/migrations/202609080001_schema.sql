create extension if not exists pgcrypto;
create type public.app_role as enum ('admin','teacher');
create type public.result_workflow as enum ('draft','submitted','approved','locked');

create table public.schools (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0), code text unique,
 logo_url text, address text, phone text, director_name text, education_area text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict, full_name text not null, email text not null,
 avatar_url text, phone text, active boolean not null default true, requested_school_id uuid references schools(id),
 last_login_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete restrict,
 school_id uuid not null references schools(id) on delete restrict, role app_role not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,school_id,role)
);
create table public.teacher_invitations (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), email text not null check(email=lower(trim(email)) and email like '%@%'),
 role app_role not null default 'teacher', status text not null default 'pending' check(status in ('pending','accepted','cancelled','expired')),
 invited_by uuid not null references profiles(id), accepted_by uuid references profiles(id), expires_at timestamptz not null default now()+interval '14 days',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index invitation_pending_email on teacher_invitations(school_id,email) where status='pending';
create table public.academic_years (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), year integer not null check(year between 2400 and 3000),
 is_active boolean not null default false, archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,year)
);
create unique index one_active_year on academic_years(school_id) where is_active;
create table public.terms (
 id uuid primary key default gen_random_uuid(), academic_year_id uuid not null references academic_years(id), term_number integer not null check(term_number>0),
 name text not null, start_date date not null, end_date date not null, is_active boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(end_date>=start_date), unique(academic_year_id,term_number)
);
create unique index one_active_term on terms(academic_year_id) where is_active;
create table public.grade_levels (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), code text not null, name text not null, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,code)
);
create table public.classrooms (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), academic_year_id uuid not null references academic_years(id),
 grade_level_id uuid not null references grade_levels(id), name text not null, room_number text not null, homeroom_teacher_id uuid references profiles(id), active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(academic_year_id,grade_level_id,room_number)
);
create table public.subjects (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), subject_code text not null, name text not null, subject_group text,
 hours_per_term numeric not null default 40 check(hours_per_term>0), credits numeric not null default 1 check(credits>=0), description text, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,subject_code)
);
create table public.teacher_assignments (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), teacher_id uuid not null references profiles(id),
 classroom_id uuid not null references classrooms(id), subject_id uuid not null references subjects(id), term_id uuid not null references terms(id), active boolean not null default true,
 workflow result_workflow not null default 'draft', workflow_note text, score_total numeric not null default 100 check(score_total=100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(teacher_id,classroom_id,subject_id,term_id)
);
create table public.students (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), student_code text not null check(length(trim(student_code))>0), national_student_id text,
 prefix text not null default '', first_name text not null check(length(trim(first_name))>0), last_name text not null check(length(trim(last_name))>0), nickname text,
 gender text, birth_date date, photo_url text, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,student_code)
);
create table public.enrollments (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references students(id), classroom_id uuid not null references classrooms(id),
 academic_year_id uuid not null references academic_years(id), student_number integer not null check(student_number>0),
 status text not null default 'active' check(status in ('active','moved','withdrawn','graduated')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(student_id,classroom_id), unique(classroom_id,student_number)
);
create unique index student_one_active_class on enrollments(student_id,academic_year_id) where status='active';
create table public.score_categories (
 id uuid primary key default gen_random_uuid(), teacher_assignment_id uuid not null references teacher_assignments(id), name text not null,
 max_score numeric not null check(max_score>0 and max_score<=100), weight numeric not null check(weight>0 and weight<=100), sort_order integer not null default 0,
 category_type text not null default 'custom' check(category_type in ('before_midterm','midterm','after_midterm','final','custom')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.score_items (
 id uuid primary key default gen_random_uuid(), score_category_id uuid not null references score_categories(id), title text not null,
 description text, max_score numeric not null check(max_score>0), due_date date, sort_order integer not null default 0, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.student_scores (
 id uuid primary key default gen_random_uuid(), score_item_id uuid not null references score_items(id), enrollment_id uuid not null references enrollments(id),
 score numeric not null check(score>=0), note text, entered_by uuid not null default auth.uid() references profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(score_item_id,enrollment_id)
);
create table public.grading_scales (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), name text not null default 'เกณฑ์มาตรฐาน',
 min_score numeric not null check(min_score>=0), max_score numeric not null check(max_score<=100), grade_value numeric not null check(grade_value between 0 and 4),
 display_grade text not null, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(max_score>=min_score)
);
create table public.final_results (
 id uuid primary key default gen_random_uuid(), teacher_assignment_id uuid not null references teacher_assignments(id), enrollment_id uuid not null references enrollments(id),
 total_score numeric not null check(total_score between 0 and 100), grade text, result_status text not null default 'normal' check(result_status in ('normal','ร','มส','ผ','มผ')),
 teacher_note text, calculated_at timestamptz not null default now(), calculated_by uuid not null default auth.uid() references profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(teacher_assignment_id,enrollment_id)
);
create table public.attendance_sessions (
 id uuid primary key default gen_random_uuid(), teacher_assignment_id uuid not null references teacher_assignments(id), attendance_date date not null,
 period_number integer not null default 1 check(period_number>0), topic text, hours numeric not null default 1 check(hours>0 and hours<=12),
 created_by uuid not null default auth.uid() references profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(teacher_assignment_id,attendance_date,period_number)
);
create table public.attendance_records (
 id uuid primary key default gen_random_uuid(), attendance_session_id uuid not null references attendance_sessions(id), enrollment_id uuid not null references enrollments(id),
 status text not null check(status in ('present','late','leave','sick','absent')), note text, updated_by uuid not null default auth.uid() references profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(attendance_session_id,enrollment_id)
);
create table public.learning_indicators (
 id uuid primary key default gen_random_uuid(), teacher_assignment_id uuid not null references teacher_assignments(id), code text not null, description text not null, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.indicator_results (
 id uuid primary key default gen_random_uuid(), learning_indicator_id uuid not null references learning_indicators(id), enrollment_id uuid not null references enrollments(id),
 result text not null check(result in ('excellent','good','pass','improve')), note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(learning_indicator_id,enrollment_id)
);
create table public.desirable_characteristics (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), code text not null, name text not null, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,code)
);
create table public.characteristic_results (
 id uuid primary key default gen_random_uuid(), teacher_assignment_id uuid not null references teacher_assignments(id), characteristic_id uuid not null references desirable_characteristics(id),
 enrollment_id uuid not null references enrollments(id), level integer not null check(level between 0 and 3), note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(teacher_assignment_id,characteristic_id,enrollment_id)
);
create table public.reading_assessment_categories (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), name text not null, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.reading_assessment_results (
 id uuid primary key default gen_random_uuid(), teacher_assignment_id uuid not null references teacher_assignments(id), category_id uuid not null references reading_assessment_categories(id),
 enrollment_id uuid not null references enrollments(id), level integer not null check(level between 0 and 3), note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(teacher_assignment_id,category_id,enrollment_id)
);
create table public.school_settings (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), key text not null, value jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,key)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), actor_user_id uuid references profiles(id), action text not null,
 entity_type text not null, entity_id uuid, before_data jsonb, after_data jsonb, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
do $$ declare t record; c record; begin
 for t in select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' loop
  execute format('alter table public.%I enable row level security',t.table_name);
  if t.table_name<>'audit_logs' then execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',t.table_name); end if;
  for c in select column_name from information_schema.columns where table_schema='public' and table_name=t.table_name and (column_name like '%\_id' escape '\' or column_name='created_at') loop
   execute format('create index %I on public.%I(%I)',t.table_name||'_'||c.column_name||'_idx',t.table_name,c.column_name);
  end loop;
 end loop;
end $$;
create index attendance_assignment_date on attendance_sessions(teacher_assignment_id,attendance_date);
create index assignments_teacher_term on teacher_assignments(teacher_id,term_id) where active;
create index audit_school_date on audit_logs(school_id,created_at desc);
create index students_search on students(school_id,student_code,first_name,last_name);
