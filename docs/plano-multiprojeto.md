# Plano: multi-projeto no UBX Controle Geral

Objetivo: tudo passa a pertencer a um **Projeto** (UBX é o projeto 1). Cada projeto tem seus próprios
cadastros, orçamentos, pedidos e configurações; usuários acessam só os projetos a que estão vinculados.

Decisão de base: **continuar nesta base** (mesmo código, mesmo banco), em fases, cada uma com o sistema
funcionando. Recomeçar do zero custaria refazer o que já está pronto (fluxos, kanban, ajuste, anexos, PDF).

## 1. Situação atual (o que pesa no desenho)

- **386 chamadas `.from(...)` em 73 arquivos**, a maioria direto do navegador com a chave anônima do Supabase.
- **Não há RLS**: qualquer um com a chave anônima lê e grava em todas as tabelas. Filtrar por projeto só na tela
  **organiza, mas não protege**. As regras de acesso pedidas só são reais com RLS (fase 4).
- Relações por **nome em texto** (empresa, categoria, fornecedor, cliente), não por id. Dentro de um projeto
  isso continua ok; entre projetos, nomes repetidos se misturariam.
- **Únicos globais** que quebram com 2 projetos: `empresas.empresa`, `fornecedores.nome`, `clientes.nome`,
  `config.chave`, `controle_orcamento (empresa, categoria, mes, ano)` e as de `categorias`.
- **Triggers de orçamento** somam `pedidos_solicitados_fluxo` por empresa/categoria/mês sem projeto: com dois
  projetos usando a mesma empresa, os orçamentos se misturariam. Precisam entrar na fase 1.
- Login por JWT próprio (`ubx_session`); ele não chega ao Postgres, por isso hoje não existe RLS por usuário.

## 2. Modelo de dados

**Novas tabelas**
- `projetos (id, nome, ativo, criado_em)`. Linha 1 = UBX.
- `usuarios_projetos (usuario_id, projeto_id, papel)` com papel `admin` ou `user`. `owner` continua global
  (vê todos os projetos).

**Ganham `projeto_id`** (entidades raiz, NOT NULL, FK para `projetos`):
`empresas`, `categorias`, `categorias_receita`, `fornecedores`, `clientes`, `orcamentos_usuarios(_receita)`,
`controle_orcamento(_receita)`, `registro_orcamentos(_receita)`, `registro_orcamento_analise(_receita)`,
`pedidos_solicitados(_receita)`, `pedidos_solicitados_fluxo(_receita)`, `requisicoes(_receita)`, `conta_pagador`, `conta_receita`,
`modelo_contrato`, `modelo_contrato_venda`, `informacoes_boleto(_receita)`, `controle_sequencial(_recebimento)`.

**Herdam pelo pedido, sem coluna nova** (usam `pedido_id`): `controle_pagamentos`, `controle_recebimento`, `documentos(_receita)`, `comentarios(_receita)`.

**Continuam globais**: `usuarios`, `tipos_*`, `*_status`, `pedido_status(_receita)`, `smtp_config`,
`email_config`, `reset_tokens`, `assistente_virtual`.

**`config`** ganha `projeto_id`. Por projeto: `fluxo_sistema`, `fluxo_sistema_receita`, `contratos_liberados`,
`logo`. SMTP e e-mail ficam gerais (uma configuração para todos os projetos). Único passa a ser `(projeto_id, chave)`.

**Únicos e chaves estrangeiras** passam a incluir `projeto_id`: `(projeto_id, nome)`, `(projeto_id, empresa, categoria)`
e assim por diante. São ~20 FKs por nome (empresa/categoria/fornecedor/cliente) recriadas como compostas, para um
projeto não usar a categoria ou o fornecedor de outro. O cronograma (`*_fluxo`) ganhou `projeto_id` porque o
orçamento é somado em cima dele; uma trigger copia o projeto do pedido.

## 3. Como o projeto chega às consultas (ponto central)

Tocar 386 chamadas uma a uma é caro e fácil de esquecer. Proposta:

1. O projeto ativo vai para o cookie/sessão e o cliente Supabase do navegador manda o cabeçalho
   `x-projeto-id` em toda requisição.
2. Nas tabelas com `projeto_id`, o **DEFAULT** da coluna lê esse cabeçalho (inserts já nascem no projeto certo)
   e a **política RLS** exige `projeto_id = cabeçalho` **e** que o usuário pertença ao projeto.
3. Para o Postgres saber quem é o usuário, o login passa a emitir também um JWT no formato do Supabase
   (assinado com o JWT secret), com o id do usuário.
4. Rotas de API (`supabaseServer`, service role) ignoram RLS: filtram por projeto explicitamente. São poucas
   (`src/app/api/*`).

**Spike concluído (banco de teste, 25/09/2026): a técnica funciona.** Script em `scripts/spike-projeto-rls.mjs`,
SQL em `banco/spike/`. Verificado: o cabeçalho chega ao Postgres; o `projeto_id` nasce do cabeçalho no insert;
usuário sem vínculo não lê nem grava; cabeçalho falsificado para outro projeto não lê nem grava; usuário em dois
projetos vê um por vez; JWT com segredo errado é rejeitado.

Ajustes de desenho que o teste trouxe:
- O vínculo usuário × projeto é checado por uma função `security definer`, não por subconsulta na policy
  (projetos novos do Supabase podem vir com RLS automático em tabela nova, e a subconsulta então enxerga zero linhas).
- O login precisa emitir um JWT assinado com o **Legacy JWT Secret** do Supabase (claims `role: authenticated`
  e `usuario`). Confirmar que a produção usa esse modelo (chaves HS256); se migrar para chaves assimétricas, o
  emissor do JWT muda.
- Um banco restaurado com `pg_restore --no-privileges` perde os grants padrão (`anon`, `authenticated`,
  `service_role`); é preciso reaplicá-los. Vale para qualquer cópia de teste.
- Plano B (se algum dia a técnica não servir): filtro explícito por projeto em cada chamada.

## 4. Fases

| Fase | O que entrega | Sistema durante a fase |
|---|---|---|
| **0. Preparação** | Backup completo; cópia de teste do banco (projeto Supabase à parte); spike do cabeçalho/RLS; decisões da seção 6 | igual hoje |
| **1. Banco** (pronta e testada no banco de teste: `banco/migracoes/2026-09-25_multi_projeto_fase1.sql`, teste em `banco/testes/fase1_isolamento.sql`) | `projetos`, `usuarios_projetos`, UBX = 1; `projeto_id` nas tabelas raiz (nulo, preenche com 1, NOT NULL, DEFAULT 1 temporário); únicos por projeto; triggers de orçamento e de parcelas com `projeto_id` | igual hoje (tudo é UBX) |
| **2. Aplicação** | Projeto ativo na sessão; seletor no menu; cliente Supabase com cabeçalho; rotas de API filtrando; configs (fluxo, contratos, logo) por projeto; pasta do B2 por projeto | usuários só do UBX; sem mudança visível |
| **3. Administração** | Tela de projetos (criar/desativar); vínculo usuário × projeto × papel; escolha do projeto no login; **cria o PROJETO DEV** (configs, cadastros e usuários de teste) | produção com UBX + DEV |
| **4. Segurança (RLS)** | Políticas nas tabelas raiz e filhas; remove o DEFAULT 1; roteiro de isolamento entre UBX e DEV (usuário de um projeto não lê nem grava no outro) | ativa a proteção real |
| **5. Owner: relatórios e dashboards** | Página só do owner com visão de todos os projetos, filtros por projeto/empresa/período, totais de pedidos, orçamento × consumido, pagamentos e recebimentos | só owner vê |

Ordem importa: as fases 1–2 não mudam nada para o usuário; o risco mora na fase 4 (RLS pode bloquear telas
que hoje funcionam), por isso ela roda antes na cópia de teste, com roteiro de teste de cada tela.

## 5. Tamanho (relativo)

- Fase 0: pequena. Fase 1: média (SQL cuidadoso, triggers). Fase 2: **grande** (sessão, cliente, ~73 arquivos
  revisados, rotas). Fase 3: média. Fase 4: média–grande (políticas + testes). Fase 5: média (depende de quais indicadores o Carlos quer).

## 6. Decisões tomadas

1. **Fornecedores e clientes**: isolados por projeto.
2. **Vínculo**: um usuário pode estar em vários projetos, com **papel diferente em cada um**
   (`usuarios_projetos.papel`).
3. **Owner** vê tudo e é o único com **relatórios e dashboards consolidados** (todos os projetos, com filtros).
   Essa página lê pelo servidor (service role) com checagem de owner, sem depender do projeto ativo.
4. Cada projeto usa **Pagamentos e Recebimentos**.
5. **RLS: em aberto** (ver abaixo).
6. **Logo por projeto. SMTP e e-mail gerais**, sem `projeto_id`.
7. O segundo projeto é o **PROJETO DEV**, para testes.

### Ponto em aberto: RLS

Hoje nenhuma tabela tem RLS: quem tem a chave anônima já lê e grava tudo, em qualquer tela. Com projetos isso
continua igual: o seletor organiza o que cada um vê, mas **não impede** um acesso direto ao banco.

- Enquanto os projetos forem só UBX e DEV (interno), dá para seguir sem RLS.
- **Antes de entrar um projeto de outro cliente/equipe, o RLS precisa estar ativo.**
- Ativar RLS é a parte de maior risco: pode bloquear telas que hoje funcionam. Por isso roda primeiro na cópia
  de teste, com roteiro de teste por tela.

Decisão sugerida: fases 1 a 3 agora; RLS (fase 4) como **portão obrigatório** antes do primeiro projeto real
além do UBX. O PROJETO DEV serve justamente para provar o isolamento antes disso.

## 7. Próximo passo sugerido

Fase 0: você tira o backup e cria o Supabase de teste; eu monto o spike do cabeçalho/RLS. Com o resultado,
fase 1 (SQL em arquivo em `banco/migracoes/`, rodado por você no Supabase). Falta o Carlos definir só o
RLS (portão antes de projeto real) e, para a fase 5, quais indicadores o owner quer ver.
