# Rede

Fluxo: Internet → DNS → Traefik (Dockploy, TLS) → `kong` (Supabase) ou portal.

- Cada ambiente tem dois domínios próprios: o do portal e o da API
  (`api.<dominio>`, apontado para `kong:8000`). Nunca o `sslip.io` gerado pelo
  Dockploy — ver `docs/architecture/deployment.md`.
- Exponha só o necessário. Postgres, pooler, Redis e Studio não recebem
  domínio nem porta publicada.
- A porta do Postgres não é publicada para fora da VPS sem necessidade
  documentada e controles compensatórios. As tarefas de banco usam um
  container efêmero na rede Docker do ambiente (`docs/runbooks/primeira-carga.md`).
- Portal em `https` exige API em `https`: o navegador bloqueia chamadas de uma
  página `https` para uma API `http` como conteúdo misto.
- As Edge Functions precisam de saída para a internet (importam módulos de
  `esm.sh`/`deno.land` e chamam Anthropic e Resend).
