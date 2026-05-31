# 🎥 VibeRAG - Competitive Social Media Video RAG Chatbot

VibeRAG is a state-of-the-art, cost-effective full-stack competitive intelligence RAG chatbot. It allows content creators and strategists to paste a **YouTube URL** and an **Instagram Reel URL** side-by-side, pull key metrics, and perform deep-dive comparison audits using an interactive LangChain-powered chat interface.

---

## 🔹 Core Features

*   **Dual Video Comparison Ingestion**: Analyze a YouTube Video and an Instagram Reel simultaneously.
*   **Dynamic Metadata Extraction**: Dynamic metrics retrieval (views, likes, comments, creator name, subscriber count, duration, date, hashtags) using a zero-credential `yt-dlp` scraping system with a local caching layer.
*   **Automatic View Synthesis Fallback**: If Instagram blocks anonymous view counts, the system dynamically estimates views based on a realistic likes-to-views ratio ($12\times$ to $22\times$ likes) to keep engagement formulas intact.
*   **Chrome Browser Session Integration**: Securely extracts logged-in browser session cookies from Chrome to scrape authentic live metrics without requiring passwords.
*   **Robust Transcription Flow**: Prioritizes official transcripts (free), falls back to OpenAI Whisper transcribing (`whisper-1`), and finally triggers a serverless **Hugging Face Hub LLM** to synthesize a custom transcript if all API keys are missing, guaranteeing zero app crashes.
*   **Streaming & Citations**: Real-time token streaming with local conversational memory and precise source citations pointing back to video transcripts.
*   **Sleek Glassmorphic Dark-Mode UI**: A vibe-coded responsive dashboard with comparative analytics graphs, dual player embeds, quick preset prompt chips, and a scrollable chat panel.

---

## 📂 Project Structure

```
youtube-transcript-rag/
│
├── frontend/
│   ├── index.html       # Sleek Glassmorphic UI Dashboard
│   ├── style.css        # Responsive Dark-Mode Stylesheet
│   └── script.js        # SSE Stream Reader & Local State Controller
│
├── utils/
│   ├── metadata_extractor.py  # Unified yt-dlp Metadata Scraper & LLM Fallback
│   ├── whisper_transcribe.py  # Compressed Audio Downloader & Whisper Transcriber
│   └── qa_pipeline.py         # Unified FAISS Vector DB & LangChain RAG Orchestrator
│
├── main.py              # Stateless FastAPI Web Server
├── requirements.txt     # Python dependencies
└── .env                 # API tokens (HF_TOKEN, etc.)
```

---

## ⚡ How it Works

1.  **Ingestion**: Paste Video A (YouTube) and Video B (Instagram Reel) URLs.
2.  **Processing**: FastAPI scrapes metadata, synthesizes view counts, transcribes audio, structures document chunks with source tags, and indexes them in a local transient FAISS vector store.
3.  **Visual Analytics**: The dashboard renders side-by-side video cards, dynamic metrics grids, active players, and an engagement graph.
4.  **Strategic RAG Auditing**: Ask comparative questions. The LangChain pipeline retrieves relevant transcript snippets, merges them with metadata, and streams a structured answer limited to a **maximum of 3 sentences** for high skimmability.

---

## 💻 Installation & Quickstart

### 1. Clone & Set Up Environment:
```bash
git clone https://github.com/aliahmad552/youtube-transcript-rag.git
cd youtube-transcript-rag
python -m venv .venv
# PowerShell (Windows)
.\.venv\Scripts\Activate.ps1
# Bash (macOS/Linux)
source .venv/bin/activate
```

### 2. Install Dependencies:
```bash
pip install -r requirements.txt
```

### 3. Add API Tokens (`.env`):
Create a `.env` file in the root folder:
```ini
# Free, serverless LLM token for RAG queries and fallbacks (Real Token Provided)
HF_TOKEN=your_huggingface_token_here

# Optional: Add OpenAI API key to unlock native Whisper transcription
OPENAI_API_KEY=your_openai_key_here
```

### 4. Start the FastAPI Web Server:
```bash
uvicorn main:app --reload
```
Navigate to **`http://127.0.0.1:8000/`** to run the comparative dashboard!
