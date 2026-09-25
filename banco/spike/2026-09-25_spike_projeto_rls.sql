-- SPIKE (rodar SOMENTE no banco de TESTE, nunca na produção).
-- Prova a técnica: cabeçalho x-projeto-id -> DEFAULT do projeto_id + RLS por vínculo do usuário.
-- Cria tabelas spike_*; a limpeza está no fim do arquivo.

drop table if exists spike_itens, spike_membros, spike_projetos cascade;
drop function if exists spike_projeto_ativo(), spike_usuario(), spike_eh_membro(int);

create table spike_projetos (id int primary key, nome text not null);
create table spike_membros  (usuario text not null, projeto_id int not null references spike_projetos(id), papel text not null);

-- Projeto ativo vem do cabeçalho HTTP; usuário vem do JWT (claim "usuario").
create function spike_projeto_ativo() returns int language sql stable as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-projeto-id', '')::int
$$;
create function spike_usuario() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'usuario', '')
$$;

-- Vínculo checado por função security definer: não depende de RLS/policy na tabela de vínculos.
create function spike_eh_membro(p int) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from spike_membros m where m.usuario = spike_usuario() and m.projeto_id = p)
$$;

create table spike_itens (
  id bigserial primary key,
  projeto_id int not null default spike_projeto_ativo() references spike_projetos(id),
  nome text not null
);

alter table spike_itens enable row level security;
create policy spike_por_projeto on spike_itens for all to anon, authenticated
  using (projeto_id = spike_projeto_ativo() and spike_eh_membro(projeto_id))
  with check (projeto_id = spike_projeto_ativo() and spike_eh_membro(projeto_id));

grant all on spike_projetos, spike_membros, spike_itens to anon, authenticated, service_role;
grant usage, select on sequence spike_itens_id_seq to anon, authenticated, service_role;

insert into spike_projetos values (1, 'UBX'), (2, 'PROJETO DEV');
insert into spike_membros values ('ana', 1, 'admin'), ('bia', 2, 'user'), ('cris', 1, 'user'), ('cris', 2, 'admin');
insert into spike_itens (projeto_id, nome) values (1, 'item do UBX'), (2, 'item do DEV');

-- LIMPEZA (rodar depois do teste):
-- drop table spike_itens, spike_membros, spike_projetos cascade;
-- drop function spike_projeto_ativo(), spike_usuario(), spike_eh_membro(int);
