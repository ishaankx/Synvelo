'use client'
import { useState } from 'react'
import { pulseApi } from '@/lib/api'
import { Zap, CheckCircle, XCircle, Loader2, Send } from 'lucide-react'

const EXAMPLE_QUERIES = [
  "Can we ship 400 units of SKU-1001 by Friday?",
  "What's the fastest we can deliver 85 units of SKU-1002?",
  "Generate a quote for 200 units of SKU-1001 for Acme Corp with 5% discount",
]

interface Message {
  role: 'user' | 'assistant'
  content: string
  proposal?: any
  actionId?: string
  approved?: boolean | null
}

export default function PulseSyncPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const sendQuery = async (query: string) => {
    if (!query.trim()) return
    setLoading(true)
    setMessages(m => [...m, { role: 'user', content: query }])
    setInput('')

    try {
      const res = await pulseApi.query(query)
      const { proposal, raw_answer, action_id } = res.data
      setMessages(m => [...m, {
        role: 'assistant',
        content: proposal?.summary || raw_answer || 'Proposal generated.',
        proposal,
        actionId: action_id,
        approved: null
      }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Error processing query. Check API connection.' }])
    } finally { setLoading(false) }
  }

  const handleApproval = async (actionId: string, msgIdx: number, decision: 'approved' | 'rejected') => {
    await pulseApi.approve(actionId, decision)
    setMessages(m => m.map((msg, i) => i === msgIdx ? { ...msg, approved: decision === 'approved' } : msg))
  }

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 bg-violet-50 border border-violet-200 rounded-lg flex items-center justify-center">
            <Zap className="w-[18px] h-[18px] text-violet-600" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold syn-text-primary">Pulse Sync</h1>
            <p className="text-[12px] syn-text-secondary">Ask operational questions. Synvelo queries inventory and logistics to build executable proposals.</p>
          </div>
        </div>
      </div>

      {/* Example queries */}
      {messages.length === 0 && (
        <div className="mb-6">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium mb-3">Example queries</p>
          <div className="space-y-2">
            {EXAMPLE_QUERIES.map((q, i) => (
              <button key={i} onClick={() => sendQuery(q)}
                className="w-full text-left syn-surface-2 border syn-border hover:border-brand-300 rounded-lg px-4 py-3 text-[13px] text-gray-500 hover:text-gray-700 transition-all">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message thread */}
      <div className="flex-1 space-y-4 mb-4 overflow-y-auto syn-scroll">
        {messages.map((msg, idx) => (
          <div key={idx}>
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="bg-brand-50 border border-brand-200 text-gray-800 rounded-xl rounded-tr-sm px-4 py-2.5 max-w-md text-[13px]">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="syn-surface-2 border syn-border rounded-xl p-4">
                <p className="text-gray-700 text-[13px] mb-3 leading-relaxed">{msg.content}</p>

                {/* Proposal table */}
                {msg.proposal?.split_options?.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium mb-2">Shipment Options</p>
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-[11px] text-gray-500 uppercase tracking-wider">
                          <th className="text-left py-1.5 font-medium">Qty</th>
                          <th className="text-left py-1.5 font-medium">ETA</th>
                          <th className="text-right py-1.5 font-medium">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {msg.proposal.split_options.map((opt: any, i: number) => (
                          <tr key={i} className="border-t syn-border">
                            <td className="py-2 text-gray-700">{opt.qty} units</td>
                            <td className="py-2 text-gray-700">{opt.eta}</td>
                            <td className="py-2 text-right text-gray-700 tabular-nums">${opt.cost?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex gap-4 mt-2 text-[11px] text-gray-500">
                      <span>Total: <span className="text-gray-700 font-medium">${msg.proposal.total_cost?.toLocaleString()}</span></span>
                      <span>Margin impact: <span className={msg.proposal.margin_impact < 0 ? 'text-negative font-medium' : 'text-positive font-medium'}>${msg.proposal.margin_impact?.toLocaleString()}</span></span>
                    </div>
                  </div>
                )}

                {/* Approval buttons */}
                {msg.actionId && msg.approved === null && (
                  <div className="flex gap-2 mt-3 pt-3 border-t syn-border">
                    <button onClick={() => handleApproval(msg.actionId!, idx, 'approved')}
                      className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-positive px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors">
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => handleApproval(msg.actionId!, idx, 'rejected')}
                      className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-negative px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
                {msg.approved !== null && (
                  <p className={`text-[12px] mt-2 pt-2 border-t syn-border font-medium ${msg.approved ? 'text-positive' : 'text-negative'}`}>
                    {msg.approved ? 'Proposal approved and logged' : 'Proposal rejected'}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-[13px]">
            <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Querying ERP systems...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-3 border-t syn-border pt-4">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendQuery(input)}
          placeholder="Ask about inventory, shipping, quotes..."
          className="flex-1 syn-surface-2 border syn-border rounded-lg px-4 py-2.5 text-gray-900 text-[13px] placeholder-gray-400 focus:outline-none focus:border-brand-500/50 transition-colors" />
        <button onClick={() => sendQuery(input)} disabled={loading || !input.trim()}
          className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-[13px] font-medium flex items-center gap-2 transition-colors">
          <Send className="w-4 h-4" /> Send
        </button>
      </div>
    </div>
  )
}
