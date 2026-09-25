import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('documentos')
    .select('id, nome_documento, tipo_documento, anexo_id, data_upload')
    .in('tipo_documento', [-3, -4, -5])
    .eq('projeto_id', session.projetoId)
    .order('data_upload', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const arquivos = (data ?? []).map(d => ({
    id: d.id,
    nome: d.nome_documento,
    tipo: d.tipo_documento === -3 ? 'Arquivo de Remessa'
        : d.tipo_documento === -4 ? 'Arquivo de Retorno'
        : 'Relatório PDF de Remessa',
    file_id: d.anexo_id,
    data_upload: d.data_upload,
  }))

  return NextResponse.json(arquivos)
}
