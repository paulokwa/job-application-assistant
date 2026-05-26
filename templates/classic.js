// templates/classic.js
// Template 1: Classic Professional

export const styles = `
  .resume-container {
    font-family: 'Inter', system-ui, sans-serif;
    color: #1a1a1a;
    line-height: 1.5;
    max-width: 800px;
    margin: 0 auto;
    background: #fff;
    padding: 30pt 45pt;
  }
  .header {
    text-align: center;
    border-bottom: 1.5pt solid #000;
    margin-bottom: 15pt;
    padding-bottom: 5pt;
  }
  .header h1 {
    font-family: 'Outfit', sans-serif;
    margin: 0;
    font-size: 26pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5pt;
    color: var(--accent-color, #000);
  }
  .contact-info {
    font-size: 10pt;
    margin-top: 5pt;
  }
  .contact-info span:not(:last-child)::after {
    content: " | ";
    margin: 0 4pt;
  }
  .section {
    margin-bottom: 12pt;
  }
  .section-title {
    font-size: 12pt;
    font-weight: bold;
    text-transform: uppercase;
    border-bottom: 0.5pt solid #ccc;
    margin-bottom: 6pt;
    color: var(--accent-color, #000);
  }
  .summary {
    font-size: 10.5pt;
    text-align: justify;
  }
  .item {
    margin-bottom: 10pt;
  }
  .item-header {
    display: flex;
    justify-content: space-between;
    font-weight: bold;
    font-size: 11pt;
  }
  .item-subheader {
    display: flex;
    justify-content: space-between;
    font-style: italic;
    font-size: 10.5pt;
    margin-bottom: 2pt;
  }
  .bullets {
    margin: 0;
    padding-left: 15pt;
    font-size: 10.5pt;
  }
  .bullets li {
    margin-bottom: 2pt;
  }
  .skills-list {
    font-size: 10.5pt;
  }
  
  @media print {
    .resume-container {
      max-width: 100%;
      margin: 0;
      padding: 0;
    }
  }
`;

export function render(data) {
  const { personalInfo, summary, experience, education, skills, certifications, projects } = data;

  const contactItems = [
    personalInfo.email,
    personalInfo.phone,
    personalInfo.cityProvince,
    personalInfo.linkedin,
    personalInfo.portfolio,
    personalInfo.website
  ].filter(Boolean);

  return `
    <div class="resume-container">
      <header class="header">
        <h1>${personalInfo.fullName}</h1>
        <div class="contact-info">
          ${contactItems.map(item => `<span>${item}</span>`).join('')}
        </div>
      </header>

      ${summary ? `
        <section class="section">
          <h2 class="section-title no-orphan">Professional Summary</h2>
          <div class="summary">${summary}</div>
        </section>
      ` : ''}

      ${experience.length ? `
        <section class="section">
          <h2 class="section-title no-orphan">Experience</h2>
          ${experience.map(exp => `
            <div class="item keep-together">
              <div class="item-header">
                <span>${exp.jobTitle}</span>
                <span>${exp.startDate} – ${exp.endDate}</span>
              </div>
              <div class="item-subheader">
                <span>${exp.employer}</span>
                <span>${exp.location}</span>
              </div>
              <ul class="bullets">
                ${exp.bulletPoints.map(bullet => `<li>${bullet}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${education.length ? `
        <section class="section">
          <h2 class="section-title no-orphan">Education</h2>
          ${education.map(edu => `
            <div class="item keep-together">
              <div class="item-header">
                <span>${edu.institution}</span>
                <span>${edu.dates}</span>
              </div>
              <div class="item-subheader">
                <span>${edu.credential}</span>
                <span>${edu.location}</span>
              </div>
              ${edu.notes.length ? `<ul class="bullets">${edu.notes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
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
                <span>${proj.name}</span>
                <span>${proj.role}</span>
              </div>
              <div class="summary" style="margin-top:2pt;">${proj.description}</div>
              ${proj.technologies.length ? `<div class="skills-list" style="margin-top:2pt;"><strong>Technologies:</strong> ${proj.technologies.join(', ')}</div>` : ''}
            </div>
          `).join('')}
        </section>
      ` : ''}

      ${skills.length ? `
        <section class="section keep-together">
          <h2 class="section-title no-orphan">Skills</h2>
          <div class="skills-list">${skills.join(', ')}</div>
        </section>
      ` : ''}

      ${certifications.length ? `
        <section class="section keep-together">
          <h2 class="section-title no-orphan">Certifications</h2>
          <ul class="bullets">
            ${certifications.map(cert => `<li>${cert}</li>`).join('')}
          </ul>
        </section>
      ` : ''}
    </div>
  `;
}

export function renderCoverLetter(data) {
  const { personalInfo, content } = data;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const contactItems = [
    personalInfo.email,
    personalInfo.phone,
    personalInfo.cityProvince,
    personalInfo.linkedin,
    personalInfo.portfolio,
    personalInfo.website
  ].filter(Boolean);

  return `
    <div class="resume-container">
      <header class="header">
        <h1>${personalInfo.fullName}</h1>
        <div class="contact-info">
          ${contactItems.map(item => `<span>${item}</span>`).join('')}
        </div>
      </header>
      
      <div style="margin-top: 30pt; font-size: 11pt; color: #333;">
        <div style="margin-bottom: 25pt; color: #666; font-weight: 500;">${today}</div>
        
        <div style="margin-bottom: 15pt; font-weight: 600; font-size: 12pt;">
          ${content.greeting || 'Dear Hiring Manager,'}
        </div>
 
        <div>
          ${content.paragraphs.map((p, i, arr) => `<p style="margin: 0 0 ${i < arr.length - 1 ? '15pt' : '0'} 0; text-align: justify; line-height: 1.6;">${p}</p>`).join('')}
        </div>
 
        <div class="keep-together" style="margin-top: 20pt;">
          <div style="margin-bottom: 5pt;">${content.closing || 'Sincerely,'}</div>
          <strong style="font-size: 12pt; color: #1a1a1a;">${content.signOff || personalInfo.fullName}</strong>
        </div>
      </div>
    </div>
  `;
}
