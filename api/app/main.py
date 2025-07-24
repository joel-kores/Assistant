from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Optional
import openai
import os
import uuid
from fastapi.responses import StreamingResponse
import json
import sqlite3
from datetime import datetime

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_NAME = "chat_threads.db"

def init_db():
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT,
        role TEXT,
        content TEXT,
        timestamp TEXT,
        FOREIGN KEY (thread_id) REFERENCES threads (id)
    )
    """)
    conn.commit()
    conn.close()

init_db()

class TravelQuery(BaseModel):
    question: str
    thread_id: str

class ThreadResponse(BaseModel):
    thread_id: str
    title: str
    created_at: str
    updated_at: str

class ThreadListResponse(BaseModel):
    threads: List[ThreadResponse]

@app.get("/")
def read_root():
    return {"message": "Hello, welcome to your Assistant API!"}

@app.post("/create-thread", response_model=ThreadResponse)
def create_thread():
    thread_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    title = "New Conversation"
    
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (thread_id, title, now, now)
    )
    
    cursor.execute(
        "INSERT INTO messages (thread_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
        (thread_id, "system", "You are a helpful travel documentation assistant.", now)
    )
    
    conn.commit()
    conn.close()
    
    return {
        "thread_id": thread_id,
        "title": title,
        "created_at": now,
        "updated_at": now
    }

@app.get("/threads", response_model=ThreadListResponse)
def list_threads():
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, created_at, updated_at FROM threads ORDER BY updated_at DESC")
    threads = [
        {
            "thread_id": row[0],
            "title": row[1],
            "created_at": row[2],
            "updated_at": row[3]
        }
        for row in cursor.fetchall()
    ]
    conn.close()
    return {"threads": threads}

@app.get("/thread/{thread_id}/messages")
def get_thread_messages(thread_id: str):
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    
    cursor.execute("SELECT 1 FROM threads WHERE id = ?", (thread_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Thread not found")
    
    cursor.execute(
        "SELECT role, content FROM messages WHERE thread_id = ? ORDER BY timestamp ASC",
        (thread_id,)
    )
    messages = [{"role": row[0], "content": row[1]} for row in cursor.fetchall()]
    conn.close()
    return {"messages": messages}

@app.post("/travel-info")
async def get_travel_info(query: TravelQuery, request: Request):
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    
    cursor.execute("SELECT 1 FROM threads WHERE id = ?", (query.thread_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Thread not found")
    
    now = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO messages (thread_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
        (query.thread_id, "user", query.question, now)
    )
    
    cursor.execute(
        "UPDATE threads SET updated_at = ? WHERE id = ?",
        (now, query.thread_id)
    )
    
    cursor.execute(
        "SELECT role, content FROM messages WHERE thread_id = ? ORDER BY timestamp ASC",
        (query.thread_id,)
    )
    messages = [{"role": row[0], "content": row[1]} for row in cursor.fetchall()]
    conn.commit()
    conn.close()
    
    try:
        accept = request.headers.get("accept")
        if accept and "text/event-stream" in accept:
            return StreamingResponse(
                generate_stream_response(query.thread_id, messages),
                media_type="text/event-stream"
            )
        else:
            return await generate_full_response(query.thread_id, messages)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def generate_full_response(thread_id: str, messages: List[dict]):
    response = await openai.ChatCompletion.acreate(
        model="gpt-3.5-turbo",
        messages=messages,
    )
    assistant_message = response.choices[0].message["content"].strip()
    
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO messages (thread_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
        (thread_id, "assistant", assistant_message, now)
    )
    
    cursor.execute(
        "SELECT COUNT(*) FROM messages WHERE thread_id = ? AND role = 'user'",
        (thread_id,)
    )
    user_message_count = cursor.fetchone()[0]
    
    if user_message_count == 1:
        title = assistant_message[:50] + ("..." if len(assistant_message) > 50 else "")
        cursor.execute(
            "UPDATE threads SET title = ?, updated_at = ? WHERE id = ?",
            (title, now, thread_id)
        )
    
    conn.commit()
    conn.close()
    
    return {
        "response": assistant_message,
        "thread_id": thread_id
    }

async def generate_stream_response(thread_id: str, messages: List[dict]):
    response = await openai.ChatCompletion.acreate(
        model="gpt-3.5-turbo",
        messages=messages,
        stream=True
    )
    
    full_response = ""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    
    async for chunk in response:
        delta = chunk.choices[0].delta
        if "content" in delta:
            content = delta["content"]
            full_response += content
            yield f"data: {json.dumps({'content': content})}\n\n"
    
    now = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO messages (thread_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
        (thread_id, "assistant", full_response, now)
    )
    
    cursor.execute(
        "SELECT COUNT(*) FROM messages WHERE thread_id = ? AND role = 'user'",
        (thread_id,)
    )
    user_message_count = cursor.fetchone()[0]
    
    if user_message_count == 1:
        title = full_response[:50] + ("..." if len(full_response) > 50 else "")
        cursor.execute(
            "UPDATE threads SET title = ?, updated_at = ? WHERE id = ?",
            (title, now, thread_id)
        )
    
    conn.commit()
    conn.close()
    yield "data: [DONE]\n\n"

@app.delete("/thread/{thread_id}")
def delete_thread(thread_id: str):
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM messages WHERE thread_id = ?", (thread_id,))
    cursor.execute("DELETE FROM threads WHERE id = ?", (thread_id,))
    
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Thread not found")
    
    conn.commit()
    conn.close()
    return {"message": "Thread deleted successfully"}