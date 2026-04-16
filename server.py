"""
server.py — Hormuz Intel backend
Serves static files + provides /api/chat endpoint backed by Claude.
"""

import json
import os
from pathlib import Path
from flask import Flask, request, Response, send_from_directory
import anthropic

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"

app = Flask(__name__, static_folder=str(BASE_DIR))

# ── Load context data once at startup ─────────────────────────────────────────
with open(DATA_DIR / "vessels.json") as f:
    VESSELS = json.load(f)

with open(DATA_DIR / "signals.json") as f:
    SIGNALS = json.load(f)

SYSTEM_PROMPT = f"""You are ARIA (Automated Regional Intelligence Analyst), an AI assistant embedded in the Hormuz Intel maritime intelligence dashboard. You have full access to the current vessel tracking data and intelligence signals for the Strait of Hormuz.

## Your role
Answer analyst questions about vessels, signals, risk assessments, patterns, and operational intelligence. Be precise, concise, and professional — like a real intel analyst briefing another analyst. Use the data below as your ground truth.

## Current Vessel Data (10 vessels tracked)
{json.dumps(VESSELS, indent=2)}

## Current Intelligence Signals ({len(SIGNALS)} signals)
{json.dumps(SIGNALS, indent=2)}

## Guidelines
- Reference vessel names, ADIDs, risk scores, and signal IDs specifically when relevant
- Flag when a question can't be answered from available data
- Risk scores: 75–100 = Suspicious (red), 40–74 = Watch (yellow), 0–39 = Normal (green)
- ADINT = advertising/mobile device intelligence, SOCINT = social/open-source intelligence
- Keep answers focused and operational — this is an active intelligence dashboard
- You can perform analysis: compare vessels, identify patterns, summarize threats, rank risks
- Format with bullet points or short paragraphs. Never use excessive markdown headers.
"""

anthropic_client = anthropic.Anthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY")
)


# ── Static file serving ────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(str(BASE_DIR), "index.html")


@app.route("/data/<path:filename>")
def serve_data(filename):
    return send_from_directory(str(DATA_DIR), filename)


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(str(BASE_DIR), filename)


# ── Chat API ───────────────────────────────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
def chat():
    body = request.get_json(force=True)
    messages = body.get("messages", [])

    if not messages:
        return {"error": "No messages provided"}, 400

    if not os.environ.get("ANTHROPIC_API_KEY"):
        return {"error": "ANTHROPIC_API_KEY not set"}, 500

    def generate():
        try:
            with anthropic_client.messages.stream(
                model="claude-opus-4-6",
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    # SSE format
                    yield f"data: {json.dumps({'text': text})}\n\n"
            yield "data: [DONE]\n\n"
        except anthropic.AuthenticationError:
            yield f"data: {json.dumps({'error': 'Invalid API key. Set ANTHROPIC_API_KEY.'})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    print(f"\n{'='*52}")
    print(f"  HORMUZ INTEL — Maritime Intelligence Dashboard")
    print(f"{'='*52}")
    print(f"  Server:  http://localhost:8080")
    print(f"  API key: {'✓ set' if api_key else '✗ NOT SET — chat will not work'}")
    if not api_key:
        print(f"\n  To enable chat: export ANTHROPIC_API_KEY=your_key")
    print(f"{'='*52}\n")
    app.run(port=8080, debug=False)
