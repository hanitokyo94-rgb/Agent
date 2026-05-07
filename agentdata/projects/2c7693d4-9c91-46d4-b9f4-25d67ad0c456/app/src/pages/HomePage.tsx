import React from 'react';
import { ArrowRightToLine, Database, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="rounded-2xl border bg-white shadow-soft p-6 sm:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <p className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-slate-700">
              <ShieldCheck className="h-4 w-4" />
              تسجيل آمن + قاعدة بيانات
            </p>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
              موقع تعريفي بسيط مع تسجيل دخول وتخزين بيانات
            </h1>
            <p className="max-w-xl text-slate-600">
              يستخدم Bobo Auth للتسجيل والتحقق، وBobo Data لتخزين بيانات المستخدم.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-white transition active:scale-95 hover:bg-slate-800"
              >
                ابدأ الآن <ArrowRightToLine className="h-4 w-4" />
              </Link>
              <Link
                to="/profile"
                className="inline-flex items-center rounded-lg border px-4 py-2 text-slate-900 transition active:scale-95 hover:bg-slate-50"
              >
                عرض الملف الشخصي
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 w-full md:max-w-[380px]">
            <div className="rounded-xl border p-4">
              <Database className="h-5 w-5 text-slate-900" />
              <div className="mt-2 font-semibold">تخزين</div>
              <div className="text-sm text-slate-600">حفظ بيانات داخل قاعدة البيانات</div>
            </div>
            <div className="rounded-xl border p-4">
              <ShieldCheck className="h-5 w-5 text-slate-900" />
              <div className="mt-2 font-semibold">تحقق</div>
              <div className="text-sm text-slate-600">التحقق عبر توكن من Bobo</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-2xl">⚡</div>
              <div className="mt-2 font-semibold">سريع</div>
              <div className="text-sm text-slate-600">واجهة بسيطة وسهلة</div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-xl bg-slate-50 p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">ماذا ستفعل بعد التسجيل؟</div>
              <div className="text-sm text-slate-600">
                ستتمكن من حفظ “معلومة شخصية” ثم قراءتها لاحقاً من قاعدة البيانات.
              </div>
            </div>
            <Link
              to="/login"
              className="mt-2 inline-flex w-fit items-center rounded-lg bg-white px-4 py-2 text-slate-900 border transition active:scale-95 hover:bg-slate-100"
            >
              افتح صفحة التسجيل
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
