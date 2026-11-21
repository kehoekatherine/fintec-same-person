"use client";

import { Button } from "@/components/ui/button";
import type { QueueId } from "@/lib/types";

const QUEUES: { id: QueueId; label: string }[] = [{ id: "dev", label: "Local dataset" }];

export function QueueSwitch({
  queue,
  showUpload,
  onQueue,
}: {
  queue: QueueId;
  showUpload: boolean;
  onQueue: (queue: QueueId) => void;
}) {
  if (!showUpload) return null;
  const items = [...QUEUES, { id: "upload" as const, label: "Uploaded file" }];
  return (
    <div role="group" aria-label="Queue" className="flex flex-wrap gap-2">
      {items.map((item) => {
        const pressed = queue === item.id;
        return (
          <Button
            key={item.id}
            type="button"
            variant={pressed ? "default" : "outline"}
            aria-pressed={pressed}
            data-testid={`queue-${item.id}`}
            className="h-10 px-3"
            onClick={() => onQueue(item.id)}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
