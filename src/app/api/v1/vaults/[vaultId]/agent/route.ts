import type { NextRequest } from "next/server";
import { z } from "zod";
import { withVault, apiError } from "@/lib/http";
import { checkQuota, recordUsage, tokenEstimate } from "@/lib/ai/llm";
import { agentOperationSchema, executeAgentPlan, planVaultOperations } from "@/lib/ai/agent";
import { config } from "@/lib/config";

type Ctx = { params: Promise<{ vaultId: string }> };

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("plan"),
    instruction: z.string().trim().min(3).max(4000),
  }),
  z.object({
    mode: z.literal("execute"),
    operations: z.array(agentOperationSchema).min(1).max(30),
    allowDestructive: z.boolean().optional(),
  }),
]);

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { vaultId } = await ctx.params;
    const access = await withVault(request, vaultId, true);
    if ("response" in access) return access.response;

    if (!config.hasLlm) {
      return Response.json({ error: "Falta OPENROUTER_API_KEY." }, { status: 400 });
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Datos no válidos" }, { status: 400 });
    }

    if (parsed.data.mode === "execute") {
      const result = await executeAgentPlan({
        vaultId,
        userId: access.user.id,
        operations: parsed.data.operations,
        allowDestructive: parsed.data.allowDestructive,
      });
      return Response.json(result);
    }

    await checkQuota(access.user.id);
    const plan = await planVaultOperations({
      vaultId,
      instruction: parsed.data.instruction,
    });

    void recordUsage({
      userId: access.user.id,
      vaultId,
      kind: "agent:plan",
      model: plan.model,
      promptTokens: tokenEstimate([
        { role: "user", content: parsed.data.instruction },
      ]) + 800,
      completionTokens: Math.ceil((plan.raw?.length ?? 0) / 4),
    }).catch(() => undefined);

    const safe = { ...plan } as Record<string, unknown>;
    delete safe.raw;
    return Response.json(safe);
  } catch (error) {
    return apiError(error);
  }
}
