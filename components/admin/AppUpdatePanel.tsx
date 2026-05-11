"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Download, X, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppUpdateEvent } from "@/app/api/admin/app-update/route";

type Phase = "idle" | "running" | "restarting" | "no_update" | "error";

const STEP_LABELS = ["Watchtower verbinden", "Image laden", "Container neustarten"];

export function AppUpdatePanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(3);
  const [stepLabel, setStepLabel] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [countdown, setCountdown] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<Phase>("idle");

  const pct = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  useEffect(() => {
    if (barRef.current) {
      if (phase === "restarting") {
        barRef.current.style.width = "100%";
      } else {
        barRef.current.style.width = `${pct}%`;
      }
    }
  }, [pct, phase]);

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          window.location.reload();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  const start = useCallback(() => {
    if (phase === "running" || phase === "restarting") return;
    phaseRef.current = "running";
    setPhase("running");
    setCurrentStep(0);
    setLogs([]);
    setStatusMsg("");
    setShowLogs(true);
    setCountdown(0);

    const es = new EventSource("/api/admin/app-update");
    esRef.current = es;

    es.onmessage = (e) => {
      const event: AppUpdateEvent = JSON.parse(e.data);

      if (event.type === "step") {
        setCurrentStep(event.step);
        setTotalSteps(event.total);
        setStepLabel(event.label);
      } else if (event.type === "log") {
        setLogs((p) => [...p, event.text]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
      } else if (event.type === "restart") {
        phaseRef.current = "restarting";
        setPhase("restarting");
        setStatusMsg(event.message);
        es.close();
        startCountdown(25);
      } else if (event.type === "no_update") {
        phaseRef.current = "no_update";
        setPhase("no_update");
        setStatusMsg(event.message);
        es.close();
      } else if (event.type === "error") {
        phaseRef.current = "error";
        setPhase("error");
        setStatusMsg(event.message);
        es.close();
      }
    };

    es.onerror = () => {
      if (phaseRef.current === "running") {
        phaseRef.current = "restarting";
        setPhase("restarting");
        setStatusMsg("Verbindung unterbrochen — Container startet neu …");
        startCountdown(25);
      }
      es.close();
    };
  }, [phase, startCountdown]);

  const reset = () => {
    esRef.current?.close();
    if (timerRef.current) clearInterval(timerRef.current);
    phaseRef.current = "idle";
    setPhase("idle");
    setCurrentStep(0);
    setLogs([]);
    setStatusMsg("");
    setShowLogs(false);
    setStepLabel("");
    setCountdown(0);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2">
          <Download className={cn("h-4 w-4 text-primary", phase === "running" && "animate-bounce")} />
          <span className="text-sm font-semibold">App-Update</span>
          <span className="text-xs text-muted-foreground">
            zieht neues Image von GitHub und startet Container neu
          </span>
        </div>

        <div className="flex items-center gap-2">
          {phase !== "idle" && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowLogs((p) => !p)}>
              Log {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
          {(phase === "error" || phase === "no_update") && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reset}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="sm" className="h-7 text-xs"
            onClick={start}
            disabled={phase === "running" || phase === "restarting"}
            variant={phase === "error" ? "destructive" : "default"}
          >
            {phase === "running" ? "Lädt …"
              : phase === "restarting" ? `Neustart in ${countdown}s …`
                : phase === "no_update" ? "Erneut prüfen"
                  : "Update starten"}
          </Button>
        </div>
      </div>

      {/* Progress */}
      {phase !== "idle" && (
        <div className="px-4 py-3 space-y-2 bg-background">
          {/* Step dots */}
          <div className="flex items-center gap-2 mb-1">
            {STEP_LABELS.map((label, i) => {
              const stepNum = i + 1;
              const done = currentStep > stepNum || phase === "restarting";
              const active = currentStep === stepNum && phase === "running";
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
                    <div className={cn("h-px w-4 sm:w-8 mx-1 transition-colors", done ? "bg-primary" : "bg-border")} />
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
                "h-full rounded-full transition-all duration-700 w-0",
                phase === "error" ? "bg-destructive"
                  : phase === "no_update" ? "bg-yellow-500"
                    : phase === "restarting" ? "bg-green-500"
                      : "bg-primary"
              )}
            />
          </div>

          {/* Status */}
          <div className="flex items-start gap-2">
            {phase === "restarting" && <RefreshCw className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5 animate-spin" />}
            {phase === "error" && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
            {phase === "no_update" && <Info className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />}
            {phase === "running" && <Download className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5 animate-bounce" />}

            <div className="flex-1 min-w-0">
              <p className={cn("text-xs",
                phase === "error" && "text-destructive",
                phase === "restarting" && "text-green-500 font-medium",
                phase === "no_update" && "text-yellow-600 dark:text-yellow-400",
                phase === "running" && "text-muted-foreground",
              )}>
                {phase === "restarting"
                  ? `Container startet neu … Seite lädt in ${countdown}s`
                  : phase === "running" ? (stepLabel || "Starte …")
                    : statusMsg}
              </p>

              {/* Help text for no_update */}
              {phase === "no_update" && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Mögliche Ursachen: GitHub Actions hat noch nicht gebaut · GHCR-Image ist privat (→ GHCR_TOKEN in .env.standalone setzen) · Image ist bereits aktuell
                </p>
              )}
            </div>

            {phase === "restarting" && (
              <Button size="sm" variant="outline" className="h-6 text-xs shrink-0" onClick={() => window.location.reload()}>
                Jetzt laden
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Log */}
      {showLogs && logs.length > 0 && (
        <div className="border-t border-border bg-black/60 max-h-40 overflow-y-auto px-4 py-2">
          {logs.map((line, i) => (
            <p key={i} className={cn(
              "text-xs font-mono leading-5 whitespace-pre-wrap break-all",
              /error|fail|✗/i.test(line) ? "text-red-400"
                : /restart|neu|✓/i.test(line) ? "text-green-400"
                  : /warn|⚠/i.test(line) ? "text-yellow-400"
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
