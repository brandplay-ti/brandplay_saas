Quando criar um novo ativo, permitir vinculá-lo a uma propriedade existente e já enviar a(s) foto(s) de capa/ativo no mesmo fluxo, sem precisar abrir o painel de detalhes depois.

## O que será feito

- Adicionar no modal “Novo ativo”:
  - Um seletor opcional de **Propriedade**.
  - Uma seção de **Upload de fotos** com o mesmo padrão de preview do painel de detalhes.
- Alterar a função `createAsset` para:
  1. Inserir o ativo no banco.
  2. Se uma propriedade foi escolhida, criar o registro de `asset_allocations` vinculado ao novo ativo.
  3. Se houver fotos selecionadas, fazer upload para o bucket `asset-photos` e criar os registros em `asset_photos` com `is_cover: true` na primeira foto.
- Manter o estado de carregamento durante o envio e limpar o formulário/fechar o modal em caso de sucesso.

## Arquivos envolvidos

- `src/pages/dashboard/Assets.tsx` — fluxo de criação, modal e upload.
- `src/components/ui/select.tsx` — já em uso, sem alterações necessárias.

## Considerações técnicas

- Reaproveitar a lógica de upload que já existe em `openDetail/uploadPhotos` para manter consistência de path (`owner_id/asset_id/filename`) e RLS.
- A foto deve ser enviada **após** a inserção do ativo, para que o `asset_id` seja conhecido.
- A propriedade vinculada é opcional; se o usuário não escolher nenhuma, o ativo é criado sem alocação.
- Caso o upload da foto falhe, o ativo já terá sido criado; informar o erro sem reverter a criação do ativo.
