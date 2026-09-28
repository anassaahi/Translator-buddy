import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from IndicTransToolkit.processor import IndicProcessor

# --------------------------------------------------
# Configuration
# --------------------------------------------------

MODEL_PATH = "./indictrans2-en-indic"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

SRC_LANG = "eng_Latn"
TGT_LANG = "urd_Arab"

print("=" * 60)
print("IndicTrans2 English → Urdu")
print("=" * 60)

print(f"Device: {DEVICE}")

if DEVICE == "cuda":
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"CUDA: {torch.version.cuda}")

# --------------------------------------------------
# Load tokenizer
# --------------------------------------------------

print("\nLoading tokenizer...")

tokenizer = AutoTokenizer.from_pretrained(
    MODEL_PATH,
    trust_remote_code=True
)

print("Tokenizer loaded.")

# --------------------------------------------------
# Load model
# --------------------------------------------------

print("\nLoading model...")

model = AutoModelForSeq2SeqLM.from_pretrained(
    MODEL_PATH,
    trust_remote_code=True,
    torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
).to(DEVICE)

model.eval()

print("Model loaded.")

# --------------------------------------------------
# IndicTrans processor
# --------------------------------------------------

ip = IndicProcessor(inference=True)

# --------------------------------------------------
# Test sentences
# --------------------------------------------------

input_sentences = [
    "Artificial intelligence is changing the way we learn and work.",
    "The robot can navigate its environment without human intervention.",
    "Machine translation allows people to communicate across different languages.",
    "I am a computer science student at UET Lahore.",
]

print("\nTranslating...\n")

# Preprocess
batch = ip.preprocess_batch(
    input_sentences,
    src_lang=SRC_LANG,
    tgt_lang=TGT_LANG,
)

# Tokenize
inputs = tokenizer(
    batch,
    truncation=True,
    padding="longest",
    return_tensors="pt",
    return_attention_mask=True,
).to(DEVICE)

# Generate
with torch.no_grad():
    generated_tokens = model.generate(
        **inputs,
        use_cache=True,
        min_length=0,
        max_length=256,
        num_beams=5,
        num_return_sequences=1,
    )

# Decode
generated_tokens = tokenizer.batch_decode(
    generated_tokens,
    skip_special_tokens=True,
    clean_up_tokenization_spaces=True,
)

# Postprocess
translations = ip.postprocess_batch(
    generated_tokens,
    lang=TGT_LANG,
)

# --------------------------------------------------
# Results
# --------------------------------------------------

print("=" * 60)
print("RESULTS")
print("=" * 60)

for source, translation in zip(input_sentences, translations):
    print(f"\nEN: {source}")
    print(f"UR: {translation}")

print("\n" + "=" * 60)
print("Translation complete.")
print("=" * 60)
