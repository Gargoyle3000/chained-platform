-- Expose only the current active account's password-ready state to browser sessions.

create function public.current_account_has_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
        from public.accounts as a
        join auth.users as u
          on u.id = a.id
       where a.id = auth.uid()
         and a.status = 'active'
         and u.encrypted_password is not null
         and u.encrypted_password <> ''
    );
$$;

revoke all on function public.current_account_has_password() from public;
revoke all on function public.current_account_has_password() from anon;
grant execute on function public.current_account_has_password() to authenticated;
