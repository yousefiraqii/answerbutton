# ديبلوي AnswerButton أونلاين (Render) — 5 دقايق

## ⚠️ خطوة أمان إجبارية (المفتاح القديم اتكشف)
المفتاح اللي كان مكتوب في `server.js` و `settings.json` وملفات الاختبار **لازم يتلغي**:
1. افتح https://console.groq.com/keys
2. امسح المفتاح القديم (`gsk_KBeD...`)
3. اعمل مفتاح جديد وانسخه — هتحتاجه في خطوة 4 تحت.
> السبب: أي مفتاح اتنشر في ملف أو شات يعتبر مسروق.

## 1. ارفع المشروع على GitHub
```bash
cd "C:\Users\Restart Shop Tech\Desktop\AnswerButton"
git init
git add .
git commit -m "AnswerButton v2 - deployment ready"
git branch -M main
# اعمل repo جديد على github.com ثم:
git remote add origin https://github.com/<username>/answerbutton.git
git push -u origin main
```
ملفات `.env` و `settings.json` مش هتترفع (محمية في `.gitignore`) ✔

## 2. الديبلوي على Render
1. افتح https://dashboard.render.com → New → Blueprint
2. اختار repo `answerbutton` — Render هيقرا `render.yaml` لوحده.
3. هيعمل سيرفس `answerbutton` مع Disk 1GB على `/var/data` و Health Check على `/api/health`.
4. في صفحة Environment ضيف:
   - `GROQ_API_KEY` = المفتاح الجديد من Groq
   - `ADMIN_TOKEN` = خليه المتولد تلقائياً (أو غيره لسلسلة طويلة عشوائية)
   - `REQUIRE_TOKEN_FOR_SOLVE` = `false` (خليه false عشان الإضافة تشتغل بدون توكن، ولو عايز حماية قصوى خليه true وحط نفس التوكن في الإضافة)
5. دوس Deploy. بعد 2-3 دقايق هتاخد رابط زي:
   `https://answerbutton-xxxx.onrender.com`
6. جرب في المتصفح:
   - `https://xxx.onrender.com/api/health` → لازم `{"ok":true,...}`
   - `https://xxx.onrender.com/settings.html` → صفحة الإعدادات (دخل الـ ADMIN_TOKEN في حقل التوكن لو طلب)

## 3. اربط إضافة كروم بالسيرفر الأونلاين
1. افتح كروم → أيقونة AnswerButton → الصق رابط Render في **رابط السيرفر** → حفظ.
2. لو `REQUIRE_TOKEN_FOR_SOLVE=true` الصق نفس الـ `ADMIN_TOKEN` في حقل التوكن → حفظ.
3. دوس **اختبار الاتصال** → لازم `✅ السيرفر شغال`.
4. دوس **الإعدادات والتدريب** → ارفع الـ PDF واحفظ الإعدادات.
5. حدد أي سؤال في أي صفحة أو انسخه → دوس 🤖 → انسخ بـ 📋.

## ملاحظات التشغيل الأونلاين
- الخطة المجانية في Render بتنام بعد 15 دقيقة خمول — أول طلب بعد النوم بياخد ~30 ثانية. ده طبيعي.
- الـ PDF والإعدادات محفوظة على Disk (`/var/data`) فمش بتضيع مع الريستارت ✔
- لا تشارك رابط السيرفر ولا الـ ADMIN_TOKEN مع حد.
- للإنتاج الحقيقي: فعّل `REQUIRE_TOKEN_FOR_SOLVE=true` + `ALLOWED_ORIGINS` بدوميناتك فقط.
