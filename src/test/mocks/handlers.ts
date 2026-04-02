import { http, HttpResponse } from 'msw';

const API_BASE = 'https://sourceiq-backend.hf.space';

export const handlers = [
  // Auth
  http.post(`${API_BASE}/auth/login`, () =>
    HttpResponse.json({ access_token: 'mock-jwt-token', token_type: 'bearer' })
  ),
  http.post(`${API_BASE}/auth/register`, () =>
    HttpResponse.json({ id: 1, email: 'test@sourceiq.dev', full_name: 'Test User' }, { status: 201 })
  ),

  // Projects
  http.get(`${API_BASE}/projects/`, () =>
    HttpResponse.json([
      { id: 1, name: 'Test RFP Project', description: 'Mock project', status: 'active' },
      { id: 2, name: 'Fasteners Q2', description: 'Mock project 2', status: 'draft' },
    ])
  ),
  http.post(`${API_BASE}/projects/`, async ({ request }) => {
    const body = await request.json() as Record<string, string>;
    return HttpResponse.json({ id: 3, ...body, status: 'draft' }, { status: 201 });
  }),
  http.get(`${API_BASE}/projects/:id`, ({ params }) =>
    HttpResponse.json({ id: Number(params.id), name: 'Test RFP Project', status: 'active' })
  ),

  // RFP
  http.get(`${API_BASE}/rfps/`, () =>
    HttpResponse.json([
      { id: 1, title: 'Industrial Fasteners RFP', project_id: 1, status: 'published' },
    ])
  ),

  // Analysis
  http.get(`${API_BASE}/analysis/:projectId`, ({ params }) =>
    HttpResponse.json({
      project_id: Number(params.projectId),
      scores: [{ supplier: 'Supplier A', score: 87 }, { supplier: 'Supplier B', score: 72 }],
    })
  ),

  // Pricing
  http.get(`${API_BASE}/pricing/:projectId`, ({ params }) =>
    HttpResponse.json({
      project_id: Number(params.projectId),
      items: [{ supplier: 'Supplier A', unit_price: 2.5, currency: 'USD' }],
    })
  ),

  // Chat
  http.post(`${API_BASE}/chat/`, () =>
    HttpResponse.json({ message: 'Mock copilot response', action: null })
  ),
];
