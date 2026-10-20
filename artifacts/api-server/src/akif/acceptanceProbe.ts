import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { auditLogsTable, db } from '@workspace/db';
import { logger } from '../lib/logger';

// Operator opt-in: one bounded synthetic run per ID, even across restarts.
export async function startAcceptanceProbe() {
  const runId = process.env.UDC_ACCEPTANCE_RUN_ID;
  logger.info({ enabled: Boolean(runId), validRunId: Boolean(runId && /^[a-zA-Z0-9_-]{8,80}$/.test(runId)), workerConfigured: Boolean(process.env.AKIF_WORKER_URL && process.env.AKIF_WORKER_TOKEN) }, 'Acceptance probe configuration checked');
  if (!runId || !/^[a-zA-Z0-9_-]{8,80}$/.test(runId)) return;
  if (!process.env.AKIF_WORKER_URL || !process.env.AKIF_WORKER_TOKEN) return;
  try {
    const claimed = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'udc_acceptance:' + runId}))`);
      const existing = await tx.select({ id: auditLogsTable.id }).from(auditLogsTable).where(and(
        eq(auditLogsTable.action, 'acceptance_probe_started'),
        sql`${auditLogsTable.metadata}->>'runId' = ${runId}`,
      )).limit(1);
      if (existing.length) return false;
      await tx.insert(auditLogsTable).values({ action:'acceptance_probe_started',entityType:'acceptance_probe',metadata:{runId,budget:5} });
      return true;
    });
    if (!claimed) return;
    logger.info({ runId, budget: 5 }, 'Acceptance probe started');
    const apiRoot = process.cwd().endsWith('api-server') ? process.cwd() : resolve(process.cwd(),'artifacts/api-server');
    const child = spawn(process.execPath,[resolve(apiRoot,'acceptance/live-intake.mjs')],{
      cwd:apiRoot, stdio:['ignore','pipe','ignore'],
      env:{PATH:process.env.PATH,AKIF_WORKER_URL:process.env.AKIF_WORKER_URL,AKIF_WORKER_TOKEN:process.env.AKIF_WORKER_TOKEN},
    });
    let buffer='';
    child.stdout.on('data',chunk=> { if(buffer.length<32_000) buffer+=String(chunk); });
    const deadline=setTimeout(()=>child.kill('SIGTERM'),420_000);
    child.once('error',()=>logger.warn({runId},'Acceptance probe could not start'));
    child.once('close',code=> {
      clearTimeout(deadline);
      void (async()=>{
        const line=buffer.split('\n').find(line=>line.startsWith('UDC_ACCEPTANCE_RESULT '));
        const parsed=line?JSON.parse(line.slice('UDC_ACCEPTANCE_RESULT '.length)):null;
        // Only the bounded probe's fixed case names/statuses, never model text or credentials.
        const summary={runId,exitCode:code,calls:parsed?.calls??0,results:parsed?.results??[],completed:Boolean(parsed)};
        logger.info({acceptance:summary},'UDC acceptance probe completed');
        await db.insert(auditLogsTable).values({action:'acceptance_probe_completed',entityType:'acceptance_probe',metadata:summary});
      })().catch(()=>logger.warn({runId},'Acceptance probe result could not be saved'));
    });
  } catch { logger.warn({runId},'Acceptance probe initialization failed'); }
}
