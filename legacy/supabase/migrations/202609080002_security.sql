create schema if not exists private;
revoke all on schema private from public;
create function public.is_school_admin(p_school uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=auth.uid() and r.school_id=p_school and r.role='admin' and p.active)
$$;
create function public.is_school_teacher(p_school uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=auth.uid() and r.school_id=p_school and p.active)
$$;
create function public.can_access_teacher_assignment(p_assignment uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teacher_assignments a where a.id=p_assignment and (public.is_school_admin(a.school_id) or (a.teacher_id=auth.uid() and a.active and public.is_school_teacher(a.school_id))))
$$;
create function public.can_edit_assignment(p_assignment uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teacher_assignments a join public.terms t on t.id=a.term_id join public.academic_years y on y.id=t.academic_year_id
 where a.id=p_assignment and public.can_access_teacher_assignment(a.id) and a.workflow='draft' and y.archived_at is null and a.active)
$$;
create function public.can_access_classroom(p_classroom uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.classrooms c where c.id=p_classroom and (public.is_school_admin(c.school_id) or exists(select 1 from public.teacher_assignments a where a.classroom_id=c.id and public.can_access_teacher_assignment(a.id))))
$$;
create function public.can_access_student(p_student uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.students s where s.id=p_student and (public.is_school_admin(s.school_id) or exists(select 1 from public.enrollments e where e.student_id=s.id and public.can_access_classroom(e.classroom_id))))
$$;
create function public.can_access_profile(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user=auth.uid() or exists(select 1 from public.profiles p where p.id=p_user and public.is_school_admin(p.requested_school_id))
 or exists(select 1 from public.user_roles r where r.user_id=p_user and public.is_school_admin(r.school_id))
 or exists(select 1 from public.teacher_assignments a where a.teacher_id=p_user and public.can_access_teacher_assignment(a.id))
$$;

-- These internal resolvers are not exposed by PostgREST and cannot be executed by clients.
create function private.row_assignment(t text, j jsonb) returns uuid language plpgsql stable security definer set search_path='' as $$
declare aid uuid; begin
 if j ? 'teacher_assignment_id' then return (j->>'teacher_assignment_id')::uuid; end if;
 case t
 when 'teacher_assignments' then return (j->>'id')::uuid;
 when 'score_items' then select teacher_assignment_id into aid from public.score_categories where id=(j->>'score_category_id')::uuid;
 when 'student_scores' then select c.teacher_assignment_id into aid from public.score_items i join public.score_categories c on c.id=i.score_category_id where i.id=(j->>'score_item_id')::uuid;
 when 'attendance_records' then select teacher_assignment_id into aid from public.attendance_sessions where id=(j->>'attendance_session_id')::uuid;
 when 'indicator_results' then select teacher_assignment_id into aid from public.learning_indicators where id=(j->>'learning_indicator_id')::uuid;
 else aid=null; end case; return aid;
end $$;
create function private.row_school(t text, j jsonb) returns uuid language plpgsql stable security definer set search_path='' as $$
declare sid uuid; aid uuid; begin
 if t='schools' then return (j->>'id')::uuid; end if;
 if j ? 'school_id' then return (j->>'school_id')::uuid; end if;
 aid=private.row_assignment(t,j);
 if aid is not null then select school_id into sid from public.teacher_assignments where id=aid; return sid; end if;
 if t='terms' then select school_id into sid from public.academic_years where id=(j->>'academic_year_id')::uuid;
 elsif t='enrollments' then select school_id into sid from public.classrooms where id=(j->>'classroom_id')::uuid;
 elsif t='profiles' then sid=(j->>'requested_school_id')::uuid;
 end if; return sid;
end $$;

grant usage on schema public to authenticated,anon;
grant select,insert,update on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke insert,update on public.profiles,public.user_roles,public.audit_logs,public.final_results from authenticated;
revoke insert,update on public.schools from authenticated;
grant update(name,code,logo_url,address,phone,director_name,education_area) on public.schools to authenticated;
revoke update on public.teacher_assignments from authenticated;
grant update(teacher_id,classroom_id,subject_id,term_id,active,workflow_note) on public.teacher_assignments to authenticated;
revoke insert on public.teacher_assignments from authenticated;
grant insert(school_id,teacher_id,classroom_id,subject_id,term_id,active) on public.teacher_assignments to authenticated;

create policy school_read on schools for select to authenticated using(is_school_teacher(id));
create policy school_update on schools for update to authenticated using(is_school_admin(id)) with check(is_school_admin(id));
create policy profile_read on profiles for select to authenticated using(can_access_profile(id));
create policy role_read on user_roles for select to authenticated using(user_id=auth.uid() or is_school_admin(school_id));
create policy audit_read on audit_logs for select to authenticated using(is_school_admin(school_id));
do $$ declare t text; begin
 foreach t in array array['academic_years','grade_levels','grading_scales','desirable_characteristics','reading_assessment_categories','school_settings'] loop
  execute format('create policy scoped_read on public.%I for select to authenticated using(public.is_school_teacher(school_id))',t);
  execute format('create policy admin_insert on public.%I for insert to authenticated with check(public.is_school_admin(school_id))',t);
  execute format('create policy admin_update on public.%I for update to authenticated using(public.is_school_admin(school_id)) with check(public.is_school_admin(school_id))',t);
 end loop;
end $$;
create policy invite_admin on teacher_invitations for all to authenticated using(is_school_admin(school_id)) with check(is_school_admin(school_id) and invited_by=auth.uid());
create policy term_read on terms for select to authenticated using(exists(select 1 from academic_years y where y.id=academic_year_id and is_school_teacher(y.school_id)));
create policy term_admin on terms for all to authenticated using(exists(select 1 from academic_years y where y.id=academic_year_id and is_school_admin(y.school_id))) with check(exists(select 1 from academic_years y where y.id=academic_year_id and is_school_admin(y.school_id)));
create policy classroom_read on classrooms for select to authenticated using(can_access_classroom(id));
create policy classroom_admin on classrooms for all to authenticated using(is_school_admin(school_id)) with check(is_school_admin(school_id));
create policy subject_read on subjects for select to authenticated using(is_school_admin(school_id) or exists(select 1 from teacher_assignments a where a.subject_id=subjects.id and can_access_teacher_assignment(a.id)));
create policy subject_admin on subjects for all to authenticated using(is_school_admin(school_id)) with check(is_school_admin(school_id));
create policy assignment_read on teacher_assignments for select to authenticated using(can_access_teacher_assignment(id));
create policy assignment_admin on teacher_assignments for all to authenticated using(is_school_admin(school_id)) with check(is_school_admin(school_id));
create policy student_read on students for select to authenticated using(can_access_student(id));
create policy student_admin on students for all to authenticated using(is_school_admin(school_id)) with check(is_school_admin(school_id));
create policy enrollment_read on enrollments for select to authenticated using(can_access_classroom(classroom_id));
create policy enrollment_admin on enrollments for all to authenticated using(exists(select 1 from classrooms c where c.id=classroom_id and is_school_admin(c.school_id))) with check(exists(select 1 from classrooms c where c.id=classroom_id and is_school_admin(c.school_id)));
do $$ declare t text; begin
 foreach t in array array['score_categories','attendance_sessions','learning_indicators','characteristic_results','reading_assessment_results'] loop
  execute format('create policy assignment_read on public.%I for select to authenticated using(public.can_access_teacher_assignment(teacher_assignment_id))',t);
  execute format('create policy assignment_insert on public.%I for insert to authenticated with check(public.can_edit_assignment(teacher_assignment_id))',t);
  execute format('create policy assignment_update on public.%I for update to authenticated using(public.can_edit_assignment(teacher_assignment_id)) with check(public.can_edit_assignment(teacher_assignment_id))',t);
 end loop;
end $$;
create policy final_read on final_results for select to authenticated using(can_access_teacher_assignment(teacher_assignment_id));
create policy item_read on score_items for select to authenticated using(exists(select 1 from score_categories c where c.id=score_category_id and can_access_teacher_assignment(c.teacher_assignment_id)));
create policy item_write on score_items for all to authenticated using(exists(select 1 from score_categories c where c.id=score_category_id and can_edit_assignment(c.teacher_assignment_id))) with check(exists(select 1 from score_categories c where c.id=score_category_id and can_edit_assignment(c.teacher_assignment_id)));
create policy score_read on student_scores for select to authenticated using(exists(select 1 from score_items i join score_categories c on c.id=i.score_category_id where i.id=score_item_id and can_access_teacher_assignment(c.teacher_assignment_id)));
create policy score_write on student_scores for all to authenticated using(exists(select 1 from score_items i join score_categories c on c.id=i.score_category_id where i.id=score_item_id and can_edit_assignment(c.teacher_assignment_id))) with check(exists(select 1 from score_items i join score_categories c on c.id=i.score_category_id where i.id=score_item_id and can_edit_assignment(c.teacher_assignment_id)));
create policy attendance_read on attendance_records for select to authenticated using(exists(select 1 from attendance_sessions s where s.id=attendance_session_id and can_access_teacher_assignment(s.teacher_assignment_id)));
create policy attendance_write on attendance_records for all to authenticated using(exists(select 1 from attendance_sessions s where s.id=attendance_session_id and can_edit_assignment(s.teacher_assignment_id))) with check(exists(select 1 from attendance_sessions s where s.id=attendance_session_id and can_edit_assignment(s.teacher_assignment_id)));
create policy indicator_read on indicator_results for select to authenticated using(exists(select 1 from learning_indicators i where i.id=learning_indicator_id and can_access_teacher_assignment(i.teacher_assignment_id)));
create policy indicator_write on indicator_results for all to authenticated using(exists(select 1 from learning_indicators i where i.id=learning_indicator_id and can_edit_assignment(i.teacher_assignment_id))) with check(exists(select 1 from learning_indicators i where i.id=learning_indicator_id and can_edit_assignment(i.teacher_assignment_id)));

create function private.validate_row() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb=to_jsonb(new); sid uuid; aid uuid; a public.teacher_assignments; ref record; rsid uuid; maxval numeric; used numeric; en public.enrollments;
begin
 sid=private.row_school(tg_table_name,j); aid=private.row_assignment(tg_table_name,j);
 if tg_op='UPDATE' then
  if sid is distinct from private.row_school(tg_table_name,to_jsonb(old)) then raise exception 'ไม่สามารถย้ายข้อมูลข้ามโรงเรียน'; end if;
  -- Foreign keys are immutable on recorded assessments; move students using the dedicated RPC.
  for ref in select key,value from jsonb_each_text(j) where key like '%\_id' escape '\' and key not in ('homeroom_teacher_id','teacher_id','requested_school_id') loop
   if ref.value is distinct from (to_jsonb(old)->>ref.key) then raise exception 'ไม่สามารถเปลี่ยนความสัมพันธ์ของข้อมูลที่บันทึกแล้ว'; end if;
  end loop;
 end if;
 if tg_table_name in ('classrooms','teacher_assignments','enrollments') then
  for ref in select * from (values ('academic_year_id','academic_years'),('grade_level_id','grade_levels'),('classroom_id','classrooms'),('subject_id','subjects'),('student_id','students')) x(k,t) loop
   if j->>ref.k is not null then execute format('select school_id from public.%I where id=$1',ref.t) into rsid using (j->>ref.k)::uuid;
    if rsid is distinct from sid then raise exception 'ข้อมูลอ้างอิงต้องอยู่ในโรงเรียนเดียวกัน'; end if;
   end if;
  end loop;
 end if;
 if tg_table_name='classrooms' then
  if new.homeroom_teacher_id is not null then
   if not exists(select 1 from public.user_roles where user_id=new.homeroom_teacher_id and school_id=sid) then raise exception 'ครูไม่ได้อยู่ในโรงเรียนนี้'; end if;
  end if;
 end if;
 if tg_table_name='teacher_assignments' then
  if not exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=new.teacher_id and r.school_id=sid and p.active) then raise exception 'ครูยังไม่ได้รับสิทธิ์หรือถูกปิดใช้งาน'; end if;
  if not exists(select 1 from public.terms t join public.classrooms c on c.academic_year_id=t.academic_year_id where t.id=new.term_id and c.id=new.classroom_id) then raise exception 'ภาคเรียนและห้องต้องอยู่ปีการศึกษาเดียวกัน'; end if;
 end if;
 if tg_table_name='enrollments' then
  if not exists(select 1 from public.classrooms where id=new.classroom_id and academic_year_id=new.academic_year_id) then raise exception 'ปีการศึกษาไม่ตรงกับห้องเรียน'; end if;
 end if;
 if aid is not null and tg_table_name<>'teacher_assignments' then
  select * into a from public.teacher_assignments where id=aid for update;
  if auth.uid() is not null and not public.can_edit_assignment(aid) then raise exception 'ผลการเรียนถูกยืนยันหรือล็อก หรือคุณไม่มีสิทธิ์แก้ไข'; end if;
  if j ? 'enrollment_id' then
   select * into en from public.enrollments where id=(j->>'enrollment_id')::uuid;
   if en.classroom_id is distinct from a.classroom_id then raise exception 'นักเรียนไม่อยู่ในห้องเรียนของรายวิชา'; end if;
  end if;
  if tg_table_name='characteristic_results' then select school_id into rsid from public.desirable_characteristics where id=new.characteristic_id; if rsid is distinct from a.school_id then raise exception 'คุณลักษณะอยู่คนละโรงเรียน'; end if; end if;
  if tg_table_name='reading_assessment_results' then select school_id into rsid from public.reading_assessment_categories where id=new.category_id; if rsid is distinct from a.school_id then raise exception 'หัวข้ออยู่คนละโรงเรียน'; end if; end if;
 end if;
 if tg_table_name='student_scores' then
  select max_score into maxval from public.score_items where id=new.score_item_id and active;
  if maxval is null or new.score>maxval then raise exception 'คะแนนต้องไม่เกิน % คะแนน และงานต้องเปิดใช้งาน',maxval; end if;
  new.entered_by=coalesce(auth.uid(),new.entered_by);
 elsif tg_table_name='score_items' then
  select max_score into maxval from public.score_categories where id=new.score_category_id;
  select coalesce(sum(max_score),0) into used from public.score_items where score_category_id=new.score_category_id and active and id<>new.id;
  if new.active and used+new.max_score>maxval then raise exception 'คะแนนเต็มงานรวมเกินคะแนนเต็มหมวด (%)',maxval; end if;
  if exists(select 1 from public.student_scores where score_item_id=new.id and score>new.max_score) then raise exception 'มีคะแนนเดิมสูงกว่าคะแนนเต็มใหม่'; end if;
 elsif tg_table_name='score_categories' then
  select coalesce(sum(weight),0) into used from public.score_categories where teacher_assignment_id=new.teacher_assignment_id and id<>new.id;
  if used+new.weight>100 then raise exception 'น้ำหนักหมวดคะแนนรวมต้องไม่เกิน 100'; end if;
  if (select coalesce(sum(max_score),0) from public.score_items where score_category_id=new.id and active)>new.max_score then raise exception 'คะแนนเต็มหมวดต่ำกว่าผลรวมงาน'; end if;
 elsif tg_table_name='attendance_records' then new.updated_by=coalesce(auth.uid(),new.updated_by);
 elsif tg_table_name='attendance_sessions' then
  new.created_by=coalesce(auth.uid(),new.created_by);
  if not exists(select 1 from public.teacher_assignments ta join public.terms t on t.id=ta.term_id where ta.id=new.teacher_assignment_id and new.attendance_date between t.start_date and t.end_date) then raise exception 'วันที่ต้องอยู่ในช่วงภาคเรียน'; end if;
 elsif tg_table_name='grading_scales' then
  perform 1 from public.schools where id=sid for update;
  if exists(select 1 from public.grading_scales where school_id=sid and id<>new.id and numrange(min_score,max_score,'[]') && numrange(new.min_score,new.max_score,'[]')) then raise exception 'ช่วงคะแนนเกรดทับซ้อนกัน'; end if;
 elsif tg_table_name='school_settings' then
  if new.key='minimum_attendance_percentage' and not ((new.value#>>'{}')::numeric between 0 and 100) then raise exception 'เกณฑ์เวลาเรียนต้องอยู่ระหว่าง 0–100'; end if;
  if new.key='score_decimal_places' and new.value not in ('0','1','2') then raise exception 'ทศนิยมต้องเป็น 0, 1 หรือ 2'; end if;
 end if;
 return new;
end $$;
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb; b jsonb; sid uuid; begin
 if tg_op='DELETE' then j=to_jsonb(old); else j=to_jsonb(new); end if;
 if tg_op<>'INSERT' then b=to_jsonb(old); end if;
 sid=private.row_school(tg_table_name,j);
 if sid is not null then insert into public.audit_logs(school_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
 values(sid,auth.uid(),lower(tg_op),tg_table_name,(j->>'id')::uuid,b-'national_student_id',case when tg_op='DELETE' then null else j-'national_student_id' end); end if;
 return coalesce(new,old);
end $$;
do $$ declare t text; begin
 foreach t in array array['schools','user_roles','teacher_invitations','academic_years','terms','grade_levels','classrooms','subjects','teacher_assignments','students','enrollments','score_categories','score_items','student_scores','grading_scales','final_results','attendance_sessions','attendance_records','learning_indicators','indicator_results','desirable_characteristics','characteristic_results','reading_assessment_categories','reading_assessment_results','school_settings'] loop
  execute format('create trigger validate_row before insert or update on public.%I for each row execute function private.validate_row()',t);
  execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
 end loop;
end $$;
revoke all on all functions in schema public from public,anon;
grant execute on function public.is_school_admin(uuid),public.is_school_teacher(uuid),public.can_access_teacher_assignment(uuid),public.can_edit_assignment(uuid),public.can_access_classroom(uuid),public.can_access_student(uuid),public.can_access_profile(uuid) to authenticated;
