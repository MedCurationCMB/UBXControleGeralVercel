-- Corrige "infinite recursion detected in policy for relation pedidos_solicitados_fluxo" ao gravar periodos do pedido.
-- Causa: rls_centro de pedidos_solicitados consultava pedidos_solicitados_fluxo, e a rls_projeto do fluxo (WITH CHECK) consulta pedidos_solicitados: ciclo.
-- Solucao: a consulta ao fluxo vai para funcao SECURITY DEFINER (nao passa pelo RLS do fluxo), igual ao criterio anterior (centro do fluxo permitido).
BEGIN;

CREATE OR REPLACE FUNCTION public.app_pedido_tem_fluxo_permitido(p_id bigint, p_receita boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_receita
    THEN EXISTS (SELECT 1 FROM pedidos_solicitados_fluxo_receita f WHERE f.pedido_id = p_id AND f.empresa::text = ANY (app_centros_permitidos()::text[]))
    ELSE EXISTS (SELECT 1 FROM pedidos_solicitados_fluxo f WHERE f.pedido_id = p_id AND f.empresa::text = ANY (app_centros_permitidos()::text[]))
  END
$$;
GRANT EXECUTE ON FUNCTION public.app_pedido_tem_fluxo_permitido(bigint, boolean) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS rls_centro ON public.pedidos_solicitados;
CREATE POLICY rls_centro ON public.pedidos_solicitados AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING ((SELECT public.app_centros_permitidos()) IS NULL OR empresa::text = ANY ((SELECT public.app_centros_permitidos())::text[])
         OR public.app_pedido_tem_fluxo_permitido(id, false))
  WITH CHECK ((SELECT public.app_centros_permitidos()) IS NULL OR empresa::text = ANY ((SELECT public.app_centros_permitidos())::text[]));

DROP POLICY IF EXISTS rls_centro ON public.pedidos_solicitados_receita;
CREATE POLICY rls_centro ON public.pedidos_solicitados_receita AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING ((SELECT public.app_centros_permitidos()) IS NULL OR empresa::text = ANY ((SELECT public.app_centros_permitidos())::text[])
         OR public.app_pedido_tem_fluxo_permitido(id, true))
  WITH CHECK ((SELECT public.app_centros_permitidos()) IS NULL OR empresa::text = ANY ((SELECT public.app_centros_permitidos())::text[]));

COMMIT;
