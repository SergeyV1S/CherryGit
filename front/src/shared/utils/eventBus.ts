interface Events {
  "open-main-sidebar": string;
}

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers: {
    [K in keyof Events]?: Set<Handler<Events[K]>>;
  } = {};

  $on<K extends keyof Events>(event: K, handler: Handler<Events[K]>) {
    if (!this.handlers[event]) {
      this.handlers[event] = new Set();
    }

    this.handlers[event].add(handler);

    return () => this.handlers[event]?.delete(handler);
  }

  $emit<K extends keyof Events>(event: K, payload: Events[K]) {
    this.handlers[event]?.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`Error in handler for ${String(event)}:`, err);
      }
    });
  }

  $off<K extends keyof Events>(event: K, handler: Handler<Events[K]>) {
    this.handlers[event]?.delete(handler);
  }

  $has<K extends keyof Events>(event: K) {
    return !!this.handlers[event];
  }
}

export const bus = new EventBus();
