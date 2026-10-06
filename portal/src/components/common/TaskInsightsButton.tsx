import { useState } from "react";
import { Sparkle } from "lucide-react";
import { TaskInsightsDialog, type TaskInsightsSource } from "@/components/common/TaskInsightsDialog";

export const TaskInsightsButton = ({
  taskId,
  source = "crm_task",
  className = "",
}: {
  taskId: string;
  source?: TaskInsightsSource;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Ver insights da IA para concluir esta tarefa"
        className={`inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20 ${className}`}
      >
        <Sparkle className="h-3 w-3" /> IA
      </button>
      <TaskInsightsDialog taskId={open ? taskId : null} source={source} open={open} onOpenChange={setOpen} />
    </>
  );
};
