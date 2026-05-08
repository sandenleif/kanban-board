"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { RefreshCw, X, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UpdateEvent } from "@/app/api/admin/db-update/route";

type Phase = "idle" | "running" | "done" | "error";

const STEP_LABELS = [
  "Verbinde mit Datenbank",
  "Schema einlesen",
  "Änderungen anwenden",
  "Fertig",
];

export function DbUpdatePanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(4);
  const [stepLabel, setStepLabel] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const esRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const start = useCallback(() => {
    if (phase === "running") return;
    setPhase("running");
    setCurrentStep(0);
    setLogs([]);
    setErrorMsg("");
    setShowLogs(true);

    const es = new EventSource("/api/admin/db-update");
    esRef.current = es;

    es.onmessage = (e) => {
      const event: UpdateEvent = JSON.parse(e.data);

      if (event.type === "step") {
        setCurrentStep(event.step);
        setTotalSteps(event.total);
        setStepLabel(event.label);
      } else if (event.type === "log") {
        setLogs((p) => [...p, event.text]);
        setTimeout(scrollToBottom, 30);
      } else if (event.type === "done") {
        setPhase("done");
        setCurrentStep(event.type === "done" ? totalSteps : currentStep);
        es.close();
      } else if (event.type === "error") {
        setPhase("error");
        setErrorMsg(event.message);
        es.close();
      }
    };

    es.onerror = () => {
      setPhase("error");
      setErrorMsg("Verbindung zum Server unterbrochen.");
      es.close();
    };
  }, [phase, totalSteps, currentStep]);

  const reset = () => {
    esRef.current?.close();
    setPhase("idle");
    setCurrentStep(0);
    setLogs([]);
    setErrorMsg("");
    setShowLogs(false);
    setStepLabel("");
  };

  const pct = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.width = phase === "done" ? "100%" : `${pct}%`;
    }
  }, [pct, phase]);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2">
          <RefreshCw className={cn("h-4 w-4 text-primary", phase === "running" && "animate-spin")} />
          <span className="text-sm font-semibold">Schema-Update</span>
          <span className="text-xs text-muted-foreground">
            prisma db push — behält Daten, ergänzt neue Felder
          </span>
        </div>

        <div className="flex items-center gap-2">
          {phase !== "idle" && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowLogs((p) => !p)}>
              Log {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
          {(phase === "done" || phase === "error") && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reset} title="Zurücksetzen">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={start}
            disabled={phase === "running"}
            variant={phase === "error" ? "destructive" : "default"}
          >
            {phase === "running" ? "Läuft …" : phase === "done" ? "Erneut ausführen" : "Update starten"}
          </Button>
        </div>
      </div>

      {/* Progress bar — always visible when not idle */}
      {phase !== "idle" && (
        <div className="px-4 py-3 space-y-2 bg-background">
          {/* Step indicators */}
          <div className="flex items-center justify-between mb-1">
            {STEP_LABELS.map((label, i) => {
              const stepNum = i + 1;
              const active = currentStep === stepNum;
              const done = currentStep > stepNum || phase === "done";
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors",
                    done ? "bg-primary text-primary-foreground"
                      : active ? "bg-primary/20 text-primary ring-2 ring-primary/40"
                        : "bg-muted text-muted-foreground"
                  )}>
                    {done ? "✓" : stepNum}
                  </div>
                  <span className={cn(
                    "text-xs hidden sm:block",
                    done ? "text-primary font-medium"
                      : active ? "text-foreground font-medium"
                        : "text-muted-foreground"
                  )}>
                    {label}
                  </span>
                  {i < STEP_LABELS.length - 1 && (
                    <div className={cn(
                      "h-px w-6 mx-1 sm:w-12 transition-colors",
                      done ? "bg-primary" : "bg-border"
                    )} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Bar */}
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              ref={barRef}
              className={cn(
                "h-full rounded-full transition-all duration-500 w-0",
                phase === "error" ? "bg-destructive"
                  : phase === "done" ? "bg-green-500"
                    : "bg-primary"
              )}
            />
          </div>

          {/* Status text */}
          <div className="flex items-center gap-2">
            {phase === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
            {phase === "error" && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
            {phase === "running" && <RefreshCw className="h-3.5 w-3.5 text-primary shrink-0 animate-spin" />}
            <span className={cn(
              "text-xs",
              phase === "error" && "text-destructive",
              phase === "done" && "text-green-500 font-medium",
              phase === "running" && "text-muted-foreground"
            )}>
              {phase === "error" ? errorMsg : phase === "done" ? "Datenbank erfolgreich aktualisiert." : stepLabel || "Starte …"}
            </span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {phase === "done" ? "100" : pct}%
            </span>
          </div>
        </div>
      )}

      {/* Log output */}
      {showLogs && logs.length > 0 && (
        <div className="border-t border-border bg-black/60 max-h-48 overflow-y-auto px-4 py-2">
          {logs.map((line, i) => (
            <p key={i} className={cn(
              "text-xs font-mono leading-5 whitespace-pre-wrap break-all",
              /error|fail/i.test(line) ? "text-red-400"
                : /warn/i.test(line) ? "text-yellow-400"
                  : /✔|success|sync|done/i.test(line) ? "text-green-400"
                    : "text-muted-foreground"
            )}>
              {line}
            </p>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
