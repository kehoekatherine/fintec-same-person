"use client";

import { Button } from "@/components/ui/button";
import type { DeskView } from "@/lib/desk-view";

const VIEWS: { id: DeskView; label: string }[] = [
  { id: "queue", label: "Queue" },
  { id: "analysis", label: "Case analysis" },
  { id: "cost", label: "Model cost" },
];

export function ViewNav({ view, onView }: { view: DeskView; onView: (view: DeskView) => void }) {
  return (
    <nav aria-label="Primary" data-testid="view-nav" className="flex flex-wrap gap-2">
      {VIEWS.map((item) => {
        const pressed = view === item.id;
        return (
          <Button
            key={item.id}
            type="button"
            variant={pressed ? "default" : "outline"}
            aria-pressed={pressed}
            data-testid={`view-${item.id}`}
            className="h-10 px-3"
            onClick={() => onView(item.id)}
          >
            {item.label}
          </Button>
        );
      })}
    </nav>
  );
}
