# Contexto da Migração — CMB Gestão (Streamlit → Next.js)

## Visão Geral

Estamos migrando um sistema de gestão financeira (pagamentos e recebimentos) de **Python/Streamlit** para **Next.js 15 (App Router)**. O código Python original está em:

```
C:\Users\rhuan\Documents\Projetos-Trabalhos\UBXControleGeral\
```

O projeto Next.js migrado está em:

```
C:\Users\rhuan\Documents\Projetos-Trabalhos\UBXControleGeralVercel\
```

---

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router) |
| Linguagem | TypeScript |
| Estilo | Tailwind CSS |
| Banco de dados | Supabase (PostgreSQL via PostgREST) |
| Storage de arquivos | Backblaze B2 |
| IA (análise de docs) | Google Gemini `gemini-2.0-flash` |
| Geração de DOCX | `pizzip` + `docxtemplater` |
| Ícones | Lucide React |

### Variáveis de ambiente (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://biswoctezxmkirsubxbi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
B2_KEY_ID=09d1032992d2
B2_APPLICATION_KEY=...
B2_BUCKET_NAME=cmb-capital-pedidos
GEMINI_API_KEY=AIzaSyBM-0pJ_wtvKQGf6Q6OOt6kQlakM9xAJjE
SESSION_SECRET=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Estrutura de Rotas

```
src/app/
├── page.tsx                          → redireciona para /inicio
├── (auth)/login/page.tsx
└── (dashboard)/
    ├── layout.tsx                    → verifica sessão, renderiza Sidebar + Header
    ├── inicio/page.tsx               ← Página Inicial (grid de links)
    ├── empresas/page.tsx             ← Empresas / Centros de Custo
    ├── admin/page.tsx                ← Painel Administrativo (4 abas)
    └── pagamentos/
        ├── page.tsx                  ← Visão Geral Pagamentos
        ├── acompanhar/
        │   ├── page.tsx              ← Lista com paginação server-side (100/pág)
        │   └── [id]/page.tsx         ← Detalhe do pedido (todos os modais)
        ├── autorizar/
        │   ├── page.tsx              ← Lista de pedidos para autorizar
        │   └── [id]/page.tsx         ← Detalhe + ações de autorização
        ├── solicitar/page.tsx
        ├── controle/page.tsx         ← Controle de Pagamentos (complexo — ver notas)
        ├── documentos/page.tsx
        ├── fornecedores/page.tsx
        ├── contas/page.tsx
        ├── categorias/page.tsx
        ├── orcamento/page.tsx
        ├── registrar-orcamento/page.tsx
        ├── cadastros/page.tsx
        └── modelos-contrato/page.tsx
```

As rotas de `recebimentos/` espelham `pagamentos/` com a mesma estrutura.

---

## API Routes Criadas

### `GET /api/b2/file?fileId=xxx`
Proxy para download de arquivos do Backblaze B2. **Sempre usar este endpoint** para visualizar arquivos — as URLs diretas (`anexo_url`) expiram rapidamente.

```typescript
// src/app/api/b2/file/route.ts
// Usa downloadFileById(fileId) da lib/b2.ts
// Retorna o arquivo com Content-Type correto
```

### `GET /api/pedidos/[id]/analise`
Análise de documento via Gemini AI. Busca `arquivo_texto` do pedido e envia ao Gemini. Retorna análise em texto ou erro específico para:
- `sem_documento`: pedido sem texto OCR
- Status 429: cota Gemini excedida (mensagem amigável em PT-BR)

### `POST /api/pedidos/[id]/gerar-contrato`
Gera contrato DOCX combinando template variável + estático do B2.
- Body: `{ modelo_variavel_id: number, modelo_estatico_id: number }`
- Usa `pizzip` + `docxtemplater` para substituir placeholders `{campo}`
- Combina dois DOCX com quebra de página entre eles via XML manipulation
- Placeholders suportados: `{id}`, `{empresa}`, `{fornecedor}`, `{valor_pedido}`, `{mes_ano_1}`, `{valor_referente_1}`, etc.

### `/api/auth/me`
Retorna `{ username, hierarquia }` da sessão atual.

### `/api/documentos/upload`
Upload de arquivo para B2. FormData com: `file`, `pedido_id`, `tipo_documento` (não `tipo_documento_id`).

---

## Bugs Críticos Já Corrigidos

### 1. Coluna `tipos_documento.tipo` (não `nome`)
A tabela `tipos_documento` tem coluna `tipo`, **não** `nome`. Usar `nome` causa erro 400 do Supabase.

```typescript
// ERRADO:
supabase.from('tipos_documento').select('id, nome').order('nome')
// CORRETO:
supabase.from('tipos_documento').select('id, tipo').order('tipo')

// ERRADO na interface:
interface TipoDoc { id: number; nome: string }
// CORRETO:
interface TipoDoc { id: number; tipo: string }
```

### 2. Tabela `pedidos_solicitados_fluxo` — sem coluna `mes_ano`
A tabela tem colunas `mes` (int) e `ano` (int) separadas. `mes_ano` não existe.

```typescript
// ERRADO:
.order('mes_ano')
// CORRETO:
.order('ano').order('mes')

// ERRADO na interface:
interface FluxoRow { mes_ano: string; ... }
// CORRETO:
interface FluxoRow { mes: number; ano: number; ... }

// Display:
`${r.mes}/${r.ano}` // não r.mes_ano
```

### 3. URLs B2 expiram — usar proxy
URLs salvas em `documentos.anexo_url` expiram. Sempre usar `anexo_id` + proxy:

```typescript
// ERRADO:
<a href={doc.anexo_url}>Ver</a>
// CORRETO:
<a href={`/api/b2/file?fileId=${doc.anexo_id}`}>Ver</a>
```

### 4. Anexos de comentários — via `documentos.comentario_id`
Comentários **não** guardam `anexo_url` diretamente. O arquivo fica em `documentos` com `comentario_id` preenchido.

```typescript
// Buscar anexos de comentários:
const { data: docAnexos } = await supabase
  .from('documentos')
  .select('comentario_id, anexo_id')
  .eq('pedido_id', pedidoId)
  .not('comentario_id', 'is', null)

const docByComment: Record<number, string> = {}
for (const d of docAnexos ?? []) {
  if (d.comentario_id && d.anexo_id) docByComment[d.comentario_id] = d.anexo_id
}

// Display:
{docByComment[c.id] && (
  <a href={`/api/b2/file?fileId=${docByComment[c.id]}`}>Ver anexo</a>
)}
```

### 5. Coluna `documentos` — nomes corretos
```typescript
interface Documento {
  id: number
  nome_documento: string    // não nome_arquivo
  anexo_id: string | null   // usar para proxy B2
  anexo_url: string | null  // não usar para links (expira)
  tipo_documento: number | null  // não tipo_documento_id
  data_upload: string       // não created_at
  comentario_id: number | null
}
```

### 6. Gemini — modelo correto
- `gemini-2.0-flash` ✅ funciona
- `gemini-1.5-flash` ❌ retorna 404 para esta chave de API
- A chave vem da tabela `assistente_virtual` (campo `chave`, where `vigente=true`)
- Fallback: variável de ambiente `GEMINI_API_KEY`

### 7. Upload de documento — campo correto
```typescript
// ERRADO:
fd.append('tipo_documento_id', String(tipoId))
// CORRETO:
fd.append('tipo_documento', String(tipoId))
```

---

## Padrões e Convenções do Projeto

### Autenticação e Hierarquia
- Hierarquias: `user`, `admin`, `owner`
- Owner: acesso total (incluindo Painel Administrativo)
- Admin/Owner: acesso a páginas `adminOnly` (Autorizar Pedidos, etc.)
- Sessão verificada via `getSession()` no layout (server component)

### Paginação Server-Side (`/pagamentos/acompanhar`)
- 100 registros por página via `.range(page * 100, (page + 1) * 100 - 1)`
- Contagem total via `{ count: 'exact' }`
- Filtros server-side com `.eq()` para dropdowns (empresa, categoria, fornecedor, status)
- Opções dos dropdowns: queries separadas de coluna única no mount
- Busca por ID: `.eq('id', n)` bypassa paginação (triggered por Enter)

### Sidebar Colapsável
- Estado em `localStorage` com chave `sidebar-collapsed`
- Inicia colapsada (`true`)
- Colapsada: `w-14`, só ícones, tooltip nativo via `title`
- Expandida: `w-60`, ícones + labels
- Scrollbar da nav escondida via `.scrollbar-none` (CSS global)
- Botão toggle: faixa fina no topo da sidebar

### Controle de Pagamentos — Pendente (complexo)
Esta página ainda usa fetch de todos os dados de uma vez e filtragem client-side. Problemas para implementar paginação server-side:
1. `situacao` (Em dia/Atrasado/Quitado) é computada client-side com base em `data_vencimento` vs hoje — não existe como coluna no banco
2. Cards de resumo (Total a Pagar, Total Pago) precisam refletir TODOS os registros filtrados, não só a página atual
3. Modal "Alterar Status em Lote" precisa de todos os registros matching o filtro

**Solução recomendada:** criar uma View no Supabase com `situacao` computada + queries de agregação separadas para os cards.

---

## Páginas Implementadas

| Página | Status | Observações |
|---|---|---|
| `/inicio` | ✅ Completo | Grid de navegação rápida |
| `/pagamentos` | ✅ Completo | Visão Geral com gráficos |
| `/pagamentos/acompanhar` | ✅ Completo | Paginação server-side + filtros |
| `/pagamentos/acompanhar/[id]` | ✅ Completo | Todos os modais implementados |
| `/pagamentos/autorizar` | ✅ Completo | Lista de pedidos pendentes |
| `/pagamentos/autorizar/[id]` | ✅ Completo | Mesmos fixes do acompanhar |
| `/pagamentos/solicitar` | ✅ Completo | Formulário de solicitação |
| `/pagamentos/controle` | ⚠️ Parcial | Funciona mas tem limite 1000 rows |
| `/pagamentos/documentos` | ✅ Completo | |
| `/pagamentos/fornecedores` | ✅ Completo | |
| `/pagamentos/contas` | ✅ Completo | |
| `/pagamentos/categorias` | ✅ Completo | |
| `/pagamentos/orcamento` | ✅ Completo | |
| `/pagamentos/cadastros` | ✅ Completo | |
| `/pagamentos/modelos-contrato` | ✅ Completo | |
| `/empresas` | ✅ Completo | Lista + cadastro |
| `/admin` | ✅ Completo | 4 abas: Logo, Usuários, Assistente Virtual, E-mails+SMTP |
| `/recebimentos/*` | ⏳ Pendente | Maioria mostrando "Em desenvolvimento" |

---

## Tabelas do Banco Relevantes

| Tabela | Colunas importantes |
|---|---|
| `pedidos_solicitados` | `id`, `empresa`, `categoria`, `fornecedor`, `valor_pedido`, `status`, `emergencia`, `cancelado`, `arquivo_texto`, `analise_texto`, `arquivos_pdf_ids` (array de B2 fileIds) |
| `pedidos_solicitados_fluxo` | `id`, `pedido_id`, `mes` (int), `ano` (int), `valor_referente`, `status` |
| `documentos` | `id`, `pedido_id`, `nome_documento`, `anexo_id` (B2 fileId), `anexo_url` (expira), `tipo_documento` (FK), `data_upload`, `comentario_id` |
| `tipos_documento` | `id`, `tipo` ← coluna chama-se `tipo`, não `nome` |
| `comentarios` | `id`, `pedido_id`, `comentario`, `usuario`, `data_comentario`, `tipo_documento` |
| `controle_pagamentos` | `id`, `pedido_id`, `data_vencimento`, `valor_pagar`, `data_pagamento`, `valor_pagamento`, `status_pagamento` (FK), `tipo_pagamento` (FK) |
| `assistente_virtual` | `id`, `chave`, `vigente`, `created_at` |
| `usuarios` | `id`, `username`, `email`, `status_cadastro`, `hierarquia` |
| `email_config` | `id`, `tipo`, `ativo`, `segunda`, `terça`, `quarta`, `quinta`, `sexta` |
| `smtp_config` | `id`, `smtp_user`, `smtp_pass`, `email_from`, `smtp_host`, `smtp_port`, `vigente`, `created_at` |
| `modelo_contrato` | `id`, `nome`, `tipo` (`variavel`/`estatico`), `arquivo_id` (B2 fileId) |
| `empresas` | `id`, `empresa` |
| `config` | `chave`, `valor` — para logo (base64 com chave `logo`) |

---

## Componentes Reutilizáveis

- `src/components/ui/Modal.tsx` — modal genérico com `open`, `onClose`, `title`, `size`
- `src/components/ui/Confirm.tsx` — dialog de confirmação
- `src/components/layout/Sidebar.tsx` — sidebar colapsável
- `src/components/layout/Header.tsx` — header com usuário e logout

---

## Próximos Passos Sugeridos

1. **Módulo de Recebimentos** — espelhar as páginas do módulo de Pagamentos já implementadas
2. **Controle de Pagamentos** — implementar View no Supabase com `situacao` computada e queries de agregação para os cards de resumo
3. **Páginas restantes** ainda como "Em desenvolvimento" — ver arquivos Python correspondentes em `pages/`

---

## Referência dos Arquivos Python Originais

```
Pagina_Inicial.py
pages/1_Visao_Geral_(Pagamentos).py
pages/2_Autorizar_Pedidos_(Pagamentos).py
pages/3_Acompanhar_Pedidos_Solicitados_(Pagamentos).py
pages/4_Solicitar_Pedidos_(Pagamentos).py
pages/5_Empresas_ou_Centros_de_Custo.py
pages/5_Contas_Pagadoras.py
pages/6_Categorias_(Pagamentos).py
pages/7_Fornecedores.py
pages/8_Orçamento_de_Compras.py
pages/9_Registrar_Orçamento_de_Compra.py
pages/11_Controle_de_Pagamentos.py
pages/11_Gestão_de_Documentos_(Pagamentos).py
pages/11_Painel_Administrativo.py
pages/12_Controle_de_Cadastros_(Pagamentos).py
pages/10_Modelos_de_Contrato.py
[equivalentes de Recebimentos]
```
