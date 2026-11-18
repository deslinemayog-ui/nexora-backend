import { describe, it, expect } from 'vitest';
import { IntentDetector } from '../src/core/orchestrator/intent.detector';
import { OpenClawService } from '../src/openclaw/openclaw.service';
import { AgentType } from '@prisma/client';

describe('CV Interview & Job Application Flow', () => {
  const detector = new IntentDetector();
  const openclawService = new OpenClawService();

  it('detects CV interview intent and correctly conducts multi-turn interview', async () => {
    // 1. Initial intake trigger
    const initialMsg = "James Phiri wants you to help him apply for a job but he doesn't have a CV. Please interview me step-by-step to understand what I do, my work experience, and my education so we can build a professional resume, and then search and apply for jobs.";
    const intent = detector.detect(initialMsg);
    expect(intent.specialistAgent).toBe(AgentType.JOB_AGENT);
    expect(intent.category).toBe('JOB_SEARCH_AND_APPLICATION');

    const sessionKey = openclawService.createConversationSessionKey('cust-123', 'conv-test');

    const reply1 = (openclawService as any).buildDevelopmentSpecialistReply({
      customerId: 'cust-123',
      agentType: AgentType.JOB_AGENT,
      openclawAgentId: 'main',
      sessionKey,
      userMessage: initialMsg,
      systemInstructions: 'CV Interview instructions',
      conversationContext: [],
      allowedTools: [],
    });

    expect(reply1).toContain('James Phiri');
    expect(reply1).toContain('Stage 1 of 3: Target Role & Work Experience');

    // 2. User provides work experience
    const expMsg = 'I work as a Full-Stack Software Engineer at TechCorp for 3 years, building React and Node.js applications.';
    const reply2 = (openclawService as any).buildDevelopmentSpecialistReply({
      customerId: 'cust-123',
      agentType: AgentType.JOB_AGENT,
      openclawAgentId: 'main',
      sessionKey,
      userMessage: expMsg,
      systemInstructions: 'CV Interview instructions',
      conversationContext: [
        { role: 'user', content: initialMsg },
        { role: 'assistant', content: reply1 },
      ],
      allowedTools: [],
    });

    expect(reply2).toContain('Work Experience Captured');
    expect(reply2).toContain('Stage 2 of 3: Education, Credentials & Core Skills');

    // 3. User provides education and skills
    const eduMsg = 'I have a BSc in Computer Science from University of Cape Town. My skills are TypeScript, React, Node, PostgreSQL, Docker, AWS. Target location is Remote or the UK.';
    const reply3 = (openclawService as any).buildDevelopmentSpecialistReply({
      customerId: 'cust-123',
      agentType: AgentType.JOB_AGENT,
      openclawAgentId: 'main',
      sessionKey,
      userMessage: eduMsg,
      systemInstructions: 'CV Interview instructions',
      conversationContext: [
        { role: 'user', content: initialMsg },
        { role: 'assistant', content: reply1 },
        { role: 'user', content: expMsg },
        { role: 'assistant', content: reply2 },
      ],
      allowedTools: [],
    });

    expect(reply3).toContain('# 📄 CURRICULUM VITAE — James Phiri');
    expect(reply3).toContain('Looks good, search and apply');

    // 4. User confirms CV
    const confirmMsg = 'Looks good, search and apply';
    const reply4 = (openclawService as any).buildDevelopmentSpecialistReply({
      customerId: 'cust-123',
      agentType: AgentType.JOB_AGENT,
      openclawAgentId: 'main',
      sessionKey,
      userMessage: confirmMsg,
      systemInstructions: 'CV Interview instructions',
      conversationContext: [
        { role: 'user', content: initialMsg },
        { role: 'assistant', content: reply1 },
        { role: 'user', content: expMsg },
        { role: 'assistant', content: reply2 },
        { role: 'user', content: eduMsg },
        { role: 'assistant', content: reply3 },
      ],
      allowedTools: [],
    });

    expect(reply4).toContain('Autonomous Job Search & Applications Dispatched');
    expect(reply4).toContain('JOB-LK-');
    expect(reply4).toContain('JOB-WF-');
  });

  it('stays on JOB_AGENT when user mentions university/diploma during CV interview and compiles CV for review', () => {
    const bioMsg =
      'Okay, I am a senior software developer with 8 years in the industry, I do react, react native, nodeJS, typescript, redux, aws, linux, mysql, firebase. I worked at Motor accident group a company in Johannesburg as a junior mobile developer in 2018-2021, I completed the whole app myself, After that I moved to African bank as a mid dev working with reactJS and umbraco for 1 year & 6 months, after that I went to MTN for 3 years as a tech lead. I have a diploma from the university of Zimbabwe';

    const intent = detector.detect(bioMsg, {
      activeProjectAgent: AgentType.JOB_AGENT,
    });

    expect(intent.specialistAgent).toBe(AgentType.JOB_AGENT);
    expect(intent.category).toBe('CONVERSATIONAL_FOLLOWUP');

    const sessionKey = openclawService.createConversationSessionKey('cust-123', 'conv-james');
    const reply = (openclawService as any).buildDevelopmentSpecialistReply({
      customerId: 'cust-123',
      agentType: AgentType.JOB_AGENT,
      openclawAgentId: 'main',
      sessionKey,
      userMessage: bioMsg,
      systemInstructions: 'CV Interview instructions',
      conversationContext: [
        {
          role: 'user',
          content:
            "James Phiri wants you to help him apply for a job but he doesn't have a CV. Please interview me step-by-step.",
        },
        {
          role: 'assistant',
          content: 'Stage 1 of 3: Target Role & Work Experience',
        },
      ],
      allowedTools: [],
    });

    expect(reply).toContain('# 📄 CURRICULUM VITAE');
    expect(reply).toContain('senior software developer');
    expect(reply).toContain('Looks good, search and apply');
  });
});
