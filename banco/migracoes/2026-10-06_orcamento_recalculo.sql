-- Prepara a realocacao de centro de custo: corrige o recalculo do consumo do orcamento.
-- 1) Bug: o trigger so atualizava centro/categoria/mes que ainda tinham alguma linha no fluxo (cláusula EXISTS). Quando o ultimo
--    lancamento de um centro era apagado ou movido, o consumo dele ficava inflado (ex.: apagar a unica linha de R$ 3.500 deixava 3.500).
--    Agora toda linha do orcamento e recalculada (LEFT JOIN, sem linhas = 0) e so grava quando o valor muda.
-- 2) Regra: pedido Cancelado passa a devolver o orcamento (antes so "Nao Autorizado" era desconsiderado).
-- Efeito no banco de teste (copia da producao): 4 linhas de orcamento mudam, R$ 4.112,52 devolvidos. Nada mais muda.
-- A execucao final reaplica o recalculo uma vez, para a regra nova valer ja.

CREATE OR REPLACE FUNCTION public.atualizar_valor_pedidos_solicitados() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE controle_orcamento co
    SET valor_pedidos_solicitados = t.total
    FROM (
        SELECT c.id, COALESCE(SUM(psf.valor_referente), 0) AS total
        FROM controle_orcamento c
        LEFT JOIN pedidos_solicitados_fluxo psf
          ON psf.projeto_id = c.projeto_id AND psf.empresa = c.empresa AND psf.categoria = c.categoria
         AND psf.mes = c.mes AND psf.ano = c.ano
         AND psf.status NOT IN ('Não Autorizado', 'Cancelado')
        GROUP BY c.id
    ) t
    WHERE co.id = t.id AND co.valor_pedidos_solicitados IS DISTINCT FROM t.total;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_valor_pedidos_solicitados_receita() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE controle_orcamento_receita co
    SET valor_pedidos_solicitados = t.total
    FROM (
        SELECT c.id, COALESCE(SUM(psf.valor_referente), 0) AS total
        FROM controle_orcamento_receita c
        LEFT JOIN pedidos_solicitados_fluxo_receita psf
          ON psf.projeto_id = c.projeto_id AND psf.empresa = c.empresa AND psf.categoria = c.categoria
         AND psf.mes = c.mes AND psf.ano = c.ano
         AND psf.status NOT IN ('Não Autorizado', 'Cancelado')
        GROUP BY c.id
    ) t
    WHERE co.id = t.id AND co.valor_pedidos_solicitados IS DISTINCT FROM t.total;

    RETURN NULL;
END;
$$;

-- comando de statement dispara mesmo sem linhas afetadas: reaplica o recalculo em todo o orcamento
UPDATE pedidos_solicitados_fluxo SET status = status WHERE false;
UPDATE pedidos_solicitados_fluxo_receita SET status = status WHERE false;
