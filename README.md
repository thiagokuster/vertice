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

Em produção, defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` com uma senha própria e deixe `SEED_DEMO` desligado. A senha de exemplo só é criada com `SEED_DEMO=true` fora de produção. `AUTH_SECRET` precisa ter pelo menos 32 caracteres e não pode ficar com o valor de exemplo. Se o sistema ficar atrás de um proxy, liste o endereço dele em `TRUSTED_PROXIES`; sem essa lista, o IP do cabeçalho não entra no limite de tentativas. A recuperação de senha envia e-mail se `SMTP_HOST` estiver configurado.

## Antes de usar em uma empresa

O SQLite serve enquanto existir um único processo do servidor. Saldo, lote, histórico e auditoria de cada movimentação entram na mesma transação. O `docker-compose.yml` sobe um PostgreSQL, mas o Prisma deste repositório ainda usa SQLite e as migrações atuais não rodam no Postgres. Para trocar, altere o provider para `postgresql`, aponte `DATABASE_URL` e crie uma migração nova.

O processo grava uma cópia em `backups/` uma vez por dia. `npm run db:backup` faz a cópia na hora e conserva as 14 mais recentes. Com PostgreSQL, o mesmo comando usa `pg_dump`.

`npm run verify` confere permissões, saldo e o desfazer de uma gravação interrompida. `npm run test:access`, com `npm run dev` no ar, entra com os três perfis e confere páginas, exportação e o fim da sessão depois de um bloqueio.

## 📄 Licença

[MIT](LICENSE)
