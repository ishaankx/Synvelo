'use client'
import { useState } from 'react'
import { pulseApi } from '@/lib/api'
import { Zap, CheckCircle, XCircle, Loader2, Send } from 'lucide-react'

interface ShipOption { qty: number; eta: string; cost: number }
interface Proposal {
  summary: string
  split_options: ShipOption[]
  total_cost: number
  margin_impact: number
  margin_impact_pct: number
  recommended: string
  win_probability_impact: number
}
interface Message {
  role: 'user' | 'assistant'
  content: string
  proposal?: Proposal
  actionId?: string
  approved?: boolean | null
}

const EXAMPLES = [
  "Can we ship 400 units of SKU-1001 by Friday?",
  "What's the fastest delivery for 85 units of SKU-1002?",
  "Generate a quote for 200 units of SKU-1001 for Acme Corp with 5% discount",
]

interface PulseSyncChatProps {
  dealId?: string
}

export default function PulseSyncChat({ dealId }: PulseSyncChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const sendQuery = async (query: string) => {
    if (!query.trim() || loading) return
    setLoading(true)
    setMessages(m => [...m, { role: 'user', content: query }])
    setInput('')

    try {
      const res = await pulseApi.query(query, dealId)
      const { proposal, raw_answer, action_id } = res.data
      setMessages(m => [...m, {
        role: 'assistant',
        content: (proposal?.summary) || raw_answer || 'Proposal ready.',
        proposal,
        actionId: action_id,
        approved: null
      }])
    } catch {
      setMessages(m => [...m, {
        role: 'assistant',
        content: 'Error processing query. Make sure the backend is running.'
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleApproval = async (actionId: string, idx: number, decision: 'approved' | 'rejected') => {
    await pulseApi.approve(actionId, decision)
    setMessages(m => m.map((msg, i) =>
      i === idx ? { ...msg, approved: decision === 'approved' } : msg
    ))
  }

  return (
    <div className="flex flex-col h-full">
      {messages.length === 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Try an example</p>
          <div className="space-y-2">
            {EXAMPLES.map((q, i) => (
              <button key={i} onClick={() => sendQuery(q)}
                className="w-full text-left bg-[#161b22] border border-[#30363d]
                           hover:border-purple-500/40 rounded-lg px-4 py-2.5 text-sm
                           text-gray-400 hover:text-gray-200 transition-all">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto mb-4 min-h-0">
        {messages.map((msg, idx) => (
          <div key={idx}>
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="bg-purple-600 text-white rounded-xl rounded-tr-sm px-4 py-2.5 max-w-sm text-sm">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
                <p className="text-gray-300 text-sm mb-3">{msg.content}</p>

                {/* Proposal table — only render if proposal exists */}
                {msg.proposal && (msg.proposal.split_options?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Shipment Options</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-600">
                          <th className="text-left pb-2">Qty</th>
                          <th className="text-left pb-2">ETA</th>
                          <th className="text-right pb-2">Shipping Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {msg.proposal.split_options.map((opt, i) => (
                          <tr key={i} className="border-t border-[#30363d]">
                            <td className="py-2 text-gray-300">{opt.qty} units</td>
                            <td className="py-2 text-gray-300">{opt.eta}</td>
                            <td className="py-2 text-right text-gray-300">
                              ${(opt.cost || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex gap-4 mt-3 pt-2 border-t border-[#30363d] text-xs">
                      <span className="text-gray-500">
                        Total cost: <span className="text-gray-300">
                          ${msg.proposal.total_cost?.toLocaleString()}
                        </span>
                      </span>
                      <span className="text-gray-500">
                        Margin impact:{' '}
                        <span className={msg.proposal.margin_impact < 0 ? 'text-red-400' : 'text-green-400'}>
                          ${msg.proposal.margin_impact?.toLocaleString()}
                        </span>
                      </span>
                    </div>

                    {msg.proposal.recommended && (
                      <p className="text-xs text-gray-500 mt-2 italic">
                        {msg.proposal.recommended}
                      </p>
                    )}
                  </div>
                )}

                {msg.actionId && msg.approved === null && (
                  <div className="flex gap-2 pt-2 border-t border-[#30363d]">
                    <button onClick={() => handleApproval(msg.actionId!, idx, 'approved')}
                      className="flex items-center gap-1.5 bg-green-600/20 hover:bg-green-600/30
                                 border border-green-600/40 text-green-400 px-3 py-1.5
                                 rounded-lg text-xs font-medium transition-colors">
                      <CheckCircle className="w-3 h-3" /> Approve
                    </button>
                    <button onClick={() => handleApproval(msg.actionId!, idx, 'rejected')}
                      className="flex items-center gap-1.5 bg-red-600/20 hover:bg-red-600/30
                                 border border-red-600/40 text-red-400 px-3 py-1.5
                                 rounded-lg text-xs font-medium transition-colors">
                      <XCircle className="w-3 h-3" /> Reject
                    </button>
                  </div>
                )}

                {msg.approved !== null && (
                  <p className={`text-xs mt-2 pt-2 border-t border-[#30363d]
                                ${msg.approved ? 'text-green-400' : 'text-red-400'}`}>
                    {msg.approved ? '✓ Proposal approved and logged' : '✗ Proposal rejected'}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Querying ERP systems...
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-3 border-t border-[#30363d]">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendQuery(input)}
          placeholder="Ask about inventory, shipping, quotes..."
          className="flex-1 bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-2.5
                     text-white text-sm placeholder-gray-600 focus:outline-none
                     focus:border-purple-500 transition-colors"
        />
        <button onClick={() => sendQuery(input)} disabled={loading || !input.trim()}
          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40
                     text-white px-4 py-2.5 rounded-xl text-sm font-medium
                     flex items-center gap-2 transition-colors">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}