create function public.assignment_statistics(p_assignment uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'student_ids',coalesce((select jsonb_agg(e.student_id) from public.enrollments e where e.classroom_id=a.classroom_id and e.status='active'),'[]'::jsonb),
  'student_count',(select count(*) from public.enrollments e where e.classroom_id=a.classroom_id and e.status='active'),
  'hours',(select coalesce(sum(s.hours),0) from public.attendance_sessions s where s.teacher_assignment_id=a.id),
  'today',exists(select 1 from public.attendance_sessions s where s.teacher_assignment_id=a.id and s.attendance_date=(now() at time zone 'Asia/Bangkok')::date),
  'expected',(select count(*) from public.score_items i join public.score_categories c on c.id=i.score_category_id where c.teacher_assignment_id=a.id and i.active)*(select count(*) from public.enrollments e where e.classroom_id=a.classroom_id and e.status='active'),
  'scored',(select count(*) from public.student_scores s join public.score_items i on i.id=s.score_item_id join public.score_categories c on c.id=i.score_category_id join public.enrollments e on e.id=s.enrollment_id where c.teacher_assignment_id=a.id and i.active and e.status='active')
 ) from public.teacher_assignments a where a.id=p_assignment;
$$;
revoke all on function public.assignment_statistics(uuid) from public,anon;
grant execute on function public.assignment_statistics(uuid) to authenticated;
