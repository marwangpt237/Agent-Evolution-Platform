import { EventEmitter } from "node:events";
import type { InsertEvent } from "@workspace/db";

export interface StreamEvent extends InsertEvent {
  id?: number;
  createdAt?: Date;
}

const eventEmitter = new EventEmitter();

export function broadcastEvent(event: StreamEvent): void {
  eventEmitter.emit("event", event);
}

export function subscribeToEvents(
  callback: (event: StreamEvent) => void,
  filter?: (event: StreamEvent) => boolean
): () => void {
  const listener = (event: StreamEvent) => {
    if (!filter || filter(event)) {
      callback(event);
    }
  };

  eventEmitter.on("event", listener);
  return () => {
    eventEmitter.off("event", listener);
  };
}
