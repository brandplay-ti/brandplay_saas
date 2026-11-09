import assert from 'node:assert/strict';
import { test } from 'node:test';

import { problemaDeAutorregistro } from './checar-autorregistro.mjs';

const VERSAO = '0045_exemplo';
const CORPO = 'create table public.exemplo (id uuid primary key);\n\n';
const REGISTRO = `insert into migrations.schema_migrations (version)\nvalues ('${VERSAO}');\n`;

test('aceita a migration que termina com o proprio registro', () => {
  assert.equal(problemaDeAutorregistro(VERSAO, CORPO + REGISTRO), null);
});

test('aceita comentario e linhas em branco depois do registro', () => {
  assert.equal(problemaDeAutorregistro(VERSAO, `${CORPO}${REGISTRO}\n-- fim\n\n`), null);
});

test('aceita CRLF e maiusculas', () => {
  const sql = `${CORPO}INSERT INTO migrations.schema_migrations (version)\r\nVALUES ('${VERSAO}');\r\n`;
  assert.equal(problemaDeAutorregistro(VERSAO, sql), null);
});

test('recusa migration sem registro', () => {
  assert.match(problemaDeAutorregistro(VERSAO, CORPO), /ultima instrucao/);
});

test('recusa registro que nao e a ultima instrucao', () => {
  const sql = `${REGISTRO}\ncreate index exemplo_idx on public.exemplo (id);\n`;
  assert.match(problemaDeAutorregistro(VERSAO, sql), /ultima instrucao/);
});

test('recusa on conflict, que deixaria reaplicar o arquivo', () => {
  const sql = `${CORPO}insert into migrations.schema_migrations (version)\nvalues ('${VERSAO}')\non conflict (version) do nothing;\n`;
  assert.match(problemaDeAutorregistro(VERSAO, sql), /ultima instrucao/);
});

test('recusa registro copiado de outra migration', () => {
  const sql = `${CORPO}insert into migrations.schema_migrations (version)\nvalues ('0044_outra');\n`;
  assert.match(problemaDeAutorregistro(VERSAO, sql), /registra "0044_outra"/);
});

test('migration ate a 0044 nao precisa de registro', () => {
  assert.equal(problemaDeAutorregistro('0044_relatorio_de_entregas_por_contrato', CORPO), null);
});
