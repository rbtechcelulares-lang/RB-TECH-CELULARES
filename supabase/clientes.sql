-- RB Tech Celulares · clientes do RBChat (CRM)
-- Rode no Supabase (SQL Editor › New query › Run) DEPOIS do rastreamento.sql.
-- Usa a mesma chave do painel de cliques. Pode rodar de novo sem perder os clientes.

create table if not exists public.clientes (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  nome text not null check (char_length(nome) between 1 and 80),
  whatsapp text not null unique check (whatsapp ~ '^[0-9]{12,13}$'),
  interesse text check (char_length(interesse) <= 300),
  entrada text check (char_length(entrada) <= 160),
  origem text check (char_length(origem) <= 40),
  status text not null default 'novo' check (status in ('novo', 'contatado', 'negociando', 'comprou', 'perdido')),
  notas text check (char_length(notas) <= 1000)
);
create index if not exists clientes_atualizado_idx on public.clientes (atualizado_em desc);

-- Ninguém lê nem altera a tabela pela chave pública: só pelas funções abaixo.
alter table public.clientes enable row level security;
revoke all on public.clientes from anon, authenticated;

-- Confere a chave do painel (a mesma do painel de cliques)
create or replace function public.painel_checar(chave text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  select encode(sha256(convert_to(chave, 'UTF8')), 'hex') = c.chave_hash into ok
  from painel_config c where c.id = 1;
  if not coalesce(ok, false) then
    perform pg_sleep(1);
    raise exception 'chave do painel incorreta' using errcode = '28000';
  end if;
end;
$$;
revoke all on function public.painel_checar(text) from public, anon, authenticated;

-- O site salva/atualiza o cliente (pelo WhatsApp) quando ele passa nome e número no chat
create or replace function public.salvar_cliente(p_nome text, p_whatsapp text, p_interesse text default null, p_entrada text default null, p_origem text default 'chat')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  zap text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
begin
  if char_length(zap) in (10, 11) then zap := '55' || zap; end if;
  if zap !~ '^[0-9]{12,13}$' then return; end if;
  insert into clientes (nome, whatsapp, interesse, entrada, origem)
  values (left(coalesce(nullif(trim(p_nome), ''), 'Cliente'), 80), zap, left(nullif(trim(p_interesse), ''), 300), left(nullif(trim(p_entrada), ''), 160), left(coalesce(p_origem, 'chat'), 40))
  on conflict (whatsapp) do update set
    nome = coalesce(nullif(left(trim(p_nome), 80), ''), clientes.nome),
    interesse = coalesce(left(nullif(trim(p_interesse), ''), 300), clientes.interesse),
    entrada = coalesce(left(nullif(trim(p_entrada), ''), 160), clientes.entrada),
    atualizado_em = now();
end;
$$;
revoke all on function public.salvar_cliente(text, text, text, text, text) from public;
grant execute on function public.salvar_cliente(text, text, text, text, text) to anon, authenticated;

-- Lista para o admin (só com a chave do painel)
create or replace function public.painel_clientes(chave text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform painel_checar(chave);
  return coalesce((select json_agg(c order by c.atualizado_em desc) from (
    select id, criado_em, atualizado_em, nome, whatsapp, interesse, entrada, origem, status, notas
    from clientes order by atualizado_em desc limit 1000) c), '[]'::json);
end;
$$;
revoke all on function public.painel_clientes(text) from public;
grant execute on function public.painel_clientes(text) to anon, authenticated;

-- Admin muda status/notas ou apaga (só com a chave do painel)
create or replace function public.painel_cliente_salvar(chave text, p_id bigint, p_status text default null, p_notas text default null, p_apagar boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform painel_checar(chave);
  if p_apagar then
    delete from clientes where id = p_id;
  else
    update clientes set
      status = coalesce(p_status, status),
      notas = coalesce(left(p_notas, 1000), notas)
    where id = p_id;
  end if;
end;
$$;
revoke all on function public.painel_cliente_salvar(text, bigint, text, text, boolean) from public;
grant execute on function public.painel_cliente_salvar(text, bigint, text, text, boolean) to anon, authenticated;
