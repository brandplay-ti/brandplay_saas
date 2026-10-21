import { Badge, type BadgeProps } from "@/components/ui/badge";
import { STATUS_TONE_CLASS, type StatusTone } from "@/lib/statusTone";
import { cn } from "@/lib/utils";

interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  tone: StatusTone;
}

/** Badge de estado nas cores da marca (`src/lib/statusTone.ts`). */
export const StatusBadge = ({ tone, className, ...props }: StatusBadgeProps) => (
  <Badge variant="outline" className={cn("font-medium", STATUS_TONE_CLASS[tone], className)} {...props} />
);
