import { z, type ZodType } from "zod";

export const SerializableSchemaType = {
  Object: "object",
  String: "string",
  Number: "number",
  Boolean: "boolean",
  Array: "array"
} as const;

export type SerializableSchemaType =
  typeof SerializableSchemaType[keyof typeof SerializableSchemaType];

export type SerializableSchema =
  | {
      type: typeof SerializableSchemaType.String;
      minLength?: number | undefined;
    }
  | {
      type: typeof SerializableSchemaType.Number;
      minimum?: number | undefined;
    }
  | {
      type: typeof SerializableSchemaType.Boolean;
    }
  | {
      type: typeof SerializableSchemaType.Array;
      items: SerializableSchema;
      minItems?: number | undefined;
    }
  | {
      type: typeof SerializableSchemaType.Object;
      properties: Record<string, SerializableSchema>;
      required?: ReadonlyArray<string> | undefined;
    };

export const parseSerializableSchema = (value: unknown): SerializableSchema =>
  serializableSchemaSchema.parse(value);

export const compileSerializableSchema = (
  schema: SerializableSchema
): ZodType<unknown> => compileNode(schema);

const compileNode = (schema: SerializableSchema): ZodType<unknown> => {
  if (schema.type === SerializableSchemaType.String) {
    return applyStringRules(z.string(), schema);
  }

  if (schema.type === SerializableSchemaType.Number) {
    return applyNumberRules(z.number(), schema);
  }

  if (schema.type === SerializableSchemaType.Boolean) {
    return z.boolean();
  }

  if (schema.type === SerializableSchemaType.Array) {
    return applyArrayRules(z.array(compileNode(schema.items)), schema);
  }

  return compileObject(schema);
};

const compileObject = (
  schema: Extract<SerializableSchema, { type: "object" }>
): ZodType<unknown> => {
  const shape: Record<string, ZodType<unknown>> = {};

  for (const [key, value] of Object.entries(schema.properties)) {
    const required = schema.required?.includes(key) ?? false;
    shape[key] = required ? compileNode(value) : compileNode(value).optional();
  }

  return z.object(shape);
};

const applyStringRules = (
  base: z.ZodString,
  schema: Extract<SerializableSchema, { type: "string" }>
): ZodType<unknown> => {
  if (schema.minLength !== undefined) {
    return base.min(schema.minLength);
  }

  return base;
};

const applyNumberRules = (
  base: z.ZodNumber,
  schema: Extract<SerializableSchema, { type: "number" }>
): ZodType<unknown> => {
  if (schema.minimum !== undefined) {
    return base.min(schema.minimum);
  }

  return base;
};

const applyArrayRules = (
  base: z.ZodArray<ZodType<unknown>>,
  schema: Extract<SerializableSchema, { type: "array" }>
): ZodType<unknown> => {
  if (schema.minItems !== undefined) {
    return base.min(schema.minItems);
  }

  return base;
};

const serializableSchemaSchema: z.ZodType<SerializableSchema> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal(SerializableSchemaType.String),
      minLength: z.number().int().nonnegative().optional()
    }),
    z.object({
      type: z.literal(SerializableSchemaType.Number),
      minimum: z.number().optional()
    }),
    z.object({
      type: z.literal(SerializableSchemaType.Boolean)
    }),
    z.object({
      type: z.literal(SerializableSchemaType.Array),
      items: serializableSchemaSchema,
      minItems: z.number().int().nonnegative().optional()
    }),
    z.object({
      type: z.literal(SerializableSchemaType.Object),
      properties: z.record(z.string(), serializableSchemaSchema),
      required: z.array(z.string()).optional()
    })
  ])
);
