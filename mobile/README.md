# FinZoni para Android

Aplicativo React Native/Expo conectado ao mesmo Supabase e ao mesmo proxy NVIDIA NIM usados pelo FinZoni Web.

A identidade visual do aplicativo usa a nova marca `assets/logo-glass.png`; a logo anterior permanece preservada na pasta `assets` da versÃ£o web.

## O que jÃ¡ funciona

- Login, cadastro e recuperaÃ§Ã£o de acesso com a conta atual.
- SincronizaÃ§Ã£o do registro `finances` respeitando as regras RLS existentes.
- VisÃ£o geral mensal com saldo, receitas, despesas, produÃ§Ã£o e contas pendentes.
- Carteira com cartÃµes navegÃ¡veis, fatura, limite, melhor dia e compras.
- LanÃ§amento rÃ¡pido de despesa, receita, diÃ¡ria e compra no cartÃ£o.
- Metas e reserva de emergÃªncia.
- Chat contextual do Zoni pela NVIDIA NIM com limite de tempo e falhas amigÃ¡veis.
- SessÃ£o persistente no dispositivo usando SQLite.

## Executar no Android

Requisitos: Node.js 22.13 ou mais recente e Android Studio/Expo Go.

```powershell
cd mobile
Copy-Item .env.example .env
npm install
npm run android
```

O arquivo `.env.example` contÃ©m somente a URL e a chave publicÃ¡vel que jÃ¡ sÃ£o usadas pelo site. A chave privada da NVIDIA continua sendo carregada dos dados do prÃ³prio usuÃ¡rio.

## Gerar APK para testes

```powershell
cd mobile
npx eas-cli login
npx eas-cli build:configure
npm run build:android
```

O perfil `preview` do `eas.json` gera um APK instalÃ¡vel. O perfil `production` gera o AAB destinado Ã  Play Store. Chaves de assinatura nunca devem ser incluÃ­das no repositÃ³rio.
