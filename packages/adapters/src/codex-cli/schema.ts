import { CodexCliDefaultCommand, CodexCliPromptMode } from "./constants";
import type { ProviderSettingsSchema } from "../../../domain/src/providers/settings";
import { JsonSchemaType } from "../../../domain/src/providers/schema";

export const codexCliSettingsSchema: ProviderSettingsSchema = {
  type: JsonSchemaType.Object,
  additionalProperties: false,
  properties: {
    command: {
      type: JsonSchemaType.String,
      default: CodexCliDefaultCommand
    },
    args: {
      type: JsonSchemaType.Array,
      items: {
        type: JsonSchemaType.String
      },
      default: []
    },
    cwd: {
      type: JsonSchemaType.String
    },
    env: {
      type: JsonSchemaType.Object,
      additionalProperties: {
        type: JsonSchemaType.String
      }
    },
    promptMode: {
      type: JsonSchemaType.String,
      enum: [CodexCliPromptMode.Stdin, CodexCliPromptMode.Arg],
      default: CodexCliPromptMode.Stdin
    },
    promptArg: {
      type: JsonSchemaType.String
    },
    modelArg: {
      type: JsonSchemaType.String
    },
    systemArg: {
      type: JsonSchemaType.String
    },
    temperatureArg: {
      type: JsonSchemaType.String
    },
    maxTokensArg: {
      type: JsonSchemaType.String
    },
    jsonSchemaArg: {
      type: JsonSchemaType.String
    },
    models: {
      type: JsonSchemaType.Array,
      items: {
        type: JsonSchemaType.Object,
        additionalProperties: false,
        properties: {
          id: {
            type: JsonSchemaType.String
          },
          displayName: {
            type: JsonSchemaType.String
          },
          maxContextTokens: {
            type: JsonSchemaType.Integer
          }
        },
        required: ["id", "displayName"]
      }
    }
  }
};