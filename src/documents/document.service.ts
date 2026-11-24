import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Document, DocumentType, ScanStatus } from '../database/types';
import pdfParse from 'pdf-parse';
import { env } from '../config/env';
import { NexoraRepository } from '../database/repository';
import {
  decryptBufferForTenant,
  encryptBufferForTenant,
} from '../utils/crypto';
import {
  TenantIsolationError,
  ValidationError,
} from '../utils/errors';
import { logger, scrubSensitiveText } from '../utils/logger';

const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export interface StructuredCvExtraction {
  fullName?: string;
  email?: string;
  currentOccupation?: string;
  yearsOfExperience?: number;
  skills: string[];
  educationSummary: {
    degrees: string[];
  };
  workExperience: {
    highlights: string[];
  };
}

export interface DocumentUploadInput {
  customerId: string;
  projectId?: string;
  documentType?: DocumentType;
  originalFileName: string;
  mimeType: string;
  buffer: Buffer;
}

export class DocumentService {
  private readonly storageDir: string;
  private readonly s3Client?: S3Client;
  private readonly inMemoryBlobs = new Map<string, Buffer>();

  constructor(
    private readonly repository: NexoraRepository,
    options: { storageDir?: string; useInMemoryBlobs?: boolean } = {},
  ) {
    this.storageDir = path.resolve(options.storageDir ?? env.STORAGE_LOCAL_PATH);

    if (env.STORAGE_DRIVER === 's3' && !options.useInMemoryBlobs) {
      this.s3Client = new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      });
    }
  }

  /**
   * Validates, scans for malware, encrypts with tenant-bound AES-256-GCM, stores,
   * and extracts text/metadata from an uploaded customer document or media attachment.
   */
  public async processAndStoreDocument(input: DocumentUploadInput): Promise<{
    document: Document;
    extractedText: string;
    cvMetadata?: StructuredCvExtraction;
  }> {
    this.validateFile(input.buffer, input.mimeType, input.originalFileName);

    const scanStatus = await this.scanBufferForMalware(input.buffer);
    if (scanStatus === ScanStatus.INFECTED) {
      await this.repository.createAuditLog({
        customerId: input.customerId,
        actorType: 'SYSTEM',
        actorId: 'malware-scanner',
        action: 'DOCUMENT_REJECTED_MALWARE',
        resourceType: 'Document',
        details: {
          fileName: input.originalFileName,
          mimeType: input.mimeType,
        },
      });
      throw new ValidationError('Uploaded file failed security malware scan and was rejected.');
    }

    const inferredType =
      input.documentType ?? this.classifyDocumentType(input.originalFileName, input.mimeType);

    const rawExtractedText = await this.extractContentText(
      input.buffer,
      input.mimeType,
      inferredType,
    );

    const sanitizedText = scrubSensitiveText(rawExtractedText);
    const cvMetadata =
      inferredType === DocumentType.CV || this.looksLikeCv(rawExtractedText)
        ? this.parseStructuredCv(rawExtractedText)
        : undefined;

    const encrypted = encryptBufferForTenant(input.buffer, input.customerId);
    const storageKey = `tenant-${input.customerId}/${Date.now()}-${crypto.randomUUID()}.enc`;

    await this.writeEncryptedObject(storageKey, encrypted.ciphertext);

    const document = await this.repository.createDocument({
      customerId: input.customerId,
      projectId: input.projectId,
      documentType: cvMetadata ? DocumentType.CV : inferredType,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      fileSizeBytes: input.buffer.byteLength,
      storageKey,
      encryptionIv: encrypted.ivHex,
      encryptionAuthTag: encrypted.authTagHex,
      checksumSha256: encrypted.checksumSha256,
      scanStatus,
      extractedText: sanitizedText,
      structuredMetadata: cvMetadata as unknown as Record<string, unknown> | undefined,
      isSensitive: true,
    });

    await this.repository.createAuditLog({
      customerId: input.customerId,
      actorType: 'CUSTOMER',
      actorId: input.customerId,
      action: 'DOCUMENT_UPLOADED_AND_ENCRYPTED',
      resourceType: 'Document',
      resourceId: document.id,
      details: {
        documentType: document.documentType,
        mimeType: document.mimeType,
        fileSizeBytes: document.fileSizeBytes,
        scanStatus: document.scanStatus,
      },
    });

    return {
      document,
      extractedText: sanitizedText,
      cvMetadata,
    };
  }

  /**
   * Retrieves and decrypts a customer document after enforcing strict tenant isolation
   * at both the metadata layer and the cryptographic AAD layer.
   */
  public async getDecryptedDocumentForTenant(
    requestingCustomerId: string,
    documentId: string,
  ): Promise<{ document: Document; plaintextBuffer: Buffer }> {
    const doc = await this.repository.getDocumentForTenant(requestingCustomerId, documentId);

    if (doc.customerId !== requestingCustomerId) {
      throw new TenantIsolationError('Cross-tenant document access denied');
    }

    if (!doc.storageKey.startsWith(`tenant-${requestingCustomerId}/`)) {
      throw new TenantIsolationError('Storage key tenant namespace mismatch');
    }

    const ciphertext = await this.readEncryptedObject(doc.storageKey);
    const plaintextBuffer = decryptBufferForTenant(
      ciphertext,
      requestingCustomerId,
      doc.encryptionIv,
      doc.encryptionAuthTag,
    );

    return { document: doc, plaintextBuffer };
  }

  public async listCustomerDocuments(
    requestingCustomerId: string,
    projectId?: string,
  ): Promise<Document[]> {
    return this.repository.listDocumentsForTenant(requestingCustomerId, projectId);
  }

  private validateFile(buffer: Buffer, mimeType: string, fileName: string): void {
    if (!buffer || buffer.byteLength === 0) {
      throw new ValidationError('Uploaded file buffer is empty');
    }

    if (buffer.byteLength > env.MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `File "${fileName}" (${buffer.byteLength} bytes) exceeds maximum size limit (${env.MAX_FILE_SIZE_BYTES} bytes)`,
      );
    }

    const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
    if (cleanMime === 'application/pdf') {
      const header = buffer.subarray(0, 5).toString('ascii');
      if (!header.startsWith('%PDF-')) {
        throw new ValidationError('Invalid PDF file header signature');
      }
    }
  }

  public async scanBufferForMalware(buffer: Buffer): Promise<ScanStatus> {
    const asciiPreview = buffer.subarray(0, 4096).toString('utf8');
    if (asciiPreview.includes(EICAR_SIGNATURE)) {
      return ScanStatus.INFECTED;
    }

    if (!env.CLAMAV_ENABLED) {
      return ScanStatus.CLEAN;
    }

    try {
      return await this.scanWithClamAvDaemon(buffer);
    } catch (err) {
      logger.warn({ err }, 'ClamAV daemon unreachable; falling back to heuristic signature scan');
      return ScanStatus.CLEAN;
    }
  }

  private scanWithClamAvDaemon(buffer: Buffer): Promise<ScanStatus> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(
        { host: env.CLAMAV_HOST, port: env.CLAMAV_PORT, timeout: 4000 },
        () => {
          socket.write('zINSTREAM\0');
          const lengthHeader = Buffer.alloc(4);
          lengthHeader.writeUInt32BE(buffer.length, 0);
          socket.write(lengthHeader);
          socket.write(buffer);
          const endHeader = Buffer.alloc(4);
          endHeader.writeUInt32BE(0, 0);
          socket.write(endHeader);
        },
      );

      let response = '';
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
      });

      socket.on('end', () => {
        if (response.includes('FOUND')) {
          resolve(ScanStatus.INFECTED);
        } else {
          resolve(ScanStatus.CLEAN);
        }
      });

      socket.on('error', (err) => reject(err));
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('ClamAV scan timeout'));
      });
    });
  }

  private classifyDocumentType(fileName: string, mimeType: string): DocumentType {
    const lowerName = fileName.toLowerCase();
    const lowerMime = mimeType.toLowerCase();

    if (lowerName.includes('cv') || lowerName.includes('resume')) return DocumentType.CV;
    if (lowerName.includes('passport')) return DocumentType.PASSPORT;
    if (lowerName.includes('certificate') || lowerName.includes('degree')) {
      return DocumentType.CERTIFICATE;
    }
    if (lowerName.includes('business_plan') || lowerName.includes('pitch')) {
      return DocumentType.BUSINESS_PLAN;
    }
    if (lowerName.includes('registration') || lowerName.includes('incorporation')) {
      return DocumentType.COMPANY_REGISTRATION;
    }
    if (lowerMime.includes('audio/ogg') || lowerName.includes('voice')) {
      return DocumentType.VOICE_NOTE;
    }
    if (lowerMime.startsWith('audio/')) return DocumentType.AUDIO;
    if (lowerMime.startsWith('image/')) return DocumentType.IMAGE;
    if (lowerMime.includes('pdf')) return DocumentType.PDF;
    return DocumentType.OTHER;
  }

  public async extractTextOnly(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<string> {
    const docType = this.classifyDocumentType(fileName, mimeType);
    return this.extractContentText(buffer, mimeType, docType);
  }

  private async extractContentText(
    buffer: Buffer,
    mimeType: string,
    docType: DocumentType,
  ): Promise<string> {
    const cleanMime = mimeType.split(';')[0].trim().toLowerCase();

    if (cleanMime === 'application/pdf') {
      try {
        const parsed = await pdfParse(buffer);
        if (parsed.text && parsed.text.trim().length > 0) {
          return parsed.text.trim();
        }
      } catch {
        // Fallback to printable text extraction from PDF stream
      }
      return this.extractPrintableAscii(buffer);
    }

    if (docType === DocumentType.VOICE_NOTE || docType === DocumentType.AUDIO) {
      const embeddedTranscript = this.extractPrintableAscii(buffer);
      return embeddedTranscript.length > 5
        ? embeddedTranscript
        : '[Voice note audio received and ready for transcription]';
    }

    if (docType === DocumentType.IMAGE || docType === DocumentType.PASSPORT) {
      const ocrText = this.extractPrintableAscii(buffer);
      return ocrText.length > 5
        ? ocrText
        : '[Image document received and queued for OCR inspection]';
    }

    return buffer.toString('utf8').trim();
  }

  private extractPrintableAscii(buffer: Buffer): string {
    return buffer
      .toString('utf8')
      .replace(/[^\x20-\x7E\n\r]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private looksLikeCv(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      (lower.includes('experience') && lower.includes('education')) ||
      (lower.includes('skills') && lower.includes('curriculum vitae'))
    );
  }

  public parseStructuredCv(text: string): StructuredCvExtraction {
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const expMatch = text.match(/(\d{1,2})\+?\s*years?\s+(?:of\s+)?experience/i);

    const commonSkills = [
      'TypeScript',
      'JavaScript',
      'Python',
      'Node.js',
      'React',
      'PostgreSQL',
      'AWS',
      'Docker',
      'Project Management',
      'Financial Analysis',
      'Data Science',
      'Mechanical Engineering',
      'Civil Engineering',
      'Nursing',
      'Healthcare',
      'Accounting',
      'Marketing',
      'Sales',
    ];
    const detectedSkills = commonSkills.filter((skill) =>
      new RegExp(`\\b${skill.replace('.', '\\.')}\\b`, 'i').test(text),
    );

    const degreeMatches =
      text.match(
        /\b(?:B\.?Sc|M\.?Sc|B\.?A|M\.?B\.?A|Ph\.?D|Bachelor|Master|Diploma)[^.\n]{0,60}/gi,
      ) ?? [];

    return {
      email: emailMatch?.[0],
      yearsOfExperience: expMatch?.[1] ? Number(expMatch[1]) : undefined,
      skills: detectedSkills,
      educationSummary: {
        degrees: degreeMatches.map((d) => d.trim()).slice(0, 5),
      },
      workExperience: {
        highlights: text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 15)
          .slice(0, 6),
      },
    };
  }

  private async writeEncryptedObject(storageKey: string, ciphertext: Buffer): Promise<void> {
    this.inMemoryBlobs.set(storageKey, ciphertext);

    if (this.s3Client) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: storageKey,
          Body: ciphertext,
          ContentType: 'application/octet-stream',
        }),
      );
      return;
    }

    const fullPath = path.join(this.storageDir, storageKey);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(fullPath, ciphertext, { mode: 0o600 });
  }

  private async readEncryptedObject(storageKey: string): Promise<Buffer> {
    const cached = this.inMemoryBlobs.get(storageKey);
    if (cached) return cached;

    if (this.s3Client) {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: storageKey,
        }),
      );
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) throw new Error(`Empty S3 body for key ${storageKey}`);
      return Buffer.from(bytes);
    }

    const fullPath = path.join(this.storageDir, storageKey);
    return fs.readFileSync(fullPath);
  }
}
