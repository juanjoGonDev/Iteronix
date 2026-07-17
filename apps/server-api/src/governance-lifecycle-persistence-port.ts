import type { GovernanceLifecycle } from "../../../packages/domain/src/governance-lifecycle";

export type GovernanceLifecyclePersistencePort = {
  read: () => { governanceLifecycles: ReadonlyArray<GovernanceLifecycle> };
  mutateGovernanceLifecycles: (
    updater: (
      governanceLifecycles: ReadonlyArray<GovernanceLifecycle>,
    ) => ReadonlyArray<GovernanceLifecycle>,
  ) => Promise<unknown>;
};
