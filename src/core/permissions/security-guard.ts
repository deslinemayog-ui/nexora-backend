export type SecurityViolationCategory =
  | 'OS_MANIPULATION'
  | 'UNRELATED_FILE_ACCESS'
  | 'OFFICIAL_DOCUMENT_TAMPERING';

export interface SecurityGuardResult {
  blocked: boolean;
  category?: SecurityViolationCategory;
  reason?: string;
  userMessage?: string;
}

const OS_MANIPULATION_PATTERNS: RegExp[] = [
  /\b(?:delete|remove|erase|wipe|unlink|destroy|shred)\s+(?:all\s+)?(?:the\s+)?(?:files?|folders?|director(?:y|ies)|logs?|database|system|os)\b/i,
  /\b(?:rm\s+-rf?|rmdir|del\s+\/[fq]|format\s+[a-z]:|mkfs|dd\s+if=|chmod\s+[0-7]{3,4}|chown\s+|sudo\s+|su\s+root|pkill|killall|kill\s+-9|shutdown|reboot)\b/i,
  /\b(?:run|execute|open|spawn|invoke)\s+(?:a\s+)?(?:bash|sh|zsh|shell|terminal|powershell|cmd\.exe|command\s+prompt|os\s+command|system\s+command)\b/i,
  /\b(?:os\s+manipulation|manipulate\s+(?:the\s+)?os|modify\s+(?:os|system)\s+files?|edit\s+\/etc\/)\b/i,
];

const UNRELATED_FILE_ACCESS_PATTERNS: RegExp[] = [
  /(?:\/etc\/passwd|\/etc\/shadow|\/etc\/hosts|~\/\.ssh|id_rsa|id_ed25519|\.ssh\/|\/var\/log\/|C:\\Windows\\)/i,
  /(?:\.\.\/\.\.\/|\.\.\\\.\.\\)/,
  /\b(?:read|get|fetch|cat|dump|show|extract|steal|exfiltrate|list|open|access)\s+(?:me\s+)?(?:the\s+)?(?:server\s+files?|host\s+files?|system\s+files?|source\s+code|\.env\b|env\s+variables?|process\.env|ssh\s+keys?|private\s+keys?|root\s+directory|other\s+users?'?\s+files?)\b/i,
  /\b(?:get|read|fetch|access)\s+(?:a\s+)?files?\s+(?:that\s+)?(?:has|have)\s+nothing\s+to\s+do\s+with\b/i,
];

const OFFICIAL_DOC_NOUN =
  '(?:academic\\s+certificates?|degree\\s+certificates?|certificates?|diplomas?|transcripts?|passports?|visas?|national\\s+ids?|id\\s+cards?|driver\'?s?\\s+licen[cs]es?|birth\\s+certificates?|marriage\\s+certificates?|police\\s+clearances?|official\\s+(?:government\\s+)?doc(?:ument)?s?|government\\s+(?:issued\\s+)?doc(?:ument)?s?|immigration\\s+doc(?:ument)?s?|work\\s+permits?|residence\\s+permits?|tax\\s+(?:returns?|certificates?|clearance)|bank\\s+statements?)';

const TAMPER_VERB =
  '(?:edit|modify|alter|change|forge|fake|falsify|tamper(?:\\s+with)?|photoshop|doctor|manipulate|rewrite|update|fabricate|counterfeit)';

const OFFICIAL_DOC_EDIT_PATTERNS: RegExp[] = [
  new RegExp(`\\b${TAMPER_VERB}\\b[^\\n.]{0,60}\\b${OFFICIAL_DOC_NOUN}\\b`, 'i'),
  new RegExp(`\\b${OFFICIAL_DOC_NOUN}\\b[^\\n.]{0,40}\\b(?:${TAMPER_VERB}|edits?|forger(?:y|ies)|alterations?)\\b`, 'i'),
  new RegExp(`\\bcreate\\s+(?:a\\s+)?fake\\s+${OFFICIAL_DOC_NOUN}\\b`, 'i'),
];

/**
 * Deterministic security guardrail enforcing Nexora AI & OpenClaw restrictions:
 * 1. Reject any OS / shell / host-filesystem manipulation (e.g. deleting files, running OS commands).
 * 2. Reject reading/fetching unrelated host, system, credential, or cross-tenant files.
 * 3. Reject editing, altering, or forging certificates or official government documents.
 */
export function evaluateRestrictedRequest(inputText: string): SecurityGuardResult {
  const text = (inputText || '').trim();
  if (!text) {
    return { blocked: false };
  }

  for (const pattern of OS_MANIPULATION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        blocked: true,
        category: 'OS_MANIPULATION',
        reason: 'OS, shell, or host file deletion/manipulation is strictly prohibited.',
        userMessage:
          '🚫 **Request Rejected (Security Policy):** Nexora AI cannot perform OS manipulation, run shell/system commands, or delete/modify host files. I can only assist with your core career, relocation, investor, scholarship, and approved document workflows.',
      };
    }
  }

  for (const pattern of UNRELATED_FILE_ACCESS_PATTERNS) {
    if (pattern.test(text)) {
      return {
        blocked: true,
        category: 'UNRELATED_FILE_ACCESS',
        reason: 'Accessing host, system, environment, or unrelated files outside core task documents is prohibited.',
        userMessage:
          '🚫 **Request Rejected (Security Policy):** Nexora AI cannot read, fetch, or expose system files, environment secrets, or files unrelated to your active task documents.',
      };
    }
  }

  for (const pattern of OFFICIAL_DOC_EDIT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        blocked: true,
        category: 'OFFICIAL_DOCUMENT_TAMPERING',
        reason: 'Editing, altering, or fabricating certificates or official government documents is strictly prohibited.',
        userMessage:
          '🚫 **Request Rejected (Compliance Policy):** Nexora AI strictly prohibits editing, altering, or fabricating academic certificates, transcripts, or official government documents (such as passports, visas, IDs, or permits). I can only draft/edit your CV, cover letter, business plan, or motivation letter.',
      };
    }
  }

  return { blocked: false };
}
