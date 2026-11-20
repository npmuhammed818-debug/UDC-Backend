import { requirePrivateServiceUrl } from "../../privacy/serviceUrl.ts";
import { anthropicStrongModel } from "./anthropicClient.ts";
import type { GroqToolChatMessage, GroqToolDefinition, GroqToolCall } from "./groqClient.ts";

type Block = Record<string, unknown>;
export function toAnthropicToolRequest(messages: GroqToolChatMessage[], tools: GroqToolDefinition[], model: string) {
  const system = messages.filter(m=>m.role==="system").map(m=>m.content??"").join("\n\n");
  const converted: Array<{role:"user"|"assistant";content:Block[]}> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    const blocks: Block[] = [];
    if (m.role === "tool") {
      if (!m.tool_call_id) throw new Error("Missing tool result ID");
      blocks.push({type:"tool_result",tool_use_id:m.tool_call_id,content:m.content??""});
    } else {
      if (m.content) blocks.push({type:"text",text:m.content});
      for (const call of m.tool_calls??[]) {
        const input: unknown = JSON.parse(call.function.arguments);
        if (!input || typeof input!=="object" || Array.isArray(input)) throw new Error("Invalid tool arguments");
        blocks.push({type:"tool_use",id:call.id,name:call.function.name,input});
      }
    }
    if (!blocks.length) continue;
    const previous = converted.at(-1);
    if(previous?.role===role) previous.content.push(...blocks);
    else converted.push({role,content:blocks});
  }
  return {model,max_tokens:1000,...(system?{system}:{}),messages:converted,
    ...(tools.length?{tools:tools.map(t=>({name:t.function.name,description:t.function.description,input_schema:t.function.parameters})),tool_choice:{type:"auto"}}:{})};
}

export async function runAnthropicToolChat(messages: GroqToolChatMessage[], tools: GroqToolDefinition[], timeoutMs: number, model=anthropicStrongModel()): Promise<{content:string|null;toolCalls:GroqToolCall[]}> {
  const key=process.env.ANTHROPIC_API_KEY?.trim();
  if(!key)throw new Error("Anthropic not configured");
  const base=requirePrivateServiceUrl(process.env.ANTHROPIC_BASE_URL?.trim()||"https://api.anthropic.com").replace(/\/$/,"");
  const response=await fetch(base+"/v1/messages",{method:"POST",redirect:"error",signal:AbortSignal.timeout(timeoutMs),headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},body:JSON.stringify(toAnthropicToolRequest(messages,tools,model))});
  if(!response.ok)throw new Error(`Anthropic returned HTTP ${response.status}`);
  const data=await response.json() as {content?:Block[]};
  if(!Array.isArray(data.content))throw new Error("Invalid Anthropic response");
  const content=data.content.filter(b=>b.type==="text"&&typeof b.text==="string").map(b=>b.text).join("").trim()||null;
  const toolCalls:GroqToolCall[]=data.content.filter(b=>b.type==="tool_use").map(b=>{
    if(typeof b.id!=="string"||typeof b.name!=="string"||!b.input||typeof b.input!=="object"||Array.isArray(b.input))throw new Error("Invalid Anthropic tool call");
    return {id:b.id,name:b.name,argumentsJson:JSON.stringify(b.input)};
  });
  if(!content&&!toolCalls.length)throw new Error("Empty Anthropic response");
  return {content,toolCalls};
}
