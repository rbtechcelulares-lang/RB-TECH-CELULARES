-- RB Tech Celulares · limite diário do RBChat (proteção contra abuso)
-- Rode no Supabase (SQL Editor › New query › Run). Opcional: sem ele o limite conta só na memória do servidor.
-- Guarda só um código embaralhado do visitante por dia (não guarda IP nem mensagens).

create table if not exists public.chat_uso (
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  visitante text not null check (char_length(visitante) <= 64),
  n int not null default 0,
  primary key (dia, visitante)
);
alter table public.chat_uso enable row level security;
revoke all on public.chat_uso from anon, authenticated;

-- Soma 1 e responde se ainda está dentro do limite do dia
create or replace function public.chat_contar(p_visitante text, p_limite int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  total int;
begin
  insert into chat_uso (dia, visitante, n) values (hoje, left(p_visitante, 64), 1)
  on conflict (dia, visitante) do update set n = chat_uso.n + 1
  returning n into total;
  delete from chat_uso where dia < hoje - 2;
  return total <= greatest(coalesce(p_limite, 40), 1);
end;
$$;
revoke all on function public.chat_contar(text, int) from public;
grant execute on function public.chat_contar(text, int) to anon, authenticated;
