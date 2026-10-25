# Importação de ativos em massa

Adicionar um botão "Importar CSV" ao lado de "Novo ativo" na página de Ativos, permitindo criar vários ativos de uma vez.

## Fluxo

1. Usuário clica em "Importar CSV" e baixa um modelo com as colunas:
   `nome, categoria, valor_unitario, quantidade, propriedade, observacoes`
2. Usuário arrasta/seleciona o arquivo `.csv` (ou cola o conteúdo em uma caixa de texto).
3. O sistema mostra uma pré-visualização em tabela com:
   - linhas válidas (prontas para importar)
   - linhas com erro (nome vazio, valor não numérico) marcadas e ignoradas
   - categorias novas detectadas (serão criadas automaticamente)
   - propriedade casada pelo nome; se não encontrar, o ativo é criado sem alocação
4. Usuário confirma; barra de progresso mostra o andamento e um resumo final
   ("X ativos importados, Y linhas ignoradas").

## Regras

- Padrões quando o campo estiver vazio: categoria = "Outro", quantidade = 1, valor = 0.
- Nomes duplicados no catálogo geram aviso na pré-visualização, mas não bloqueiam.
- Fotos não fazem parte da importação em massa (só na criação individual).

## Detalhes técnicos

- Novo componente `src/components/assets/AssetBulkImportDialog.tsx`.
- Parser CSV simples e próprio (suporta aspas e separador `,` ou `;`) em `src/lib/csvParse.ts` — sem nova dependência.
- Inserção em lote via `supabase.from("assets").insert([...])` em blocos de 100, com `organization_id` e `owner_id` como já feito em `createAsset`.
- Alocações criadas em um segundo insert em `asset_allocations` para as linhas com propriedade casada.
- Categorias novas adicionadas à lista personalizada em `localStorage` (`brandplay:asset-categories`).
- `Assets.tsx`: adiciona o botão no cabeçalho e recarrega a lista após a importação.
