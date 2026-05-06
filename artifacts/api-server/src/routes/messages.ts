import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { findWhere, insertRecord, findById, updateRecord, readCollection } from "../lib/storage.js";
import type { User } from "./auth.js";

const router = Router();

interface Message {
  id: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  thinkingSteps: string[] | null;
  attachmentUrl: string | null;
  createdAt: string;
}

interface Project {
  id: string;
  userId: string;
  updatedAt: string;
}

function getUserId(req: any): string | null {
  let userId = req.session?.userId;
  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const decoded = Buffer.from(token, "base64").toString("utf-8");
        userId = decoded.split(":")[0];
      } catch {
        return null;
      }
    }
  }
  return userId ?? null;
}

function deductCredit(userId: string) {
  const users = readCollection<User>("users");
  const user = users.find((u) => u.id === userId);
  if (user) {
    updateRecord<User>("users", userId, {
      creditsUsed: (user.creditsUsed ?? 0) + 1,
    });
  }
}

function getSystemPrompt(userLanguage?: string | null): string {
  const lang = userLanguage ?? "en";
  const isArabic = lang === "ar" || lang?.startsWith("ar");

  if (isArabic) {
    return `أنت مساعد ذكاء اصطناعي متقدم لبناء المشاريع وحل المشكلات. تتحدث العربية والإنجليزية بطلاقة وتجيب بنفس لغة المستخدم.

قدراتك:
- بناء مواقع ويب كاملة بـ TypeScript و Next.js
- كتابة كود احترافي وبوتات Discord وأدوات CLI
- تحليل البيانات وحل المشكلات التقنية
- البحث واقتراح أفضل الحلول

أسلوبك:
- دقيق وعملي ومباشر
- تقدم أمثلة كود حقيقية وقابلة للتنفيذ
- تدعم Markdown بالكامل: جداول، كود، عناوين، قوائم
- عند بناء مشروع: تعطي هيكل الملفات الكامل خطوة بخطوة
- لا تستخدم جمل افتراضية مكررة - كل رد ذكي وفريد`;
  }

  return `You are an advanced AI assistant for building projects, solving problems, and making decisions. You respond in the same language as the user (Arabic or English).

Your capabilities:
- Build complete websites with TypeScript and Next.js
- Write professional code, Discord bots, CLI tools
- Analyze data and solve technical problems
- Research and suggest the best solutions

Your style:
- Precise, practical, and direct
- Provide real, executable code examples
- Full Markdown support: tables, code blocks, headings, lists
- When building a project: give complete file structure step by step
- Never use repetitive placeholder sentences - every response is unique and intelligent`;
}

function generateThinkingSteps(content: string, userLanguage?: string | null): string[] {
  const isArabic = userLanguage === "ar" || userLanguage?.startsWith("ar");
  const lc = content.toLowerCase();

  if (lc.includes("build") || lc.includes("create") || lc.includes("make") ||
      content.includes("ابني") || content.includes("أنشئ") || content.includes("اصنع")) {
    return isArabic
      ? ["فهم متطلبات المشروع...", "تصميم هيكل الملفات والمعمارية...", "كتابة الكود والتعليمات..."]
      : ["Understanding project requirements...", "Designing file structure and architecture...", "Writing code and instructions..."];
  }
  if (lc.includes("analyz") || lc.includes("check") || content.includes("حلل") || content.includes("تحقق")) {
    return isArabic
      ? ["قراءة وفهم المعطيات...", "تحليل النقاط الرئيسية...", "صياغة التوصيات..."]
      : ["Reading and understanding the data...", "Analyzing key points...", "Formulating recommendations..."];
  }
  if (lc.includes("research") || lc.includes("find") || content.includes("ابحث") || content.includes("أيجد")) {
    return isArabic
      ? ["البحث في قواعد المعرفة...", "تقييم المصادر والمعلومات...", "تجميع أفضل النتائج..."]
      : ["Searching knowledge bases...", "Evaluating sources and information...", "Compiling the best results..."];
  }
  if (lc.includes("error") || lc.includes("bug") || lc.includes("fix") ||
      content.includes("خطأ") || content.includes("مشكلة")) {
    return isArabic
      ? ["تشخيص المشكلة...", "إيجاد الحل المناسب...", "التحقق من الحل..."]
      : ["Diagnosing the issue...", "Finding the appropriate solution...", "Verifying the fix..."];
  }
  return isArabic
    ? ["معالجة طلبك...", "صياغة الإجابة المثالية..."]
    : ["Processing your request...", "Formulating the best response..."];
}

router.get("/projects/:projectId/messages", (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<Project>("projects", req.params.projectId);
  if (!project || project.userId !== userId) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const messages = findWhere<Message>("messages", (m) => m.projectId === req.params.projectId);
  messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  res.json(messages);
});

router.post("/projects/:projectId/messages", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<Project>("projects", req.params.projectId);
  if (!project || project.userId !== userId) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const { content, attachmentUrl } = req.body as { content?: string; attachmentUrl?: string | null };
  if (!content) { res.status(400).json({ error: "content is required" }); return; }

  // Get user language for smart thinking steps
  const users = findWhere<User>("users", (u) => u.id === userId);
  const userLang = users[0]?.language;

  const userMsg: Message = {
    id: uuidv4(),
    projectId: req.params.projectId,
    role: "user",
    content,
    thinkingSteps: null,
    attachmentUrl: attachmentUrl ?? null,
    createdAt: new Date().toISOString(),
  };
  insertRecord("messages", userMsg);

  const allMessages = findWhere<Message>("messages", (m) => m.projectId === req.params.projectId);
  allMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Generate smart dynamic thinking steps based on content
  const thinkingSteps = generateThinkingSteps(content, userLang);

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: process.env.AI_BASE_URL,
    });

    const history = allMessages.slice(-12).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const completion = await client.chat.completions.create({
      model: process.env.AI_MODEL ?? "z-ai/glm-5.1",
      messages: [
        { role: "system", content: getSystemPrompt(userLang) },
        ...history,
      ],
      max_tokens: 4000,
    });

    const aiContent = completion.choices[0]?.message?.content ?? "Unable to generate response. Please try again.";

    const aiMsg: Message = {
      id: uuidv4(),
      projectId: req.params.projectId,
      role: "assistant",
      content: aiContent,
      thinkingSteps,
      attachmentUrl: null,
      createdAt: new Date().toISOString(),
    };
    insertRecord("messages", aiMsg);

    updateRecord<Project>("projects", req.params.projectId, { updatedAt: new Date().toISOString() });

    // Deduct credit
    const userIdx = users[0];
    if (userIdx) {
      updateRecord<User>("users", userId, {
        creditsUsed: (userIdx.creditsUsed ?? 0) + 1,
      });
    }

    res.json(aiMsg);
  } catch (err: any) {
    req.log?.error({ err }, "AI response failed");
    const errMsg: Message = {
      id: uuidv4(),
      projectId: req.params.projectId,
      role: "assistant",
      content: "Sorry, I encountered an error generating a response. Please try again.",
      thinkingSteps,
      attachmentUrl: null,
      createdAt: new Date().toISOString(),
    };
    insertRecord("messages", errMsg);
    res.json(errMsg);
  }
});

// Streaming endpoint using SSE
router.post("/projects/:projectId/messages/stream", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const project = findById<Project>("projects", req.params.projectId);
  if (!project || project.userId !== userId) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const { content, attachmentUrl } = req.body as { content?: string; attachmentUrl?: string | null };
  if (!content) { res.status(400).json({ error: "content is required" }); return; }

  const users = findWhere<User>("users", (u) => u.id === userId);
  const userLang = users[0]?.language;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Save user message
  const userMsg: Message = {
    id: uuidv4(),
    projectId: req.params.projectId,
    role: "user",
    content,
    thinkingSteps: null,
    attachmentUrl: attachmentUrl ?? null,
    createdAt: new Date().toISOString(),
  };
  insertRecord("messages", userMsg);
  sendEvent("user_message", userMsg);

  // Send thinking steps
  const thinkingSteps = generateThinkingSteps(content, userLang);
  for (const step of thinkingSteps) {
    sendEvent("thinking", { step });
    await new Promise((r) => setTimeout(r, 300));
  }

  const allMessages = findWhere<Message>("messages", (m) => m.projectId === req.params.projectId);
  allMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const msgId = uuidv4();
  let fullContent = "";

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: process.env.AI_BASE_URL,
    });

    const history = allMessages.slice(-12).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const stream = await client.chat.completions.create({
      model: process.env.AI_MODEL ?? "anthropic/claude-opus-4-5",
      messages: [
        { role: "system", content: getSystemPrompt(userLang) },
        ...history,
      ],
      max_tokens: 4000,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullContent += delta;
        sendEvent("chunk", { delta, msgId });
      }
    }

    const aiMsg: Message = {
      id: msgId,
      projectId: req.params.projectId,
      role: "assistant",
      content: fullContent,
      thinkingSteps,
      attachmentUrl: null,
      createdAt: new Date().toISOString(),
    };
    insertRecord("messages", aiMsg);
    updateRecord<Project>("projects", req.params.projectId, { updatedAt: new Date().toISOString() });

    // Deduct credit
    if (users[0]) {
      updateRecord<User>("users", userId, {
        creditsUsed: (users[0].creditsUsed ?? 0) + 1,
      });
    }

    sendEvent("done", aiMsg);
  } catch (err: any) {
    req.log?.error({ err }, "Stream AI response failed");
    sendEvent("error", { message: "Error generating response" });
  } finally {
    res.end();
  }
});

export default router;
