-- Development only. Production migrations never insert demo students.
do $$ declare sid uuid; yid uuid; cid uuid; gid uuid; st uuid; begin
 insert into public.schools(name,code) values('โรงเรียนตัวอย่าง','DEMO') returning id into sid;
 perform private.seed_school(sid);
 insert into public.academic_years(school_id,year,is_active) values(sid,2569,true) returning id into yid;
 insert into public.terms(academic_year_id,term_number,name,start_date,end_date,is_active) values(yid,1,'ภาคเรียนที่ 1','2026-05-16','2026-10-10',true);
 select id into gid from public.grade_levels where school_id=sid and code='ป.6';
 insert into public.classrooms(school_id,academic_year_id,grade_level_id,name,room_number) values(sid,yid,gid,'ป.6/1','1') returning id into cid;
 insert into public.subjects(school_id,subject_code,name,subject_group,hours_per_term,credits) values(sid,'ว16101','วิทยาการคำนวณ','วิทยาศาสตร์และเทคโนโลยี',40,1);
 for n in 1..10 loop
  insert into public.students(school_id,student_code,prefix,first_name,last_name,nickname) values(sid,'DEMO'||lpad(n::text,3,'0'),'ด.ช.','นักเรียนตัวอย่าง '||n,'สำหรับทดสอบ','ตัวอย่าง '||n) returning id into st;
  insert into public.enrollments(student_id,classroom_id,academic_year_id,student_number) values(st,cid,yid,n);
 end loop;
end $$;
