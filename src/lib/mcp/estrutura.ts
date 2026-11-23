import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TAB_PEDIDO } from '@/lib/ajuste'
import { UFS, validarCpfCnpj } from '@/lib/cadastros'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import { veModulo } from '@/lib/modulos'
import { falha, modulo, ok } from '@/lib/mcp/pedidos'
import type { SessionPayload } from '@/types/database'

// Estrutura do cadastro: centros de resultado, categorias e contas bancárias pagadoras, com as regras das telas.
// Centro: qualquer perfil que não seja restrito a alguns centros cria; renomear e copiar categorias é só de administrador dos dois módulos (ou dono).
// Categoria: quem vê o módulo. Conta bancária: a mesma tabela (conta_pagador) serve aos dois módulos. Excluir centro/conta bancária não existe aqui.
const CONTA_COLS = ['id', 'nome_empresa', 'cnpj', 'agencia', 'digito_agencia', 'conta_corrente', 'digito_conta', 'rua_av', 'numero_local', 'complemento', 'cidade', 'estado', 'cep'] as const
const num = z.number().int().nonnegative()

export function registrarEstrutura(server: McpServer, s: SessionPayload) {
  const db = () => clienteDoUsuario(s)
  const adminDosDois = () => (s.hierarquia === 'admin' && !s.modulo) || s.hierarquia === 'owner' // função: a sessão pode trocar de projeto durante a chamada

  async function centro(nome: string) {
    const { data } = await (await db()).from('empresas').select('id, empresa').eq('empresa', nome).maybeSingle()
    return data as { id: string; empresa: string } | null
  }
  const existeCentro = async (nome: string) => {
    const { data } = await (await db()).from('empresas').select('id').ilike('empresa', nome.replace(/[%_\\]/g, m => `\\${m}`)).limit(1)
    return !!data?.length
  }
  const preview = (resumo: string) => ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)

  server.registerTool('criar_centro', {
    description: 'Cria um centro de resultado, opcionalmente já copiando as categorias de outro centro (pagamentos e recebimentos; as existentes são mantidas). ' +
      'Perfil restrito a alguns centros não cria. Quem pode ver o centro é definido pelo administrador na tela de Projetos e Acessos. Use confirmar=false antes, como nas outras escritas.',
    inputSchema: { nome: z.string().min(2), copiar_categorias_de: z.string().optional().describe('nome exato de um centro existente'), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ nome, copiar_categorias_de, confirmar }) => {
    if (s.restrito) return falha('Seu perfil vê só alguns centros de resultado e não cadastra centros novos.')
    nome = nome.trim()
    if (await existeCentro(nome)) return falha(`Já existe um centro com o nome "${nome}".`)
    const origem = copiar_categorias_de ? await centro(copiar_categorias_de) : null
    if (copiar_categorias_de && !origem) return falha(`Centro "${copiar_categorias_de}" não encontrado (use o nome exato; buscar_cadastro ajuda).`)
    const resumo = `CRIAR centro de resultado "${nome}"${origem ? ` copiando as categorias de "${origem.empresa}"` : ''}`
    if (!confirmar) return preview(resumo)
    const cli = await db()
    const { data, error } = await cli.from('empresas').insert({ empresa: nome }).select('id').single()
    if (error) return falha(`Erro ao cadastrar: ${error.message}`)
    let extra = ''
    if (origem) {
      const r = await cli.rpc('empresa_copiar_categorias', { p_origem: origem.id, p_destino: data.id })
      extra = r.error ? ` Mas a cópia das categorias falhou: ${r.error.message}` : ` ${r.data.pagamentos} categoria(s) de pagamentos e ${r.data.recebimentos} de recebimentos copiadas.`
    }
    return ok(`Feito: ${resumo}.${extra}`)
  })

  server.registerTool('renomear_centro', {
    description: 'Renomeia um centro de resultado (o banco atualiza as referências em pedidos, orçamentos e categorias). Só administrador dos dois módulos (ou dono). Use confirmar=false antes.',
    inputSchema: { centro: z.string().describe('nome exato atual'), novo_nome: z.string().min(2), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ centro: nome, novo_nome, confirmar }) => {
    if (!adminDosDois()) return falha('Só administrador (dos dois módulos) ou dono renomeia centros.')
    const c = await centro(nome)
    if (!c) return falha(`Centro "${nome}" não encontrado (use o nome exato).`)
    novo_nome = novo_nome.trim()
    if (novo_nome === c.empresa) return falha('O novo nome é igual ao atual.')
    if (await existeCentro(novo_nome)) return falha(`Já existe um centro com o nome "${novo_nome}".`)
    const resumo = `RENOMEAR centro "${c.empresa}" → "${novo_nome}"`
    if (!confirmar) return preview(resumo)
    const { error } = await (await db()).rpc('empresa_renomear', { p_id: c.id, p_novo: novo_nome })
    return error ? falha(error.message) : ok(`Feito: ${resumo}`)
  })

  server.registerTool('copiar_categorias', {
    description: 'Copia as categorias (pagamentos e recebimentos) de um centro para outro. As que já existem são mantidas; nada é removido. Só administrador dos dois módulos (ou dono).',
    inputSchema: { origem: z.string(), destino: z.string(), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ origem, destino, confirmar }) => {
    if (!adminDosDois()) return falha('Só administrador (dos dois módulos) ou dono copia categorias entre centros.')
    const [o, d] = await Promise.all([centro(origem), centro(destino)])
    if (!o || !d) return falha(`Centro "${!o ? origem : destino}" não encontrado (use o nome exato).`)
    if (o.id === d.id) return falha('Origem e destino são o mesmo centro.')
    const resumo = `COPIAR categorias de "${o.empresa}" para "${d.empresa}"`
    if (!confirmar) return preview(resumo)
    const r = await (await db()).rpc('empresa_copiar_categorias', { p_origem: o.id, p_destino: d.id })
    return r.error ? falha(r.error.message) : ok(`Feito: ${resumo}. ${r.data.pagamentos} categoria(s) de pagamentos e ${r.data.recebimentos} de recebimentos copiadas.`)
  })

  async function categoria(m: 'pagamentos' | 'recebimentos', centroNome: string, nome: string) {
    const { data } = await (await db()).from(TAB_PEDIDO[m].categorias).select('id, empresa, categoria').eq('empresa', centroNome).eq('categoria', nome).maybeSingle()
    return data as { id: string; empresa: string; categoria: string } | null
  }

  server.registerTool('criar_categoria', {
    description: 'Cria uma categoria num centro de resultado (pagamentos = categorias de despesa; recebimentos = de receita). Use confirmar=false antes.',
    inputSchema: { modulo, centro: z.string().describe('nome exato do centro'), categoria: z.string().min(1), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, centro: cn, categoria: nome, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    if (!(await centro(cn))) return falha(`Centro "${cn}" não encontrado (use o nome exato).`)
    nome = nome.trim()
    if (await categoria(m, cn, nome)) return falha(`A categoria "${nome}" já existe no centro "${cn}".`)
    const resumo = `CRIAR categoria (${m}): ${cn} / ${nome}`
    if (!confirmar) return preview(resumo)
    const { error } = await (await db()).from(TAB_PEDIDO[m].categorias).insert({ empresa: cn, categoria: nome })
    return error ? falha(error.message) : ok(`Feito: ${resumo}`)
  })

  server.registerTool('renomear_categoria', {
    description: 'Renomeia uma categoria de um centro; as referências (orçamentos, pedidos) acompanham pelo banco. Use confirmar=false antes.',
    inputSchema: { modulo, centro: z.string(), categoria: z.string().describe('nome exato atual'), novo_nome: z.string().min(1), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, centro: cn, categoria: nome, novo_nome, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const c = await categoria(m, cn, nome)
    if (!c) return falha(`Categoria "${nome}" não encontrada no centro "${cn}" (use os nomes exatos).`)
    novo_nome = novo_nome.trim()
    if (novo_nome === c.categoria) return falha('O novo nome é igual ao atual.')
    if (await categoria(m, cn, novo_nome)) return falha(`A categoria "${novo_nome}" já existe no centro "${cn}".`)
    const resumo = `RENOMEAR categoria (${m}): ${cn} / ${c.categoria} → ${novo_nome}`
    if (!confirmar) return preview(resumo)
    const { error } = await (await db()).from(TAB_PEDIDO[m].categorias).update({ categoria: novo_nome }).eq('id', c.id)
    return error ? falha(error.message) : ok(`Feito: ${resumo}`)
  })

  server.registerTool('excluir_categoria', {
    description: 'Exclui uma categoria de um centro. O banco recusa se houver registros dependentes (pedidos, orçamentos). Use confirmar=false antes e confirme com o usuário: não dá para desfazer.',
    inputSchema: { modulo, centro: z.string(), categoria: z.string(), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, centro: cn, categoria: nome, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const c = await categoria(m, cn, nome)
    if (!c) return falha(`Categoria "${nome}" não encontrada no centro "${cn}" (use os nomes exatos).`)
    const resumo = `EXCLUIR categoria (${m}): ${cn} / ${c.categoria}`
    if (!confirmar) return preview(resumo)
    const { error } = await (await db()).from(TAB_PEDIDO[m].categorias).delete().eq('id', c.id)
    return error ? falha(error.code === '23503' ? 'Não é possível excluir: existem registros dependentes.' : error.message) : ok(`Feito: ${resumo}`)
  })

  // Contas bancárias da empresa (conta_pagador, usada nas remessas e nos dois módulos)
  server.registerTool('listar_contas_bancarias', {
    description: 'Lista as contas bancárias da empresa (pagadoras), usadas nas remessas.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const { data, error } = await (await db()).from('conta_pagador').select(CONTA_COLS.join(', ')).order('nome_empresa')
    if (error) return falha(error.message)
    if (!data?.length) return ok('Nenhuma conta bancária cadastrada.')
    return ok((data as unknown as Record<string, string | number | null>[]).map(c =>
      `#${c.id} · ${c.nome_empresa} · CNPJ ${c.cnpj ? String(c.cnpj).padStart(14, '0') : '-'} · ag ${c.agencia ?? '-'}${c.digito_agencia != null ? `-${c.digito_agencia}` : ''} · cc ${c.conta_corrente ?? '-'}${c.digito_conta != null ? `-${c.digito_conta}` : ''}${c.cidade ? ` · ${c.cidade}/${c.estado ?? ''}` : ''}`).join('\n'))
  })

  server.registerTool('salvar_conta_bancaria', {
    description: 'Cadastra (sem id) ou edita (com id) uma conta bancária da empresa. Na edição só muda os campos informados. CNPJ/CPF com 11 ou 14 dígitos; agência, conta e dígitos só números. Excluir não está disponível. Use confirmar=false antes.',
    inputSchema: {
      id: z.number().int().optional().describe('omitido = cadastrar nova'), nome_empresa: z.string().optional(), cnpj: z.string().optional(),
      agencia: num.optional(), digito_agencia: num.optional(), conta_corrente: z.number().int().positive().optional(), digito_conta: num.optional(),
      rua_av: z.string().optional(), numero_local: num.optional(), complemento: z.string().optional(), cidade: z.string().optional(),
      estado: z.string().length(2).optional().describe('UF'), cep: z.string().optional(), confirmar: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  }, async ({ id, confirmar, cnpj, cep, estado, ...campos }) => {
    const cli = await db()
    let atual: Record<string, unknown> = {}
    if (id) {
      const { data } = await cli.from('conta_pagador').select('*').eq('id', id).maybeSingle()
      if (!data) return falha(`Conta bancária #${id} não encontrada.`)
      atual = data
    }
    const novo: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(campos)) if (v !== undefined) novo[k] = typeof v === 'string' ? v.trim() : v
    if (cnpj !== undefined) {
      const v = validarCpfCnpj(cnpj)
      if (!v.ok) return falha('CNPJ/CPF inválido — informe 11 ou 14 dígitos.')
      novo.cnpj = Number(v.digitos)
    }
    if (cep !== undefined) {
      const d = cep.replace(/\D/g, '')
      if (d.length !== 8) return falha('CEP inválido — informe 8 dígitos.')
      novo.cep = Number(d)
    }
    if (estado !== undefined) {
      if (!UFS.includes(estado.toUpperCase())) return falha('UF inválida.')
      novo.estado = estado.toUpperCase()
    }
    if (!String(novo.nome_empresa ?? atual.nome_empresa ?? '').trim()) return falha('Nome da empresa é obrigatório.')
    if (!Object.keys(novo).length) return falha('Nada para alterar: informe ao menos um campo.')
    const resumo = `${id ? `EDITAR conta bancária #${id}` : 'CADASTRAR conta bancária'}\n` + Object.entries(novo).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    if (!confirmar) return preview(resumo)
    const { data, error } = id
      ? await cli.from('conta_pagador').update(novo).eq('id', id).select('id').single()
      : await cli.from('conta_pagador').insert(novo).select('id').single()
    return error ? falha(error.message) : ok(`Feito: conta bancária #${data.id} ${id ? 'atualizada' : 'cadastrada'}.\n${resumo}`)
  })
}
