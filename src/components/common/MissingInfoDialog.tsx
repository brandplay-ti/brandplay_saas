import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight } from "lucide-react";

export type MissingInfoItem = string | { label: string; onAction?: () => void; actionLabel?: string };

export type MissingInfoState = {
  title?: string;
  description?: string;
  items: MissingInfoItem[];
  actionLabel?: string;
  onAction?: () => void;
};

/** Rola até o campo e aplica um destaque temporário. */
export const focusMissingField = (fieldKey: string) => {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-field="${fieldKey}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-amber-500", "rounded-md");
    const focusable = el.querySelector<HTMLElement>("input, textarea, button, [role='combobox']");
    focusable?.focus();
    setTimeout(() => el.classList.remove("ring-2", "ring-amber-500", "rounded-md"), 2500);
  }, 250);
};

export function MissingInfoDialog({
  state,
  onOpenChange,
}: {
  state: MissingInfoState | null;
  onOpenChange: (open: boolean) => void;
}) {
  const run = (fn?: () => void) => {
    if (!fn) return;
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog open={!!state} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {state?.title ?? "Faltam informações"}
          </DialogTitle>
          <DialogDescription>
            {state?.description ?? "Complete os itens abaixo para seguir para o próximo passo."}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 text-sm">
          {(state?.items ?? []).map((raw) => {
            const item = typeof raw === "string" ? { label: raw } : raw;
            const clickable = !!item.onAction;
            return (
              <li
                key={item.label}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => run(item.onAction) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          run(item.onAction);
                        }
                      }
                    : undefined
                }
                className={`flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 ${clickable ? "cursor-pointer hover:bg-muted" : ""}`}
              >
                <span className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span className="capitalize">{item.label}</span>
                </span>
                {clickable && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
                    {item.actionLabel ?? "Corrigir"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {state?.onAction && (
            <Button
              onClick={() => {
                const action = state.onAction;
                onOpenChange(false);
                action?.();
              }}
            >
              {state.actionLabel ?? "Completar agora"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
