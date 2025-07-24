'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Thread {
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    fetchThreads();
  }, []);

  useEffect(() => {
    if (currentThreadId) {
      loadMessages(currentThreadId);
    }
  }, [currentThreadId]);

  const fetchThreads = async () => {
    try {
      const response = await fetch('http://localhost:8000/threads');
      const data = await response.json();
      setThreads(data.threads);
      
      if (!currentThreadId && data.threads.length > 0) {
        setCurrentThreadId(data.threads[0].thread_id);
      } else if (data.threads.length === 0) {
        createNewThread();
      }
    } catch (err) {
      setError('Failed to load conversations');
    }
  };

  const createNewThread = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/create-thread', {
        method: 'POST',
      });
      const data = await response.json();
      setCurrentThreadId(data.thread_id);
      await fetchThreads();
    } catch (err) {
      setError('Failed to create new conversation');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (threadId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/thread/${threadId}/messages`);
      const data = await response.json();
      
      const displayMessages = data.messages.filter(
        (msg: Message) => msg.role !== 'system'
      );
      
      setMessages(displayMessages);
    } catch (err) {
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!input.trim() || !currentThreadId) return;
    
    setLoading(true);
    setIsStreaming(true);
    setError('');
    
    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      const response = await fetch('http://localhost:8000/travel-info', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream' 
        },
        body: JSON.stringify({ 
          question: input,
          thread_id: currentThreadId 
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n').filter(line => line.trim());

        for (const line of lines) {
          if (line === 'data: [DONE]') {
            setIsStreaming(false);
            await fetchThreads();
            break;
          }

          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.substring(6));
            if (data.content) {
              assistantMessage += data.content;
              
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                
                if (lastMessage.role === 'assistant') {
                  lastMessage.content = assistantMessage;
                } else {
                  newMessages.push({ role: 'assistant', content: assistantMessage });
                }
                
                return newMessages;
              });
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      setLoading(true);
      await fetch(`http://localhost:8000/thread/${threadId}`, {
        method: 'DELETE',
      });
      
      if (currentThreadId === threadId) {
        await createNewThread();
      }
      
      await fetchThreads();
    } catch (err) {
      setError('Failed to delete conversation');
    } finally {
      setLoading(false);
    }
  };

  // Format thread title with smart truncation
  const formatTitle = (title: string) => {
    if (!title) return "New Chat";
    if (title.length <= 24) return title;
    return `${title.substring(0, 20)}...`;
  };

  // Format date to be more readable
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <main className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - Sleek dark theme */}
      <div className="w-64 bg-gray-900 text-gray-100 border-r border-gray-800 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Conversations</h2>
          <button
            onClick={createNewThread}
            className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 transition"
            title="New conversation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {threads.map((thread) => (
            <div 
              key={thread.thread_id}
              className={`p-3 mb-2 rounded-lg cursor-pointer transition ${currentThreadId === thread.thread_id 
                ? 'bg-gray-700' 
                : 'hover:bg-gray-800'}`}
              onClick={() => setCurrentThreadId(thread.thread_id)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-medium truncate">{formatTitle(thread.title)}</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(thread.updated_at)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteThread(thread.thread_id);
                  }}
                  className="text-gray-400 hover:text-red-400 ml-2 transition"
                  title="Delete conversation"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="pt-4 border-t border-gray-800">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-sm font-medium">AI</span>
            </div>
            <div>
              <p className="text-sm font-medium">Travel Assistant</p>
              <p className="text-xs text-gray-400">Online</p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 p-4 flex items-center">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mr-3">
            <span className="text-white font-medium">AI</span>
          </div>
          <div>
            <h1 className="font-semibold">{formatTitle(threads.find(t => t.thread_id === currentThreadId)?.title || 'New Chat')}</h1>
            {isStreaming && (
              <p className="text-xs text-gray-500">Assistant is typing...</p>
            )}
          </div>
        </div>
        
        <div className="flex-1 bg-gray-50 p-4 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.length === 0 && !loading ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-800 mb-1">Start a conversation</h3>
                <p className="text-gray-600 max-w-md mx-auto">Ask your travel assistant anything about destinations, flights, hotels, or travel tips.</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div 
                  key={index} 
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[80%] rounded-xl p-4 ${message.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-xs'}`}
                  >
                    <p className="whitespace-pre-line">{message.content}</p>
                    <div className={`text-xs mt-2 ${message.role === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                  </div>
                </div>
              ))
            )}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-white border border-gray-200 text-gray-800 rounded-xl rounded-bl-none shadow-xs p-4">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse"></div>
                    <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
        
        <div className="bg-white border-t border-gray-200 p-4">
          {error && (
            <div className="text-red-600 text-sm p-3 bg-red-50 rounded-lg mb-3 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
          
          <div className="max-w-3xl mx-auto flex items-end space-x-3">
            <div className="flex-1 relative">
              <textarea
                rows={1}
                className="w-full p-3 pr-12 text-gray-800 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                placeholder="Message Travel Assistant..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                disabled={loading}
                style={{ minHeight: '44px', maxHeight: '120px' }}
              />
              <button
                onClick={() => {
                  if (input.trim()) handleSubmit();
                }}
                className={`absolute right-3 bottom-3 p-1 rounded-full ${input.trim() 
                  ? 'text-blue-600 hover:text-blue-700' 
                  : 'text-gray-400'}`}
                disabled={loading || !input.trim()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}