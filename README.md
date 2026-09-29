# 🌍 Translator Buddy

A powerful, full-stack translation platform that combines **AI-powered translation** (Google Gemini) with **machine learning models** (IndicTrans2) and **real-time telemetry monitoring**. Translate between English and Urdu with contextual awareness, user feedback integration, and advanced administration capabilities.

**Live Demo:** [translatorbuddy.vercel.app](https://translatorbuddy.vercel.app)

---

## ✨ Features

### 🎯 Core Translation
- **Bidirectional Translation**: English ↔ Urdu with contextual understanding
- **AI-Powered**: Google Gemini 3.5/2.5/3.1 Flash models with intelligent fallbacks
- **Contextual Awareness**: Optional style/context input for nuanced translations
- **Multi-turn Chat**: Conversation history support for coherent ongoing dialogue
- **Offline ML Alternative**: IndicTrans2 model integration for offline translation capability
- **Token Counting**: Real-time API token usage tracking

### 👥 User Management
- **Authentication**: Simple user registration and login system
- **User History**: Track translation history per user
- **Admin Dashboard**: Monitor all users and system activity
- **Role-Based Access**: Support for admin and regular user roles

### 📝 Feedback & Learning
- **Inline Correction**: Flag incorrect translations during real-time translation
- **Correction Memory**: System learns from user corrections and applies them to future translations
- **Feedback Analytics**: View all corrections made across the platform
- **Persistent Storage**: All feedback is stored and used for model improvement

### 🔌 Browser Extension
- **Chrome/Edge Compatible**: Install as a browser extension for on-demand translation
- **PDF Support**: Translate selected text from PDFs and web content
- **Right-Click Menu**: Quick translate option via context menu
- **Side Panel Interface**: Lightweight translation panel in the browser sidebar
- **Smart Context Extraction**: Automatically captures page title and surrounding text for disambiguation

### 📊 Monitoring & Analytics
- **Prometheus Metrics**: Comprehensive API instrumentation
- **Grafana Dashboards**: Real-time visualization of system performance
- **Loki Logs**: Centralized log aggregation and analysis
- **Performance Tracking**: Monitor translation latency, error rates, and API usage

---

## 🏗️ Architecture

### Project Structure

```
Translator-buddy/
├── frontend/                    # Next.js web application (TypeScript)
│   ├── app/
│   │   ├── page.tsx            # Main translation interface & admin dashboard
│   │   ├── layout.tsx          # Root layout
│   │   └── globals.css         # Tailwind styling
│   ├── package.json            # Dependencies: Next.js 16, React 19, Recharts
│   ├── next.config.ts          # Next.js configuration
│   ├── tsconfig.json           # TypeScript config
│   └── public/                 # Static assets
│
├── backend/                    # FastAPI Python server
│   ├── main.py                 # Core API endpoints with Gemini integration
│   ├── feedback_store.json     # Persistent feedback storage
│   ├── history_store.json      # User translation history
│   ├── users_store.json        # User credentials & roles
│   └── backend.log             # Server logs
│
├── qwen_extension/             # Chrome/Edge browser extension
│   ├── manifest.json           # Extension configuration (v3)
│   ├── background.js           # Event handling & context menu
│   ├── sidepanel.html          # UI layout
│   └── sidepanel.js            # Extension logic
│
├── telemetry/                  # Monitoring stack (Docker Compose)
│   ├── docker-compose.yml      # Full monitoring stack
│   ├── prometheus.yml          # Prometheus scrape config
│   ├── loki-config.yml         # Log aggregation config
│   └── promtail-config.yml     # Log shipping config
│
├── test_translation.py         # IndicTrans2 model testing
├── check.py                    # Gemini model availability checker
└── README.md                   # This file
```

### How It Fits Together

**Request Flow:**
1. User enters text in the web app or browser extension
2. Frontend sends translation request to FastAPI backend
3. Backend queries Google Gemini API with intelligent prompting
4. System applies user's correction memory (previous feedback) to the system prompt
5. Response is returned with token count and stored in user history
6. Feedback endpoint allows inline corrections to improve future translations

**Data Flow:**
- Translation history, user data, and feedback are persisted in JSON files
- Prometheus instruments the FastAPI server to track metrics
- Promtail ships backend logs to Loki
- Grafana visualizes all metrics and logs in real-time

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 18+** (for frontend)
- **Python 3.10+** (for backend)
- **Docker & Docker Compose** (for monitoring stack) — optional
- **Google Gemini API Key** ([Get one here](https://ai.google.dev/))
- **Chrome/Edge browser** (for extension testing)

### Installation & Setup

#### 1️⃣ Clone the Repository
```bash
git clone https://github.com/anassaahi/Translator-buddy.git
cd Translator-buddy
```

#### 2️⃣ Set Up Backend (FastAPI)
```bash
cd backend

# Create Python virtual environment
python -m venv venv
source venv/bin/activate    # On Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn google-generativeai prometheus-fastapi-instrumentator pydantic

# Set your Gemini API key in main.py (line 12)
# GEMINI_API_KEY = "your-key-here"

# Run the server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend will be available at `http://localhost:8000`
API docs: `http://localhost:8000/docs`

#### 3️⃣ Set Up Frontend (Next.js)
```bash
cd ../frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Frontend will be available at `http://localhost:3000`

#### 4️⃣ [Optional] Set Up Browser Extension
```bash
cd ../qwen_extension

# Load unpacked extension:
# 1. Open Chrome: chrome://extensions/
# 2. Enable "Developer mode" (top right)
# 3. Click "Load unpacked"
# 4. Select the qwen_extension folder

# Test by:
# - Clicking the extension icon to open the side panel
# - Right-clicking selected text → "Translate with buddy"
```

#### 5️⃣ [Optional] Set Up Monitoring Stack
```bash
cd ../telemetry

# Start all monitoring services
docker-compose up -d

# Access dashboards:
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3001 (admin/admin)
# Loki: http://localhost:3100
```

---

## 📚 API Documentation

### Base URL
```
http://localhost:8000
```

### Authentication Endpoints

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "password": "secure_password"
}

Response: 200 OK
{
  "id": "uuid-here",
  "username": "john_doe",
  "role": "user"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "username": "john_doe",
  "password": "secure_password"
}

Response: 200 OK
{
  "id": "uuid-here",
  "username": "john_doe",
  "role": "user"
}
```

### Translation Endpoints

#### Translate Text
```http
POST /translate
Content-Type: application/json

{
  "text": "Hello, how are you?",
  "direction": "en-ur",
  "context": "Casual conversation",
  "user_id": "uuid-here",
  "history": []
}

Response: 200 OK
{
  "original": "Hello, how are you?",
  "translation": "السلام علیکم، آپ کیسے ہو؟",
  "tokens": 156
}
```

**Parameters:**
- `text` (string): Text to translate
- `direction` (string): "en-ur" (English→Urdu) or "ur-en" (Urdu→English). Default: "en-ur"
- `context` (string, optional): Style or domain context (e.g., "formal", "casual", "technical")
- `user_id` (string): User identifier for personalized corrections. Default: "anonymous"
- `history` (array, optional): Previous messages for multi-turn conversation

### History Endpoints

#### Get Translation History
```http
GET /history/{user_id}

Response: 200 OK
[
  {
    "id": "uuid",
    "user_id": "user-uuid",
    "original": "Hello",
    "translation": "السلام علیکم",
    "direction": "en-ur",
    "timestamp": "2026-09-28T15:30:00",
    "tokens": 100
  }
]
```

#### Add to History
```http
POST /history
Content-Type: application/json

{
  "id": "uuid",
  "user_id": "user-uuid",
  "original": "Hello",
  "translation": "السلام علیکم",
  "direction": "en-ur",
  "timestamp": "2026-09-28T15:30:00",
  "tokens": 100
}
```

### Feedback Endpoints

#### Submit Correction
```http
POST /feedback
Content-Type: application/json

{
  "original_word": "trifles",
  "flagged_translation": "معمولی",
  "corrected_translation": "چھوٹی",
  "full_original": "I am frightened by these trifles",
  "full_translation": "میں ان چھوٹی باتوں سے گھبرا رہا ہوں",
  "direction": "en-ur",
  "user_id": "user-uuid"
}

Response: 201 Created
{
  "id": "feedback-uuid",
  "timestamp": "2026-09-28T15:30:00",
  ...
}
```

#### Get All Feedback
```http
GET /feedback?user_id=user-uuid

Response: 200 OK
[
  {
    "id": "feedback-uuid",
    "original_word": "trifles",
    "flagged_translation": "معمولی",
    "corrected_translation": "چھوٹی",
    "direction": "en-ur",
    "timestamp": "2026-09-28T15:30:00",
    "user_id": "user-uuid"
  }
]
```

#### Delete Feedback
```http
DELETE /feedback/{feedback_id}

Response: 200 OK
{"detail": "deleted"}
```

---

## 🎮 Usage Examples

### Web Application

1. **Register & Login**
   - Navigate to http://localhost:3000
   - Sign up with username and password
   - Log in to access your personalized dashboard

2. **Translate Text**
   - Enter text in the input field
   - Optionally add style/context (e.g., "formal", "technical")
   - Select translation direction (English→Urdu or Urdu→English)
   - Click "Translate"

3. **Flag & Correct**
   - If a translation seems wrong, click the "Flag" button on a word
   - Provide the corrected translation
   - System will learn and apply this correction to future translations
   - View all your corrections in the "Feedback" tab

4. **View Dashboard**
   - **History Tab**: See all your past translations
   - **Feedback Tab**: Review corrections you've submitted
   - **Admin Tab** (if admin): View all users, system statistics, and feedback

5. **Browse Stats**
   - Recharts visualization of translation frequency over time
   - API token usage tracking
   - User activity charts

### Browser Extension

1. **Install**
   - Load the `qwen_extension` folder as an unpacked extension in Chrome
   - Pin the extension to your toolbar for quick access

2. **Translate Highlighted Text**
   - Right-click on any highlighted text
   - Select "Translate with buddy"
   - Translation appears in the side panel

3. **Translate via Extension Icon**
   - Click the extension icon in the toolbar
   - Opens the side panel
   - Paste or type text to translate

---

## 📊 Screenshots & Visualizations

> **Note:** These are placeholders. Replace with your own screenshots as you develop and test the application.

### Web Application Interface
```
[SCREENSHOT PLACEHOLDER - Main Translation Interface]
To add a screenshot:
1. Take a screenshot of the web application at http://localhost:3000
2. Save as PNG file in a screenshots/ folder
3. Replace this placeholder with: ![Main Interface](./screenshots/main-interface.png)
```

### Browser Extension in Action
```
[SCREENSHOT PLACEHOLDER - Extension Side Panel]
To add a screenshot:
1. Open a PDF or article in Chrome
2. Highlight text and right-click → "Translate with buddy"
3. Screenshot the side panel
4. Save and replace this placeholder: ![Extension Panel](./screenshots/extension-panel.png)
```

### Grafana Monitoring Dashboard
```
[SCREENSHOT PLACEHOLDER - Grafana Interface]
To add a screenshot:
1. Start the monitoring stack: cd telemetry && docker-compose up -d
2. Open Grafana: http://localhost:3001 (admin/admin)
3. Create dashboards for:
   - API latency and response times
   - Error rates and exceptions
   - Token usage per user/time
   - Translation frequency by language pair
4. Screenshot the dashboard and replace: ![Grafana Dashboard](./screenshots/grafana-dashboard.png)
```

### In-Line Editing & Correction
```
[SCREENSHOT PLACEHOLDER - Inline Correction Feature]
To add a screenshot:
1. Use the web app to translate text
2. Click the "Flag" button on an incorrect word
3. Enter the corrected translation
4. Screenshot the modal/inline editor
5. Replace with: ![Inline Editing](./screenshots/inline-editing.png)
```

### Admin Dashboard
```
[SCREENSHOT PLACEHOLDER - Admin Dashboard]
To add a screenshot:
1. Log in as admin (username: "admin", password: "adminpassword")
2. Navigate to the Admin tab
3. Screenshot showing user list, statistics, and feedback management
4. Replace with: ![Admin Dashboard](./screenshots/admin-dashboard.png)
```

### Test Results - BERTScore
```
[SCREENSHOT PLACEHOLDER - BERTScore Test Results]
To add a screenshot:
1. Run IndicTrans2 evaluation in Google Colab
2. Execute: python test_translation.py
3. Evaluate translations using BERTScore metric
4. Screenshot showing before/after scores
5. Include model performance metrics (F1, Precision, Recall)
6. Replace with: ![BERTScore Results](./screenshots/bertscore-results.png)
```

---

## 🔬 Model Testing & Evaluation

### IndicTrans2 Model (Offline Translation)

The repository includes `test_translation.py` for evaluating the **IndicTrans2** multilingual translation model:

```bash
cd /path/to/Translator-buddy

# Download the IndicTrans2 model (one-time)
# From: https://huggingface.co/ai4bharat/indictrans2-en-indic

# Run translations
python test_translation.py
```

**Output Example:**
```
============================================================
IndicTrans2 English → Urdu
============================================================
Device: cuda
GPU: Tesla T4
CUDA: 12.1

Translating...

============================================================
RESULTS
============================================================

EN: Artificial intelligence is changing the way we learn and work.
UR: مصنوعی ذہانت ہمارے سیکھنے اور کام کرنے کے طریقے کو بدل رہی ہے۔

EN: The robot can navigate its environment without human intervention.
UR: روبوٹ بغیر انسانی مداخلت کے اپنے ماحول میں تحرک کر سکتا ہے۔

============================================================
Translation complete.
============================================================
```

### BERTScore Evaluation (Google Colab)

To evaluate translation quality, use BERTScore in Google Colab:

```python
# In Google Colab

# Install BERTScore
!pip install bert-score

from bert_score import score

# Reference and candidate translations
refs = [
    "میں سیکھنا چاہتا ہوں۔",
    "روبوٹ خود مختار ہے۔"
]
cands = [
    "میں سیکھنا پسند کرتا ہوں۔",
    "روبوٹ خود کار طریقے سے کام کرتا ہے۔"
]

# Compute BERTScore
P, R, F1 = score(cands, refs, lang="ur", rescale_with_baseline=True)

print(f"Precision: {P.mean():.4f}")
print(f"Recall:    {R.mean():.4f}")
print(f"F1 Score:  {F1.mean():.4f}")
```

**Expected Results:**
- **F1 Score**: 0.85–0.95 (depending on domain and translation complexity)
- **Precision**: Measures how similar generated translation is to reference
- **Recall**: Measures how much of the reference is captured in generated translation

> **Placeholder for test results:** Insert screenshots and metrics from your Colab notebook evaluation

---

## 📁 Configuration Files

### Google Gemini API Setup
Edit `backend/main.py` line 12:
```python
GEMINI_API_KEY = "your-actual-api-key-here"
```

### Prometheus Monitoring
Edit `telemetry/prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'translator-backend'
    static_configs:
      - targets: ['host.docker.internal:8000']
```

### Grafana Data Source
In Grafana UI:
1. Settings → Data Sources
2. Add Prometheus: `http://prometheus:9090`
3. Add Loki: `http://loki:3100`
4. Create dashboards using these data sources

### Environment Variables
Create `.env` in the `backend/` folder (optional, if needed):
```bash
GEMINI_API_KEY=your-key-here
BACKEND_PORT=8000
BACKEND_HOST=0.0.0.0
```

---

## 🧪 Testing

### Backend API Testing
```bash
cd backend

# Test with curl
curl -X POST http://localhost:8000/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, how are you?",
    "direction": "en-ur",
    "user_id": "test-user"
  }'

# Or use the interactive API docs
# Open http://localhost:8000/docs in your browser
```

### Model Testing
```bash
# Test Gemini model availability
python check.py

# Test IndicTrans2 model
python test_translation.py
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS, Recharts | Web UI with real-time charts |
| **Backend** | FastAPI (Python), Google Gemini API, Prometheus Instrumentator | REST API with LLM integration & metrics |
| **Extension** | Chrome Manifest V3, JavaScript, HTML/CSS | Browser extension for quick translation |
| **ML Models** | IndicTrans2 (Seq2Seq), Google Gemini 3.5/2.5/3.1 Flash | Translation engines |
| **Monitoring** | Prometheus, Grafana, Loki, Promtail | Metrics, dashboards, logs |
| **Storage** | JSON files (local persistence) | Simple data persistence |
| **Deployment** | Vercel (frontend), Self-hosted (backend) | Hosting |

---

## 🚨 Known Limitations

1. **Local JSON Storage**: For production, replace with a proper database (PostgreSQL, MongoDB)
2. **Authentication**: Currently password is stored in plain text; use hashing (bcrypt) in production
3. **API Key in Code**: Store API keys in environment variables or secret management systems
4. **Extension Context Extraction**: PDF text extraction may vary; ensure PDFs have selectable text
5. **Offline Model Size**: IndicTrans2 is ~2GB; not suitable for deployment where disk space is limited
6. **Rate Limiting**: No rate limiting implemented; add in production

---

## 🔐 Security Notes

⚠️ **This is a proof-of-concept/demo application.** For production:

1. Hash passwords using `bcrypt` or `argon2`
2. Store secrets (API keys) in environment variables or secret vaults
3. Implement JWT tokens for session management
4. Add rate limiting to prevent abuse
5. Use HTTPS/TLS for all communication
6. Implement CORS properly (currently allows all origins)
7. Add input validation and sanitization
8. Use a proper database instead of JSON files
9. Add logging and audit trails
10. Implement GDPR compliance for user data

---

## 📈 Performance Optimization

### Frontend
- Next.js automatic code splitting
- Image optimization via `next/image`
- CSS-in-JS with Tailwind for minimal bundle size
- Client-side caching of translation history

### Backend
- Model fallback mechanism (tries multiple Gemini versions)
- Correction memory (applies previous feedback without re-querying)
- Prometheus metrics for performance monitoring
- Temperature=0.2 for consistent, deterministic translations

### Monitoring
- Prometheus scrapes metrics every 15 seconds
- Grafana aggregates data for dashboard visualization
- Loki stores logs with high compression for efficient querying

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "Add your feature"`
4. Push to branch: `git push origin feature/your-feature`
5. Submit a pull request

---

## 📝 License

This project is open source and available under the **MIT License**.

---

## 📞 Support

For issues, questions, or feature requests:
- Open an issue on [GitHub Issues](https://github.com/anassaahi/Translator-buddy/issues)
- Check existing documentation in `/frontend/AGENTS.md` and this README

---

## 🎯 Roadmap

- [ ] Database integration (PostgreSQL/MongoDB)
- [ ] Advanced authentication (JWT, OAuth2)
- [ ] Rate limiting and usage quotas
- [ ] Multi-language support (beyond English-Urdu)
- [ ] Mobile app (React Native)
- [ ] Offline mode with local model caching
- [ ] Advanced analytics dashboard
- [ ] Batch translation API
- [ ] Translation memory (TM) for repeated phrases
- [ ] Custom model fine-tuning

---

**Built with ❤️ by [anassaahi](https://github.com/anassaahi)**

**Live Demo:** [translatorbuddy.vercel.app](https://translatorbuddy.vercel.app)
