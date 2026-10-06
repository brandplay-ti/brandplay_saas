# Runbook — Restore

1. Identifique o incidente e o ponto de recuperação.
2. Preserve o estado atual (dump do banco como está) antes de sobrescrever.
3. Restaure no ambiente alvo, pela rede Docker dele:

   ```bash
   docker run --rm --network "$SUPABASE_NETWORK" -v /var/backups/brandplay:/backup postgres:17-alpine \
     pg_restore -d "$DATABASE_URL" --clean --if-exists --no-owner "/backup/<arquivo>.dump"
   ```

4. Restaure o volume do Storage se necessário.
5. Verifique: integridade do banco (`migrate.sh --status`), autenticação,
   isolamento entre organizações (`npm run supabase:checar`), fluxos críticos e
   monitoramento.

Ensaie em homologação antes de restaurar produção.
