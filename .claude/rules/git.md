# Git

## Commits

Formato obrigatório:

```
<tipo>(<escopo>): <descricao em portugues>
```

Exemplos:

```
feature(pipeline): adiciona drag and drop entre estagios do funil
feature(portal): adiciona listagem de documentos do patrocinador
fix(contratos): corrige calculo de parcelas com desconto
fix(auth): corrige redirecionamento apos login sem organizacao ativa
refactor(sponsors): simplifica hook de acesso ao portal
test(rls): adiciona teste de isolamento por organizacao
chore(migrations): adiciona indice em contracts.organization_id
docs(adr): registra decisao sobre migracao de ia
```

Tipos permitidos: `feature`, `fix`, `refactor`, `chore`, `test`, `docs`,
`perf`, `build`, `ci`, `security`.

## Regras

Mensagens devem:

- estar em português;
- ser objetivas;
- usar verbo no presente;
- informar o que foi alterado, não só "mudou algo".

Não utilizar sem contexto: `feat: coisas`, `update`, `changes`, `fixes`,
`ajustes`, `wip`.

## Segurança

Nunca executar automaticamente: `git push --force`, `git reset --hard`,
`git clean -fd`. Operações potencialmente destrutivas exigem confirmação
explícita do usuário.

## Branches

Não trabalhar diretamente em `main` para alterações de funcionalidade quando
o fluxo do projeto passar a usar Pull Requests (ver `.claude/rules/cicd.md`).
Enquanto o repositório não tiver esse fluxo formalizado, siga a orientação
explícita do usuário na tarefa.
