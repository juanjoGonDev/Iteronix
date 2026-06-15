/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependencies make boundaries harder to reason about. Use dependency inversion or split responsibilities.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-deprecated-core",
      severity: "error",
      comment: "Deprecated Node core modules should not be used.",
      from: {},
      to: {
        dependencyTypes: ["core"],
        path: "^(?:punycode|domain|constants|sys|_linklist|_stream_wrap)$",
      },
    },
    {
      name: "no-duplicate-dep-types",
      severity: "error",
      comment:
        "A package should not be listed in multiple dependency sections.",
      from: {},
      to: {
        moreThanOneDependencyType: true,
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "no-non-package-json",
      severity: "error",
      comment: "Runtime imports must be declared in package.json.",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment:
        "Imports must resolve from the current TypeScript/package configuration.",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
      dependencyTypes: [
        "npm",
        "npm-dev",
        "npm-optional",
        "npm-peer",
        "npm-bundled",
        "npm-no-pkg",
      ],
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      conditionNames: ["import", "require", "node", "default"],
      exportsFields: ["exports"],
    },
  },
};
