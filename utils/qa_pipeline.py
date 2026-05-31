import os
import json
import logging
from typing import List, Dict, Generator
from operator import itemgetter
from dotenv import load_dotenv

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

load_dotenv()
LOG = logging.getLogger("qa_pipeline")

# Initialize static embedding model (free, cloud-based serverless API)
embedding_model = HuggingFaceEndpointEmbeddings(
    model="sentence-transformers/all-MiniLM-L6-v2",
    task="feature-extraction",
    huggingfacehub_api_token=os.environ.get("HF_TOKEN")
)

def get_llm_model():
    """Dynamically load Chat model based on environment keys.
    
    Prefers OpenAI GPT-4o-mini if a valid key is provided, 
    otherwise uses the Hugging Face Llama 3 endpoint.
    """
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    is_openai_valid = openai_key and not openai_key.startswith("sk-1234efgh") and len(openai_key) > 20
    
    if is_openai_valid:
        try:
            from langchain_community.chat_models import ChatOpenAI
            LOG.info("Using OpenAI GPT-4o-mini for RAG chatbot")
            return ChatOpenAI(model="gpt-4o-mini", openai_api_key=openai_key, temperature=0.3, streaming=True)
        except Exception as e:
            LOG.error(f"Failed to load ChatOpenAI: {e}. Falling back to Hugging Face.")
            
    # Fallback to HuggingFace
    try:
        from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace
        LOG.info("Using HuggingFace Llama 3 Hub for RAG chatbot")
        llm = HuggingFaceEndpoint(
            repo_id="meta-llama/Meta-Llama-3-8B-Instruct", 
            task="text-generation",
            huggingfacehub_api_token=os.environ.get("HF_TOKEN"),
            temperature=0.3,
            max_new_tokens=1024,
            streaming=True
        )
        return ChatHuggingFace(llm=llm)
    except Exception as e:
        LOG.error(f"Failed to load HuggingFace: {e}")
        # Static mock model if all fail
        return None

def build_vector_store(video_a_meta: dict, video_a_transcript: str, 
                       video_b_meta: dict, video_b_transcript: str) -> FAISS:
    """Create a unified FAISS vector store containing chunks from both Video A and Video B."""
    splitter = RecursiveCharacterTextSplitter(chunk_size=600, chunk_overlap=100)
    
    documents = []
    
    # Process Video A
    if video_a_transcript:
        chunks_a = splitter.split_text(video_a_transcript)
        for idx, chunk in enumerate(chunks_a):
            documents.append({
                "page_content": chunk,
                "metadata": {
                    "video_id": "A",
                    "chunk_index": idx,
                    "platform": video_a_meta.get("platform"),
                    "title": video_a_meta.get("title"),
                    "creator": video_a_meta.get("creator")
                }
            })
            
    # Process Video B
    if video_b_transcript:
        chunks_b = splitter.split_text(video_b_transcript)
        for idx, chunk in enumerate(chunks_b):
            documents.append({
                "page_content": chunk,
                "metadata": {
                    "video_id": "B",
                    "chunk_index": idx,
                    "platform": video_b_meta.get("platform"),
                    "title": video_b_meta.get("title"),
                    "creator": video_b_meta.get("creator")
                }
            })
            
    if not documents:
        # Avoid empty document error by putting a placeholder
        documents.append({
            "page_content": "No transcript available.",
            "metadata": {"video_id": "None", "chunk_index": 0}
        })
        
    # Wrap in langchain document objects
    from langchain_core.documents import Document
    langchain_docs = [Document(page_content=d["page_content"], metadata=d["metadata"]) for d in documents]
    
    # Create the FAISS store
    vector_store = FAISS.from_documents(langchain_docs, embedding=embedding_model)
    return vector_store

def format_chat_history(messages: List[Dict]) -> List:
    """Convert raw session chat history to standard LangChain Message objects."""
    formatted = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            formatted.append(HumanMessage(content=content))
        elif role == "assistant":
            formatted.append(AIMessage(content=content))
    return formatted

def stream_rag_chat(
    question: str, 
    chat_history: List[Dict], 
    video_a_meta: dict, 
    video_a_transcript: str, 
    video_b_meta: dict, 
    video_b_transcript: str
) -> Generator[str, None, None]:
    """Execute the full RAG pipeline and yield chunks as they are generated by the LLM."""
    
    # 1. Create/Retrieve FAISS store
    vector_store = build_vector_store(
        video_a_meta, video_a_transcript, 
        video_b_meta, video_b_transcript
    )
    
    # 2. Retrieve top-4 highly relevant chunks
    retriever = vector_store.as_retriever(search_kwargs={"k": 4})
    docs = retriever.invoke(question)
    
    # 3. Format retrieved transcript segments with source metadata tags
    context_parts = []
    citations = []
    for idx, doc in enumerate(docs):
        vid_id = doc.metadata.get("video_id")
        creator = doc.metadata.get("creator", "Creator")
        title = doc.metadata.get("title", "Video")
        chunk_idx = doc.metadata.get("chunk_index", 0)
        
        context_parts.append(
            f"[Source: Video {vid_id} | Creator: {creator} | Chunk {chunk_idx}]\n\"{doc.page_content}\""
        )
        citations.append({
            "video_id": vid_id,
            "creator": creator,
            "title": title,
            "chunk_index": chunk_idx,
            "snippet": doc.page_content[:120] + "..."
        })
        
    formatted_context = "\n\n".join(context_parts)
    
    # 4. Construct System Prompt carrying BOTH full metrics context and semantic snippets
    system_prompt = f"""You are a world-class social media strategist and YouTube/Instagram Q&A expert.
You help creators optimize their performance by performing deep-dive comparative analyses of their content.

Here is the exact, verified metadata for the two videos under review:

VIDEO A (Label: Video A):
- Title: {video_a_meta.get('title')}
- Platform: {video_a_meta.get('platform')}
- Creator: {video_a_meta.get('creator')}
- Followers: {video_a_meta.get('follower_count')}
- Views: {video_a_meta.get('views'):,}
- Likes: {video_a_meta.get('likes'):,}
- Comments: {video_a_meta.get('comments'):,}
- Engagement Rate: {video_a_meta.get('engagement_rate')}%
- Duration: {video_a_meta.get('duration')}
- Upload Date: {video_a_meta.get('upload_date')}
- Hashtags: {", ".join(video_a_meta.get('hashtags', []))}

VIDEO B (Label: Video B):
- Title: {video_b_meta.get('title')}
- Platform: {video_b_meta.get('platform')}
- Creator: {video_b_meta.get('creator')}
- Followers: {video_b_meta.get('follower_count')}
- Views: {video_b_meta.get('views'):,}
- Likes: {video_b_meta.get('likes'):,}
- Comments: {video_b_meta.get('comments'):,}
- Engagement Rate: {video_b_meta.get('engagement_rate')}%
- Duration: {video_b_meta.get('duration')}
- Upload Date: {video_b_meta.get('upload_date')}
- Hashtags: {", ".join(video_b_meta.get('hashtags', []))}

Here are the semantically relevant spoken transcript segments retrieved from the vector store:
{formatted_context}

RULES FOR YOUR RESPONSE:
1. CRITICAL LIMIT: Your response MUST be extremely concise, sharp, and a MAXIMUM of 3 sentences (3 lines of text) in total. Absolutely do not exceed 3 lines/sentences under any circumstances.
2. Directly answer the question in a single, high-impact 2-to-3 sentence summary.
3. No headers, no bulleted lists, and no bold subheadings. Just plain text paragraphs.
4. Base your analytics on the engagement rates shown above, comparing metrics (e.g. likes-to-views ratio) and hooks (first 5 seconds).
5. When mentioning facts, cite concisely using `[Source: Video A]` or `[Source: Video B]`.
6. Keep your tone highly strategic, professional, and straight-to-the-point.
"""

    # 5. Build Chat Prompt using LangChain ChatPromptTemplate
    chat_prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content=system_prompt),
        MessagesPlaceholder(variable_name="history"),
        HumanMessage(content=question)
    ])
    
    # 6. Load streaming-enabled chat model
    model = get_llm_model()
    
    if model is None:
        # Fallback static stream generator if LLM fails entirely
        yield "data: " + json.dumps({"token": "System: The backend LLM is currently unavailable, but here is a mock response analyzing your videos. Video A has a higher engagement rate of " + str(video_a_meta.get('engagement_rate')) + "% compared to Video B's " + str(video_b_meta.get('engagement_rate')) + "% because Video A features a stronger, more immediate visual hook in the first 5 seconds, drawing in more viewers."})
        yield "data: " + json.dumps({"citations": citations})
        yield "data: [DONE]"
        return

    # Convert raw chat history
    formatted_history = format_chat_history(chat_history)
    
    # Assemble messages
    messages = chat_prompt.format_messages(history=formatted_history)
    
    # 7. Stream the tokens using the LangChain runnable interface
    try:
        # Stream model response token-by-token
        for chunk in model.stream(messages):
            # Handles ChatHuggingFace / ChatOpenAI chunk types
            token = chunk.content if hasattr(chunk, "content") else str(chunk)
            if token:
                yield "data: " + json.dumps({"token": token}) + "\n\n"
                
        # Send citations at the end of the stream
        yield "data: " + json.dumps({"citations": citations}) + "\n\n"
        yield "data: [DONE]\n\n"
        
    except Exception as e:
        LOG.error(f"Streaming LLM failed: {e}")
        yield "data: " + json.dumps({"token": f"\n❌ An error occurred during chat streaming: {str(e)}"}) + "\n\n"
        yield "data: [DONE]\n\n"
