"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { applyTheme, isThemeChoice, THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme";
import { cn } from "cn";

const THEME_EVENT = "screening-theme";

const CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

function readChoice(): ThemeChoice {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeChoice(stored) ? stored : "system";
}

function subscribe(onStoreChange: () => void) {
  const onChange = () => {
    applyTheme(readChoice());
    onStoreChange();
  };
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);

  useLayoutEffect(() => {
    applyTheme(readChoice());
  }, [choice]);

  function choose(next: ThemeChoice) {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <div role="group" aria-label="Color theme" className="inline-flex border border-border bg-card">
      {CHOICES.map((item, index) => {
        const pressed = choice === item.id;
        return (
          <Button
            key={item.id}
            type="button"
            variant={pressed ? "default" : "ghost"}
            aria-pressed={pressed}
            data-testid={`theme-${item.id}`}
            className={cn("h-10 rounded-none px-3", index < CHOICES.length - 1 && "border-r border-border")}
            onClick={() => choose(item.id)}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
