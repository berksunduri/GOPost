import React, { useState, useRef, useEffect, useCallback } from "react";
import { Code, Check, ChevronDown } from "lucide-react";
import { LANGUAGES } from "@/lib/codegen";
import { t } from "@/i18n";
import { toast } from "sonner";

/**
 * Dropdown button that lets the user copy the current request as code
 * in various languages.
 */
export function CodeGenMenu({ request }) {
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    // Close on Escape
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSelect = useCallback(
    async (lang) => {
      const code = lang.generate(request);
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedKey(lang.key);
      setTimeout(() => setCopiedKey(null), 1500);
      setOpen(false);
      toast.success(t("copiedCode"));
    },
    [request],
  );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-accent text-muted-foreground hover:text-foreground border border-border hover:border-primary/30"
        title={t("copyAsCode")}
      >
        <Code className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("code")}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1.5 w-56 rounded-md border border-border bg-popover shadow-lg z-50 py-1 animate-in fade-in zoom-in-95 origin-top-right"
        >
          <div className="px-2 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
            {t("copyAsCode")}
          </div>
          <div className="h-px bg-border mx-1 my-0.5" />
          {LANGUAGES.map((lang) => (
            <button
              key={lang.key}
              onClick={() => handleSelect(lang)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-accent transition-colors text-left"
            >
              <span>{lang.label}</span>
              {copiedKey === lang.key && (
                <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
