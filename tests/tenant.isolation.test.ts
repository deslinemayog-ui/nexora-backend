import { describe, expect, it } from 'vitest';
import { AgentType } from '@prisma/client';
import { createNexoraApplication } from '../src/main';
import { TenantIsolationError, ValidationError } from '../src/utils/errors';

describe('Multi-Tenant Isolation, Encrypted Document Access Controls & Malware Protection', () => {
  it('strictly isolates customer profiles, conversations, memories, projects, approvals, and encrypted documents across tenants', async () => {
    const app = await createNexoraApplication({
      useInMemoryStores: true,
    });

    // Create Tenant A (Alice) and Tenant B (Bob)
    const { customer: alice } = await app.customerService.resolveCustomerFromWhatsApp({
      senderNumberOrJid: '+447700900001',
      displayName: 'Alice Tenant',
    });

    const { customer: bob } = await app.customerService.resolveCustomerFromWhatsApp({
      senderNumberOrJid: '+14165550199',
      displayName: 'Bob Tenant',
    });

    expect(alice.id).not.toBe(bob.id);

    // Store private memory and project for Alice
    await app.memoryService.rememberFact({
      customerId: alice.id,
      category: 'GOAL',
      key: 'relocation_target',
      value: 'Canada',
    });

    const aliceProject = await app.projectService.createGoalProject({
      customerId: alice.id,
      title: 'Alice Canada Job Search',
      objective: 'Find Senior Engineer role in Toronto',
      description: 'Confidential job search for Alice',
      assignedSpecialist: AgentType.JOB_AGENT,
      targetCountry: 'Canada',
    });

    // Upload sensitive PDF CV for Alice (encrypted with AES-256-GCM bound to Alice's tenant ID)
    const samplePdfBuffer = Buffer.from(
      '%PDF-1.4\nAlice Curriculum Vitae\n5 years experience in TypeScript, Node.js, PostgreSQL\nB.Sc Computer Science\nalice@example.com',
      'utf8',
    );
    const uploadedDoc = await app.documentService.processAndStoreDocument({
      customerId: alice.id,
      projectId: aliceProject.project.id,
      originalFileName: 'Alice_CV.pdf',
      mimeType: 'application/pdf',
      buffer: samplePdfBuffer,
    });

    expect(uploadedDoc.cvMetadata?.yearsOfExperience).toBe(5);
    expect(uploadedDoc.cvMetadata?.skills).toContain('TypeScript');

    // Alice can decrypt her own document
    const aliceDecrypted = await app.documentService.getDecryptedDocumentForTenant(
      alice.id,
      uploadedDoc.document.id,
    );
    expect(aliceDecrypted.plaintextBuffer.equals(samplePdfBuffer)).toBe(true);

    // Bob MUST be blocked from accessing Alice's profile, memories, project, or document
    await expect(
      app.customerService.getProfileForTenant(bob.id, alice.id),
    ).rejects.toThrow(TenantIsolationError);

    await expect(
      app.memoryService.getCustomerMemories(bob.id, alice.id),
    ).rejects.toThrow(TenantIsolationError);

    await expect(
      app.projectService.getProject(bob.id, aliceProject.project.id),
    ).rejects.toThrow(TenantIsolationError);

    await expect(
      app.documentService.getDecryptedDocumentForTenant(bob.id, uploadedDoc.document.id),
    ).rejects.toThrow(TenantIsolationError);

    // Verify REST API enforces tenant isolation when Bob's tenant header requests Alice's resources
    const crossTenantRes = await app.apiServer.inject({
      method: 'GET',
      url: `/api/v1/customers/${alice.id}/projects`,
      headers: {
        'x-tenant-customer-id': bob.id,
      },
    });
    expect(crossTenantRes.statusCode).toBe(403);
    expect(crossTenantRes.json().error.code).toBe('TENANT_ISOLATION_VIOLATION');

    // Verify Malware Scanner blocks EICAR infected files
    const infectedBuffer = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      'utf8',
    );
    await expect(
      app.documentService.processAndStoreDocument({
        customerId: alice.id,
        originalFileName: 'invoice.txt',
        mimeType: 'text/plain',
        buffer: infectedBuffer,
      }),
    ).rejects.toThrow(ValidationError);

    await app.stop();
  });
});
