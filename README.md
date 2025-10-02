# Koban Free API v2.0 (Uso interno)

API para criar, validar e gerenciar chaves de acesso temporárias com um painel admin (React + Vite). Agora utiliza PostgreSQL (Neon) através do Prisma, garantindo persistência real para a API.

Este README resume como configurar o ambiente, rodar localmente e preparar o deploy interno.

## Visão geral

- Node.js + Express (REST API)
- PostgreSQL (Neon) via Prisma ORM
- Painel Admin em React/Vite (build estático servido em `/admin`)
- Sessões de admin ainda em memória (serão migradas para banco/Redis em iterações futuras)

Estrutura principal:

```
src/
├── app.js                 # Bootstrap do Express + middlewares
├── config/
│   ├── index.js          # Carrega variáveis e opções
│   ├── prisma.js         # Singleton do Prisma Client
│   └── database.js       # Wrapper legado → delega para Prisma
├── controllers/          # Regras dos endpoints
├── middleware/           # Validação, erros, auth admin
├── routes/               # Rotas /api, /admin, /
├── services/             # keyService (negócio) usando Prisma
└── utils/                # keyUtils, logger, helpers

dashboard/                # Painel Admin (Vite + React)
api/index.js              # Entrypoint serverless para Vercel
prisma/                   # Schema e migrações Prisma
vercel.json               # Rewrites + comando de build
scripts/create-key.js     # Script CLI para criar chave
```

## Pré-requisitos

- Node 18+
- NPM 9+
- Acesso a uma instância Postgres (Neon recomendada)

## Configuração (.env)

Copie o template e ajuste para o seu ambiente:

```powershell
Copy-Item .env.example .env
```

Principais variáveis (veja o arquivo para comentários detalhados):

- `DATABASE_URL`: string de conexão Postgres (`postgresql://user:pass@host/db?sslmode=require`). Guarde no Neon/Vercel como secret.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`: credenciais padrão para login do admin (rotacione em produção).
- `ADMIN_LOGIN_MAX_ATTEMPTS` / `ADMIN_LOGIN_WINDOW_MS`: anti brute-force no login admin.
- `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `CORS_CREDENTIALS`, `RATE_LIMIT_*`, `DEFAULT_KEY_HOURS`, `MAX_KEY_HOURS`, `LOG_LEVEL`, `IP_PREFERENCE` – mesmos significados de antes.

O `dotenv` carrega o `.env` automaticamente no bootstrap.

## Instalação e migrações

```powershell
npm install
npx prisma migrate dev
```

`prisma migrate dev` aplica as migrações em seu banco local/Neon e regenera o client em `node_modules/@prisma/client`.

> Sempre mantenha o mesmo `DATABASE_URL` usado pela aplicação. Para Neon, garanta SSL obrigatório e rotacione a senha periodicamente.

## Como rodar

Dev com reload automático:

```powershell
npm run dev
```

Produção local:

```powershell
npm start
```

Painel Admin (local):

- Acesse [http://localhost:3000/admin/login](http://localhost:3000/admin/login) com as credenciais do `.env`.
- O dashboard usa os endpoints protegidos `/admin/api/*`; certifique-se de estar autenticado.

Build do dashboard (necessário para deploy, opcional em dev):

```powershell
# build completo (raiz)
npm run build

# ou hot reload só do dashboard
cd dashboard
npm install
npm run dev
```

## Endpoints principais

Chaves (`/api/keys`):

- `POST /api/keys/create`
    - body: `{ "user_id": string, "hours"?: number }
    - `200` → chave criada | `409` → usuário já possui chave ativa
- `GET /api/keys/validate/:keyId`
    - retorna validade, tempo restante e incrementa `usage_count`
- `GET /api/keys/info/:keyId`
    - metadados sem incrementar uso
- `GET /api/keys/user/:userId`
    - lista de chaves de um usuário
- `DELETE /api/keys/:keyId`
    - remove a chave (404 se inexistente)

Aplicação:

- `GET /bind/:keyId.js` → script seguro com resposta JSON
- `GET /test/:keyId` → página que usa o bind
- `GET /health` → status

Admin (sessão em memória por enquanto):

- `GET /admin/login`, `POST /admin/auth/login`, `POST /admin/auth/logout`
- `GET /admin/` → dashboard
- `GET /admin/api/stats`, `GET /admin/api/session`, `GET /admin/api/sessions`, `DELETE /admin/api/sessions`

Use `docs/examples.http` no VS Code para testes rápidos.

## Notas de segurança / operação

- Sessões admin ainda vivem em memória → reinícios derrubam logins; evite exposição pública.
- Cookies admin usam `HttpOnly`, `SameSite=strict` e `Secure` (em NODE_ENV=production). Sempre rode sobre HTTPS.
- Para CORS com credenciais, defina `CORS_ORIGIN` específico – não use `*`.
- Ajuste o rate limit (`RATE_LIMIT_*`) conforme a carga esperada.
- Logs ruidosos? use `LOG_LEVEL=warn`/`error` em produção.

## Persistência (PostgreSQL + Prisma)

- Toda a camada de dados usa Prisma (`src/config/prisma.js`).
- Ao mudar o schema (`prisma/schema.prisma`), gere nova migração com `npx prisma migrate dev --name <descricao>`.
- Para aplicar migrações em produção (Vercel), o build executa `npx prisma migrate deploy` automaticamente (ver abaixo).
- Seeds: crie `prisma/seed.js` (não incluso) e execute com `npx prisma db seed` para criar admin inicial.

## Deploy (Vercel + Neon)

1. Crie um projeto Neon (Postgres serverless) e copie a `DATABASE_URL`.
2. Adicione `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (e demais secrets) nas variáveis do projeto Vercel.
3. O `vercel.json` executa o build com:

     ```json
     {
         "buildCommand": "npx prisma migrate deploy && npm run build"
     }
     ```

     Isso garante que as migrações rodem antes do build do dashboard.

4. Rewrites principais:
     - `/admin` → `/admin/`
     - `/admin/auth/*`, `/admin/api/*`, `/api/*` → `api/index.js`
     - `/admin/assets/*` → `dashboard/dist/assets/*`
     - Qualquer outra rota → `api/index.js`

5. A função serverless `api/index.js` instancia o Express uma vez por execução e reutiliza o Prisma Client.

## Utilitário CLI

```powershell
node scripts/create-key.js
```

Escolha ambiente (localhost / produção), informe `user_id` e duração para criar uma chave via API.

## Problemas comuns

- `DATABASE_URL` inválida / SSL: use `?sslmode=require` no Neon.
- Limite de tentativas de login: `ADMIN_LOGIN_MAX_ATTEMPTS` bloqueia temporariamente o IP.
- 409 ao criar chave: usuário já tem chave ativa; a resposta traz tempo restante.
- 410 em validate/info: chave expirada.

---

Projeto interno do time Koban.


