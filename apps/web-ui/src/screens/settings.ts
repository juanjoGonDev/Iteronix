import { emptyLabel } from "../shared/constants.js";
import {
  clearChildren,
  createElement,
  isHTMLButtonElement,
  isHTMLElement,
  isHTMLSelectElement,
  selectElement,
  selectElements
} from "../shared/dom.js";

type ProviderDescriptor = {
  id: string;
  label: string;
  models: string[];
};

type PrecisionOption = {
  id: string;
  label: string;
};

type SettingsCatalog = {
  projects: string[];
  profiles: string[];
  providers: ProviderDescriptor[];
  precisions: PrecisionOption[];
};

type SettingsState = {
  project: string;
  profile: string;
  provider: string;
  model: string;
  precision: string;
};

const settingsCatalog: SettingsCatalog = {
  projects: ["Iteronix Core", "FlowForge", "Sandbox"],
  profiles: ["Backend", "Frontend", "DevOps", "Product Manager"],
  providers: [
    { id: "codex-cli", label: "Codex CLI", models: ["gpt-5-codex", "gpt-4.1-codex"] },
    { id: "local-mock", label: "Local Mock", models: ["mock-small", "mock-large"] }
  ],
  precisions: [
    { id: "fast", label: "Fast" },
    { id: "balanced", label: "Balanced" },
    { id: "precise", label: "Precise" }
  ]
};

const initialState: SettingsState = {
  project: "Iteronix Core",
  profile: "Backend",
  provider: "codex-cli",
  model: "gpt-5-codex",
  precision: "balanced"
};

export const initSettingsScreen = (root: ParentNode): void => {
  const settingsProject = selectElement(
    root,
    "[data-settings-project]",
    isHTMLSelectElement
  );
  const settingsProvider = selectElement(
    root,
    "[data-settings-provider]",
    isHTMLSelectElement
  );
  const settingsModel = selectElement(
    root,
    "[data-settings-model]",
    isHTMLSelectElement
  );
  const settingsPrecision = selectElement(
    root,
    "[data-settings-precision]",
    isHTMLSelectElement
  );
  const settingsSummary = selectElement(root, "[data-settings-summary]", isHTMLElement);
  const profileButtons = selectElements(root, "[data-profile]", isHTMLButtonElement);
  const state: SettingsState = {
    project: resolveProject(initialState.project),
    profile: resolveProfile(initialState.profile),
    provider: resolveProvider(initialState.provider),
    model: resolveModel(initialState.provider, initialState.model),
    precision: resolvePrecision(initialState.precision)
  };

  const render = (): void => {
    renderProjectOptions(settingsProject, state.project);
    renderProviderOptions(settingsProvider, state.provider);
    renderModelOptions(settingsModel, state.provider, state.model);
    renderPrecisionOptions(settingsPrecision, state.precision);
    updateProfileButtons(profileButtons, state.profile);
    renderSummary(settingsSummary, state);
  };

  if (settingsProject) {
    settingsProject.addEventListener("change", () => {
      state.project = resolveProject(settingsProject.value);
      renderSummary(settingsSummary, state);
    });
  }

  if (settingsProvider) {
    settingsProvider.addEventListener("change", () => {
      state.provider = resolveProvider(settingsProvider.value);
      state.model = resolveModel(state.provider, state.model);
      render();
    });
  }

  if (settingsModel) {
    settingsModel.addEventListener("change", () => {
      state.model = resolveModel(state.provider, settingsModel.value);
      renderSummary(settingsSummary, state);
    });
  }

  if (settingsPrecision) {
    settingsPrecision.addEventListener("change", () => {
      state.precision = resolvePrecision(settingsPrecision.value);
      renderSummary(settingsSummary, state);
    });
  }

  profileButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const profile = button.dataset["profile"];
      if (typeof profile === "string") {
        state.profile = resolveProfile(profile);
        renderSummary(settingsSummary, state);
        updateProfileButtons(profileButtons, state.profile);
      }
    });
  });

  render();
};

const resolveProject = (value: string): string =>
  settingsCatalog.projects.includes(value) ? value : settingsCatalog.projects[0] ?? "";

const resolveProfile = (value: string): string =>
  settingsCatalog.profiles.includes(value) ? value : settingsCatalog.profiles[0] ?? "";

const resolveProvider = (value: string): string => getProvider(value)?.id ?? settingsCatalog.providers[0]?.id ?? "";

const resolveModel = (providerId: string, value: string): string => {
  const provider = getProvider(providerId);
  if (!provider) {
    return "";
  }
  if (provider.models.includes(value)) {
    return value;
  }
  return provider.models[0] ?? "";
};

const resolvePrecision = (value: string): string =>
  settingsCatalog.precisions.some((precision) => precision.id === value)
    ? value
    : settingsCatalog.precisions[0]?.id ?? "";

const renderProjectOptions = (
  select: HTMLSelectElement | null,
  current: string
): void => {
  if (!select) {
    return;
  }
  clearChildren(select);
  settingsCatalog.projects.forEach((project) => {
    const option = createElement("option");
    option.value = project;
    option.textContent = project;
    select.appendChild(option);
  });
  select.value = current;
};

const renderProviderOptions = (
  select: HTMLSelectElement | null,
  current: string
): void => {
  if (!select) {
    return;
  }
  clearChildren(select);
  settingsCatalog.providers.forEach((provider) => {
    const option = createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    select.appendChild(option);
  });
  select.value = current;
};

const renderModelOptions = (
  select: HTMLSelectElement | null,
  providerId: string,
  current: string
): void => {
  if (!select) {
    return;
  }
  clearChildren(select);
  const provider = getProvider(providerId);
  const models = provider ? provider.models : [];
  models.forEach((model) => {
    const option = createElement("option");
    option.value = model;
    option.textContent = model;
    select.appendChild(option);
  });
  select.value = current;
};

const renderPrecisionOptions = (
  select: HTMLSelectElement | null,
  current: string
): void => {
  if (!select) {
    return;
  }
  clearChildren(select);
  settingsCatalog.precisions.forEach((precision) => {
    const option = createElement("option");
    option.value = precision.id;
    option.textContent = precision.label;
    select.appendChild(option);
  });
  select.value = current;
};

const updateProfileButtons = (buttons: HTMLButtonElement[], current: string): void => {
  buttons.forEach((button) => {
    button.dataset["active"] = button.dataset["profile"] === current ? "true" : "false";
  });
};

const renderSummary = (root: HTMLElement | null, state: SettingsState): void => {
  if (!root) {
    return;
  }
  clearChildren(root);
  const summaryLines = [
    { label: "Project", value: state.project || emptyLabel },
    { label: "Profile", value: state.profile || emptyLabel },
    { label: "Provider", value: getProviderLabel(state.provider) },
    { label: "Model", value: state.model || emptyLabel },
    { label: "Precision", value: getPrecisionLabel(state.precision) }
  ];
  summaryLines.forEach((line) => {
    root.appendChild(buildSummaryLine(line.label, line.value));
  });
};

const buildSummaryLine = (label: string, value: string): HTMLElement => {
  const line = createElement("div", "settings-summary-line");
  const name = createElement("span");
  name.textContent = label;
  const data = createElement("strong");
  data.textContent = value;
  line.appendChild(name);
  line.appendChild(data);
  return line;
};

const getProvider = (providerId: string): ProviderDescriptor | null =>
  settingsCatalog.providers.find((provider) => provider.id === providerId) ?? null;

const getProviderLabel = (providerId: string): string => {
  const provider = getProvider(providerId);
  if (!provider) {
    return emptyLabel;
  }
  return provider.label;
};

const getPrecisionLabel = (precisionId: string): string => {
  const precision = settingsCatalog.precisions.find((item) => item.id === precisionId);
  if (!precision) {
    return emptyLabel;
  }
  return precision.label;
};
