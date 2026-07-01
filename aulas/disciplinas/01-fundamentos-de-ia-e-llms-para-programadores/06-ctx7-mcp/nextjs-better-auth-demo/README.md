# Demo Next.js + Better Auth + GitHub OAuth + SQLite

Demo extremamente simples de autenticação com GitHub usando Better Auth, Next.js (App Router) e SQLite.

## 🚀 Funcionalidades

- ✅ Login/Signup via GitHub OAuth
- ✅ Página Home mostrando estado da sessão
- ✅ Persistência local com SQLite
- ✅ UI bonita com Tailwind CSS

## 📋 Pré-requisitos

- Node.js 18+ instalado
- Conta no GitHub
- npm

## 🔧 Configuração

### 1. Criar OAuth App no GitHub

1. Acesse: https://github.com/settings/developers
2. Clique em "New OAuth App"
3. Preencha:
   - **Application name**: `Demo Better Auth`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Copie o **Client ID** e gere um **Client Secret**

### 2. Configurar variáveis de ambiente

Edite o arquivo `.env.local` e adicione suas credenciais:

```env
GITHUB_CLIENT_ID=seu_github_client_id_aqui
GITHUB_CLIENT_SECRET=seu_github_client_secret_aqui
BETTER_AUTH_URL=http://localhost:3000
```

### 3. Instalar dependências

```bash
npm install
```

### 4. Criar tabelas do banco de dados

```bash
npx @better-auth/cli migrate
```

Este comando cria o arquivo `better-auth.sqlite` com todas as tabelas necessárias.

### 5. Iniciar o servidor

```bash
npm run dev
```

Acesse: http://localhost:3000

## 📂 Estrutura do Projeto

```
├── app/
│   ├── api/auth/[...all]/route.ts  # Route handler do Better Auth
│   ├── login/page.tsx              # Página de login
│   └── page.tsx                    # Página home
├── lib/
│   ├── auth.ts                     # Configuração do Better Auth (servidor)
│   └── auth-client.ts              # Cliente Better Auth (browser)
├── .env.local                      # Variáveis de ambiente
└── better-auth.sqlite              # Banco de dados (gerado após migrate)
```

## 🎯 Como Usar

1. Acesse http://localhost:3000
2. Clique em "Ir para Login"
3. Clique em "Entrar com GitHub"
4. Autorize o aplicativo
5. Você será redirecionado e verá "Logado como seu_email@github.com"
6. Clique em "Sair" para encerrar a sessão

## 🛠️ Tecnologias

- **Next.js 15** - Framework React
- **Better Auth** - Biblioteca de autenticação
- **SQLite** (better-sqlite3) - Banco de dados local
- **Tailwind CSS** - Estilização
- **TypeScript** - Tipagem estática

## 📝 Observações

- O banco `better-auth.sqlite` é criado localmente e persiste entre restarts
- As credenciais do GitHub são apenas para desenvolvimento local
- Para produção, configure URLs corretas e use variáveis de ambiente seguras
