// Guarda do CI: da 0045 em diante, toda migration termina com o proprio registro
// em migrations.schema_migrations.
//
//   node supabase/tools/checar-autorregistro.mjs
//
// Migrations sao aplicadas a mao e, sem SSH, pelo SQL Editor do Studio. Arquivo
// colado sem essa linha roda e nao fica registrado: o `migrate.sh` passa a
// tentar reaplicar tudo dali em diante. Foi assim que a tabela de um ambiente
// hospedado parou na 0029 com migrations posteriores ja aplicadas.
//
// A linha tem de ser a ultima instrucao, para so entrar se o resto tiver rodado,
// e nao pode ter `on conflict`: colar o arquivo de novo tem de falhar na chave
// primaria e desfazer tudo. O checksum fica para o `migrate.sh` e o bundle, porque
// um arquivo nao contem o proprio hash.
//
// As migrations ate a 0044 ficam de fora: ja foram aplicadas e nao se editam.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRIMEIRA_COM_AUTORREGISTRO = '0045';

const REGISTRO =
  /insert\s+into\s+migrations\.schema_migrations\s*\(\s*version\s*\)\s*values\s*\(\s*'([^']*)'\s*\)\s*;$/i;

/** Tira as linhas em branco e os comentarios depois da ultima instrucao. */
function ateUltimaInstrucao(sql) {
  const linhas = sql.replace(/\r/g, '').split('\n');
  while (linhas.length > 0 && /^\s*(--.*)?$/.test(linhas[linhas.length - 1])) linhas.pop();
  return linhas.join('\n').trimEnd();
}

/** Devolve o problema da migration, ou null quando ela esta certa. */
export function problemaDeAutorregistro(versao, sql) {
  if (versao < PRIMEIRA_COM_AUTORREGISTRO) return null;

  const registro = REGISTRO.exec(ateUltimaInstrucao(sql));
  if (!registro) {
    return (
      'a ultima instrucao do arquivo tem de ser, sem on conflict:\n' +
      `    insert into migrations.schema_migrations (version)\n    values ('${versao}');`
    );
  }
  if (registro[1] !== versao) {
    return `registra "${registro[1]}", mas o arquivo e "${versao}"`;
  }
  return null;
}

function principal() {
  const pasta = fileURLToPath(new URL('../migrations', import.meta.url));
  const arquivos = readdirSync(pasta)
    .filter((nome) => nome.endsWith('.sql'))
    .sort();

  const problemas = arquivos.flatMap((nome) => {
    const versao = nome.replace(/\.sql$/, '');
    const problema = problemaDeAutorregistro(versao, readFileSync(join(pasta, nome), 'utf8'));
    return problema ? [`FALHA: ${nome}: ${problema}`] : [];
  });

  if (problemas.length > 0) {
    for (const problema of problemas) console.error(problema);
    process.exit(1);
  }

  const conferidas = arquivos.filter((nome) => nome >= PRIMEIRA_COM_AUTORREGISTRO).length;
  console.log(`OK: ${conferidas} migration(s) a partir da ${PRIMEIRA_COM_AUTORREGISTRO}, todas com autorregistro.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal();
}
