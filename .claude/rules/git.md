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

## Entrega: só termina com a branch apagada

Todo desenvolvimento termina neste fluxo (detalhe em `CLAUDE.md`, seção 9),
sem esperar pedido para cada passo:

branch a partir de `origin/dev` → commit → push → PR para `dev` → merge com
CI verde → branch remota apagada → branch local apagada.

- Nunca trabalhar direto em `dev`, `hml` ou `main`. Com o checkout principal
  em outra branch, use um worktree em `.claude/worktrees/`.
- Merge com merge commit, só com o CI verde e sem conflito.
- O repositório não apaga a branch no merge: apague a remota com
  `git push origin --delete <branch>`. Só depois apague a local:
  `git fetch origin --prune`, `git worktree remove` se houver worktree,
  confirme com `git merge-base --is-ancestor <branch> origin/dev` e apague.
- Se algum passo não puder ser feito, pare e informe em que passo parou.

Promover `dev` → `hml` → `main` continua exigindo pedido explícito.
