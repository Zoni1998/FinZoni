-- Execute somente no projeto FinZoni, após revisão e backup.
-- A função preserva RLS e evita enviar documentos inteiros no filtro da URL.
-- Não modifica registros existentes. Instalar ANTES de publicar os clientes.
begin;
create or replace function public.save_finances_if_unchanged(
  p_user_id uuid,
  p_expected jsonb,
  p_payload text
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current jsonb;
  v_count integer;
begin
  -- authenticated acessa apenas sua conta; service_role é limitado pela API.
  if current_user <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_expected is null or p_payload is null or jsonb_typeof(p_payload::jsonb) <> 'object' then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;
  select to_jsonb(f.data) into v_current
    from public.finances as f
    where f.user_id = p_user_id
    for update;
  if not found or v_current is distinct from p_expected then
    return false;
  end if;
  -- jsonb_populate_record adapta o valor ao tipo real da coluna data.
  -- O payload é a string JSON usada pelos clientes existentes.
  update public.finances
    set data = (select r.data from jsonb_populate_record(
      null::public.finances, jsonb_build_object('data', p_payload)
    ) as r)
    where user_id = p_user_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'Expected one finance row' using errcode = '22023';
  end if;
  return true;
end;
$$;
revoke all on function public.save_finances_if_unchanged(uuid, jsonb, text) from public, anon;
grant execute on function public.save_finances_if_unchanged(uuid, jsonb, text) to authenticated, service_role;
commit;
