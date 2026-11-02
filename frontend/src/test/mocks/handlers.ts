import { http, HttpResponse } from 'msw';

// Base URL for API requests
const API_BASE_URL = '/api/v1';

// Mock data
const mockUsers = [
  { id: '1', name: 'John Doe', email: 'john@example.com' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
];

// MSW handlers for API mocking
export const handlers = [
  // Health check
  http.get('/health', () => {
    return HttpResponse.json({ status: 'ok' });
  }),

  // Get users
  http.get(`${API_BASE_URL}/users`, () => {
    return HttpResponse.json({
      success: true,
      data: mockUsers,
    });
  }),

  // Get user by ID
  http.get(`${API_BASE_URL}/users/:id`, ({ params }) => {
    const user = mockUsers.find((u) => u.id === params['id']);

    if (!user) {
      return HttpResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      data: user,
    });
  }),

  // Create user
  http.post(`${API_BASE_URL}/users`, async ({ request }) => {
    const body = (await request.json()) as { name: string; email: string };

    const newUser = {
      id: String(mockUsers.length + 1),
      name: body.name,
      email: body.email,
    };

    return HttpResponse.json(
      {
        success: true,
        data: newUser,
      },
      { status: 201 }
    );
  }),

  // Operations and organizations: empty lists by default; a test that needs
  // rows overrides these with server.use.
  http.get(`${API_BASE_URL}/operations`, () => {
    return HttpResponse.json({
      success: true,
      data: { operations: [], total: 0 },
    });
  }),

  http.get(`${API_BASE_URL}/organizations`, () => {
    return HttpResponse.json({
      success: true,
      data: { organizations: [], total: 0 },
    });
  }),

  // Participants by id: the Join wizard's routes. Each echoes the body back as
  // the row the server would have written; a test that needs a 409 overrides
  // with server.use.
  http.post(`${API_BASE_URL}/operations/:id/participants`, async ({ params, request }) => {
    const body = (await request.json()) as {
      organization_key?: string;
      adhoc?: { name: string; short_label: string; branch: string; color: string };
      equipment_ids: string[];
      waveform_abbrevs: string[];
      service_abbrevs: string[];
      transport_ids: string[];
      poc_name: string;
      poc_phone: string;
      poc_email: string;
      notes: string;
    };

    if (!body.organization_key && !body.adhoc) {
      return HttpResponse.json(
        {
          success: false,
          error: { code: 'PARTICIPANT_IDENTITY_REQUIRED', message: 'Name an organization or an Other' },
        },
        { status: 400 }
      );
    }

    const adhoc = body.adhoc ?? { name: '', short_label: '', branch: '', color: '' };
    const participant = {
      id: 'p-new',
      operation_id: params['id'],
      organization_key: body.organization_key ?? '',
      organization: body.adhoc
        ? { key: '', ...adhoc, adhoc: true }
        : { key: body.organization_key, name: '', short_label: '', branch: '', color: '', adhoc: false },
      equipment_ids: body.equipment_ids,
      waveform_abbrevs: body.waveform_abbrevs,
      service_abbrevs: body.service_abbrevs,
      transport_ids: body.transport_ids,
      poc_name: body.poc_name,
      poc_phone: body.poc_phone,
      poc_email: body.poc_email,
      notes: body.notes,
      created_by: 'test',
      updated_by: 'test',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    };

    return HttpResponse.json({ success: true, data: { participant } }, { status: 201 });
  }),

  http.patch(`${API_BASE_URL}/operations/:id/participants/id/:pid`, async ({ params, request }) => {
    const body = (await request.json()) as {
      equipment_ids: string[];
      waveform_abbrevs: string[];
      service_abbrevs: string[];
      transport_ids: string[];
      poc_name: string;
      poc_phone: string;
      poc_email: string;
      notes: string;
      expected_updated_at?: string;
    };

    const participant = {
      id: params['pid'],
      operation_id: params['id'],
      organization_key: '',
      organization: { key: '', name: '', short_label: '', branch: '', color: '', adhoc: false },
      equipment_ids: body.equipment_ids,
      waveform_abbrevs: body.waveform_abbrevs,
      service_abbrevs: body.service_abbrevs,
      transport_ids: body.transport_ids,
      poc_name: body.poc_name,
      poc_phone: body.poc_phone,
      poc_email: body.poc_email,
      notes: body.notes,
      created_by: 'test',
      updated_by: 'test',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-02T00:00:00Z',
    };

    return HttpResponse.json({ success: true, data: { participant } });
  }),

  http.delete(`${API_BASE_URL}/operations/:id/participants/id/:pid`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Login
  http.post(`${API_BASE_URL}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };

    // Mock authentication
    if (body.email === 'test@example.com' && body.password === 'password') {
      return HttpResponse.json({
        success: true,
        data: {
          user: { id: '1', name: 'Test User', email: 'test@example.com' },
          token: 'mock-jwt-token',
        },
      });
    }

    return HttpResponse.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
      },
      { status: 401 }
    );
  }),
];
