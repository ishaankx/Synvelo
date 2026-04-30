import axios from 'axios'
import { supabase } from '@/lib/supabase'

const API_BASE       = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001'

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'X-Org-ID': DEFAULT_ORG_ID,
  },
})

// Interceptor: attach Supabase JWT on every request if user is logged in
api.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      config.headers['Authorization'] = `Bearer ${session.access_token}`
      delete config.headers['X-Org-ID']
    }
  } catch {
    // No session — header fallback stays in place
  }
  return config
})

// 401 → auto sign-out
api.interceptors.response.use(
  r => r,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const dealsApi = {
  list:         (params?: { limit?: number; offset?: number }) => api.get('/deals/', { params }),
  get:          (id: string)            => api.get(`/deals/${id}`),
  create:       (d: {
    name: string
    company: string
    stage: string
    value: number
    owner: string
    time_to_close_days?: number | null
  }) => api.post('/deals/', d),
  delete:       (id: string)            => api.delete(`/deals/${id}`),
  update:       (id: string, fields: { value?: number; company?: string; owner?: string; time_to_close_days?: number }) =>
                  api.patch(`/deals/${id}`, fields),
  score:        (id: string)            => api.post(`/deals/${id}/score`),
  ask:          (id: string, q: string) => api.post(`/deals/${id}/ask`, { query: q }),
  brief:        (id: string)            => api.post(`/deals/${id}/brief`),
  followup:     (id: string)            => api.post(`/deals/${id}/followup`),
  scoreHistory:      (id: string) => api.get(`/deals/${id}/score-history`),
  sentimentTimeline: (id: string) => api.get(`/deals/${id}/sentiment-timeline`),
  // Stage pipeline
  stageConfigs:    ()                     => api.get('/deals/stage-configs'),
  transitionStage: (id: string, toStage: string, reason?: string, triggeredBy = 'manual') =>
                     api.patch(`/deals/${id}/stage`, { to_stage: toStage, reason, triggered_by: triggeredBy }),
  stageHistory:    (id: string)           => api.get(`/deals/${id}/stage/history`),
  pipelineOverview: ()                    => api.get('/deals/pipeline/overview'),
  // Exit criteria
  exitCriteria:       (id: string)         => api.get(`/deals/${id}/exit-criteria`),
  toggleCriterion:    (id: string, cid: string) => api.patch(`/deals/${id}/exit-criteria/${cid}`),
  addCriterion:       (id: string, text: string, stage?: string) =>
                        api.post(`/deals/${id}/exit-criteria`, { criterion_text: text, stage }),
  deleteCriterion:    (id: string, cid: string) => api.delete(`/deals/${id}/exit-criteria/${cid}`),
}

export const ingestApi = {
  upload: (dealId: string, file: File) => {
    const form = new FormData()
    form.append('deal_id', dealId)
    form.append('file', file)
    return api.post('/ingest/upload', form)
  },
  documents: (dealId: string) => api.get(`/ingest/documents/${dealId}`),
}

export const transcribeApi = {
  uploadAudio: (dealId: string, file: File, callTitle: string, attendees: string, platform: string) => {
    const form = new FormData()
    form.append('deal_id', dealId)
    form.append('file', file)
    form.append('call_title', callTitle)
    form.append('attendees', attendees)
    form.append('platform', platform)
    return api.post('/transcribe/upload', form)
  },
  fromUrl: (dealId: string, url: string, platform: string, callTitle: string, attendees: string) =>
    api.post('/transcribe/url', { deal_id: dealId, url, platform, call_title: callTitle, attendees }),
  status:  (id: string) => api.get(`/transcribe/status/${id}`),
  list:    (dealId: string) => api.get(`/transcribe/list/${dealId}`),
}

export const pulseApi = {
  query:   (query: string, dealId?: string) => api.post('/pulse/query', { query, deal_id: dealId }),
  approve: (id: string, decision: 'approved' | 'rejected') =>
             api.post(`/pulse/approve/${id}`, { decision, user: 'demo_user' }),
  history: (dealId?: string) => api.get('/pulse/history', { params: { deal_id: dealId } }),
}

export const analyticsApi = {
  summary: () => api.get('/analytics/summary'),
  usage:   (month?: string) => api.get('/analytics/usage', { params: month ? { month } : {} }),
}

export const organisationsApi = {
  get: (orgId: string) => api.get(`/organisations/${orgId}`),
}

export const reportsApi = {
  generate:    (dealId: string)   => api.post(`/reports/generate/${dealId}`),
  listForDeal: (dealId: string)   => api.get(`/reports/list/${dealId}`),
  all:         ()                 => api.get('/reports/all'),
  download:    (reportId: string) => api.get(`/reports/download/${reportId}`, { responseType: 'blob' }),
  delete:      (reportId: string) => api.delete(`/reports/${reportId}`),
  // Journey Report (Type 2)
  generateJourney:  (dealId: string)   => api.post(`/reports/journey/${dealId}/generate`),
  listJourney:      (dealId: string)   => api.get(`/reports/journey/${dealId}/list`),
  viewJourney:      (reportId: string) => api.get(`/reports/journey/${reportId}/view`),
}

export const nexusApi = {
  status:         ()                     => api.get('/api/nexus/status'),
  extractAll:     ()                     => api.post('/api/nexus/extract-all'),
  extractDeal:    (dealId: string, outcome: number) =>
                    api.post('/api/nexus/extract-features', { deal_id: dealId, outcome }),
  train:          (forceRetrain = false)  => api.post('/api/nexus/train', { force_retrain: forceRetrain }),
  winDna:         ()                     => api.get('/api/nexus/win-dna'),
  simulate:       (dealId: string, type = 'full', n = 500) =>
                    api.post('/api/nexus/simulate', { deal_id: dealId, simulation_type: type, n_scenarios: n }),
  simulations:    (dealId: string)       => api.get(`/api/nexus/simulations/${dealId}`),
  generateArtifacts: (simId: string, dealId: string, types: string[]) =>
                    api.post('/api/nexus/artifacts/generate', {
                      simulation_id: simId, deal_id: dealId, artifact_types: types,
                    }),
  artifacts:      (dealId: string)       => api.get(`/api/nexus/artifacts/${dealId}`),
}

export const askAiApi = {
  /**
   * Stream a ReAct-agent response via SSE (POST + ReadableStream).
   * Returns a raw Response — caller reads the stream.
   */
  query: async (
    dealId: string,
    message: string,
    conversationId?: string | null,
  ): Promise<Response> => {
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    } else {
      headers['X-Org-ID'] = DEFAULT_ORG_ID
    }
    return fetch(`${API_BASE}/deals/${dealId}/ask-ai/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        conversation_id: conversationId || undefined,
      }),
    })
  },

  conversations:     (dealId: string)             => api.get(`/deals/${dealId}/ask-ai/conversations`),
  getConversation:   (dealId: string, convId: string) => api.get(`/deals/${dealId}/ask-ai/conversations/${convId}`),
  deleteConversation:(dealId: string, convId: string) => api.delete(`/deals/${dealId}/ask-ai/conversations/${convId}`),
  suggest:           (dealId: string)             => api.post(`/deals/${dealId}/ask-ai/suggest`),
  graphStats:        (dealId: string)             => api.get(`/deals/${dealId}/ask-ai/graph/stats`),
}

export const activityApi = {
  list: (params?: {
    event_type?: string
    entity_type?: string
    entity_id?: string
    search?: string
    date_from?: string
    date_to?: string
    limit?: number
    offset?: number
  }) => api.get('/activity/', { params }),
  eventTypes: () => api.get('/activity/event-types'),
}

export default api