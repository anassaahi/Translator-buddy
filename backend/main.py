from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import google.generativeai as genai
import json
import os
import uuid
from datetime import datetime

# Replace the string below with your actual Gemini API key
GEMINI_API_KEY = "AQ.Ab8RN6LR2o6T-b87KGggMgDtKaXbtzyCoNVIDcr0ShOhat6QOw"

# Configure the SDK with your hardcoded key
genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI(title="Foundation Model Translator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    role: str

class Message(BaseModel):
    role: str
    content: str

class TranslationRequest(BaseModel):
    text: str
    direction: str = "en-ur"
    context: str = ""
    history: List[Message] = []
    user_id: str = "anonymous"

class TranslationResponse(BaseModel):
    original: str
    translation: str
    tokens: int = 0

class FeedbackRequest(BaseModel):
    original_word: str
    flagged_translation: str
    corrected_translation: str
    full_original: str = ""
    full_translation: str = ""
    direction: str = "en-ur"
    user_id: str = "anonymous"

class FeedbackEntry(BaseModel):
    id: str
    original_word: str
    flagged_translation: str
    corrected_translation: str
    full_original: str
    full_translation: str
    direction: str
    timestamp: str
    user_id: str

class HistoryEntry(BaseModel):
    id: str
    user_id: str
    original: str
    translation: str
    direction: str
    timestamp: str
    tokens: int = 0

# ---------------------------------------------------------
# Local JSON Storage
# ---------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FEEDBACK_FILE = os.path.join(BASE_DIR, "feedback_store.json")
USERS_FILE = os.path.join(BASE_DIR, "users_store.json")
HISTORY_FILE = os.path.join(BASE_DIR, "history_store.json")

def load_json(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return default

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_feedback() -> List[dict]:
    return load_json(FEEDBACK_FILE, [])

def save_feedback(entries: List[dict]):
    save_json(FEEDBACK_FILE, entries)

def load_users() -> List[dict]:
    users = load_json(USERS_FILE, [])
    # Ensure admin exists
    if not any(u.get("role") == "admin" for u in users):
        users.append({
            "id": "admin-123",
            "username": "admin",
            "password": "adminpassword",
            "role": "admin"
        })
        save_json(USERS_FILE, users)
    return users

def save_users(entries: List[dict]):
    save_json(USERS_FILE, entries)

def load_history() -> List[dict]:
    return load_json(HISTORY_FILE, [])

def save_history(entries: List[dict]):
    save_json(HISTORY_FILE, entries)

def build_correction_memory(direction: str, user_id: str) -> str:
    """Build a correction-memory block from stored feedback for the given direction and user."""
    entries = load_feedback()
    relevant = [e for e in entries if e.get("direction") == direction and e.get("user_id") == user_id]
    if not relevant:
        return ""
    lines = []
    for e in relevant:
        lines.append(f'  • "{e["flagged_translation"]}" → "{e["corrected_translation"]}" (source: "{e["original_word"]}")')
    return (
        "\n[CORRECTION MEMORY — The user has previously corrected these translations. "
        "Apply these corrections whenever you encounter similar words/phrases:]\n"
        + "\n".join(lines)
        + "\n"
    )

# ---------------------------------------------------------
# Foundation Model System Prompts
# ---------------------------------------------------------
EN_UR_SYSTEM_INSTRUCTION = """You are a master literary translator. Your ONLY job is to translate English text into beautiful, natural, flowing Urdu.

STRICT RULES:
1. Output ONLY the Urdu translation. No explanations, no notes, no quotes.
2. Translate meaning and tone, not word-for-word. Keep the flow idiomatic.
3. PRESERVE ACRONYMS: Keep acronyms and technical jargon (e.g., AI, UET, API) in English letters. Do NOT transliterate them.
4. Strictly adopt the requested Style/Context if provided.

Examples:
User: To go wrong in one's own way is better than to go right in someone else's.
Model: اپنے راستے پر بھٹک جانا کسی دوسرے کے راستے پر درست چلنے سے بہتر ہے۔

User: Style/Context: Raw and direct\n\nText: Some people never go crazy. What truly horrible lives they must live.
Model: کچھ لوگ کبھی پاگل نہیں ہوتے۔ یقیناً ان کی زندگیاں کتنی خوفناک ہوں گی۔
"""

UR_EN_SYSTEM_INSTRUCTION = """You are a master literary translator. Your ONLY job is to translate Urdu text into deep, articulate, flowing English prose.

STRICT RULES:
1. Output ONLY the English translation. No explanations, no notes, no quotes.
2. Translate meaning and feeling. Replace Urdu idioms with natural English equivalents; avoid awkward literal phrasing.
3. Strictly adopt the requested Style/Context if provided.

Examples:
User: میں تو یہی کہوں گا کہ دنیا غارت ہو جائے، مگر میری چائے ہمیشہ مجھے ملنی چاہیے۔
Model: I say let the world go to hell, but I should always have my tea.

User: Style/Context: Casual dialogue\n\nText: "تم کہاں تھے؟" اس نے بازو باندھتے ہوئے پوچھا۔ "تم نے کہا تھا کہ فون کرو گے۔"
Model: "Where have you been?" she asked, arms crossed. "You said you'd call."
"""

# ---------------------------------------------------------
# Auth Endpoints
# ---------------------------------------------------------
@app.post("/auth/register", response_model=UserResponse)
def register(req: UserCreate):
    users = load_users()
    if any(u["username"] == req.username for u in users):
        raise HTTPException(status_code=400, detail="Username already exists")
    
    new_user = {
        "id": str(uuid.uuid4()),
        "username": req.username,
        "password": req.password, # For real app, hash this!
        "role": "user"
    }
    users.append(new_user)
    save_users(users)
    return new_user

@app.post("/auth/login", response_model=UserResponse)
def login(req: UserLogin):
    users = load_users()
    user = next((u for u in users if u["username"] == req.username and u["password"] == req.password), None)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return user

@app.get("/users")
def get_all_users():
    return load_users()

# ---------------------------------------------------------
# History Endpoints
# ---------------------------------------------------------
@app.get("/history/{user_id}", response_model=List[HistoryEntry])
def get_history(user_id: str):
    history = load_history()
    # If admin requests their own history, let them see all, or we could handle it via a different endpoint.
    # But for simplicity, we let the frontend filter or we just return all if admin wants it.
    # We will pass 'all' from admin frontend to get all history.
    if user_id == "all":
        return history
    return [h for h in history if h.get("user_id") == user_id]

@app.post("/history", response_model=HistoryEntry)
def add_history(req: HistoryEntry):
    history = load_history()
    entry = req.dict()
    history.append(entry)
    save_history(history)
    return entry

# ---------------------------------------------------------
# Feedback CRUD endpoints
# ---------------------------------------------------------
@app.post("/feedback", response_model=FeedbackEntry)
def create_feedback(req: FeedbackRequest):
    entry = {
        "id": str(uuid.uuid4()),
        "original_word": req.original_word,
        "flagged_translation": req.flagged_translation,
        "corrected_translation": req.corrected_translation,
        "full_original": req.full_original,
        "full_translation": req.full_translation,
        "direction": req.direction,
        "timestamp": datetime.now().isoformat(),
        "user_id": req.user_id,
    }
    entries = load_feedback()
    entries.append(entry)
    save_feedback(entries)
    print(f"🏷️  Feedback saved: '{req.flagged_translation}' → '{req.corrected_translation}'")
    return entry

@app.get("/feedback", response_model=List[FeedbackEntry])
def get_all_feedback(user_id: Optional[str] = None):
    entries = load_feedback()
    if user_id and user_id != "all":
        return [e for e in entries if e.get("user_id") == user_id]
    return entries

@app.delete("/feedback/{feedback_id}")
def delete_feedback(feedback_id: str):
    entries = load_feedback()
    filtered = [e for e in entries if e["id"] != feedback_id]
    if len(filtered) == len(entries):
        raise HTTPException(status_code=404, detail="Feedback not found")
    save_feedback(filtered)
    print(f"🗑️  Feedback deleted: {feedback_id}")
    return {"detail": "deleted"}

# ---------------------------------------------------------
# Translation endpoint
# ---------------------------------------------------------
@app.post("/translate", response_model=TranslationResponse)
def translate_text(req: TranslationRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    base_instruction = EN_UR_SYSTEM_INSTRUCTION if req.direction == "en-ur" else UR_EN_SYSTEM_INSTRUCTION
    correction_block = build_correction_memory(req.direction, req.user_id)
    system_instruction = base_instruction + correction_block

    models_to_try = [
        "gemini-3.5-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-3.1-flash-lite"
    ]


    parts = []
    if req.context.strip():
        ctx = req.context.strip()
        if ctx.startswith("Page:") or ctx.startswith("Around:"):
            parts.append(f"[Context for disambiguation — do NOT translate this, just use it to understand the domain]\n{ctx}\n")
        else:
            parts.append(f"Style/Context: {ctx}\n")
    
    parts.append(f"Text: {req.text}" if req.context.strip() else req.text)
    user_prompt = "\n".join(parts)

    gemini_history = []
    for msg in req.history[-6:]:
        role = "model" if msg.role == "assistant" else "user"
        gemini_history.append({"role": role, "parts": [msg.content]})

    for i, model_name in enumerate(models_to_try):
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_instruction,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.2,
                )
            )

            if gemini_history:
                chat = model.start_chat(history=gemini_history)
                response = chat.send_message(user_prompt)
            else:
                response = model.generate_content(user_prompt)
            
            translation = response.text.strip()
            
            tokens = 0
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                tokens = response.usage_metadata.total_token_count

            print(f"✅ Success: Translated using {model_name}")
            return {"original": req.text, "translation": translation, "tokens": tokens}
            
        except Exception as e:
            print(f"⚠️ Warning: Model {model_name} failed. Error: {str(e)}")
            if i == len(models_to_try) - 1:
                print("❌ Error: All fallback models failed.")
                raise HTTPException(status_code=500, detail=f"All models failed. Last error: {str(e)}")

