/**
 * Estrutura padrão de cláusulas de um contrato de patrocínio.
 * Cada parte já vem com texto pré-programado; apenas os dados principais
 * do patrocinador, da organização e do contrato são substituídos.
 */

export type ClauseTemplateContext = {
  sponsor?: {
    name?: string | null;
    legal_name?: string | null;
    trade_name?: string | null;
    tax_id?: string | null;
    address?: string | null;
    address_city?: string | null;
    address_state?: string | null;
    zip_code?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  organization?: {
    name?: string | null;
    legal_name?: string | null;
    trade_name?: string | null;
    cnpj?: string | null;
    address_street?: string | null;
    address_number?: string | null;
    address_complement?: string | null;
    address_neighborhood?: string | null;
    address_city?: string | null;
    address_state?: string | null;
    zip_code?: string | null;
    legal_representative?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  contract: {
    title?: string | null;
    contract_number?: string | null;
    brand?: string | null;
    total_value?: number | null;
    flat_value?: number | null;
    use_flat_value?: boolean | null;
    start_date?: string | null;
    end_date?: string | null;
    payment_method_label?: string | null;
    installments?: number | null;
    due_day?: number | null;
    due_days?: number | null;
    custom_due_dates?: string[] | null;
  };
  assets?: { name: string; quantity: number; unit_value: number; notes?: string | null; category?: string | null }[];
  propertyName?: string | null;
};

const DASH = "—";

const brl = (v?: number | null) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const date = (d?: string | null) => {
  if (!d) return DASH;
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const orgAddress = (o: ClauseTemplateContext["organization"]) => {
  if (!o) return DASH;
  const line = [
    [o.address_street, o.address_number].filter(Boolean).join(", "),
    o.address_complement,
    o.address_neighborhood,
    [o.address_city, o.address_state].filter(Boolean).join("/"),
    o.zip_code ? `CEP ${o.zip_code}` : null,
  ]
    .filter(Boolean)
    .join(" - ");
  return line || DASH;
};

const brlWords = (v?: number | null) => {
  const n = Math.floor(Number(v || 0));
  if (n === 0) return "zero reais";

  const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "dez", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  const toWords = (num: number): string => {
    if (num === 0) return "";
    if (num === 100) return "cem";
    if (num < 10) return units[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) {
      const t = Math.floor(num / 10);
      const u = num % 10;
      return u ? `${tens[t]} e ${units[u]}` : tens[t];
    }
    const h = Math.floor(num / 100);
    const r = num % 100;
    return r ? `${hundreds[h]} e ${toWords(r)}` : hundreds[h];
  };

  const groups: string[] = [];
  const labels = ["", "mil", "milhão", "bilhão"];
  let num = n;
  let i = 0;
  while (num > 0) {
    const g = num % 1000;
    if (g) {
      if (i === 0) groups.unshift(toWords(g));
      else if (i === 1) groups.unshift(g === 1 ? "mil" : `${toWords(g)} mil`);
      else groups.unshift(`${toWords(g)} ${labels[i]}${g > 1 ? "s" : ""}`);
    }
    num = Math.floor(num / 1000);
    i++;
  }

  const words = groups.join(" e ");
  if (n >= 1_000_000 && n % 1000 === 0) return `${words} de reais`;
  return `${words} reais`;
};

export const CONTRACT_SECTION_TITLES = [
  "1. Dados cadastrais",
  "2. Objeto",
  "3. Ativos contratados",
  "4. Obrigações do patrocinador",
  "5. Obrigações da organização",
  "6. PREÇO E FORMA DE PAGAMENTO:",
  "7. VIGÊNCIA:",
  "8. Descumprimento de obrigação",
  "9. Rescisão",
  "10. Declarações e garantias",
  "11. Disposições gerais",
  "12. Foro",
  "13. Assinaturas",
] as const;

export type BuiltClause = { title: string; content: string };

export function buildContractClauses(ctx: ClauseTemplateContext): BuiltClause[] {
  const sp = ctx.sponsor ?? undefined;
  const org = ctx.organization ?? undefined;
  const c = ctx.contract;

  const sponsorName = sp?.legal_name || sp?.name || c.brand || "PATROCINADOR";
  const orgName = org?.legal_name || org?.name || "ORGANIZAÇÃO";
  const orgTrade = org?.trade_name || org?.name || "ORGANIZAÇÃO";
  const spTrade = sp?.trade_name || sp?.name || c.brand || "PATROCINADOR";
  const flat = !!c.use_flat_value;
  const value = flat ? Number(c.flat_value ?? c.total_value ?? 0) : Number(c.total_value ?? 0);

  const paymentLines: string[] = [];
  const paymentMethod = c.payment_method_label || DASH;
  const installments = Number(c.installments || 0);
  const installmentsText = installments > 1 ? `${installments} parcelas` : installments === 1 ? "1 parcela única" : "parcela única";
  const dueText = (() => {
    if (c.custom_due_dates?.length) {
      return c.custom_due_dates.length === 1
        ? `${date(c.custom_due_dates[0])}`
        : `${c.custom_due_dates.map(date).join(", ")}`;
    }
    if (c.due_day) return `todo dia ${c.due_day} de cada período`;
    if (c.due_days) return `${c.due_days} dias após a assinatura`;
    return DASH;
  })();
  const dueIntro = c.custom_due_dates && c.custom_due_dates.length > 1 ? "com vencimentos em" : "com vencimento em";

  paymentLines.push(
    `4.1. Em contrapartida à aquisição dos direitos e benefícios previstos na Cláusula 1.1 do presente Contrato, a "${spTrade}" pagará à ${orgName} o valor total de ${brl(value)} - (${brlWords(value)}), além do fornecimento de produtos bonificados durante toda a realização da competição, bem como a aplicação de eventuais gatilhos comerciais vinculados ao volume de vendas de produtos, conforme previamente ajustado entre as Partes.`,
    "",
    `O valor acima será pago em ${installmentsText} (${paymentMethod}), ${dueIntro} ${dueText}, mediante depósito ou transferência bancária na conta indicada pela ${orgName}.`,
    "",
    "4.2. O atraso no pagamento do valor previsto na Cláusula 4.1, supra, gerará multa de 3% (três por cento) sobre o valor devido, além de juros de mora de 2,5% ao mês ou fração proporcional, contados a partir da data em que a obrigação deveria ter sido cumprida até a data do efetivo pagamento.",
    "",
    "4.3. Cada uma das Partes será responsável pelo pagamento e/ou retenção de eventuais obrigações legais tributárias, incidentes na operação, de acordo com a legislação vigente, devendo as Partes realizar ou permitir realizar quaisquer atos necessários para o cumprimento desta finalidade.",
    "",
    `4.4. O preço aqui estabelecido representa a totalidade do negócio ora firmado entre as Partes, não podendo a "${spTrade}", em qualquer situação, pleitear eventual abatimento no preço da remuneração acima prevista caso venha abrir mão parcial ou totalmente, durante o prazo contratual, de seus direitos estabelecidos neste Contrato.`,
  );

  const assetLine = (a: NonNullable<ClauseTemplateContext["assets"]>[number]) => {
    const base = `• ${a.name}${a.quantity > 1 ? ` (qtd: ${a.quantity})` : ""}${
      !flat && a.unit_value ? ` — ${brl(a.unit_value)}` : ""
    }`;
    return a.notes ? `${base}\n   Obs.: ${a.notes}` : base;
  };

  const assetLines: string[] = [];
  if (ctx.assets?.length) {
    const groups = new Map<string, typeof ctx.assets>();
    for (const a of ctx.assets) {
      const key = a.category?.trim() || "Sem categoria";
      if (!groups.has(key)) groups.set(key, [] as typeof ctx.assets);
      groups.get(key)!.push(a);
    }
    const keys = Array.from(groups.keys()).sort((x, y) => x.localeCompare(y, "pt-BR"));
    keys.forEach((k, i) => {
      if (i > 0) assetLines.push("");
      assetLines.push(`${k.toUpperCase()}`);
      groups.get(k)!.forEach((a) => assetLines.push(assetLine(a)));
    });
  } else {
    assetLines.push("• Os ativos contratados constam do anexo/aba de ativos deste contrato.");
  }

  const party = (p: {
    legal: string;
    city: string;
    state: string;
    address: string;
    zip: string;
    doc: string;
    trade: string;
  }) =>
    `${p.legal}, sociedade com sede na Cidade de ${p.city}, Estado de ${p.state}, na ${p.address} – CEP ${p.zip}, inscrita no CNPJ/MF sob o nº ${p.doc}, neste ato representada na forma de seu Contrato Social, detentora do nome fantasia “${p.trade}” e dos respectivos direitos de uso de marca, doravante denominada simplesmente “${p.trade}”.`;

  const propertyLabel = ctx.propertyName || c.title || DASH;
  const year = c.start_date ? String(c.start_date).slice(0, 4) : String(new Date().getFullYear());

  return [
    {
      title: CONTRACT_SECTION_TITLES[0],
      content: [
        "Organização (Patrocinada):",
        party({
          legal: org?.legal_name || org?.name || DASH,
          city: org?.address_city || DASH,
          state: org?.address_state || DASH,
          address:
            [
              [org?.address_street, org?.address_number].filter(Boolean).join(", "),
              org?.address_complement,
              org?.address_neighborhood,
            ]
              .filter(Boolean)
              .join(" - ") || DASH,
          zip: org?.zip_code || DASH,
          doc: org?.cnpj || DASH,
          trade: orgTrade,
        }),
        "",
        "Patrocinador:",
        party({
          legal: sp?.legal_name || sp?.name || DASH,
          city: sp?.address_city || DASH,
          state: sp?.address_state || DASH,
          address: sp?.address || DASH,
          zip: sp?.zip_code || DASH,
          doc: sp?.tax_id || DASH,
          trade: spTrade,
        }),
      ].join("\n"),
    },
    {
      title: CONTRACT_SECTION_TITLES[1],
      content: [
        "CONSIDERANDO QUE:",
        "",
        `(i) a ${orgTrade} possui os direitos de exploração comercial desta que, atualmente, é denominada “${propertyLabel}”;`,
        "",
        `(ii) “${spTrade}”, tem interesse em divulgar sua imagem, marca, dístico e/ou logotipo, mediante determinada e específica contrapartida financeira, sendo, por isto, detentora de determinados direitos, conforme previstos neste documento;`,
        "",
        `Sendo assim, ${orgTrade} e “${spTrade}” — que a partir daqui, quando referidas em conjunto, poderão ser designadas somente como “Partes” e isoladamente como “Parte” — resolvem celebrar o presente Contrato de Veiculação de Marca (doravante denominado simplesmente “Contrato”), que se regerá conforme as seguintes cláusulas e condições, na melhor forma de direito.`,
        "",
        "1. OBJETO:",
        "",
        `1.1. O objeto do presente Contrato é a aquisição, por “${spTrade}”, de determinados direitos no evento denominado “${propertyLabel}”, apenas e tão somente em sua edição do ano ${year}, ficando autorizada, por ambas as partes, a divulgação no sentido de ser a “${spTrade}” patrocinadora oficial do referido evento (edição ${year}), podendo a exposição das marcas ocorrer de forma conjunta ou individual, conforme abaixo disposto (Cláusula 3 – Ativos contratados).`,
      ].join("\n"),
    },
    {
      title: CONTRACT_SECTION_TITLES[2],
      content: [
        "A ORGANIZAÇÃO entregará ao PATROCINADOR os seguintes ativos, separados por categoria:",
        "",
        ...assetLines,
        "",
        flat
          ? "Os ativos acima integram o pacote de patrocínio contratado por valor geral fechado."
          : "Eventuais ativos adicionais deverão ser formalizados por aditivo contratual.",
      ].join("\n"),
    },

    {
      title: CONTRACT_SECTION_TITLES[3],
      content: [
        `2.1. Constituem-se obrigações da "${spTrade}":`,
        "a) Efetuar pontualmente o pagamento do valor descrito na Cláusula Quarta abaixo;",
        `b) Apresentar à ${orgTrade}, sempre que solicitado, as autorizações de uso de marca e licenças relacionadas à marca "${spTrade}".`,
        `c) Autorizar e disponibilizar à ${orgTrade} documentos e informações sobre as especificações e sobre a aplicação correta e adequada da marca "${spTrade}" nos termos deste Contrato, bem como os dados e informações relacionados ao correto e adequado cumprimento das disposições relativas à divulgação de sua marca, sendo responsável pela correção de tais dados e informações;`,
        `d) Obter prévia e expressa aprovação da ${orgTrade} de todo e qualquer material publicitário destinado à divulgação da marca "${spTrade}" que for exposto no evento respectivo ${propertyLabel}, respeitando os locais onde a divulgação poderá ocorrer, a serem definidos e indicados pela ${orgTrade};`,
        `e) Caso aplicável, obter prévia e expressa aprovação de ${orgTrade} em todo e qualquer material publicitário contendo referência à marca ${orgTrade} (${propertyLabel}), ou das marcas relacionadas à ${propertyLabel};`,
        `f) Respeitar qualquer limitação, restrição e/ou recomendação expedida pela ${orgTrade} relativamente à exposição da marca, nome, logotipo e/ou dístico;`,
        `g) Exceto por empresas pertencentes a seu grupo econômico e sempre com prévia e expressa ciência a aprovação de ${orgTrade}, não poderá a "${spTrade}" ceder, vender, negociar, ou de qualquer outra forma transferir a utilização da cota de patrocínio contratada neste Contrato a quaisquer terceiros;`,
      ].join("\n"),
    },
    {
      title: CONTRACT_SECTION_TITLES[4],
      content: [
        `OBRIGAÇÃO DA ${orgName}:`,
        "",
        `3.1. Sem prejuízo de outras previstas neste Contrato, constituem-se obrigações de ${orgName}:`,
        "",
        `a) Cumprir pontualmente as contrapartidas avençadas neste Contrato, nas formas e condições ora previstas;`,
        "",
        `b) Arcar com o custo de produção e confecção dos materiais físicos de divulgação da marca da “${spTrade}” que serão expostos nos eventos e que se encontram abrangidos por este contrato. Para tanto, os desenhos desses materiais serão enviados à “${spTrade}”, objetivando a obtenção de aprovação prévia, que deverá ocorrer em até 5 (cinco) dias úteis de antecedência da data do evento, a fim de permitir que ${orgName} tenha tempo hábil para produção desses materiais. Não ocorrendo a aprovação prévia da “${spTrade}”, ${orgName} poderá confeccionar os materiais que forem comuns a outros patrocinadores sem mencionar a marca da “${spTrade}”, além de suspender a produção dos materiais que forem exclusivos da “${spTrade}”, sem que tal fato acarrete qualquer direito de desconto ou indenização em favor desta última.`,
      ].join("\n"),
    },
    { title: CONTRACT_SECTION_TITLES[5], content: paymentLines.join("\n") },
    {
      title: CONTRACT_SECTION_TITLES[6],
      content: `7.1 O presente Contrato vigorará durante o tempo em que perdurar a "${propertyLabel}" com início no dia ${date(c.start_date)}, com término previsto para ${date(c.end_date)}, ficando ajustado que, na hipótese da ocorrência de fatos que impliquem em antecipação e/ou adiamento da data do início e/ou do término do evento, o presente contrato terá seu prazo de vigência automaticamente alterado, sem que haja qualquer custo adicional a qualquer das partes e sem que haja qualquer alteração do valor e do cronograma de pagamento a ser realizado pela "${spTrade}" (conforme cláusula 4.1 supra). Após o término do evento, a ${orgName} permanecerá efetuando a divulgação da marca da "${spTrade}", em suas mídias sociais, pelo prazo de 2 (dois) meses contados da data da partida final (encerramento da "${propertyLabel}").`,
    },
    {
      title: CONTRACT_SECTION_TITLES[7],
      content: [
        "O descumprimento de qualquer obrigação prevista neste contrato ensejará notificação escrita à parte infratora, que terá o prazo de 10 (dez) dias corridos para sanar a irregularidade.",
        "Não sanado o descumprimento no prazo, a parte prejudicada poderá exigir o cumprimento específico da obrigação ou rescindir o contrato, sem prejuízo de multa não compensatória de 10% (dez por cento) sobre o valor total do contrato e da indenização por perdas e danos comprovados.",
        "A não entrega de ativos por culpa da ORGANIZAÇÃO poderá ser compensada, mediante acordo entre as partes, por ativos equivalentes ou pelo abatimento proporcional do valor do patrocínio.",
      ].join("\n\n"),
    },
    {
      title: CONTRACT_SECTION_TITLES[8],
      content: [
        "Este contrato poderá ser rescindido:",
        "a) por acordo entre as partes, a qualquer tempo, mediante termo escrito;",
        "b) imotivadamente, por qualquer das partes, mediante aviso prévio de 30 (trinta) dias, respeitados os valores devidos pelos ativos já executados;",
        "c) por descumprimento contratual não sanado, nos termos da Cláusula 8;",
        "d) em caso de falência, recuperação judicial, insolvência ou encerramento das atividades de qualquer das partes;",
        "e) por caso fortuito ou força maior que inviabilize, de forma definitiva, a execução do objeto.",
        "",
        "Em qualquer hipótese de rescisão, serão devidos os valores proporcionais aos ativos efetivamente entregues até a data da rescisão.",
      ].join("\n"),
    },
    {
      title: CONTRACT_SECTION_TITLES[9],
      content: [
        "As partes declaram e garantem que:",
        "a) possuem plena capacidade e poderes para celebrar este contrato, estando seus representantes devidamente autorizados;",
        "b) são titulares ou legítimas licenciadas das marcas, imagens e conteúdos que disponibilizam para execução deste contrato;",
        "c) cumprem a legislação anticorrupção (Lei nº 12.846/2013), trabalhista, ambiental e de proteção de dados (Lei nº 13.709/2018 - LGPD);",
        "d) tratarão os dados pessoais eventualmente compartilhados apenas para as finalidades deste contrato, adotando medidas de segurança adequadas;",
        "e) manterão sigilo sobre informações confidenciais a que tiverem acesso, durante a vigência e por 2 (dois) anos após o término.",
      ].join("\n"),
    },
    {
      title: CONTRACT_SECTION_TITLES[10],
      content: [
        "Este contrato não gera vínculo empregatício, societário ou de exclusividade entre as partes, salvo cláusula específica de exclusividade expressamente pactuada.",
        "A tolerância quanto ao descumprimento de qualquer obrigação não implica novação, renúncia ou alteração do pactuado.",
        "Qualquer alteração deste contrato somente será válida se formalizada por aditivo escrito assinado por ambas as partes.",
        "A cessão ou transferência deste contrato a terceiros depende de anuência prévia e por escrito da outra parte.",
        "As comunicações entre as partes serão feitas por escrito, para os endereços e e-mails indicados na Cláusula 1.",
        "A nulidade de qualquer cláusula não afetará as demais, que permanecerão em pleno vigor.",
      ].join("\n"),
    },
    {
      title: CONTRACT_SECTION_TITLES[11],
      content: `Fica eleito o foro da comarca de ${org?.address_city || DASH}${org?.address_state ? `/${org.address_state}` : ""}, com renúncia a qualquer outro, por mais privilegiado que seja, para dirimir eventuais controvérsias oriundas deste contrato.`,
    },
    {
      title: CONTRACT_SECTION_TITLES[12],
      content: [
        "E por estarem justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.",
        "",
        `Local e data: ${org?.address_city || "____________________"}, ____ de __________________ de ______.`,
        "",
        `______________________________________\n${orgName}\nORGANIZAÇÃO`,
        "",
        `______________________________________\n${sponsorName}\nPATROCINADOR`,
        "",
        "Testemunha 1: ______________________________  CPF: ______________",
        "Testemunha 2: ______________________________  CPF: ______________",
      ].join("\n"),
    },
  ];
}
