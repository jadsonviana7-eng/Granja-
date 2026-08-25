-- ==============================================================================
-- SCRIPT DE CORREÇÃO PARA A TABELA producao_diaria NO SUPABASE
-- Objetivo: Permitir o salvamento de múltiplos tipos de ovos (Pequeno, Médio, Grande)
-- na mesma data sem erro de duplicidade (Unique Constraint).
-- ==============================================================================

-- 1. Garante que a coluna 'tipo_ovo' existe na tabela
ALTER TABLE producao_diaria 
ADD COLUMN IF NOT EXISTS tipo_ovo TEXT DEFAULT 'Grande';

-- 2. Remove qualquer restrição antiga de chave única (UNIQUE) baseada somente na 'data_coleta'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'producao_diaria'
          AND con.contype = 'u'
    ) LOOP
        EXECUTE 'ALTER TABLE producao_diaria DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname) || ' CASCADE;';
    END LOOP;
END $$;

-- 3. (Opcional) Cria uma chave única composta para impedir duplicatas do MESMO tipo no MESMO dia
-- (Permite salvar 1 Grande, 1 Médio e 1 Pequeno na mesma data)
ALTER TABLE producao_diaria 
ADD CONSTRAINT producao_diaria_data_tipo_key UNIQUE (data_coleta, tipo_ovo);
