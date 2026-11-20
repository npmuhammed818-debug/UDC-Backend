# AKIF own-brain research notes (2026-10-31)

Internet research on training small open models (Qwen) to be strong, human-like,
multilingual/Malayalam and self-improving. Compiled for the AKIF own-brain loop.
Constraints honored: free resources only, synthetic or consented+de-identified data.

## 1. QLoRA SFT hyperparameters (Unsloth guide + LoRA LR study)

Sources:
- https://unsloth.ai/docs/get-started/fine-tuning-llms-guide/lora-hyperparameters-guide
- https://arxiv.org/html/2609.01244 ("Learning rate matters for LoRA": optimal LoRA LR is flat
  ~1e-3 across 0.6-32B models, ~33x the full-FT optimum; batch size interacts)
- https://github.com/QwenLM/Qwen3/blob/main/docs/source/training/unsloth.md (Qwen3 14B fits a
  free 16GB T4 with Unsloth; 2x faster, 70% less VRAM, 8x longer context)

Practical set for AKIF rounds (Qwen3-8B/14B, T4 x2):
- LR 2e-4 starting point for SFT (consider 5e-4..1e-3 sweep if underfitting; do not go below 1e-4
  for LoRA - too low overfits/stalls per the LR study).
- Rank 16-32 (pick 32 for multilingual/persona complexity), alpha = r or 2r, dropout 0.
- Target ALL linear layers: q,k,v,o,gate,up,down.
- Warmup 5-10% of steps, cosine or linear schedule, weight decay 0.01.
- Multiple short epochs + gate-based selection (our 3-set gate picks the checkpoint, not loss).
- RL/preference tuning uses much smaller LR (~5e-6).

## 2. Malayalam / low-resource language

Sources:
- https://github.com/VishnuPJ/MalayaLLM (+ MalayaLLM-Gemma2-9B): continual LoRA pretraining on
  Malayalam (ai4bharat IndicCorp ml corpus) + vocabulary expansion (~18k Malayalam tokens added
  to LLaMA-2). Key: vocab surgery was needed for LLaMA-2; Qwen3's tokenizer already covers
  Malayalam well, so we skip vocab work and take the continued-pretraining idea only.
- https://aclanthology.org/2024.emnlp-main.334/ ("Translationese" as synthetic pretraining data:
  machine-translated text carries artifacts; native text is better for natural generation).
- https://arxiv.org/html/2405.19744 (multilingual IFT: directly translated instruction data
  underperforms native/natural instruction data for low-resource languages).
- Free native Malayalam text: ai4bharat IndicCorp
  https://storage.googleapis.com/ai4bharat-public-indic-nlp-corpora/indiccorp/ml.tar.xz

Applied:
- Our Malayalam lessons are teacher-GENERATED in Malayalam (not translated from English) -
  matches the native-data finding. Keep it that way.
- Keep a mixed dataset (English + Malayalam) so the brain does not forget English - v6 already
  merges v5 (English-heavy) + new Malayalam lessons.
- If Malayalam fluency still lags after SFT rounds, add a short continued-pretraining pass on
  IndicCorp Malayalam (free corpus, free GPU) before the next SFT round.

## 3. Self-improvement loop

Sources:
- Reflexion (NeurIPS 2023) https://arxiv.org/abs/2303.11366 + code
  https://github.com/noahshinn/reflexion - verbal reinforcement: reflect on failure, store the
  reflection in episodic memory, retry. Our shared-memory learnSharedLesson path is this pattern.
- Self-Instruct/Alpaca lineage (https://aclanthology.org/2023.findings-emnlp.836/): a strong
  teacher bootstraps instruction data; quality filtering matters more than volume.
- Agent Lightning (Microsoft, v1.0 2026)
  https://www.microsoft.com/en-us/research/project/agent-lightning/ - RL on the real agent
  harness. Strong but needs sustained GPU; revisit when a rented GPU exists. Our
  Reflexion + SFT + KTO loop is the free approximation.

Applied (owner-approved loop, 2026-10-31):
- Every gate failure becomes a new lesson in the next round's training data.
- Lessons also flow into shared memory on staging (Reflexion-style, flag-gated).

## 4. Preference tuning from failures (after SFT)

Sources:
- https://arxiv.org/pdf/2509.12936 (alignment methods compared: DPO and KTO best factual
  accuracy; SFT-only lags)
- https://arxiv.org/html/2404.14723v1 (KTO outperforms on most tasks; needs only binary
  good/bad labels, not paired data)
- Unsloth guide: preference/RL tuning LR ~5e-6.

Applied:
- After each gate, build KTO examples from results: (scenario, reply, pass/fail label). KTO fits
  our data because the gate already gives binary judgments without needing paired replies.
- Where a corrected reply exists (regression fixes), build DPO pairs (chosen=fix, rejected=old).
- Sequence per round: SFT on new lessons -> KTO/DPO on fresh gate labels -> re-gate.

## 5. Human-like / emotional behavior

Sources:
- https://aclanthology.org/2025.emnlp-main.1573/ (small 0.5-5B models can learn empathetic
  response style from curated trauma-informed dialogue data - TIDE dataset)
- https://github.com/Zzoay/InsturctEmotion (emotion instruction data: recognition, support
  conversation, persona extraction)

Applied:
- Grief/anger/nervous lesson families stay; add emotion-CONTINUITY multi-turn lessons (feelings
  persist and fade across turns, per owner's brain rules) - single-turn lessons cannot teach this.
- Empathy style: condolence first, then one small practical step; never cold "Okay." (the exact
  v5 failure pattern is now a regression case).

## 6. Strengthening roadmap (free-only)

Round N (current): Malayalam-first SFT round -> 3-set gate (regression / unseen paraphrases /
tricks+anger) with human-style meaning checks.
Round N+1: multi-turn + memory-context lesson families; KTO on this round's gate labels;
trick/adversarial family growth.
Round N+2: self-play simulations (one Qwen plays the customer persona, teacher filters the
transcript, best replies become lessons) to scale scenario coverage cheaply.
Later (paid/GPU-permitting, owner decision): Agent-Lightning-style harness RL; Sonnet teacher
lessons once his Anthropic credit exists.
