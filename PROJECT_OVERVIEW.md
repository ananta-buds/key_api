# Koban Free API v2.0 — Visão Geral do Projeto

## O que é

API REST para **criar, validar e gerenciar chaves de acesso temporárias**, com painel administrativo completo. Projetada para uso interno — o fluxo típico é: um admin gera chaves que são distribuídas a usuários e consumidas/validadas por aplicações externas (ex.: bots Discord).

---

## Stack Tecnológica

| Camada | Tecnologia | Papel |
|---|---|---|
| **Runtime** | Node.js 18+ | Servidor da API |
| **Framework HTTP** | Express 4 | Roteamento, middlewares, servir estáticos |
| **Banco de Dados** | PostgreSQL (Neon) | Persistência de chaves, sessões e admins |
| **ORM** | Prisma 6 | Schema declarativo, migrações, client type-safe |
| **Frontend (Admin)** | React 18 + Vite 5 | SPA do painel administrativo |
| **Autenticação** | bcryptjs + crypto (SHA-256) | Hash de senhas e tokens de sessão |
| **Segurança** | Helmet, CORS, express-rate-limit | Headers HTTP seguros, controle de origem, anti-abuso |
| **Deploy** | Vercel (Serverless) | Hosting, builds automáticos, rewrites |
| **Utilitários** | dotenv, uuid, cookie-parser | Variáveis de ambiente, IDs únicos, cookies |

---

## Arquitetura

```
┌──────────────────────────────────────────────────────┐
│                    Vercel (Produção)                  │
│  ┌────────────┐    ┌──────────────────────────────┐  │
│  │  Static     │    │  Serverless Function          │  │
│  │  dashboard/ │    │  api/index.js → Express app   │  │
│  │  dist/      │    │                                │  │
│  └────────────┘    └──────────────────────────────┘  │
│         ↑                        ↑                    │
│    /admin/*               /api/* e /*                 │
└──────────────────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │  PostgreSQL (Neon)   │
                    │  via Prisma Client   │
                    └─────────────────────┘
```

- O **Express** serve tanto a API REST quanto o painel admin (build estático do Vite).
- Na Vercel, o `api/index.js` atua como entrypoint serverless que exporta o app Express.
- O `vercel.json` configura rewrites para rotear `/admin/*` ao dashboard estático e o restante ao serverless.

---

## Modelos de Dados (Prisma)

| Model | Descrição |
|---|---|
| **AdminUser** | Usuários admin com senha hasheada, status (ACTIVE/DISABLED), expiração opcional, flag `isPermanent` |
| **AdminSession** | Sessões autenticadas com token hasheado (SHA-256), IP, user-agent, TTL configurável |
| **AccessKey** | Chaves de acesso com UUID, status (ACTIVE/EXPIRED/REVOKED), contagem de uso, IP e expiração |

---

## Principais Endpoints

### API de Chaves (`/api/keys`)

| Método | Rota | Função |
|---|---|---|
| `POST` | `/create` | Cria nova chave para um userId |
| `GET` | `/validate/:keyId` | Valida se a chave está ativa e não expirada |
| `GET` | `/info/:keyId` | Retorna informações detalhadas da chave |
| `GET` | `/user/:userId` | Lista todas as chaves de um usuário |
| `DELETE` | `/:keyId` | Remove/revoga uma chave |

### API Pública (`/api`)

| Método | Rota | Função |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/` | Informações da API |
| `GET` | `/ip` | Mostra IP detectado do cliente |
| `GET` | `/bind/:keyId.js` | Gera script de binding para a chave |

### Admin (`/admin`)

| Método | Rota | Função |
|---|---|---|
| `POST` | `/auth/login` | Login do admin |
| `POST` | `/auth/logout` | Logout |
| `GET` | `/api/stats` | Estatísticas do dashboard |
| `GET` | `/api/session` | Info da sessão atual |
| `GET/DELETE` | `/api/sessions` | Listar/limpar sessões ativas |
| `GET/POST` | `/api/admins` | Listar/criar admins |
| `PATCH/DELETE` | `/api/admins/:id` | Editar/remover admin |

---

## Segurança

- **Senhas** hasheadas com bcrypt (12 rounds por padrão, configurável via `ADMIN_PASSWORD_ROUNDS`)
- **Tokens de sessão** gerados com `crypto.randomBytes(48)` e armazenados como hash SHA-256
- **Rate limiting** configurável (`RATE_LIMIT_*`) para proteção contra abuso
- **Brute-force protection** no login admin (`ADMIN_LOGIN_MAX_ATTEMPTS` / `ADMIN_LOGIN_WINDOW_MS`)
- **Helmet** para headers HTTP de segurança (CSP, HSTS, etc.)
- **CORS** com origin e credentials configuráveis
- **Trust proxy** habilitado apenas em produção para captura correta de IP

---

## Dashboard Admin

SPA em **React 18** empacotada com **Vite 5**, composta pelos componentes:

| Componente | Responsabilidade |
|---|---|
| `AdminDashboard` | Layout principal e orquestração das views |
| `DashboardStats` | Cards com estatísticas (chaves ativas, expiradas, etc.) |
| `KeysManager` | CRUD completo de chaves de acesso |
| `AdminUsersManager` | Gerenciamento de usuários admin |
| `AdminSettings` | Configurações e gerenciamento de sessões |
| `Sidebar` | Navegação lateral |

O build final (`dashboard/dist/`) é servido como estático em `/admin` tanto localmente quanto na Vercel.

---

## Configuração e Variáveis de Ambiente

As variáveis são carregadas com **dotenv** em cascata:

1. `.env` — base
2. `.env.{NODE_ENV}` — sobrescreve por ambiente
3. `.env.local` e `.env.{NODE_ENV}.local` — overrides locais (ignorados em prod)

Principais variáveis:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string do PostgreSQL |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Credenciais do admin padrão |
| `PORT` | Porta do servidor (default: 3000) |
| `NODE_ENV` | Ambiente (development/production) |
| `CORS_ORIGIN` | Origem permitida para CORS |
| `RATE_LIMIT_*` | Configurações de rate limiting |
| `DEFAULT_KEY_HOURS` / `MAX_KEY_HOURS` | Duração padrão e máxima das chaves |
| `ADMIN_SESSION_TTL_HOURS` | TTL das sessões admin (default: 24h) |

---

## Como Rodar

```bash
# Instalar dependências e gerar Prisma client
npm install

# Aplicar migrações no banco
npx prisma migrate dev

# Rodar em modo dev (com hot reload)
npm run dev

# Build do dashboard para produção
npm run build

# Rodar em produção
npm start
```

---

## Deploy (Vercel)

- **Build command**: `npx prisma migrate deploy && npx prisma generate && npm run build`
- O `api/index.js` exporta o Express como serverless function
- Assets estáticos do dashboard servidos diretamente pela CDN da Vercel
- Variáveis de ambiente configuradas no painel da Vercel (secrets)
