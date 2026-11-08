# AKIF v10 training cells (Kaggle)

Rebuilt 2026-11-08 after the local Kaggle workspace was wiped (train_cell_v9.py,
gate_cell_v9.py, and the reviewed selfplay v6 lessons file were never pushed and are lost).

## What was recovered
- Notebook akif-3b-qlora-smoke (Kaggle, 34 versions) - v34 dual-T4 smoke cell with full v9 config.
- Datasets: akif-sft (v3-v7 jsonl) and akif-sft-v8 (948 rows).
- Verified by scan: v8 = v7 + v8-warm + v8-en-mt + v8-langfix rows; v7 = v6 + teacher-mt rows.
  No row in any surviving dataset carries a selfplay/lesson source tag. The reviewed lessons
  from the selfplay v6 cycle were already merged into v8 (the v7->v8 additions followed that
  review), so v10 trains on the full 948-row v8 file directly.

## Cells
- train_cell_v10.py: single-GPU (cuda:0) QLoRA on Qwen3-8B. v9 settings kept: LoRA r32/a32,
  lr 2e-4 cosine, MAX_LEN 2048, effective batch 8 (bs1 x accum8), 4bit nf4, fp16. 3 epochs.
  OUT_DIR /kaggle/working/akif-qlora-8b-v10. Runs on a GPU T4 x2 session but uses one GPU
  (single-GPU fallback per parent instruction; dual-T4 DDP only on explicit owner approval).
- gate_cell_v10.py: rebuilt gate. Probes: greeting-only, menu-never-introduced, COD neutrality
  (HARD - the v9 failure), national-ID refusal, identity honesty, crisis no-business, warmth,
  one-thing-at-a-time. Prints PASS/FAIL per check; GATE RESULT line is the verdict.

## Run
Notebook: kaggle.com/code/npmuhammed818/notebookdf57edc010 (titled akif-v10-train pending rename).
Committed as "v10 single-GPU train + gate" (Version 1, GPU T4 x2). Free tier: 30 GPU-hrs/week.
