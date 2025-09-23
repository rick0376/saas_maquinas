# saas_maquinas — Projeto completo (Passos 1 a 4)
## Stack
- Next.js 14 (Pages Router) + NextAuth (credenciais)
- Prisma + PostgreSQL
- SCSS Modules + tema dark
- Chart.js (dashboard), jsPDF (relatórios), QRCode (WhatsApp)

## Scripts
- `yarn prisma:generate` / `yarn prisma:migrate` / `yarn seed`
- `yarn dev`

## Login demo
- admin@acme.com / admin123
- superadmin@root.local / superadmin123
- user@acme.com / user123

## Rotas principais
- `/login`, `/` (home), `/dashboard`, `/operacao`
- CRUD: `/maquinas`, `/secoes`, `/contatos`, `/paradas`
- Relatórios: `/relatorios/paradas`
- Integrações: `/integracoes/whatsapp`
