import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import { documentGeneratorService } from '../src/tools/document-generator.service';

const JAMES_PHIRI_CV_MARKDOWN = `# 📄 CURRICULUM VITAE — James Phiri

## 🎯 Target Role
Senior Software Developer

## 📍 Location & Availability
South Africa | Open to USA, Canada, China & Remote

## 📞 Contact
- Phone: +27 65 801 6132
- Email: jamesphiriog@gmail.com

## 👤 Professional Summary
Senior Software Developer with over 8 years of experience building scalable web and mobile applications using React, JavaScript, AWS, and React Native.

## 🛠️ Core Technical Skills
- React
- JavaScript
- AWS
- React Native

## 💼 Work Experience

### MTN — Senior Software Developer
**2024–2026**
- Architected and maintained telecommunications web and mobile platforms using React, React Native, and AWS.

### Dark Pool — Software Developer
**2023–2024**
- Developed front-end and mobile application features using React and React Native.

### African Bank — Software Developer
**2021–2022**
- Built production banking interfaces with React and JavaScript.

### Motor Accident Group — Software Developer
**2018–2021**
- Delivered full-lifecycle web and mobile software applications.

## 🎓 Education
- Diploma in Applied Information Technology`;

describe('End-to-End CV PDF Generation', () => {
  it('compiles James Phiri CV Markdown (with ### Company subheadings) into a complete PDF with all 4 employers', async () => {
    const result = await documentGeneratorService.generateCvPdfFromMarkdown(
      JAMES_PHIRI_CV_MARKDOWN,
    );

    expect(result.fileName).toMatch(/^james_phiri_cv_\d+\.pdf$/);
    expect(result.downloadUrl).toBe(`/api/v1/documents/download/${result.fileName}`);
    expect(result.fileSizeBytes).toBeGreaterThan(5000);

    const fileBuffer = await fs.readFile(result.filePath);
    expect(fileBuffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');

    const parsed = await pdfParse(fileBuffer);
    expect(parsed.text).toContain('MTN');
    expect(parsed.text).toContain('Dark Pool');
    expect(parsed.text).toContain('African Bank');
    expect(parsed.text).toContain('Motor Accident Group');
    expect(parsed.text).toContain('Diploma in Applied Information Technology');
    expect(parsed.text).not.toContain('University of Zimbabwe');
    expect(parsed.text).not.toContain('Verified Industry Experience');

    // Clean up test artifact
    await fs.unlink(result.filePath).catch(() => {});
  }, 30000);
});
