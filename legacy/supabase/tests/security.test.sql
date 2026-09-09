begin;
-- TAP output works with `supabase test db` (pg_prove) and the embedded PostgreSQL runner.
select '1..32';
create function pg_temp.check_test(n integer, passed boolean, label text) returns text language plpgsql as $$
begin if not coalesce(passed,false) then raise exception 'not ok % - %',n,label; end if; return 'ok '||n||' - '||label; end $$;
create function pg_temp.denied(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then
 if sqlstate not in ('P0001','42501','23505','23514','23503') then raise; end if; return true; end $$;
insert into public.schools(id,name) values('10000000-0000-4000-8000-000000000001','Test School A'),('10000000-0000-4000-8000-000000000002','Test School B');
insert into auth.users(id,email,email_confirmed_at) values
('20000000-0000-4000-8000-000000000001','admin-a@example.test',now()),('20000000-0000-4000-8000-000000000002','teacher-a@example.test',now()),('20000000-0000-4000-8000-000000000003','teacher-b@example.test',now()),('20000000-0000-4000-8000-000000000004','pending@example.test',now()),('20000000-0000-4000-8000-000000000005','admin-b@example.test',now());
insert into public.profiles(id,email,full_name,requested_school_id) select id,email,email,'10000000-0000-4000-8000-000000000001' from auth.users where email like '%@example.test';
insert into public.user_roles(user_id,school_id,role) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','admin'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','teacher'),('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','teacher'),('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','admin');
insert into public.academic_years(id,school_id,year) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',2569),('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',2569);
insert into public.grade_levels(id,school_id,code,name) values('31000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','6','P6'),('31000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','6','P6');
insert into public.terms(id,academic_year_id,term_number,name,start_date,end_date) values('32000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'T1','2026-05-01','2026-10-31');
insert into public.classrooms(id,school_id,academic_year_id,grade_level_id,name,room_number) values
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Class A','1'),
('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Class B','2'),
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','Other School','1');
insert into public.subjects(id,school_id,subject_code,name) values('41000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','S1','Computing');
insert into public.teacher_assignments(id,school_id,teacher_id,classroom_id,subject_id,term_id) values
('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001'),
('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001');
insert into public.students(id,school_id,student_code,first_name,last_name) values('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','S001','Student','A'),('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','S002','Student','B');
insert into public.enrollments(id,student_id,classroom_id,academic_year_id,student_number) values('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1),('61000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',1);
insert into public.score_categories(id,teacher_assignment_id,name,max_score,weight) values('70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','All',100,100),('70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','All',100,100);
insert into public.score_items(id,score_category_id,title,max_score) values('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','Test',100),('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','Test',100);
insert into public.grading_scales(school_id,min_score,max_score,grade_value,display_grade) values('10000000-0000-4000-8000-000000000001',80,100,4,'4'),('10000000-0000-4000-8000-000000000001',0,79.99,0,'0');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_test(1,(select count(*)=1 from classrooms where id='40000000-0000-4000-8000-000000000001'),'Teacher A reads own classroom');
select pg_temp.check_test(2,(select count(*)=0 from classrooms where id='40000000-0000-4000-8000-000000000002'),'Teacher A cannot read Teacher B classroom');
select pg_temp.check_test(3,pg_temp.denied($q$select bulk_save_scores('50000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','[{"enrollment_id":"61000000-0000-4000-8000-000000000002","score":90}]')$q$),'Teacher A cannot change Teacher B scores');
select pg_temp.check_test(4,pg_temp.denied($q$insert into user_roles(user_id,school_id,role) values(auth.uid(),'10000000-0000-4000-8000-000000000001','admin')$q$),'Teacher cannot self promote');
select bulk_save_scores('50000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','[{"enrollment_id":"61000000-0000-4000-8000-000000000001","score":0}]');
select pg_temp.check_test(5,(select score=0 from student_scores limit 1),'Zero score is stored');
select pg_temp.check_test(6,pg_temp.denied($q$select bulk_save_scores('50000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','[{"enrollment_id":"61000000-0000-4000-8000-000000000001","score":101}]')$q$),'Database rejects over maximum score');
select pg_temp.check_test(7,pg_temp.denied($q$select bulk_save_scores('50000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','[{"enrollment_id":"61000000-0000-4000-8000-000000000001","score":70},{"enrollment_id":"61000000-0000-4000-8000-000000000002","score":50}]')$q$),'Bulk rejects foreign enrollment');
select pg_temp.check_test(8,(select score=0 from student_scores limit 1),'Failed bulk rolls back all rows');
select pg_temp.check_test(9,pg_temp.denied($q$insert into final_results(teacher_assignment_id,enrollment_id,total_score,grade) values('50000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',100,'4')$q$),'Cannot submit client final total');
select bulk_save_scores('50000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','[{"enrollment_id":"61000000-0000-4000-8000-000000000001","score":85}]');
select calculate_final_results('50000000-0000-4000-8000-000000000001');
select pg_temp.check_test(10,(select total_score=85 and grade='4' and result_status='normal' from final_results limit 1),'Final total and grade calculated in database');
select transition_results('50000000-0000-4000-8000-000000000001','submitted','');
select pg_temp.check_test(11,pg_temp.denied($q$select bulk_save_scores('50000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','[{"enrollment_id":"61000000-0000-4000-8000-000000000001","score":80}]')$q$),'Submitted results reject edits');
select pg_temp.check_test(12,pg_temp.denied($q$select transition_results('50000000-0000-4000-8000-000000000001','approved','')$q$),'Teacher cannot approve');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select pg_temp.check_test(13,(select count(*)=2 from classrooms where school_id='10000000-0000-4000-8000-000000000001'),'Admin A reads own school');
select pg_temp.check_test(14,(select count(*)=0 from classrooms where school_id='10000000-0000-4000-8000-000000000002'),'Admin A cannot read school B');
select transition_results('50000000-0000-4000-8000-000000000001','approved','reviewed');
select transition_results('50000000-0000-4000-8000-000000000001','locked','final');
select pg_temp.check_test(15,pg_temp.denied($q$select transition_results('50000000-0000-4000-8000-000000000001','draft','')$q$),'Unlock requires reason');
select transition_results('50000000-0000-4000-8000-000000000001','draft','Corrections requested');
select pg_temp.check_test(16,(select count(*)>0 from audit_logs where entity_type='teacher_assignments' and after_data->>'workflow_note'='Corrections requested'),'Unlock is audited');
select pg_temp.check_test(17,pg_temp.denied($q$insert into classrooms(school_id,academic_year_id,grade_level_id,name,room_number) values('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000001','Cross tenant','5')$q$),'Cross-school FK injection rejected');
select pg_temp.check_test(18,pg_temp.denied($q$select import_students('40000000-0000-4000-8000-000000000001','[{"student_code":"NEW1","student_number":2,"first_name":"Test","last_name":"Name"},{"student_code":"S001","student_number":3,"first_name":"Test","last_name":"Name"}]')$q$),'Duplicate import is rejected');
select pg_temp.check_test(19,(select count(*)=0 from students where student_code='NEW1'),'Failed import inserts no students');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select pg_temp.check_test(20,(select count(*)=0 from students),'Pending user cannot read students');
select pg_temp.check_test(21,(select count(*)=0 from student_scores),'Pending user cannot read scores');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check_test(22,pg_temp.denied('select * from public.students'),'Anon cannot read students');
select pg_temp.check_test(23,pg_temp.denied('select * from public.student_scores'),'Anon cannot read scores');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_test(24,pg_temp.denied($q$select bootstrap_first_admin(auth.uid())$q$),'Bootstrap RPC is not exposed to authenticated users');
select pg_temp.check_test(25,pg_temp.denied($q$select bulk_attendance('50000000-0000-4000-8000-000000000001','2026-09-08',1,1,'Test','[{"enrollment_id":"61000000-0000-4000-8000-000000000002","status":"present"}]')$q$),'Attendance rejects foreign enrollment');
select pg_temp.check_test(26,(select count(*)=0 from attendance_sessions where teacher_assignment_id='50000000-0000-4000-8000-000000000001'),'Failed attendance rolls back session');
select bulk_attendance('50000000-0000-4000-8000-000000000001','2026-09-08',1,2,'Test','[{"enrollment_id":"61000000-0000-4000-8000-000000000001","status":"present"}]');
select pg_temp.check_test(27,(select count(*)=1 from attendance_records where status='present'),'Teacher successfully saves own attendance');
select pg_temp.check_test(28,(select hours=2 from attendance_sessions where teacher_assignment_id='50000000-0000-4000-8000-000000000001'),'Session hours stored correctly');
select pg_temp.check_test(29,pg_temp.denied($q$select bulk_score_matrix('50000000-0000-4000-8000-000000000001','[{"item_id":"71000000-0000-4000-8000-000000000001","rows":[{"enrollment_id":"61000000-0000-4000-8000-000000000001","score":40}]},{"item_id":"71000000-0000-4000-8000-000000000001","rows":[{"enrollment_id":"61000000-0000-4000-8000-000000000001","score":101}]}]')$q$),'Matrix rejects invalid later work item');
select pg_temp.check_test(30,(select score=85 from student_scores limit 1),'Matrix rollback preserves all previous scores');
select pg_temp.check_test(31,pg_temp.denied('select national_student_id from students'),'National identifier is not exposed to clients');
select bulk_save_scores('50000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','[{"enrollment_id":"61000000-0000-4000-8000-000000000001","score":null}]');
select calculate_final_results('50000000-0000-4000-8000-000000000001');
select set_result_status('50000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','ร','รอส่งงานที่ขาด');
select transition_results('50000000-0000-4000-8000-000000000001','submitted','');
select pg_temp.check_test(32,(select result_status='ร' from final_results limit 1),'Teacher-confirmed incomplete status is preserved on submit');
reset role;
rollback;
