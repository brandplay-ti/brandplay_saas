import { Link } from "react-router-dom";
import { Building2, Target, MapPin } from "lucide-react";

export interface ActivityContextProps {
  sponsorId?: string | null;
  sponsorName?: string | null;
  opportunityId?: string | null;
  opportunityLabel?: string | null;
  propertyName?: string | null;
  className?: string;
}

/**
 * Shows the context (sponsor / opportunity / property) linked to a task or activity,
 * with direct navigation links. Used across every place activities are listed.
 */
export const ActivityContextLinks = ({
  sponsorId,
  sponsorName,
  opportunityId,
  opportunityLabel,
  propertyName,
  className,
}: ActivityContextProps) => {
  const hasSponsor = Boolean(sponsorName);
  const hasOpportunity = Boolean(opportunityLabel || opportunityId);
  if (!hasSponsor && !hasOpportunity && !propertyName) return null;

  return (
    <div className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground ${className ?? ""}`}>
      {hasSponsor && (
        <span className="inline-flex items-center gap-1 min-w-0">
          <Building2 className="h-3 w-3 shrink-0" />
          {sponsorId ? (
            <Link to={`/dashboard/patrocinadores/${sponsorId}`} className="text-primary underline underline-offset-2 truncate">
              {sponsorName}
            </Link>
          ) : (
            <span className="truncate">{sponsorName}</span>
          )}
        </span>
      )}
      {hasOpportunity && (
        <span className="inline-flex items-center gap-1 min-w-0">
          <Target className="h-3 w-3 shrink-0" />
          <Link to="/dashboard/pipeline" className="text-primary underline underline-offset-2 truncate">
            {opportunityLabel || "Oportunidade"}
          </Link>
        </span>
      )}
      {propertyName && (
        <span className="inline-flex items-center gap-1 min-w-0">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{propertyName}</span>
        </span>
      )}
    </div>
  );
};
