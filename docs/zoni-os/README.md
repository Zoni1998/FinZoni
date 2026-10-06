# Zoni OS — configuração e ativação

## Estado desta entrega
Instruções, configuração de GPT e API implementadas. Publicação, autenticação e teste real dependem do acesso à Vercel e ao projeto Supabase do FinZoni. O GPT não foi criado no editor. Gmail/Calendar/Drive/WhatsApp não estão conectados. Organização de tarefas e estudos funciona na conversa; persistência e lembretes exigem integração adicional.

## Desenho
GPT privado Zoni OS → Action HTTPS `/api/zoni` → API restrita a um único usuário → registro `finances` desse usuário no Supabase. Reutiliza o site, autenticação e dados existentes; não cria outro banco. O prompt completo é `instrucoes.md`; `configuracao.json` contém nome, descrição e sugestões iniciais. `openapi.json` é o esquema para importar em Actions.

A API permite resumo mensal, categorias variáveis e transações paginadas; registrar despesa variável ou receita extra; marcar conta fixa como paga. Não paga contas nem opera banco. Não altera cartões, metas, reserva, autenticação ou dados de outros usuários. Não suporta SQL livre ou exclusões.

## Ativação (pelo responsável com acesso)
1. Reconectar Vercel no escopo `zoni1998sa`, projeto `fin-zoni`. Reconectar Supabase com acesso ao projeto `jbzypqaimerrptxhovzq` (FinZoni). O acesso encontrado na sessão era apenas ao DentalFollow; não usar esse banco.
2. Conferir tipo de `finances.data`, unicidade de `user_id` e RLS; a escrita da API exige dados como string JSON, conforme os clientes atuais. Instalar `install-supabase.sql` no banco correto ANTES de publicar os clientes; validar a RPC `save_finances_if_unchanged` em uma conta de teste. A função usa bloqueio de linha e SECURITY INVOKER, preservando RLS. Confirmar permissões, rejeição de usuário diferente e rollback em conflito. Não publicar clientes nem ativar gravação antes desses testes.
3. Confirmar o UUID da conta de Victor por login ou consulta administrativa autorizada. Não selecionar automaticamente o primeiro usuário.
4. Na Vercel, configurar apenas no servidor e em produção: `SUPABASE_URL=https://jbzypqaimerrptxhovzq.supabase.co`, `SUPABASE_SERVICE_ROLE_KEY` do projeto correto, `ZONI_USER_ID` da conta confirmada e `ZONI_API_KEY` aleatória com pelo menos 32 caracteres (por exemplo, 32 bytes aleatórios em hexadecimal). Guardar em campos de segredo; nunca no GitHub ou no prompt.
5. Publicar esta branch após revisão. Manter `ZONI_WRITE_ENABLED=false` inicialmente. Testar `/api/zoni` sem chave (401 com configuração completa), com chave incorreta, e com chave correta (consulta apenas do UUID configurado). Não imprimir a chave em logs, URL ou chat.
6. Criar GPT privado no editor, aplicar `configuracao.json` e `instrucoes.md`, habilitar busca na web e análise de dados se disponíveis. Importar o conteúdo de `openapi.json` em Actions. Autenticação: API Key, Bearer, valor `ZONI_API_KEY` em campo seguro. Nunca usar a service_role como chave do GPT.
7. Verificar a resposta ao comando `/financeiro`, comparando com o dashboard do mesmo mês. O schema precisa ser validado no próprio editor antes de considerar a configuração completa.
8. Atualizar site e aplicativo mobile com as proteções de sincronização desta branch; fechar sessões antigas. Aplicativos/builds antigos ainda podem sobrescrever todo o documento. Só depois de todos os clientes ativos atualizados e do teste de concorrência, configurar `ZONI_WRITE_ENABLED=true` e publicar novamente.
9. Testar gravações em uma conta de teste do mesmo projeto, com variáveis de teste isoladas. Confirmar que o mesmo requestId não duplica, que um conflito devolve 409 e que um cliente desatualizado não sobrescreve registros. Não criar lançamentos fictícios na conta financeira de Victor. Depois configurar o UUID/chave finais em produção.

## Proteções e limitações
A chave pessoal é limitada no código ao UUID configurado; o cliente não escolhe user_id. A service_role fica no servidor, tem privilégios amplos no projeto e deve ser tratada como segredo. Não compartilhar o GPT nem a chave pessoal: esta versão é uma integração privada para um usuário, não OAuth multiusuário.

Escritas usam uma RPC transacional que compara e bloqueia o documento lido e não repetem automaticamente. Isso evita filtros com documentos grandes em URLs. A função SQL ainda precisa ser validada no banco real. Site e mobile também recusam salvar documentos que mudaram desde o carregamento. Em conflito, o site pede exportar as edições locais antes de recarregar; o mobile desfaz a edição local atual e mostra erro. As outras edições ainda pendentes no site não são mescladas automaticamente. O campo `zoniRequests` guarda até 200 recibos; IDs de transações preservam deduplicação posterior dentro do documento. Manter backups e fechar clientes antigos antes de habilitar Actions de escrita.

A API não possui login OAuth, rate limiting distribuído, persistência de tarefas ou sincronização automática da tela aberta após uma alteração externa. Uma chave vazada deve ser revogada/rotacionada na Vercel e na Action. A aplicação deve ser recarregada para mostrar alterações externas. Timeouts de gravação são incertos: consultar primeiro e, se necessário, repetir com o mesmo requestId.

## Como funciona o código
Entrada: pedido natural do Victor → GPT escolhe a Action e envia parâmetros estruturados. Processamento: autenticação, consulta da conta fixa, validação de data/valor/categoria, cálculo ou alteração e comparação de sincronização. Saída: JSON de dados reais, recibo ou erro; o GPT traduz para português. O módulo `_zoni-core.mjs` contém a lógica testável, e `zoni.js` adapta o HTTP da Vercel.

## Verificação
`node --test tests/*.cjs tests/*.mjs`
Os testes locais verificam cálculo, validação, exclusão de campos privados, deduplicação, bloqueio de autenticação, bloqueio de escrita desativada e conflito. Não substituem os testes do Supabase, deployment Vercel e editor GPT. A integração não está operacional até a verificação real.
