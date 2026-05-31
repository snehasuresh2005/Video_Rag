// ==========================================
// Video RAG JS Controller
// SSE Streaming, Memory, and Embed Logic
// ==========================================

const analyzeBtn = document.getElementById("analyze-btn");
const urlAInput = document.getElementById("url-a");
const urlBInput = document.getElementById("url-b");
const loaderOverlay = document.getElementById("loader-overlay");
const dashboardWorkspace = document.getElementById("dashboard-workspace");

// Step loader elements
const stepMeta = document.getElementById("step-meta");
const stepTranscript = document.getElementById("step-transcript");
const stepWhisper = document.getElementById("step-whisper");
const stepVector = document.getElementById("step-vector");

// Dashboard elements
const barA = document.getElementById("bar-a");
const barB = document.getElementById("bar-b");
const comparisonVerdict = document.getElementById("comparison-verdict");

// Video Card A
const embedA = document.getElementById("embed-container-a");
const titleA = document.getElementById("title-a");
const creatorA = document.getElementById("creator-a");
const followersA = document.getElementById("followers-a");
const viewsA = document.getElementById("views-a");
const likesA = document.getElementById("likes-a");
const commentsA = document.getElementById("comments-a");
const erA = document.getElementById("er-a");
const durationA = document.getElementById("duration-a");
const dateA = document.getElementById("date-a");
const hashtagsA = document.getElementById("hashtags-a");

// Video Card B
const embedB = document.getElementById("embed-container-b");
const titleB = document.getElementById("title-b");
const creatorB = document.getElementById("creator-b");
const followersB = document.getElementById("followers-b");
const viewsB = document.getElementById("views-b");
const likesB = document.getElementById("likes-b");
const commentsB = document.getElementById("comments-b");
const erB = document.getElementById("er-b");
const durationB = document.getElementById("duration-b");
const dateB = document.getElementById("date-b");
const hashtagsB = document.getElementById("hashtags-b");

// Chat elements
const chatBox = document.getElementById("chat-box");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const clearChatBtn = document.getElementById("clear-chat-btn");

// Application State
let videoAState = null;
let videoBState = null;
let chatHistory = [];

// API Endpoint Configuration (Automatically resolves to local backend when testing, same-origin when served, or fallback deployed URL)
let API_BASE_URL = "https://video-rag-p8m5.onrender.com"; 

if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:") {
    API_BASE_URL = "http://localhost:8000";
} else if (window.location.origin && !window.location.origin.includes("vercel.app") && !window.location.origin.includes("github.io")) {
    API_BASE_URL = window.location.origin;
}


// Helper: Extract YouTube ID
function getYoutubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Helper: Extract Instagram Shortcode
function getInstagramShortcode(url) {
    const m = url.match(/\/p\/([A-Za-z0-9_-]+)\/|\/reel\/([A-Za-z0-9_-]+)\/|\/tv\/([A-Za-z0-9_-]+)\//);
    if (m) {
        return m[1] || m[2] || m[3];
    }
    const parts = url.replace(/\/$/, "").split("/");
    return parts[parts.length - 1];
}

// Helper: Format large numbers
function formatNum(num) {
    if (!num) return "0";
    return num.toLocaleString();
}

// Step visual simulator (runs in parallel to backend request to keep user engaged)
function simulateIngestSteps() {
    stepMeta.className = "step active";
    stepTranscript.className = "step";
    stepWhisper.className = "step";
    stepVector.className = "step";

    setTimeout(() => {
        if (loaderOverlay.classList.contains("hidden")) return;
        stepMeta.className = "step success";
        stepMeta.innerHTML = `<i class="fa-solid fa-circle-check"></i> Public Metrics Retrieved`;
        stepTranscript.className = "step active";
    }, 1500);

    setTimeout(() => {
        if (loaderOverlay.classList.contains("hidden")) return;
        stepTranscript.className = "step success";
        stepTranscript.innerHTML = `<i class="fa-solid fa-circle-check"></i> Main Transcripts Acquired`;
        stepWhisper.className = "step active";
    }, 3500);

    setTimeout(() => {
        if (loaderOverlay.classList.contains("hidden")) return;
        stepWhisper.className = "step success";
        stepWhisper.innerHTML = `<i class="fa-solid fa-circle-check"></i> Whisper Audio Processing Completed`;
        stepVector.className = "step active";
    }, 5500);

    setTimeout(() => {
        if (loaderOverlay.classList.contains("hidden")) return;
        stepVector.className = "step success";
        stepVector.innerHTML = `<i class="fa-solid fa-circle-check"></i> DB Chunks Vectorized & Cached`;
    }, 7500);
}

// Ingestion Trigger
analyzeBtn.addEventListener("click", async () => {
    const urlA = urlAInput.value.trim();
    const urlB = urlBInput.value.trim();

    if (!urlA || !urlB) {
        alert("Please enter both URLs to run the comparison.");
        return;
    }

    // Clear previous chat memory and chatbox logs to prevent context contamination
    chatHistory = [];
    chatBox.innerHTML = `
        <div class="message bot">
            🚀 <strong>Videos Ingested & Indexed Successfully!</strong>
            <p>I have built an in-memory vector database containing transcripts and full quantitative metrics for both Video A and Video B.</p>
            <p>Ask me comparison questions or pick one of the preset prompts below to start your competitive audit.</p>
        </div>
    `;

    // Prepare loader screen
    loaderOverlay.classList.remove("hidden");
    dashboardWorkspace.classList.add("hidden");
    analyzeBtn.disabled = true;
    simulateIngestSteps();

    try {
        const response = await fetch(`${API_BASE_URL}/ingest_videos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url_a: urlA, url_b: urlB }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to ingest videos");
        }

        const data = await response.json();
        
        // Save state locally
        videoAState = data.video_a;
        videoBState = data.video_b;
        
        // Render Dashboard
        renderDashboard(data);
        
    } catch (error) {
        alert(`❌ Ingestion Error: ${error.message}`);
    } finally {
        loaderOverlay.classList.add("hidden");
        analyzeBtn.disabled = false;
    }
});

// Render dashboard layout with dynamic data
function renderDashboard(data) {
    const metaA = data.video_a.meta;
    const metaB = data.video_b.meta;
    const comp = data.comparison;

    // 1. Comparison Metrics Grid
    const sumER = metaA.engagement_rate + metaB.engagement_rate;
    const shareA = sumER > 0 ? (metaA.engagement_rate / sumER) * 100 : 50;
    const shareB = sumER > 0 ? (metaB.engagement_rate / sumER) * 100 : 50;

    barA.style.width = `${shareA}%`;
    barA.textContent = `Video A (${metaA.engagement_rate}%)`;
    barB.style.width = `${shareB}%`;
    barB.textContent = `Video B (${metaB.engagement_rate}%)`;

    if (comp.higher_engagement === "Tie") {
        comparisonVerdict.textContent = `Both videos have the exact same engagement rate of ${metaA.engagement_rate}%!`;
    } else {
        const higherMeta = comp.higher_engagement === "Video A" ? metaA : metaB;
        const lowerMeta = comp.higher_engagement === "Video A" ? metaB : metaA;
        comparisonVerdict.innerHTML = `<i class="fa-solid fa-trophy"></i> <strong>${higherMeta.creator} (${comp.higher_engagement})</strong> leads with <strong>${higherMeta.engagement_rate}%</strong> engagement rate (<strong>+${comp.er_diff}%</strong> higher than ${lowerMeta.creator}).`;
    }

    // 2. Video Card A Hydration
    titleA.textContent = metaA.title;
    creatorA.textContent = metaA.creator;
    followersA.textContent = metaA.follower_count;
    viewsA.textContent = formatNum(metaA.views);
    likesA.textContent = formatNum(metaA.likes);
    commentsA.textContent = formatNum(metaA.comments);
    erA.textContent = `${metaA.engagement_rate}%`;
    durationA.textContent = metaA.duration;
    dateA.textContent = metaA.upload_date;

    hashtagsA.innerHTML = "";
    metaA.hashtags.forEach(tag => {
        const span = document.createElement("span");
        span.className = "hashtag";
        span.textContent = `#${tag}`;
        hashtagsA.appendChild(span);
    });

    // Embed Player A (YouTube)
    const ytId = getYoutubeId(metaA.url);
    if (ytId) {
        embedA.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}" allowfullscreen></iframe>`;
    } else {
        embedA.innerHTML = `
            <div class="embed-placeholder">
                <i class="fa-brands fa-youtube"></i>
                <a href="${metaA.url}" target="_blank" class="badge">Open Video <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
            </div>
        `;
    }

    // 3. Video Card B Hydration
    titleB.textContent = metaB.title;
    creatorB.textContent = metaB.creator;
    followersB.textContent = metaB.follower_count;
    viewsB.textContent = formatNum(metaB.views);
    likesB.textContent = formatNum(metaB.likes);
    commentsB.textContent = formatNum(metaB.comments);
    erB.textContent = `${metaB.engagement_rate}%`;
    durationB.textContent = metaB.duration;
    dateB.textContent = metaB.upload_date;

    hashtagsB.innerHTML = "";
    metaB.hashtags.forEach(tag => {
        const span = document.createElement("span");
        span.className = "hashtag";
        span.textContent = `#${tag}`;
        hashtagsB.appendChild(span);
    });

    // Embed Player B (Instagram)
    const shortcode = getInstagramShortcode(metaB.url);
    if (metaB.platform === "Instagram" && shortcode) {
        embedB.innerHTML = `<iframe src="https://www.instagram.com/reel/${shortcode}/embed" allowtransparency="true" scrolling="no"></iframe>`;
    } else {
        const ytIdB = getYoutubeId(metaB.url);
        if (ytIdB) {
            embedB.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytIdB}" allowfullscreen></iframe>`;
        } else {
            embedB.innerHTML = `
                <div class="embed-placeholder">
                    <i class="fa-brands fa-instagram"></i>
                    <a href="${metaB.url}" target="_blank" class="badge">Open Reel <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                </div>
            `;
        }
    }

    // Display workspace
    dashboardWorkspace.classList.remove("hidden");
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Preset prompt chips click events
document.querySelectorAll(".prompt-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        const prompt = chip.getAttribute("data-prompt");
        chatInput.value = prompt;
        sendMessage();
    });
});

// Clear Memory click
clearChatBtn.addEventListener("click", () => {
    chatHistory = [];
    chatBox.innerHTML = `
        <div class="message bot">
            🧹 <strong>Chat Memory Cleared!</strong>
            <p>I have completely refreshed my contextual short-term memory buffer. Ask me your next question!</p>
        </div>
    `;
});

// Chat send trigger
chatSendBtn.addEventListener("click", () => sendMessage());
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// SSE Streaming RAG QA Invocation
async function sendMessage() {
    const question = chatInput.value.trim();
    if (!question) return;

    if (!videoAState || !videoBState) {
        alert("Please analyze the videos first to load context.");
        return;
    }

    // Add user bubble
    appendMessage(question, "user");
    chatInput.value = "";

    // Add thinking bubble
    const botMsgDiv = appendMessage("", "bot");
    const textNode = document.createElement("div");
    textNode.className = "typing";
    textNode.textContent = "Strategizing";
    botMsgDiv.appendChild(textNode);

    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question: question,
                chat_history: chatHistory,
                video_a_meta: videoAState.meta,
                video_a_transcript: videoAState.transcript,
                video_b_meta: videoBState.meta,
                video_b_transcript: videoBState.transcript
            })
        });

        if (!response.ok) {
            throw new Error("Failed to connect to RAG stream");
        }

        // Clean thinking class
        textNode.className = "";
        textNode.textContent = "";

        // Read stream chunks
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            
            // Save last incomplete line back to buffer
            buffer = lines.pop();

            for (const line of lines) {
                const cleanedLine = line.trim();
                if (!cleanedLine.startsWith("data: ")) continue;

                const dataStr = cleanedLine.slice(6);
                if (dataStr === "[DONE]") {
                    break;
                }

                try {
                    const parsed = JSON.parse(dataStr);
                    
                    if (parsed.token) {
                        // Stream character-by-character and render parsed HTML dynamically
                        textNode.textContent += parsed.token;
                        textNode.innerHTML = formatMarkdown(textNode.textContent);
                        chatBox.scrollTop = chatBox.scrollHeight;
                    }
                    
                    if (parsed.citations && parsed.citations.length > 0) {
                        renderCitations(botMsgDiv, parsed.citations);
                    }
                } catch (e) {
                    // Ignore malformed JSON lines
                }
            }
        }

        // Add response to memory
        chatHistory.push({ role: "user", content: question });
        chatHistory.push({ role: "assistant", content: textNode.textContent });

    } catch (error) {
        textNode.className = "";
        textNode.innerHTML = `<span style="color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${error.message}</span>`;
    }
}

// Append Chat Bubble Helper
function appendMessage(text, sender) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${sender}`;
    if (text) {
        msgDiv.textContent = text;
    }
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msgDiv;
}

// Render citation tags at bottom of Assistant responses
function renderCitations(parentDiv, citations) {
    const citationsBox = document.createElement("div");
    citationsBox.className = "citations-box";
    
    const title = document.createElement("div");
    title.className = "citations-title";
    title.innerHTML = `<i class="fa-solid fa-feather"></i> Transcript Citations`;
    citationsBox.appendChild(title);
    
    const list = document.createElement("div");
    list.className = "citations-list";
    
    // Group citations by unique Video ID
    const uniqueIds = [...new Set(citations.map(c => c.video_id))];
    
    uniqueIds.forEach(vidId => {
        if (vidId === "None") return;
        const tag = document.createElement("span");
        tag.className = "citation-tag";
        tag.innerHTML = `<i class="fa-solid fa-circle-play"></i> Video ${vidId}`;
        
        // Grab snippets matching this video ID
        const match = citations.filter(c => c.video_id === vidId);
        const tooltip = match.map(m => `Chunk ${m.chunk_index}: "${m.snippet}"`).join("\n\n");
        tag.title = tooltip;
        
        list.appendChild(tag);
    });
    
    citationsBox.appendChild(list);
    parentDiv.appendChild(citationsBox);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Lightweight secure Markdown-to-HTML parser for real-time streaming RAG responses
function formatMarkdown(text) {
    if (!text) return "";
    
    // 1. Escape basic HTML elements to prevent any layout breaking/XSS
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    // 2. Format inline **bold** headers
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    
    // 3. Format inline `code` highlights
    html = html.replace(/`([^`]+)`/g, "<code class='chat-code'>$1</code>");
    
    // 4. Split and process paragraphs and lists
    const segments = html.split(/\n\n+/);
    const parsedSegments = segments.map(seg => {
        const trimmed = seg.trim();
        if (!trimmed) return "";
        
        const lines = trimmed.split("\n");
        
        // Bullet list formatting
        if (lines[0].startsWith("- ") || lines[0].startsWith("* ")) {
            const listItems = lines.map(line => {
                const cleanLine = line.replace(/^[-*]\s+/, "");
                return `<li>${cleanLine}</li>`;
            }).join("");
            return `<ul class="chat-list">${listItems}</ul>`;
        }
        
        // Numbered list formatting
        if (/^\d+\.\s+/.test(lines[0])) {
            const listItems = lines.map(line => {
                const cleanLine = line.replace(/^\d+\.\s+/, "");
                return `<li>${cleanLine}</li>`;
            }).join("");
            return `<ol class="chat-list">${listItems}</ol>`;
        }
        
        // Standard paragraph block
        return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    });
    
    return parsedSegments.join("");
}

