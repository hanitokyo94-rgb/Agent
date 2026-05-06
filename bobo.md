# Bobo — AI Builder Platform

> خطة المشروع الكاملة وقوانين الوكيل ومهامه. يجب تحديث هذا الملف بعد كل مهمة مكتملة.

---

## قوانين الوكيل (Agent Rules)

1. **لا تحذف ملفات الضرورية** إلا بإذن صريح من المستخدم.
2. **اكتب كودًا نظيفًا ومنظمًا** مع TypeScript دائمًا.
3. **استخدم النمط الموجود** ولا تخترع بنية جديدة بدون سبب.
4. **احفظ التقدم في** `bobo.md` بعد كل مهمة — ضع ✅ عند الإنجاز.
5. **لكل مشروع ينشئه المستخدم** يكون فيه:
   - `src/` — الكود المصدري
   - `public/` — الأصول الثابتة
   - `data/` — بيانات محلية (JSON/SQLite)
   - `attached_assets/` — صور وملفات المستخدم
6. **bobo.auth** — استخدم عند الحاجة لنظام تسجيل الدخول في مشروع.
7. **bobodata** — استخدم عند الحاجة لتخزين بيانات محلي.
8. **لا تخزن كلمات مرور بنص واضح** — استخدم bcrypt دائمًا.
9. **راجع `Skills/`** دائمًا قبل تنفيذ أي ميزة متخصصة.
10. **الوكيل يعمل في الخلفية** — الرسائل محفوظة في localStorage وتُستعاد بعد الرفريش.

---

## هيكل المنصة

```
workspace/
├── artifacts/
│   ├── app/            # Frontend (React + Vite) — port 23863 → /
│   ├── api-server/     # Backend (Express 5) — port 8080 → /api
│   └── mockup-sandbox/ # Canvas مكونات — port 8081
├── lib/
│   ├── api-spec/       # OpenAPI spec
│   ├── api-client-react/ # Generated React hooks
│   ├── api-zod/        # Generated Zod schemas
│   └── db/             # Drizzle ORM
├── Skills/
│   ├── bobo-auth/      # نظام Auth للمشاريع
│   └── bobodata/       # نظام تخزين البيانات
├── data/               # بيانات المنصة (users, projects, messages)
└── bobo.md             # هذا الملف
```

---

## المهام — Tasks

### المرحلة الأولى: البنية الأساسية

- [✅] إعداد المشروع الأساسي (pnpm workspace, TypeScript)
- [✅] Backend Express 5 مع SSE streaming
- [✅] Frontend React + Vite + TailwindCSS
- [✅] نظام Auth (Bearer token)
- [✅] Dashboard ولوحة التحكم
- [✅] نظام المشاريع والرسائل
- [✅] Onboarding ثلاث خطوات
- [✅] Settings مع الاشتراكات والمظهر

### المرحلة الثانية: تحسينات الشات

- [✅] AgentChat — تصميم جديد نظيف بدون avatar
- [✅] رسائل بدون خلفية للمساعد (نص مباشر)
- [✅] عرض عمليات الملفات كـ chips ملونة
- [✅] نقر على chip → مودال عرض الكود
- [✅] MyFiles.tsx — مرفقات بأسلوب iOS
- [✅] localStorage persistence للرسائل
- [✅] مؤشر حالة الاتصال (Working / Disconnected)
- [ ] Background agent — reconnection logic

### المرحلة الثالثة: نظام Auth للمشاريع

- [✅] Skill: bobo-auth (SKILL.md)
- [ ] تطبيق فعلي لـ bobo.auth OAuth flow
- [ ] صفحة login جاهزة قابلة للتخصيص
- [ ] GitHub / Google / Discord OAuth

### المرحلة الرابعة: نظام البيانات

- [✅] Skill: bobodata (SKILL.md)
- [ ] API endpoints لإدارة tables
- [ ] Admin panel لعرض البيانات

### المرحلة الخامسة: ميزات متقدمة

- [ ] نظام deployment محسّن
- [ ] File upload في الشات (وسائط)
- [ ] عرض ملفات iOS-style في FileModal
- [ ] إشعارات real-time

---

## المتغيرات المطلوبة

| Variable | Purpose |
|----------|---------|
| `AI_API_KEY` | مفتاح OpenAI API |
| `AI_BASE_URL` | Base URL (اختياري) |
| `AI_MODEL` | اسم الموديل |

---

## ملاحظات مهمة

- **PORT**: المنصة تستخدم `$PORT` env var — لا تكتب port ثابت.
- **Auth**: Bearer token مشفر base64 `userId:timestamp`.
- **SSE Events**: `thinking` → `chunk` → `done` (أو `error`).
- **localStorage key**: `chat-messages-${projectId}` للحفاظ على الرسائل.
- **Files**: كل ملفات المشاريع في `data/projects/${projectId}/` على السيرفر.
