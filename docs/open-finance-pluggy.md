# FinZoni + Meu Pluggy — Open Finance pessoal

Implementação para uso pessoal, não comercial. Mantém a stack do FinZoni: HTML/CSS/JS, Vercel e Supabase. Nenhum banco é conectado automaticamente na instalação: o consentimento é do titular.

## Funcionalidades

- Aba Open Finance com contas, saldos, cartões e até 150 transações recentes.
- Sincronização manual mediante autenticação Supabase e verificação da conta proprietária no backend.
- Cópia de até 365 dias de transações por conta (limitada a duas páginas por sincronização para reduzir risco de timeout), com GET /v2/transactions.
- Idempotência por chave única (user_id, transaction_id). Contas e transações bancárias ficam separadas dos lançamentos manuais na tabela finances, evitando despesas duplicadas.
- Os valores das faturas de cartão são mostrados separadamente do saldo somado das contas bancárias.
- Armazena apenas nome/tipo/saldo de conta e dados mínimos de transações. Não armazena CPF, número de conta, senha ou payload bruto da Pluggy.
- Remover conexão apaga os registros locais por cascata, mas não revoga autorização bancária na origem.

## 1. Instale a migração SQL

No mesmo projeto Supabase utilizado pelo FinZoni, execute via SQL Editor o conteúdo de:

    supabase/migrations/20261104_open_finance_pluggy.sql

O script cria somente as tabelas open_finance_items, open_finance_accounts e open_finance_transactions, com RLS por user_id. Não altera a tabela finances. Copie o UUID do usuário em Supabase > Authentication > Users.

## 2. Configure a Pluggy

1. Abra https://meu.pluggy.ai/ e conecte os seus próprios bancos (cada banco exige autorização).
2. Abra https://dashboard.pluggy.ai/ com a mesma conta e crie uma aplicação.
3. Se necessário, habilite o conector MeuPluggy em Customização > Conectores.
4. Em Aplicações > sua aplicação > Demo > Conectar conta, escolha MeuPluggy, e não o conector direto do banco. Faça login no Meu Pluggy.
5. Copie o Item ID listado em Itens Conectados para cada banco. No plano pessoal, o endpoint que lista todos os itens não está habilitado.
6. Copie Client ID e gere um Client Secret para a aplicação.

Documentação oficial: https://docs.pluggy.ai/pt/docs/guides/meu-pluggy-personal-use

## 3. Configure variáveis da Vercel

Em Project Settings > Environment Variables, configure para Preview e Production conforme a necessidade:

- PLUGGY_CLIENT_ID: Client ID da aplicação Pluggy.
- PLUGGY_CLIENT_SECRET: Client Secret da aplicação Pluggy (sigiloso).
- OPEN_FINANCE_OWNER_USER_ID: UUID (Supabase Auth) da ÚNICA conta autorizada a acessar os dados pessoais.

A URL e a chave pública Supabase já estão definidas no FinZoni. Opcionalmente, substitua-as com SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY em ambiente. Nunca coloque Client Secret, service_role ou tokens bancários no código público, no navegador ou no chat.

Sem essas variáveis, a função retorna erro de configuração, sem revelar dados. A configuração da Pluggy não deve ser copiada para outras aplicações nem compartilhada com usuários comerciais.

## 4. Use o painel

Faça login no FinZoni e entre na aba Open Finance. Digite um nome, cole o Item ID do Pluggy, clique Adicionar conexão e, em seguida, Sincronizar. Repita até cinco conexões. Use Atualizar tela para reler os dados gravados.

Observações:
- O Meu Pluggy atualiza as conexões na origem aproximadamente a cada 24 horas, mas o FinZoni copia os dados só quando você clicar em Sincronizar. Não há cron ou webhooks neste PR.
- A autorização do conector MeuPluggy à aplicação dura um ano. Depois da renovação, confirme se houve alteração de Item ID.
- O histórico maior que duas páginas fica incompleto e o aplicativo avisa; é necessário implementar paginação persistente em uma etapa posterior.
- Alteração ou exclusão retroativa na Pluggy não remove automaticamente transações locais (sem webhooks de deletados). Isso deve ser implementado antes de considerar o extrato um espelho integral.
- Uma nova autorização pode gerar IDs diferentes. Não é possível garantir deduplicação entre IDs de conexões antigas e novas apenas com o ID da Pluggy.
- Não há lançamento automático nas despesas, pagamentos, Pix ou movimentação de valores.
- A versão pessoal da Pluggy só pode ser usada com os próprios dados. Produto comercial requer outro acordo e arquitetura multiusuário.

## 5. Testes e revisão

Execute:
    node --test tests/open-finance.test.mjs

Confira também o estado do PR e revise antes de mesclar. Nunca mescle uma credencial real no repositório.
