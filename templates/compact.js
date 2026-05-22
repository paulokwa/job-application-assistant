// templates/compact.js
// Template 4: Compact / Dense One-Page

export const styles = `
  .resume-container {
    font-family: 'Inter', sans-serif;
    color: #111;
    line-height: 1.25;
    max-width: 800px;
    margin: 0 auto;
    background: #fff;
    font-size: 9pt;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid var(--accent-color, #000);
    padding-bottom: 4pt;
    margin-bottom: 8pt;
  }
  .header h1 {
    margin: 0;
    font-size: 18pt;
    font-weight: 800;
    text-transform: uppercase;
  }
  .contact-info {
    text-align: right;
    font-size: 8pt;
    color: #444;
  }
  .section {
    margin-bottom: 8pt;
  }
  .section-title {
    font-size: 10pt;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--accent-color, #000);
    background: #f1f5f9;
    padding: 2pt 4pt;
    margin-bottom: 4pt;
  }
  .item {
    margin-bottom: 4pt;
  }
  .item-header {
    display: flex;
    justify-content: space-between;
    font-weight: 700;
  }
  .bullets {
    margin: 0;
    padding-left: 12pt;
  }
  .bullets li {
    margin-bottom: 1pt;
  }
  .skills-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2pt;
  }
`;

export function render(data) {
  const { personalInfo, summary, experience, education, skills, certifications, projects } = data;

  return `
    <div class="resume-container">
      <header class="header">
        <h1>${personalInfo.fullName}</h1>
        <div class="contact-info">
          ${[personalInfo.email, personalInfo.phone, personalInfo.cityProvince].filter(Boolean).join(' | ')}<br>
          ${[personalInfo.linkedin, personalInfo.portfolio].filter(Boolean).join(' | ')}
        </div>
      </header>

      ${summary ? `
        <div class="section" style="margin-top: 4pt;">
          <div style="font-style: italic;">${summary}</div>
        </div>
      ` : ''}

      ${experience.length ? `
        <section class="section">
          <h2 class="section-title no-orphan">Experience</h2>
          ${experience.map(exp => `
            <div class="item keep-together">
              <div class="item-header">
                <span>${exp.jobTitle} @ ${exp.employer}</span>
                <span>${exp.startDate} – ${exp.endDate}</span>
              </div>
              <ul class="bullets">
                ${exp.bulletPoints.map(b => `<li>${b}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </section>
      ` : ''}

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10pt;">
        ${education.length ? `
          <section class="section">
            <h2 class="section-title no-orphan">Education</h2>
            ${education.map(edu => `
              <div class="item keep-together">
                <div style="font-weight:700;">${edu.institution}</div>
                <div>${edu.credential}${edu.dates ? ` | ${edu.dates}` : ''}</div>
              </div>
            `).join('')}
          </section>
        ` : ''}

        ${skills.length ? `
          <section class="section keep-together">
            <h2 class="section-title no-orphan">Skills</h2>
            <div class="skills-grid">
              ${skills.map(s => `<div>• ${s}</div>`).join('')}
            </div>
          </section>
        ` : ''}
      </div>

      ${projects.length ? `
        <section class="section">
          <h2 class="section-title no-orphan">Key Projects</h2>
          ${projects.map(proj => `
            <div class="item keep-together" style="margin-bottom: 2pt;">
              <strong>${proj.name}</strong> – ${proj.description}
            </div>
          `).join('')}
        </section>
      ` : ''}
    </div>
  `;
}

export function renderCoverLetter(data) {
  const { personalInfo, content } = data;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `
    <div class="resume-container" style="padding: 40pt;">
      <header class="header">
        <h1>${personalInfo.fullName}</h1>
        <div class="contact-info">
          ${[personalInfo.email, personalInfo.phone, personalInfo.cityProvince].filter(Boolean).join(' | ')}
        </div>
      </header>

      <div style="margin-top: 20pt;">
        <div style="margin-bottom: 15pt; color: #666;">${today}</div>
        
        <div style="font-weight: 800; margin-bottom: 12pt; text-transform: uppercase; color: var(--accent-color, #000);">
          ${content.greeting || 'Dear Hiring Manager,'}
        </div>

        <div style="line-height: 1.4;">
          ${content.paragraphs.map(p => `<p style="margin-bottom: 10pt;">${p}</p>`).join('')}
        </div>

        <div class="keep-together" style="margin-top: 30pt;">
          <strong>${content.closing || 'Sincerely,'}</strong><br>
          <span style="font-weight: 800; text-transform: uppercase;">${content.signOff || personalInfo.fullName}</span>
        </div>
      </div>
    </div>
  `;
}
