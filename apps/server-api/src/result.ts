export const ResultType = {
  Ok: "ok",
  Err: "err"
} as const;

export type ResultType = typeof ResultType[keyof typeof ResultType];

export type Ok<T> = {
  type: typeof ResultType.Ok;
  value: T;
};

export type Err<E> = {
  type: typeof ResultType.Err;
  error: E;
};

export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({
  type: ResultType.Ok,
  value
});

export const err = <E>(error: E): Err<E> => ({
  type: ResultType.Err,
  error
});