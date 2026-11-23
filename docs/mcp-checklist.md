# MCP do financeiro UBX — checklist de cobertura

Objetivo: tudo que o sistema cadastra ou inclui deve funcionar pelo MCP. Onde a tela do cadastro permite upload de arquivo, o item entra como 📎 e depende da solução de upload.

Legenda: ✅ feito e publicado · ❌ falta · 📎 envolve upload · 🚫 não vai para o MCP

Última atualização: 23/11/2026. Endereço do conector: `https://financeiro-importantist.vercel.app/api/mcp` (login OAuth do UBX; o projeto é o que estava ativo no UBX ao clicar em "Permitir").

Testes: `node scripts/teste-mcp-prod.mjs "<usuário>" 1` (leitura e prévias, nunca grava) e `node scripts/teste-mcp-escrita-dev.mjs "<usuário>"` (gravação real, SÓ no PROJETO DEV: 45 passos, confere no banco e apaga tudo que criou; troca o fluxo do DEV para 3 só nos passos de "lançar conta" e restaura). Em 23/11 os 50 passos passaram (os 5 últimos: comentário com anexo, remessa com prévia e recusas, relatório de enviados, retorno do banco; o teste restaura o sequencial da remessa e apaga os arquivos registrados, só ficam arquivos soltos no B2), incluindo comprovante, boleto (código válido/inválido, reenvio sem duplicar), importação de extrato OFX por link, lançar conta direto, excluir (conta, documento, fornecedor, cliente, conta bancária), atendida sem pedido e alteração em lote: cadastros (fornecedor, cliente, centro, categoria, conta bancária), orçamento, requisição, pedido (criar, anexar PDF, comentar, pedir ajuste, ajustar e reenviar, autorizar, cancelar), contas (parcela barrada acima do valor do pedido, editar, adicionar, registrar e desfazer pagamento), conciliação (vincular, valor errado recusado, grupo de contas, desvincular), recebimentos (pedido de venda até recebimento) e realocação.
Ainda sem gravação real testada: rejeitar pedido/requisição de verdade fora o caso de 23/11, lançar orçamento com pedidos no mês, realocação aguardando autorização de outro usuário, e perfis diferentes de admin (o teste usa o dono).

## Busca e contexto

- [x] Buscar fornecedor, cliente, centro de resultado e categoria (`buscar_cadastro`; nomes exatos que o `criar_pedido` exige)
- [x] Selecionar projeto, só para quem tem mais de um (`listar_projetos` + parâmetro `projeto`, nome ou id, em todas as ferramentas; sem ele vale o projeto do conector). Decisão do chefe em 23/11: quem tem um projeto só não vê nada disso
- Decisão do chefe em 23/11: cadastrar fornecedor, cliente, centro e categoria segue exatamente o perfil de usuário do sistema (como na tela); ajustar depois, junto com a revisão de usuários

## Cadastros base

- [x] Fornecedores (pagamentos) e Clientes (recebimentos): criar e editar (`salvar_parceiro`; nome único, CPF/CNPJ e chave Pix validados como na tela)
- [x] Fornecedores e Clientes: excluir (`excluir_parceiro`; mais seguro que a tela: recusa se houver pedido, parcela ou conta usando o nome)
- [ ] Fornecedores/Clientes: importar planilha (dados direto na ferramenta, sem upload)
- [x] Centros de resultado: criar (com cópia de categorias opcional), renomear, copiar categorias (`criar_centro`, `renomear_centro`, `copiar_categorias`; renomear e copiar só admin dos dois módulos/dono, como na tela). A tela não exclui centro, então o MCP também não
- [ ] Centros: definir quem vê cada centro (fica na tela de Projetos e Acessos, admin)
- [x] Categorias: criar, renomear, excluir (`criar_categoria`, `renomear_categoria`, `excluir_categoria`; pagamentos e recebimentos)
- [x] Contas bancárias da empresa (conta_pagador, serve aos dois módulos): listar, cadastrar e editar (`listar_contas_bancarias`, `salvar_conta_bancaria`)
- [x] Contas bancárias: excluir (`excluir_conta_bancaria`)
- [ ] 📎 Modelos de contrato: enviar e excluir

## Orçamento

- [x] Consultar (`consultar_orcamento`)
- [x] Lançar (`lancar_orcamento`)
- [ ] Importar planilha em lote (dados direto na ferramenta)

## Requisições

- [x] Listar (`listar_requisicoes`)
- [x] Criar (`criar_requisicao`)
- [x] Autorizar ou rejeitar (`decidir_requisicao`)
- [x] 📎 Anexar documento (PDF, por link: `anexar_documento`; `criar_requisicao` já entrega o link)
- [x] Marcar "atendida sem pedido" e desfazer (`marcar_requisicao_atendida`, `desfazer_requisicao_atendida`; só admin do módulo; o banco barra se já há pedido)

## Pedidos (compra e venda)

- [x] Listar e ver (`listar_pedidos`, `ver_pedido`)
- [x] Criar (`criar_pedido`, segue o fluxo 1-5 do projeto)
- [x] Autorizar ou rejeitar (`decidir_pedido`)
- [x] Pedir ajuste (`pedir_ajuste`)
- [x] 📎 Anexar PDF ao criar (`criar_pedido` entrega o link de upload)
- [x] Responder ajuste: editar e reenviar (`ajustar_pedido`; só quem pediu ou admin; reconfere saldo e registra o de → para no histórico)
- [x] Cancelar pedido (`cancelar_pedido`; avisa se há contas e pagamentos)
- [x] Comentar (`adicionar_comentario`; os últimos 10 aparecem em `ver_pedido`)
- [x] 📎 Comentário com anexo (`adicionar_comentario` com `com_anexo=true` entrega o link; também `anexar_documento` alvo=comentario; só o autor do comentário anexa; PDF ligado ao comentário como na tela)
- [x] 📎 Documentos do pedido: enviar (por link) e listar com link de download (`anexar_documento`, `listar_documentos`)
- [x] Documentos do pedido/conta: excluir (`excluir_documento`; o arquivo no armazenamento não é apagado, como na tela; os dados lidos do boleto saem junto)
- [x] Realocar centro de resultado: solicitar com simulação do banco, listar, autorizar e recusar (`solicitar_realocacao`, `listar_realocacoes`, `decidir_realocacao`)
- [ ] Gerar contrato
- [ ] Importar pedidos em lote (dados direto na ferramenta)

## Contas a pagar / receber

- [x] Listar contas (`listar_contas`: filtros, situação, totais; pagamentos e recebimentos)
- [x] Registrar pagamento ou recebimento (`registrar_pagamento`: data, valor, status Pago)
- [x] Editar conta: vencimento, valores, status, tipo, desfazer pagamento (`atualizar_conta`)
- [x] Adicionar parcela a pedido autorizado (`adicionar_conta`; sem código de barras de boleto ainda)
- [x] 📎 Anexar comprovante e boleto (PDF por link: `anexar_documento` com alvo=comprovante|boleto e o id da conta; o boleto é lido por IA e preenche o código de barras; um boleto por conta, reenviar atualiza)
- [x] Lançar conta direto, fluxo 3 (`lancar_conta`: cria o pedido já autorizado e a conta; só no fluxo 3) e excluir conta (`excluir_conta`: avisa pagamento registrado, conciliação, remessa e documentos)
- [x] Alterar status/vencimento em lote (`atualizar_contas_em_lote`: até 200 contas por ids; recusa tudo se algum id não existir)
- [x] Código de barras de boleto informado manualmente (`informar_boleto`; confere dígitos verificadores de 47 e 48 dígitos)
- [ ] Importar em lote (dados direto na ferramenta)
- [x] 📎 Remessa CNAB 240, relatório de enviados e retorno do banco (decisão do chefe em 23/11: arquivos saem por link de download, retorno entra por link de upload). `gerar_remessa` (PIX e boleto "À Pagar"; prévia, valida chave PIX e código de barras, devolve links do .REM e do PDF), `relatorio_enviados` (PDF do dia), `importar_retorno` (link de upload .ret/.rem: pagamentos efetivados viram Pagos), `listar_arquivos_remessa` (aba Arquivos). Só administrador de Pagamentos (a tela não restringe por perfil; decidi mais seguro, ajustar se o chefe quiser). Links de download valem 30 min e usam o id do arquivo no B2 (`/baixar/<token>`); lógica movida para `src/lib/remessa.ts` e as rotas `/api/remessa/*` viraram wrappers

## Extratos e conciliação

- [x] Listar e ver (`listar_extratos`, `ver_extrato`, `contas_para_linha`)
- [x] Conciliar e desfazer (`vincular_extrato`, `desvincular_extrato`)
- [x] 📎 Importar extrato (CSV, OFX ou TXT do Banco Inter, por link: `importar_extrato`; duplicado recusado; mesma importação da tela, agora em `src/lib/extratoImportacao.ts`)

## Upload (infraestrutura)

Chat não entrega arquivo à ferramenta. Solução prevista: o MCP gera um link temporário (cerca de 30 min, token assinado com usuário + item + tipo) para uma página de upload de PDF (um ou vários), que grava como a tela (Backblaze B2 + tabela `documentos`). Limite atual: 4 MB por arquivo (limite de envio da Vercel).

- [x] Rota/página de upload por link (`/anexar/<token>` e `/api/anexar/<token>`; só PDF, até 4 MB cada, um ou vários)
- [x] Ferramentas `anexar_documento` e `listar_documentos`
- [x] O MCP pergunta "tem documento para anexar?" ao criar requisição/pedido e entrega o link no resultado
- [x] Teste de envio real de PDF (23/11, na produção: PDF enviado ao pedido de teste 2562, listado como "Documentos da Solicitação" e baixado pelo link assinado)
- [ ] Ainda sem a leitura automática (Gemini) que a tela faz ao anexar PDF na criação do pedido

## Fora do MCP

- 🚫 Admin: usuários, configurações do sistema (fluxo), SMTP/e-mail, chave do assistente, projetos e acessos (somente dono/admin, risco sem ganho)

## Ordem sugerida

1. Buscas e cadastro de fornecedor/cliente
2. Link de upload de PDF
3. Contas a pagar/receber: listar e registrar pagamento
4. Centros, categorias e contas pagadoras
5. Comentários, ajuste, cancelar, realocação
6. Remessa e contratos
