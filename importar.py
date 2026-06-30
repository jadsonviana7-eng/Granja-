import os
import json
import pandas as pd
from datetime import datetime
from supabase import create_client, Client

# 1. Configurações de conexão do Supabase
SUPABASE_URL = "https://kbmvwzzdisvefkseztua.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtibXZ3enpkaXN2ZWZrc2V6dHVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDg1NzEsImV4cCI6MjA5NjcyNDU3MX0.9PQuzAC_oxsjM5MnWw_f9a_9B-WpgfWe2IPhogiRGnQ"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Mapeamento dos arquivos CSV correspondentes
ARQUIVOS_MAPEADOS = {
    "clientes": "Granja RANCHO DO VIANA - Clientes.csv",
    "insumos": "Granja RANCHO DO VIANA - Insumos.csv",
    "produtos": "Granja RANCHO DO VIANA - Produtos.csv",
    "transacoes": "Granja RANCHO DO VIANA - Extrato.csv",
    "producao_diaria": "Granja RANCHO DO VIANA - Producao.csv",
    "plantel": "Granja RANCHO DO VIANA - Plantel.csv"
}

def limpar_moeda(valor):
    """Trata valores monetários do formato brasileiro para float."""
    if pd.isna(valor) or str(valor).strip() == "":
        return 0.0
    valor_str = str(valor).replace("R$", "").strip()
    if not valor_str:
        return 0.0
    if "." in valor_str and "," in valor_str:
        valor_str = valor_str.replace(".", "").replace(",", ".")
    else:
        valor_str = valor_str.replace(",", ".")
    try:
        return float(valor_str)
    except ValueError:
        return 0.0

def converter_data(valor):
    """Garante o formato de data YYYY-MM-DD."""
    if pd.isna(valor) or str(valor).strip() == "":
        return None
    try:
        return str(valor).split(" ")[0]
    except Exception:
        return None

def importar_clientes():
    print("📋 Carregando Clientes...")
    df = pd.read_csv(ARQUIVOS_MAPEADOS["clientes"])
    dados = []
    for _, row in df.iterrows():
        dados.append({
            "id": int(row["Id"]),  # Mantém o ID original e imutável do CSV
            "nome": str(row["Nome"]).strip(),
            "telefone": str(row["Telefone"]) if pd.notna(row["Telefone"]) else None,
            "cidade": str(row["Cidade"]) if pd.notna(row["Cidade"]) else None
        })
    if dados:
        supabase.table("clientes").insert(dados).execute()
        print(f"✅ {len(dados)} clientes inseridos.")

def importar_insumos():
    print("📦 Carregando Insumos...")
    df = pd.read_csv(ARQUIVOS_MAPEADOS["insumos"])
    dados = []
    for _, row in df.iterrows():
        dados.append({
            "id": int(row["Id"]),
            "nome": str(row["Nome"]).strip(),
            "tipo_consumo": str(row["Tipoconsumo"]),
            "qtd": float(row["Qtd"]),
            "unidade": str(row["Unidade"])
        })
    if dados:
        supabase.table("insumos").insert(dados).execute()
        print(f"✅ {len(dados)} insumos inseridos.")

def importar_produtos():
    print("🥚 Carregando Produtos...")
    df = pd.read_csv(ARQUIVOS_MAPEADOS["produtos"])
    dados = []
    for _, row in df.iterrows():
        composicao_json = []
        if pd.notna(row["Composicao"]):
            try:
                composicao_json = json.loads(row["Composicao"])
            except json.JSONDecodeError:
                composicao_json = []

        dados.append({
            "id": int(row["Id"]),
            "nome": str(row["Nome"]).strip(),
            "preco_padrao": limpar_moeda(row["Preco"]),
            "tipo_ovo": str(row["Tipoovo"]),
            "ovos_por_item": int(row["Ovosporitem"]),
            "composicao": composicao_json
        })
    if dados:
        supabase.table("produtos").insert(dados).execute()
        print(f"✅ {len(dados)} produtos inseridos.")

def importar_producao():
    print("🚜 Carregando Produção Diária...")
    df = pd.read_csv(ARQUIVOS_MAPEADOS["producao_diaria"])
    dados = []
    for _, row in df.iterrows():
        data_formatada = converter_data(row["Data"])
        if not data_formatada:
            continue
        dados.append({
            "id": int(row["Id"]),
            "data_coleta": data_formatada,
            "quantidade_ovos_bons": int(row["Liquido"]),
            "quantidade_ovos_quebrados": int(row["Perda"]),
            "observacoes": f"Tipo: {row['Tipo']} | Bruto: {row['Bruto']}"
        })
    if dados:
        supabase.table("producao_diaria").insert(dados).execute()
        print(f"✅ {len(dados)} registros de produção inseridos.")

def importar_transacoes():
    print("💰 Carregando Transações (Extrato)...")
    
    # Criamos dicionários locais baseados estritamente nos arquivos CSV para checar nomes
    df_cli = pd.read_csv(ARQUIVOS_MAPEADOS["clientes"])
    mapa_clientes = dict(zip(df_cli["Nome"].str.strip(), df_cli["Id"].astype(int)))
    
    df_prod = pd.read_csv(ARQUIVOS_MAPEADOS["produtos"])
    mapa_produtos = dict(zip(df_prod["Nome"].str.strip(), df_prod["Id"].astype(int)))

    df = pd.read_csv(ARQUIVOS_MAPEADOS["transacoes"])
    dados = []
    
    for _, row in df.iterrows():
        data_formatada = converter_data(row["data_transacao"])
        if not data_formatada:
            continue
            
        qtd_valor = 0.0
        if pd.notna(row["Qtd"]):
            try:
                qtd_valor = float(str(row["Qtd"]).replace(",", "."))
            except ValueError:
                qtd_valor = 0.0

        # Resgata o ID correspondente via nome do arquivo original
        nome_cliente = str(row["Cliente"]).strip() if pd.notna(row["Cliente"]) else None
        cliente_id = mapa_clientes.get(nome_cliente) if nome_cliente in mapa_clientes else None
        
        nome_produto = str(row["Produto"]).strip() if pd.notna(row["Produto"]) else None
        if nome_produto and nome_produto.startswith("Badeja"):
            nome_produto = nome_produto.replace("Badeja", "Bandeja")
        produto_id = mapa_produtos.get(nome_produto) if nome_produto in mapa_produtos else None

        dados.append({
            "id": int(row["id"]),
            "data_transacao": data_formatada,
            "tipo": str(row["tipo"]),
            "cliente_id": cliente_id,
            "produto_id": produto_id,
            "quantidade": qtd_valor,
            "valor_unitario": limpar_moeda(row["Valorunitario"]),
            "desconto": limpar_moeda(row["Desconto"]),
            "valor_total": limpar_moeda(row["Valor"]),
            "descricao": str(row["Descricao"]) if pd.notna(row["Descricao"]) else None,
            "status": str(row["Status"]) if pd.notna(row["Status"]) else None,
            "data_pagamento": converter_data(row["Datapagamento"])
        })
        
    if dados:
        supabase.table("transacoes").insert(dados).execute()
        print(f"✅ {len(dados)} transações inseridas com sucesso.")

def importar_plantel():
    print("🐔 Carregando dados do Plantel...")
    df = pd.read_csv(ARQUIVOS_MAPEADOS["plantel"])
    dados = []
    for _, row in df.iterrows():
        dados.append({
            "fase": str(row["Fase"]).lower(), # Padroniza para minúsculo
            "quantidade_aves": int(row["Quantidade de Aves"])
        })
    if dados:
        supabase.table("plantel").upsert(dados).execute() # Evita erro de duplicidade
        print(f"✅ {len(dados)} registros do plantel inseridos.")

if __name__ == "__main__":
    print("🚀 Iniciando Migração Limpa e Direta para o Supabase...\n")
    try:
        importar_clientes()
        importar_insumos()
        importar_produtos()
        importar_producao()
        importar_transacoes()
        importar_plantel()
        print("\n🎉 Banco de dados carregado do zero com sucesso total!")
    except Exception as e:
        print(f"\n❌ Ocorreu um erro durante a importação: {e}")