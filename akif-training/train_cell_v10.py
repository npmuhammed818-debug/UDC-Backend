# AKIF v10 - single-GPU SFT (T4). v6: OOM probe (mem prints + memory_summary) + non-reentrant checkpointing.
# effective batch 8 (bs1 x accum8), 3 epochs. Data: v8 948 rows + reviewed selfplay v6 lessons.
import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
os.environ.setdefault("HF_DATASETS_TRUST_REMOTE_CODE", "1")

!pip -q install "transformers==4.51.3" "peft==0.15.2" "trl==0.19.1" "bitsandbytes>=0.46.0" "datasets==3.5.0" "accelerate==1.6.0"

import json, glob, time
import torch
from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTConfig, SFTTrainer

BASE = "Qwen/Qwen3-8B"
DATA = sorted(glob.glob("/kaggle/input/**/*sft_dataset_v8.jsonl", recursive=True))[-1]  # v8 948 rows (reviewed lessons already merged in v8)
OUT_DIR = "/kaggle/working/akif-qlora-8b-v10"
MAX_LEN = 800    # v5: v4 preflight measured max=799 - covers ALL rows, zero truncation (v4 OOMed at 1024 on the current image)

rows = [json.loads(l) for l in open(DATA)]
print("TRAIN ROWS:", len(rows), flush=True)

# v4 preflight: schema audit + exact token lengths BEFORE any model/GPU work.
# v3 found mixed schemas in the 948 rows (some rows have no "text" key - they
# would crash dataset_text_field="text" too), so normalize first.
_tok = AutoTokenizer.from_pretrained(BASE)
def row_text(r):
    if isinstance(r.get("text"), str): return r["text"]
    msgs = r.get("messages")
    if isinstance(msgs, list): return _tok.apply_chat_template(msgs, tokenize=False)
    return json.dumps(r, ensure_ascii=False)
_schema_counts = {}
for r in rows:
    k = "text" if isinstance(r.get("text"), str) else ("messages" if isinstance(r.get("messages"), list) else "other")
    _schema_counts[k] = _schema_counts.get(k, 0) + 1
print("SCHEMA COUNTS:", _schema_counts, flush=True)
for r in rows: r["text"] = row_text(r)
_lens = [len(_tok(r["text"])["input_ids"]) for r in rows]
_over = sum(1 for L in _lens if L > MAX_LEN)
print(f"TOKEN LEN max={max(_lens)} p95={sorted(_lens)[int(0.95*len(_lens))]} OVER_{MAX_LEN}={_over}/{len(rows)}", flush=True)
if _over > 0.15 * len(rows):
    print(f"TOO MANY LONG ROWS ({_over}/{len(rows)} > 15%) - ABORTING BEFORE GPU WORK", flush=True)
    raise SystemExit(1)

tok = AutoTokenizer.from_pretrained(BASE)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
def to_text(rec):
    return tok.apply_chat_template(rec["messages"], tokenize=False, add_generation_prompt=False)
ds = Dataset.from_list([{"text": to_text(r)} for r in rows])

bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                         bnb_4bit_compute_dtype=torch.float16, bnb_4bit_use_double_quant=True)
model = AutoModelForCausalLM.from_pretrained(BASE, quantization_config=bnb,
                                             device_map={"": 0},
                                             torch_dtype=torch.float16, attn_implementation="sdpa")  # v5: sdpa = memory-efficient attention, no full seq x seq matrix (eager was OOM factor)
model.config.use_cache = False
for _n, _p in model.named_parameters():
    if _p.dtype == torch.bfloat16:
        _p.data = _p.data.to(torch.float16)
for _n, _b in model.named_buffers():
    if _b.dtype == torch.bfloat16:
        _b.data = _b.data.to(torch.float16)
model = prepare_model_for_kbit_training(model)
print(f"MEM after 4bit load: {torch.cuda.memory_allocated()/1e9:.2f} GiB", flush=True)
_dtypes = {}
for _n,_p in model.named_parameters(): _dtypes[str(_p.dtype)] = _dtypes.get(str(_p.dtype),0)+_p.numel()
print("PARAM DTYPE COUNTS:", _dtypes, flush=True)
model = get_peft_model(model, LoraConfig(  # v6: probe prints above; checkpointing non-reentrant below
    r=32, lora_alpha=32, lora_dropout=0.0, bias="none", task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
))
for _n, _p in model.named_parameters():
    if _p.requires_grad and _p.dtype != torch.float32:
        _p.data = _p.data.to(torch.float32)

cfg = SFTConfig(
    output_dir=OUT_DIR,
    per_device_train_batch_size=1,
    gradient_accumulation_steps=8,   # single GPU, effective batch 8 - identical to v9
    learning_rate=2e-4,
    lr_scheduler_type="cosine",
    warmup_ratio=0.05,
    num_train_epochs=3,              # v10: 3 epochs per assignment
    logging_steps=5,
    save_strategy="no",              # adapter saved once at the end
    fp16=True,
    gradient_checkpointing=True,
    gradient_checkpointing_kwargs={"use_reentrant": False},  # v6: PEFT-recommended; reentrant can hold extra refs
    max_length=MAX_LEN,
    packing=False,
    dataset_text_field="text",
    report_to=[],
    seed=42,
)
trainer = SFTTrainer(model=model, args=cfg, train_dataset=ds, processing_class=tok)
for _n, _p in trainer.model.named_parameters():
    if _p.requires_grad and _p.dtype != torch.float32:
        _p.data = _p.data.to(torch.float32)
print(f"MEM before train: {torch.cuda.memory_allocated()/1e9:.2f} GiB", flush=True)
t0 = time.time()
try:
    trainer.train()
except torch.cuda.OutOfMemoryError:
    print("OOM CAUGHT - memory summary follows", flush=True)
    print(torch.cuda.memory_summary(), flush=True)
    raise
dt = time.time() - t0
losses = [h["loss"] for h in trainer.state.log_history if "loss" in h]
trainer.model.save_pretrained(OUT_DIR)
tok.save_pretrained(OUT_DIR)
print(f"V10 TRAIN DONE steps={trainer.state.global_step} wall_min={dt/60:.1f}", flush=True)
print("V10 LOSSES", losses, flush=True)
print(f"V10 max_mem_GB={torch.cuda.max_memory_allocated()/1e9:.1f}", flush=True)
print("V10 adapter at", OUT_DIR, flush=True)
