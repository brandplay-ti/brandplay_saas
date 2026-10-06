# Runbook — Backup

Antes de qualquer migration num ambiente hospedado, e periodicamente:

```bash
AMBIENTE=producao   # ou: homologacao
set -a; . "/etc/brandplay/$AMBIENTE.env"; set +a
arquivo="/var/backups/brandplay/$AMBIENTE-$(date +%Y%m%d-%H%M%S).dump"
sudo install -d -m 700 /var/backups/brandplay
docker run --rm --network "$SUPABASE_NETWORK" -v /var/backups/brandplay:/backup postgres:17-alpine \
  pg_dump "$DATABASE_URL" -Fc --schema=public --schema=auth --schema=storage --schema=migrations \
  -f "/backup/$(basename "$arquivo")"
ls -lh "$arquivo"
```

Confira que o arquivo não está vazio antes de migrar. Um dump de poucos KB num
banco com dados é sinal de falha.

Os arquivos do Storage vivem no volume nomeado `storage-data` do stack daquele
ambiente (`<COMPOSE_PROJECT_NAME>_storage-data`); copie-o junto quando o
backup for completo:

```bash
docker run --rm -v brandplay-producao_storage-data:/dados:ro -v /var/backups/brandplay:/backup alpine \
  tar czf "/backup/storage-producao-$(date +%Y%m%d).tgz" -C /dados .
```

Verifique: último backup, integridade, retenção e cópia **fora da VPS**. Faça
ensaios periódicos de restauração (`docs/runbooks/restore.md`) — backup que
nunca foi restaurado não é backup.
