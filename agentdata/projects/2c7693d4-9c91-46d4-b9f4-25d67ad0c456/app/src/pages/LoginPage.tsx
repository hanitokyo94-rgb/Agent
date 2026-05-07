import React from 'react';
import { useNavigate } from 'react-router-dom';

const BOBO_URL = import.meta.env.VITE_BOBO_API_URL as string | undefined;
const BOBO_KEY = import.meta.env.VITE_BOBO_PROJECT_KEY as string | undefined;

export default function LoginPage() {
  const nav = useNavigate();

  const start = (mode: 'login' | 'register') => {
    if (!BOBO_URL || !BOBO_KEY) return;

    const callback = `${window.location.origin}/auth/callback`;
    const url = `${BOBO_URL}/bobo-auth?project=${encodeURIComponent(BOBO_KEY)}&callback=${encodeURIComponent(
      callback
    )}&mode=${encodeURIComponent(mode)}`;

    window.location.href = url;
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border bg-white shadow-soft p-6">
        <h2 className="text-xl font-bold">تسجيل دخول / إنشاء حساب</h2>
        <p className="mt-2 text-sm text-slate-600">
          سيتم تحويلك لصفحة تسجيل Bobo ثم العودة.
        </p>

        <div className="mt-6 grid gap-3">
          <button
            onClick={() => start('login')}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-white transition active:scale-95 hover:bg-slate-800"
          >
            تسجيل الدخول
          </button>
          <button
            onClick={() => start('register')}
            className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-slate-900 transition active:scale-95 hover:bg-slate-50"
          >
            إنشاء حساب
          </button>
        </div>

        <button
          onClick={() => nav('/')}
          className="mt-5 text-sm text-slate-600 underline underline-offset-4"
        >
          رجوع للرئيسية
        </button>
      </div>
    </div>
  );
}
