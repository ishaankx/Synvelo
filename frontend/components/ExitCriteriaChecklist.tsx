'use client'
import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { dealsApi } from '@/lib/api'
import { Shield, Plus, X, Loader2, Check } from 'lucide-react'

interface Criterion {
  id: string
  criterion_text: string
  is_completed: boolean
  is_custom: boolean
  completed_at: string | null
  created_at: string | null
}

interface Props {
  dealId: string
  stage: string
}

export default function ExitCriteriaChecklist({ dealId, stage }: Props) {
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data } = await dealsApi.exitCriteria(dealId)
      setCriteria(data.criteria || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => { load() }, [load, stage])

  const toggle = async (cid: string) => {
    setToggling(cid)
    try {
      const { data } = await dealsApi.toggleCriterion(dealId, cid)
      setCriteria(prev => prev.map(c => c.id === cid ? { ...c, is_completed: data.is_completed } : c))
    } catch {
      // silent
    } finally {
      setToggling(null)
    }
  }

  const addCustom = async () => {
    const text = newText.trim()
    if (!text) return
    setAdding(true)
    try {
      const { data } = await dealsApi.addCriterion(dealId, text)
      setCriteria(prev => [...prev, { ...data, completed_at: null, created_at: null }])
      setNewText('')
      setShowAdd(false)
    } catch {
      // silent
    } finally {
      setAdding(false)
    }
  }

  const remove = async (cid: string) => {
    setDeleting(cid)
    try {
      await dealsApi.deleteCriterion(dealId, cid)
      setCriteria(prev => prev.filter(c => c.id !== cid))
    } catch {
      // silent
    } finally {
      setDeleting(null)
    }
  }

  const completedCount = criteria.filter(c => c.is_completed).length
  const totalCount = criteria.length
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
      </div>
    )
  }

  return (
    <div>
      {/* Header + progress */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-gray-400" />
          <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">
            Exit Criteria
          </p>
        </div>
        <span className={cn(
          'text-[11px] font-semibold px-2 py-0.5 rounded-full',
          completedCount === totalCount && totalCount > 0
            ? 'bg-emerald-50 text-emerald-600'
            : 'bg-gray-100 text-gray-500',
        )}>
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              background: progress === 100
                ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                : 'linear-gradient(90deg, #6366f1, #818cf8)',
            }}
          />
        </div>
      )}

      {/* Criteria list */}
      <div className="grid gap-1.5">
        {criteria.map((c) => (
          <div
            key={c.id}
            className={cn(
              'group flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-all duration-200',
              c.is_completed
                ? 'bg-emerald-50/50 border-emerald-100'
                : 'bg-gray-50 border-gray-100 hover:border-gray-200',
            )}
          >
            {/* Checkbox */}
            <button
              onClick={() => toggle(c.id)}
              disabled={toggling === c.id}
              className={cn(
                'w-[18px] h-[18px] rounded flex-shrink-0 mt-0.5 flex items-center justify-center border-2 transition-all duration-200',
                toggling === c.id && 'opacity-50',
                c.is_completed
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-gray-300 hover:border-indigo-400 bg-white',
              )}
            >
              {c.is_completed && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </button>

            {/* Text */}
            <span className={cn(
              'text-[12px] leading-snug flex-1',
              c.is_completed ? 'text-emerald-700 line-through opacity-70' : 'text-gray-600',
            )}>
              {c.criterion_text}
              {c.is_custom && (
                <span className="ml-1.5 text-[9px] uppercase tracking-wider text-indigo-400 font-semibold">
                  custom
                </span>
              )}
            </span>

            {/* Delete button (custom only) */}
            {c.is_custom && (
              <button
                onClick={() => remove(c.id)}
                disabled={deleting === c.id}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-50"
              >
                <X className={cn(
                  'w-3.5 h-3.5',
                  deleting === c.id ? 'text-gray-300 animate-spin' : 'text-red-400 hover:text-red-600',
                )} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add custom criterion */}
      {showAdd ? (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustom()}
            placeholder="Add your own exit criterion..."
            autoFocus
            className="flex-1 text-[12px] px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
          />
          <button
            onClick={addCustom}
            disabled={adding || !newText.trim()}
            className="px-3 py-2 rounded-lg bg-indigo-500 text-white text-[11px] font-semibold hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
          </button>
          <button
            onClick={() => { setShowAdd(false); setNewText('') }}
            className="px-2 py-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-2.5 flex items-center gap-1.5 text-[11px] text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add custom criterion
        </button>
      )}
    </div>
  )
}
