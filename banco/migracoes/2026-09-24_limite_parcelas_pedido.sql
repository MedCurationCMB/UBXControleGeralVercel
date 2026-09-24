-- Impede que a soma das parcelas (valor_pagar) de um pedido ultrapasse o valor autorizado (valor_pedido).
-- Vale para Pagamentos (controle_pagamentos) e Recebimentos (controle_recebimento).
-- Vale para todos os fluxos, exceto o Fluxo 3 (conta lançada direto, sem etapa de pedido).
-- Só olha valor_pagar: juros/multa em valor_pagamento continuam permitidos.
-- Pode ser executado de novo (idempotente).

CREATE OR REPLACE FUNCTION public.validar_limite_parcelas_pedido() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_pedido numeric;
  v_soma   numeric;
BEGIN
  IF NEW.pedido_id IS NULL OR NEW.valor_pagar IS NULL THEN
    RETURN NEW;
  END IF;

  IF (SELECT valor FROM config WHERE chave = 'fluxo_sistema' LIMIT 1) = '3' THEN
    RETURN NEW;
  END IF;

  SELECT valor_pedido INTO v_pedido FROM pedidos_solicitados WHERE id = NEW.pedido_id;
  IF v_pedido IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(valor_pagar), 0) INTO v_soma
    FROM controle_pagamentos
   WHERE pedido_id = NEW.pedido_id
     AND id IS DISTINCT FROM NEW.id;

  IF v_soma + NEW.valor_pagar > v_pedido THEN
    RAISE EXCEPTION 'Soma das parcelas (R$ %) excede o valor autorizado do pedido (R$ %).',
      to_char(v_soma + NEW.valor_pagar, 'FM999G999G990D00'), to_char(v_pedido, 'FM999G999G990D00');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validar_limite_parcelas ON public.controle_pagamentos;
CREATE TRIGGER trigger_validar_limite_parcelas
  BEFORE INSERT OR UPDATE OF valor_pagar, pedido_id ON public.controle_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_limite_parcelas_pedido();


CREATE OR REPLACE FUNCTION public.validar_limite_parcelas_pedido_receita() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_pedido numeric;
  v_soma   numeric;
BEGIN
  IF NEW.pedido_id IS NULL OR NEW.valor_pagar IS NULL THEN
    RETURN NEW;
  END IF;

  IF (SELECT valor FROM config WHERE chave = 'fluxo_sistema_receita' LIMIT 1) = '3' THEN
    RETURN NEW;
  END IF;

  SELECT valor_pedido INTO v_pedido FROM pedidos_solicitados_receita WHERE id = NEW.pedido_id;
  IF v_pedido IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(valor_pagar), 0) INTO v_soma
    FROM controle_recebimento
   WHERE pedido_id = NEW.pedido_id
     AND id IS DISTINCT FROM NEW.id;

  IF v_soma + NEW.valor_pagar > v_pedido THEN
    RAISE EXCEPTION 'Soma das parcelas (R$ %) excede o valor autorizado do pedido (R$ %).',
      to_char(v_soma + NEW.valor_pagar, 'FM999G999G990D00'), to_char(v_pedido, 'FM999G999G990D00');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validar_limite_parcelas_receita ON public.controle_recebimento;
CREATE TRIGGER trigger_validar_limite_parcelas_receita
  BEFORE INSERT OR UPDATE OF valor_pagar, pedido_id ON public.controle_recebimento
  FOR EACH ROW EXECUTE FUNCTION public.validar_limite_parcelas_pedido_receita();
