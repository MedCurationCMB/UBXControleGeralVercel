-- Centro de Resultado (antigo "empresa"/centro de custo): renomear e copiar categorias.
-- So o rotulo da tela mudou; a tabela/coluna continua "empresas.empresa".
--
-- empresa_renomear(id, novo_nome): so administrador. O UPDATE em empresas propaga sozinho (ON UPDATE CASCADE) para categorias,
--   orcamentos, pedidos, fluxo e requisicoes. realocacao_itens.empresa NAO tem chave estrangeira (e a view realocacao_reservas junta
--   por nome), entao e atualizada aqui no mesmo comando.
-- empresa_copiar_categorias(origem_id, destino_id): copia categorias de pagamentos E de recebimentos. So acrescenta; as que o destino
--   ja tem sao ignoradas. Nada e removido.

-- versao anterior (id integer) nunca funcionou: empresas.id e uuid
DROP FUNCTION IF EXISTS public.empresa_renomear(integer, text);
DROP FUNCTION IF EXISTS public.empresa_copiar_categorias(integer, integer);

CREATE OR REPLACE FUNCTION public.empresa_renomear(p_id uuid, p_novo text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_proj integer; v_antigo text; v_novo text := btrim(coalesce(p_novo, ''));
BEGIN
  IF NOT public.app_admin_projeto() THEN RAISE EXCEPTION 'Somente administrador pode editar o nome do centro de resultado.'; END IF;
  IF v_novo = '' THEN RAISE EXCEPTION 'Informe o nome do centro de resultado.'; END IF;
  SELECT projeto_id, empresa INTO v_proj, v_antigo FROM public.empresas WHERE id = p_id FOR UPDATE;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Centro de resultado não encontrado.'; END IF;
  IF v_novo = v_antigo THEN RETURN v_novo; END IF;
  IF EXISTS (SELECT 1 FROM public.empresas WHERE projeto_id = v_proj AND empresa = v_novo) THEN
    RAISE EXCEPTION 'Já existe um centro de resultado chamado "%".', v_novo;
  END IF;

  UPDATE public.empresas SET empresa = v_novo WHERE id = p_id;
  UPDATE public.realocacao_itens SET empresa = v_novo WHERE projeto_id = v_proj AND empresa = v_antigo;
  RETURN v_novo;
END $$;

CREATE OR REPLACE FUNCTION public.empresa_copiar_categorias(p_origem uuid, p_destino uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o record; d record; v_pag int; v_rec int;
BEGIN
  SELECT projeto_id, empresa INTO o FROM public.empresas WHERE id = p_origem;
  SELECT projeto_id, empresa INTO d FROM public.empresas WHERE id = p_destino;
  IF o.empresa IS NULL OR d.empresa IS NULL OR o.projeto_id <> d.projeto_id THEN RAISE EXCEPTION 'Centro de resultado não encontrado.'; END IF;
  IF p_origem = p_destino THEN RAISE EXCEPTION 'Escolha um centro de resultado diferente para copiar.'; END IF;

  INSERT INTO public.categorias (projeto_id, empresa, categoria)
    SELECT projeto_id, d.empresa, categoria FROM public.categorias WHERE projeto_id = o.projeto_id AND empresa = o.empresa
    ON CONFLICT (projeto_id, empresa, categoria) DO NOTHING;
  GET DIAGNOSTICS v_pag = ROW_COUNT;
  INSERT INTO public.categorias_receita (projeto_id, empresa, categoria)
    SELECT projeto_id, d.empresa, categoria FROM public.categorias_receita WHERE projeto_id = o.projeto_id AND empresa = o.empresa
    ON CONFLICT (projeto_id, empresa, categoria) DO NOTHING;
  GET DIAGNOSTICS v_rec = ROW_COUNT;
  RETURN jsonb_build_object('pagamentos', v_pag, 'recebimentos', v_rec);
END $$;

GRANT EXECUTE ON FUNCTION public.empresa_renomear(uuid, text), public.empresa_copiar_categorias(uuid, uuid) TO anon, authenticated;
