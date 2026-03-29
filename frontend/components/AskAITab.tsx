'use client'
/**
 * AskAITab — Conversational Deal Intelligence Agent
 *
 * Features:
 * - ReAct agent with SSE streaming (multi-step reasoning)
 * - Thinking trace: live tool-call feed while agent works
 * - Collapsible reasoning trace on completed messages
 * - Source citation pills per response
 * - Persistent conversation history (stored in backend)
 * - Conversation selector (switch / create / delete)
 * - Dynamic suggested questions (fetched from backend, not hardcoded)
 * - Quick action shortcuts (Summary, Risks, Next Steps, MEDDIC Gaps)
 * - Graceful fallback if AI is unavailable
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  MessageSquare, Send, ChevronDown, Plus, Trash2, Loader2,
  Search, BarChart2, AlertTriangle, CheckSquare, Target,
  FileText, Mic, Activity, Zap, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { askAiApi } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ThinkingStep {
  type: 'thinking' | 'tool_call'
  content: string
  tool?: string
}

interface AskAIMessage {
  role: 'user' | 'assistant'
  content: string
  sources: string[]
  suggestions: string[]
  steps: ThinkingStep[]
  timestamp: string
}

interface Conversation {
  id: string
  title: string
  message_count: number
  updated_at: string
}

interface SSEEvent {
  type: string
  content?: string
  tool?: string
  label?: string
  sources?: string[]
  suggestions?: string[]
  conversation_id?: string
}

// ── Tool → icon map ───────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ReactNode> = {
  search_documents:     <FileText className="w-3 h-3" />,
  get_deal_state:       <BarChart2 className="w-3 h-3" />,
  get_meddic_assessment:<Target className="w-3 h-3" />,
  search_activities:    <Activity className="w-3 h-3" />,
  get_exit_criteria_status: <CheckSquare className="w-3 h-3" />,
  get_signals:          <Zap className="w-3 h-3" />,
  search_knowledge_graph:<Search className="w-3 h-3" />,
  get_stakeholder_map:  <MessageSquare className="w-3 h-3" />,
  search_product_help:  <FileText className="w-3 h-3" />,
}

// ── Quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Deal Summary',  icon: <BarChart2   className="w-3 h-3" />, query: 'Give me a comprehensive summary of this deal — stage, value, win probability, and key risks.' },
  { label: 'Risks',         icon: <AlertTriangle className="w-3 h-3" />, query: 'What are the main risks threatening this deal?' },
  { label: 'Next Steps',    icon: <CheckSquare className="w-3 h-3" />, query: 'What are the most important next steps to move this deal forward?' },
  { label: 'MEDDIC Gaps',   icon: <Target      className="w-3 h-3" />, query: 'What are the MEDDIC qualification gaps I need to address?' },
]

// ── Main component ────────────────────────────────────────────────────────────

export default function AskAITab({ dealId }: { dealId: string }) {
  const [messages,      setMessages]      = useState<AskAIMessage[]>([])
  const [input,         setInput]         = useState('')
  const [streaming,     setStreaming]      = useState(false)
  const [liveSteps,     setLiveSteps]     = useState<ThinkingStep[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convId,        setConvId]        = useState<string | null>(null)
  const [suggestions,   setSuggestions]   = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [expandedMsg,   setExpandedMsg]   = useState<number | null>(null)
  const [showConvPanel, setShowConvPanel] = useState(false)
  const [loadingConv,   setLoadingConv]   = useState(false)

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLInputElement>(null)
  const readerRef       = useRef<ReadableStreamDefaultReader | null>(null)

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, liveSteps])

  // On mount: load conversations + suggestions
  useEffect(() => {
    loadConversations()
    fetchSuggestions()
  }, [dealId])

  // When convId changes (switched): load that conversation's messages
  useEffect(() => {
    if (convId) {
      loadConversationMessages(convId)
    }
  }, [convId])

  // ── Conversations ──────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    try {
      const res = await askAiApi.conversations(dealId)
      const convs: Conversation[] = res.data.conversations || []
      setConversations(convs)
      // Auto-select most recent if none selected
      if (!convId && convs.length > 0) {
        setConvId(convs[0].id)
      }
    } catch {
      // silently ignore — conversations are optional
    }
  }, [dealId, convId])

  const loadConversationMessages = async (cid: string) => {
    setLoadingConv(true)
    try {
      const res = await askAiApi.getConversation(dealId, cid)
      const raw: Array<{
        role: string; content: string; sources?: string[];
        suggestions?: string[]; steps?: ThinkingStep[]; timestamp?: string
      }> = res.data.messages || []

      const parsed: AskAIMessage[] = raw.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        sources: m.sources || [],
        suggestions: m.suggestions || [],
        steps: m.steps || [],
        timestamp: m.timestamp || new Date().toISOString(),
      }))
      setMessages(parsed)

      if (parsed.length === 0) {
        fetchSuggestions()
      }
    } catch {
      setMessages([])
    } finally {
      setLoadingConv(false)
    }
  }

  const handleNewConversation = () => {
    setConvId(null)
    setMessages([])
    setLiveSteps([])
    setExpandedMsg(null)
    setShowConvPanel(false)
    fetchSuggestions()
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleSelectConversation = (cid: string) => {
    setConvId(cid)
    setLiveSteps([])
    setExpandedMsg(null)
    setShowConvPanel(false)
  }

  const handleDeleteConversation = async (cid: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await askAiApi.deleteConversation(dealId, cid)
      const updated = conversations.filter(c => c.id !== cid)
      setConversations(updated)
      if (convId === cid) {
        setConvId(updated[0]?.id || null)
        setMessages([])
        if (!updated[0]) fetchSuggestions()
      }
    } catch {
      // ignore
    }
  }

  // ── Suggestions ────────────────────────────────────────────────────────────

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true)
    try {
      const res = await askAiApi.suggest(dealId)
      setSuggestions(res.data.suggestions || [])
    } catch {
      setSuggestions([
        'Who is the decision maker?',
        'What objections were raised?',
        'What is the timeline?',
      ])
    } finally {
      setLoadingSuggestions(false)
    }
  }

  // ── Streaming query ────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed || streaming) return

    setInput('')
    setStreaming(true)
    setLiveSteps([])

    // Add user message immediately
    const userMsg: AskAIMessage = {
      role: 'user',
      content: trimmed,
      sources: [],
      suggestions: [],
      steps: [],
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    let collectedSteps: ThinkingStep[] = []
    let finalAnswer = ''
    let finalSources: string[] = []
    let finalSuggestions: string[] = []
    let newConvId = convId
    let buffer = ''

    try {
      const response = await askAiApi.query(dealId, trimmed, convId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body!.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE lines
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // keep incomplete last line

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine.startsWith('data: ')) continue
          const payload = trimmedLine.slice(6).trim()
          if (!payload) continue

          let evt: SSEEvent
          try {
            evt = JSON.parse(payload)
          } catch {
            continue
          }

          switch (evt.type) {
            case 'thinking': {
              const step: ThinkingStep = { type: 'thinking', content: evt.content || '' }
              collectedSteps = [...collectedSteps, step]
              setLiveSteps([...collectedSteps])
              break
            }
            case 'tool_call': {
              const step: ThinkingStep = {
                type: 'tool_call',
                content: evt.label || `Calling ${evt.tool}`,
                tool: evt.tool,
              }
              collectedSteps = [...collectedSteps, step]
              setLiveSteps([...collectedSteps])
              break
            }
            case 'answer': {
              finalAnswer = evt.content || ''
              finalSources = evt.sources || []
              finalSuggestions = evt.suggestions || []
              break
            }
            case 'conversation_id': {
              newConvId = evt.conversation_id || convId
              break
            }
            case 'error': {
              finalAnswer = evt.content || 'Something went wrong. Please try again.'
              break
            }
            case 'done':
              break
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        finalAnswer = 'Response was cancelled.'
      } else {
        finalAnswer = 'Unable to reach the AI. Please check your connection and try again.'
      }
    }

    // Add assistant message
    const assistantMsg: AskAIMessage = {
      role: 'assistant',
      content: finalAnswer || 'I could not generate a response.',
      sources: finalSources,
      suggestions: finalSuggestions,
      steps: collectedSteps,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, assistantMsg])
    setLiveSteps([])
    setStreaming(false)
    readerRef.current = null

    if (newConvId && newConvId !== convId) {
      setConvId(newConvId)
      loadConversations()
    } else if (newConvId) {
      loadConversations()
    }
  }, [dealId, convId, streaming])

  const handleSubmit = () => sendMessage(input)

  const cancelStream = () => {
    readerRef.current?.cancel()
    readerRef.current = null
    setStreaming(false)
    setLiveSteps([])
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isEmpty = messages.length === 0 && !streaming && !loadingConv

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b syn-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-brand-500" />
          <span className="text-[12px] font-semibold text-gray-700">Ask AI</span>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 font-medium">
            ARIA
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Conversation panel toggle */}
          <button
            onClick={() => setShowConvPanel(v => !v)}
            className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="Conversation history"
          >
            <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
            {conversations.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-brand-500 rounded-full" />
            )}
          </button>
          {/* New chat */}
          <button
            onClick={handleNewConversation}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="New conversation"
          >
            <Plus className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* ── Conversation panel ───────────────────────────────────────────── */}
      {showConvPanel && (
        <div className="absolute top-10 right-2 z-20 w-72 syn-card border syn-border rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b syn-border">
            <span className="text-[11px] font-semibold text-gray-600">Past Conversations</span>
            <button onClick={() => setShowConvPanel(false)}>
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto syn-scroll">
            {conversations.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-4">No conversations yet</p>
            ) : (
              conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={cn(
                    'flex items-start justify-between px-3 py-2 cursor-pointer transition-colors group',
                    conv.id === convId ? 'bg-brand-50' : 'hover:bg-gray-50',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'text-[12px] truncate font-medium',
                      conv.id === convId ? 'text-brand-700' : 'text-gray-700',
                    )}>
                      {conv.title}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {conv.message_count} messages
                    </p>
                  </div>
                  <button
                    onClick={e => handleDeleteConversation(conv.id, e)}
                    className="ml-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="border-t syn-border p-2">
            <button
              onClick={() => { handleNewConversation(); setShowConvPanel(false) }}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] text-brand-600
                         hover:bg-brand-50 rounded-lg py-1.5 transition-colors"
            >
              <Plus className="w-3 h-3" />
              New conversation
            </button>
          </div>
        </div>
      )}

      {/* ── Message area ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto syn-scroll px-4 py-4 space-y-4 min-h-0">

        {/* Loading conversation */}
        {loadingConv && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {isEmpty && !loadingConv && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100
                            flex items-center justify-center mb-4">
              <MessageSquare className="w-5 h-5 text-brand-500" />
            </div>
            <p className="text-[14px] font-semibold text-gray-700 mb-1">Ask ARIA</p>
            <p className="text-[12px] text-gray-400 mb-5 max-w-[240px]">
              AI-powered deal intelligence. Ask anything about this deal.
            </p>

            {/* Dynamic suggested questions */}
            {loadingSuggestions ? (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading suggestions…
              </div>
            ) : (
              <div className="space-y-1.5 w-full max-w-[280px]">
                {suggestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(q); inputRef.current?.focus() }}
                    className="w-full text-left text-[12px] text-gray-600 syn-card
                               px-3.5 py-2.5 rounded-xl hover:border-brand-200
                               hover:bg-brand-50/40 hover:text-brand-700 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message history */}
        {!loadingConv && messages.map((msg, i) => (
          <div key={i} className="space-y-1.5">
            {msg.role === 'user' ? (
              /* User bubble */
              <div className="flex justify-end">
                <div className="bg-brand-50 border border-brand-200 rounded-2xl rounded-tr-sm
                                px-4 py-2.5 max-w-[85%]">
                  <p className="text-[13px] text-brand-700 leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ) : (
              /* Assistant bubble */
              <div className="max-w-[95%] space-y-2">
                <div className="syn-surface-2 border syn-border rounded-2xl rounded-tl-sm p-4">
                  <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>

                  {/* Source pills */}
                  {msg.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t syn-border">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold
                                       self-center mr-0.5">
                        Sources
                      </span>
                      {msg.sources.map((s, si) => (
                        <span key={si}
                          className="text-[10px] text-gray-500 bg-gray-100 border border-gray-200
                                     px-2 py-0.5 rounded-full flex items-center gap-1">
                          <FileText className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Reasoning trace toggle */}
                  {msg.steps.length > 0 && (
                    <button
                      onClick={() => setExpandedMsg(expandedMsg === i ? null : i)}
                      className="mt-2.5 flex items-center gap-1 text-[10px] text-gray-400
                                 hover:text-gray-600 transition-colors"
                    >
                      <ChevronDown className={cn(
                        'w-3 h-3 transition-transform',
                        expandedMsg === i && 'rotate-180',
                      )} />
                      {expandedMsg === i ? 'Hide' : 'Show'} reasoning ({msg.steps.length} steps)
                    </button>
                  )}

                  {/* Expanded reasoning */}
                  {expandedMsg === i && msg.steps.length > 0 && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5">
                      {msg.steps.map((step, si) => (
                        <div key={si} className="flex items-start gap-2">
                          <span className="mt-0.5 text-brand-400 flex-shrink-0">
                            {step.type === 'tool_call'
                              ? (TOOL_ICONS[step.tool || ''] ?? <Search className="w-3 h-3" />)
                              : <span className="w-3 h-3 inline-block" />
                            }
                          </span>
                          <p className="text-[11px] text-gray-500 leading-relaxed">
                            {step.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Suggestion pills */}
                {msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-1">
                    {msg.suggestions.map((s, si) => (
                      <button
                        key={si}
                        onClick={() => { setInput(s); inputRef.current?.focus() }}
                        className="text-[11px] text-brand-600 bg-brand-50 border border-brand-100
                                   rounded-full px-2.5 py-1 hover:bg-brand-100 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Live thinking trace (while streaming) */}
        {streaming && (
          <div className="max-w-[95%] space-y-2">
            {liveSteps.length > 0 ? (
              <div className="syn-surface-2 border border-brand-100 rounded-2xl rounded-tl-sm p-3 space-y-1.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex gap-0.5">
                    {[0, 1, 2].map(d => (
                      <span key={d}
                        className="w-1 h-1 rounded-full bg-brand-400 animate-bounce"
                        style={{ animationDelay: `${d * 0.15}s` }}
                      />
                    ))}
                  </span>
                  <span className="text-[11px] font-medium text-brand-600">Thinking…</span>
                </div>
                {liveSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 text-brand-400 flex-shrink-0">
                      {step.type === 'tool_call'
                        ? (TOOL_ICONS[step.tool || ''] ?? <Search className="w-3 h-3" />)
                        : <span className="w-3 h-3 inline-block" />
                      }
                    </span>
                    <p className="text-[11px] text-gray-500">{step.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="syn-surface-2 border border-brand-100 rounded-2xl rounded-tl-sm p-3 w-16">
                <div className="flex gap-1 justify-center">
                  {[0, 1, 2].map(d => (
                    <span key={d}
                      className="w-1.5 h-1.5 rounded-full bg-brand-300 animate-bounce"
                      style={{ animationDelay: `${d * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      {!streaming && (
        <div className="px-4 pb-1 flex gap-1.5 flex-wrap">
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => sendMessage(action.query)}
              disabled={streaming}
              className="flex items-center gap-1 text-[11px] text-gray-500 bg-gray-50
                         border border-gray-200 rounded-lg px-2.5 py-1
                         hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <span className="text-gray-400">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Input bar ────────────────────────────────────────────────────── */}
      <div className="px-4 pb-4 pt-2 border-t syn-border flex-shrink-0">
        <div className="flex gap-2 items-end">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Ask about this deal…"
            disabled={streaming}
            className="flex-1 syn-surface-2 border syn-border rounded-xl px-4 py-2.5
                       text-[13px] syn-text-primary placeholder:syn-text-muted
                       focus:outline-none focus:border-brand-400/50 transition-colors
                       disabled:opacity-60"
          />
          {streaming ? (
            <button
              onClick={cancelStream}
              className="w-10 h-10 flex items-center justify-center bg-red-50
                         hover:bg-red-100 border border-red-200 rounded-xl transition-colors flex-shrink-0"
              title="Stop"
            >
              <X className="w-4 h-4 text-red-500" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="w-10 h-10 flex items-center justify-center bg-brand-600
                         hover:bg-brand-500 disabled:opacity-40 rounded-xl
                         transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
