export type StoreSubscriber<T> = (value: T) => void;

export type Store<T> = {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: StoreSubscriber<T>) => () => void;
};

export const createStore = <T>(initialValue: T): Store<T> => {
  let value = initialValue;
  const listeners = new Set<StoreSubscriber<T>>();

  const get = (): T => value;

  const set = (nextValue: T): void => {
    value = nextValue;
    listeners.forEach((listener) => {
      listener(value);
    });
  };

  const subscribe = (listener: StoreSubscriber<T>): (() => void) => {
    listeners.add(listener);
    listener(value);
    return () => {
      listeners.delete(listener);
    };
  };

  return { get, set, subscribe };
};
