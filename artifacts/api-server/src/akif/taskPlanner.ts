// AKIF task planner (phase 7, owner-approved 29 Oct: code only, no deploy).
// Complex goals become a stored plan with honest step states; simple
// questions are never planned. A gated step (one that does something real:
// submit, contact, accept, pay, ...) cannot complete without the customer's
// explicit yes in the chat. AKIF never marks real actions done without them
// actually happening, and never confuses a recommendation with a completed
// action. Tasks are private per customer and are not learning - the shared
// lesson pipeline is untouched.
import { and, desc, eq, or } from "drizzle-orm";
import { akifTasksTable, db, type AkifTaskStep } from "@workspace/db";
import { runCheapModelChat } from "./intelligence/cheapModel";

export const TASK_STATES = ["pending", "in_progress", "awaiting_approval", "completed", "failed", "cancelled"] as const;

// Conservative: only clear multi-step requests. A false positive would turn
// an ordinary question into a fake project; a miss just means no plan.
export function looksLikeComplexGoal(text: string): boolean {
  const t = text.trim();
  if (t.length < 12 || t.length > 500) return false;
  return /\b(help me (import|export|buy|sell|source|find)|i want to (import|export|buy|sell|source)|find me a (seller|buyer|supplier)|source (a |an )?\w+|set up (a|an|the) (deal|inspection|shipment)|arrange (a|an|the) (deal|inspection|shipment)|handle (my|this|the) (import|export|order|deal))\b/i.test(t);
}

export function isApprovalReply(text: string): boolean {
  return /^(yes|yes please|go ahead|proceed|ok(ay)?[,.! ]*(do it|go ahead|proceed)?|do it|approved?)[.! ]*$/i.test(text.trim());
}

export function isStatusQuestion(text: string): boolean {
  return /\b(status|progress|where are we|what'?s happening|any update|update on)\b/i.test(text.trim());
}

// Steps that do something real in the world need the customer's yes first.
const GATED_STEP = /submit|send|contact|message|accept|sign|pay|book|order|forward|approve|share/i;

type PlannerFn = (goal: string) => Promise<string[]>;

const PLAN_SYSTEM =
  "Break the customer's request into 3 to 7 concrete steps, each a short plain action. Reply with a JSON array of step strings only, no other text. Never include names, prices, or promises.";

const defaultPlanner: PlannerFn = async (goal) => {
  const response = await runCheapModelChat(goal.slice(0, 1000), PLAN_SYSTEM, 25000);
  const text = response.content.trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) throw Error("plan_parse_failed");
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw Error("plan_parse_failed");
  return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 7);
};

export type PlannedTask = {
  id: string;
  goal: string;
  state: string;
  steps: AkifTaskStep[];
};

// Create and store a plan. Returns null when there is nothing sensible to
// plan - AKIF then simply answers normally. Never throws on planner failure.
export async function planTask(options: {
  userId: string;
  goal: string;
  source: string;
  planner?: PlannerFn;
  database?: typeof db;
}): Promise<PlannedTask | null> {
  const database = options.database ?? db;
  const planner = options.planner ?? defaultPlanner;
  let labels: string[];
  try {
    labels = await planner(options.goal);
  } catch {
    return null;
  }
  if (labels.length < 2) return null;
  const steps: AkifTaskStep[] = labels.map((label, index) => ({
    label: label.trim().slice(0, 200),
    state: index === 0 ? "in_progress" : "pending",
    ...(GATED_STEP.test(label) ? { gated: true } : {}),
  }));
  const [task] = await database
    .insert(akifTasksTable)
    .values({ userId: options.userId, goal: options.goal.trim().slice(0, 300), steps, state: "in_progress", source: options.source })
    .returning({ id: akifTasksTable.id });
  if (!task) return null;
  return { id: task.id, goal: options.goal.trim().slice(0, 300), state: "in_progress", steps };
}

export async function readOpenTasks(options: {
  userId: string;
  database?: typeof db;
}): Promise<PlannedTask[]> {
  const database = options.database ?? db;
  const rows = await database
    .select({ id: akifTasksTable.id, goal: akifTasksTable.goal, state: akifTasksTable.state, steps: akifTasksTable.steps })
    .from(akifTasksTable)
    .where(and(
      eq(akifTasksTable.userId, options.userId),
      or(eq(akifTasksTable.state, "pending"), eq(akifTasksTable.state, "in_progress"), eq(akifTasksTable.state, "awaiting_approval")),
    ))
    .orderBy(desc(akifTasksTable.createdAt))
    .limit(5);
  return rows.map((row) => ({ id: row.id, goal: row.goal, state: row.state, steps: Array.isArray(row.steps) ? row.steps : [] }));
}

async function loadTask(taskId: string, database: typeof db) {
  const [row] = await database
    .select({ id: akifTasksTable.id, goal: akifTasksTable.goal, state: akifTasksTable.state, steps: akifTasksTable.steps })
    .from(akifTasksTable)
    .where(eq(akifTasksTable.id, taskId))
    .limit(1);
  return row ? { id: row.id, goal: row.goal, state: row.state, steps: Array.isArray(row.steps) ? row.steps : [] } : null;
}

async function saveTask(task: PlannedTask, database: typeof db) {
  await database
    .update(akifTasksTable)
    .set({ steps: task.steps, state: task.state, updatedAt: new Date() })
    .where(eq(akifTasksTable.id, task.id));
}

// Mark a step done. A gated step without the customer's yes cannot complete:
// it moves to awaiting_approval and the caller is told to ask. Honest states
// only - the caller passes the index of the step it ACTUALLY finished.
export async function completeStep(options: {
  taskId: string;
  stepIndex: number;
  database?: typeof db;
}): Promise<{ ok: boolean; blocked?: "awaiting_approval"; task?: PlannedTask }> {
  const database = options.database ?? db;
  const task = await loadTask(options.taskId, database);
  if (!task) return { ok: false };
  const step = task.steps[options.stepIndex];
  if (!step) return { ok: false };
  if (step.gated && !step.approved) {
    step.state = "awaiting_approval";
    task.state = "awaiting_approval";
    await saveTask(task, database);
    return { ok: false, blocked: "awaiting_approval", task };
  }
  step.state = "completed";
  const next = task.steps.find((s) => s.state === "pending");
  if (next) next.state = "in_progress";
  task.state = task.steps.every((s) => s.state === "completed" || s.state === "skipped") ? "completed" : "in_progress";
  await saveTask(task, database);
  return { ok: true, task };
}

// The customer said yes in the chat: the gated step is approved and becomes
// the active step. Approval flips state only; the real action still happens
// through the existing trade flows, never inside the planner.
export async function approveStep(options: {
  taskId: string;
  database?: typeof db;
}): Promise<{ ok: boolean; step?: AkifTaskStep; task?: PlannedTask }> {
  const database = options.database ?? db;
  const task = await loadTask(options.taskId, database);
  if (!task || task.state !== "awaiting_approval") return { ok: false };
  const step = task.steps.find((s) => s.state === "awaiting_approval");
  if (!step) return { ok: false };
  step.approved = true;
  step.state = "in_progress";
  task.state = "in_progress";
  await saveTask(task, database);
  return { ok: true, step, task };
}

export async function cancelTask(options: {
  taskId: string;
  database?: typeof db;
}): Promise<boolean> {
  const database = options.database ?? db;
  const task = await loadTask(options.taskId, database);
  if (!task) return false;
  task.state = "cancelled";
  for (const step of task.steps) if (step.state === "pending" || step.state === "in_progress" || step.state === "awaiting_approval") step.state = "skipped";
  await saveTask(task, database);
  return true;
}

// The customer-facing plan. Plain numbered steps, the first marked as
// starting now, gated steps marked as needing their yes. No model words.
export function formatPlanForCustomer(goal: string, steps: AkifTaskStep[]): string {
  const lines = steps.map((step, index) => {
    const mark = step.state === "in_progress" ? " (starting now)" : step.gated ? " (I will ask you before this)" : "";
    return `${index + 1}. ${step.label}${mark}`;
  });
  return `Here is how I will handle it:\n${lines.join("\n")}\nI will keep you updated as each step finishes.`;
}

// Open tasks as quoted data for the model: status answers come only from
// this, and a step is done only when its state says completed.
export function formatTasksForPrompt(tasks: PlannedTask[]): string {
  if (tasks.length === 0) return "";
  const lines = tasks.flatMap((task) => [
    `Goal: "${task.goal.replaceAll('"', "'").slice(0, 200)}" - ${task.state}`,
    ...task.steps.map((step, index) => `  ${index + 1}. ${step.label} [${step.state}]`),
  ]);
  return ["This customer's private task list with honest states:", ...lines].join("\n");
}
