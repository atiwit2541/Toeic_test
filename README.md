# Toeic_test

TOEIC Reading Part 5 practice (Vite + vanilla JS). Optional: generate question banks with Ollama (`npm run generate`).

## Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` **หรือ** ตั้ง `VITE_SKIP_AUTH=1` เพื่อไม่ใช้หน้า login บนเครื่อง (โปรดักชันบน Vercel ยังต้อง login เหมือนเดิม)

## Build

```bash
npm run build
npm run preview
```

## Deploy on Vercel

1. Import repo → Framework Preset: Vite (หรือใช้ `vercel.json` ที่มี `outputDirectory: dist`)
2. **Environment Variables** → เพิ่ม `TOEIC_LOGIN_PASSWORD` = รหัสผ่านที่ต้องการ (ไม่มีค่านี้ API จะตอบ 503)
3. Deploy แล้วเปิดเว็บ — หน้าแรกจะเป็นหน้า login; ใส่รหัสเดียวกับ `TOEIC_LOGIN_PASSWORD`

**หมายเหตุ:** การ login นี้เป็น “ประตูหน้าเว็บ” ระดับง่าย (session อยู่ใน `sessionStorage`) เหมาะกับการซ่อนแอปจากคนทั่วไป ไม่ใช่ระบบ auth ระดับองค์กร
