-- Realocacao de centro de custo, etapa 3: funcoes. Tudo roda numa transacao so (uma chamada = tudo ou nada). Pagamentos e recebimentos
-- usam as mesmas funcoes (parametro p_modulo).
--
-- realocacao_solicitar(modulo, pedido, modo, destinos, usuario, observacao, simular)
--   modo 'percentual': destinos = [{"empresa":"A","percentual":60}, ...]   (soma 100; a mesma proporcao vale em cada mes)
--   modo 'valor':      destinos = [{"empresa":"A","mes":10,"ano":2026,"valor":40000}, ...]  (por mes; em cada mes a soma fecha com o pedido)
--                      pedido sem linhas por mes (Fluxo 3): [{"empresa":"A","valor":40000}] (so o total)
--   A categoria e mantida. Retorna jsonb: ok, problemas (bloqueiam), avisos, antes, depois, realocacao_id, direta.
--   simular=true so calcula (previa para a tela), sem gravar.
-- Regra do fluxo configurado (igual a um pedido novo): 1 e 4 bloqueiam sem saldo/orcamento; 2 e 5 so avisam; em todos o saldo fica
--   reservado ate decidir e vai para autorizacao. Fluxo 3 (e pedido sem linhas por mes) aplica direto, sem autorizacao.
-- realocacao_autorizar / realocacao_recusar: so administrador. Autorizar troca as linhas do fluxo do pedido e grava o historico.

ALTER TABLE public.realocacoes ADD COLUMN IF NOT EXISTS motivo_recusa text;

-- tabelas de cada modulo
CREATE OR REPLACE FUNCTION public.realocacao_nomes(p_modulo text)
RETURNS TABLE (pedido text, fluxo text, parte text, benef text, categorias text, orcamento text)
LANGUAGE sql IMMUTABLE AS $$
  SELECT v.pedido, v.fluxo, v.parte, v.benef, v.categorias, v.orcamento
  FROM (VALUES
    ('pagamentos',   'pedidos_solicitados',         'pedidos_solicitados_fluxo',         'fornecedor', 'fornecedor_beneficiario', 'categorias',         'controle_orcamento'),
    ('recebimentos', 'pedidos_solicitados_receita', 'pedidos_solicitados_fluxo_receita', 'cliente',    'cliente_beneficiario',    'categorias_receita', 'controle_orcamento_receita')
  ) v(modulo, pedido, fluxo, parte, benef, categorias, orcamento)
  WHERE v.modulo = p_modulo
$$;

-- Fluxo do projeto, com o mesmo fallback das telas de Fazer Pedido (pagamentos: controla_orcamento legado -> 1/2; recebimentos: 1)
CREATE OR REPLACE FUNCTION public.realocacao_fluxo_sistema(p_modulo text, p_projeto integer) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT nullif(valor, '') FROM config WHERE projeto_id = p_projeto
        AND chave = CASE p_modulo WHEN 'pagamentos' THEN 'fluxo_sistema' ELSE 'fluxo_sistema_receita' END),
    CASE p_modulo WHEN 'pagamentos'
      THEN (SELECT CASE valor WHEN 'true' THEN '1' ELSE '2' END FROM config WHERE projeto_id = p_projeto AND chave = 'controla_orcamento')
    END,
    CASE p_modulo WHEN 'pagamentos' THEN '2' ELSE '1' END)
$$;

-- Calcula a distribuicao e valida (nao grava nada). Quem chama trava o pedido antes.
CREATE OR REPLACE FUNCTION public.realocacao_planejar(p_modulo text, p_pedido_id bigint, p_modo text, p_destinos jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  n record; ped record;
  v_fluxo text; v_total int; v_aut int; v_periodo boolean; v_direta boolean; v_controla boolean;
  v_antes jsonb; v_depois jsonb; v_orc jsonb; v_cats jsonb; v_extra jsonb;
  v_problemas jsonb := '[]'; v_avisos jsonb := '[]';
  v_soma numeric; v_ultima bigint; v_empresas text[];
BEGIN
  SELECT * INTO n FROM public.realocacao_nomes(p_modulo);
  IF n.pedido IS NULL THEN RAISE EXCEPTION 'Módulo inválido: %', p_modulo; END IF;
  IF p_modo NOT IN ('percentual', 'valor') THEN RAISE EXCEPTION 'Modo inválido: %', p_modo; END IF;
  IF jsonb_typeof(p_destinos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_destinos) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um centro de custo de destino.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_destinos) x WHERE coalesce(btrim(x->>'empresa'), '') = '') THEN
    RAISE EXCEPTION 'Todo destino precisa de um centro de custo.';
  END IF;

  EXECUTE format('SELECT id, projeto_id, empresa, categoria, valor_pedido, status::text AS status, coalesce(cancelado, false) AS cancelado FROM public.%I WHERE id = $1', n.pedido)
    INTO ped USING p_pedido_id;
  IF ped.id IS NULL THEN RAISE EXCEPTION 'Pedido % não encontrado.', p_pedido_id; END IF;
  IF ped.cancelado OR ped.status <> 'Autorizado' THEN
    RAISE EXCEPTION 'Só é possível realocar pedido autorizado (situação atual: %).', CASE WHEN ped.cancelado THEN 'Cancelado' ELSE ped.status END;
  END IF;
  IF EXISTS (SELECT 1 FROM public.realocacoes WHERE modulo = p_modulo AND pedido_id = p_pedido_id AND status = 'Aguardando Autorização') THEN
    RAISE EXCEPTION 'Já existe uma realocação aguardando autorização para este pedido.';
  END IF;

  EXECUTE format('SELECT count(*), count(*) FILTER (WHERE status::text = ''Autorizado'') FROM public.%I WHERE pedido_id = $1', n.fluxo)
    INTO v_total, v_aut USING p_pedido_id;
  IF v_total > v_aut THEN RAISE EXCEPTION 'O fluxo do pedido tem linhas que não estão autorizadas; não é possível realocar.'; END IF;
  v_periodo := v_total > 0;
  v_fluxo := public.realocacao_fluxo_sistema(p_modulo, ped.projeto_id);
  v_direta := v_fluxo = '3' OR NOT v_periodo;
  v_controla := v_fluxo IN ('1', '4') AND NOT v_direta;

  -- distribuicao atual. Com linhas por mes: as proprias linhas. Sem linhas (Fluxo 3): a ultima realocacao aplicada, ou 100% no centro do pedido
  -- (mes/ano 0 = "so o total")
  IF v_periodo THEN
    EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''empresa'', empresa, ''categoria'', categoria, ''mes'', mes, ''ano'', ano, ''beneficiario'', %I, ''valor'', valor_referente) ORDER BY ano, mes, id), ''[]'') FROM public.%I WHERE pedido_id = $1', n.benef, n.fluxo)
      INTO v_antes USING p_pedido_id;
  ELSE
    SELECT max(id) INTO v_ultima FROM public.realocacoes WHERE modulo = p_modulo AND pedido_id = p_pedido_id AND status = 'Autorizada';
    SELECT coalesce(jsonb_agg(jsonb_build_object('empresa', i.empresa, 'categoria', i.categoria, 'mes', 0, 'ano', 0, 'beneficiario', NULL, 'valor', i.valor) ORDER BY i.id), '[]')
      INTO v_antes FROM public.realocacao_itens i WHERE i.realocacao_id = v_ultima AND i.lado = 'depois';
    IF jsonb_array_length(v_antes) = 0 THEN
      v_antes := jsonb_build_array(jsonb_build_object('empresa', ped.empresa, 'categoria', ped.categoria, 'mes', 0, 'ano', 0, 'beneficiario', NULL, 'valor', ped.valor_pedido));
    END IF;
  END IF;

  IF p_modo = 'percentual' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_destinos) x WHERE coalesce((x->>'percentual')::numeric, 0) <= 0) THEN
      RAISE EXCEPTION 'Todo percentual deve ser maior que zero.';
    END IF;
    SELECT sum((x->>'percentual')::numeric) INTO v_soma FROM jsonb_array_elements(p_destinos) x;
    IF v_soma <> 100 THEN RAISE EXCEPTION 'A soma dos percentuais deve ser 100%% (atual: %).', v_soma; END IF;
    IF (SELECT count(DISTINCT x->>'empresa') FROM jsonb_array_elements(p_destinos) x) <> jsonb_array_length(p_destinos) THEN
      RAISE EXCEPTION 'Centro de custo repetido na distribuição.';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_destinos) x WHERE coalesce((x->>'valor')::numeric, -1) < 0) THEN
      RAISE EXCEPTION 'Todo valor deve ser informado e não pode ser negativo.';
    END IF;
    IF (SELECT count(DISTINCT concat_ws('|', x->>'empresa', x->>'mes', x->>'ano')) FROM jsonb_array_elements(p_destinos) x) <> jsonb_array_length(p_destinos) THEN
      RAISE EXCEPTION 'Centro de custo repetido no mesmo mês.';
    END IF;
    -- em cada mes a soma distribuida tem que fechar exatamente com o valor do pedido naquele mes
    SELECT jsonb_agg(CASE WHEN mes = 0 THEN 'total' ELSE lpad(mes::text, 2, '0') || '/' || ano END ORDER BY ano, mes) INTO v_extra
    FROM (
      SELECT coalesce(p.mes, d.mes) AS mes, coalesce(p.ano, d.ano) AS ano
      FROM (SELECT (r->>'mes')::int AS mes, (r->>'ano')::int AS ano, sum((r->>'valor')::numeric) AS total FROM jsonb_array_elements(v_antes) r GROUP BY 1, 2) p
      FULL JOIN (SELECT coalesce((x->>'mes')::int, 0) AS mes, coalesce((x->>'ano')::int, 0) AS ano, sum((x->>'valor')::numeric) AS total FROM jsonb_array_elements(p_destinos) x GROUP BY 1, 2) d
        ON p.mes = d.mes AND p.ano = d.ano
      WHERE p.total IS DISTINCT FROM d.total
    ) z;
    IF v_extra IS NOT NULL THEN
      RAISE EXCEPTION 'Os valores distribuídos não fecham com o valor do pedido em: %.', (SELECT string_agg(value, ', ') FROM jsonb_array_elements_text(v_extra));
    END IF;
  END IF;

  -- Alvo por mes e centro (percentual: arredondamento acumulado, o ultimo centro absorve o centavo). Depois reparte cada centro entre as
  -- linhas do mes (beneficiarios) em cascata, o que mantem exatos tanto o total de cada centro quanto o de cada beneficiario.
  WITH a AS (
    SELECT (r->>'empresa') AS empresa, (r->>'categoria') AS categoria, (r->>'mes')::int AS mes, (r->>'ano')::int AS ano,
           r->>'beneficiario' AS benef, (r->>'valor')::numeric AS valor, rord
    FROM jsonb_array_elements(v_antes) WITH ORDINALITY t(r, rord)
  ), per AS (
    SELECT mes, ano, sum(valor) AS total FROM a GROUP BY mes, ano
  ), d AS (
    SELECT x->>'empresa' AS empresa, (x->>'percentual')::numeric AS pct, cord
    FROM jsonb_array_elements(p_destinos) WITH ORDINALITY t(x, cord)
  ), dc AS (
    SELECT d.*, sum(pct) OVER (ORDER BY cord) AS cum FROM d
  ), alvo AS (
    SELECT p.mes, p.ano, dc.empresa, dc.cord,
           round(p.total * dc.cum / 100, 2)
             - round(p.total * coalesce(lag(dc.cum) OVER (PARTITION BY p.mes, p.ano ORDER BY dc.cord), 0) / 100, 2) AS valor
    FROM per p CROSS JOIN dc WHERE p_modo = 'percentual'
    UNION ALL
    SELECT coalesce((x->>'mes')::int, 0), coalesce((x->>'ano')::int, 0), x->>'empresa', cord, (x->>'valor')::numeric
    FROM jsonb_array_elements(p_destinos) WITH ORDINALITY t(x, cord) WHERE p_modo = 'valor'
  ), ar AS (
    SELECT a.*, sum(valor) OVER (PARTITION BY mes, ano ORDER BY rord) AS hi FROM a
  ), cc AS (
    SELECT alvo.*, sum(valor) OVER (PARTITION BY mes, ano ORDER BY cord) AS chi FROM alvo
  ), dep AS (
    SELECT ar.categoria, cc.empresa, ar.mes, ar.ano, ar.benef, ar.rord, cc.cord,
           greatest(0, least(ar.hi, cc.chi) - greatest(ar.hi - ar.valor, cc.chi - cc.valor)) AS valor
    FROM ar JOIN cc ON cc.mes = ar.mes AND cc.ano = ar.ano
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('empresa', empresa, 'categoria', categoria, 'mes', mes, 'ano', ano, 'beneficiario', benef, 'valor', valor)
                            ORDER BY ano, mes, rord, cord), '[]')
    INTO v_depois FROM dep WHERE valor > 0;

  IF NOT EXISTS (
    SELECT 1 FROM (SELECT x->>'empresa' AS empresa, x->>'categoria' AS categoria, (x->>'mes')::int AS mes, (x->>'ano')::int AS ano, sum((x->>'valor')::numeric) AS v
                     FROM jsonb_array_elements(v_depois) x GROUP BY 1, 2, 3, 4) d
    FULL JOIN (SELECT x->>'empresa' AS empresa, x->>'categoria' AS categoria, (x->>'mes')::int AS mes, (x->>'ano')::int AS ano, sum((x->>'valor')::numeric) AS v
                 FROM jsonb_array_elements(v_antes) x GROUP BY 1, 2, 3, 4) a
      ON d.empresa = a.empresa AND d.categoria = a.categoria AND d.mes = a.mes AND d.ano = a.ano
    WHERE d.v IS DISTINCT FROM a.v
  ) THEN RAISE EXCEPTION 'A distribuição proposta é igual à atual.'; END IF;

  v_empresas := ARRAY(SELECT DISTINCT x->>'empresa' FROM jsonb_array_elements(v_depois) x);

  -- a categoria e mantida: o centro de destino precisa te-la (vale para todos os fluxos)
  EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''empresa'', empresa, ''categoria'', categoria)), ''[]'') FROM public.%I WHERE projeto_id = $1 AND empresa = ANY($2)', n.categorias)
    INTO v_cats USING ped.projeto_id, v_empresas;
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', 'sem_categoria', 'empresa', d.empresa, 'categoria', d.categoria,
           'mensagem', format('O centro "%s" não tem a categoria "%s".', d.empresa, d.categoria)) ORDER BY d.empresa), '[]')
    INTO v_problemas
  FROM (SELECT DISTINCT x->>'empresa' AS empresa, x->>'categoria' AS categoria FROM jsonb_array_elements(v_depois) x) d
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cats) c WHERE c->>'empresa' = d.empresa AND c->>'categoria' = d.categoria);

  -- saldo: so o que ENTRA a mais em cada centro/categoria/mes (depois - antes) precisa caber. Fluxos 1/4 bloqueiam; 2/5 so avisam; direta nao checa.
  IF NOT v_direta THEN
    EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''empresa'', empresa, ''categoria'', categoria, ''mes'', mes, ''ano'', ano, ''orcamento'', valor_orcamento, ''consumo'', valor_pedidos_solicitados)), ''[]'') FROM public.%I WHERE projeto_id = $1 AND empresa = ANY($2)', n.orcamento)
      INTO v_orc USING ped.projeto_id, v_empresas;
    SELECT coalesce(jsonb_agg(z.item ORDER BY z.ano, z.mes, z.empresa), '[]') INTO v_extra
    FROM (
      SELECT k.empresa, k.ano, k.mes,
        CASE WHEN o.orcamento IS NULL THEN
          jsonb_build_object('tipo', 'sem_orcamento', 'empresa', k.empresa, 'categoria', k.categoria, 'mes', k.mes, 'ano', k.ano, 'necessario', k.delta,
            'mensagem', format('Centro "%s", categoria "%s", %s/%s: não existe orçamento cadastrado.', k.empresa, k.categoria, lpad(k.mes::text, 2, '0'), k.ano))
        ELSE
          jsonb_build_object('tipo', 'sem_saldo', 'empresa', k.empresa, 'categoria', k.categoria, 'mes', k.mes, 'ano', k.ano,
            'disponivel', o.orcamento - o.consumo, 'necessario', k.delta, 'falta', k.delta - (o.orcamento - o.consumo),
            'mensagem', format('Centro "%s", categoria "%s", %s/%s: disponível R$ %s, necessário R$ %s, faltam R$ %s.', k.empresa, k.categoria, lpad(k.mes::text, 2, '0'), k.ano,
              replace(to_char(o.orcamento - o.consumo, 'FM999999990.00'), '.', ','), replace(to_char(k.delta, 'FM999999990.00'), '.', ','),
              replace(to_char(k.delta - (o.orcamento - o.consumo), 'FM999999990.00'), '.', ',')))
        END AS item
      FROM (
        SELECT coalesce(d.empresa, a.empresa) AS empresa, coalesce(d.categoria, a.categoria) AS categoria, coalesce(d.mes, a.mes) AS mes, coalesce(d.ano, a.ano) AS ano,
               coalesce(d.v, 0) - coalesce(a.v, 0) AS delta
        FROM (SELECT x->>'empresa' AS empresa, x->>'categoria' AS categoria, (x->>'mes')::int AS mes, (x->>'ano')::int AS ano, sum((x->>'valor')::numeric) AS v
                FROM jsonb_array_elements(v_depois) x GROUP BY 1, 2, 3, 4) d
        FULL JOIN (SELECT x->>'empresa' AS empresa, x->>'categoria' AS categoria, (x->>'mes')::int AS mes, (x->>'ano')::int AS ano, sum((x->>'valor')::numeric) AS v
                     FROM jsonb_array_elements(v_antes) x GROUP BY 1, 2, 3, 4) a
          ON d.empresa = a.empresa AND d.categoria = a.categoria AND d.mes = a.mes AND d.ano = a.ano
      ) k
      LEFT JOIN (SELECT o->>'empresa' AS empresa, o->>'categoria' AS categoria, (o->>'mes')::int AS mes, (o->>'ano')::int AS ano,
                        (o->>'orcamento')::numeric AS orcamento, (o->>'consumo')::numeric AS consumo FROM jsonb_array_elements(v_orc) o) o
        ON o.empresa = k.empresa AND o.categoria = k.categoria AND o.mes = k.mes AND o.ano = k.ano
      WHERE k.delta > 0 AND (o.orcamento IS NULL OR k.delta > o.orcamento - o.consumo)
    ) z;
    IF v_controla THEN v_problemas := v_problemas || v_extra; ELSE v_avisos := v_extra; END IF;
  END IF;

  RETURN jsonb_build_object('projeto_id', ped.projeto_id, 'fluxo', v_fluxo, 'direta', v_direta, 'periodo', v_periodo,
                            'antes', v_antes, 'depois', v_depois, 'problemas', v_problemas, 'avisos', v_avisos);
END;
$$;

-- Troca as linhas do fluxo pelas do 'depois' (ou, sem linhas por mes, so registra) e ajusta o centro do cabecalho do pedido para o de maior valor.
CREATE OR REPLACE FUNCTION public.realocacao_aplicar(p_id bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; n record; ped record; v_principal text;
BEGIN
  SELECT * INTO r FROM public.realocacoes WHERE id = p_id;
  SELECT * INTO n FROM public.realocacao_nomes(r.modulo);
  EXECUTE format('SELECT projeto_id, pedido_status, %I AS parte FROM public.%I WHERE id = $1', n.parte, n.pedido) INTO ped USING r.pedido_id;

  IF EXISTS (SELECT 1 FROM public.realocacao_itens WHERE realocacao_id = p_id AND lado = 'depois' AND mes IS NOT NULL) THEN
    EXECUTE format('DELETE FROM public.%I WHERE pedido_id = $1', n.fluxo) USING r.pedido_id;
    EXECUTE format('INSERT INTO public.%I (pedido_id, projeto_id, empresa, categoria, %I, %I, mes, ano, valor_referente, status, pedido_status) '
                   'SELECT $1, $2, i.empresa, i.categoria, $3, i.beneficiario, i.mes, i.ano, i.valor, ''Autorizado'', $4 '
                   'FROM public.realocacao_itens i WHERE i.realocacao_id = $5 AND i.lado = ''depois'' ORDER BY i.id', n.fluxo, n.parte, n.benef)
      USING r.pedido_id, ped.projeto_id, ped.parte, ped.pedido_status, p_id;
  END IF;

  SELECT empresa INTO v_principal FROM public.realocacao_itens WHERE realocacao_id = p_id AND lado = 'depois'
   GROUP BY empresa ORDER BY sum(valor) DESC, empresa LIMIT 1;
  EXECUTE format('UPDATE public.%I SET empresa = $1 WHERE id = $2', n.pedido) USING v_principal, r.pedido_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.realocacao_solicitar(p_modulo text, p_pedido_id bigint, p_modo text, p_destinos jsonb, p_usuario text,
                                                       p_observacao text DEFAULT NULL, p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE n record; plano jsonb; v_id bigint; v_bloqueado boolean; v_direta boolean;
BEGIN
  IF coalesce(btrim(p_usuario), '') = '' THEN RAISE EXCEPTION 'Usuário não informado.'; END IF;
  SELECT * INTO n FROM public.realocacao_nomes(p_modulo);
  IF n.pedido IS NULL THEN RAISE EXCEPTION 'Módulo inválido: %', p_modulo; END IF;
  -- trava o pedido: duas solicitacoes ao mesmo tempo nao passam
  EXECUTE format('SELECT 1 FROM public.%I WHERE id = $1 FOR UPDATE', n.pedido) USING p_pedido_id;

  plano := public.realocacao_planejar(p_modulo, p_pedido_id, p_modo, p_destinos);
  v_bloqueado := jsonb_array_length(plano->'problemas') > 0;
  v_direta := (plano->>'direta')::boolean;
  IF p_simular OR v_bloqueado THEN
    RETURN plano || jsonb_build_object('ok', NOT v_bloqueado, 'simulado', p_simular);
  END IF;

  INSERT INTO public.realocacoes (projeto_id, modulo, pedido_id, status, modo, solicitante, observacao, data_decisao)
  VALUES ((plano->>'projeto_id')::int, p_modulo, p_pedido_id,
          CASE WHEN v_direta THEN 'Autorizada' ELSE 'Aguardando Autorização' END, p_modo, p_usuario, p_observacao,
          CASE WHEN v_direta THEN now() END)
  RETURNING id INTO v_id;

  INSERT INTO public.realocacao_itens (realocacao_id, projeto_id, lado, empresa, categoria, mes, ano, beneficiario, valor)
  SELECT v_id, (plano->>'projeto_id')::int, l.lado, x->>'empresa', x->>'categoria', nullif((x->>'mes')::int, 0), nullif((x->>'ano')::int, 0),
         x->>'beneficiario', (x->>'valor')::numeric
  FROM (VALUES ('antes', plano->'antes'), ('depois', plano->'depois')) l(lado, arr), jsonb_array_elements(l.arr) x;

  IF v_direta THEN PERFORM public.realocacao_aplicar(v_id); END IF;
  RETURN plano || jsonb_build_object('ok', true, 'realocacao_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.realocacao_autorizar(p_id bigint, p_usuario text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r record; n record; ped record; v_atual text; v_snap text;
BEGIN
  IF NOT public.app_admin_projeto() THEN RAISE EXCEPTION 'Somente administrador pode autorizar uma realocação.'; END IF;
  SELECT * INTO r FROM public.realocacoes WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Realocação não encontrada.'; END IF;
  IF r.status <> 'Aguardando Autorização' THEN RAISE EXCEPTION 'Esta realocação já foi decidida (%).', r.status; END IF;
  SELECT * INTO n FROM public.realocacao_nomes(r.modulo);
  EXECUTE format('SELECT status::text AS status, coalesce(cancelado, false) AS cancelado FROM public.%I WHERE id = $1 FOR UPDATE', n.pedido) INTO ped USING r.pedido_id;
  IF ped.cancelado OR ped.status <> 'Autorizado' THEN RAISE EXCEPTION 'O pedido não está mais autorizado; recuse esta realocação.'; END IF;

  -- o fluxo do pedido tem que ser o mesmo da solicitacao (o saldo reservado foi calculado em cima dele)
  EXECUTE format('SELECT coalesce(string_agg(concat_ws(''|'', empresa, categoria, mes, ano, coalesce(%I, ''''), valor_referente::numeric(15,2)), '';'' ORDER BY empresa, categoria, mes, ano, coalesce(%I, ''''), valor_referente), '''') FROM public.%I WHERE pedido_id = $1', n.benef, n.benef, n.fluxo)
    INTO v_atual USING r.pedido_id;
  SELECT coalesce(string_agg(concat_ws('|', empresa, categoria, mes, ano, coalesce(beneficiario, ''), valor::numeric(15,2)), ';' ORDER BY empresa, categoria, mes, ano, coalesce(beneficiario, ''), valor), '')
    INTO v_snap FROM public.realocacao_itens WHERE realocacao_id = p_id AND lado = 'antes';
  IF v_atual <> v_snap THEN RAISE EXCEPTION 'O pedido mudou desde a solicitação; recuse esta realocação e solicite de novo.'; END IF;

  PERFORM public.realocacao_aplicar(p_id);
  UPDATE public.realocacoes SET status = 'Autorizada', autorizador = p_usuario, data_decisao = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.realocacao_recusar(p_id bigint, p_usuario text, p_motivo text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  IF NOT public.app_admin_projeto() THEN RAISE EXCEPTION 'Somente administrador pode recusar uma realocação.'; END IF;
  SELECT * INTO r FROM public.realocacoes WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Realocação não encontrada.'; END IF;
  IF r.status <> 'Aguardando Autorização' THEN RAISE EXCEPTION 'Esta realocação já foi decidida (%).', r.status; END IF;
  UPDATE public.realocacoes SET status = 'Recusada', autorizador = p_usuario, data_decisao = now(), motivo_recusa = p_motivo WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
