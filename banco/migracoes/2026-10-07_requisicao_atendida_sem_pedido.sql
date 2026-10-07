-- Requisicao "Atendida sem pedido": registro de que a requisicao foi atendida sem necessidade de compra/venda ou contratacao.
-- Ela nao pode gerar pedido nem pagamento/recebimento. Campos proprios (o status e o enum compartilhado com os pedidos, nao e alterado).
ALTER TABLE public.requisicoes
  ADD COLUMN atendida_sem_pedido boolean NOT NULL DEFAULT false,
  ADD COLUMN atendida_data date,
  ADD COLUMN atendida_usuario text,
  ADD COLUMN atendida_obs text;
ALTER TABLE public.requisicoes_receita
  ADD COLUMN atendida_sem_pedido boolean NOT NULL DEFAULT false,
  ADD COLUMN atendida_data date,
  ADD COLUMN atendida_usuario text,
  ADD COLUMN atendida_obs text;

-- Requisicao so e marcada como atendida se estiver autorizada e ainda sem pedido vinculado (qualquer pedido, inclusive cancelado).
CREATE FUNCTION public.requisicao_atendida_valida() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tem_pedido boolean;
BEGIN
  IF NEW.atendida_sem_pedido THEN
    IF NEW.status::text <> 'Autorizado' THEN
      RAISE EXCEPTION 'Somente requisição autorizada pode ser marcada como atendida sem pedido.';
    END IF;
    IF TG_TABLE_NAME = 'requisicoes' THEN
      SELECT EXISTS (SELECT 1 FROM public.pedidos_solicitados WHERE requisicao_id = NEW.id) INTO tem_pedido;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public.pedidos_solicitados_receita WHERE requisicao_id = NEW.id) INTO tem_pedido;
    END IF;
    IF tem_pedido THEN
      RAISE EXCEPTION 'A requisição já tem pedido vinculado.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER requisicao_atendida_valida BEFORE INSERT OR UPDATE ON public.requisicoes
  FOR EACH ROW EXECUTE FUNCTION public.requisicao_atendida_valida();
CREATE TRIGGER requisicao_atendida_valida BEFORE INSERT OR UPDATE ON public.requisicoes_receita
  FOR EACH ROW EXECUTE FUNCTION public.requisicao_atendida_valida();

-- Pedido nao pode ser ligado a requisicao atendida sem pedido.
CREATE FUNCTION public.pedido_requisicao_nao_atendida() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE atendida boolean;
BEGIN
  IF NEW.requisicao_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'pedidos_solicitados' THEN
    SELECT atendida_sem_pedido INTO atendida FROM public.requisicoes WHERE id = NEW.requisicao_id;
  ELSE
    SELECT atendida_sem_pedido INTO atendida FROM public.requisicoes_receita WHERE id = NEW.requisicao_id;
  END IF;
  IF atendida THEN
    RAISE EXCEPTION 'A requisição #% foi atendida sem pedido e não pode gerar pedido.', NEW.requisicao_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pedido_requisicao_nao_atendida BEFORE INSERT OR UPDATE OF requisicao_id ON public.pedidos_solicitados
  FOR EACH ROW EXECUTE FUNCTION public.pedido_requisicao_nao_atendida();
CREATE TRIGGER pedido_requisicao_nao_atendida BEFORE INSERT OR UPDATE OF requisicao_id ON public.pedidos_solicitados_receita
  FOR EACH ROW EXECUTE FUNCTION public.pedido_requisicao_nao_atendida();
