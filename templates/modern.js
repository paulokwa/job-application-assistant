// templates/modern.js
// Template 2: Modern Clean

export const styles = `
  .resume-container {
    font-family: 'Inter', system-ui, sans-serif;
    color: #1a1a1a;
    line-height: 1.5;
    max-width: 800px;
    margin: 0 auto;
    background: #fff;
    font-size: 9pt;
    padding: 25pt 35pt;
  }
  .header {
    background: #f8fafc;
    padding: 30pt;
    border-radius: 8pt;
    margin-bottom: 20pt;
  }
  .header h1 {
    margin: 0;
    font-size: 28pt;
    font-weight: 800;
    color: var(--accent-color, #1e293b);
    line-height: 1.1;
  }
  .contact-info {
    font-size: 9.5pt;
    margin-top: 10pt;
    color: #64748b;
    display: flex;
    flex-wrap: wrap;
    gap: 12pt;
  }
  .contact-info div {
    display: flex;
    align-items: center;
    gap: 4pt;
  }
  .section {
    margin-bottom: 20pt;
    padding: 0 30pt;
  }
  .section-title {
    font-size: 13pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent-color, #3b82f6);
    margin-bottom: 10pt;
    display: flex;
    align-items: center;
    gap: 8pt;
  }
  .section-title::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #e2e8f0;
  }
  .summary {
    font-size: 10pt;
    color: #334155;
  }
  .item {
    margin-bottom: 15pt;
  }
  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 2pt;
  }
  .job-title {
    font-weight: 700;
    font-size: 11pt;
    color: #0f172a;
  }
  .date-range {
    font-size: 9pt;
    color: #64748b;
    font-weight: 500;
  }
  .company-info {
    font-weight: 500;
    font-size: 10pt;
    color: #475569;
    margin-bottom: 4pt;
  }
  .bullets {
    margin: 0;
    padding-left: 14pt;
    font-size: 9.5pt;
    color: #334155;
  }
  .bullets li {
    margin-bottom: 4pt;
  }
  .skills-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6pt;
  }
  .skill-pill {
    background: #f1f5f9;
    color: #475569;
    padding: 3pt 8pt;
    border-radius: 4pt;
    font-size: 9pt;
    font-weight: 500;
  }
`;

export function render(data) {
  const { personalInfo, summary, experience, education, skills, certifications, projects } = data;

  return `
    <div class="resume-container">
      <header class="header">
        <h1>${personalInfo.fullName}</h1>
        <div class="contact-info">
          ${ personalInfo.email ? `<div>${personalInfo.email}</div>` : '' }
          ${ personalInfo.phone ? `<div>${personalInfo.phone}</div>` : '' }
          ${ personalInfo.cityProvince ? `<div>${personalInfo.cityProvince}</div>` : '' }
          ${ personalInfo.linkedin ? `<div>LinkedIn</div>` : '' }
          ${ personalInfo.portfolio ? `<div>Portfolio</div>` : '' }
        </div>
      </header>

      ${summary ? `
        <section class="section">
          <h2 class="section-title no-orphan">Summary</h2>
          <div class="summary">${summary}</div>
        </section>
      ` : ''}

      ${experience.length ? `
        <section class="section">
          <h2 class="section-title no-orphan">Experience</h2>
          ${experience.map(exp => `
            <div class="item keep-together">
              <div class="item-header">
                <span class="job-title">${exp.jobTitle}</span>
                <span class="date-range">${exp.startDate} – ${exp.endDate}</span>
              </div>
              <div class="company-info">${exp.employer} • ${exp.location}</div>
              <ul class="bullets">
                ${exp.bulletPoints.map(bullet => `<li>${bullet}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${skills.length ? `
        <section class="section keep-together">
          <h2 class="section-title no-orphan">Skills</h2>
          <div class="skills-container">
            ${skills.map(skill => `<span class="skill-pill">${skill}</span>`).join('')}
          </div>
        </section>
      ` : ''}

      ${education.length ? `
        <section class="section">
          <h2 class="section-title no-orphan">Education</h2>
          ${education.map(edu => `
            <div class="item keep-together">
              <div class="item-header">
                <span class="job-title">${edu.credential}</span>
                <span class="date-range">${edu.dates}</span>
              </div>
              <div class="company-info">${edu.institution} • ${edu.location}</div>
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${projects.length ? `
        <section class="section">
          <h2 class="section-title no-orphan">Projects</h2>
          ${projects.map(proj => `
            <div class="item keep-together">
              <div class="item-header">
                <span class="job-title">${proj.name}</span>
                <span class="date-range">${proj.role}</span>
              </div>
              <div class="summary" style="margin-top:4pt;">${proj.description}</div>
              <div class="skills-container" style="margin-top:6pt;">
                ${proj.technologies.map(tech => `<span class="skill-pill">${tech}</span>`).join('')}
              </div>
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
    <div class="resume-container">
      <header class="header">
        <h1>${personalInfo.fullName}</h1>
        <div class="contact-info">
          ${personalInfo.email ? `<div>${personalInfo.email}</div>` : ''}
          ${personalInfo.phone ? `<div>${personalInfo.phone}</div>` : ''}
          ${personalInfo.cityProvince ? `<div>${personalInfo.cityProvince}</div>` : ''}
        </div>
      </header>

      <section class="section" style="padding-top: 0;">
        <div style="margin-bottom: 24pt; color: #64748b; font-weight: 500;">${today}</div>
        
        <div style="font-size: 11pt; color: #0f172a; margin-bottom: 16pt; font-weight: 600;">
          ${content.greeting || 'Dear Hiring Manager,'}
        </div>

        <div style="font-size: 10.5pt; color: #334155; line-height: 1.6;">
          ${content.paragraphs.map((p, i, arr) => `<p style="margin: 0 0 ${i < arr.length - 1 ? '14pt' : '0'} 0;">${p}</p>`).join('')}
        </div>

        <div class="keep-together" style="margin-top: 16pt; color: #1e293b;">
          <div style="margin-bottom: 8pt; font-size: 10.5pt; color: #334155; line-height: 1.6;">${content.closing || 'Best regards,'}</div>
          <div style="font-size: 12pt; font-weight: 700;">${content.signOff || personalInfo.fullName}</div>
        </div>
      </section>
    </div>
  `;
}
