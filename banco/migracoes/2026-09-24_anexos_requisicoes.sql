-- Anexos das requisições: lista de {id, nome}, onde id é o fileId do Backblaze B2.
ALTER TABLE public.requisicoes         ADD COLUMN IF NOT EXISTS anexos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.requisicoes_receita ADD COLUMN IF NOT EXISTS anexos jsonb NOT NULL DEFAULT '[]'::jsonb;
