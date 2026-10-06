// Recusa o build num Node velho demais, com a razão na primeira linha.
//
// Roda como `prebuild`. Existe porque o caminho de build do Dockploy não falha
// quando perde o pin de versão: o Nixpacks, sem achar `nixpacks.toml`, cai
// **calado** no Node 18 dele. No central-check isso custou quatro builds, e o
// erro chegou de dentro do bundler, sem mencionar o Node.
//
// Este projeto tem como alvo o Node 26 (`nixpacks.toml`, `Dockerfile`,
// `.nvmrc` e `engines.node`). O mínimo aqui é o que o Vite exige — abaixo dele
// o build quebra com um erro que não aponta a causa. A comparação é por número
// de versão, e não por feature detection: um import de API inexistente é
// justamente o erro que este arquivo existe para traduzir.

const MINIMO = [20, 19];

const atual = process.versions.node.split('.').map(Number);
const novoOSuficiente = atual[0] > MINIMO[0] || (atual[0] === MINIMO[0] && atual[1] >= MINIMO[1]);

if (!novoOSuficiente) {
  console.error(
    [
      '',
      `  Node ${process.version} é antigo demais para compilar este projeto.`,
      '',
      `  O mínimo é o Node ${MINIMO.join('.')}; o alvo é o Node 26 (\`nixpacks.toml\`,`,
      '  `Dockerfile`, `.nvmrc` e `engines.node`).',
      '',
      '  Se isto apareceu num build do Dockploy: o `nixpacks.toml` declara o',
      '  pacote e o archive do nixpkgs justamente para o Nixpacks não decidir a',
      '  versão sozinho. Cair aqui significa que ele não leu o arquivo — confira',
      '  se a pasta base do serviço é `/portal` e se `NIXPACKS_NODE_VERSION` não',
      '  está definida no Dockploy.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
