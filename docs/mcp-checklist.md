# MCP do financeiro UBX — checklist de cobertura

Objetivo: tudo que o sistema cadastra ou inclui deve funcionar pelo MCP. Onde a tela do cadastro permite upload de arquivo, o item entra como 📎 e depende da solução de upload.

Legenda: ✅ feito e publicado · ❌ falta · 📎 envolve upload · 🚫 não vai para o MCP

Última atualização: 23/11/2026. Endereço do conector: `https://financeiro-importantist.vercel.app/api/mcp` (login OAuth do UBX; o projeto é o que estava ativo no UBX ao clicar em "Permitir").

Observação: os itens ✅ de escrita foram testados só em prévia (`confirmar=false`) na produção, exceto a rejeição de um pedido de teste. Falta o teste de gravação real de: autorizar pedido, pedir ajuste, lançar orçamento, criar requisição, criar pedido, vincular/desvincular extrato.

## Busca e contexto

- [x] Buscar fornecedor, cliente, centro de resultado e categoria (`buscar_cadastro`; nomes exatos que o `criar_pedido` exige)
- [x] Selecionar projeto, só para quem tem mais de um (`listar_projetos` + parâmetro `projeto`, nome ou id, em todas as ferramentas; sem ele vale o projeto do conector). Decisão do chefe em 23/11: quem tem um projeto só não vê nada disso
- Decisão do chefe em 23/11: cadastrar fornecedor, cliente, centro e categoria segue exatamente o perfil de usuário do sistema (como na tela); ajustar depois, junto com a revisão de usuários

## Cadastros base

- [x] Fornecedores (pagamentos) e Clientes (recebimentos): criar e editar (`salvar_parceiro`; nome único, CPF/CNPJ e chave Pix validados como na tela)
- [ ] Fornecedores e Clientes: excluir
- [ ] Fornecedores/Clientes: importar planilha (dados direto na ferramenta, sem upload)
- [x] Centros de resultado: criar (com cópia de categorias opcional), renomear, copiar categorias (`criar_centro`, `renomear_centro`, `copiar_categorias`; renomear e copiar só admin dos dois módulos/dono, como na tela). A tela não exclui centro, então o MCP também não
- [ ] Centros: definir quem vê cada centro (fica na tela de Projetos e Acessos, admin)
- [x] Categorias: criar, renomear, excluir (`criar_categoria`, `renomear_categoria`, `excluir_categoria`; pagamentos e recebimentos)
- [x] Contas bancárias da empresa (conta_pagador, serve aos dois módulos): listar, cadastrar e editar (`listar_contas_bancarias`, `salvar_conta_bancaria`)
- [ ] Contas bancárias: excluir
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
- [ ] Marcar "atendida sem pedido" e desfazer

## Pedidos (compra e venda)

- [x] Listar e ver (`listar_pedidos`, `ver_pedido`)
- [x] Criar (`criar_pedido`, segue o fluxo 1-5 do projeto)
- [x] Autorizar ou rejeitar (`decidir_pedido`)
- [x] Pedir ajuste (`pedir_ajuste`)
- [x] 📎 Anexar PDF ao criar (`criar_pedido` entrega o link de upload)
- [x] Responder ajuste: editar e reenviar (`ajustar_pedido`; só quem pediu ou admin; reconfere saldo e registra o de → para no histórico)
- [x] Cancelar pedido (`cancelar_pedido`; avisa se há contas e pagamentos)
- [x] Comentar (`adicionar_comentario`; os últimos 10 aparecem em `ver_pedido`)
- [ ] 📎 Comentário com anexo (falta o link de upload para comentário)
- [x] 📎 Documentos do pedido: enviar (por link) e listar com link de download (`anexar_documento`, `listar_documentos`)
- [ ] Documentos do pedido: excluir
- [x] Realocar centro de resultado: solicitar com simulação do banco, listar, autorizar e recusar (`solicitar_realocacao`, `listar_realocacoes`, `decidir_realocacao`)
- [ ] Gerar contrato
- [ ] Importar pedidos em lote (dados direto na ferramenta)

## Contas a pagar / receber

- [x] Listar contas (`listar_contas`: filtros, situação, totais; pagamentos e recebimentos)
- [x] Registrar pagamento ou recebimento (`registrar_pagamento`: data, valor, status Pago)
- [x] Editar conta: vencimento, valores, status, tipo, desfazer pagamento (`atualizar_conta`)
- [x] Adicionar parcela a pedido autorizado (`adicionar_conta`; sem código de barras de boleto ainda)
- [ ] 📎 Anexar comprovante ou boleto (com leitura automática)
- [ ] Lançar conta direto (fluxo 3) e excluir conta
- [ ] Alterar status/vencimento em lote (hoje: uma conta por chamada)
- [ ] Código de barras de boleto informado manualmente (tela de Controle, tipo Boleto)
- [ ] Importar em lote (dados direto na ferramenta)
- [ ] 📎 Remessa CNAB, retorno do banco e relatório de enviados

## Extratos e conciliação

- [x] Listar e ver (`listar_extratos`, `ver_extrato`, `contas_para_linha`)
- [x] Conciliar e desfazer (`vincular_extrato`, `desvincular_extrato`)
- [ ] 📎 Importar extrato (OFX/CSV)

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
