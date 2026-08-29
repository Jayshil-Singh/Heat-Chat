-- ==============================================================================
-- Heat Chat — Production Admin Platform, RBAC & Security Infrastructure
-- Migration: 20260829_admin_platform.sql
-- ==============================================================================

-- 1. ACCOUNT STATUS EXTENSIONS ON PROFILES
alter table public.profiles 
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspended_until timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists is_disabled boolean not null default false,
  add column if not exists force_logout_at timestamptz;

create index if not exists idx_profiles_account_status 
  on public.profiles(is_suspended, is_disabled);

-- 2. ADMIN ROLES
create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null,
  hierarchy_level integer not null check (hierarchy_level >= 0 and hierarchy_level <= 100),
  is_system boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 3. ADMIN PERMISSIONS
create table if not exists public.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  category text not null,
  description text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_admin_permissions_category 
  on public.admin_permissions(category);

-- 4. ROLE-PERMISSION MAPPINGS
create table if not exists public.admin_role_permissions (
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  permission_id uuid not null references public.admin_permissions(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (role_id, permission_id)
);

-- 5. ADMIN USER ROLES
create table if not exists public.admin_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default timezone('utc'::text, now()),
  scope_type text default 'global',
  scope_id text default null,
  constraint unique_user_role unique (user_id, role_id)
);

create index if not exists idx_admin_user_roles_user 
  on public.admin_user_roles(user_id);
create index if not exists idx_admin_user_roles_role 
  on public.admin_user_roles(role_id);

-- 6. IMMUTABLE APPEND-ONLY ADMIN AUDIT LOGS
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  actor_user_id uuid not null references public.profiles(id) on delete set null,
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text not null,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  request_id text,
  result text not null default 'SUCCESS',
  metadata jsonb
);

create index if not exists idx_admin_audit_created_at 
  on public.admin_audit_logs(created_at desc);
create index if not exists idx_admin_audit_actor 
  on public.admin_audit_logs(actor_user_id);
create index if not exists idx_admin_audit_action 
  on public.admin_audit_logs(action);
create index if not exists idx_admin_audit_target 
  on public.admin_audit_logs(target_type, target_id);

-- Database-level trigger to enforce append-only immutability
create or replace function public.prevent_audit_log_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Security violation: admin_audit_logs entries are immutable and cannot be updated, deleted, or truncated';
end;
$$;

drop trigger if exists trg_prevent_audit_log_modification on public.admin_audit_logs;
create trigger trg_prevent_audit_log_modification
  before update or delete on public.admin_audit_logs
  for each row
  execute function public.prevent_audit_log_modification();

-- 7. ADMIN SECURITY EVENTS
create table if not exists public.admin_security_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  event_type text not null,
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  ip_address text,
  user_agent text,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  metadata jsonb
);

create index if not exists idx_security_events_created 
  on public.admin_security_events(created_at desc);
create index if not exists idx_security_events_type 
  on public.admin_security_events(event_type);
create index if not exists idx_security_events_user 
  on public.admin_security_events(user_id);

-- 8. MODERATION REPORTS
create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'message', 'conversation', 'attachment')),
  target_id text not null,
  reason text not null,
  description text,
  status text not null default 'New' check (status in ('New', 'Assigned', 'Investigating', 'ActionTaken', 'Resolved', 'Closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution_notes text,
  action_taken text,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_moderation_reports_status 
  on public.moderation_reports(status, created_at desc);
create index if not exists idx_moderation_reports_target 
  on public.moderation_reports(target_type, target_id);
create index if not exists idx_moderation_reports_assigned 
  on public.moderation_reports(assigned_to);

-- 9. SYSTEM SETTINGS
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  category text not null,
  description text not null,
  is_secret boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) FOR ADMIN TABLES
-- ==============================================================================
alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_user_roles enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_security_events enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.system_settings enable row level security;

-- Admin read policy: Users with active admin roles can view admin tables
create or replace function public.is_any_admin(p_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_user_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.admin_user_roles aur
    where aur.user_id = p_user_id
  );
end;
$$;

-- RLS: admin_roles
drop policy if exists "Admin roles viewable by admins" on public.admin_roles;
create policy "Admin roles viewable by admins"
  on public.admin_roles for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

-- RLS: admin_permissions
drop policy if exists "Admin permissions viewable by admins" on public.admin_permissions;
create policy "Admin permissions viewable by admins"
  on public.admin_permissions for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

-- RLS: admin_role_permissions
drop policy if exists "Admin role permissions viewable by admins" on public.admin_role_permissions;
create policy "Admin role permissions viewable by admins"
  on public.admin_role_permissions for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

-- RLS: admin_user_roles
drop policy if exists "Admin user roles viewable by admins" on public.admin_user_roles;
create policy "Admin user roles viewable by admins"
  on public.admin_user_roles for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

-- RLS: admin_audit_logs (Immutable, read-only to authorized users)
drop policy if exists "Audit logs viewable by authorized admins" on public.admin_audit_logs;
create policy "Audit logs viewable by authorized admins"
  on public.admin_audit_logs for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

-- RLS: admin_security_events
drop policy if exists "Security events viewable by authorized admins" on public.admin_security_events;
create policy "Security events viewable by authorized admins"
  on public.admin_security_events for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

-- RLS: moderation_reports
-- Users can view their own filed reports; admins can view all reports
drop policy if exists "Users view own reports and admins view all" on public.moderation_reports;
create policy "Users view own reports and admins view all"
  on public.moderation_reports for select
  to authenticated
  using (auth.uid() = reporter_id or public.is_any_admin(auth.uid()));

drop policy if exists "Authenticated users can create reports" on public.moderation_reports;
create policy "Authenticated users can create reports"
  on public.moderation_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

-- RLS: system_settings
drop policy if exists "System settings viewable by admins" on public.system_settings;
create policy "System settings viewable by admins"
  on public.system_settings for select
  to authenticated
  using (public.is_any_admin(auth.uid()));

-- ==============================================================================
-- 11. SECURITY DEFINER PRIVILEGED RPCS (STRICT AUTH.UID() ACTOR IDENTIFIER)
-- ==============================================================================

-- Helper: Check if caller has specific permission
create or replace function public.has_admin_permission(req_permission text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return false;
  end if;

  -- Verify user account is not disabled or suspended
  if exists (
    select 1 from public.profiles
    where id = v_caller_id
      and (is_disabled = true or is_suspended = true)
  ) then
    return false;
  end if;

  return exists (
    select 1
    from public.admin_user_roles aur
    join public.admin_role_permissions arp on arp.role_id = aur.role_id
    join public.admin_permissions ap on ap.id = arp.permission_id
    where aur.user_id = v_caller_id
      and ap.key = req_permission
  );
end;
$$;

-- Helper: Get caller's active permissions list
create or replace function public.get_caller_admin_permissions()
returns table(permission_key text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return;
  end if;

  return query
  select distinct ap.key
  from public.admin_user_roles aur
  join public.admin_role_permissions arp on arp.role_id = aur.role_id
  join public.admin_permissions ap on ap.id = arp.permission_id
  where aur.user_id = v_caller_id;
end;
$$;

-- Helper: Get caller's active roles
create or replace function public.get_caller_admin_roles()
returns table(role_name text, hierarchy_level integer)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return;
  end if;

  return query
  select ar.name, ar.hierarchy_level
  from public.admin_user_roles aur
  join public.admin_roles ar on ar.id = aur.role_id
  where aur.user_id = v_caller_id
  order by ar.hierarchy_level desc;
end;
$$;

-- Helper: Log admin audit entry
create or replace function public.admin_log_audit(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_ip_address text default null,
  p_user_agent text default null,
  p_result text default 'SUCCESS',
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_top_role text;
  v_log_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Unauthenticated audit attempt';
  end if;

  select ar.name into v_top_role
  from public.admin_user_roles aur
  join public.admin_roles ar on ar.id = aur.role_id
  where aur.user_id = v_caller_id
  order by ar.hierarchy_level desc
  limit 1;

  if v_top_role is null then
    v_top_role := 'Anonymous';
  end if;

  insert into public.admin_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    old_value,
    new_value,
    ip_address,
    user_agent,
    result,
    metadata
  ) values (
    v_caller_id,
    v_top_role,
    p_action,
    p_target_type,
    p_target_id,
    p_reason,
    p_old_value,
    p_new_value,
    p_ip_address,
    p_user_agent,
    p_result,
    p_metadata
  ) returning id into v_log_id;

  return v_log_id;
end;
$$;

-- RPC: Admin Dashboard Metrics
create or replace function public.admin_get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_total_users bigint;
  v_verified_users bigint;
  v_unverified_users bigint;
  v_suspended_users bigint;
  v_total_conversations bigint;
  v_total_messages bigint;
  v_messages_today bigint;
  v_total_attachments bigint;
  v_total_storage_bytes bigint;
  v_pending_reports bigint;
  v_security_events_24h bigint;
begin
  v_caller_id := auth.uid();
  if not public.has_admin_permission('analytics.view') and not public.has_admin_permission('users.view') then
    raise exception 'Access denied: insufficient permissions to view admin dashboard metrics';
  end if;

  select count(*) into v_total_users from public.profiles;
  
  -- Estimate verified vs unverified
  select 
    count(case when is_suspended = false then 1 end),
    count(case when is_suspended = true then 1 end)
  into v_verified_users, v_suspended_users
  from public.profiles;

  v_unverified_users := 0;

  select count(*) into v_total_conversations from public.conversations;
  select count(*) into v_total_messages from public.messages;
  select count(*) into v_messages_today from public.messages where created_at >= (now() - interval '24 hours');
  select count(*), coalesce(sum(file_size), 0) into v_total_attachments, v_total_storage_bytes from public.attachments;
  select count(*) into v_pending_reports from public.moderation_reports where status in ('New', 'Assigned', 'Investigating');
  select count(*) into v_security_events_24h from public.admin_security_events where created_at >= (now() - interval '24 hours');

  return jsonb_build_object(
    'total_users', v_total_users,
    'verified_users', v_verified_users,
    'unverified_users', v_unverified_users,
    'suspended_users', v_suspended_users,
    'total_conversations', v_total_conversations,
    'total_messages', v_total_messages,
    'messages_today', v_messages_today,
    'total_attachments', v_total_attachments,
    'storage_bytes', v_total_storage_bytes,
    'pending_reports', v_pending_reports,
    'security_events_today', v_security_events_24h
  );
end;
$$;

-- RPC: Admin Suspend User (Strict Privilege & Reason Check)
create or replace function public.admin_suspend_user(
  p_target_user_id uuid,
  p_reason text,
  p_duration_hours integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_caller_max_level integer;
  v_target_max_level integer;
  v_until timestamptz;
  v_old_status jsonb;
begin
  v_caller_id := auth.uid();
  if not public.has_admin_permission('users.suspend') then
    raise exception 'Access denied: users.suspend permission required';
  end if;

  if p_target_user_id = v_caller_id then
    raise exception 'Operation not permitted: administrator cannot suspend own account';
  end if;

  if trim(p_reason) is null or length(trim(p_reason)) < 3 then
    raise exception 'A valid reason (minimum 3 characters) is required for account suspension';
  end if;

  -- Enforce hierarchy: caller cannot suspend equal or higher hierarchy administrator
  select coalesce(max(ar.hierarchy_level), 0) into v_caller_max_level
  from public.admin_user_roles aur
  join public.admin_roles ar on ar.id = aur.role_id
  where aur.user_id = v_caller_id;

  select coalesce(max(ar.hierarchy_level), 0) into v_target_max_level
  from public.admin_user_roles aur
  join public.admin_roles ar on ar.id = aur.role_id
  where aur.user_id = p_target_user_id;

  if v_target_max_level >= v_caller_max_level and v_target_max_level > 0 then
    raise exception 'Hierarchy violation: cannot suspend an administrator with equal or higher privilege level';
  end if;

  select jsonb_build_object(
    'is_suspended', is_suspended,
    'suspended_until', suspended_until,
    'suspension_reason', suspension_reason
  ) into v_old_status
  from public.profiles
  where id = p_target_user_id;

  if p_duration_hours is not null and p_duration_hours > 0 then
    v_until := timezone('utc'::text, now()) + (p_duration_hours || ' hours')::interval;
  else
    v_until := null;
  end if;

  update public.profiles set
    is_suspended = true,
    suspended_until = v_until,
    suspension_reason = trim(p_reason),
    force_logout_at = timezone('utc'::text, now())
  where id = p_target_user_id;

  perform public.admin_log_audit(
    'USER_SUSPENDED',
    'user',
    p_target_user_id::text,
    p_reason,
    v_old_status,
    jsonb_build_object('is_suspended', true, 'suspended_until', v_until, 'suspension_reason', p_reason)
  );

  return true;
end;
$$;

-- RPC: Admin Restore User
create or replace function public.admin_restore_user(
  p_target_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_old_status jsonb;
begin
  v_caller_id := auth.uid();
  if not public.has_admin_permission('users.restore') then
    raise exception 'Access denied: users.restore permission required';
  end if;

  if trim(p_reason) is null or length(trim(p_reason)) < 3 then
    raise exception 'A valid reason is required to restore an account';
  end if;

  select jsonb_build_object(
    'is_suspended', is_suspended,
    'is_disabled', is_disabled,
    'suspension_reason', suspension_reason
  ) into v_old_status
  from public.profiles
  where id = p_target_user_id;

  update public.profiles set
    is_suspended = false,
    suspended_until = null,
    suspension_reason = null,
    is_disabled = false
  where id = p_target_user_id;

  perform public.admin_log_audit(
    'USER_RESTORED',
    'user',
    p_target_user_id::text,
    p_reason,
    v_old_status,
    jsonb_build_object('is_suspended', false, 'is_disabled', false)
  );

  return true;
end;
$$;

-- RPC: Admin Assign Role with Anti-Self-Escalation & Strict Hierarchy
create or replace function public.admin_assign_role(
  p_target_user_id uuid,
  p_role_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_caller_max_level integer;
  v_target_role_level integer;
  v_target_role_name text;
begin
  v_caller_id := auth.uid();
  if not public.has_admin_permission('roles.manage') then
    raise exception 'Access denied: roles.manage permission required';
  end if;

  if p_target_user_id = v_caller_id then
    raise exception 'Security violation: administrators cannot modify or assign roles to their own account';
  end if;

  if trim(p_reason) is null or length(trim(p_reason)) < 3 then
    raise exception 'A valid reason is required for role assignment';
  end if;

  select ar.hierarchy_level, ar.name into v_target_role_level, v_target_role_name
  from public.admin_roles ar
  where ar.id = p_role_id;

  if v_target_role_level is null then
    raise exception 'Target role not found';
  end if;

  select coalesce(max(ar.hierarchy_level), 0) into v_caller_max_level
  from public.admin_user_roles aur
  join public.admin_roles ar on ar.id = aur.role_id
  where aur.user_id = v_caller_id;

  -- Rule: Caller cannot grant a role with equal or higher hierarchy level than their own
  if v_target_role_level >= v_caller_max_level then
    raise exception 'Privilege escalation violation: cannot grant a role equal to or exceeding your privilege level';
  end if;

  insert into public.admin_user_roles (user_id, role_id, assigned_by)
  values (p_target_user_id, p_role_id, v_caller_id)
  on conflict (user_id, role_id) do nothing;

  perform public.admin_log_audit(
    'ROLE_ASSIGNED',
    'user',
    p_target_user_id::text,
    p_reason,
    null,
    jsonb_build_object('role_id', p_role_id, 'role_name', v_target_role_name)
  );

  return true;
end;
$$;

-- RPC: Admin Remove Role with Anti-Self-Demotion & Hierarchy Guard
create or replace function public.admin_remove_role(
  p_target_user_id uuid,
  p_role_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_caller_max_level integer;
  v_target_role_level integer;
  v_target_role_name text;
begin
  v_caller_id := auth.uid();
  if not public.has_admin_permission('roles.manage') then
    raise exception 'Access denied: roles.manage permission required';
  end if;

  if p_target_user_id = v_caller_id then
    raise exception 'Security violation: administrators cannot revoke roles from their own account';
  end if;

  select ar.hierarchy_level, ar.name into v_target_role_level, v_target_role_name
  from public.admin_roles ar
  where ar.id = p_role_id;

  if v_target_role_level is null then
    raise exception 'Target role not found';
  end if;

  select coalesce(max(ar.hierarchy_level), 0) into v_caller_max_level
  from public.admin_user_roles aur
  join public.admin_roles ar on ar.id = aur.role_id
  where aur.user_id = v_caller_id;

  if v_target_role_level >= v_caller_max_level then
    raise exception 'Hierarchy violation: cannot remove a role equal to or exceeding your privilege level';
  end if;

  delete from public.admin_user_roles
  where user_id = p_target_user_id and role_id = p_role_id;

  perform public.admin_log_audit(
    'ROLE_REMOVED',
    'user',
    p_target_user_id::text,
    p_reason,
    jsonb_build_object('role_id', p_role_id, 'role_name', v_target_role_name),
    null
  );

  return true;
end;
$$;

-- RPC: Admin Resolve Report
create or replace function public.admin_resolve_report(
  p_report_id uuid,
  p_new_status text,
  p_action_taken text,
  p_resolution_notes text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_old_report jsonb;
begin
  v_caller_id := auth.uid();
  if not public.has_admin_permission('reports.resolve') then
    raise exception 'Access denied: reports.resolve permission required';
  end if;

  select jsonb_build_object('status', status, 'action_taken', action_taken)
  into v_old_report
  from public.moderation_reports
  where id = p_report_id;

  if v_old_report is null then
    raise exception 'Report not found';
  end if;

  update public.moderation_reports set
    status = p_new_status,
    action_taken = p_action_taken,
    resolution_notes = p_resolution_notes,
    assigned_to = v_caller_id,
    resolved_at = case when p_new_status in ('Resolved', 'Closed') then timezone('utc'::text, now()) else null end,
    updated_at = timezone('utc'::text, now())
  where id = p_report_id;

  perform public.admin_log_audit(
    'REPORT_RESOLVED',
    'report',
    p_report_id::text,
    coalesce(p_resolution_notes, 'Moderation report resolved'),
    v_old_report,
    jsonb_build_object('status', p_new_status, 'action_taken', p_action_taken)
  );

  return true;
end;
$$;

-- RPC: Break-Glass Private Message Content Access (Strict Audit & Permission Gating)
create or replace function public.admin_break_glass_message_content(
  p_message_id uuid,
  p_reason text
)
returns table(
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_username text,
  content text,
  message_type text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if not public.has_admin_permission('messages.content.view') then
    raise exception 'Access denied: messages.content.view break-glass permission required';
  end if;

  if trim(p_reason) is null or length(trim(p_reason)) < 5 then
    raise exception 'A detailed justification (minimum 5 characters) is required for break-glass private message inspection';
  end if;

  -- Record immediate immutable audit entry
  perform public.admin_log_audit(
    'PRIVATE_CONTENT_ACCESSED',
    'message',
    p_message_id::text,
    p_reason,
    null,
    jsonb_build_object('message_id', p_message_id, 'reason', p_reason)
  );

  return query
  select 
    m.id as message_id,
    m.conversation_id,
    m.sender_id,
    p.username as sender_username,
    m.content,
    m.message_type,
    m.created_at
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  where m.id = p_message_id;
end;
$$;

-- RPC: Admin Update System Setting (SuperAdmin / settings.manage required)
create or replace function public.admin_update_system_setting(
  p_key text,
  p_value jsonb,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_old_setting jsonb;
begin
  v_caller_id := auth.uid();
  if not public.has_admin_permission('settings.manage') then
    raise exception 'Access denied: settings.manage permission required';
  end if;

  if trim(p_reason) is null or length(trim(p_reason)) < 3 then
    raise exception 'A valid reason is required to update system settings';
  end if;

  select value into v_old_setting
  from public.system_settings
  where key = p_key;

  update public.system_settings set
    value = p_value,
    updated_by = v_caller_id,
    updated_at = timezone('utc'::text, now())
  where key = p_key;

  perform public.admin_log_audit(
    'SETTING_CHANGED',
    'setting',
    p_key,
    p_reason,
    v_old_setting,
    p_value
  );

  return true;
end;
$$;

-- ==============================================================================
-- 12. SEED INITIAL ROLES & PERMISSIONS
-- ==============================================================================

-- Seed Permissions
insert into public.admin_permissions (key, category, description) values
  ('users.view', 'Users', 'View user profiles, statuses, and registration details'),
  ('users.create', 'Users', 'Create new user accounts administratively'),
  ('users.edit', 'Users', 'Edit user profile information'),
  ('users.delete', 'Users', 'Soft delete or hard delete user accounts'),
  ('users.suspend', 'Users', 'Temporarily or permanently suspend user accounts'),
  ('users.restore', 'Users', 'Restore suspended or disabled user accounts'),
  ('users.revoke_sessions', 'Users', 'Force logout and invalidate active sessions for users'),
  ('roles.view', 'Roles', 'View administrative roles and assigned permissions'),
  ('roles.manage', 'Roles', 'Create, edit, assign, and revoke administrative roles'),
  ('permissions.view', 'Roles', 'View permission catalogs'),
  ('permissions.manage', 'Roles', 'Configure permissions assigned to roles'),
  ('conversations.metadata.view', 'Conversations', 'Inspect conversation metadata, members, and activity'),
  ('conversations.moderate', 'Conversations', 'Archive, disable, or transfer conversation ownership'),
  ('conversations.delete', 'Conversations', 'Delete conversations administratively'),
  ('messages.metadata.view', 'Messages', 'Search message metadata, timestamps, and message types'),
  ('messages.content.view', 'Messages', 'Break-glass access to view private message bodies with justification'),
  ('messages.delete', 'Messages', 'Administratively delete abusive messages'),
  ('messages.restore', 'Messages', 'Restore previously deleted messages'),
  ('attachments.view', 'Storage', 'View attachment metadata, usage, and catalog'),
  ('attachments.delete', 'Storage', 'Delete malicious or orphaned attachments from storage'),
  ('reports.view', 'Moderation', 'View the moderation queue and user reports'),
  ('reports.assign', 'Moderation', 'Assign moderation reports to specific moderators'),
  ('reports.resolve', 'Moderation', 'Resolve or dismiss moderation reports with action taken'),
  ('security.view', 'Security', 'View security dashboard and security event audit logs'),
  ('security.manage', 'Security', 'Execute security interventions, force lockouts, and revoke credentials'),
  ('analytics.view', 'Analytics', 'Access platform analytics, growth rates, and retention stats'),
  ('settings.view', 'Settings', 'View global application and system configuration'),
  ('settings.manage', 'Settings', 'Update global system settings and security policies'),
  ('notifications.view', 'Notifications', 'View system email and notification templates'),
  ('notifications.manage', 'Notifications', 'Edit and test notification templates'),
  ('audit.view', 'Audit', 'Inspect immutable administrative audit logs'),
  ('system.health.view', 'System', 'Monitor live service latency, error rates, and infrastructure health')
on conflict (key) do nothing;

-- Seed Roles
insert into public.admin_roles (name, description, hierarchy_level, is_system) values
  ('SuperAdmin', 'Unrestricted administrative access with break-glass authorization', 100, true),
  ('SystemAdmin', 'Technical systems administration, configuration, and security operations', 80, true),
  ('Admin', 'General user management, conversation governance, and operational moderation', 60, true),
  ('Moderator', 'Content moderation, user reports resolution, and message safety', 40, true),
  ('Support', 'User troubleshooting, session recovery, and account status management', 30, true),
  ('Analyst', 'Read-only business analytics, metrics, and operational health monitoring', 20, true)
on conflict (name) do nothing;

-- Seed Role Permissions
do $$
declare
  v_role_super uuid;
  v_role_sys uuid;
  v_role_admin uuid;
  v_role_mod uuid;
  v_role_sup uuid;
  v_role_analyst uuid;
begin
  select id into v_role_super from public.admin_roles where name = 'SuperAdmin';
  select id into v_role_sys from public.admin_roles where name = 'SystemAdmin';
  select id into v_role_admin from public.admin_roles where name = 'Admin';
  select id into v_role_mod from public.admin_roles where name = 'Moderator';
  select id into v_role_sup from public.admin_roles where name = 'Support';
  select id into v_role_analyst from public.admin_roles where name = 'Analyst';

  -- SuperAdmin gets ALL permissions
  insert into public.admin_role_permissions (role_id, permission_id)
  select v_role_super, id from public.admin_permissions
  on conflict do nothing;

  -- SystemAdmin gets technical, security, settings, health, storage
  insert into public.admin_role_permissions (role_id, permission_id)
  select v_role_sys, id from public.admin_permissions
  where key in (
    'users.view', 'users.revoke_sessions', 'roles.view', 'permissions.view',
    'security.view', 'security.manage', 'settings.view', 'settings.manage',
    'system.health.view', 'attachments.view', 'attachments.delete', 'audit.view', 'analytics.view'
  )
  on conflict do nothing;

  -- Admin gets user management, conversations, reports, messages (metadata), audit
  insert into public.admin_role_permissions (role_id, permission_id)
  select v_role_admin, id from public.admin_permissions
  where key in (
    'users.view', 'users.create', 'users.edit', 'users.suspend', 'users.restore', 'users.revoke_sessions',
    'roles.view', 'permissions.view',
    'conversations.metadata.view', 'conversations.moderate',
    'messages.metadata.view', 'messages.delete', 'messages.restore',
    'attachments.view', 'reports.view', 'reports.assign', 'reports.resolve',
    'analytics.view', 'audit.view', 'system.health.view'
  )
  on conflict do nothing;

  -- Moderator gets reports, moderation, message delete/restore
  insert into public.admin_role_permissions (role_id, permission_id)
  select v_role_mod, id from public.admin_permissions
  where key in (
    'users.view', 'users.suspend',
    'conversations.metadata.view', 'conversations.moderate',
    'messages.metadata.view', 'messages.delete', 'messages.restore',
    'reports.view', 'reports.assign', 'reports.resolve',
    'attachments.view'
  )
  on conflict do nothing;

  -- Support gets user lookup, restore, session revoke
  insert into public.admin_role_permissions (role_id, permission_id)
  select v_role_sup, id from public.admin_permissions
  where key in (
    'users.view', 'users.restore', 'users.revoke_sessions',
    'reports.view', 'system.health.view'
  )
  on conflict do nothing;

  -- Analyst gets read-only analytics, health
  insert into public.admin_role_permissions (role_id, permission_id)
  select v_role_analyst, id from public.admin_permissions
  where key in ('analytics.view', 'system.health.view')
  on conflict do nothing;
end;
$$;

-- Seed Default System Settings
insert into public.system_settings (key, value, category, description, is_secret) values
  ('app.name', '"Heat Chat"'::jsonb, 'General', 'Display name of the application', false),
  ('app.registration_enabled', 'true'::jsonb, 'Auth', 'Whether new user registrations are permitted', false),
  ('app.email_verification_mandatory', 'true'::jsonb, 'Auth', 'Whether email verification is strictly required', false),
  ('app.max_message_length', '5000'::jsonb, 'Messaging', 'Maximum character count for messages', false),
  ('app.max_attachment_size_mb', '25'::jsonb, 'Storage', 'Maximum allowed attachment size in megabytes', false),
  ('app.allowed_attachment_types', '["image/jpeg", "image/png", "image/webp", "image/gif"]'::jsonb, 'Storage', 'Permitted MIME types for chat uploads', false),
  ('app.maintenance_mode', 'false'::jsonb, 'System', 'Whether the application is undergoing maintenance', false)
on conflict (key) do nothing;
