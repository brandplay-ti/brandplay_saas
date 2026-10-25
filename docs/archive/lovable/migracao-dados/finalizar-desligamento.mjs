#!/usr/bin/env node
// Arquiva artefatos Lovable no repositório após corte validado (runbook desligar-lovable).
//
//   node supabase/tools/migracao-lovable/finalizar-desligamento.mjs --confirmar-desligamento
//
// Idempotente: pastas já arquivadas são ignoradas.

import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ARCHIVE = join(ROOT, "docs/archive/lovable");

const MOVES = [
  { de: join(ROOT, "supabase/lovable-migrations"), para: join(ARCHIVE, "lovable-migrations") },
  { de: join(ROOT, "docs/product/planos-lovable"), para: join(ARCHIVE, "planos-produto") },
  { de: join(ROOT, "supabase/tools/reconciliacao-schema"), para: join(ARCHIVE, "reconciliacao-schema") },
];

function mover(origem, destino) {
  if (!existsSync(origem)) {
    console.log(`  (já ausente) ${origem.replace(ROOT, "")}`);
    return;
  }
  if (existsSync(destino)) {
    console.log(`  (já arquivado) ${destino.replace(ROOT, "")}`);
    rmSync(origem, { recursive: true, force: true });
    return;
  }
  mkdirSync(dirname(destino), { recursive: true });
  renameSync(origem, destino);
  console.log(`  ok ${origem.replace(ROOT, "")} → ${destino.replace(ROOT, "")}`);
}

function arquivarMigracaoDados() {
  const origem = join(ROOT, "supabase/tools/migracao-lovable");
  const destino = join(ARCHIVE, "migracao-dados");
  if (!existsSync(origem)) {
    console.log("  (já ausente) supabase/tools/migracao-lovable");
    return;
  }
  if (existsSync(destino)) {
    rmSync(origem, { recursive: true, force: true });
    console.log("  migracao-dados já existia; removida cópia ativa");
    return;
  }
  mkdirSync(ARCHIVE, { recursive: true });
  cpSync(origem, destino, { recursive: true });
  rmSync(origem, { recursive: true, force: true });
  console.log("  ok supabase/tools/migracao-lovable → docs/archive/lovable/migracao-dados");
}

function main() {
  if (!process.argv.includes("--confirmar-desligamento")) {
    console.error("Use --confirmar-desligamento após validar o corte (docs/runbooks/desligar-lovable.md).");
    process.exit(1);
  }

  mkdirSync(ARCHIVE, { recursive: true });
  const readme = join(ARCHIVE, "README.md");
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      `# Arquivo — Lovable Cloud (BrandPlay)

Material histórico após desligamento do Lovable Cloud. **Não** faz parte do
caminho crítico de build, CI ou deploy.

| Pasta | Conteúdo |
|-------|----------|
| \`lovable-migrations/\` | 95 migrations reais do banco Lovable (referência ADR-0005) |
| \`migracao-dados/\` | \`exportar.mjs\`, \`importar.mjs\` (export/import cenário C) |
| \`reconciliacao-schema/\` | Scripts de diff schema Lovable × reconstruído (2026-10) |
| \`planos-produto/\` | Planos gerados no Lovable (produto, 2026-08) |

Scripts de migração (se ainda houver exportação local):

\`\`\`bash
node docs/archive/lovable/migracao-dados/exportar.mjs --env-file .env.lovable
node docs/archive/lovable/migracao-dados/importar.mjs --pasta .migracao-lovable/<data>
\`\`\`
`,
      "utf8",
    );
  }

  console.log("Arquivando artefatos Lovable...\n");
  for (const { de, para } of MOVES) mover(de, para);
  arquivarMigracaoDados();
  console.log("\nConcluído. Revise package.json, CLAUDE.md e .prettierignore (npm run migracao:* aponta para o archive).");
}

main();
