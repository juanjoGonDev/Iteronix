export const ResultType = {
  Ok: "ok",
  Err: "err"
} as const;

export type ResultType = typeof ResultType[keyof typeof ResultType];

export type Result<T, E> =
  | { type: typeof ResultType.Ok; value: T }
  | { type: typeof ResultType.Err; error: E };

export const ok = <T>(value: T): Result<T, never> => ({
  type: ResultType.Ok,
  value
});

export const err = <E>(error: E): Result<never, E> => ({
  type: ResultType.Err,
  error
});
