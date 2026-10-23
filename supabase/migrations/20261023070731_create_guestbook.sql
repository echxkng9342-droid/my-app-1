-- 방명록 글. 삭제 토큰은 해시로만 저장하고, 공개 키(anon)로는 읽기만 허용한다.
create table public.guestbook_entries (
  id          bigint generated always as identity primary key,
  name        text        not null check (char_length(name) between 1 and 20),
  message     text        not null check (char_length(message) between 1 and 300),
  token_hash  text        not null,
  created_at  timestamptz not null default now()
);

alter table public.guestbook_entries enable row level security;

create policy "Anyone can read guestbook entries"
  on public.guestbook_entries for select
  to anon, authenticated
  using (true);

-- token_hash 열은 공개 키로 보이지 않게 열 단위로만 읽기 권한을 준다.
revoke all on public.guestbook_entries from anon, authenticated;
grant select (id, name, message, created_at) on public.guestbook_entries to anon, authenticated;

-- 글 작성: 삭제용 토큰을 만들어 해시만 저장하고, 토큰 원문은 작성자에게 한 번만 돌려준다.
create function public.add_guestbook_entry(p_name text, p_message text)
returns table (id bigint, name text, message text, created_at timestamptz, delete_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name    text := btrim(coalesce(p_name, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_token   text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if char_length(v_name) not between 1 and 20 then
    raise exception '이름은 1~20자로 적어 주세요.' using errcode = '22023';
  end if;
  if char_length(v_message) not between 1 and 300 then
    raise exception '메시지는 1~300자로 적어 주세요.' using errcode = '22023';
  end if;

  return query
    insert into public.guestbook_entries as e (name, message, token_hash)
    values (v_name, v_message, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
    returning e.id, e.name, e.message, e.created_at, v_token;
end;
$$;

-- 글 삭제: 토큰이 맞을 때만 지운다. 지웠으면 true.
create function public.delete_guestbook_entry(p_id bigint, p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from public.guestbook_entries
   where guestbook_entries.id = p_id
     and token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke execute on function public.add_guestbook_entry(text, text) from public;
revoke execute on function public.delete_guestbook_entry(bigint, text) from public;
grant execute on function public.add_guestbook_entry(text, text) to anon, authenticated;
grant execute on function public.delete_guestbook_entry(bigint, text) to anon, authenticated;
