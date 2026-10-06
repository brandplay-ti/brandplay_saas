// Recusa um build de imagem sem as variáveis do Supabase, ou com elas erradas.
//
// Roda dentro do `Dockerfile`, e **não** no `prebuild` do npm: localmente o
// Vite lê `portal/.env.local` por conta própria, e essas variáveis não existem
// no ambiente do processo — a checagem acusaria um build local perfeitamente
// bom.
//
// O que ela evita: o Vite embute `import.meta.env.VITE_*` no bundle durante o
// build. Sem as variáveis, o `vite build` sai com código 0 e gera um bundle com
// string vazia. Não há erro nenhum; o sintoma aparece só no navegador, como
// tela branca com `Supabase URL and Anon Key must be provided` no console.
//
// Um build que falha dizendo o que falta custa um minuto. Um bundle publicado
// com string vazia custa uma investigação.

// Os apelidos existem por um motivo concreto: o modal "Connect" do Studio
// entrega o exemplo de React com **outros nomes** — `VITE_SUPABASE_URL` e
// `VITE_SUPABASE_PUBLISHABLE_KEY`. Quem copia de lá e cola no Dockploy vê o
// build parar dizendo que a variável está vazia. E está mesmo: o valor foi
// parar num nome que este projeto não lê.
//
// São também os nomes que o Lovable usava neste projeto até a saída dele
// (ADR-0001): um `.env` antigo copiado para o Dockploy cai exatamente aqui.
//
// "Está vazia" manda procurar um valor que já existe. Dizer qual nome errado
// foi usado transforma um build perdido em dez segundos de correção.
const OBRIGATORIAS = {
  VITE_PUBLIC_SUPABASE_URL: ['VITE_SUPABASE_URL', 'SUPABASE_URL'],
  VITE_PUBLIC_SUPABASE_ANON_KEY: [
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
  ],
};

const definida = (nome) => {
  const valor = process.env[nome];
  return typeof valor === 'string' && valor.trim() !== '';
};

const problemas = [];

for (const [nome, apelidos] of Object.entries(OBRIGATORIAS)) {
  if (definida(nome)) continue;

  const usado = apelidos.find(definida);

  problemas.push(
    usado
      ? `${nome} está vazia — mas ${usado} está definida.\n` +
          '     É o mesmo valor sob o nome errado. O modal "Connect" do Studio\n' +
          `     sugere \`${usado}\`; este projeto lê \`${nome}\`, e o nome está\n` +
          '     amarrado ao `Dockerfile`, ao `nixpacks.toml` e a este arquivo.\n' +
          '     Renomeie a variável no Dockploy — o valor pode ficar o mesmo.'
      : `${nome} está vazia ou não foi passada.`,
  );
}

const url = process.env.VITE_PUBLIC_SUPABASE_URL?.trim();

if (url && !/^https?:\/\//i.test(url)) {
  problemas.push(
    `VITE_PUBLIC_SUPABASE_URL precisa do esquema: "https://${url}" e não "${url}".\n` +
      '     O supabase-js valida a URL ao criar o cliente, no carregamento do\n' +
      '     módulo, então sem o esquema a aplicação inteira não sobe.',
  );
}

// A recíproca da guarda que existe no `vite.config.ts`: lá o servidor de
// desenvolvimento recusa apontar para um Supabase remoto; aqui o build recusa
// apontar para o local.
//
// Um bundle publicado com `localhost` sai do build sem nenhum erro, sobe, e
// então cada navegador que o abrir vai tentar falar com o Supabase **da própria
// máquina de quem acessa**. Não existe. O sintoma chega como `Failed to fetch`,
// a três camadas de distância da causa.
if (url && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)) {
  problemas.push(
    `VITE_PUBLIC_SUPABASE_URL aponta para ${url} — um build não pode levar isso.\n` +
      '     O valor é embutido no bundle: cada navegador que abrir a aplicação\n' +
      '     tentaria falar com o Supabase da máquina de quem acessa.\n' +
      '     Use o domínio do Supabase daquele ambiente.',
  );
}

// Não é erro de build — o portal pode até ser servido em http num ambiente de
// teste — mas em produção, atrás de TLS, o navegador bloqueia toda chamada de
// uma página https para uma API http como conteúdo misto. E o token de sessão
// viaja em texto claro.
if (url && /^http:\/\//i.test(url) && !/localhost|127\.0\.0\.1/i.test(url)) {
  console.warn(
    [
      '',
      '  AVISO: o Supabase está em http, sem TLS.',
      '',
      '  Se o portal for servido em https, o navegador bloqueia todas as',
      '  chamadas como conteúdo misto, e a aplicação abre sem carregar nada.',
      '  Em http, o token de sessão e a anon key trafegam em texto claro.',
      '',
      '  O certificado do Traefik no domínio do Supabase resolve os dois.',
      '',
    ].join('\n'),
  );
}

if (problemas.length > 0) {
  console.error(
    ['', '  Build interrompido:', '', ...problemas.map((p) => `   - ${p}`), ''].join('\n'),
  );
  process.exit(1);
}
