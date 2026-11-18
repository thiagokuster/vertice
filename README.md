# Vértice

Sistema web de gestão de estoque. Entradas, saídas, transferências e ajustes ficam no histórico, e cada pessoa acessa só o que o seu perfil permite.

## 🚀 Demo

Ainda não há uma versão publicada. Depois de rodar localmente, abra [http://localhost:3000](http://localhost:3000).

## 🛠️ Tecnologias

- Next.js
- React
- TypeScript
- Tailwind CSS
- Prisma
- SQLite
- Auth.js
- shadcn/ui
- Zod

## ✨ Funcionalidades

- Login, recuperação de senha e sessão com expiração
- Três perfis: administrador, padrão e ajudante, com permissão conferida no servidor
- Produtos, categorias, fornecedores e depósitos
- Entradas, saídas, transferências e ajustes, com histórico que não é apagado
- Alertas de estoque baixo, zerado e perto da validade
- Relatórios com exportação em PDF e Excel
- Auditoria de acessos e alterações
- Tema claro e escuro

## 📦 Como rodar localmente

```bash
git clone https://github.com/thiagokuster/vertice.git
cd vertice
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Copie `.env.example` para `.env` antes de migrar e semear o banco. O gerenciador do projeto é o npm, com o lockfile `package-lock.json`.

No desenvolvimento, com `SEED_DEMO=true`, o seed cria usuários de exemplo:

- Administrador: `admin@estoque.local` / `Admin@123456`
- Padrão: `operador@estoque.local` / `Operador@123456`
- Ajudante: `ajudante@estoque.local` / `Ajudante@123456`

Em produção, defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` e deixe `SEED_DEMO` desligado. A recuperação de senha envia e-mail se `SMTP_HOST` estiver configurado.

## 📄 Licença

[MIT](LICENSE)
