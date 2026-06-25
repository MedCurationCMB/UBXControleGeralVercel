import nodemailer from 'nodemailer'
import { supabaseServer } from './supabase/server'
import type { SmtpConfig } from '@/types/database'

async function getSmtpConfig(): Promise<SmtpConfig> {
  const { data, error } = await supabaseServer
    .from('smtp_config')
    .select('*')
    .eq('vigente', true)
    .single()

  if (error || !data) throw new Error('Nenhuma configuração SMTP vigente encontrada no banco')
  return data as SmtpConfig
}

function createTransporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.smtp_host,
    port: parseInt(config.smtp_port),
    secure: false,
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass,
    },
  })
}

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const config = await getSmtpConfig()
  const transporter = createTransporter(config)

  await transporter.sendMail({
    from: `CMB Gestão <${config.email_from}>`,
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  })
}

// Templates de email reutilizáveis

export function templateRecuperacaoSenha(token: string, appUrl: string): string {
  const link = `${appUrl}/recuperar-senha?token=${token}`
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #F63366;">Recuperação de Senha — CMB Gestão</h2>
      <p>Recebemos uma solicitação de recuperação de senha para sua conta.</p>
      <p>Clique no botão abaixo para redefinir sua senha. O link é válido por <strong>24 horas</strong>.</p>
      <a href="${link}"
         style="display:inline-block;padding:12px 24px;background:#F63366;color:#fff;
                border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0;">
        Redefinir Senha
      </a>
      <p style="color:#666;font-size:12px;">Se você não solicitou a recuperação, ignore este email.</p>
    </div>
  `
}

export function templateNovoCadastro(username: string, email: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #F63366;">Novo Cadastro Aguardando Aprovação</h2>
      <p>Um novo usuário solicitou acesso ao sistema:</p>
      <table style="border-collapse:collapse;width:100%;">
        <tr>
          <td style="padding:8px;border:1px solid #eee;font-weight:bold;">Usuário</td>
          <td style="padding:8px;border:1px solid #eee;">${username}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #eee;font-weight:bold;">Email</td>
          <td style="padding:8px;border:1px solid #eee;">${email}</td>
        </tr>
      </table>
      <p>Acesse o <strong>Painel Administrativo</strong> para aprovar ou rejeitar o cadastro.</p>
    </div>
  `
}

export function templateAlertaVencimento(
  tipo: 'pagamento' | 'recebimento',
  itens: Array<{ fornecedor_cliente: string; valor: number; vencimento: string; empresa: string }>
): string {
  const titulo = tipo === 'pagamento' ? 'Pagamentos' : 'Recebimentos'
  const rows = itens
    .map(
      (i) => `
      <tr>
        <td style="padding:8px;border:1px solid #eee;">${i.empresa}</td>
        <td style="padding:8px;border:1px solid #eee;">${i.fornecedor_cliente}</td>
        <td style="padding:8px;border:1px solid #eee;">R$ ${i.valor.toFixed(2)}</td>
        <td style="padding:8px;border:1px solid #eee;">${i.vencimento}</td>
      </tr>`
    )
    .join('')

  return `
    <div style="font-family: sans-serif; max-width: 700px; margin: 0 auto;">
      <h2 style="color: #F63366;">Alerta de ${titulo} Pendentes</h2>
      <p>Os seguintes ${titulo.toLowerCase()} estão próximos do vencimento ou já vencidos:</p>
      <table style="border-collapse:collapse;width:100%;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:8px;border:1px solid #eee;text-align:left;">Empresa</th>
            <th style="padding:8px;border:1px solid #eee;text-align:left;">Fornecedor/Cliente</th>
            <th style="padding:8px;border:1px solid #eee;text-align:left;">Valor</th>
            <th style="padding:8px;border:1px solid #eee;text-align:left;">Vencimento</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#666;font-size:12px;">CMB Gestão — Envio automático</p>
    </div>
  `
}
