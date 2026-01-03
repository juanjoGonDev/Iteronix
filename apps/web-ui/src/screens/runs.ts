import {
  clearChildren,
  createElement,
  isHTMLButtonElement,
  isHTMLElement,
  selectElement
} from "../shared/dom.js";
import { formatDuration, formatTime } from "../shared/format.js";
import type { Store } from "../shared/store.js";

type RunStatus = "success" | "failed";

type RunHistoryEntry = {
  id: number;
  status: RunStatus;
  finishedAt: string;
  duration: string;
  lines: number;
};

type RunLogEntry = {
  time: string;
  message: string;
};

type RunsState = {
  running: boolean;
  logs: RunLogEntry[];
  history: RunHistoryEntry[];
  currentId: number;
  startedAt: Date | null;
  timerId: number | null;
  logCursor: number;
};

type RunsContext = {
  root: ParentNode;
  baseUrlStore: Store<string>;
};

const runStatusSuccess: RunStatus = "success";
const runStatusFailed: RunStatus = "failed";

const defaultHistory: RunHistoryEntry[] = [
  { id: 18, status: runStatusSuccess, finishedAt: "Today 09:12", duration: "1m 42s", lines: 38 },
  { id: 17, status: runStatusFailed, finishedAt: "Yesterday 18:03", duration: "45s", lines: 12 }
];

const logTemplates = [
  "Queued provider codex-cli",
  "Workspace root validated",
  "Applied command policy checks",
  "Dispatching prompt to provider",
  "Streaming tokens",
  "Quality gates scheduled",
  "Run completed"
];

export const initRunsScreen = (context: RunsContext): void => {
  const runStartButton = selectElement(
    context.root,
    "[data-run-start]",
    isHTMLButtonElement
  );
  const runStopButton = selectElement(
    context.root,
    "[data-run-stop]",
    isHTMLButtonElement
  );
  const runStatus = selectElement(context.root, "[data-run-status]", isHTMLElement);
  const runMeta = selectElement(context.root, "[data-run-meta]", isHTMLElement);
  const runTarget = selectElement(context.root, "[data-run-target]", isHTMLElement);
  const liveLog = selectElement(context.root, "[data-live-log]", isHTMLElement);
  const logCount = selectElement(context.root, "[data-log-count]", isHTMLElement);
  const historyList = selectElement(context.root, "[data-history-list]", isHTMLElement);
  const historyEmpty = selectElement(context.root, "[data-history-empty]", isHTMLElement);
  const historyCount = selectElement(context.root, "[data-history-count]", isHTMLElement);
  const state: RunsState = {
    running: false,
    logs: [],
    history: [...defaultHistory],
    currentId: getMaxHistoryId(defaultHistory),
    startedAt: null,
    timerId: null,
    logCursor: 0
  };

  const renderRunStatus = (): void => {
    if (runStatus) {
      runStatus.textContent = state.running ? "Running" : "Idle";
    }
    if (runMeta) {
      runMeta.textContent = buildRunMeta(state);
    }
    if (runStartButton) {
      runStartButton.disabled = state.running;
    }
    if (runStopButton) {
      runStopButton.disabled = !state.running;
    }
  };

  const renderLogs = (): void => {
    if (!liveLog) {
      return;
    }
    clearChildren(liveLog);
    state.logs.forEach((entry) => {
      liveLog.appendChild(buildLogLine(entry));
    });
    if (logCount) {
      logCount.textContent = `${state.logs.length} lines`;
    }
    liveLog.scrollTop = liveLog.scrollHeight;
  };

  const renderHistory = (): void => {
    if (!historyList || !historyEmpty) {
      return;
    }
    clearChildren(historyList);
    if (state.history.length === 0) {
      historyEmpty.style.display = "block";
    } else {
      historyEmpty.style.display = "none";
      state.history.forEach((entry) => {
        historyList.appendChild(buildHistoryItem(entry));
      });
    }
    if (historyCount) {
      historyCount.textContent = String(state.history.length);
    }
  };

  const appendLog = (message: string): void => {
    state.logs.push({
      time: formatTime(new Date()),
      message
    });
    if (state.logs.length > 120) {
      state.logs.shift();
    }
    renderLogs();
  };

  const stopLogStream = (): void => {
    if (state.timerId === null) {
      return;
    }
    window.clearInterval(state.timerId);
    state.timerId = null;
  };

  const startLogStream = (): void => {
    stopLogStream();
    state.timerId = window.setInterval(() => {
      appendLog(nextLogLine(state));
    }, 1200);
  };

  const handleRunStart = (): void => {
    if (state.running) {
      return;
    }
    state.running = true;
    state.currentId += 1;
    state.startedAt = new Date();
    state.logs = [];
    appendLog(`Run #${state.currentId} started`);
    startLogStream();
    renderRunStatus();
  };

  const handleRunStop = (): void => {
    if (!state.running) {
      return;
    }
    state.running = false;
    stopLogStream();
    appendLog(`Run #${state.currentId} stopped`);
    const finishedAt = new Date();
    const duration =
      state.startedAt instanceof Date ? finishedAt.getTime() - state.startedAt.getTime() : 0;
    state.history = [
      {
        id: state.currentId,
        status: runStatusSuccess,
        finishedAt: formatTime(finishedAt),
        duration: formatDuration(duration),
        lines: state.logs.length
      },
      ...state.history
    ].slice(0, 5);
    renderHistory();
    renderRunStatus();
  };

  if (runStartButton) {
    runStartButton.addEventListener("click", handleRunStart);
  }
  if (runStopButton) {
    runStopButton.addEventListener("click", handleRunStop);
  }

  context.baseUrlStore.subscribe((value) => {
    if (runTarget) {
      runTarget.textContent =
        value === "" ? "Target: not connected" : `Target: ${value}`;
    }
  });

  renderRunStatus();
  renderLogs();
  renderHistory();
};

const buildRunMeta = (state: RunsState): string => {
  if (state.running && state.startedAt instanceof Date) {
    return `Run #${state.currentId} started ${formatTime(state.startedAt)}`;
  }
  const latest = state.history[0];
  if (!latest) {
    return "Last run: never";
  }
  return `Last run #${latest.id} ${latest.status} ${latest.finishedAt}`;
};

const buildLogLine = (entry: RunLogEntry): HTMLElement => {
  const line = createElement("div", "log-line");
  const time = createElement("span", "log-time");
  time.textContent = entry.time;
  const text = createElement("span");
  text.textContent = entry.message;
  line.appendChild(time);
  line.appendChild(text);
  return line;
};

const buildHistoryItem = (entry: RunHistoryEntry): HTMLElement => {
  const item = createElement("div", "history-item");
  const header = createElement("div", "history-header");
  const title = createElement("strong");
  title.textContent = `Run #${entry.id}`;
  const status = createElement("span", "status-pill");
  status.dataset["status"] = entry.status;
  status.textContent = entry.status;
  header.appendChild(title);
  header.appendChild(status);
  const meta = createElement("div", "history-meta");
  const finished = createElement("span");
  finished.textContent = entry.finishedAt;
  const duration = createElement("span");
  duration.textContent = `Duration ${entry.duration}`;
  const lines = createElement("span");
  lines.textContent = `${entry.lines} lines`;
  meta.appendChild(finished);
  meta.appendChild(duration);
  meta.appendChild(lines);
  item.appendChild(header);
  item.appendChild(meta);
  return item;
};

const getMaxHistoryId = (entries: RunHistoryEntry[]): number =>
  entries.reduce((max, entry) => Math.max(max, entry.id), 0);

const nextLogLine = (state: RunsState): string => {
  const fallback = logTemplates[0] ?? "";
  const line = logTemplates[state.logCursor % logTemplates.length] ?? fallback;
  state.logCursor += 1;
  return line;
};
