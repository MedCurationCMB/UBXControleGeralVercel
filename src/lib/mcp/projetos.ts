import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { nomePerfil } from '@/lib/modulos'
import { projetosDoUsuario, type ProjetoAcesso } from '@/lib/projetos'
import { supabaseServer } from '@/lib/supabase/server'
import { falha, ok } from '@/lib/mcp/pedidos'
import { sessaoDe } from '@/lib/mcp/usuario'
import type { SessionPayload, Usuario } from '@/types/database'

// Seleção de projeto, só para quem tem mais de um: `listar_projetos` e um parâmetro opcional `projeto` (nome ou id) em TODAS as outras ferramentas.
// Sem o parâmetro vale o projeto do conector (o ativo no UBX ao clicar em "Permitir"). O servidor é sem estado, então a escolha vale por chamada:
// o Claude repete `projeto` enquanto o usuário estiver trabalhando em outro projeto.
// ponytail: troca a sessão compartilhada `s` no começo de cada chamada; seguro porque cada requisição HTTP traz uma chamada (lote JSON-RPC em paralelo não é usado pelos clientes).
export async function meusProjetos(uid: number): Promise<ProjetoAcesso[]> {
  const { data: u } = await supabaseServer.from('usuarios').select('id, hierarquia').eq('id', uid).maybeSingle<Pick<Usuario, 'id' | 'hierarquia'>>()
  return u ? projetosDoUsuario(u.id, u.hierarquia) : []
}

const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function registrarProjetos(server: McpServer, s: SessionPayload, uid: number, projetos: ProjetoAcesso[]) {
  const base = { ...s }
  const lista = projetos.map(p => `#${p.id} · ${p.nome} · ${nomePerfil(p.papel, p.modulo)}${p.id === base.projetoId ? ' · padrão (projeto do conector)' : ''}`).join('\n')

  server.registerTool('listar_projetos', {
    description: 'Lista os projetos a que o usuário tem acesso. Para trabalhar em outro projeto, informe o parâmetro `projeto` (nome ou id) nas demais ferramentas e repita-o enquanto o usuário estiver nesse projeto.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => ok(`${lista}\nPara usar outro projeto, informe o parâmetro projeto (nome ou id) nas outras ferramentas.`))

  // daqui em diante, toda ferramenta registrada ganha o parâmetro `projeto`
  type Reg = (name: string, cfg: { inputSchema?: Record<string, z.ZodTypeAny> } & Record<string, unknown>, cb: (args: Record<string, unknown>, extra: unknown) => unknown) => unknown
  const registrar = server.registerTool.bind(server) as unknown as Reg
  const comProjeto: Reg = (name, cfg, cb) => registrar(name, {
    ...cfg,
    inputSchema: { ...cfg.inputSchema, projeto: z.string().optional().describe('Só para quem tem mais de um projeto: nome ou id do projeto desta chamada (padrão: o projeto do conector; veja listar_projetos)') },
  }, async (args, extra) => {
    const { projeto, ...resto } = args as { projeto?: string } & Record<string, unknown>
    Object.assign(s, base) // sempre parte do projeto do conector
    if (projeto?.trim()) {
      const q = projeto.trim()
      const achados = /^\d+$/.test(q) ? projetos.filter(p => p.id === Number(q))
        : projetos.filter(p => norm(p.nome) === norm(q)).length === 1 ? projetos.filter(p => norm(p.nome) === norm(q)) : projetos.filter(p => norm(p.nome).includes(norm(q)))
      if (achados.length !== 1) return falha(`${achados.length ? 'Projeto ambíguo' : `Projeto "${q}" não encontrado`}. Seus projetos:\n${lista}`)
      const novo = await sessaoDe(uid, achados[0].id)
      if (!novo) return falha('Sem acesso a esse projeto.')
      Object.assign(s, novo)
    }
    return cb(resto, extra)
  })
  server.registerTool = comProjeto as unknown as typeof server.registerTool
}
