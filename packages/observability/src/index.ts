import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import type { EvidenceReport } from "../../ai-core/src/index";

export type EvidenceStore = {
  write: (report: EvidenceReport) => Promise<string>;
};

export type ObservabilityRuntime = {
  withSpan: <TResult>(input: {
    name: string;
    attributes?: Readonly<Record<string, string | number | boolean>>;
    run: () => Promise<TResult>;
  }) => Promise<TResult>;
  evidenceStore: EvidenceStore;
  shutdown: () => Promise<void>;
};

export const createObservabilityRuntime = async (input: {
  serviceName: string;
  evidenceDir: string;
  otlpEndpoint?: string;
}): Promise<ObservabilityRuntime> => {
  const sdk = input.otlpEndpoint
    ? new NodeSDK({
        traceExporter: new OTLPTraceExporter({
          url: input.otlpEndpoint
        })
      })
    : undefined;

  if (sdk) {
    await sdk.start();
  }

  const evidenceStore = await createEvidenceStore(input.evidenceDir);
  const tracer = trace.getTracer(input.serviceName);

  const withSpan = async <TResult>(request: {
    name: string;
    attributes?: Readonly<Record<string, string | number | boolean>>;
    run: () => Promise<TResult>;
  }): Promise<TResult> =>
    new Promise<TResult>((resolve, reject) => {
      tracer.startActiveSpan(request.name, async (span) => {
        try {
          if (request.attributes) {
            for (const [key, value] of Object.entries(request.attributes)) {
              span.setAttribute(key, value);
            }
          }

          const result = await request.run();
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          resolve(result);
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : "unknown"
          });
          span.end();
          reject(error);
        }
      });
    });

  const shutdown = async (): Promise<void> => {
    if (sdk) {
      await sdk.shutdown();
    }
  };

  return {
    withSpan,
    evidenceStore,
    shutdown
  };
};

export const createEvidenceStore = async (
  evidenceDir: string
): Promise<EvidenceStore> => {
  await mkdir(evidenceDir, { recursive: true });

  const write = async (report: EvidenceReport): Promise<string> => {
    const filePath = join(evidenceDir, `${report.traceId}.json`);
    await writeFile(filePath, JSON.stringify(report, null, 2), "utf8");
    return filePath;
  };

  return {
    write
  };
};

export const readEvidenceReport = async (filePath: string): Promise<EvidenceReport> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as EvidenceReport;
};
