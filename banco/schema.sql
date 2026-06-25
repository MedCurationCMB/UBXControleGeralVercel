

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."status_cadastro_enum" AS ENUM (
    'Aguardando Autorização',
    'Autorizado',
    'Não Autorizado'
);


ALTER TYPE "public"."status_cadastro_enum" OWNER TO "postgres";


CREATE TYPE "public"."status_kanban" AS ENUM (
    'A Fazer',
    'Fazendo',
    'Feito'
);


ALTER TYPE "public"."status_kanban" OWNER TO "postgres";


CREATE TYPE "public"."status_pedido" AS ENUM (
    'Autorizado',
    'Não Autorizado',
    'Aguardando Autorização'
);


ALTER TYPE "public"."status_pedido" OWNER TO "postgres";


CREATE TYPE "public"."tipo_hierarquia" AS ENUM (
    'user',
    'admin',
    'owner'
);


ALTER TYPE "public"."tipo_hierarquia" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualiza_controle_orcamento"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   INSERT INTO controle_orcamento (empresa, categoria, mes, ano, valor_orcamento)
   VALUES (NEW.empresa, NEW.categoria, NEW.mes, NEW.ano, NEW.valor_orcamento)
   ON CONFLICT (empresa, categoria, mes, ano) 
   DO UPDATE SET valor_orcamento = EXCLUDED.valor_orcamento;
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."atualiza_controle_orcamento"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualiza_controle_orcamento_receita"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   INSERT INTO controle_orcamento_receita (empresa, categoria, mes, ano, valor_orcamento)
   VALUES (NEW.empresa, NEW.categoria, NEW.mes, NEW.ano, NEW.valor_orcamento)
   ON CONFLICT (empresa, categoria, mes, ano) 
   DO UPDATE SET valor_orcamento = EXCLUDED.valor_orcamento;
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."atualiza_controle_orcamento_receita"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualiza_status_cancelado"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   IF NEW.cancelado = TRUE THEN
       NEW.status = 'Não Autorizado';
       
       UPDATE pedidos_solicitados_fluxo 
       SET status = 'Não Autorizado'
       WHERE pedido_id = NEW.id;
   END IF;
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."atualiza_status_cancelado"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualiza_status_cancelado_receita"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   IF NEW.cancelado = TRUE THEN
       NEW.status = 'Não Autorizado';
       
       UPDATE pedidos_solicitados_fluxo_receita 
       SET status = 'Não Autorizado'
       WHERE pedido_id = NEW.id;
   END IF;
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."atualiza_status_cancelado_receita"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_anexo_controle_pagamentos"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Se tipo_documento for -2, copiar anexo_id e anexo_url para controle_pagamentos
  IF NEW.tipo_documento = -2 THEN
    UPDATE controle_pagamentos
    SET 
      anexo_id = NEW.anexo_id,
      anexo_url = NEW.anexo_url
    WHERE id = NEW.pagamento_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."atualizar_anexo_controle_pagamentos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_anexo_controle_recebimentos"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Se tipo_documento for -2, copiar anexo_id e anexo_url para controle_recebimento
  IF NEW.tipo_documento = -2 THEN
    UPDATE controle_recebimento
    SET 
      anexo_id = NEW.anexo_id,
      anexo_url = NEW.anexo_url
    WHERE id = NEW.recebimento_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."atualizar_anexo_controle_recebimentos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_tem_comprovante"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Se um documento com tipo_documento = -2 foi inserido ou atualizado
    IF (TG_OP = 'INSERT' AND NEW.tipo_documento = -2) OR 
       (TG_OP = 'UPDATE' AND NEW.tipo_documento = -2) THEN
        -- Atualiza a coluna tem_comprovante para TRUE
        UPDATE controle_pagamentos
        SET tem_comprovante = TRUE
        WHERE id = NEW.pagamento_id;
    -- Se o tipo_documento mudou de -2 para outro valor
    ELSIF (TG_OP = 'UPDATE' AND OLD.tipo_documento = -2 AND NEW.tipo_documento != -2) THEN
        -- Verifica se ainda existem outros documentos do tipo -2 para este pagamento
        IF NOT EXISTS (
            SELECT 1 FROM documentos
            WHERE pagamento_id = NEW.pagamento_id
            AND tipo_documento = -2
            AND id != NEW.id
        ) THEN
            -- Se não existirem, atualiza para FALSE
            UPDATE controle_pagamentos
            SET tem_comprovante = FALSE
            WHERE id = NEW.pagamento_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."atualizar_tem_comprovante"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_tem_comprovante_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Se um documento com tipo_documento = -2 foi excluído
    IF OLD.tipo_documento = -2 THEN
        -- Verifica se ainda existem outros documentos do tipo -2 para este pagamento
        IF NOT EXISTS (
            SELECT 1 FROM documentos
            WHERE pagamento_id = OLD.pagamento_id
            AND tipo_documento = -2
        ) THEN
            -- Se não existirem, atualiza para FALSE
            UPDATE controle_pagamentos
            SET tem_comprovante = FALSE
            WHERE id = OLD.pagamento_id;
        END IF;
    END IF;
    RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."atualizar_tem_comprovante_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_tem_comprovante_delete_receita"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Se um documento com tipo_documento = -2 foi excluído
    IF OLD.tipo_documento = -2 THEN
        -- Verifica se ainda existem outros documentos do tipo -2 para este recebimento
        IF NOT EXISTS (
            SELECT 1 FROM documentos_receita
            WHERE recebimento_id = OLD.recebimento_id
            AND tipo_documento = -2
        ) THEN
            -- Se não existirem, atualiza para FALSE
            UPDATE controle_recebimento
            SET tem_comprovante = FALSE
            WHERE id = OLD.recebimento_id;
        END IF;
    END IF;
    RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."atualizar_tem_comprovante_delete_receita"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_tem_comprovante_receita"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Se um documento com tipo_documento = -2 foi inserido ou atualizado
    IF (TG_OP = 'INSERT' AND NEW.tipo_documento = -2) OR 
       (TG_OP = 'UPDATE' AND NEW.tipo_documento = -2) THEN
        -- Atualiza a coluna tem_comprovante para TRUE
        UPDATE controle_recebimento
        SET tem_comprovante = TRUE
        WHERE id = NEW.recebimento_id;
    -- Se o tipo_documento mudou de -2 para outro valor
    ELSIF (TG_OP = 'UPDATE' AND OLD.tipo_documento = -2 AND NEW.tipo_documento != -2) THEN
        -- Verifica se ainda existem outros documentos do tipo -2 para este recebimento
        IF NOT EXISTS (
            SELECT 1 FROM documentos_receita
            WHERE recebimento_id = NEW.recebimento_id
            AND tipo_documento = -2
            AND id != NEW.id
        ) THEN
            -- Se não existirem, atualiza para FALSE
            UPDATE controle_recebimento
            SET tem_comprovante = FALSE
            WHERE id = NEW.recebimento_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."atualizar_tem_comprovante_receita"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_valor_pedidos_solicitados"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Atualiza apenas as linhas específicas correspondentes
    UPDATE controle_orcamento co
    SET valor_pedidos_solicitados = (
        SELECT COALESCE(SUM(valor_referente), 0)
        FROM pedidos_solicitados_fluxo psf
        WHERE psf.empresa = co.empresa 
          AND psf.categoria = co.categoria 
          AND psf.mes = co.mes 
          AND psf.ano = co.ano 
          AND psf.status != 'Não Autorizado'
    )
    WHERE EXISTS (
        SELECT 1 
        FROM pedidos_solicitados_fluxo psf
        WHERE psf.empresa = co.empresa 
          AND psf.categoria = co.categoria 
          AND psf.mes = co.mes 
          AND psf.ano = co.ano
    );
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."atualizar_valor_pedidos_solicitados"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_valor_pedidos_solicitados_receita"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Atualiza apenas as linhas específicas correspondentes
    UPDATE controle_orcamento_receita co
    SET valor_pedidos_solicitados = (
        SELECT COALESCE(SUM(valor_referente), 0)
        FROM pedidos_solicitados_fluxo_receita psf
        WHERE psf.empresa = co.empresa 
          AND psf.categoria = co.categoria 
          AND psf.mes = co.mes 
          AND psf.ano = co.ano 
          AND psf.status != 'Não Autorizado'
    )
    WHERE EXISTS (
        SELECT 1 
        FROM pedidos_solicitados_fluxo_receita psf
        WHERE psf.empresa = co.empresa 
          AND psf.categoria = co.categoria 
          AND psf.mes = co.mes 
          AND psf.ano = co.ano
    );
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."atualizar_valor_pedidos_solicitados_receita"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_sessions"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
 delete from user_sessions where expires_at < now();
end;
$$;


ALTER FUNCTION "public"."cleanup_expired_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gerar_id_aleatorio"() RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  novo_id int8;
BEGIN
  LOOP
    novo_id := floor(random() * (99999999-10000000+1) + 10000000);
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM pedidos_solicitados 
      WHERE id_pedido_compra = novo_id
    );
  END LOOP;
  RETURN novo_id;
END;
$$;


ALTER FUNCTION "public"."gerar_id_aleatorio"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gerar_id_aleatorio_receita"() RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  novo_id int8;
BEGIN
  LOOP
    novo_id := floor(random() * (99999999-10000000+1) + 10000000);
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM pedidos_solicitados_receita 
      WHERE id_pedido_compra = novo_id
    );
  END LOOP;
  RETURN novo_id;
END;
$$;


ALTER FUNCTION "public"."gerar_id_aleatorio_receita"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."limpar_anexo_controle_pagamentos"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Verificar se o documento apagado tinha tipo_documento = -2
  IF OLD.tipo_documento = -2 THEN
    -- Limpar anexo_id e anexo_url na tabela controle_pagamentos
    UPDATE controle_pagamentos
    SET 
      anexo_id = NULL,
      anexo_url = NULL
    WHERE id = OLD.pagamento_id;
  END IF;
  
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."limpar_anexo_controle_pagamentos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."limpar_anexo_controle_recebimentos"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Verificar se o documento apagado tinha tipo_documento = -2
  IF OLD.tipo_documento = -2 THEN
    -- Limpar anexo_id e anexo_url na tabela controle_recebimento
    UPDATE controle_recebimento
    SET 
      anexo_id = NULL,
      anexo_url = NULL
    WHERE id = OLD.recebimento_id;
  END IF;
  
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."limpar_anexo_controle_recebimentos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_orcamento_analise"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
   registro_existente registro_orcamento_analise%ROWTYPE;
BEGIN
   SELECT * INTO registro_existente
   FROM registro_orcamento_analise
   WHERE empresa = NEW.empresa
   AND categoria = NEW.categoria
   AND mes = NEW.mes
   AND ano = NEW.ano;

   IF FOUND THEN
       UPDATE registro_orcamento_analise
       SET valor_orcamento_vigente = NEW.valor_orcamento
       WHERE empresa = NEW.empresa
       AND categoria = NEW.categoria
       AND mes = NEW.mes
       AND ano = NEW.ano;
   ELSE
       INSERT INTO registro_orcamento_analise (
           empresa,
           categoria,
           mes,
           ano,
           valor_orcamento_vigente,
           valor_orcamento_inicial
       )
       VALUES (
           NEW.empresa,
           NEW.categoria,
           NEW.mes,
           NEW.ano,
           NEW.valor_orcamento,
           NEW.valor_orcamento
       );
   END IF;
   
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_orcamento_analise"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_orcamento_analise_receita"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
   registro_existente registro_orcamento_analise_receita%ROWTYPE;
BEGIN
   SELECT * INTO registro_existente
   FROM registro_orcamento_analise_receita
   WHERE empresa = NEW.empresa
   AND categoria = NEW.categoria
   AND mes = NEW.mes
   AND ano = NEW.ano;

   IF FOUND THEN
       UPDATE registro_orcamento_analise_receita
       SET valor_orcamento_vigente = NEW.valor_orcamento
       WHERE empresa = NEW.empresa
       AND categoria = NEW.categoria
       AND mes = NEW.mes
       AND ano = NEW.ano;
   ELSE
       INSERT INTO registro_orcamento_analise_receita (
           empresa,
           categoria,
           mes,
           ano,
           valor_orcamento_vigente,
           valor_orcamento_inicial
       )
       VALUES (
           NEW.empresa,
           NEW.categoria,
           NEW.mes,
           NEW.ano,
           NEW.valor_orcamento,
           NEW.valor_orcamento
       );
   END IF;
   
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_orcamento_analise_receita"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_orcamento_data"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
 INSERT INTO controle_orcamento (empresa, categoria, mes, ano, valor_orcamento, valor_pedidos_solicitados, saldo)
 VALUES (
   NEW.empresa,
   NEW.categoria,
   NEW.mes,
   NEW.ano,
   NEW.valor_orcamento,
   0,
   NEW.valor_orcamento
 );
 RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_orcamento_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_orcamento_data_receita"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
 INSERT INTO controle_orcamento_receita (empresa, categoria, mes, ano, valor_orcamento, valor_pedidos_solicitados, saldo)
 VALUES (
   NEW.empresa,
   NEW.categoria,
   NEW.mes,
   NEW.ano,
   NEW.valor_orcamento,
   0,
   NEW.valor_orcamento
 );
 RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_orcamento_data_receita"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_orcamentos_usuarios"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
       INSERT INTO orcamentos_usuarios (
           empresa,
           categoria,
           mes, 
           ano,
           valor_orcamento
       )
       VALUES (
           NEW.empresa,
           NEW.categoria,
           NEW.mes,
           NEW.ano,
           NEW.valor_orcamento_vigente
       )
       ON CONFLICT (empresa, categoria, mes, ano) 
       DO UPDATE SET 
           valor_orcamento = EXCLUDED.valor_orcamento,
           updated_at = CURRENT_TIMESTAMP;
   END IF;
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_orcamentos_usuarios"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_orcamentos_usuarios_receita"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
       INSERT INTO orcamentos_usuarios_receita (
           empresa,
           categoria,
           mes, 
           ano,
           valor_orcamento
       )
       VALUES (
           NEW.empresa,
           NEW.categoria,
           NEW.mes,
           NEW.ano,
           NEW.valor_orcamento_vigente
       )
       ON CONFLICT (empresa, categoria, mes, ano) 
       DO UPDATE SET 
           valor_orcamento = EXCLUDED.valor_orcamento,
           updated_at = CURRENT_TIMESTAMP;
   END IF;
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_orcamentos_usuarios_receita"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_pedido_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE pedidos_solicitados_fluxo
    SET pedido_status = NEW.pedido_status
    WHERE pedido_id = NEW.id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_pedido_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_pedido_status_receita"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE pedidos_solicitados_fluxo_receita
    SET pedido_status = NEW.pedido_status
    WHERE pedido_id = NEW.id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_pedido_status_receita"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_set_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_fluxo_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE pedidos_solicitados_fluxo
    SET status = NEW.status
    WHERE pedido_id = NEW.id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_fluxo_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_fluxo_status_receita"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE pedidos_solicitados_fluxo_receita
    SET status = NEW.status
    WHERE pedido_id = NEW.id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_fluxo_status_receita"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_valor_pedidos_solicitados"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE controle_orcamento co
  SET valor_pedidos_solicitados = (
    SELECT COALESCE(SUM(psf.valor_referente), 0)
    FROM pedidos_solicitados_fluxo psf
    WHERE psf.empresa = co.empresa
    AND psf.categoria = co.categoria
    AND CAST(psf.mes AS INTEGER) = CAST(co.mes AS INTEGER)
    AND CAST(psf.ano AS INTEGER) = CAST(co.ano AS INTEGER)
  )
  WHERE co.empresa = NEW.empresa
  AND co.categoria = NEW.categoria
  AND CAST(co.mes AS INTEGER) = CAST(NEW.mes AS INTEGER)
  AND CAST(co.ano AS INTEGER) = CAST(NEW.ano AS INTEGER);
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_valor_pedidos_solicitados"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_valor_pedidos_solicitados_receita"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE controle_orcamento_receita co
  SET valor_pedidos_solicitados = (
    SELECT COALESCE(SUM(psf.valor_referente), 0)
    FROM pedidos_solicitados_fluxo_receita psf
    WHERE psf.empresa = co.empresa
    AND psf.categoria = co.categoria
    AND CAST(psf.mes AS INTEGER) = CAST(co.mes AS INTEGER)
    AND CAST(psf.ano AS INTEGER) = CAST(co.ano AS INTEGER)
  )
  WHERE co.empresa = NEW.empresa
  AND co.categoria = NEW.categoria
  AND CAST(co.mes AS INTEGER) = CAST(NEW.mes AS INTEGER)
  AND CAST(co.ano AS INTEGER) = CAST(NEW.ano AS INTEGER);
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_valor_pedidos_solicitados_receita"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."orcamentos_usuarios" (
    "id" integer NOT NULL,
    "empresa" "text",
    "categoria" "text",
    "mes" integer,
    "ano" integer,
    "valor_orcamento" numeric,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."orcamentos_usuarios" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."_orcamentos_usuarios_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."_orcamentos_usuarios_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."_orcamentos_usuarios_id_seq" OWNED BY "public"."orcamentos_usuarios"."id";



CREATE TABLE IF NOT EXISTS "public"."orcamentos_usuarios_receita" (
    "id" integer NOT NULL,
    "empresa" "text",
    "categoria" "text",
    "mes" integer,
    "ano" integer,
    "valor_orcamento" numeric,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."orcamentos_usuarios_receita" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."_orcamentos_usuarios_receita_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."_orcamentos_usuarios_receita_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."_orcamentos_usuarios_receita_id_seq" OWNED BY "public"."orcamentos_usuarios_receita"."id";



CREATE TABLE IF NOT EXISTS "public"."assistente_virtual" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "chave" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "vigente" boolean DEFAULT false
);


ALTER TABLE "public"."assistente_virtual" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa" character varying(255) NOT NULL,
    "categoria" character varying(255) NOT NULL
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categorias_receita" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa" character varying(255) NOT NULL,
    "categoria" character varying(255) NOT NULL
);


ALTER TABLE "public"."categorias_receita" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" integer NOT NULL,
    "nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "cnpj_cpf" character varying(20),
    "rua_avenida" "text",
    "numero" "text",
    "complemento" "text",
    "bairro" "text",
    "cidade" "text",
    "estado" character varying(2),
    "cep" character varying(10),
    "tipo_chave" integer,
    "chave_pix" "text"
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."clientes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."clientes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."clientes_id_seq" OWNED BY "public"."clientes"."id";



CREATE TABLE IF NOT EXISTS "public"."comentarios" (
    "id" integer NOT NULL,
    "pedido_id" integer NOT NULL,
    "comentario" "text",
    "usuario" character varying(255) NOT NULL,
    "data_comentario" timestamp with time zone,
    "documento_id" integer,
    "anexo_id" "text",
    "tipo_documento" integer
);


ALTER TABLE "public"."comentarios" OWNER TO "postgres";


COMMENT ON TABLE "public"."comentarios" IS 'Armazena comentários sobre pedidos, com possível associação a documentos';



COMMENT ON COLUMN "public"."comentarios"."documento_id" IS 'Referência ao documento associado, se o comentário foi feito sobre um documento';



CREATE SEQUENCE IF NOT EXISTS "public"."comentarios_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."comentarios_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."comentarios_id_seq" OWNED BY "public"."comentarios"."id";



CREATE TABLE IF NOT EXISTS "public"."comentarios_receita" (
    "id" integer NOT NULL,
    "pedido_id" integer NOT NULL,
    "comentario" "text",
    "usuario" character varying(255) NOT NULL,
    "data_comentario" timestamp with time zone,
    "documento_id" integer
);


ALTER TABLE "public"."comentarios_receita" OWNER TO "postgres";


COMMENT ON TABLE "public"."comentarios_receita" IS 'Armazena comentários sobre pedidos, com possível associação a documentos';



COMMENT ON COLUMN "public"."comentarios_receita"."documento_id" IS 'Referência ao documento associado, se o comentário foi feito sobre um documento';



CREATE SEQUENCE IF NOT EXISTS "public"."comentarios_receita_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."comentarios_receita_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."comentarios_receita_id_seq" OWNED BY "public"."comentarios_receita"."id";



CREATE TABLE IF NOT EXISTS "public"."config" (
    "id" integer NOT NULL,
    "chave" character varying NOT NULL,
    "valor" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."config" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."config_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."config_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."config_id_seq" OWNED BY "public"."config"."id";



CREATE TABLE IF NOT EXISTS "public"."conta_pagador" (
    "id" integer NOT NULL,
    "cnpj" numeric,
    "agencia" integer,
    "digito_agencia" integer,
    "conta_corrente" bigint,
    "digito_conta" integer,
    "nome_empresa" "text",
    "rua_av" "text",
    "numero_local" integer,
    "complemento" "text",
    "cidade" "text",
    "cep" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "estado" "text"
);


ALTER TABLE "public"."conta_pagador" OWNER TO "postgres";


COMMENT ON TABLE "public"."conta_pagador" IS 'Tabela para armazenar informações de contas de pagadores';



COMMENT ON COLUMN "public"."conta_pagador"."cnpj" IS 'CNPJ do pagador';



COMMENT ON COLUMN "public"."conta_pagador"."agencia" IS 'Número da agência (5 dígitos)';



COMMENT ON COLUMN "public"."conta_pagador"."digito_agencia" IS 'Dígito verificador da agência (1 dígito)';



COMMENT ON COLUMN "public"."conta_pagador"."conta_corrente" IS 'Número da conta corrente (12 dígitos)';



COMMENT ON COLUMN "public"."conta_pagador"."digito_conta" IS 'Dígito verificador da conta (1 dígito)';



COMMENT ON COLUMN "public"."conta_pagador"."nome_empresa" IS 'Nome da empresa (até 30 caracteres)';



COMMENT ON COLUMN "public"."conta_pagador"."cep" IS 'CEP (5 dígitos)';



COMMENT ON COLUMN "public"."conta_pagador"."estado" IS 'Dois caracteres';



CREATE SEQUENCE IF NOT EXISTS "public"."conta_pagador_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."conta_pagador_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."conta_pagador_id_seq" OWNED BY "public"."conta_pagador"."id";



CREATE TABLE IF NOT EXISTS "public"."conta_receita" (
    "id" integer NOT NULL,
    "cnpj" numeric,
    "agencia" integer,
    "digito_agencia" integer,
    "conta_corrente" bigint,
    "digito_conta" integer,
    "nome_empresa" "text",
    "rua_av" "text",
    "numero_local" integer,
    "complemento" "text",
    "cidade" "text",
    "cep" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "estado" "text"
);


ALTER TABLE "public"."conta_receita" OWNER TO "postgres";


COMMENT ON TABLE "public"."conta_receita" IS 'Tabela para armazenar informações de contas de pagadores';



COMMENT ON COLUMN "public"."conta_receita"."cnpj" IS 'CNPJ do pagador';



COMMENT ON COLUMN "public"."conta_receita"."agencia" IS 'Número da agência (5 dígitos)';



COMMENT ON COLUMN "public"."conta_receita"."digito_agencia" IS 'Dígito verificador da agência (1 dígito)';



COMMENT ON COLUMN "public"."conta_receita"."conta_corrente" IS 'Número da conta corrente (12 dígitos)';



COMMENT ON COLUMN "public"."conta_receita"."digito_conta" IS 'Dígito verificador da conta (1 dígito)';



COMMENT ON COLUMN "public"."conta_receita"."nome_empresa" IS 'Nome da empresa (até 30 caracteres)';



COMMENT ON COLUMN "public"."conta_receita"."cep" IS 'CEP (5 dígitos)';



COMMENT ON COLUMN "public"."conta_receita"."estado" IS 'Dois caracteres';



CREATE SEQUENCE IF NOT EXISTS "public"."conta_receita_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."conta_receita_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."conta_receita_id_seq" OWNED BY "public"."conta_receita"."id";



CREATE TABLE IF NOT EXISTS "public"."controle_orcamento" (
    "id" integer NOT NULL,
    "empresa" character varying NOT NULL,
    "categoria" character varying NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "valor_orcamento" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "valor_pedidos_solicitados" numeric(10,2) DEFAULT 0,
    "saldo" numeric(10,2) GENERATED ALWAYS AS (("valor_orcamento" - "valor_pedidos_solicitados")) STORED,
    CONSTRAINT "check_ano_controle" CHECK ((("ano" >= 2025) AND ("ano" <= 2045))),
    CONSTRAINT "check_mes_controle" CHECK ((("mes" >= 1) AND ("mes" <= 12)))
);


ALTER TABLE "public"."controle_orcamento" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."controle_orcamento_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."controle_orcamento_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."controle_orcamento_id_seq" OWNED BY "public"."controle_orcamento"."id";



CREATE TABLE IF NOT EXISTS "public"."controle_orcamento_receita" (
    "id" integer NOT NULL,
    "empresa" character varying NOT NULL,
    "categoria" character varying NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "valor_orcamento" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "valor_pedidos_solicitados" numeric(10,2) DEFAULT 0,
    "saldo" numeric(10,2) GENERATED ALWAYS AS (("valor_orcamento" - "valor_pedidos_solicitados")) STORED,
    CONSTRAINT "check_ano_controle" CHECK ((("ano" >= 2025) AND ("ano" <= 2045))),
    CONSTRAINT "check_mes_controle" CHECK ((("mes" >= 1) AND ("mes" <= 12)))
);


ALTER TABLE "public"."controle_orcamento_receita" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."controle_orcamento_receita_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."controle_orcamento_receita_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."controle_orcamento_receita_id_seq" OWNED BY "public"."controle_orcamento_receita"."id";



CREATE TABLE IF NOT EXISTS "public"."controle_pagamentos" (
    "id" integer NOT NULL,
    "pedido_id" integer,
    "data_vencimento" "date",
    "valor_pagar" numeric(10,2),
    "data_pagamento" "date",
    "valor_pagamento" numeric(10,2),
    "anexo_id" character varying,
    "anexo_url" character varying(255),
    "tem_comprovante" boolean DEFAULT false,
    "status_pagamento" integer DEFAULT 1 NOT NULL,
    "tipo_pagamento" integer
);


ALTER TABLE "public"."controle_pagamentos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."controle_pagamentos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."controle_pagamentos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."controle_pagamentos_id_seq" OWNED BY "public"."controle_pagamentos"."id";



CREATE TABLE IF NOT EXISTS "public"."controle_recebimento" (
    "id" integer NOT NULL,
    "pedido_id" integer,
    "data_vencimento" "date",
    "valor_pagar" numeric(10,2),
    "data_pagamento" "date",
    "valor_pagamento" numeric(10,2),
    "anexo_id" character varying,
    "anexo_url" character varying(255),
    "tem_comprovante" boolean DEFAULT false,
    "status_recebimento" integer DEFAULT 1 NOT NULL,
    "tipo_recebimento" integer
);


ALTER TABLE "public"."controle_recebimento" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."controle_recebimento_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."controle_recebimento_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."controle_recebimento_id_seq" OWNED BY "public"."controle_recebimento"."id";



CREATE TABLE IF NOT EXISTS "public"."controle_sequencial" (
    "tipo" "text" NOT NULL,
    "valor" "text" NOT NULL
);


ALTER TABLE "public"."controle_sequencial" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."controle_sequencial_recebimento" (
    "tipo" "text" NOT NULL,
    "valor" "text" NOT NULL
);


ALTER TABLE "public"."controle_sequencial_recebimento" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documentos" (
    "id" integer NOT NULL,
    "pedido_id" integer,
    "tipo_documento" integer NOT NULL,
    "anexo_id" "text" NOT NULL,
    "usuario" character varying(255) NOT NULL,
    "data_upload" timestamp with time zone,
    "comentario_id" integer,
    "pagamento_id" integer,
    "anexo_url" "text",
    "nome_documento" "text",
    "arquivo_texto" "text"
);


ALTER TABLE "public"."documentos" OWNER TO "postgres";


COMMENT ON TABLE "public"."documentos" IS 'Armazena documentos relacionados a pedidos, com possível associação a comentários';



COMMENT ON COLUMN "public"."documentos"."comentario_id" IS 'Referência ao comentário associado, se o documento foi anexado a um comentário';



CREATE SEQUENCE IF NOT EXISTS "public"."documentos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."documentos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."documentos_id_seq" OWNED BY "public"."documentos"."id";



CREATE TABLE IF NOT EXISTS "public"."documentos_receita" (
    "id" integer NOT NULL,
    "pedido_id" integer,
    "tipo_documento" integer NOT NULL,
    "anexo_id" "text" NOT NULL,
    "usuario" character varying(255) NOT NULL,
    "data_upload" timestamp with time zone,
    "comentario_id" integer,
    "recebimento_id" integer,
    "anexo_url" "text",
    "nome_documento" "text",
    "arquivo_texto" "text"
);


ALTER TABLE "public"."documentos_receita" OWNER TO "postgres";


COMMENT ON TABLE "public"."documentos_receita" IS 'Armazena documentos relacionados a pedidos, com possível associação a comentários';



COMMENT ON COLUMN "public"."documentos_receita"."comentario_id" IS 'Referência ao comentário associado, se o documento foi anexado a um comentário';



CREATE SEQUENCE IF NOT EXISTS "public"."documentos_receita_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."documentos_receita_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."documentos_receita_id_seq" OWNED BY "public"."documentos_receita"."id";



CREATE TABLE IF NOT EXISTS "public"."email_config" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tipo" character varying(50) NOT NULL,
    "ativo" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "segunda" boolean DEFAULT false,
    "terça" boolean DEFAULT false,
    "quarta" boolean DEFAULT false,
    "quinta" boolean DEFAULT false,
    "sexta" boolean DEFAULT false
);


ALTER TABLE "public"."email_config" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_config" IS 'Tabela para controle de configurações de envio de emails';



CREATE TABLE IF NOT EXISTS "public"."empresas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa" character varying(255) NOT NULL
);


ALTER TABLE "public"."empresas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fornecedores" (
    "id" integer NOT NULL,
    "nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "cnpj_cpf" character varying(20),
    "rua_avenida" "text",
    "numero" character varying(10),
    "complemento" character varying(100),
    "bairro" character varying(50),
    "cidade" character varying(50),
    "estado" character varying(2),
    "cep" character varying(10),
    "tipo_chave" integer,
    "chave_pix" "text"
);


ALTER TABLE "public"."fornecedores" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fornecedores_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."fornecedores_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fornecedores_id_seq" OWNED BY "public"."fornecedores"."id";



CREATE TABLE IF NOT EXISTS "public"."informacoes_boleto" (
    "id" integer NOT NULL,
    "codigo_barras" "text",
    "nome_beneficiario" "text",
    "data_vencimento" "date",
    "valor_nominal" numeric(15,2),
    "valor_desconto" numeric(15,2),
    "valor_mora" numeric(15,2),
    "data_pagamento" "date",
    "valor_pagamento" numeric(15,2),
    "doc_empresa" "text",
    "nosso_numero" "text",
    "beneficiario_tipo" "text",
    "beneficiario_documento" "text",
    "beneficiario_nome" "text",
    "doc_empresa_adicional" "text",
    "boleto_id" integer
);


ALTER TABLE "public"."informacoes_boleto" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."informacoes_boleto_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."informacoes_boleto_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."informacoes_boleto_id_seq" OWNED BY "public"."informacoes_boleto"."id";



CREATE TABLE IF NOT EXISTS "public"."informacoes_boleto_receita" (
    "id" integer NOT NULL,
    "codigo_barras" "text",
    "nome_beneficiario" "text",
    "data_vencimento" "date",
    "valor_nominal" numeric(15,2),
    "valor_desconto" numeric(15,2),
    "valor_mora" numeric(15,2),
    "data_pagamento" "date",
    "valor_pagamento" numeric(15,2),
    "doc_empresa" "text",
    "nosso_numero" "text",
    "beneficiario_tipo" "text",
    "beneficiario_documento" "text",
    "beneficiario_nome" "text",
    "doc_empresa_adicional" "text",
    "boleto_id" integer
);


ALTER TABLE "public"."informacoes_boleto_receita" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."informacoes_boleto_receita_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."informacoes_boleto_receita_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."informacoes_boleto_receita_id_seq" OWNED BY "public"."informacoes_boleto_receita"."id";



CREATE TABLE IF NOT EXISTS "public"."modelo_contrato" (
    "id" integer NOT NULL,
    "nome" "text" NOT NULL,
    "estilo" "text" NOT NULL,
    "arquivo_id" "text" NOT NULL,
    CONSTRAINT "modelo_contrato_estilo_check" CHECK (("estilo" = ANY (ARRAY['estatico'::"text", 'variavel'::"text"])))
);


ALTER TABLE "public"."modelo_contrato" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."modelo_contrato_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."modelo_contrato_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."modelo_contrato_id_seq" OWNED BY "public"."modelo_contrato"."id";



CREATE TABLE IF NOT EXISTS "public"."modelo_contrato_venda" (
    "id" integer NOT NULL,
    "nome" "text" NOT NULL,
    "estilo" "text" NOT NULL,
    "arquivo_id" "text" NOT NULL,
    CONSTRAINT "modelo_contrato_venda_estilo_check" CHECK (("estilo" = ANY (ARRAY['estatico'::"text", 'variavel'::"text"])))
);


ALTER TABLE "public"."modelo_contrato_venda" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."modelo_contrato_venda_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."modelo_contrato_venda_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."modelo_contrato_venda_id_seq" OWNED BY "public"."modelo_contrato_venda"."id";



CREATE TABLE IF NOT EXISTS "public"."pagamento_status" (
    "id" integer NOT NULL,
    "nome_status" character varying(50) NOT NULL
);


ALTER TABLE "public"."pagamento_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedido_status" (
    "id" integer NOT NULL,
    "nome_status" "text" NOT NULL
);


ALTER TABLE "public"."pedido_status" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pedido_status_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."pedido_status_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pedido_status_id_seq" OWNED BY "public"."pedido_status"."id";



CREATE TABLE IF NOT EXISTS "public"."pedido_status_receita" (
    "id" integer NOT NULL,
    "nome_status" "text" NOT NULL
);


ALTER TABLE "public"."pedido_status_receita" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pedido_status_receita_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."pedido_status_receita_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pedido_status_receita_id_seq" OWNED BY "public"."pedido_status_receita"."id";



CREATE TABLE IF NOT EXISTS "public"."pedidos_solicitados" (
    "id" bigint NOT NULL,
    "empresa" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "fornecedor" "text" NOT NULL,
    "valor_pedido" numeric(15,2) NOT NULL,
    "status" "public"."status_pedido" DEFAULT 'Aguardando Autorização'::"public"."status_pedido",
    "observacao" "text",
    "emergencia" boolean DEFAULT false,
    "data_solicitacao" "date" DEFAULT CURRENT_TIMESTAMP,
    "data_autorizacao" "date",
    "usuario_autorizador" "text",
    "arquivos_pdf_ids" "text"[],
    "arquivo_texto" "text"[],
    "cancelado" boolean DEFAULT false,
    "analise_texto" "text"[],
    "pedido_status" integer DEFAULT 1 NOT NULL,
    "tipo_documento" integer
);


ALTER TABLE "public"."pedidos_solicitados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos_solicitados_fluxo" (
    "id" bigint NOT NULL,
    "pedido_id" bigint,
    "empresa" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "fornecedor" "text" NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "valor_referente" numeric(15,2) NOT NULL,
    "status" "public"."status_pedido" DEFAULT 'Aguardando Autorização'::"public"."status_pedido",
    "pedido_status" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."pedidos_solicitados_fluxo" OWNER TO "postgres";


ALTER TABLE "public"."pedidos_solicitados_fluxo" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."pedidos_solicitados_fluxo_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."pedidos_solicitados_fluxo_receita" (
    "id" bigint NOT NULL,
    "pedido_id" bigint,
    "empresa" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "cliente" "text" NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "valor_referente" numeric(15,2) NOT NULL,
    "status" "public"."status_pedido" DEFAULT 'Aguardando Autorização'::"public"."status_pedido",
    "pedido_status" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."pedidos_solicitados_fluxo_receita" OWNER TO "postgres";


ALTER TABLE "public"."pedidos_solicitados_fluxo_receita" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."pedidos_solicitados_fluxo_receita_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."pedidos_solicitados" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."pedidos_solicitados_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."pedidos_solicitados_receita" (
    "id" bigint NOT NULL,
    "empresa" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "cliente" "text" NOT NULL,
    "valor_pedido" numeric(15,2) NOT NULL,
    "status" "public"."status_pedido" DEFAULT 'Aguardando Autorização'::"public"."status_pedido",
    "observacao" "text",
    "emergencia" boolean DEFAULT false,
    "data_solicitacao" "date" DEFAULT CURRENT_TIMESTAMP,
    "data_autorizacao" "date",
    "usuario_autorizador" "text",
    "arquivos_pdf_ids" "text"[],
    "arquivo_texto" "text"[],
    "cancelado" boolean DEFAULT false,
    "analise_texto" "text"[],
    "pedido_status" integer DEFAULT 1 NOT NULL,
    "tipo_documento" integer
);


ALTER TABLE "public"."pedidos_solicitados_receita" OWNER TO "postgres";


ALTER TABLE "public"."pedidos_solicitados_receita" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."pedidos_solicitados_receita_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."recebimento_status" (
    "id" integer NOT NULL,
    "nome_status" character varying(50) NOT NULL
);


ALTER TABLE "public"."recebimento_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registro_orcamento_analise" (
    "id" integer NOT NULL,
    "empresa" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "valor_orcamento_inicial" numeric(15,2) NOT NULL,
    "valor_orcamento_vigente" numeric(15,2) NOT NULL,
    "data_criacao" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "registro_orcamento_analise_mes_check" CHECK ((("mes" >= 1) AND ("mes" <= 12)))
);


ALTER TABLE "public"."registro_orcamento_analise" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."registro_orcamento_analise_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."registro_orcamento_analise_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."registro_orcamento_analise_id_seq" OWNED BY "public"."registro_orcamento_analise"."id";



CREATE TABLE IF NOT EXISTS "public"."registro_orcamento_analise_receita" (
    "id" integer NOT NULL,
    "empresa" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "valor_orcamento_inicial" numeric(15,2) NOT NULL,
    "valor_orcamento_vigente" numeric(15,2) NOT NULL,
    "data_criacao" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "registro_orcamento_analise_receita_mes_check" CHECK ((("mes" >= 1) AND ("mes" <= 12)))
);


ALTER TABLE "public"."registro_orcamento_analise_receita" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."registro_orcamento_analise_receita_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."registro_orcamento_analise_receita_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."registro_orcamento_analise_receita_id_seq" OWNED BY "public"."registro_orcamento_analise_receita"."id";



CREATE TABLE IF NOT EXISTS "public"."registro_orcamentos" (
    "id" integer NOT NULL,
    "empresa" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "valor_orcamento" numeric(15,2) NOT NULL,
    "data_criacao" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "usuario_criador" "text" NOT NULL,
    "observacao" "text",
    CONSTRAINT "registro_orcamentos_mes_check" CHECK ((("mes" >= 1) AND ("mes" <= 12)))
);


ALTER TABLE "public"."registro_orcamentos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."registro_orcamentos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."registro_orcamentos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."registro_orcamentos_id_seq" OWNED BY "public"."registro_orcamentos"."id";



CREATE TABLE IF NOT EXISTS "public"."registro_orcamentos_receita" (
    "id" integer NOT NULL,
    "empresa" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "valor_orcamento" numeric(15,2) NOT NULL,
    "data_criacao" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "usuario_criador" "text" NOT NULL,
    "observacao" "text",
    CONSTRAINT "registro_orcamentos_receita_mes_check" CHECK ((("mes" >= 1) AND ("mes" <= 12)))
);


ALTER TABLE "public"."registro_orcamentos_receita" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."registro_orcamentos_receita_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."registro_orcamentos_receita_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."registro_orcamentos_receita_id_seq" OWNED BY "public"."registro_orcamentos_receita"."id";



CREATE TABLE IF NOT EXISTS "public"."reset_tokens" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "email" "text" NOT NULL,
    "token" "text" NOT NULL,
    "expiry" timestamp with time zone NOT NULL,
    "used" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reset_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."smtp_config" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "smtp_user" character varying NOT NULL,
    "smtp_pass" character varying NOT NULL,
    "email_from" character varying NOT NULL,
    "smtp_host" character varying NOT NULL,
    "smtp_port" character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "vigente" boolean DEFAULT false
);


ALTER TABLE "public"."smtp_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tipos_chave" (
    "id" integer NOT NULL,
    "tipo" "text" NOT NULL
);


ALTER TABLE "public"."tipos_chave" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tipos_chave_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."tipos_chave_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tipos_chave_id_seq" OWNED BY "public"."tipos_chave"."id";



CREATE TABLE IF NOT EXISTS "public"."tipos_documento" (
    "id" integer NOT NULL,
    "tipo" character varying(255) NOT NULL
);


ALTER TABLE "public"."tipos_documento" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tipos_documento_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    MINVALUE 0
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."tipos_documento_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tipos_documento_id_seq" OWNED BY "public"."tipos_documento"."id";



CREATE TABLE IF NOT EXISTS "public"."tipos_pagamento" (
    "id" integer NOT NULL,
    "tipos" "text" NOT NULL
);


ALTER TABLE "public"."tipos_pagamento" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tipos_recebimento" (
    "id" integer NOT NULL,
    "tipos" "text" NOT NULL
);


ALTER TABLE "public"."tipos_recebimento" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" bigint NOT NULL,
    "username" "text" NOT NULL,
    "password" "text" NOT NULL,
    "email" character varying(255) NOT NULL,
    "hierarquia" "public"."tipo_hierarquia" DEFAULT 'user'::"public"."tipo_hierarquia" NOT NULL,
    "status_cadastro" "public"."status_cadastro_enum" DEFAULT 'Aguardando Autorização'::"public"."status_cadastro_enum"
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


ALTER TABLE "public"."usuarios" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."usuarios_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."clientes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."clientes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."comentarios" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."comentarios_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."comentarios_receita" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."comentarios_receita_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."config" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."config_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."conta_pagador" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."conta_pagador_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."conta_receita" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."conta_receita_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."controle_orcamento" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."controle_orcamento_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."controle_orcamento_receita" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."controle_orcamento_receita_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."controle_pagamentos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."controle_pagamentos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."controle_recebimento" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."controle_recebimento_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."documentos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."documentos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."documentos_receita" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."documentos_receita_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."fornecedores" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fornecedores_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."informacoes_boleto" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."informacoes_boleto_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."informacoes_boleto_receita" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."informacoes_boleto_receita_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."modelo_contrato" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."modelo_contrato_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."modelo_contrato_venda" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."modelo_contrato_venda_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."orcamentos_usuarios" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."_orcamentos_usuarios_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."orcamentos_usuarios_receita" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."_orcamentos_usuarios_receita_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pedido_status" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pedido_status_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pedido_status_receita" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pedido_status_receita_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."registro_orcamento_analise" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."registro_orcamento_analise_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."registro_orcamento_analise_receita" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."registro_orcamento_analise_receita_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."registro_orcamentos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."registro_orcamentos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."registro_orcamentos_receita" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."registro_orcamentos_receita_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tipos_chave" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tipos_chave_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tipos_documento" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tipos_documento_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."orcamentos_usuarios"
    ADD CONSTRAINT "_orcamentos_usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orcamentos_usuarios_receita"
    ADD CONSTRAINT "_orcamentos_usuarios_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistente_virtual"
    ADD CONSTRAINT "assistente_virtual_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_empresa_categoria_unique" UNIQUE ("empresa", "categoria");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias_receita"
    ADD CONSTRAINT "categorias_receita_empresa_categoria_unique" UNIQUE ("empresa", "categoria");



ALTER TABLE ONLY "public"."categorias_receita"
    ADD CONSTRAINT "categorias_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comentarios"
    ADD CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comentarios_receita"
    ADD CONSTRAINT "comentarios_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."config"
    ADD CONSTRAINT "config_chave_key" UNIQUE ("chave");



ALTER TABLE ONLY "public"."config"
    ADD CONSTRAINT "config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conta_pagador"
    ADD CONSTRAINT "conta_pagador_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conta_receita"
    ADD CONSTRAINT "conta_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."controle_orcamento"
    ADD CONSTRAINT "controle_orcamento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."controle_orcamento_receita"
    ADD CONSTRAINT "controle_orcamento_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."controle_orcamento_receita"
    ADD CONSTRAINT "controle_orcamento_receita_unique_key" UNIQUE ("empresa", "categoria", "mes", "ano");



ALTER TABLE ONLY "public"."controle_orcamento"
    ADD CONSTRAINT "controle_orcamento_unique_key" UNIQUE ("empresa", "categoria", "mes", "ano");



ALTER TABLE ONLY "public"."controle_pagamentos"
    ADD CONSTRAINT "controle_pagamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."controle_recebimento"
    ADD CONSTRAINT "controle_recebimento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."controle_sequencial"
    ADD CONSTRAINT "controle_sequencial_pkey" PRIMARY KEY ("tipo");



ALTER TABLE ONLY "public"."controle_sequencial_recebimento"
    ADD CONSTRAINT "controle_sequencial_recebimento_pkey" PRIMARY KEY ("tipo");



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documentos_receita"
    ADD CONSTRAINT "documentos_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_config"
    ADD CONSTRAINT "email_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."empresas"
    ADD CONSTRAINT "empresas_empresa_key" UNIQUE ("empresa");



ALTER TABLE ONLY "public"."empresas"
    ADD CONSTRAINT "empresas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fornecedores"
    ADD CONSTRAINT "fornecedores_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."fornecedores"
    ADD CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."informacoes_boleto"
    ADD CONSTRAINT "informacoes_boleto_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."informacoes_boleto_receita"
    ADD CONSTRAINT "informacoes_boleto_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modelo_contrato"
    ADD CONSTRAINT "modelo_contrato_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modelo_contrato_venda"
    ADD CONSTRAINT "modelo_contrato_venda_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagamento_status"
    ADD CONSTRAINT "pagamento_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedido_status"
    ADD CONSTRAINT "pedido_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedido_status_receita"
    ADD CONSTRAINT "pedido_status_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos_solicitados_fluxo"
    ADD CONSTRAINT "pedidos_solicitados_fluxo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos_solicitados_fluxo_receita"
    ADD CONSTRAINT "pedidos_solicitados_fluxo_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos_solicitados"
    ADD CONSTRAINT "pedidos_solicitados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos_solicitados_receita"
    ADD CONSTRAINT "pedidos_solicitados_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recebimento_status"
    ADD CONSTRAINT "recebimento_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registro_orcamento_analise"
    ADD CONSTRAINT "registro_orcamento_analise_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registro_orcamento_analise_receita"
    ADD CONSTRAINT "registro_orcamento_analise_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registro_orcamentos"
    ADD CONSTRAINT "registro_orcamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registro_orcamentos_receita"
    ADD CONSTRAINT "registro_orcamentos_receita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reset_tokens"
    ADD CONSTRAINT "reset_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reset_tokens"
    ADD CONSTRAINT "reset_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."smtp_config"
    ADD CONSTRAINT "smtp_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tipos_chave"
    ADD CONSTRAINT "tipos_chave_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tipos_documento"
    ADD CONSTRAINT "tipos_documento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tipos_pagamento"
    ADD CONSTRAINT "tipos_pagamento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tipos_recebimento"
    ADD CONSTRAINT "tipos_recebimento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orcamentos_usuarios"
    ADD CONSTRAINT "unique_orcamento_new" UNIQUE ("empresa", "categoria", "mes", "ano");



ALTER TABLE ONLY "public"."orcamentos_usuarios_receita"
    ADD CONSTRAINT "unique_orcamento_receita_new" UNIQUE ("empresa", "categoria", "mes", "ano");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_username_key" UNIQUE ("username");



CREATE INDEX "idx_comentarios_anexo_id" ON "public"."comentarios" USING "btree" ("anexo_id");



CREATE INDEX "idx_comentarios_documento_id" ON "public"."comentarios" USING "btree" ("documento_id");



CREATE INDEX "idx_comentarios_pedido_id" ON "public"."comentarios" USING "btree" ("pedido_id");



CREATE INDEX "idx_comentarios_receita_documento_id" ON "public"."comentarios_receita" USING "btree" ("documento_id");



CREATE INDEX "idx_comentarios_receita_pedido_id" ON "public"."comentarios_receita" USING "btree" ("pedido_id");



CREATE INDEX "idx_comentarios_tipo_documento" ON "public"."comentarios" USING "btree" ("tipo_documento");



CREATE INDEX "idx_conta_pagador_cnpj" ON "public"."conta_pagador" USING "btree" ("cnpj");



CREATE INDEX "idx_conta_receita_cnpj" ON "public"."conta_receita" USING "btree" ("cnpj");



CREATE INDEX "idx_documentos_comentario_id" ON "public"."documentos" USING "btree" ("comentario_id");



CREATE INDEX "idx_documentos_pedido_id" ON "public"."documentos" USING "btree" ("pedido_id");



CREATE INDEX "idx_documentos_receita_comentario_id" ON "public"."documentos_receita" USING "btree" ("comentario_id");



CREATE INDEX "idx_documentos_receita_pedido_id" ON "public"."documentos_receita" USING "btree" ("pedido_id");



CREATE INDEX "idx_documentos_receita_tipo" ON "public"."documentos_receita" USING "btree" ("tipo_documento");



CREATE INDEX "idx_documentos_tipo" ON "public"."documentos" USING "btree" ("tipo_documento");



CREATE OR REPLACE TRIGGER "after_documentos_delete" AFTER DELETE ON "public"."documentos" FOR EACH ROW EXECUTE FUNCTION "public"."atualizar_tem_comprovante_delete"();



CREATE OR REPLACE TRIGGER "after_documentos_insert_update" AFTER INSERT OR UPDATE ON "public"."documentos" FOR EACH ROW EXECUTE FUNCTION "public"."atualizar_tem_comprovante"();



CREATE OR REPLACE TRIGGER "after_documentos_receita_delete" AFTER DELETE ON "public"."documentos_receita" FOR EACH ROW EXECUTE FUNCTION "public"."atualizar_tem_comprovante_delete_receita"();



CREATE OR REPLACE TRIGGER "after_documentos_receita_insert_update" AFTER INSERT OR UPDATE ON "public"."documentos_receita" FOR EACH ROW EXECUTE FUNCTION "public"."atualizar_tem_comprovante_receita"();



CREATE OR REPLACE TRIGGER "after_pedido_status_update" AFTER UPDATE OF "pedido_status" ON "public"."pedidos_solicitados" FOR EACH ROW EXECUTE FUNCTION "public"."sync_pedido_status"();



CREATE OR REPLACE TRIGGER "after_pedido_status_update_receita" AFTER UPDATE OF "pedido_status" ON "public"."pedidos_solicitados_receita" FOR EACH ROW EXECUTE FUNCTION "public"."sync_pedido_status_receita"();



CREATE OR REPLACE TRIGGER "set_timestamp" BEFORE UPDATE ON "public"."conta_pagador" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_receita" BEFORE UPDATE ON "public"."conta_receita" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "sync_status_changes" AFTER UPDATE OF "status" ON "public"."pedidos_solicitados" FOR EACH ROW EXECUTE FUNCTION "public"."update_fluxo_status"();



CREATE OR REPLACE TRIGGER "sync_status_changes_receita" AFTER UPDATE OF "status" ON "public"."pedidos_solicitados_receita" FOR EACH ROW EXECUTE FUNCTION "public"."update_fluxo_status_receita"();



CREATE OR REPLACE TRIGGER "trig_sync_orcamento_analise" AFTER INSERT ON "public"."registro_orcamentos" FOR EACH ROW EXECUTE FUNCTION "public"."sync_orcamento_analise"();



CREATE OR REPLACE TRIGGER "trig_sync_orcamento_analise_receita" AFTER INSERT ON "public"."registro_orcamentos_receita" FOR EACH ROW EXECUTE FUNCTION "public"."sync_orcamento_analise_receita"();



CREATE OR REPLACE TRIGGER "trig_sync_orcamentos_usuarios" AFTER INSERT OR UPDATE ON "public"."registro_orcamento_analise" FOR EACH ROW EXECUTE FUNCTION "public"."sync_orcamentos_usuarios"();



CREATE OR REPLACE TRIGGER "trig_sync_orcamentos_usuarios_receita" AFTER INSERT OR UPDATE ON "public"."registro_orcamento_analise_receita" FOR EACH ROW EXECUTE FUNCTION "public"."sync_orcamentos_usuarios_receita"();



CREATE OR REPLACE TRIGGER "trigger_atualiza_controle" AFTER INSERT OR UPDATE ON "public"."orcamentos_usuarios" FOR EACH ROW EXECUTE FUNCTION "public"."atualiza_controle_orcamento"();



CREATE OR REPLACE TRIGGER "trigger_atualiza_controle_receita" AFTER INSERT OR UPDATE ON "public"."orcamentos_usuarios_receita" FOR EACH ROW EXECUTE FUNCTION "public"."atualiza_controle_orcamento_receita"();



CREATE OR REPLACE TRIGGER "trigger_atualizar_anexo_controle" AFTER INSERT OR UPDATE ON "public"."documentos" FOR EACH ROW EXECUTE FUNCTION "public"."atualizar_anexo_controle_pagamentos"();



CREATE OR REPLACE TRIGGER "trigger_atualizar_anexo_controle_receita" AFTER INSERT OR UPDATE ON "public"."documentos_receita" FOR EACH ROW EXECUTE FUNCTION "public"."atualizar_anexo_controle_recebimentos"();



CREATE OR REPLACE TRIGGER "trigger_atualizar_pedidos_solicitados" AFTER INSERT OR DELETE OR UPDATE ON "public"."pedidos_solicitados_fluxo" FOR EACH STATEMENT EXECUTE FUNCTION "public"."atualizar_valor_pedidos_solicitados"();



CREATE OR REPLACE TRIGGER "trigger_atualizar_pedidos_solicitados_receita" AFTER INSERT OR DELETE OR UPDATE ON "public"."pedidos_solicitados_fluxo_receita" FOR EACH STATEMENT EXECUTE FUNCTION "public"."atualizar_valor_pedidos_solicitados_receita"();



CREATE OR REPLACE TRIGGER "trigger_atualizar_valor" AFTER INSERT OR DELETE OR UPDATE ON "public"."pedidos_solicitados_fluxo" FOR EACH ROW EXECUTE FUNCTION "public"."atualizar_valor_pedidos_solicitados"();



CREATE OR REPLACE TRIGGER "trigger_atualizar_valor_receita" AFTER INSERT OR DELETE OR UPDATE ON "public"."pedidos_solicitados_fluxo_receita" FOR EACH ROW EXECUTE FUNCTION "public"."atualizar_valor_pedidos_solicitados_receita"();



CREATE OR REPLACE TRIGGER "trigger_limpar_anexo_controle" BEFORE DELETE ON "public"."documentos" FOR EACH ROW EXECUTE FUNCTION "public"."limpar_anexo_controle_pagamentos"();



CREATE OR REPLACE TRIGGER "trigger_limpar_anexo_controle_receita" BEFORE DELETE ON "public"."documentos_receita" FOR EACH ROW EXECUTE FUNCTION "public"."limpar_anexo_controle_recebimentos"();



CREATE OR REPLACE TRIGGER "trigger_status_cancelado" BEFORE UPDATE ON "public"."pedidos_solicitados" FOR EACH ROW EXECUTE FUNCTION "public"."atualiza_status_cancelado"();



CREATE OR REPLACE TRIGGER "trigger_status_cancelado_receita" BEFORE UPDATE ON "public"."pedidos_solicitados_receita" FOR EACH ROW EXECUTE FUNCTION "public"."atualiza_status_cancelado_receita"();



CREATE OR REPLACE TRIGGER "update_pedidos_solicitados" AFTER INSERT OR DELETE OR UPDATE ON "public"."pedidos_solicitados_fluxo" FOR EACH ROW EXECUTE FUNCTION "public"."update_valor_pedidos_solicitados"();



CREATE OR REPLACE TRIGGER "update_pedidos_solicitados_receita" AFTER INSERT OR DELETE OR UPDATE ON "public"."pedidos_solicitados_fluxo_receita" FOR EACH ROW EXECUTE FUNCTION "public"."update_valor_pedidos_solicitados_receita"();



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_empresa_fkey" FOREIGN KEY ("empresa") REFERENCES "public"."empresas"("empresa") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."categorias_receita"
    ADD CONSTRAINT "categorias_receita_empresa_fkey" FOREIGN KEY ("empresa") REFERENCES "public"."empresas"("empresa") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."controle_orcamento"
    ADD CONSTRAINT "controle_orcamento_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias"("empresa", "categoria") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."controle_orcamento_receita"
    ADD CONSTRAINT "controle_orcamento_receita_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias_receita"("empresa", "categoria") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."controle_pagamentos"
    ADD CONSTRAINT "controle_pagamentos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_solicitados"("id");



ALTER TABLE ONLY "public"."controle_pagamentos"
    ADD CONSTRAINT "controle_pagamentos_tipo_pagamento_fkey" FOREIGN KEY ("tipo_pagamento") REFERENCES "public"."tipos_pagamento"("id");



ALTER TABLE ONLY "public"."controle_recebimento"
    ADD CONSTRAINT "controle_recebimento_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_solicitados_receita"("id");



ALTER TABLE ONLY "public"."controle_recebimento"
    ADD CONSTRAINT "controle_recebimento_tipo_recebimento_fkey" FOREIGN KEY ("tipo_recebimento") REFERENCES "public"."tipos_recebimento"("id");



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "public"."controle_pagamentos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documentos_receita"
    ADD CONSTRAINT "documentos_receita_recebimento_id_fkey" FOREIGN KEY ("recebimento_id") REFERENCES "public"."controle_recebimento"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."informacoes_boleto"
    ADD CONSTRAINT "fk_boleto_documento" FOREIGN KEY ("boleto_id") REFERENCES "public"."documentos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."informacoes_boleto_receita"
    ADD CONSTRAINT "fk_boleto_documento_receita" FOREIGN KEY ("boleto_id") REFERENCES "public"."documentos_receita"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comentarios"
    ADD CONSTRAINT "fk_comentarios_documento" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comentarios_receita"
    ADD CONSTRAINT "fk_comentarios_documento_receita" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos_receita"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comentarios"
    ADD CONSTRAINT "fk_comentarios_pedido" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_solicitados"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comentarios_receita"
    ADD CONSTRAINT "fk_comentarios_pedido_receita" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_solicitados_receita"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "fk_documentos_comentario" FOREIGN KEY ("comentario_id") REFERENCES "public"."comentarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documentos_receita"
    ADD CONSTRAINT "fk_documentos_comentario_receita" FOREIGN KEY ("comentario_id") REFERENCES "public"."comentarios_receita"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "fk_documentos_pedido" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_solicitados"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documentos_receita"
    ADD CONSTRAINT "fk_documentos_pedido_receita" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_solicitados_receita"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "fk_documentos_tipo" FOREIGN KEY ("tipo_documento") REFERENCES "public"."tipos_documento"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."documentos_receita"
    ADD CONSTRAINT "fk_documentos_tipo_receita" FOREIGN KEY ("tipo_documento") REFERENCES "public"."tipos_documento"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pedidos_solicitados"
    ADD CONSTRAINT "fk_pedido_status" FOREIGN KEY ("pedido_status") REFERENCES "public"."pedido_status"("id");



ALTER TABLE ONLY "public"."pedidos_solicitados_fluxo"
    ADD CONSTRAINT "fk_pedido_status_fluxo" FOREIGN KEY ("pedido_status") REFERENCES "public"."pedido_status"("id");



ALTER TABLE ONLY "public"."pedidos_solicitados_fluxo_receita"
    ADD CONSTRAINT "fk_pedido_status_fluxo_receita" FOREIGN KEY ("pedido_status") REFERENCES "public"."pedido_status_receita"("id");



ALTER TABLE ONLY "public"."pedidos_solicitados_receita"
    ADD CONSTRAINT "fk_pedido_status_receita" FOREIGN KEY ("pedido_status") REFERENCES "public"."pedido_status_receita"("id");



ALTER TABLE ONLY "public"."controle_pagamentos"
    ADD CONSTRAINT "fk_status_pagamento" FOREIGN KEY ("status_pagamento") REFERENCES "public"."pagamento_status"("id");



ALTER TABLE ONLY "public"."controle_recebimento"
    ADD CONSTRAINT "fk_status_recebimento" FOREIGN KEY ("status_recebimento") REFERENCES "public"."recebimento_status"("id");



ALTER TABLE ONLY "public"."fornecedores"
    ADD CONSTRAINT "fk_tipo_chave" FOREIGN KEY ("tipo_chave") REFERENCES "public"."tipos_chave"("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "fk_tipo_chave_cliente" FOREIGN KEY ("tipo_chave") REFERENCES "public"."tipos_chave"("id");



ALTER TABLE ONLY "public"."pedidos_solicitados"
    ADD CONSTRAINT "fk_tipos_documento" FOREIGN KEY ("tipo_documento") REFERENCES "public"."tipos_documento"("id");



ALTER TABLE ONLY "public"."pedidos_solicitados_receita"
    ADD CONSTRAINT "fk_tipos_documento_receita" FOREIGN KEY ("tipo_documento") REFERENCES "public"."tipos_documento"("id");



ALTER TABLE ONLY "public"."orcamentos_usuarios"
    ADD CONSTRAINT "orcamentos_usuarios_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias"("empresa", "categoria") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."orcamentos_usuarios_receita"
    ADD CONSTRAINT "orcamentos_usuarios_receita_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias_receita"("empresa", "categoria") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."pedidos_solicitados"
    ADD CONSTRAINT "pedidos_solicitados_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias"("empresa", "categoria") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."pedidos_solicitados_fluxo"
    ADD CONSTRAINT "pedidos_solicitados_fluxo_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias"("empresa", "categoria") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."pedidos_solicitados_fluxo"
    ADD CONSTRAINT "pedidos_solicitados_fluxo_fornecedor_fkey" FOREIGN KEY ("fornecedor") REFERENCES "public"."fornecedores"("nome") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."pedidos_solicitados_fluxo"
    ADD CONSTRAINT "pedidos_solicitados_fluxo_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_solicitados"("id");



ALTER TABLE ONLY "public"."pedidos_solicitados_fluxo_receita"
    ADD CONSTRAINT "pedidos_solicitados_fluxo_receita_cliente_fkey" FOREIGN KEY ("cliente") REFERENCES "public"."clientes"("nome") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."pedidos_solicitados_fluxo_receita"
    ADD CONSTRAINT "pedidos_solicitados_fluxo_receita_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias_receita"("empresa", "categoria") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."pedidos_solicitados_fluxo_receita"
    ADD CONSTRAINT "pedidos_solicitados_fluxo_receita_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_solicitados_receita"("id");



ALTER TABLE ONLY "public"."pedidos_solicitados"
    ADD CONSTRAINT "pedidos_solicitados_fornecedor_fkey" FOREIGN KEY ("fornecedor") REFERENCES "public"."fornecedores"("nome") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."pedidos_solicitados_receita"
    ADD CONSTRAINT "pedidos_solicitados_receita_cliente_fkey" FOREIGN KEY ("cliente") REFERENCES "public"."clientes"("nome") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."pedidos_solicitados_receita"
    ADD CONSTRAINT "pedidos_solicitados_receita_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias_receita"("empresa", "categoria") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."registro_orcamento_analise"
    ADD CONSTRAINT "registro_orcamento_analise_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias"("empresa", "categoria") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."registro_orcamento_analise_receita"
    ADD CONSTRAINT "registro_orcamento_analise_receita_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias_receita"("empresa", "categoria") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."registro_orcamentos"
    ADD CONSTRAINT "registro_orcamentos_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias"("empresa", "categoria") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."registro_orcamentos_receita"
    ADD CONSTRAINT "registro_orcamentos_receita_empresa_categoria_fkey" FOREIGN KEY ("empresa", "categoria") REFERENCES "public"."categorias_receita"("empresa", "categoria") ON UPDATE CASCADE;



CREATE POLICY "Permitir tudo" ON "public"."config" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

















































































































































































GRANT ALL ON FUNCTION "public"."atualiza_controle_orcamento"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualiza_controle_orcamento"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualiza_controle_orcamento"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualiza_controle_orcamento_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualiza_controle_orcamento_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualiza_controle_orcamento_receita"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualiza_status_cancelado"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualiza_status_cancelado"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualiza_status_cancelado"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualiza_status_cancelado_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualiza_status_cancelado_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualiza_status_cancelado_receita"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_anexo_controle_pagamentos"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_anexo_controle_pagamentos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_anexo_controle_pagamentos"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_anexo_controle_recebimentos"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_anexo_controle_recebimentos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_anexo_controle_recebimentos"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante_delete_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante_delete_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante_delete_receita"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_tem_comprovante_receita"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_valor_pedidos_solicitados"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_valor_pedidos_solicitados"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_valor_pedidos_solicitados"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_valor_pedidos_solicitados_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_valor_pedidos_solicitados_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_valor_pedidos_solicitados_receita"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_sessions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gerar_id_aleatorio"() TO "anon";
GRANT ALL ON FUNCTION "public"."gerar_id_aleatorio"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gerar_id_aleatorio"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gerar_id_aleatorio_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."gerar_id_aleatorio_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gerar_id_aleatorio_receita"() TO "service_role";



GRANT ALL ON FUNCTION "public"."limpar_anexo_controle_pagamentos"() TO "anon";
GRANT ALL ON FUNCTION "public"."limpar_anexo_controle_pagamentos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."limpar_anexo_controle_pagamentos"() TO "service_role";



GRANT ALL ON FUNCTION "public"."limpar_anexo_controle_recebimentos"() TO "anon";
GRANT ALL ON FUNCTION "public"."limpar_anexo_controle_recebimentos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."limpar_anexo_controle_recebimentos"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_orcamento_analise"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_orcamento_analise"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_orcamento_analise"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_orcamento_analise_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_orcamento_analise_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_orcamento_analise_receita"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_orcamento_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_orcamento_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_orcamento_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_orcamento_data_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_orcamento_data_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_orcamento_data_receita"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_orcamentos_usuarios"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_orcamentos_usuarios"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_orcamentos_usuarios"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_orcamentos_usuarios_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_orcamentos_usuarios_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_orcamentos_usuarios_receita"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_pedido_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_pedido_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_pedido_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_pedido_status_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_pedido_status_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_pedido_status_receita"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_fluxo_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_fluxo_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_fluxo_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_fluxo_status_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_fluxo_status_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_fluxo_status_receita"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_valor_pedidos_solicitados"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_valor_pedidos_solicitados"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_valor_pedidos_solicitados"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_valor_pedidos_solicitados_receita"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_valor_pedidos_solicitados_receita"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_valor_pedidos_solicitados_receita"() TO "service_role";


















GRANT ALL ON TABLE "public"."orcamentos_usuarios" TO "anon";
GRANT ALL ON TABLE "public"."orcamentos_usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."orcamentos_usuarios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."_orcamentos_usuarios_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."_orcamentos_usuarios_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."_orcamentos_usuarios_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."orcamentos_usuarios_receita" TO "anon";
GRANT ALL ON TABLE "public"."orcamentos_usuarios_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."orcamentos_usuarios_receita" TO "service_role";



GRANT ALL ON SEQUENCE "public"."_orcamentos_usuarios_receita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."_orcamentos_usuarios_receita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."_orcamentos_usuarios_receita_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."assistente_virtual" TO "anon";
GRANT ALL ON TABLE "public"."assistente_virtual" TO "authenticated";
GRANT ALL ON TABLE "public"."assistente_virtual" TO "service_role";



GRANT ALL ON TABLE "public"."categorias" TO "anon";
GRANT ALL ON TABLE "public"."categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias" TO "service_role";



GRANT ALL ON TABLE "public"."categorias_receita" TO "anon";
GRANT ALL ON TABLE "public"."categorias_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias_receita" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."comentarios" TO "anon";
GRANT ALL ON TABLE "public"."comentarios" TO "authenticated";
GRANT ALL ON TABLE "public"."comentarios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."comentarios_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."comentarios_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."comentarios_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."comentarios_receita" TO "anon";
GRANT ALL ON TABLE "public"."comentarios_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."comentarios_receita" TO "service_role";



GRANT ALL ON SEQUENCE "public"."comentarios_receita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."comentarios_receita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."comentarios_receita_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."config" TO "anon";
GRANT ALL ON TABLE "public"."config" TO "authenticated";
GRANT ALL ON TABLE "public"."config" TO "service_role";



GRANT ALL ON SEQUENCE "public"."config_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."config_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."config_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conta_pagador" TO "anon";
GRANT ALL ON TABLE "public"."conta_pagador" TO "authenticated";
GRANT ALL ON TABLE "public"."conta_pagador" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conta_pagador_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conta_pagador_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conta_pagador_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conta_receita" TO "anon";
GRANT ALL ON TABLE "public"."conta_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."conta_receita" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conta_receita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conta_receita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conta_receita_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."controle_orcamento" TO "anon";
GRANT ALL ON TABLE "public"."controle_orcamento" TO "authenticated";
GRANT ALL ON TABLE "public"."controle_orcamento" TO "service_role";



GRANT ALL ON SEQUENCE "public"."controle_orcamento_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."controle_orcamento_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."controle_orcamento_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."controle_orcamento_receita" TO "anon";
GRANT ALL ON TABLE "public"."controle_orcamento_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."controle_orcamento_receita" TO "service_role";



GRANT ALL ON SEQUENCE "public"."controle_orcamento_receita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."controle_orcamento_receita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."controle_orcamento_receita_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."controle_pagamentos" TO "anon";
GRANT ALL ON TABLE "public"."controle_pagamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."controle_pagamentos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."controle_pagamentos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."controle_pagamentos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."controle_pagamentos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."controle_recebimento" TO "anon";
GRANT ALL ON TABLE "public"."controle_recebimento" TO "authenticated";
GRANT ALL ON TABLE "public"."controle_recebimento" TO "service_role";



GRANT ALL ON SEQUENCE "public"."controle_recebimento_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."controle_recebimento_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."controle_recebimento_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."controle_sequencial" TO "anon";
GRANT ALL ON TABLE "public"."controle_sequencial" TO "authenticated";
GRANT ALL ON TABLE "public"."controle_sequencial" TO "service_role";



GRANT ALL ON TABLE "public"."controle_sequencial_recebimento" TO "anon";
GRANT ALL ON TABLE "public"."controle_sequencial_recebimento" TO "authenticated";
GRANT ALL ON TABLE "public"."controle_sequencial_recebimento" TO "service_role";



GRANT ALL ON TABLE "public"."documentos" TO "anon";
GRANT ALL ON TABLE "public"."documentos" TO "authenticated";
GRANT ALL ON TABLE "public"."documentos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."documentos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."documentos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."documentos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."documentos_receita" TO "anon";
GRANT ALL ON TABLE "public"."documentos_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."documentos_receita" TO "service_role";



GRANT ALL ON SEQUENCE "public"."documentos_receita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."documentos_receita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."documentos_receita_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."email_config" TO "anon";
GRANT ALL ON TABLE "public"."email_config" TO "authenticated";
GRANT ALL ON TABLE "public"."email_config" TO "service_role";



GRANT ALL ON TABLE "public"."empresas" TO "anon";
GRANT ALL ON TABLE "public"."empresas" TO "authenticated";
GRANT ALL ON TABLE "public"."empresas" TO "service_role";



GRANT ALL ON TABLE "public"."fornecedores" TO "anon";
GRANT ALL ON TABLE "public"."fornecedores" TO "authenticated";
GRANT ALL ON TABLE "public"."fornecedores" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fornecedores_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fornecedores_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fornecedores_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."informacoes_boleto" TO "anon";
GRANT ALL ON TABLE "public"."informacoes_boleto" TO "authenticated";
GRANT ALL ON TABLE "public"."informacoes_boleto" TO "service_role";



GRANT ALL ON SEQUENCE "public"."informacoes_boleto_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."informacoes_boleto_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."informacoes_boleto_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."informacoes_boleto_receita" TO "anon";
GRANT ALL ON TABLE "public"."informacoes_boleto_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."informacoes_boleto_receita" TO "service_role";



GRANT ALL ON SEQUENCE "public"."informacoes_boleto_receita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."informacoes_boleto_receita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."informacoes_boleto_receita_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."modelo_contrato" TO "anon";
GRANT ALL ON TABLE "public"."modelo_contrato" TO "authenticated";
GRANT ALL ON TABLE "public"."modelo_contrato" TO "service_role";



GRANT ALL ON SEQUENCE "public"."modelo_contrato_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."modelo_contrato_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."modelo_contrato_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."modelo_contrato_venda" TO "anon";
GRANT ALL ON TABLE "public"."modelo_contrato_venda" TO "authenticated";
GRANT ALL ON TABLE "public"."modelo_contrato_venda" TO "service_role";



GRANT ALL ON SEQUENCE "public"."modelo_contrato_venda_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."modelo_contrato_venda_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."modelo_contrato_venda_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pagamento_status" TO "anon";
GRANT ALL ON TABLE "public"."pagamento_status" TO "authenticated";
GRANT ALL ON TABLE "public"."pagamento_status" TO "service_role";



GRANT ALL ON TABLE "public"."pedido_status" TO "anon";
GRANT ALL ON TABLE "public"."pedido_status" TO "authenticated";
GRANT ALL ON TABLE "public"."pedido_status" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pedido_status_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pedido_status_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pedido_status_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pedido_status_receita" TO "anon";
GRANT ALL ON TABLE "public"."pedido_status_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."pedido_status_receita" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pedido_status_receita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pedido_status_receita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pedido_status_receita_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos_solicitados" TO "anon";
GRANT ALL ON TABLE "public"."pedidos_solicitados" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos_solicitados" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos_solicitados_fluxo" TO "anon";
GRANT ALL ON TABLE "public"."pedidos_solicitados_fluxo" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos_solicitados_fluxo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_fluxo_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_fluxo_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_fluxo_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos_solicitados_fluxo_receita" TO "anon";
GRANT ALL ON TABLE "public"."pedidos_solicitados_fluxo_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos_solicitados_fluxo_receita" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_fluxo_receita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_fluxo_receita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_fluxo_receita_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos_solicitados_receita" TO "anon";
GRANT ALL ON TABLE "public"."pedidos_solicitados_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos_solicitados_receita" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_receita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_receita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pedidos_solicitados_receita_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."recebimento_status" TO "anon";
GRANT ALL ON TABLE "public"."recebimento_status" TO "authenticated";
GRANT ALL ON TABLE "public"."recebimento_status" TO "service_role";



GRANT ALL ON TABLE "public"."registro_orcamento_analise" TO "anon";
GRANT ALL ON TABLE "public"."registro_orcamento_analise" TO "authenticated";
GRANT ALL ON TABLE "public"."registro_orcamento_analise" TO "service_role";



GRANT ALL ON SEQUENCE "public"."registro_orcamento_analise_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."registro_orcamento_analise_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."registro_orcamento_analise_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."registro_orcamento_analise_receita" TO "anon";
GRANT ALL ON TABLE "public"."registro_orcamento_analise_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."registro_orcamento_analise_receita" TO "service_role";



GRANT ALL ON SEQUENCE "public"."registro_orcamento_analise_receita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."registro_orcamento_analise_receita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."registro_orcamento_analise_receita_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."registro_orcamentos" TO "anon";
GRANT ALL ON TABLE "public"."registro_orcamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."registro_orcamentos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."registro_orcamentos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."registro_orcamentos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."registro_orcamentos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."registro_orcamentos_receita" TO "anon";
GRANT ALL ON TABLE "public"."registro_orcamentos_receita" TO "authenticated";
GRANT ALL ON TABLE "public"."registro_orcamentos_receita" TO "service_role";



GRANT ALL ON SEQUENCE "public"."registro_orcamentos_receita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."registro_orcamentos_receita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."registro_orcamentos_receita_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reset_tokens" TO "anon";
GRANT ALL ON TABLE "public"."reset_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."reset_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."smtp_config" TO "anon";
GRANT ALL ON TABLE "public"."smtp_config" TO "authenticated";
GRANT ALL ON TABLE "public"."smtp_config" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_chave" TO "anon";
GRANT ALL ON TABLE "public"."tipos_chave" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_chave" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tipos_chave_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tipos_chave_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tipos_chave_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_documento" TO "anon";
GRANT ALL ON TABLE "public"."tipos_documento" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_documento" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tipos_documento_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tipos_documento_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tipos_documento_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_pagamento" TO "anon";
GRANT ALL ON TABLE "public"."tipos_pagamento" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_pagamento" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_recebimento" TO "anon";
GRANT ALL ON TABLE "public"."tipos_recebimento" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_recebimento" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."usuarios_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."usuarios_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."usuarios_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























