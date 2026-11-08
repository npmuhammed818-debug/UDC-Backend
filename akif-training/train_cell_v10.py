# AKIF v10 - single-GPU SFT (T4). v9 settings: LoRA r32/a32, lr 2e-4 cosine, MAX_LEN 2048,
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
MAX_LEN = 2048

rows = [json.loads(l) for l in open(DATA)]
print("TRAIN ROWS:", len(rows), flush=True)
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
                                             torch_dtype=torch.float16, attn_implementation="eager")
model.config.use_cache = False
for _n, _p in model.named_parameters():
    if _p.dtype == torch.bfloat16:
        _p.data = _p.data.to(torch.float16)
for _n, _b in model.named_buffers():
    if _b.dtype == torch.bfloat16:
        _b.data = _b.data.to(torch.float16)
model = prepare_model_for_kbit_training(model)
model = get_peft_model(model, LoraConfig(
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
t0 = time.time()
trainer.train()
dt = time.time() - t0
losses = [h["loss"] for h in trainer.state.log_history if "loss" in h]
trainer.model.save_pretrained(OUT_DIR)
tok.save_pretrained(OUT_DIR)
print(f"V10 TRAIN DONE steps={trainer.state.global_step} wall_min={dt/60:.1f}", flush=True)
print("V10 LOSSES", losses, flush=True)
print(f"V10 max_mem_GB={torch.cuda.max_memory_allocated()/1e9:.1f}", flush=True)
print("V10 adapter at", OUT_DIR, flush=True)
