const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

const SOURCE_FILES = ["**/*.ts", "**/*.tsx"];

module.exports = [
  {
    files: SOURCE_FILES,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: __dirname,
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      complexity: ["error", { max: 50 }],
      "max-depth": ["error", 6],
      "max-params": ["error", 7],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "interface",
          format: ["PascalCase"],
        },
        {
          selector: "typeAlias",
          format: ["PascalCase"],
        },
        {
          selector: "typeParameter",
          format: ["PascalCase"],
          prefix: ["T"],
          filter: {
            match: false,
            regex: "^[A-Z]$",
          },
        },
        {
          selector: "typeParameter",
          format: ["PascalCase", "UPPER_CASE"],
          filter: {
            match: true,
            regex: "^[A-Z]$",
          },
        },
        {
          selector: "class",
          format: ["PascalCase"],
        },
        {
          selector: "enum",
          format: ["PascalCase"],
        },
        {
          selector: "enumMember",
          format: ["PascalCase"],
        },
        {
          selector: "function",
          format: ["camelCase"],
        },
        {
          selector: "method",
          format: ["camelCase"],
        },
        {
          selector: "variable",
          format: null,
          filter: {
            match: true,
            regex: "^__",
          },
        },
        {
          selector: "variable",
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        {
          selector: "parameter",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
          trailingUnderscore: "allow",
        },
        {
          selector: "property",
          format: ["camelCase", "UPPER_CASE", "snake_case"],
          leadingUnderscore: "allowSingleOrDouble",
          filter: {
            match: false,
            regex: "^[0-9]|^[a-z]+-[a-z]",
          },
        },
        {
          selector: "property",
          format: null,
          filter: {
            match: true,
            regex: "^[0-9]|^[a-z]+-[a-z]",
          },
        },
        {
          selector: "objectLiteralProperty",
          format: ["camelCase", "PascalCase", "UPPER_CASE", "snake_case"],
          filter: {
            match: false,
            regex: "[-./]|^[0-9]",
          },
        },
        {
          selector: "objectLiteralProperty",
          format: null,
          filter: {
            match: true,
            regex: "[-./]|^[0-9]",
          },
        },
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "interface",
          format: ["PascalCase"],
        },
        {
          selector: "typeAlias",
          format: ["PascalCase"],
        },
        {
          selector: "typeParameter",
          format: ["PascalCase"],
          prefix: ["T"],
          filter: {
            match: false,
            regex: "^[A-Z]$",
          },
        },
        {
          selector: "typeParameter",
          format: ["PascalCase", "UPPER_CASE"],
          filter: {
            match: true,
            regex: "^[A-Z]$",
          },
        },
        {
          selector: "class",
          format: ["PascalCase"],
        },
        {
          selector: "function",
          format: ["camelCase"],
        },
        {
          selector: "method",
          format: ["camelCase"],
        },
        {
          selector: "variable",
          format: null,
          filter: {
            match: true,
            regex: "^__",
          },
        },
        {
          selector: "variable",
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        {
          selector: "parameter",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "property",
          format: ["camelCase", "UPPER_CASE", "snake_case"],
          leadingUnderscore: "allowSingleOrDouble",
          filter: {
            match: false,
            regex: "^[0-9]|^[a-z]+-[a-z]",
          },
        },
        {
          selector: "property",
          format: null,
          filter: {
            match: true,
            regex: "^[0-9]|^[a-z]+-[a-z]",
          },
        },
        {
          selector: "objectLiteralProperty",
          format: ["camelCase", "PascalCase", "UPPER_CASE", "snake_case"],
          filter: {
            match: false,
            regex: "[-./]|^[0-9]",
          },
        },
        {
          selector: "objectLiteralProperty",
          format: null,
          filter: {
            match: true,
            regex: "[-./]|^[0-9]",
          },
        },
      ],
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/unbound-method": "off",
      complexity: "off",
      "max-depth": "off",
      "max-params": "off",
    },
  },
  {
    files: ["scripts/**/*.ts", "*.config.*"],
    rules: {
      complexity: "off",
      "max-depth": "off",
      "max-params": "off",
    },
  },
  {
    files: ["apps/server-api/src/server.ts"],
    rules: {
      complexity: "off",
      "max-depth": "off",
      "max-params": "off",
    },
  },
];
