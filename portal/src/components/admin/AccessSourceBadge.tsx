import { Badge } from "@/components/ui/badge";
import { STATUS_TONE_CLASS } from "@/lib/billing";
import { ACCESS_SOURCE_LABEL, ACCESS_SOURCE_TONE, type AccessSource } from "@/lib/platformAdmin";

/** Selo da situação de acesso de uma organização (assinante, teste, provisória, sem acesso). */
export const AccessSourceBadge = ({ source }: { source: AccessSource }) => (
  <Badge variant="outline" className={STATUS_TONE_CLASS[ACCESS_SOURCE_TONE[source]]}>
    {ACCESS_SOURCE_LABEL[source]}
  </Badge>
);
