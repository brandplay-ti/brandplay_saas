# Backup

Faça backup do PostgreSQL e do volume do Storage (`storage-data`) de cada
ambiente hospedado. Mantenha cópias fora da VPS, política de retenção e testes
de restauração. Um backup só é confiável depois de restaurado com sucesso.

Procedimento em `docs/runbooks/backup.md`. Exportações do Lovable
(`.migracao-lovable/`) contêm dados pessoais reais: ficam fora do repositório,
criptografadas, e são apagadas depois do corte (LGPD).
