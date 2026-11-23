import { NextResponse } from 'next/server'
import { verificar, type UploadJwt } from '@/lib/mcp/oauth'
import { sessaoDe } from '@/lib/mcp/usuario'
import { descricaoDoAlvo, formatoDe, MAX_BYTES } from '@/lib/mcp/upload'

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
const html = (corpo: string, status = 200) => new NextResponse(
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anexar documento</title>` +
  `<body style="font-family:system-ui,sans-serif;max-width:480px;margin:8vh auto;padding:0 16px;color:#1e293b">${corpo}</body>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } },
)

// Página aberta pelo link que o MCP entrega: escolhe um ou vários PDFs e envia um a um para /api/anexar/<token>.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token
  const t = await verificar<UploadJwt>('upload', token)
  const s = t ? await sessaoDe(t.uid, t.pid) : null
  const d = t && s ? await descricaoDoAlvo(s, t.mod, t.alvo, t.id) : null
  if (!t || !s || !d) return html('<h2>Link expirado</h2><p>Peça um novo link ao Claude.</p>', 410)

  const fmt = formatoDe(t.alvo)
  return html(`<h2>${fmt.titulo}</h2><p>${esc(d)}</p><p style="font-size:13px;color:#64748b">Enviando como ${esc(s.username)} · ${fmt.rotulo}, até 4 MB cada</p>
<input id="f" type="file" accept="${fmt.aceita}" multiple style="display:block;margin:16px 0">
<button id="b" style="padding:10px 18px;background:#0f766e;color:#fff;border:0;border-radius:6px;font-size:15px">Enviar</button>
<ul id="l" style="list-style:none;padding:0;margin-top:16px;font-size:14px"></ul>
<script>
const MAX=${MAX_BYTES}, token=${JSON.stringify(token)}, f=document.getElementById('f'), b=document.getElementById('b'), l=document.getElementById('l')
b.onclick=async()=>{
  if(!f.files.length){alert('Escolha ao menos um arquivo.');return}
  b.disabled=true
  for(const file of f.files){
    const li=document.createElement('li');li.textContent='… '+file.name;l.appendChild(li)
    if(file.size>MAX){li.textContent='✖ '+file.name+' — excede 4 MB';continue}
    const fd=new FormData();fd.append('file',file)
    try{const r=await fetch('/api/anexar/'+token,{method:'POST',body:fd});const d=await r.json().catch(()=>({}))
      li.textContent=(r.ok?'✔ ':'✖ ')+file.name+(r.ok?(d.info?' — '+d.info:''):' — '+(d.error||'erro'))}
    catch{li.textContent='✖ '+file.name+' — falha de conexão'}
  }
  f.value='';b.disabled=false
}
</script>`)
}
