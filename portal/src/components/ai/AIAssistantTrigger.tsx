import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { AIAssistantDrawer } from "./AIAssistantDrawer";

export function AIAssistantTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="lg"
        // No celular sobe para cima da BottomNav (64px + área segura). O resto do
        // ajuste do assistente no celular é a MOB-06.
        className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg h-14 w-14 p-0 bg-gradient-to-br from-primary to-primary/80 hover:scale-105 transition max-md:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-md:right-4"
        aria-label="Abrir BrandAI"
      >
        <Sparkles className="h-6 w-6" />
      </Button>
      <AIAssistantDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
