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
  list:         ()                      => api.get('/deals/'),
  get:          (id: string)            => api.get(`/deals/${id}`),
  create:       (d: {
    name: string
    company: string
    stage: string
    value: number
    owner: string
    time_to_close_days?: number | null
  }) => api.post('/deals/', d),
  delete:       (id: string)            => api.delete(`/deals/${id}`),   // ← added
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
}

export const reportsApi = {
  generate:    (dealId: string)   => api.post(`/reports/generate/${dealId}`),
  listForDeal: (dealId: string)   => api.get(`/reports/list/${dealId}`),
  all:         ()                 => api.get('/reports/all'),
  download:    (reportId: string) => api.get(`/reports/download/${reportId}`, { responseType: 'blob' }),
  delete:      (reportId: string) => api.delete(`/reports/${reportId}`),
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

export default api