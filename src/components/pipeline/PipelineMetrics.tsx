import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Stage = Database["public"]["Enums"]["opportunity_stage"];

type Opp = {
  id: string;
  stage: Stage;
  value: number;
  created_at: string;
  decided_at?: string | null;
};

const STAGE_FUNNEL: Stage[] = ["prospect", "reuniao", "proposta_enviada", "negociacao", "fechado"];
const STAGE_LABEL: Record<Stage, string> = {
  prospect: "Prospect",
  reuniao: "Reunião",
  proposta_enviada: "Proposta",
  negociacao: "Negociação",
  fechado: "Fechado",
  perdido: "Perdido",
};

const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function PipelineMetrics({
  opportunities,
  probabilities,
}: {
  opportunities: Opp[];
  probabilities: Record<Stage, number>;
}) {
  const stats = useMemo(() => {
    const open = opportunities.filter((o) => o.stage !== "fechado" && o.stage !== "perdido");
    const won = opportunities.filter((o) => o.stage === "fechado");
    const lost = opportunities.filter((o) => o.stage === "perdido");
    const total = open.reduce((s, o) => s + Number(o.value || 0), 0);
    const ticket = open.length ? total / open.length : 0;
    const conversion =
      won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : 0;

    // ciclo médio de venda (created_at -> decided_at) em dias para fechados
    const closed = opportunities.filter((o) => o.stage === "fechado");
    const cycles = closed
      .map((o) => {
        const start = new Date(o.created_at).getTime();
        const end = o.decided_at ? new Date(o.decided_at).getTime() : Date.now();
        return Math.max(0, (end - start) / 86400000);
      })
      .filter((d) => d >= 0);
    const avgCycle = cycles.length ? cycles.reduce((s, d) => s + d, 0) / cycles.length : 0;

    // forecast ponderado por etapa
    const forecast = opportunities.reduce((s, o) => {
      const p = probabilities[o.stage] ?? 0;
      return s + (Number(o.value || 0) * p) / 100;
    }, 0);
    const forecastScenarios = open.reduce(
      (acc, o) => {
        const value = Number(o.value || 0);
        const stageProbability = probabilities[o.stage] ?? 0;
        acc.conservative += (value * Math.max(stageProbability - 20, 0)) / 100;
        acc.probable += (value * stageProbability) / 100;
        acc.optimistic += (value * Math.min(stageProbability + 20, 100)) / 100;
        return acc;
      },
      { conservative: 0, probable: 0, optimistic: 0 },
    );

    return { total, ticket, conversion, avgCycle, forecast, forecastScenarios, openCount: open.length, wonCount: won.length };
  }, [opportunities, probabilities]);

  const funnel = useMemo(() => {
    return STAGE_FUNNEL.map((s) => {
      const items = opportunities.filter((o) => o.stage === s);
      return {
        stage: s,
        count: items.length,
        value: items.reduce((sum, o) => sum + Number(o.value || 0), 0),
      };
    });
  }, [opportunities]);

  const [visible, setVisible] = useState(false);

  const maxFunnel = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Análises</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar análises" : "Mostrar análises"}
          title={visible ? "Ocultar análises" : "Mostrar análises"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>

      {visible && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricCard label="No pipeline" value={formatBRL(stats.total)} sub={`${stats.openCount} oportunidades`} />
            <MetricCard label="Forecast ponderado" value={formatBRL(stats.forecast)} sub="por probabilidade" />
            <MetricCard label="Ticket médio" value={formatBRL(stats.ticket)} sub="oportunidades abertas" />
            <MetricCard label="Conversão" value={`${stats.conversion.toFixed(0)}%`} sub={`${stats.wonCount} fechadas`} />
            <MetricCard label="Ciclo médio" value={`${stats.avgCycle.toFixed(0)} dias`} sub="prospect → fechado" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MetricCard label="Conservador" value={formatBRL(stats.forecastScenarios.conservative)} sub="probabilidade -20 p.p." />
            <MetricCard label="Provável" value={formatBRL(stats.forecastScenarios.probable)} sub="forecast ponderado" />
            <MetricCard label="Otimista" value={formatBRL(stats.forecastScenarios.optimistic)} sub="probabilidade +20 p.p." />
          </div>

          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Funil de vendas</h3>
            <div className="space-y-2">
              {funnel.map((f, i) => {
                const widthPct = (f.value / maxFunnel) * 100;
                const prev = i > 0 ? funnel[i - 1] : null;
                const conv = prev && prev.count > 0 ? (f.count / prev.count) * 100 : null;
                return (
                  <div key={f.stage} className="flex items-center gap-3 text-xs">
                    <div className="w-24 shrink-0 text-muted-foreground">{STAGE_LABEL[f.stage]}</div>
                    <div className="flex-1 h-7 bg-muted/40 rounded relative overflow-hidden">
                      <div
                        className="h-full bg-primary/80 rounded transition-all"
                        style={{ width: `${Math.max(widthPct, 2)}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-2">
                        <span className="font-medium">{f.count}</span>
                        <span className="text-muted-foreground">{formatBRL(f.value)}</span>
                      </div>
                    </div>
                    <div className="w-14 shrink-0 text-right text-muted-foreground">
                      {conv !== null ? `${conv.toFixed(0)}%` : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
