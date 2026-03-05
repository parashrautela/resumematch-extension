require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const PDFDocument = require('pdfkit');
const PromptBuilder = require('./utils/promptBuilder');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.post('/api/analyze', async (req, res) => {
    try {
        const { jdText } = req.body;

        if (!jdText) {
            return res.status(400).json({ error: "Missing jdText" });
        }

        const promptText = PromptBuilder.buildKeywordExtractionPrompt(jdText);

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: promptText }],
            response_format: { type: "json_object" }
        });

        const responseText = response.choices[0].message.content;
        let cleanJsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanJsonStr);

        res.json({ data });
    } catch (error) {
        console.error("Analysis Error:", error);
        res.status(500).json({ error: "Failed to analyze job description" });
    }
});

app.post('/api/generate', async (req, res) => {
    try {
        const { jdText, resumeText, analysisData } = req.body;

        if (!jdText || !resumeText || !analysisData) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const promptText = PromptBuilder.buildResumeGenerationPrompt(jdText, resumeText, analysisData);

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: promptText }],
            response_format: { type: "json_object" }
        });

        const responseText = response.choices[0].message.content;
        let cleanJsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const resumeData = JSON.parse(cleanJsonStr);

        res.json({ resume: resumeData });
    } catch (error) {
        console.error("Generation Error:", error);
        res.status(500).json({ error: "Failed to generate tailored resume" });
    }
});

// ──────────────────────────────────────────────────────────
// V2: Project Extraction — detect projects from resume text
// ──────────────────────────────────────────────────────────
app.post('/api/extract-projects', async (req, res) => {
    try {
        const { resumeText } = req.body;

        if (!resumeText) {
            return res.status(400).json({ error: "Missing resumeText" });
        }

        const truncatedResume = resumeText.substring(0, 15000);
        const promptText = PromptBuilder.buildProjectExtractionPrompt(truncatedResume);

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: promptText }],
            response_format: { type: "json_object" }
        });

        const responseText = response.choices[0].message.content;
        let cleanJsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanJsonStr);

        res.json({ projects: data.projects || [] });
    } catch (error) {
        console.error("Project Extraction Error:", error);
        res.status(500).json({ error: "Failed to extract projects from resume" });
    }
});

// ──────────────────────────────────────────────────────────
// V2: Question Generation — generate interview questions per project
// ──────────────────────────────────────────────────────────
app.post('/api/generate-questions', async (req, res) => {
    try {
        const { projectName, projectSummary } = req.body;

        if (!projectName || !projectSummary) {
            return res.status(400).json({ error: "Missing projectName or projectSummary" });
        }

        const promptText = PromptBuilder.buildQuestionGenerationPrompt(projectName, projectSummary);

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: promptText }],
            response_format: { type: "json_object" }
        });

        const responseText = response.choices[0].message.content;
        let cleanJsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanJsonStr);

        res.json({ questions: data.questions || [] });
    } catch (error) {
        console.error("Question Generation Error:", error);
        res.status(500).json({ error: "Failed to generate questions" });
    }
});

// ──────────────────────────────────────────────────────────
// PDF Generation endpoint — accepts structured JSON resume
// ──────────────────────────────────────────────────────────
app.post('/api/pdf', (req, res) => {
    try {
        const resume = req.body;

        if (!resume || !resume.name) {
            return res.status(400).json({ error: "Missing resume data" });
        }

        // Layout constants (US Letter, 0.75 inch margins)
        const MARGIN = 54;           // 0.75 inch = 54 points
        const PAGE_WIDTH = 612;      // US Letter width in points
        const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
        const LINE_GAP = 1.5;
        const BULLET_INDENT = 14.4;  // 0.2 inch
        const SECTION_SPACE_ABOVE = 8;
        const BULLET_GAP = 4;

        const doc = new PDFDocument({
            size: 'LETTER',
            margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
        doc.pipe(res);

        // ── Name ──
        doc.font('Helvetica-Bold').fontSize(18).fillColor('black')
            .text(resume.name, { align: 'center', lineGap: LINE_GAP });

        // ── Contact Line ──
        const contactParts = [
            resume.email,
            resume.phone,
            resume.linkedin,
            resume.portfolio,
            resume.location
        ].filter(Boolean);

        if (contactParts.length > 0) {
            doc.moveDown(0.3);
            doc.font('Helvetica').fontSize(10).fillColor('black')
                .text(contactParts.join('  |  '), { align: 'center', lineGap: LINE_GAP });
        }

        // ── Helper: Section Header ──
        function drawSectionHeader(title) {
            doc.moveDown(0.6);
            doc.y += SECTION_SPACE_ABOVE;
            doc.font('Helvetica-Bold').fontSize(11).fillColor('black')
                .text(title.toUpperCase(), { lineGap: LINE_GAP });
            const lineY = doc.y + 2;
            doc.moveTo(MARGIN, lineY)
                .lineTo(PAGE_WIDTH - MARGIN, lineY)
                .strokeColor('black').lineWidth(1).stroke();
            doc.y = lineY + 4;
        }

        // ── Helper: Two-column line (left bold + right regular) ──
        function drawTwoColumnLine(leftText, rightText, leftBold) {
            const rightWidth = rightText ? doc.font('Helvetica').fontSize(10).widthOfString(rightText) : 0;
            const leftWidth = CONTENT_WIDTH - rightWidth - (rightText ? 10 : 0);
            const startY = doc.y;

            doc.font(leftBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(11).fillColor('black')
                .text(leftText, MARGIN, startY, { width: leftWidth, lineGap: LINE_GAP });

            if (rightText) {
                doc.font('Helvetica').fontSize(10).fillColor('black')
                    .text(rightText, MARGIN + leftWidth + 10, startY, {
                        width: rightWidth,
                        align: 'right',
                        lineGap: LINE_GAP
                    });
            }

            const leftBottom = startY + doc.heightOfString(leftText, { width: leftWidth, font: 'Helvetica-Bold', fontSize: 11 });
            doc.y = Math.max(doc.y, leftBottom) + 2;
            doc.x = MARGIN;
        }

        // ── Helper: Draw bullets ──
        function drawBullets(bullets) {
            if (!bullets || bullets.length === 0) return;
            bullets.forEach((bullet, bIdx) => {
                if (bIdx > 0) doc.y += BULLET_GAP;
                doc.font('Helvetica').fontSize(10).fillColor('black')
                    .text(`\u2022  ${bullet}`, MARGIN + BULLET_INDENT, doc.y, {
                        width: CONTENT_WIDTH - BULLET_INDENT,
                        lineGap: LINE_GAP
                    });
            });
        }

        // ── Summary ──
        if (resume.summary) {
            drawSectionHeader('Summary');
            doc.font('Helvetica').fontSize(10).fillColor('black')
                .text(resume.summary, { lineGap: LINE_GAP });
        }

        // ── Experience ──
        if (resume.experience && resume.experience.length > 0) {
            drawSectionHeader('Experience');

            resume.experience.forEach((job, idx) => {
                if (idx > 0) doc.y += 12;

                const leftLabel = `${job.company}  —  ${job.title}`;
                drawTwoColumnLine(leftLabel, job.duration || '', true);

                // Context line — full width, italic, directly below title
                if (job.context) {
                    doc.font('Helvetica-Oblique').fontSize(10).fillColor('black')
                        .text(job.context, MARGIN, doc.y, {
                            width: CONTENT_WIDTH,
                            lineGap: LINE_GAP
                        });
                }

                doc.y += BULLET_GAP;
                drawBullets(job.bullets);
            });
        }

        // ── Projects ──
        if (resume.projects && resume.projects.length > 0) {
            drawSectionHeader('Projects');

            resume.projects.forEach((project, idx) => {
                if (idx > 0) doc.y += 12;

                drawTwoColumnLine(project.name, project.duration || '', true);

                // What it does — full width, regular
                if (project.what_it_does) {
                    doc.font('Helvetica').fontSize(10).fillColor('black')
                        .text(project.what_it_does, MARGIN, doc.y, {
                            width: CONTENT_WIDTH,
                            lineGap: LINE_GAP
                        });
                }

                // Problem solved — full width, italic
                if (project.problem_solved) {
                    doc.font('Helvetica-Oblique').fontSize(10).fillColor('black')
                        .text(`Problem: ${project.problem_solved}`, MARGIN, doc.y, {
                            width: CONTENT_WIDTH,
                            lineGap: LINE_GAP
                        });
                }

                doc.y += BULLET_GAP;
                drawBullets(project.bullets);

                // Tech stack line — full width
                if (project.tech_used && project.tech_used.length > 0) {
                    doc.y += BULLET_GAP;
                    doc.font('Helvetica-Bold').fontSize(10).fillColor('black')
                        .text('Tech: ', MARGIN, doc.y, { continued: true });
                    doc.font('Helvetica').fontSize(10)
                        .text(project.tech_used.join(', '), {
                            width: CONTENT_WIDTH - 30,
                            lineGap: LINE_GAP
                        });
                }
            });
        }

        // ── Skills ──
        const skills = resume.skills;
        if (skills) {
            drawSectionHeader('Skills');

            // Handle both old flat array format and new categorized format
            if (Array.isArray(skills)) {
                doc.font('Helvetica').fontSize(10).fillColor('black')
                    .text(skills.join(', '), { lineGap: LINE_GAP });
            } else {
                if (skills.primary && skills.primary.length > 0) {
                    doc.font('Helvetica-Bold').fontSize(10).fillColor('black')
                        .text('Core: ', { continued: true });
                    doc.font('Helvetica').fontSize(10)
                        .text(skills.primary.join(', '), { lineGap: LINE_GAP });
                }
                if (skills.tools && skills.tools.length > 0) {
                    doc.y += 2;
                    doc.font('Helvetica-Bold').fontSize(10).fillColor('black')
                        .text('Tools: ', { continued: true });
                    doc.font('Helvetica').fontSize(10)
                        .text(skills.tools.join(', '), { lineGap: LINE_GAP });
                }
                if (skills.other && skills.other.length > 0) {
                    doc.y += 2;
                    doc.font('Helvetica-Bold').fontSize(10).fillColor('black')
                        .text('Other: ', { continued: true });
                    doc.font('Helvetica').fontSize(10)
                        .text(skills.other.join(', '), { lineGap: LINE_GAP });
                }
            }
        }

        // ── Education ──
        if (resume.education && resume.education.length > 0) {
            drawSectionHeader('Education');

            resume.education.forEach((edu, idx) => {
                if (idx > 0) doc.moveDown(0.3);
                const leftLabel = `${edu.institution}  —  ${edu.degree}`;
                drawTwoColumnLine(leftLabel, edu.duration || edu.year || '', true);

                if (edu.gpa) {
                    doc.font('Helvetica').fontSize(9).fillColor('black')
                        .text(`GPA: ${edu.gpa}`, { lineGap: LINE_GAP });
                }
            });
        }

        // ── Achievements ──
        if (resume.achievements && resume.achievements.length > 0) {
            drawSectionHeader('Achievements');
            drawBullets(resume.achievements);
        }

        // ── Certifications ──
        if (resume.certifications && resume.certifications.length > 0) {
            drawSectionHeader('Certifications');
            drawBullets(resume.certifications);
        }

        doc.end();
    } catch (error) {
        console.error("PDF Generation Error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to generate PDF" });
        }
    }
});

app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});
