import { describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleProvider } from "../../../packages/adapters/src/openai-compatible/provider";

describe("workflow runtime provider adapters", () => {
  it("runs openai-compatible providers with bearer auth and maps usage", async () => {
    let invocationCount = 0;
    const calls: Array<{
      url: string;
      init: RequestInit | undefined;
    }> = [];
    const provider = createOpenAiCompatibleProvider({
      baseUrl: "http://127.0.0.1:3001",
      apiKey: "secret-token",
      fetchImplementation: async (url, init) => {
        invocationCount += 1;
        calls.push({
          url: String(url),
          init,
        });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Local provider reply",
                },
              },
            ],
            usage: {
              prompt_tokens: 11,
              completion_tokens: 7,
              total_tokens: 18,
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      models: [
        {
          id: "gpt-4.1",
          displayName: "gpt-4.1",
        },
      ],
    });

    const result = await provider.run({
      modelId: "gpt-4.1",
      input: "Say hello",
      temperature: 0.2,
    });

    expect(invocationCount).toBe(1);
    expect(calls[0]?.url).toBe("http://127.0.0.1:3001/v1/chat/completions");
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      },
    });
    expect(result).toEqual({
      message: "Local provider reply",
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
      },
    });
  });

  it("fails openai-compatible requests when the provider stops responding", async () => {
    vi.useFakeTimers();
    try {
      const requestTimeoutMs = 25;
      const provider = createOpenAiCompatibleProvider({
        baseUrl: "http://127.0.0.1:3001",
        apiKey: "secret-token",
        requestTimeoutMs,
        fetchImplementation: async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                reject(
                  new DOMException("The operation was aborted.", "AbortError"),
                );
              },
              { once: true },
            );
          }),
      });

      const runPromise = expect(
        provider.run({
          modelId: "gpt-4.1",
          input: "Say hello",
          temperature: 0.2,
        }),
      ).rejects.toThrow(
        "OpenAI-compatible provider request timed out after 25ms.",
      );
      await vi.advanceTimersByTimeAsync(requestTimeoutMs);

      await runPromise;
    } finally {
      vi.useRealTimers();
    }
  });
});
