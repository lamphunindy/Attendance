-- Every item in a Save All operation shares one transaction and one assignment lock.
create function public.bulk_score_matrix(p_assignment uuid,p_items jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; begin
 perform private.assert_edit(p_assignment);
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>200 then raise exception 'รองรับครั้งละไม่เกิน 200 งาน'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  perform public.bulk_save_scores(p_assignment,(item->>'item_id')::uuid,item->'rows');
 end loop;
end $$;
revoke all on function public.bulk_score_matrix(uuid,jsonb) from public,anon;
grant execute on function public.bulk_score_matrix(uuid,jsonb) to authenticated;

-- Changing the roster or an assessment definition must not alter a confirmed report.
create function private.protect_history() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; cid uuid; begin
 if tg_table_name='teacher_assignments' then
  if tg_op='UPDATE' and old.workflow<>'draft' and (new.teacher_id<>old.teacher_id or new.active<>old.active) then raise exception 'กรุณาปลดล็อกผลการเรียนก่อนแก้ไขการมอบหมาย'; end if;
 elsif tg_table_name='academic_years' then
  if new.archived_at is not null and new.is_active then raise exception 'ปีที่เก็บเข้าคลังแล้วไม่สามารถเป็นปีปัจจุบัน'; end if;
 elsif tg_table_name='enrollments' then
  cid=new.classroom_id;
  perform 1 from public.teacher_assignments where classroom_id=cid order by id for update;
  if exists(select 1 from public.teacher_assignments where classroom_id=cid and workflow<>'draft') then raise exception 'ห้องนี้มีผลการเรียนที่ยืนยันแล้ว กรุณาให้ผู้ดูแลเปิดแก้ไขก่อนเปลี่ยนรายชื่อ'; end if;
 elsif tg_table_name in ('desirable_characteristics','reading_assessment_categories') then
  sid=new.school_id;
  if tg_op='UPDATE' and exists(select 1 from public.teacher_assignments where school_id=sid and workflow<>'draft') then raise exception 'หัวข้อนี้ใช้ในผลการเรียนที่ยืนยันแล้ว กรุณาเปิดแก้ไขก่อนเปลี่ยนหัวข้อ'; end if;
 end if;
 return new;
end $$;
create trigger protect_history before update on teacher_assignments for each row execute function private.protect_history();
create trigger protect_history before insert or update on academic_years for each row execute function private.protect_history();
create trigger protect_history before insert or update on enrollments for each row execute function private.protect_history();
create trigger protect_history before update on desirable_characteristics for each row execute function private.protect_history();
create trigger protect_history before update on reading_assessment_categories for each row execute function private.protect_history();
revoke all on function private.protect_history() from public,anon,authenticated;

-- Authenticated clients receive only the student fields required by the product.
revoke select on students from authenticated;
grant select(id,school_id,student_code,prefix,first_name,last_name,nickname,gender,birth_date,photo_url,active,created_at,updated_at) on students to authenticated;
