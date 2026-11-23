import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { previewApplicationEmailHtml } from '../src/tools/email.service';

/**
 * Generates an email HTML preview using dummy data and opens it in the browser.
 * No email is ever sent.
 */
function openEmailPreviewInBrowser(): void {
  const html = previewApplicationEmailHtml();
  const outDir = path.resolve(process.cwd(), 'storage');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'email-preview.html');
  fs.writeFileSync(outPath, html, 'utf8');

  const cmd =
    process.platform === 'darwin'
      ? `open "${outPath}"`
      : process.platform === 'win32'
        ? `start "" "${outPath}"`
        : `xdg-open "${outPath}"`;

  exec(cmd, (err) => {
    if (err) {
      console.log(`Preview written to: ${outPath}`);
    } else {
      console.log(`Opened email preview in browser: ${outPath}`);
    }
  });
}

openEmailPreviewInBrowser();
