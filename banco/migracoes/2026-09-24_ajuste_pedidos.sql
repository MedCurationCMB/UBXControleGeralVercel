-- Quem solicitou o pedido (só ele ou um admin ajusta/reenvia) e marca de "reenviado após ajuste".
ALTER TABLE public.pedidos_solicitados ADD COLUMN IF NOT EXISTS usuario_solicitante text;
ALTER TABLE public.pedidos_solicitados ADD COLUMN IF NOT EXISTS ajuste_reenviado boolean NOT NULL DEFAULT false;
