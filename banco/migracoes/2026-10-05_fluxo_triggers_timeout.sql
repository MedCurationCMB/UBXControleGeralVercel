-- Timeout ao gravar pedido com muitas linhas no fluxo ("canceling statement due to statement timeout").
-- Causa: cada linha inserida em pedidos_solicitados_fluxo(_receita) disparava 2 triggers de LINHA que recalculavam o orcamento
-- (um deles percorrendo TODO o controle_orcamento), alem do trigger de COMANDO, que ja recalcula tudo no fim e sobrescreve o resultado
-- dos dois. 33 linhas = 67 recalculos, ~10s no banco de teste (a API corta em 8s).
-- Solucao: remove os 2 triggers de linha (resultado final identico, conferido em insert/update de status/delete) e indexa o fluxo
-- pela chave usada no recalculo, que antes varria a tabela inteira.

DROP TRIGGER IF EXISTS trigger_atualizar_valor ON public.pedidos_solicitados_fluxo;
DROP TRIGGER IF EXISTS update_pedidos_solicitados ON public.pedidos_solicitados_fluxo;
DROP TRIGGER IF EXISTS trigger_atualizar_valor_receita ON public.pedidos_solicitados_fluxo_receita;
DROP TRIGGER IF EXISTS update_pedidos_solicitados_receita ON public.pedidos_solicitados_fluxo_receita;

CREATE INDEX IF NOT EXISTS idx_pedidos_solicitados_fluxo_orcamento
  ON public.pedidos_solicitados_fluxo (projeto_id, empresa, categoria, mes, ano);
CREATE INDEX IF NOT EXISTS idx_pedidos_solicitados_fluxo_receita_orcamento
  ON public.pedidos_solicitados_fluxo_receita (projeto_id, empresa, categoria, mes, ano);
