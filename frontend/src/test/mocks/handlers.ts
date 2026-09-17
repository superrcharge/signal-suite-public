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
