import { Button } from "../components/Button.js";
import { EmptyStatePanel } from "../components/EmptyStatePanel.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";
import {
  createSkillAssetRecord,
  createSkillAssetsClient,
  updateSkillAssetRecord,
  type SkillAssetSummary,
} from "../shared/skill-assets-client.js";
import {
  SkillAssetsUrlMode,
  applySkillAssetsUrlPatch,
  readSkillAssetsUrlState,
  type SkillAssetsUrlState,
} from "./skill-assets-url-state.js";

const Selector = {
  Root: "skill-assets-root",
  Create: "skill-assets-create",
  RowPrefix: "skill-assets-row-",
  Editor: "skill-assets-editor",
  Name: "skill-assets-name",
  Description: "skill-assets-description",
  Permissions: "skill-assets-permissions",
  Save: "skill-assets-save",
  DeletePrefix: "skill-assets-delete-",
} as const;

type SkillAssetsState = {
  skills: ReadonlyArray<SkillAssetSummary>;
  loading: boolean;
  errorMessage: string | null;
  url: SkillAssetsUrlState;
  name: string;
  description: string;
  permissions: string;
};

export class SkillAssetsScreen extends Component<
  ComponentProps,
  SkillAssetsState
> {
  private readonly client = createSkillAssetsClient();

  constructor(props: ComponentProps = {}) {
    const url = readSkillAssetsUrlState(window.location.href);
    super(props, {
      skills: [],
      loading: true,
      errorMessage: null,
      url,
      name: "",
      description: "",
      permissions: "",
    });
  }

  override onMount(): void {
    window.addEventListener("popstate", this.handleBrowserNavigation);
    void this.loadSkills();
  }

  override onUnmount(): void {
    window.removeEventListener("popstate", this.handleBrowserNavigation);
  }

  override render(): HTMLElement {
    return createElement(
      "main",
      {
        className:
          "min-h-full bg-[#11161d] px-4 py-5 text-white sm:px-6 lg:px-8",
        "data-testid": Selector.Root,
      },
      [
        createElement(
          "div",
          { className: "mx-auto flex max-w-6xl flex-col gap-5" },
          [this.renderToolbar(), this.renderContent(), this.renderEditor()],
        ),
      ],
    );
  }

  private renderToolbar(): HTMLElement {
    return createElement(
      "section",
      {
        className:
          "flex flex-col gap-4 border-b border-border-dark pb-5 sm:flex-row sm:items-end sm:justify-between",
      },
      [
        createElement("div", {}, [
          createElement(
            "h1",
            { className: "text-xl font-semibold tracking-tight text-white" },
            ["Skill assets"],
          ),
          createElement(
            "p",
            { className: "mt-1 text-sm text-text-secondary" },
            ["Reusable governed capabilities for AI agents."],
          ),
        ]),
        createElement(Button, {
          variant: "primary",
          size: "sm",
          icon: "add",
          children: "Create skill",
          onClick: () =>
            this.openEditor({ mode: SkillAssetsUrlMode.Create, skillId: null }),
          dataset: { testid: Selector.Create },
        }),
      ],
    );
  }

  private renderContent(): HTMLElement {
    if (this.state.loading)
      return createElement(
        "p",
        {
          className:
            "border border-border-dark bg-[#151b22] px-4 py-8 text-sm text-text-secondary",
        },
        ["Loading skill assets…"],
      );
    if (this.state.errorMessage)
      return createElement(
        "p",
        {
          className:
            "border border-rose-500/40 bg-rose-500/10 px-4 py-4 text-sm text-rose-100",
        },
        [this.state.errorMessage],
      );
    if (this.state.skills.length === 0)
      return createElement(EmptyStatePanel, {
        icon: "extension",
        title: "No skill assets yet",
        description:
          "Create a reusable skill before connecting it to an AI agent.",
      });
    return createElement(
      "section",
      { className: "divide-y divide-border-dark border border-border-dark" },
      this.state.skills.map((skill) => this.renderSkillRow(skill)),
    );
  }

  private renderSkillRow(skill: SkillAssetSummary): HTMLElement {
    return createElement(
      "article",
      {
        className:
          "flex flex-col gap-3 bg-[#11161d] px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
        "data-testid": `${Selector.RowPrefix}${skill.id}`,
      },
      [
        createElement("div", { className: "min-w-0" }, [
          createElement(
            "p",
            { className: "truncate text-sm font-semibold text-white" },
            [skill.name],
          ),
          createElement(
            "p",
            { className: "mt-1 text-sm text-text-secondary" },
            [`v${skill.version} · ${skill.lifecycle} · ${skill.status}`],
          ),
          createElement(
            "p",
            { className: "mt-1 text-xs text-text-secondary" },
            [skill.description],
          ),
        ]),
        createElement("div", { className: "flex gap-2" }, [
          createElement(Button, {
            variant: "secondary",
            size: "sm",
            icon: "edit",
            children: "Open editor",
            onClick: () =>
              this.openEditor({
                mode: SkillAssetsUrlMode.Edit,
                skillId: skill.id,
              }),
          }),
          createElement(Button, {
            variant: "danger",
            size: "sm",
            icon: "delete",
            children: "Delete",
            onClick: () => void this.deleteSkill(skill.id),
            dataset: { testid: `${Selector.DeletePrefix}${skill.id}` },
          }),
        ]),
      ],
    );
  }

  private renderEditor(): HTMLElement | string {
    if (this.state.url.mode === SkillAssetsUrlMode.Catalog) return "";
    return createElement(
      "section",
      {
        className:
          "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4",
        role: "dialog",
        "aria-modal": "true",
        "data-testid": Selector.Editor,
      },
      [
        createElement(
          "div",
          {
            className:
              "w-full max-w-2xl border border-border-dark bg-[#151b22] p-5 shadow-2xl",
          },
          [
            createElement(
              "h2",
              { className: "text-base font-semibold text-white" },
              [
                this.state.url.mode === SkillAssetsUrlMode.Create
                  ? "Create skill asset"
                  : "Edit skill asset",
              ],
            ),
            this.renderInput("Name", this.state.name, Selector.Name, (value) =>
              this.setState({ name: value }),
            ),
            this.renderTextarea(
              "Description",
              this.state.description,
              Selector.Description,
              (value) => this.setState({ description: value }),
            ),
            this.renderInput(
              "Permissions (comma-separated)",
              this.state.permissions,
              Selector.Permissions,
              (value) => this.setState({ permissions: value }),
            ),
            createElement("div", { className: "mt-5 flex justify-end gap-2" }, [
              createElement(Button, {
                variant: "ghost",
                size: "sm",
                children: "Close",
                onClick: () =>
                  this.openEditor({
                    mode: SkillAssetsUrlMode.Catalog,
                    skillId: null,
                  }),
              }),
              createElement(Button, {
                variant: "primary",
                size: "sm",
                children: "Save skill",
                disabled:
                  this.state.name.trim().length === 0 ||
                  this.state.description.trim().length === 0,
                onClick: () => void this.saveSkill(),
                dataset: { testid: Selector.Save },
              }),
            ]),
          ],
        ),
      ],
    );
  }

  private renderInput(
    label: string,
    value: string,
    testid: string,
    onValue: (value: string) => void,
  ): HTMLElement {
    return createElement(
      "label",
      { className: "mt-4 block text-sm text-text-secondary" },
      [
        label,
        createElement("input", {
          value,
          className:
            "mt-1 h-10 w-full border border-border-dark bg-[#0f151c] px-3 text-sm text-white outline-none focus:border-primary",
          "data-testid": testid,
          onInput: (event: Event) => {
            if (event.target instanceof HTMLInputElement)
              onValue(event.target.value);
          },
        }),
      ],
    );
  }

  private renderTextarea(
    label: string,
    value: string,
    testid: string,
    onValue: (value: string) => void,
  ): HTMLElement {
    return createElement(
      "label",
      { className: "mt-4 block text-sm text-text-secondary" },
      [
        label,
        createElement("textarea", {
          value,
          className:
            "mt-1 min-h-28 w-full border border-border-dark bg-[#0f151c] px-3 py-2 text-sm text-white outline-none focus:border-primary",
          "data-testid": testid,
          onInput: (event: Event) => {
            if (event.target instanceof HTMLTextAreaElement)
              onValue(event.target.value);
          },
        }),
      ],
    );
  }

  private async loadSkills(): Promise<void> {
    this.setState({ loading: true, errorMessage: null });
    try {
      this.setState({ skills: await this.client.list(), loading: false });
    } catch (error) {
      this.setState({ loading: false, errorMessage: readErrorMessage(error) });
    }
  }

  private openEditor(url: SkillAssetsUrlState): void {
    window.history.pushState(
      {},
      "",
      applySkillAssetsUrlPatch(window.location.href, url),
    );
    const selected = url.skillId
      ? this.state.skills.find((skill) => skill.id === url.skillId)
      : undefined;
    this.setState({
      url,
      name: selected?.name ?? "",
      description: selected?.description ?? "",
      permissions: selected?.permissions.join(", ") ?? "",
    });
  }

  private readonly handleBrowserNavigation = (): void => {
    const url = readSkillAssetsUrlState(window.location.href);
    const selected = url.skillId
      ? this.state.skills.find((skill) => skill.id === url.skillId)
      : undefined;
    this.setState({
      url,
      name: selected?.name ?? "",
      description: selected?.description ?? "",
      permissions: selected?.permissions.join(", ") ?? "",
    });
  };

  private async saveSkill(): Promise<void> {
    const name = this.state.name.trim();
    const description = this.state.description.trim();
    if (!name || !description) return;
    const permissions = this.state.permissions
      .split(",")
      .map((permission) => permission.trim())
      .filter((permission) => permission.length > 0);
    const selected = this.state.url.skillId
      ? this.state.skills.find((skill) => skill.id === this.state.url.skillId)
      : undefined;
    const now = new Date().toISOString();
    try {
      const asset = await this.client.upsert(
        selected
          ? updateSkillAssetRecord({
              asset: selected,
              name,
              description,
              permissions,
              now,
            })
          : createSkillAssetRecord({
              id: crypto.randomUUID(),
              name,
              description,
              permissions,
              now,
            }),
      );
      this.setState({
        skills: [
          ...this.state.skills.filter((skill) => skill.id !== asset.id),
          asset,
        ],
      });
      this.openEditor({ mode: SkillAssetsUrlMode.Edit, skillId: asset.id });
    } catch (error) {
      this.setState({ errorMessage: readErrorMessage(error) });
    }
  }

  private async deleteSkill(assetId: string): Promise<void> {
    try {
      await this.client.delete(assetId);
      this.setState({
        skills: this.state.skills.filter((skill) => skill.id !== assetId),
      });
    } catch (error) {
      this.setState({ errorMessage: readErrorMessage(error) });
    }
  }
}

const readErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not load skill assets.";
