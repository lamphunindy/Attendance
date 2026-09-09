begin;
select '1..9';
create function pg_temp.check_auth(n integer, passed boolean, label text) returns text language plpgsql as $$
begin if not coalesce(passed,false) then raise exception 'not ok % - %',n,label; end if; return 'ok '||n||' - '||label; end $$;
create function pg_temp.auth_denied(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then if sqlstate not in ('P0001','42501') then raise; end if; return true; end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('a0000000-0000-4000-8000-000000000001','bootstrap@example.test',now()),
 ('a0000000-0000-4000-8000-000000000002','invited@example.test',now()),
 ('a0000000-0000-4000-8000-000000000003','forged@example.test',now()),
 ('a0000000-0000-4000-8000-000000000004','expired@example.test',now());
insert into auth.identities(user_id,provider_id,provider,identity_data) select id,id::text,'google',jsonb_build_object('email',case when email='forged@example.test' then 'attacker@example.test' else email end,'email_verified',true) from auth.users where id::text like 'a0000000-%';
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000003',true);
select pg_temp.check_auth(1,pg_temp.auth_denied('select register_google_user()'),'Identity email must match authenticated email');
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select register_google_user();
select pg_temp.check_auth(2,(select count(*)=0 from user_roles where user_id=auth.uid()),'Google login alone does not grant a role');
reset role;
set local role service_role;
select bootstrap_first_admin('a0000000-0000-4000-8000-000000000001');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select pg_temp.check_auth(3,(select role='admin' from user_roles where user_id=auth.uid()),'Service bootstrap creates first admin');
select pg_temp.check_auth(4,(select count(*)=1 from audit_logs where action='bootstrap_admin'),'Bootstrap has an audit trail');
insert into teacher_invitations(school_id,email,role,invited_by) select school_id,'invited@example.test','teacher',auth.uid() from user_roles where user_id=auth.uid() and role='admin';
insert into teacher_invitations(school_id,email,role,invited_by,expires_at) select school_id,'expired@example.test','teacher',auth.uid(),now()-interval '1 day' from user_roles where user_id=auth.uid() and role='admin';
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
select register_google_user();
select pg_temp.check_auth(5,(select role='teacher' from user_roles where user_id=auth.uid()),'Matching verified Google invitation grants teacher');
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000004',true);
select register_google_user();
select pg_temp.check_auth(6,(select count(*)=0 from user_roles where user_id=auth.uid()),'Expired invitation grants no role');
reset role;
set local role service_role;
select pg_temp.check_auth(7,bootstrap_first_admin('a0000000-0000-4000-8000-000000000002') is null,'Bootstrap cannot elevate another user after initialization');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select pg_temp.check_auth(8,(select status='accepted' and accepted_by='a0000000-0000-4000-8000-000000000002' from teacher_invitations where email='invited@example.test'),'Invitation records accepting account');
select manage_member(school_id,'a0000000-0000-4000-8000-000000000002','teacher',false) from user_roles where user_id=auth.uid() and role='admin';
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
select pg_temp.check_auth(9,(select not is_school_teacher(school_id) from user_roles where user_id=auth.uid()),'Disabled teacher loses school access');
reset role;
rollback;
