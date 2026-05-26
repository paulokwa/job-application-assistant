// templates/sidebar.js
// Template 3: Sidebar / Two-Column

export const styles = `
  .resume-container {
    font-family: Arial, sans-serif;
    color: #334155;
    line-height: 1.5;
    max-width: 850px;
    margin: 0 auto;
    background: #fff;
    display: flex;
    min-height: 11in;
  }
  .sidebar {
    width: 30%;
    background: #f8fafc;
    border-right: 1px solid #e2e8f0;
    padding: 30pt 20pt;
    display: flex;
    flex-direction: column;
    gap: 20pt;
  }
  .main-content {
    width: 70%;
    padding: 30pt 40pt;
    display: flex;
    flex-direction: column;
    gap: 20pt;
  }
  .header h1 {
    margin: 0;
    font-size: 24pt;
    font-weight: 700;
    color: var(--accent-color, #0f172a);
    line-height: 1.1;
  }
  .header .job-title-top {
    font-size: 12pt;
    font-weight: 500;
    color: var(--accent-color, #3b82f6);
    margin-top: 4pt;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .sidebar-section-title {
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
    margin-bottom: 8pt;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 4pt;
  }
  .contact-list {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 9pt;
    display: flex;
    flex-direction: column;
    gap: 8pt;
  }
  .contact-list li {
    word-break: break-all;
  }
  .main-section-title {
    font-size: 14pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 12pt;
    display: flex;
    align-items: center;
    gap: 10pt;
  }
  .main-section-title::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #e2e8f0;
  }
  .summary {
    font-size: 10pt;
    color: #475569;
  }
  .experience-item {
    margin-bottom: 18pt;
  }
  .exp-header {
    display: flex;
    justify-content: space-between;
    font-weight: 700;
    font-size: 11pt;
    color: #1e293b;
  }
  .exp-sub {
    font-size: 9.5pt;
    color: #64748b;
    margin-bottom: 6pt;
  }
  .bullets {
    padding-left: 14pt;
    margin: 0;
    font-size: 9.5pt;
    color: #334155;
  }
  .bullets li {
    margin-bottom: 4pt;
  }
  .pill-container {
    display: flex;
    flex-wrap: wrap;
    gap: 4pt;
  }
  .pill {
    background: #edf2f7;
    color: #4a5568;
    padding: 2pt 6pt;
    border-radius: 3pt;
    font-size: 8.5pt;
    font-weight: 500;
  }
`;

export function render(data) {
  const { personalInfo, headline, summary, experience, education, skills, certifications, projects } = data;

  return `
    <div class="resume-container">
      <aside class="sidebar">
        <div class="sidebar-section keep-together">
          <h2 class="sidebar-section-title">Contact</h2>
          <ul class="contact-list">
            ${personalInfo.email ? `<li><strong>Email:</strong><br>${personalInfo.email}</li>` : ''}
            ${personalInfo.phone ? `<li><strong>Phone:</strong><br>${personalInfo.phone}</li>` : ''}
            ${personalInfo.cityProvince ? `<li><strong>Location:</strong><br>${personalInfo.cityProvince}</li>` : ''}
            ${personalInfo.linkedin ? `<li><strong>LinkedIn:</strong><br>${personalInfo.linkedin}</li>` : ''}
          </ul>
        </div>

        ${skills.length ? `
          <div class="sidebar-section keep-together">
            <h2 class="sidebar-section-title">Expertise</h2>
            <div class="pill-container">
              ${skills.map(s => `<span class="pill">${s}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        ${education.length ? `
          <div class="sidebar-section keep-together">
            <h2 class="sidebar-section-title">Education</h2>
            ${education.map(edu => `
              <div style="margin-bottom:10pt; font-size:9pt;">
                <div style="font-weight:700; color:#1e293b;">${edu.credential}</div>
                <div style="color:#64748b;">${edu.institution}</div>
                <div style="font-size:8pt;">${edu.dates}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${certifications.length ? `
          <div class="sidebar-section keep-together">
            <h2 class="sidebar-section-title">Certs</h2>
            <ul class="contact-list">
              ${certifications.map(c => `<li>${c}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </aside>

      <main class="main-content">
        <header class="header">
          <h1>${personalInfo.fullName}</h1>
          <div class="job-title-top">${headline || experience[0]?.jobTitle || 'Professional'}</div>
        </header>

        ${summary ? `
          <section class="keep-together">
            <h2 class="main-section-title no-orphan">About Me</h2>
            <div class="summary">${summary}</div>
          </section>
        ` : ''}

        ${experience.length ? `
          <section>
            <h2 class="main-section-title no-orphan">Professional Experience</h2>
            ${experience.map(exp => `
              <div class="experience-item keep-together">
                <div class="exp-header">
                  <span>${exp.jobTitle}</span>
                  <span style="font-size:9pt; color:#64748b;">${exp.startDate} – ${exp.endDate}</span>
                </div>
                <div class="exp-sub">${exp.employer} • ${exp.location}</div>
                <ul class="bullets">
                  ${exp.bulletPoints.map(b => `<li>${b}</li>`).join('')}
                </ul>
              </div>
            `).join('')}
          </section>
        ` : ''}

        ${projects.length ? `
          <section>
            <h2 class="main-section-title no-orphan">Key Projects</h2>
            ${projects.map(proj => `
              <div class="experience-item keep-together">
                <div class="exp-header">
                  <span>${proj.name}</span>
                  <span style="font-size:9pt; color:#64748b;">${proj.role}</span>
                </div>
                <div class="summary" style="margin-top:4pt;">${proj.description}</div>
                <div class="pill-container" style="margin-top:6pt;">
                  ${proj.technologies.map(t => `<span class="pill">${t}</span>`).join('')}
                </div>
              </div>
            `).join('')}
          </section>
        ` : ''}
      </main>
    </div>
  `;
}

export function renderCoverLetter(data) {
  const { personalInfo, content } = data;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `
    <div class="resume-container">
      <aside class="sidebar">
        <div class="sidebar-section">
          <h2 class="sidebar-section-title">Contact</h2>
          <ul class="contact-list">
            ${personalInfo.email ? `<li><strong>Email:</strong><br>${personalInfo.email}</li>` : ''}
            ${personalInfo.phone ? `<li><strong>Phone:</strong><br>${personalInfo.phone}</li>` : ''}
            ${personalInfo.cityProvince ? `<li><strong>Location:</strong><br>${personalInfo.cityProvince}</li>` : ''}
          </ul>
        </div>
      </aside>

      <main class="main-content">
        <header class="header" style="margin-bottom: 40pt;">
          <h1>${personalInfo.fullName}</h1>
          <div class="job-title-top">Cover Letter</div>
        </header>

        <div style="color: #64748b; margin-bottom: 20pt;">${today}</div>

        <div style="font-weight: 700; color: #0f172a; margin-bottom: 20pt; font-size: 12pt;">
          ${content.greeting || 'Dear Hiring Manager,'}
        </div>

        <div class="summary" style="font-size: 10.5pt;">
          ${content.paragraphs.map((p, i, arr) => `<p style="margin: 0 0 ${i < arr.length - 1 ? '15pt' : '0'} 0;">${p}</p>`).join('')}
        </div>

        <div class="keep-together" style="margin-top: 0;">
          <div style="margin-bottom: 8pt; font-size: 10.5pt; color: #475569; line-height: 1.6;">${content.closing || 'Sincerely,'}</div>
          <div style="font-weight: 700; color: #0f172a; font-size: 12pt;">${content.signOff || personalInfo.fullName}</div>
        </div>
      </main>
    </div>
  `;
}
