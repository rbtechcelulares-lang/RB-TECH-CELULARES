-- RB Tech Celulares · registro de cliques
-- Rode no Supabase (SQL Editor › New query › Run).
-- Antes, troque TROQUE-ESTA-CHAVE (no fim do arquivo) pela senha do painel de cliques.
-- Pode rodar de novo quando quiser trocar a senha: os cliques já registrados são mantidos.

create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  tipo text not null check (tipo in ('visita', 'clique', 'whatsapp', 'popup')),
  produto_id text check (char_length(produto_id) <= 120),
  produto_nome text check (char_length(produto_nome) <= 160),
  origem text check (char_length(origem) <= 40),
  detalhe text check (char_length(detalhe) <= 200),
  sessao text check (char_length(sessao) <= 60)
);
create index if not exists eventos_criado_em_idx on public.eventos (criado_em);

-- O site só consegue GRAVAR eventos; ninguém lê a tabela pela chave pública.
alter table public.eventos enable row level security;
drop policy if exists "site registra eventos" on public.eventos;
create policy "site registra eventos" on public.eventos
  for insert to anon with check (true);
grant insert on public.eventos to anon;
revoke select, update, delete on public.eventos from anon;

-- Senha do painel (guardada como hash, sem acesso pela chave pública)
create table if not exists public.painel_config (
  id int primary key default 1 check (id = 1),
  chave_hash text not null
);
alter table public.painel_config enable row level security;
revoke all on public.painel_config from anon, authenticated;

-- Resumo para o admin: só responde com a senha certa
create or replace function public.painel_resumo(chave text, desde timestamptz default null)
returns json
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

  return json_build_object(
    'totais', (
      select json_build_object(
        'visitas', count(*) filter (where tipo = 'visita'),
        'cliques', count(*) filter (where tipo = 'clique'),
        'propostas', count(*) filter (where tipo = 'whatsapp' and produto_id is not null),
        'whatsapp_geral', count(*) filter (where tipo = 'whatsapp' and produto_id is null),
        'popup', count(*) filter (where tipo = 'popup'))
      from eventos where desde is null or criado_em >= desde),
    'produtos', coalesce((
      select json_agg(x order by x.cliques desc, x.whatsapp desc) from (
        select produto_id,
               max(produto_nome) as produto_nome,
               count(*) filter (where tipo = 'clique') as cliques,
               count(*) filter (where tipo = 'whatsapp') as whatsapp
        from eventos
        where produto_id is not null and (desde is null or criado_em >= desde)
        group by produto_id) x), '[]'::json),
    'ultimas', coalesce((
      select json_agg(u) from (
        select produto_id, produto_nome, detalhe, criado_em
        from eventos
        where tipo = 'whatsapp' and produto_id is not null and (desde is null or criado_em >= desde)
        order by criado_em desc limit 15) u), '[]'::json)
  );
end;
$$;

revoke all on function public.painel_resumo(text, timestamptz) from public;
grant execute on function public.painel_resumo(text, timestamptz) to anon, authenticated;

-- >>> TROQUE A SENHA AQUI <<<
insert into public.painel_config (id, chave_hash)
values (1, encode(sha256(convert_to('TROQUE-ESTA-CHAVE', 'UTF8')), 'hex'))
on conflict (id) do update set chave_hash = excluded.chave_hash;
