// Tipos gerados a partir do schema.sql — mapeamento 1:1 com as tabelas Supabase

// ─── ENUMs ────────────────────────────────────────────────────────────────────

export type StatusCadastroEnum = 'Aguardando Autorização' | 'Autorizado' | 'Não Autorizado'
export type StatusKanban = 'A Fazer' | 'Fazendo' | 'Feito'
export type StatusPedido = 'Autorizado' | 'Não Autorizado' | 'Aguardando Autorização'
export type TipoHierarquia = 'user' | 'admin' | 'owner'

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export interface Usuario {
  id: number
  username: string
  password: string
  email: string
  hierarquia: TipoHierarquia
  status_cadastro: StatusCadastroEnum | null
}

export interface ResetToken {
  id: string
  email: string
  token: string
  expiry: string
  used: boolean
  created_at: string
}

// ─── CONFIGURAÇÃO ─────────────────────────────────────────────────────────────

export interface Config {
  id: number
  chave: string
  valor: string
  created_at: string | null
}

export interface EmailConfig {
  id: string
  tipo: string
  ativo: boolean
  created_at: string | null
  updated_at: string | null
  segunda: boolean
  terca: boolean
  quarta: boolean
  quinta: boolean
  sexta: boolean
}

export interface SmtpConfig {
  id: string
  smtp_user: string
  smtp_pass: string
  email_from: string
  smtp_host: string
  smtp_port: string
  created_at: string | null
  vigente: boolean
}

export interface AssistenteVirtual {
  id: string
  chave: string
  created_at: string | null
  vigente: boolean
}

// ─── ESTRUTURA EMPRESARIAL ────────────────────────────────────────────────────

export interface Empresa {
  id: string
  empresa: string
}

export interface Categoria {
  id: string
  empresa: string
  categoria: string
}

export interface CategoriaReceita {
  id: string
  empresa: string
  categoria: string
}

export interface ContaPagador {
  id: number
  cnpj: number | null
  agencia: number | null
  digito_agencia: number | null
  conta_corrente: number | null
  digito_conta: number | null
  nome_empresa: string | null
  rua_av: string | null
  numero_local: number | null
  complemento: string | null
  cidade: string | null
  cep: number | null
  created_at: string | null
  updated_at: string | null
  estado: string | null
}

export interface ContaReceita {
  id: number
  cnpj: number | null
  agencia: number | null
  digito_agencia: number | null
  conta_corrente: number | null
  digito_conta: number | null
  nome_empresa: string | null
  rua_av: string | null
  numero_local: number | null
  complemento: string | null
  cidade: string | null
  cep: number | null
  created_at: string | null
  updated_at: string | null
  estado: string | null
}

// ─── ENTIDADES ────────────────────────────────────────────────────────────────

export interface Fornecedor {
  id: number
  nome: string
  created_at: string
  cnpj_cpf: string | null
  rua_avenida: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  tipo_chave: number | null
  chave_pix: string | null
}

export interface Cliente {
  id: number
  nome: string
  created_at: string
  cnpj_cpf: string | null
  rua_avenida: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  tipo_chave: number | null
  chave_pix: string | null
}

export interface TipoChave {
  id: number
  tipo: string
}

export interface TipoDocumento {
  id: number
  tipo: string
}

export interface TipoPagamento {
  id: number
  tipos: string
}

export interface TipoRecebimento {
  id: number
  tipos: string
}

// ─── MODELOS DE CONTRATO ──────────────────────────────────────────────────────

export type EstiloContrato = 'estatico' | 'variavel'

export interface ModeloContrato {
  id: number
  nome: string
  estilo: EstiloContrato
  arquivo_id: string
}

export interface ModeloContratoVenda {
  id: number
  nome: string
  estilo: EstiloContrato
  arquivo_id: string
}

// ─── PEDIDOS ──────────────────────────────────────────────────────────────────

export interface PedidoSolicitado {
  id: number
  empresa: string
  categoria: string
  fornecedor: string
  valor_pedido: number
  status: StatusPedido
  observacao: string | null
  emergencia: boolean
  data_solicitacao: string | null
  data_autorizacao: string | null
  usuario_autorizador: string | null
  arquivos_pdf_ids: string[] | null
  arquivo_texto: string[] | null
  cancelado: boolean
  analise_texto: string[] | null
  pedido_status: number
  tipo_documento: number | null
  id_pedido_compra?: number | null
}

export interface PedidoSolicitadoReceita {
  id: number
  empresa: string
  categoria: string
  cliente: string
  valor_pedido: number
  status: StatusPedido
  observacao: string | null
  emergencia: boolean
  data_solicitacao: string | null
  data_autorizacao: string | null
  usuario_autorizador: string | null
  arquivos_pdf_ids: string[] | null
  arquivo_texto: string[] | null
  cancelado: boolean
  analise_texto: string[] | null
  pedido_status: number
  tipo_documento: number | null
  id_pedido_compra?: number | null
}

export interface PedidoStatus {
  id: number
  nome_status: string
}

export interface PedidoStatusReceita {
  id: number
  nome_status: string
}

export interface PedidoSolicitadoFluxo {
  id: number
  pedido_id: number | null
  empresa: string
  categoria: string
  fornecedor: string
  mes: number
  ano: number
  valor_referente: number
  status: StatusPedido
  pedido_status: number
}

export interface PedidoSolicitadoFluxoReceita {
  id: number
  pedido_id: number | null
  empresa: string
  categoria: string
  cliente: string
  mes: number
  ano: number
  valor_referente: number
  status: StatusPedido
  pedido_status: number
}

// ─── PAGAMENTOS ───────────────────────────────────────────────────────────────

export interface ControlePagamento {
  id: number
  pedido_id: number | null
  data_vencimento: string | null
  valor_pagar: number | null
  data_pagamento: string | null
  valor_pagamento: number | null
  anexo_id: string | null
  anexo_url: string | null
  tem_comprovante: boolean
  status_pagamento: number
  tipo_pagamento: number | null
}

export interface PagamentoStatus {
  id: number
  nome_status: string
}

export interface ControleSequencial {
  tipo: string
  valor: string
}

export interface InformacoesBoleto {
  id: number
  codigo_barras: string | null
  nome_beneficiario: string | null
  data_vencimento: string | null
  valor_nominal: number | null
  valor_desconto: number | null
  valor_mora: number | null
  data_pagamento: string | null
  valor_pagamento: number | null
  doc_empresa: string | null
  nosso_numero: string | null
  beneficiario_tipo: string | null
  beneficiario_documento: string | null
  beneficiario_nome: string | null
  doc_empresa_adicional: string | null
  boleto_id: number | null
}

// ─── RECEBIMENTOS ─────────────────────────────────────────────────────────────

export interface ControleRecebimento {
  id: number
  pedido_id: number | null
  data_vencimento: string | null
  valor_pagar: number | null
  data_pagamento: string | null
  valor_pagamento: number | null
  anexo_id: string | null
  anexo_url: string | null
  tem_comprovante: boolean
  status_recebimento: number
  tipo_recebimento: number | null
}

export interface RecebimentoStatus {
  id: number
  nome_status: string
}

export interface ControleSequencialRecebimento {
  tipo: string
  valor: string
}

export interface InformacoesBoletoReceita {
  id: number
  codigo_barras: string | null
  nome_beneficiario: string | null
  data_vencimento: string | null
  valor_nominal: number | null
  valor_desconto: number | null
  valor_mora: number | null
  data_pagamento: string | null
  valor_pagamento: number | null
  doc_empresa: string | null
  nosso_numero: string | null
  beneficiario_tipo: string | null
  beneficiario_documento: string | null
  beneficiario_nome: string | null
  doc_empresa_adicional: string | null
  boleto_id: number | null
}

// ─── DOCUMENTOS ───────────────────────────────────────────────────────────────

export interface Documento {
  id: number
  pedido_id: number | null
  tipo_documento: number
  anexo_id: string
  usuario: string
  data_upload: string | null
  comentario_id: number | null
  pagamento_id: number | null
  anexo_url: string | null
  nome_documento: string | null
  arquivo_texto: string | null
}

export interface DocumentoReceita {
  id: number
  pedido_id: number | null
  tipo_documento: number
  anexo_id: string
  usuario: string
  data_upload: string | null
  comentario_id: number | null
  recebimento_id: number | null
  anexo_url: string | null
  nome_documento: string | null
  arquivo_texto: string | null
}

// ─── COMENTÁRIOS ─────────────────────────────────────────────────────────────

export interface Comentario {
  id: number
  pedido_id: number
  comentario: string | null
  usuario: string
  data_comentario: string | null
  documento_id: number | null
  anexo_id: string | null
  tipo_documento: number | null
}

export interface ComentarioReceita {
  id: number
  pedido_id: number
  comentario: string | null
  usuario: string
  data_comentario: string | null
  documento_id: number | null
}

// ─── ORÇAMENTOS ───────────────────────────────────────────────────────────────

export interface ControleOrcamento {
  id: number
  empresa: string
  categoria: string
  mes: number
  ano: number
  valor_orcamento: number
  created_at: string | null
  updated_at: string | null
  valor_pedidos_solicitados: number
  saldo: number
}

export interface ControleOrcamentoReceita {
  id: number
  empresa: string
  categoria: string
  mes: number
  ano: number
  valor_orcamento: number
  created_at: string | null
  updated_at: string | null
  valor_pedidos_solicitados: number
  saldo: number
}

export interface OrcamentosUsuarios {
  id: number
  empresa: string | null
  categoria: string | null
  mes: number | null
  ano: number | null
  valor_orcamento: number | null
  created_at: string | null
  updated_at: string | null
}

export interface OrcamentosUsuariosReceita {
  id: number
  empresa: string | null
  categoria: string | null
  mes: number | null
  ano: number | null
  valor_orcamento: number | null
  created_at: string | null
  updated_at: string | null
}

export interface RegistroOrcamento {
  id: number
  empresa: string
  categoria: string
  mes: number
  ano: number
  valor_orcamento: number
  data_criacao: string | null
  usuario_criador: string
  observacao: string | null
}

export interface RegistroOrcamentoReceita {
  id: number
  empresa: string
  categoria: string
  mes: number
  ano: number
  valor_orcamento: number
  data_criacao: string | null
  usuario_criador: string
  observacao: string | null
}

export interface RegistroOrcamentoAnalise {
  id: number
  empresa: string
  categoria: string
  mes: number
  ano: number
  valor_orcamento_inicial: number
  valor_orcamento_vigente: number
  data_criacao: string | null
}

export interface RegistroOrcamentoAnaliseReceita {
  id: number
  empresa: string
  categoria: string
  mes: number
  ano: number
  valor_orcamento_inicial: number
  valor_orcamento_vigente: number
  data_criacao: string | null
}

// ─── SESSÃO (uso interno no Next.js) ─────────────────────────────────────────

export interface SessionPayload {
  userId: number
  username: string
  email: string
  hierarquia: TipoHierarquia
  status_cadastro: StatusCadastroEnum
}
