# WalletAI — Backend

API do WalletAI, um app de gestão financeira pessoal com recursos de IA, desenvolvido como projeto universitário.

## Tecnologias

- **Node.js + Express** — servidor e rotas da API
- **MySQL** — banco de dados relacional
- **Prisma ORM** — modelagem do banco e queries
- **bcrypt** — criptografia de senhas
- **jsonwebtoken (JWT)** — autenticação
- **Groq API** (modelo `openai/gpt-oss-120b`) — categorização automática de transações via IA

## Pré-requisitos

- Node.js instalado
- MySQL instalado e rodando localmente (ou via Docker)
- Uma chave de API gratuita da Groq ([console.groq.com](https://console.groq.com))

## Configuração

1. Clone o repositório e instale as dependências:
   ```
   npm install
   ```

2. Crie um arquivo `.env` na raiz com:
   ```
   DATABASE_URL="mysql://usuario:senha@localhost:3306/walletai"
   JWT_SECRET="uma-frase-aleatoria-bem-dificil-de-adivinhar"
   GROQ_API_KEY="sua-chave-da-groq-aqui"
   ```

3. Crie o banco e as tabelas:
   ```
   npx prisma migrate dev --name init
   ```

4. Rode o servidor em modo desenvolvimento:
   ```
   npm run dev
   ```
   O servidor sobe em `http://localhost:3000`.

## Estrutura do projeto

```
walletai-backend/
├── prisma/
│   └── schema.prisma      # Modelos do banco: User, Category, Transaction
├── lib/
│   └── prisma.js          # Instância única do Prisma Client
├── routes/
│   └── auth.js            # Rotas de registro e login
├── services/
│   └── aiService.js       # Integração com a API da Groq
└── server.js               # Ponto de entrada da aplicação
```

## Rotas da API

| Método | Rota             | Descrição                              |
|--------|-------------------|-----------------------------------------|
| POST   | `/auth/register`  | Cria um novo usuário                    |
| POST   | `/auth/login`      | Autentica e retorna um token JWT        |
| POST   | `/test-ai`         | Testa a categorização automática via IA |

## Visualizar o banco de dados

Para inspecionar os dados diretamente por uma interface visual:
```
npx prisma studio
```

## Segurança

- Senhas nunca são salvas em texto puro — são criptografadas com `bcrypt` antes de ir para o banco
- Autenticação via token JWT, válido por 7 dias
- Chaves de API e credenciais ficam apenas no `.env`, que não é versionado (veja `.gitignore`)