import { describe, expect, it } from "vitest";

const hasBrapiToken = Boolean(process.env.BRAPI_API_KEY);

describe("credencial brapi", () => {
  it.skipIf(!hasBrapiToken)("aceita a chave configurada em uma consulta leve", async () => {
    const token = process.env.BRAPI_API_KEY;
    expect(token).toBeTruthy();
    const response = await fetch(`https://brapi.dev/api/quote/MXRF11?token=${encodeURIComponent(token as string)}`);
    expect(response.ok, `brapi respondeu HTTP ${response.status}`).toBe(true);
    const body = await response.json() as { results?: unknown[] };
    expect(Array.isArray(body.results)).toBe(true);
  }, 20000);
});
