create function private.seed_school(p_school uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.school_settings(school_id,key,value) values (p_school,'minimum_attendance_percentage','80'),(p_school,'score_decimal_places','2'),(p_school,'teacher_edit_students','false');
 insert into public.grade_levels(school_id,code,name,sort_order) select p_school,x,x,n from unnest(array['ป.1','ป.2','ป.3','ป.4','ป.5','ป.6','ม.1','ม.2','ม.3']) with ordinality as t(x,n);
 insert into public.grading_scales(school_id,min_score,max_score,grade_value,display_grade,sort_order) values
 (p_school,80,100,4,'4',1),(p_school,75,79.99,3.5,'3.5',2),(p_school,70,74.99,3,'3',3),(p_school,65,69.99,2.5,'2.5',4),
 (p_school,60,64.99,2,'2',5),(p_school,55,59.99,1.5,'1.5',6),(p_school,50,54.99,1,'1',7),(p_school,0,49.99,0,'0',8);
 insert into public.desirable_characteristics(school_id,code,name,sort_order) select p_school,n::text,x,n from unnest(array['รักชาติ ศาสน์ กษัตริย์','ซื่อสัตย์สุจริต','มีวินัย','ใฝ่เรียนรู้','อยู่อย่างพอเพียง','มุ่งมั่นในการทำงาน','รักความเป็นไทย','มีจิตสาธารณะ']) with ordinality as t(x,n);
 insert into public.reading_assessment_categories(school_id,name,sort_order) select p_school,x,n from unnest(array['การอ่าน','การคิดวิเคราะห์','การเขียน']) with ordinality as t(x,n);
end $$;
create function public.register_google_user() returns void language plpgsql security definer set search_path='' as $$
declare u auth.users; inv record; sid uuid; begin
 select * into u from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if u.id is null or not exists(select 1 from auth.identities where user_id=u.id and provider='google' and lower(identity_data->>'email')=lower(u.email) and coalesce((identity_data->>'email_verified')::boolean,false)) then raise exception 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ที่ยืนยันแล้ว'; end if;
 select id into sid from public.schools order by created_at,id limit 1;
 insert into public.profiles(id,email,full_name,avatar_url,requested_school_id,last_login_at)
 values(u.id,lower(u.email),coalesce(u.raw_user_meta_data->>'full_name',split_part(u.email,'@',1)),u.raw_user_meta_data->>'avatar_url',sid,now())
 on conflict(id) do update set email=excluded.email,last_login_at=now();
 if not (select active from public.profiles where id=u.id) then return; end if;
 update public.teacher_invitations set status='expired' where email=lower(u.email) and status='pending' and expires_at<=now();
 for inv in select * from public.teacher_invitations where email=lower(u.email) and status='pending' and expires_at>now() for update loop
  insert into public.user_roles(user_id,school_id,role) values(u.id,inv.school_id,inv.role) on conflict do nothing;
  update public.teacher_invitations set status='accepted',accepted_by=u.id where id=inv.id;
 end loop;
 if sid is not null then insert into public.audit_logs(school_id,actor_user_id,action,entity_type,entity_id) values(sid,u.id,'login','profiles',u.id); end if;
end $$;
-- Service role only. The application checks BOOTSTRAP_ADMIN_EMAILS against getUser()/Google identity first.
create function public.bootstrap_first_admin(p_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; begin
 perform pg_advisory_xact_lock(5052026);
 if exists(select 1 from public.user_roles where role='admin') then return null; end if;
 if not exists(select 1 from auth.users u join auth.identities i on i.user_id=u.id where u.id=p_user and u.email_confirmed_at is not null and i.provider='google' and lower(i.identity_data->>'email')=lower(u.email) and coalesce((i.identity_data->>'email_verified')::boolean,false)) then raise exception 'Google identity required'; end if;
 if not exists(select 1 from public.profiles where id=p_user and active) then raise exception 'Active profile required'; end if;
 select id into sid from public.schools order by created_at,id limit 1;
 if sid is null then insert into public.schools(name) values('โรงเรียนของฉัน') returning id into sid; perform private.seed_school(sid); end if;
 insert into public.user_roles(user_id,school_id,role) values(p_user,sid,'admin');
 update public.profiles set requested_school_id=sid where id=p_user;
 insert into public.audit_logs(school_id,actor_user_id,action,entity_type,entity_id,metadata) values(sid,p_user,'bootstrap_admin','user_roles',p_user,'{"source":"verified_google_server_allowlist"}');
 return sid;
end $$;
create function public.manage_member(p_school uuid,p_user uuid,p_role public.app_role,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare before_row jsonb; begin
 perform 1 from public.schools where id=p_school for update;
 if not public.is_school_admin(p_school) then raise exception 'ไม่มีสิทธิ์จัดการครู'; end if;
 if p_user=auth.uid() and (not p_active or p_role<>'admin') then raise exception 'ไม่สามารถลดสิทธิ์หรือปิดบัญชีตนเอง'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_user and (p.requested_school_id=p_school or exists(select 1 from public.user_roles r where r.user_id=p_user and r.school_id=p_school))) then raise exception 'บัญชีไม่อยู่ในโรงเรียน'; end if;
 if exists(select 1 from public.user_roles where user_id=p_user and school_id<>p_school) and not p_active then raise exception 'บัญชีนี้ใช้หลายโรงเรียน กรุณาจัดการสิทธิ์ผ่านผู้ดูแลส่วนกลาง'; end if;
 select to_jsonb(p) into before_row from public.profiles p where p.id=p_user;
 update public.profiles set active=p_active where id=p_user;
 delete from public.user_roles where user_id=p_user and school_id=p_school and role<>p_role;
 insert into public.user_roles(user_id,school_id,role) values(p_user,p_school,p_role) on conflict do nothing;
 insert into public.audit_logs(school_id,actor_user_id,action,entity_type,entity_id,before_data,after_data) values(p_school,auth.uid(),'manage_member','profiles',p_user,before_row,jsonb_build_object('active',p_active,'role',p_role));
end $$;
create function private.assert_edit(p_assignment uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform 1 from public.teacher_assignments where id=p_assignment for update;
 if not public.can_edit_assignment(p_assignment) then raise exception 'คุณไม่มีสิทธิ์แก้ไข หรือผลการเรียนถูกยืนยัน/ล็อกแล้ว'; end if;
end $$;
create function public.bulk_save_scores(p_assignment uuid,p_item uuid,p_rows jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r jsonb; en uuid; begin
 perform private.assert_edit(p_assignment);
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'ข้อมูลไม่ถูกต้องหรือเกิน 500 รายการ'; end if;
 if not exists(select 1 from public.score_items i join public.score_categories c on c.id=i.score_category_id where i.id=p_item and c.teacher_assignment_id=p_assignment and i.active) then raise exception 'ไม่พบงานในรายวิชานี้'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  en=(r->>'enrollment_id')::uuid;
  if not exists(select 1 from public.enrollments e join public.teacher_assignments a on a.classroom_id=e.classroom_id where a.id=p_assignment and e.id=en) then raise exception 'นักเรียนไม่อยู่ในห้องนี้'; end if;
  if r->>'score' is null then delete from public.student_scores where score_item_id=p_item and enrollment_id=en;
  else insert into public.student_scores(score_item_id,enrollment_id,score,note,entered_by) values(p_item,en,(r->>'score')::numeric,r->>'note',auth.uid())
  on conflict(score_item_id,enrollment_id) do update set score=excluded.score,note=excluded.note,entered_by=auth.uid(); end if;
 end loop;
end $$;
create function public.bulk_attendance(p_assignment uuid,p_date date,p_period integer,p_hours numeric,p_topic text,p_rows jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; r jsonb; begin
 perform private.assert_edit(p_assignment);
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'ข้อมูลไม่ถูกต้องหรือเกิน 500 รายการ'; end if;
 insert into public.attendance_sessions(teacher_assignment_id,attendance_date,period_number,hours,topic,created_by) values(p_assignment,p_date,p_period,p_hours,p_topic,auth.uid())
 on conflict(teacher_assignment_id,attendance_date,period_number) do update set hours=excluded.hours,topic=excluded.topic returning id into sid;
 for r in select value from jsonb_array_elements(p_rows) loop
  insert into public.attendance_records(attendance_session_id,enrollment_id,status,note,updated_by) values(sid,(r->>'enrollment_id')::uuid,r->>'status',r->>'note',auth.uid())
  on conflict(attendance_session_id,enrollment_id) do update set status=excluded.status,note=excluded.note,updated_by=auth.uid();
 end loop; return sid;
end $$;
create function public.bulk_assessments(p_assignment uuid,p_kind text,p_category uuid,p_rows jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r jsonb; begin
 perform private.assert_edit(p_assignment);
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'ข้อมูลไม่ถูกต้อง'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if p_kind='indicators' then
   if not exists(select 1 from public.learning_indicators where id=p_category and teacher_assignment_id=p_assignment) then raise exception 'ตัวชี้วัดไม่อยู่ในรายวิชา'; end if;
   insert into public.indicator_results(learning_indicator_id,enrollment_id,result,note) values(p_category,(r->>'enrollment_id')::uuid,r->>'result',r->>'note') on conflict(learning_indicator_id,enrollment_id) do update set result=excluded.result,note=excluded.note;
  elsif p_kind='characteristics' then
   insert into public.characteristic_results(teacher_assignment_id,characteristic_id,enrollment_id,level,note) values(p_assignment,p_category,(r->>'enrollment_id')::uuid,(r->>'level')::integer,r->>'note') on conflict(teacher_assignment_id,characteristic_id,enrollment_id) do update set level=excluded.level,note=excluded.note;
  elsif p_kind='reading' then
   insert into public.reading_assessment_results(teacher_assignment_id,category_id,enrollment_id,level,note) values(p_assignment,p_category,(r->>'enrollment_id')::uuid,(r->>'level')::integer,r->>'note') on conflict(teacher_assignment_id,category_id,enrollment_id) do update set level=excluded.level,note=excluded.note;
  else raise exception 'ประเภทการประเมินไม่ถูกต้อง'; end if;
 end loop;
end $$;
create function public.default_score_categories(p_assignment uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform private.assert_edit(p_assignment);
 if exists(select 1 from public.score_categories where teacher_assignment_id=p_assignment) then raise exception 'มีหมวดคะแนนแล้ว'; end if;
 insert into public.score_categories(teacher_assignment_id,name,max_score,weight,sort_order,category_type) values
 (p_assignment,'ก่อนกลางภาค',30,30,1,'before_midterm'),(p_assignment,'กลางภาค',20,20,2,'midterm'),(p_assignment,'หลังกลางภาค',30,30,3,'after_midterm'),(p_assignment,'ปลายภาค',20,20,4,'final');
end $$;
create function public.calculate_final_results(p_assignment uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.teacher_assignments; r record; total numeric; g text; begin
 perform private.assert_edit(p_assignment); select * into a from public.teacher_assignments where id=p_assignment;
 if (select coalesce(sum(weight),0) from public.score_categories where teacher_assignment_id=p_assignment)<>100 then raise exception 'น้ำหนักหมวดคะแนนรวมต้องเท่ากับ 100'; end if;
 for r in select id from public.enrollments where classroom_id=a.classroom_id and status='active' loop
  select round(coalesce(sum(c.weight * coalesce((select sum(s.score) from public.score_items i left join public.student_scores s on s.score_item_id=i.id and s.enrollment_id=r.id where i.score_category_id=c.id and i.active),0)/c.max_score),0),2)
  into total from public.score_categories c where c.teacher_assignment_id=p_assignment;
  select display_grade into g from public.grading_scales where school_id=a.school_id and total between min_score and max_score;
  if g is null then raise exception 'ไม่พบเกณฑ์เกรดสำหรับคะแนน %',total; end if;
  insert into public.final_results(teacher_assignment_id,enrollment_id,total_score,grade,calculated_by) values(p_assignment,r.id,total,g,auth.uid())
  on conflict(teacher_assignment_id,enrollment_id) do update set total_score=excluded.total_score,grade=excluded.grade,calculated_at=now(),calculated_by=auth.uid();
 end loop;
end $$;
create function public.set_result_status(p_assignment uuid,p_enrollment uuid,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin perform private.assert_edit(p_assignment);
 if p_status<>'normal' and length(trim(coalesce(p_note,'')))<3 then raise exception 'กรุณาระบุเหตุผลของผลการเรียนพิเศษ'; end if;
 update public.final_results set result_status=p_status,teacher_note=p_note where teacher_assignment_id=p_assignment and enrollment_id=p_enrollment;
 if not found then raise exception 'กรุณาคำนวณผลการเรียนก่อน'; end if;
end $$;
create function public.transition_results(p_assignment uuid,p_state public.result_workflow,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare a public.teacher_assignments; missing integer; begin
 select * into a from public.teacher_assignments where id=p_assignment for update;
 if not public.can_access_teacher_assignment(p_assignment) then raise exception 'ไม่มีสิทธิ์'; end if;
 if p_state='submitted' and a.workflow='draft' then
  if exists(select 1 from public.score_categories c where c.teacher_assignment_id=p_assignment and c.max_score<>(select coalesce(sum(i.max_score),0) from public.score_items i where i.score_category_id=c.id and i.active)) then raise exception 'คะแนนเต็มงานในแต่ละหมวดต้องครบตามคะแนนเต็มหมวด'; end if;
  select count(*) into missing from public.enrollments e cross join public.score_items i join public.score_categories c on c.id=i.score_category_id
  where e.classroom_id=a.classroom_id and e.status='active' and c.teacher_assignment_id=p_assignment and i.active
  and not exists(select 1 from public.final_results f where f.teacher_assignment_id=p_assignment and f.enrollment_id=e.id and f.result_status in ('ร','มส') and length(trim(coalesce(f.teacher_note,'')))>=3)
  and not exists(select 1 from public.student_scores s where s.enrollment_id=e.id and s.score_item_id=i.id);
  if missing>0 then raise exception 'ยังมีคะแนนที่ไม่ได้บันทึก % ช่อง',missing; end if;
  if not exists(select 1 from public.enrollments where classroom_id=a.classroom_id and status='active') then raise exception 'ยังไม่มีนักเรียน'; end if;
  if exists(select 1 from public.enrollments e cross join public.learning_indicators c where e.classroom_id=a.classroom_id and e.status='active' and c.teacher_assignment_id=p_assignment and not exists(select 1 from public.indicator_results r where r.enrollment_id=e.id and r.learning_indicator_id=c.id))
   or exists(select 1 from public.enrollments e cross join public.desirable_characteristics c where e.classroom_id=a.classroom_id and e.status='active' and c.school_id=a.school_id and not exists(select 1 from public.characteristic_results r where r.enrollment_id=e.id and r.characteristic_id=c.id and r.teacher_assignment_id=p_assignment))
   or exists(select 1 from public.enrollments e cross join public.reading_assessment_categories c where e.classroom_id=a.classroom_id and e.status='active' and c.school_id=a.school_id and not exists(select 1 from public.reading_assessment_results r where r.enrollment_id=e.id and r.category_id=c.id and r.teacher_assignment_id=p_assignment)) then raise exception 'กรุณาประเมินตัวชี้วัด คุณลักษณะ และอ่านคิดวิเคราะห์เขียนให้ครบ'; end if;
  perform public.calculate_final_results(p_assignment);
 elsif p_state='approved' and a.workflow='submitted' and public.is_school_admin(a.school_id) then null;
 elsif p_state='locked' and a.workflow='approved' and public.is_school_admin(a.school_id) then null;
 elsif p_state='draft' and a.workflow<>'draft' and public.is_school_admin(a.school_id) and length(trim(p_reason))>=5 then null;
 else raise exception 'ลำดับสถานะไม่ถูกต้อง หรือไม่มีสิทธิ์ (ปลดล็อกต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร)'; end if;
 update public.teacher_assignments set workflow=p_state,workflow_note=p_reason where id=p_assignment;
end $$;
create function public.import_students(p_classroom uuid,p_rows jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare c public.classrooms; r jsonb; sid uuid; n integer=0; begin
 select * into c from public.classrooms where id=p_classroom for update;
 if not public.is_school_admin(c.school_id) then raise exception 'ไม่พบห้องเรียนหรือไม่มีสิทธิ์'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'รองรับครั้งละ 1–500 คน'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  n=n+1;
  begin
   insert into public.students(school_id,student_code,prefix,first_name,last_name,nickname) values(c.school_id,trim(r->>'student_code'),coalesce(r->>'prefix',''),trim(r->>'first_name'),trim(r->>'last_name'),r->>'nickname') returning id into sid;
   insert into public.enrollments(student_id,classroom_id,academic_year_id,student_number) values(sid,c.id,c.academic_year_id,(r->>'student_number')::integer);
  exception when others then raise exception 'แถว %: รหัส/เลขที่ซ้ำหรือข้อมูลไม่ถูกต้อง (%)',n,sqlerrm; end;
 end loop; return n;
end $$;
create function public.move_student(p_enrollment uuid,p_classroom uuid,p_number integer) returns void language plpgsql security definer set search_path='' as $$
declare e public.enrollments; c public.classrooms; old_school uuid; begin
 select * into e from public.enrollments where id=p_enrollment for update;
 select school_id into old_school from public.classrooms where id=e.classroom_id;
 select * into c from public.classrooms where id=p_classroom;
 if not public.is_school_admin(old_school) or c.school_id is distinct from old_school or c.academic_year_id is distinct from e.academic_year_id then raise exception 'ห้องปลายทางต้องอยู่โรงเรียนและปีเดียวกัน'; end if;
 update public.enrollments set status='moved' where id=e.id;
 insert into public.enrollments(student_id,classroom_id,academic_year_id,student_number) values(e.student_id,c.id,c.academic_year_id,p_number);
end $$;
create function public.log_export(p_school uuid,p_assignment uuid,p_kind text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_assignment is null then
  if not public.is_school_admin(p_school) then raise exception 'ไม่มีสิทธิ์ Export'; end if;
 elsif not exists(select 1 from public.teacher_assignments where id=p_assignment and school_id=p_school and public.can_access_teacher_assignment(id)) then raise exception 'ไม่มีสิทธิ์ Export'; end if;
 insert into public.audit_logs(school_id,actor_user_id,action,entity_type,entity_id,metadata) values(p_school,auth.uid(),'export',p_kind,p_assignment,'{}');
end $$;
create function public.update_student_basics(p_student uuid,p_prefix text,p_first text,p_last text,p_nickname text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid; begin
 select school_id into sid from public.students where id=p_student;
 if not public.is_school_admin(sid) and not (public.can_access_student(p_student) and exists(select 1 from public.school_settings where school_id=sid and key='teacher_edit_students' and value='true')) then raise exception 'ไม่มีสิทธิ์แก้ไขประวัตินักเรียน'; end if;
 update public.students set prefix=p_prefix,first_name=p_first,last_name=p_last,nickname=p_nickname where id=p_student;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on all functions in schema public from public,anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.bootstrap_first_admin(uuid),public.touch_updated_at() from authenticated;
grant execute on function public.bootstrap_first_admin(uuid) to service_role;
