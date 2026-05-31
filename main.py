from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional
import os
import logging

from utils.metadata_extractor import extract_metadata
from utils.whisper_transcribe import get_transcript_for_video
from utils.qa_pipeline import stream_rag_chat

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
LOG = logging.getLogger("main")

app = FastAPI(title="🎥 Social Video RAG Chatbot with LLM")

# ✅ Allow frontend access (React, Streamlit, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class IngestRequest(BaseModel):
    url_a: str
    url_b: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    question: str
    chat_history: List[ChatMessage]
    video_a_meta: dict
    video_a_transcript: str
    video_b_meta: dict
    video_b_transcript: str

@app.post("/ingest_videos")
async def ingest_videos(req: IngestRequest):
    """Fetch metadata and transcripts for both Video A and Video B."""
    url_a = req.url_a.strip()
    url_b = req.url_b.strip()
    
    if not url_a or not url_b:
        raise HTTPException(status_code=400, detail="Both URL A and URL B must be provided.")
        
    try:
        LOG.info(f"Ingesting Video A: {url_a}")
        meta_a = extract_metadata(url_a)
        transcript_a = get_transcript_for_video(url_a, meta_a)
        
        LOG.info(f"Ingesting Video B: {url_b}")
        meta_b = extract_metadata(url_b)
        transcript_b = get_transcript_for_video(url_b, meta_b)
        
        # Calculate comparison details
        higher_er_label = "Video A" if meta_a["engagement_rate"] > meta_b["engagement_rate"] else "Video B"
        if meta_a["engagement_rate"] == meta_b["engagement_rate"]:
            higher_er_label = "Tie"
            
        return {
            "video_a": {
                "meta": meta_a,
                "transcript": transcript_a
            },
            "video_b": {
                "meta": meta_b,
                "transcript": transcript_b
            },
            "comparison": {
                "higher_engagement": higher_er_label,
                "er_diff": round(abs(meta_a["engagement_rate"] - meta_b["engagement_rate"]), 2)
            }
        }
    except Exception as e:
        LOG.exception("Failed during video ingestion")
        raise HTTPException(status_code=500, detail=f"Failed to ingest videos: {str(e)}")

@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    """Stream RAG response using Server-Sent Events (SSE)."""
    try:
        # Map ChatMessage schema to raw dict list for pipeline
        history_list = [{"role": msg.role, "content": msg.content} for msg in req.chat_history]
        
        # SSE stream generator
        async def event_generator():
            generator = stream_rag_chat(
                question=req.question,
                chat_history=history_list,
                video_a_meta=req.video_a_meta,
                video_a_transcript=req.video_a_transcript,
                video_b_meta=req.video_b_meta,
                video_b_transcript=req.video_b_transcript
            )
            for event in generator:
                yield event

        return StreamingResponse(event_generator(), media_type="text/event-stream")
        
    except Exception as e:
        LOG.exception("Failed during chat endpoint processing")
        raise HTTPException(status_code=500, detail=str(e))

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

# Serve the static build of frontend at root
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
