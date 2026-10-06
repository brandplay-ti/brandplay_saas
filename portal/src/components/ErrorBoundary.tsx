import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { reportPlatformError } from "@/lib/errorReporter";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportPlatformError({
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      source: "react-boundary",
      severity: "fatal",
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-lg w-full">
          <CardContent className="p-6 space-y-4 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Algo deu errado</h1>
              <p className="text-muted-foreground mt-2">
                Registramos um report automático para análise. Recarregue a página ou tente novamente em instantes.
              </p>
            </div>
            {this.state.message && <p className="text-sm text-muted-foreground break-words">{this.state.message}</p>}
            <Button onClick={() => window.location.reload()} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Recarregar
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }
}