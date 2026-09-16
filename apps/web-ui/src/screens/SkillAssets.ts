import { Button } from "../components/Button.js";
import { EmptyStatePanel } from "../components/EmptyStatePanel.js";
import {
  AssetConfirmDialog,
  AssetEditorDialog,
  AssetRow,
  AssetRowList,
} from "../components/AssetWorkbench.js";
import {
  PageFrame,
  PageIntro,
  PageNoticeStack,
} from "../components/PageScaffold.js";
import {
  SettingsTextField,
  SettingsTextareaField,
} from "../components/SettingsFields.js";
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
  List: "skill-assets-list",
  Editor: "skill-assets-editor",
  Name: "skill-assets-name",
  Description: "skill-assets-description",
  Permissions: "skill-assets-permissions",
  Save: "skill-assets-save",
  Error: "skill-assets-error",
  Retry: "skill-assets-retry",
  DeletePrefix: "skill-assets-delete-",
  DeleteDialog: "skill-assets-delete-dialog",
  DeleteConfirm: "skill-assets-delete-confirm",
  DeleteCancel: "skill-assets-delete-cancel",
  RowPrefix: "skill-assets-row-",
} as const;

type SkillAssetsState = {
  skills: ReadonlyArray<SkillAssetSummary>;
  loading: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  url: SkillAssetsUrlState;
  name: string;
  description: string;
  permissions: string;
  pendingDeleteId: string | null;
  busy: boolean;
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
      noticeMessage: null,
      url,
      name: "",
      description: "",
      permissions: "",
      pendingDeleteId: null,
      busy: false,
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
      { className: "min-h-full text-white", "data-testid": Selector.Root },
      [
        createElement(
          PageFrame,
          { className: "max-w-[1380px] gap-7 pb-28 md:pb-10" },
          [
            createElement(PageNoticeStack, {
              errorMessage: this.state.errorMessage,
              noticeMessage: this.state.noticeMessage,
            }),
            this.renderIntro(),
            this.renderContent(),
            this.renderEditor(),
            this.renderDeleteConfirmation(),
          ],
        ),
      ],
    );
  }

  private renderIntro(): HTMLElement {
    return createElement(PageIntro, {
      title: "Skill assets",
      description: `Reusable governed capabilities for AI agents. ${this.state.skills.length} registered.`,
      actions: createElement(Button, {
        variant: "primary",
        size: "sm",
        icon: "add",
        children: "Create skill",
        onClick: () =>
          this.openEditor({ mode: SkillAssetsUrlMode.Create, skillId: null }),
        dataset: { testid: Selector.Create },
      }),
    });
  }

  private renderContent(): HTMLElement {
    if (this.state.loading)
      return createElement(
        "section",
        {
          className:
            "rounded-2xl border border-[#202832] bg-[#171c22] px-6 py-10 text-sm text-text-secondary",
          "aria-busy": "true",
        },
        ["Loading skill assets…"],
      );
    if (this.state.errorMessage)
      return createElement(
        "section",
        {
          className:
            "flex flex-col items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-6 py-6 sm:flex-row sm:items-center sm:justify-between",
          role: "alert",
          "data-testid": Selector.Error,
        },
        [
          createElement("div", { className: "flex min-w-0 flex-col gap-1" }, [
            createElement(
              "p",
              { className: "text-sm font-semibold text-rose-100" },
              ["Could not load skill assets"],
            ),
            createElement("p", { className: "text-sm text-rose-100/80" }, [
              this.state.errorMessage,
            ]),
          ]),
          createElement(Button, {
            variant: "secondary",
            size: "sm",
            icon: "refresh",
            children: "Retry",
            onClick: () => void this.loadSkills(),
            dataset: { testid: Selector.Retry },
          }),
        ],
      );
    if (this.state.skills.length === 0)
      return createElement(EmptyStatePanel, {
        icon: "extension",
        title: "No skill assets yet",
        description:
          "Create a reusable skill before connecting it to an AI agent.",
        action: createElement(Button, {
          variant: "primary",
          size: "sm",
          icon: "add",
          children: "Create skill",
          onClick: () =>
            this.openEditor({ mode: SkillAssetsUrlMode.Create, skillId: null }),
        }),
      });
    return createElement(AssetRowList, {
      testId: Selector.List,
      rows: this.state.skills.map((skill) => this.renderSkillRow(skill)),
    });
  }

  private renderSkillRow(skill: SkillAssetSummary): HTMLElement {
    return createElement(AssetRow, {
      testId: `${Selector.RowPrefix}${skill.id}`,
      icon: "extension",
      title: skill.name,
      subtitle: skill.id,
      status: skill.status === "enabled" ? "enabled" : "disabled",
      meta: [
        skill.description,
        `v${skill.version} · lifecycle ${skill.lifecycle}`,
      ],
      chips:
        skill.permissions.length > 0
          ? skill.permissions.map((permission) => `perm:${permission}`)
          : ["no permissions declared"],
      actions: [
        {
          label: "Open editor",
          icon: "edit",
          variant: "secondary",
          onClick: () =>
            this.openEditor({
              mode: SkillAssetsUrlMode.Edit,
              skillId: skill.id,
            }),
        },
        {
          label: "Delete",
          icon: "delete",
          variant: "danger",
          testId: `${Selector.DeletePrefix}${skill.id}`,
          onClick: () => this.setState({ pendingDeleteId: skill.id }),
        },
      ],
    });
  }

  private renderEditor(): HTMLElement | string {
    if (this.state.url.mode === SkillAssetsUrlMode.Catalog) return "";
    const isCreate = this.state.url.mode === SkillAssetsUrlMode.Create;
    const saveDisabled =
      this.state.busy ||
      this.state.name.trim().length === 0 ||
      this.state.description.trim().length === 0;
    return createElement(AssetEditorDialog, {
      testId: Selector.Editor,
      title: isCreate ? "Create skill asset" : "Edit skill asset",
      description:
        "Skills are versioned permissioned assets; agents and workflow nodes bind to a version and inherit these grants.",
      onClose: () =>
        this.openEditor({ mode: SkillAssetsUrlMode.Catalog, skillId: null }),
      save: {
        label: isCreate ? "Save skill" : "Save changes",
        testId: Selector.Save,
        disabled: saveDisabled,
        disabledReason:
          "Name and description are required before a skill can be saved.",
        onClick: () => void this.saveSkill(),
      },
      children: createElement("div", { className: "grid gap-4" }, [
        createElement(SettingsTextField, {
          label: "Name",
          value: this.state.name,
          placeholder: "Reference resolver",
          testId: Selector.Name,
          onChange: (value: string) => this.setState({ name: value }),
        }),
        createElement(SettingsTextareaField, {
          label: "Description",
          value: this.state.description,
          placeholder:
            "What this skill does, inputs it expects, and guarantees it provides.",
          testId: Selector.Description,
          hint: "Agents surface this text when deciding which skill to bind.",
          onChange: (value: string) => this.setState({ description: value }),
        }),
        createElement(SettingsTextField, {
          label: "Permissions (comma-separated)",
          value: this.state.permissions,
          placeholder: "tool.invoke, memory.read",
          testId: Selector.Permissions,
          hint: "Least-privilege grants enforced by the governed runtime.",
          onChange: (value: string) => this.setState({ permissions: value }),
        }),
      ]),
    });
  }

  private renderDeleteConfirmation(): HTMLElement | string {
    const pendingId = this.state.pendingDeleteId;
    if (!pendingId) return "";
    const skill = this.state.skills.find(
      (candidate) => candidate.id === pendingId,
    );
    return createElement(AssetConfirmDialog, {
      testId: Selector.DeleteDialog,
      title: "Delete skill asset",
      message: `This removes "${skill?.name ?? pendingId}" and its version history from the workspace. Agents and workflow nodes bound to it will fail fast until replaced.`,
      confirmLabel: this.state.busy ? "Deleting…" : "Delete skill",
      confirmTestId: Selector.DeleteConfirm,
      confirmDisabled: this.state.busy,
      onConfirm: () => void this.deleteSkill(pendingId),
      cancelLabel: "Cancel",
      cancelTestId: Selector.DeleteCancel,
      onCancel: () => this.setState({ pendingDeleteId: null }),
    });
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
    this.setState({ busy: true });
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
        busy: false,
        noticeMessage: `Skill "${asset.name}" saved.`,
      });
      this.openEditor({ mode: SkillAssetsUrlMode.Edit, skillId: asset.id });
    } catch (error) {
      this.setState({ busy: false, errorMessage: readErrorMessage(error) });
    }
  }

  private async deleteSkill(assetId: string): Promise<void> {
    this.setState({ busy: true });
    try {
      await this.client.delete(assetId);
      this.setState({
        skills: this.state.skills.filter((skill) => skill.id !== assetId),
        pendingDeleteId: null,
        busy: false,
        noticeMessage: `Skill "${assetId}" deleted.`,
      });
      if (this.state.url.skillId === assetId) {
        this.openEditor({ mode: SkillAssetsUrlMode.Catalog, skillId: null });
      }
    } catch (error) {
      this.setState({
        busy: false,
        pendingDeleteId: null,
        errorMessage: readErrorMessage(error),
      });
    }
  }
}

const readErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not load skill assets.";
