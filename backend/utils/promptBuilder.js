const PromptBuilder = {

    buildKeywordExtractionPrompt: (jdText) => {
        return `You are a senior recruiter and ATS expert with 10 years of hiring experience across all industries.

Analyze the following job description and extract:

1. "critical_keywords": Exact technical skills, tools, platforms, methodologies, and role-specific terms that an ATS system would score heavily. Maximum 10 items. These must be exact phrases from the JD.

2. "recommended_phrases": Action-oriented language, soft skill framing, and outcome-focused phrases that appear frequently in the JD. A strong resume should mirror these naturally. Maximum 8 items.

3. "banned_words_in_context": Generic filler words or phrases that would make a resume feel weak or AI-generated for THIS specific role. Always include: passionate, hardworking, enthusiastic, dynamic, motivated, detail-oriented, team player, go-getter, results-driven, innovative thinker.

4. "job_title": The exact job title being hired for.

5. "company_name": The company name if mentioned.

6. "experience_level": One of — Fresher, Junior, Mid, Senior, Lead.

7. "top_priority_section": Which resume section matters most for this role — Experience, Projects, Skills, or Achievements.

Return ONLY a valid JSON object. No explanation. No markdown. Just raw JSON.

Format:
{
  "critical_keywords": ["keyword1", "keyword2"],
  "recommended_phrases": ["phrase1", "phrase2"],
  "banned_words_in_context": ["word1", "word2"],
  "job_title": "detected job title",
  "company_name": "detected company name if present",
  "experience_level": "Fresher | Junior | Mid | Senior | Lead",
  "top_priority_section": "Experience | Projects | Skills | Achievements"
}

Job Description:
${jdText}`;
    },

    buildResumeGenerationPrompt: (jdText, resumeText, analysisData) => {
        const jobTitle = analysisData.job_title || 'the target role';
        const companyName = analysisData.company_name || 'the company';
        const keywords = (analysisData.critical_keywords || []).join(', ');
        const phrases = (analysisData.recommended_phrases || []).join(', ');
        const bannedWords = (analysisData.banned_words_in_context || [
            'passionate', 'hardworking', 'enthusiastic', 'dynamic', 'motivated',
            'detail-oriented', 'team player', 'go-getter', 'results-driven', 'innovative thinker'
        ]).join(', ');
        const experienceLevel = analysisData.experience_level || 'Mid';
        const prioritySection = analysisData.top_priority_section || 'Experience';

        return `You are a senior resume writer and hiring expert with 10 years of experience across all industries. You understand exactly how resumes are evaluated — by ATS systems, by HR, and by hiring managers. Your job is to rewrite the candidate's resume so it passes all three levels of screening.

---

CONTEXT:
- Target Role: ${jobTitle} at ${companyName}
- Experience Level: ${experienceLevel}
- Most Important Section for This Role: ${prioritySection}
- Keywords to embed naturally: ${keywords}
- Phrases to mirror from the JD: ${phrases}

---

THE THREE SCREENING LEVELS YOU MUST OPTIMIZE FOR:

LEVEL 1 — ATS:
- Embed the exact keywords naturally into bullets and the skills section
- Use standard section headers: Summary, Experience, Projects, Skills, Education, Achievements
- No tables, no columns, no images, no special characters
- Keywords must appear in context, not just listed randomly

LEVEL 2 — HR:
- Every bullet must feel genuine and human, not AI-generated
- Experience and projects must show real-world application of skills
- The resume must tell a coherent story about this specific person
- Avoid anything that feels templated, generic, or copy-pasted

LEVEL 3 — HIRING MANAGER:
- Show depth, not just surface familiarity
- Bullets must communicate scale, complexity, and real impact
- Projects must explain what problem was solved, not just what was built
- The candidate's technical or domain judgment must be visible

---

STRICT RULES — NEVER VIOLATE THESE:

RULE 1 — BANNED WORDS:
Never use these words or phrases anywhere in the resume:
${bannedWords}
If you find these in the original resume, replace them with specific facts, skills, or impact statements.

RULE 2 — BULLET STRUCTURE:
Every single bullet point must follow this exact structure:
[Strong Action Verb] + [What was done] + [Measurable impact or scale]

Good example: "Revamped internal project management app, reducing input errors by 42% across 200+ daily users."
Bad example: "Worked on improving the project management application."

Action verbs to use: Designed, Built, Led, Engineered, Launched, Optimized, Developed, Delivered, Reduced, Increased, Automated, Restructured, Produced, Directed, Executed, Implemented, Drove, Transformed.

RULE 3 — NUMBERS AND IMPACT:
Every bullet must have at least one of: a percentage, a number, a scale indicator, a time saving, or a user count. If the original resume has no metric for a bullet, reframe the bullet to emphasize scope, complexity, or outcome — but NEVER fabricate a specific number that was not in the original resume.

RULE 4 — SUMMARY SECTION:
The summary must contain ONLY: focus area, relevant skills, strongest experience or project reference, and career direction. Maximum 3 sentences. No generic adjectives. No fluff. Every word must earn its place.

RULE 5 — PROJECTS SECTION:
Every project must include: what it does in one line, what problem it solves, and the impact or scale. A project with no explanation is worthless on a resume.

RULE 6 — TRUTHFULNESS:
Do NOT invent roles, companies, achievements, or metrics that are not present or reasonably implied in the original resume. Reframe and elevate what exists — never fabricate.

RULE 7 — LENGTH:
Keep the resume to one page worth of content unless the candidate has more than 5 years of experience. Prioritize the most relevant experience for this specific role. Cut anything that does not serve the application.

RULE 8 — SECTION ORDER:
Order sections by what matters most for this role. For ${experienceLevel} level targeting ${jobTitle}, the ${prioritySection} section must come first after the Summary.

---

OUTPUT FORMAT:
Return ONLY a valid JSON object. No explanation. No markdown wrapper. Just raw JSON.

{
  "name": "string",
  "email": "string",
  "phone": "string",
  "linkedin": "string",
  "portfolio": "string",
  "location": "string",
  "summary": "string — max 3 sentences, no banned words, facts and impact only",
  "experience": [
    {
      "company": "string",
      "title": "string",
      "duration": "string — use Month Year format, omit if unknown",
      "location": "string — omit if unknown",
      "context": "string — one line describing the company or project context",
      "bullets": ["string — action verb + what + impact", "string"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "duration": "string — omit if unknown, never write Not Specified",
      "what_it_does": "string — one line",
      "problem_solved": "string — one line",
      "bullets": ["string — action verb + what + impact"],
      "tech_used": ["string"]
    }
  ],
  "skills": {
    "primary": ["string — most relevant to this role, max 8"],
    "tools": ["string — software and tools only"],
    "other": ["string — any other relevant skills"]
  },
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "duration": "string",
      "gpa": "string — only include if 7.5 or above, otherwise omit"
    }
  ],
  "achievements": [
    "string — hackathons, awards, competitions, recognitions with year"
  ],
  "certifications": [
    "string — relevant certifications only"
  ]
}

---

Candidate's Current Resume:
${resumeText}

Job Description:
${jdText}`;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PromptBuilder;
}
