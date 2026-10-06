import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  FileText,
  Trophy,
  Users,
  Wallet,
  Zap,
  CheckCircle2,
  Sparkles,
  Brain,
  Eye,
  Shield,
  Building2,
  Bell,
  MapPin,
  TrendingUp,
  Target,
  ScanSearch,
  Globe,
  Quote,
  Plus,
  Minus,
  Clock,
  CreditCard,
  HeadphonesIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

const stats = [
  { value: "R$ 240M+", label: "em patrocínios gerenciados" },
  { value: "2,3x", label: "mais contratos fechados" },
  { value: "94%", label: "de entregas no prazo" },
  { value: "5 min", label: "para começar a usar" },
];

const partners = [
  "Federação Paulista",
  "Liga Nacional",
  "Sports Group",
  "BrandLab",
  "Arena Pro",
  "Sponsor House",
];

const steps = [
  {
    n: "01",
    icon: Building2,
    title: "Configure suas propriedades",
    desc: "Em minutos você está pronto para operar.",
    bullets: [
      "Cadastre eventos, arenas e campeonatos com templates prontos",
      "Defina cotas, ativos patrocináveis e valores por tier",
      "Convide sua equipe com papéis e permissões por módulo",
      "Publique seu mídia kit em uma página pública profissional",
    ],
  },
  {
    n: "02",
    icon: Target,
    title: "Venda e contrate com IA",
    desc: "Tire a negociação do e-mail e feche mais rápido.",
    bullets: [
      "Pipeline kanban com etapas, probabilidades e lead scoring",
      "Propostas geradas pela IA em minutos, com versionamento e PDF",
      "Contratos com assinatura, anexos privados e resumo automático",
      "Forecast de receita e alerta de risco de churn em tempo real",
    ],
  },
  {
    n: "03",
    icon: BarChart3,
    title: "Entregue e comprove ROI",
    desc: "Operação de campo e relatórios prontos para o patrocinador.",
    bullets: [
      "Checklists de ativação e evidências via app de campo",
      "BrandTrack com visão IA detecta marcas em fotos e vídeos",
      "Portal white-label: o patrocinador acompanha tudo em tempo real",
      "Sell-out e ROI por marca em relatórios automáticos com IA",
    ],
  },
];

const features = [
  { icon: Trophy, title: "Propriedades Esportivas", desc: "Centralize eventos, campeonatos e ativos patrocináveis com checklists por estágio e galeria de mídia." },
  { icon: Target, title: "Pipeline Comercial", desc: "Kanban com etapas customizáveis, probabilidades por usuário e métricas de conversão em tempo real." },
  { icon: FileText, title: "Propostas com IA", desc: "Geração assistida por IA, wizard guiado, versionamento e PDFs prontos para envio em minutos." },
  { icon: Shield, title: "Contratos & Assinaturas", desc: "Gerencie contratos com resumo IA, anexos privados assinados e controle total do ciclo de vida." },
  { icon: Zap, title: "Entregas & Ativações", desc: "Operação de campo com evidências, checklist por evento e SLAs acompanhados em tempo real." },
  { icon: ScanSearch, title: "BrandTrack com Visão IA", desc: "Detecção automática de marcas em imagens de evento para comprovar exposição e share of voice." },
  { icon: Wallet, title: "Financeiro Integrado", desc: "Parcelas, recebíveis e fluxo de caixa por contrato, patrocinador e propriedade." },
  { icon: BarChart3, title: "Relatórios & Sell-out", desc: "Dashboards configuráveis, ROI por marca e relatórios de sell-out gerados com IA." },
  { icon: Brain, title: "Assistente IA", desc: "Lead scoring, previsão de receita, risco de churn e próximos passos sugeridos para cada negociação." },
  { icon: Globe, title: "Portal do Patrocinador", desc: "Área white-label para o patrocinador acompanhar contratos, entregas e relatórios com acesso seguro." },
  { icon: Building2, title: "Multi-organização", desc: "Várias organizações isoladas com troca rápida entre contas." },
  { icon: Users, title: "Equipe & Permissões", desc: "Convites, papéis RBAC, matriz de permissões por módulo e auditoria de alterações." },
  { icon: Bell, title: "Notificações inteligentes", desc: "Alertas de prazos, entregas, contratos e oportunidades direto na plataforma." },
  { icon: MapPin, title: "App de Campo", desc: "Interface mobile para equipes em evento registrarem entregas, checklists e evidências on-site." },
  { icon: TrendingUp, title: "Forecast & Churn IA", desc: "Previsão de receita, heatmap de cotas e detecção antecipada de risco de cancelamento." },
  { icon: Eye, title: "Mídia Kit Público", desc: "Página pública por propriedade para divulgar cotas, audiência e cases para novos patrocinadores." },
];

const testimonials = [
  {
    quote: "Saímos da planilha e dobramos o número de contratos fechados em uma temporada. O pipeline com IA mudou nossa rotina comercial.",
    name: "Marcos Andrade",
    role: "Diretor Comercial",
    company: "Federação de Esportes",
  },
  {
    quote: "O BrandTrack provou para o patrocinador o ROI exato da marca em 3 dias. Renovaram o contrato com aumento de 40%.",
    name: "Carolina Lima",
    role: "Head de Marketing",
    company: "Liga Pro",
  },
  {
    quote: "O portal do patrocinador eliminou as reuniões de status. Eles abrem o app, veem tudo e ficam satisfeitos.",
    name: "Rafael Mendes",
    role: "CEO",
    company: "Agência de Patrocínio",
  },
];

const comparison = [
  { feature: "Pipeline visual com IA", us: true, them: false, label: "Planilha + e-mail" },
  { feature: "Propostas geradas em minutos", us: true, them: false },
  { feature: "Comprovação automática de exposição", us: true, them: false },
  { feature: "Portal white-label para o patrocinador", us: true, them: false },
  { feature: "Forecast e risco de churn", us: true, them: false },
  { feature: "Tudo centralizado em um lugar", us: true, them: false },
];

const faqs = [
  {
    q: "Quanto tempo leva para começar a usar?",
    a: "Em média 5 minutos. Você cria sua conta, importa suas propriedades (ou começa do zero com templates) e já pode cadastrar a primeira negociação. Sem instalação, sem cartão de crédito.",
  },
  {
    q: "Vou conseguir migrar minha planilha?",
    a: "Sim. Suportamos importação via CSV e nosso time ajuda na migração no plano Pro e Enterprise. A maioria dos clientes migra completamente em menos de uma semana.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Pode. Não temos fidelidade. Você cancela direto no painel a qualquer momento e exporta todos os seus dados.",
  },
  {
    q: "Como funciona o BrandTrack com visão IA?",
    a: "Você faz upload das fotos e vídeos do evento. Nossa IA detecta automaticamente onde cada marca aparece, calcula tempo de exposição e gera um relatório de share of voice pronto para enviar ao patrocinador.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Sim. Cada organização tem isolamento de dados com Row Level Security, contratos e anexos privados, autenticação multi-fator e backups diários.",
  },
  {
    q: "Preciso de uma equipe técnica?",
    a: "Não. A plataforma foi feita para times comerciais e de operações. Se precisar de ajuda, oferecemos onboarding guiado e suporte humano em todos os planos.",
  },
];

const Landing = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="container flex h-32 items-center justify-between">
          <Logo sizeClassName="h-28" />
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#how" className="hover:text-foreground transition-colors">Como funciona</a>
            <a href="#features" className="hover:text-foreground transition-colors">Funcionalidades</a>
            <a href="#planos" className="hover:text-foreground transition-colors">Planos</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild className="bg-gradient-brand hover:opacity-90 transition-opacity shadow-glow">
              <Link to="/auth?mode=signup">Teste grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="container py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center animate-fade-in">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-4 py-1.5 text-xs font-semibold text-primary mb-8">
              <Sparkles className="h-3.5 w-3.5" />
              Plataforma #1 de gestão de patrocínio esportivo
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1]">
              Pare de perder patrocinadores na{" "}
              <span className="text-gradient-brand">planilha</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Propriedades esportivas que usam o BrandPlay fecham <strong className="text-foreground">2,3x mais contratos</strong> porque têm pipeline, propostas e entregas no mesmo lugar — não no e-mail.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" asChild className="bg-gradient-brand hover:opacity-90 shadow-glow">
                <Link to="/auth?mode=signup">
                  Criar conta grátis <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#contato">Agendar demonstração</a>
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Sem cartão de crédito</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Setup em 5 minutos</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Cancele quando quiser</span>
            </div>
          </div>

          {/* Mock dashboard */}
          <div className="mt-16 mx-auto max-w-5xl animate-fade-in">
            <div className="rounded-2xl border border-border/60 bg-card shadow-elegant overflow-hidden">
              <div className="flex items-center gap-1.5 border-b border-border/60 bg-surface-soft px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-destructive/60" />
                <span className="h-3 w-3 rounded-full bg-warning/60" />
                <span className="h-3 w-3 rounded-full bg-success/60" />
                <span className="ml-3 text-xs text-muted-foreground">app.brandplay.com/dashboard</span>
              </div>
              <div className="grid md:grid-cols-3 gap-4 p-6 bg-surface-soft">
                {[
                  { label: "Receita YTD", value: "R$ 4,2M", trend: "+18%" },
                  { label: "Pipeline ativo", value: "R$ 1,8M", trend: "+24%" },
                  { label: "Entregas no prazo", value: "94%", trend: "+6pp" },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-xl border border-border bg-card p-5">
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="mt-2 text-2xl font-bold">{kpi.value}</p>
                    <p className="mt-1 text-xs text-success font-medium">{kpi.trend} vs ano anterior</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Social proof bar */}
          <div className="mt-16 text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-6">
              Quem confia no BrandPlay
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-60">
              {partners.map((p) => (
                <span key={p} className="text-sm font-bold text-muted-foreground">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 border-y border-border bg-card">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl md:text-4xl font-bold text-gradient-brand">{s.value}</p>
                <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-24 bg-background">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Comece a vender mais em 3 passos</h2>
            <p className="mt-4 text-muted-foreground text-lg">Do cadastro à comprovação de ROI, em uma jornada simples.</p>
          </div>
          <div className="relative grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Connector line */}
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0" />
            {steps.map((s) => (
              <div key={s.n} className="relative p-8 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-5xl font-bold text-gradient-brand leading-none">{s.n}</span>
                  <div className="h-12 w-12 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                    <s.icon className="h-6 w-6" />
                  </div>
                </div>
                <h3 className="font-semibold text-xl">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                <ul className="mt-6 space-y-2.5">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span className="text-foreground/80">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Button size="lg" asChild className="bg-gradient-brand hover:opacity-90 shadow-glow">
              <Link to="/auth?mode=signup">
                Começar agora — é grátis <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-surface-soft">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">O que dizem nossos clientes</h2>
            <p className="mt-4 text-muted-foreground text-lg">Resultados reais de quem profissionalizou a gestão.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {testimonials.map((t) => (
              <div key={t.name} className="p-8 rounded-2xl border border-border bg-card shadow-sm">
                <Quote className="h-8 w-8 text-primary/30" />
                <p className="mt-4 text-sm leading-relaxed">{t.quote}</p>
                <div className="mt-6 pt-6 border-t border-border">
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role} · {t.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-24 bg-background">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">BrandPlay vs. planilha + e-mail</h2>
            <p className="mt-4 text-muted-foreground text-lg">Veja por que times comerciais migram em uma semana.</p>
          </div>
          <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-3 bg-surface-soft px-6 py-4 text-sm font-semibold border-b border-border">
              <div></div>
              <div className="text-center text-primary">BrandPlay</div>
              <div className="text-center text-muted-foreground">Planilha + e-mail</div>
            </div>
            {comparison.map((c, i) => (
              <div key={i} className="grid grid-cols-3 px-6 py-4 text-sm border-b border-border last:border-0 items-center">
                <div className="font-medium">{c.feature}</div>
                <div className="text-center">
                  <CheckCircle2 className="h-5 w-5 text-success inline" />
                </div>
                <div className="text-center text-muted-foreground">—</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-surface-soft">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Tudo que você precisa, em um lugar só
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Da prospecção ao relatório final do patrocinador.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="group p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="h-11 w-11 rounded-lg bg-primary-soft text-primary flex items-center justify-center mb-4 group-hover:bg-gradient-brand group-hover:text-primary-foreground transition-all">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="planos" className="py-24 bg-background">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Planos para cada estágio</h2>
            <p className="mt-4 text-muted-foreground text-lg">Comece pequeno, escale quando quiser. Sem fidelidade.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { name: "Starter", price: "R$ 490", desc: "Para projetos e pequenas propriedades.", features: ["Até 3 propriedades", "Pipeline comercial", "Propostas básicas", "1 usuário"], highlight: false, cta: "Começar grátis" },
              { name: "Pro", price: "R$ 1.490", desc: "Para agências e federações em crescimento.", features: ["Propriedades ilimitadas", "Contratos & assinaturas", "Gestão de entregas", "Portal do patrocinador", "BrandTrack com IA", "Até 10 usuários"], highlight: true, cta: "Teste 14 dias grátis" },
              { name: "Enterprise", price: "Sob consulta", desc: "Para grandes detentores de direito.", features: ["SLA dedicado", "SSO & RBAC avançado", "Integrações sob medida", "Onboarding com CS", "Usuários ilimitados"], highlight: false, cta: "Falar com vendas" },
            ].map((p) => (
              <div key={p.name} className={`p-8 rounded-2xl border bg-card transition-all ${p.highlight ? "border-primary shadow-glow scale-[1.02]" : "border-border hover:border-primary/30"}`}>
                {p.highlight && (
                  <div className="inline-block mb-3 rounded-full bg-gradient-brand px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Mais popular
                  </div>
                )}
                <h3 className="font-semibold text-xl">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{p.price}</span>
                  {p.price.startsWith("R$") && <span className="text-muted-foreground text-sm">/mês</span>}
                </div>
                <Button asChild className={`w-full mt-6 ${p.highlight ? "bg-gradient-brand hover:opacity-90" : ""}`} variant={p.highlight ? "default" : "outline"}>
                  <Link to={p.name === "Enterprise" ? "#contato" : "/auth?mode=signup"}>{p.cta}</Link>
                </Button>
                <ul className="mt-8 space-y-3">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Trust signals */}
          <div className="mt-16 grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: Clock, label: "Setup em 5 minutos" },
              { icon: CreditCard, label: "Sem cartão de crédito" },
              { icon: HeadphonesIcon, label: "Suporte humano em PT-BR" },
            ].map((t) => (
              <div key={t.label} className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                <t.icon className="h-5 w-5 text-primary" />
                <span className="font-medium">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 bg-surface-soft">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Perguntas frequentes</h2>
            <p className="mt-4 text-muted-foreground text-lg">Tudo que você precisa saber antes de começar.</p>
          </div>
          <div className="max-w-3xl mx-auto space-y-3">
            {faqs.map((f, i) => (
              <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-surface-soft transition-colors"
                >
                  <span className="font-semibold pr-4">{f.q}</span>
                  {openFaq === i ? <Minus className="h-5 w-5 text-primary shrink-0" /> : <Plus className="h-5 w-5 text-muted-foreground shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed">{f.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="contato" className="py-24 bg-background">
        <div className="container">
          <div className="rounded-3xl bg-gradient-brand p-12 md:p-16 text-center shadow-elegant">
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground tracking-tight">
              Pronto para fechar 2x mais patrocínios?
            </h2>
            <p className="mt-4 text-primary-foreground/90 max-w-xl mx-auto">
              Crie sua conta gratuita em 5 minutos. Sem cartão, sem instalação, sem compromisso.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" variant="secondary" asChild>
                <Link to="/auth?mode=signup">
                  Criar conta grátis <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                <a href="mailto:vendas@brandplay.com">Agendar demonstração</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo sizeClassName="h-24" />
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} BrandPlay. Transformando patrocínio em resultado.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
