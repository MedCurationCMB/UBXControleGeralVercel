import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TAB_PEDIDO } from '@/lib/ajuste'
import { UFS, formatarChaveTelefone, formatarCpfCnpj, validarCpfCnpj } from '@/lib/cadastros'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import { veModulo, type Modulo } from '@/lib/modulos'
import { falha, modulo, ok } from '@/lib/mcp/pedidos'
import type { SessionPayload } from '@/types/database'

const limpa = (s: string) => s.replace(/[%,()]/g, '').trim() // vai num ilike
const PARCEIRO = { fornecedor: { tabela: 'fornecedores', mod: 'pagamentos' }, cliente: { tabela: 'clientes', mod: 'recebimentos' } } as const satisfies Record<string, { tabela: string; mod: Modulo }>
const completo = (f: Record<string, unknown>) => ['cnpj_cpf', 'rua_avenida', 'numero', 'bairro', 'cidade', 'estado', 'cep', 'tipo_chave', 'chave_pix'].every(k => f[k])

// Buscas (para achar o nome exato que as outras ferramentas pedem) e cadastro de fornecedor/cliente, com as regras das telas.
export function registrarCadastros(server: McpServer, s: SessionPayload) {
  const db = () => clienteDoUsuario(s)

  server.registerTool('buscar_cadastro', {
    description: 'Busca o NOME EXATO de fornecedor, cliente, centro de resultado ou categoria (as demais ferramentas exigem o nome exato). ' +
      'Use sempre antes de criar pedido/requisição/orçamento. Categoria precisa do módulo e, se quiser, do centro.',
    inputSchema: {
      tipo: z.enum(['fornecedor', 'cliente', 'centro', 'categoria']),
      busca: z.string().optional().describe('parte do nome'),
      centro: z.string().optional().describe('só para tipo=categoria: parte do nome do centro'),
      modulo: modulo.optional().describe('obrigatório para tipo=categoria'),
      limite: z.number().int().min(1).max(100).default(30),
    },
    annotations: { readOnlyHint: true },
  }, async ({ tipo, busca, centro, modulo: m, limite }) => {
    const cli = await db()
    const b = busca ? limpa(busca) : ''
    if (tipo === 'fornecedor' || tipo === 'cliente') {
      const p = PARCEIRO[tipo]
      if (!veModulo(s.modulo, p.mod)) return falha('Seu perfil não acessa este módulo.')
      let q = cli.from(p.tabela).select('id, nome, cnpj_cpf, cidade, estado, rua_avenida, numero, bairro, cep, tipo_chave, chave_pix')
      if (b) q = q.ilike('nome', `%${b}%`)
      const { data, error } = await q.order('nome').limit(limite)
      if (error) return falha(error.message)
      if (!data?.length) return ok('Nenhum cadastro encontrado.')
      return ok(data.map(f => `#${f.id} · ${f.nome} · ${f.cnpj_cpf || 'sem CPF/CNPJ'}${f.cidade ? ` · ${f.cidade}/${f.estado ?? ''}` : ''}${completo(f) ? '' : ' · cadastro incompleto (falta endereço/Pix)'}`).join('\n'))
    }
    if (tipo === 'centro') {
      let q = cli.from('empresas').select('empresa')
      if (b) q = q.ilike('empresa', `%${b}%`)
      const { data, error } = await q.order('empresa').limit(limite)
      if (error) return falha(error.message)
      return ok(data?.length ? data.map(r => r.empresa).join('\n') : 'Nenhum centro encontrado.')
    }
    if (!m) return falha('Informe o módulo para buscar categorias.')
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    let q = cli.from(TAB_PEDIDO[m].categorias).select('empresa, categoria')
    if (centro) q = q.ilike('empresa', `%${limpa(centro)}%`)
    if (b) q = q.ilike('categoria', `%${b}%`)
    const { data, error } = await q.order('empresa').order('categoria').limit(limite)
    if (error) return falha(error.message)
    return ok(data?.length ? data.map(r => `${r.empresa} / ${r.categoria}`).join('\n') : 'Nenhuma categoria encontrada.')
  })

  // Escrita em dois passos: sem confirmar=true só confere as regras e mostra o que seria feito.
  server.registerTool('salvar_parceiro', {
    description: 'Cadastra (sem id) ou edita (com id) um fornecedor (pagamentos) ou cliente (recebimentos). Na edição só muda os campos informados. ' +
      'Regras da tela: nome obrigatório e único; CPF/CNPJ com 11 ou 14 dígitos; tipo de chave Pix: Telefone, E-mail, CPF/CNPJ ou Chave Aleatória (CPF/CNPJ usa o próprio CPF/CNPJ como chave). Excluir não está disponível. ' +
      'Chame primeiro com confirmar=false, mostre o resumo e só use confirmar=true depois do OK do usuário.',
    inputSchema: {
      tipo: z.enum(['fornecedor', 'cliente']), id: z.number().int().optional().describe('omitido = cadastrar novo'),
      nome: z.string().optional(), cnpj_cpf: z.string().optional(),
      rua_avenida: z.string().optional(), numero: z.string().optional(), complemento: z.string().optional(), bairro: z.string().optional(),
      cidade: z.string().optional(), estado: z.string().length(2).optional().describe('UF, ex.: CE'), cep: z.string().optional(),
      tipo_chave: z.enum(['Telefone', 'E-mail', 'CPF/CNPJ', 'Chave Aleatória']).optional(), chave_pix: z.string().optional(),
      confirmar: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  }, async ({ tipo, id, confirmar, ...campos }) => {
    const p = PARCEIRO[tipo]
    if (!veModulo(s.modulo, p.mod)) return falha('Seu perfil não acessa este módulo.')
    const cli = await db()

    let atual: Record<string, unknown> = {}
    if (id) {
      const { data } = await cli.from(p.tabela).select('*').eq('id', id).maybeSingle()
      if (!data) return falha(`${tipo === 'fornecedor' ? 'Fornecedor' : 'Cliente'} #${id} não encontrado.`)
      atual = data
    }
    const novo: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(campos)) if (v !== undefined && k !== 'tipo_chave') novo[k] = typeof v === 'string' ? v.trim() : v
    const form = { ...atual, ...novo } as Record<string, string | number | null>

    const nome = String(form.nome ?? '').trim()
    if (!nome) return falha('Nome é obrigatório.')
    novo.nome = nome
    if (!id || novo.nome !== atual.nome) { // nome é a chave usada nos pedidos: não pode repetir
      const { data: igual } = await cli.from(p.tabela).select('id').ilike('nome', nome.replace(/[%_\\]/g, m => `\\${m}`)).limit(1)
      if (igual?.length && igual[0].id !== id) return falha(`Já existe cadastro com esse nome (#${igual[0].id}). Para alterar, informe id=${igual[0].id}.`)
    }
    if (form.estado && !UFS.includes(String(form.estado).toUpperCase())) return falha('UF inválida.')
    if (novo.estado) novo.estado = String(novo.estado).toUpperCase()

    if (form.cnpj_cpf) {
      const v = validarCpfCnpj(String(form.cnpj_cpf))
      if (!v.ok) return falha('CPF/CNPJ inválido — informe 11 (CPF) ou 14 (CNPJ) dígitos.')
      if (novo.cnpj_cpf) novo.cnpj_cpf = formatarCpfCnpj(v.digitos)
      form.cnpj_cpf = formatarCpfCnpj(v.digitos)
    }

    if (campos.tipo_chave) {
      const { data: tc } = await cli.from('tipos_chave').select('id').eq('tipo', campos.tipo_chave).maybeSingle()
      if (!tc) return falha('Tipo de chave Pix não encontrado.')
      novo.tipo_chave = form.tipo_chave = tc.id
    }
    if (form.tipo_chave) {
      const { data: tc } = await cli.from('tipos_chave').select('tipo').eq('id', form.tipo_chave).maybeSingle()
      const t = tc?.tipo as string | undefined
      if (t === 'CPF/CNPJ') {
        if (!form.cnpj_cpf) return falha('Chave Pix do tipo CPF/CNPJ exige o CPF/CNPJ do cadastro.')
        novo.chave_pix = form.cnpj_cpf
      } else if (t === 'Telefone' && tipo === 'fornecedor' && form.chave_pix && (novo.chave_pix !== undefined || campos.tipo_chave)) {
        const f = formatarChaveTelefone(String(form.chave_pix))
        if (!f.ok) return falha('Telefone inválido — informe DDD + número (ex.: 11999999999).')
        novo.chave_pix = f.chave
      }
    }

    if (id && Object.keys(novo).length === 1 && novo.nome === atual.nome) return falha('Nada para alterar: informe ao menos um campo novo.')
    const resumo = `${id ? `EDITAR ${tipo} #${id}` : `CADASTRAR ${tipo}`}: ${nome}\n` +
      Object.entries(novo).filter(([k]) => k !== 'nome' || !id || novo.nome !== atual.nome).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)

    const { data, error } = id
      ? await cli.from(p.tabela).update(novo).eq('id', id).select('id').single()
      : await cli.from(p.tabela).insert(novo).select('id').single()
    return error ? falha(error.message) : ok(`Feito: ${tipo} #${data.id} ${id ? 'atualizado' : 'cadastrado'}.\n${resumo}`)
  })
}
