# Resetar os dados de um ambiente

Apaga todos os usuários e organizações de um ambiente hospedado, com tudo o
que depende deles, e o deixa como recém-migrado. Serve para preparar
homologação ou produção para a importação do Lovable
(`docs/architecture/plano-migracao-dados-lovable-vps.md`, seção 3.7). A
importação recusa e-mail que já exista no destino com outro id.

**Só para ambiente sem cliente.** É irreversível. Em produção com cliente,
não existe "resetar".

## Ordem

1. **Backup** do banco (`docs/runbooks/backup.md`).
2. **Assinaturas no Stripe**: cancele no Dashboard toda assinatura de teste
   que ainda esteja viva. Apagar a linha aqui não cancela nada lá. O
   `2-apagar.sql` recusa enquanto houver uma.
3. **`1-conferir.sql`** no SQL Editor do Studio do ambiente (confira pela URL
   qual é). Só leitura: lista usuários, organizações, assinaturas, arquivos
   por bucket e linhas por tabela.
4. **`2-apagar.sql`**, se o que apareceu for mesmo só cadastro de teste. Uma
   transação só. O resultado deve vir com `usuarios`, `organizacoes` e
   `linhas_em_public_fora_as_mantidas` zerados.
5. **Arquivos**: se `arquivos_storage` vier acima de zero, apague pela tela
   Storage do Studio. O Storage bloqueia DELETE direto em `storage.objects`.
6. **Importação** (seção 3.7 do plano). Depois dela: criar o superadmin
   (`docs/runbooks/superadmin.md`), porque o reset apaga `platform_admins`
   junto com os usuários.

## O que fica e o que sai

| Fica                                              | Por quê                                     |
| ------------------------------------------------- | ------------------------------------------- |
| `migrations.schema_migrations`                    | o banco continua migrado                    |
| `billing_plans`, `billing_settings`               | catálogo da plataforma, não dado de cliente |
| `platform_admin_audit_log`                        | histórico; ganha uma linha `reset_dados` com os e-mails e organizações apagados |
| `storage.buckets`, `storage.objects`              | buckets vêm das migrations; arquivos, pela tela |

Saem todas as linhas das demais tabelas de `public` (lista dinâmica: tabela
nova entra sozinha) e todos os usuários de `auth.users`. A cascata do GoTrue
leva junto identidades, sessões e fatores.

As tabelas de `public` são esvaziadas com os gatilhos desligados
(`session_replication_role = replica`). Sem isso, a ordem das FKs seria um
problema, porque várias apontam para `auth.users` sem cascata. E os gatilhos
recriariam linhas no meio da limpeza (auditoria, conta de cobrança). Depois,
`auth.users` sai com os gatilhos ligados, para a cascata do GoTrue agir.

Validado num stack local isolado, conectado como `postgres` (o papel do SQL
Editor): guarda do Stripe, reset, reexecução em banco vazio, cadastro novo
depois do reset e `supabase/tests/*.sql`.
