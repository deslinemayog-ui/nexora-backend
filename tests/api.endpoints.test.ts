import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { createNexoraApplication } from '../src/main';

describe('REST API & Admin Security Endpoints', () => {
  it('serves health checks publicly, enforces admin auth on administrative routes, and supports project/task/approval/document lifecycle', async () => {
    const app = await createNexoraApplication({
      useInMemoryStores: true,
      openclawExecutor: async (input) => ({
        runId: 'run-api-test',
        sessionKey: input.sessionKey,
        responseText: `[${input.agentType}] Processed: ${input.userMessage}`,
        tokensUsed: 95,
        toolCallsCount: 0,
        durationMs: 10,
        status: 'COMPLETED',
      }),
    });

    // 1. Public health check
    const healthRes = await app.apiServer.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.json().ok).toBe(true);

    // 2. Unauthorized admin endpoint access must return 401
    const unauthAdmin = await app.apiServer.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
    });
    expect(unauthAdmin.statusCode).toBe(401);

    // 3. Authorized admin endpoint access returns system overview & registered agents
    const authAdmin = await app.apiServer.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers: {
        'x-admin-api-key': env.ADMIN_API_KEY,
      },
    });
    expect(authAdmin.statusCode).toBe(200);
    expect(authAdmin.json().data.registeredAgents.length).toBe(6);

    // 4. Create customer and interact with tenant-scoped API endpoints
    const { customer } = await app.customerService.resolveCustomerFromWhatsApp({
      senderNumberOrJid: '+447700900888',
      displayName: 'API Customer',
    });

    const createProjectRes = await app.apiServer.inject({
      method: 'POST',
      url: `/api/v1/customers/${customer.id}/projects`,
      headers: {
        'x-tenant-customer-id': customer.id,
      },
      payload: {
        title: 'Expand SaaS Business into South Africa',
        objective: 'Register local subsidiary and research Johannesburg market',
        description: 'Cross-border expansion project',
        assignedSpecialist: 'BUSINESS_AGENT',
        targetCountry: 'South Africa',
      },
    });
    expect(createProjectRes.statusCode).toBe(201);
    expect(createProjectRes.json().data.tasks.length).toBe(4);

    // 5. Upload and download encrypted PDF document via API
    const pdfContent = Buffer.from('%PDF-1.4\nBusiness Plan for South Africa Expansion');
    const uploadDocRes = await app.apiServer.inject({
      method: 'POST',
      url: `/api/v1/customers/${customer.id}/documents`,
      headers: {
        'x-tenant-customer-id': customer.id,
      },
      payload: {
        originalFileName: 'SA_Business_Plan.pdf',
        mimeType: 'application/pdf',
        contentBase64: pdfContent.toString('base64'),
      },
    });
    expect(uploadDocRes.statusCode).toBe(201);
    const docId = uploadDocRes.json().data.document.id;

    const downloadDocRes = await app.apiServer.inject({
      method: 'GET',
      url: `/api/v1/customers/${customer.id}/documents/${docId}/download`,
      headers: {
        'x-tenant-customer-id': customer.id,
      },
    });
    expect(downloadDocRes.statusCode).toBe(200);
    expect(
      Buffer.from(downloadDocRes.json().data.contentBase64, 'base64').equals(pdfContent),
    ).toBe(true);

    // 6. Test React Vite Web Console endpoints (/api/v1/webchat/message & /api/v1/webchat/state)
    const webChatRes = await app.apiServer.inject({
      method: 'POST',
      url: '/api/v1/webchat/message',
      payload: {
        phoneNumber: '+447700900777',
        displayName: 'Web Console Tester',
        text: 'Find me a job in Canada.',
      },
    });
    expect(webChatRes.statusCode).toBe(200);
    expect(webChatRes.json().data.orchestration.routedAgent).toBe('JOB_AGENT');
    expect(webChatRes.json().data.projects.length).toBe(1);

    const webStateRes = await app.apiServer.inject({
      method: 'GET',
      url: '/api/v1/webchat/state?phoneNumber=%2B447700900777',
    });
    expect(webStateRes.statusCode).toBe(200);
    expect(webStateRes.json().data.projects.length).toBe(1);

    await app.stop();
  });
});
