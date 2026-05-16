// modules/renderer.js
// Central rendering engine for HTML templates.

import * as classic from '../templates/classic.js';
import * as modern from '../templates/modern.js';
import * as sidebar from '../templates/sidebar.js';
import * as compact from '../templates/compact.js';
import { esc, escapeHtmlStrings } from './html.js';

const templates = {
  classic,
  modern,
  sidebar,
  compact
};

export function getSpacingCss(spacingMode = 'standard') {
  return spacingMode === 'compact' ? `
          .resume-container { font-size: 0.9em; }
          .section { margin-bottom: 8pt; }
          .item { margin-bottom: 6pt; }
          .bullets li { margin-bottom: 1pt; }
        ` : '';
}

function safeHexColor(value, fallback = '#2563eb') {
  const color = String(value || '').trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : fallback;
}

/**
 * Renders a full HTML document for a resume or cover letter.
 * @param {string} templateId - 'classic' | 'modern' | 'sidebar' | 'compact'
 * @param {string} type - 'resume' | 'cover-letter'
 * @param {ResumeContent} data - Structured data
 * @param {Object} options - { accentColor, spacingMode }
 */
export function renderDocument(templateId, type, data, options = {}) {
  const template = templates[templateId] || templates.classic;
  const accentColor = safeHexColor(options.accentColor || data.metadata?.accentColor);
  const spacingMode = options.spacingMode || data.metadata?.spacingMode || 'standard';
  const safeData = escapeHtmlStrings(data);

  const contentHtml = type === 'resume'
    ? template.render(safeData)
    : template.renderCoverLetter(safeData);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light">
      <title>${type === 'resume' ? 'Resume' : 'Cover Letter'} - ${esc(data.personalInfo?.fullName)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        :root {
          --accent-color: ${accentColor};
          --spacing-factor: ${spacingMode === 'compact' ? '0.8' : '1.0'};
        }
        html, body {
          color-scheme: light !important;
          background: transparent !important; /* Let parent background show through slightly if needed, or use white */
          color: #1a1a1a !important;
          margin: 0;
          padding: 20px 0; /* Vertical breathing room */
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          min-height: 100%;
        }
        * {
          box-sizing: border-box;
        }
        
        .page-preview {
          background: white;
          width: 100%;
          max-width: 8.5in;
          min-height: 11in;
          padding: 0.5in;
          box-shadow: 0 4px 15px rgba(0,0,0,0.15);
          margin: 0 auto;
          overflow: hidden;
          position: relative;
        }

        ${template.styles}

        .keep-together {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        
        .no-orphan {
          page-break-after: avoid;
          break-after: avoid;
        }

        @media print {
          body { 
            background: white !important; 
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }
          .page-preview {
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            width: 100% !important;
            min-height: 0 !important;
            background: white !important;
          }
          @page {
            margin: 0.5in;
            size: letter;
          }
        }
      </style>
      <style id="jpda-spacing-style">${getSpacingCss(spacingMode)}</style>
    </head>
    <body>
      <div class="page-preview">
        ${contentHtml}
      </div>
    </body>
    </html>
  `;
}
/**
 * Renders a full HTML document containing both Resume and Cover Letter.
 * @param {string} templateId 
 * @param {Object} resumeData 
 * @param {Object} clData 
 * @param {Object} options 
 */
export function renderMergedDocument(templateId, resumeData, clData, options = {}) {
  const template = templates[templateId] || templates.classic;
  const accentColor = safeHexColor(options.accentColor);
  const spacingMode = options.spacingMode || 'standard';
  const safeResumeData = escapeHtmlStrings(resumeData);
  const safeClData = escapeHtmlStrings(clData);

  const resumeHtml = template.render(safeResumeData);
  const clHtml = template.renderCoverLetter(safeClData);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light">
      <title>Merged Documents - ${esc(resumeData.personalInfo?.fullName)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        :root {
          --accent-color: ${accentColor};
          --spacing-factor: ${spacingMode === 'compact' ? '0.8' : '1.0'};
        }
        html, body {
          color-scheme: light !important;
          background: transparent !important;
          color: #1a1a1a !important;
          margin: 0;
          padding: 20px 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          min-height: 100%;
        }
        * {
          box-sizing: border-box;
        }
        
        .page-preview {
          background: white;
          width: 100%;
          max-width: 8.5in;
          min-height: 11in;
          padding: 0.5in;
          box-shadow: 0 4px 15px rgba(0,0,0,0.15);
          margin: 0 auto 24px auto; /* Margin between pages in preview */
          overflow: hidden;
          position: relative;
        }

        .page-preview:last-child {
          margin-bottom: 0;
        }

        ${template.styles}

        .keep-together {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        
        .no-orphan {
          page-break-after: avoid;
          break-after: avoid;
        }

        @media print {
          body { 
            background: white !important; 
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }
          .page-preview {
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            width: 100% !important;
            min-height: 0 !important;
            background: white !important;
            page-break-after: always;
            break-after: always;
          }
          .page-preview:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
          @page {
            margin: 0.5in;
            size: letter;
          }
        }
      </style>
      <style id="jpda-spacing-style">${getSpacingCss(spacingMode)}</style>
    </head>
    <body>
      <div class="page-preview">
        ${resumeHtml}
      </div>
      <div class="page-preview">
        ${clHtml}
      </div>
    </body>
    </html>
  `;
}
