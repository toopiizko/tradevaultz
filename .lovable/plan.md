# Price Alert (แบบ TradingView) สำหรับ TradeVaultz

ระบบแจ้งเตือนเมื่อราคาสินทรัพย์ (Forex / Crypto / Gold / Index) แตะเงื่อนไขที่ตั้งไว้ — ทำงานเบื้องหลังด้วย cron + edge function, ส่ง Web Push ไปที่มือถือ/เบราว์เซอร์ และโชว์ใน in-app inbox

## ฟีเจอร์หลัก (MVP)

1. **สร้าง Alert**
   - เลือก asset (ใช้ลิสต์ `POPULAR_ASSETS` เดิม + custom symbol)
   - เงื่อนไข: `crosses`, `crosses up`, `crosses down`, `>=`, `<=`
   - ตั้ง target price + note
   - เลือก one-time หรือ repeating (cooldown นาที)
   - เปิด/ปิด, ลบ, แก้ไข

2. **หน้า Alerts** (`/alerts`)
   - List แบบเดียวกับ TradingView: asset, condition, target, ราคาปัจจุบัน, สถานะ (active/triggered/paused)
   - ปุ่ม + สร้างใหม่, toggle เปิด-ปิด, ลบ
   - แท็บ "History" แสดง alert ที่เคย trigger พร้อมเวลา + ราคา ณ ตอนนั้น

3. **การแจ้งเตือน**
   - Web Push (PWA) — เด้งบน iPhone/Android หลังติดตั้งเป็น home-screen app
   - In-app toast + 🔔 badge ที่ nav แสดงจำนวน unread
   - บันทึก trigger event ลง DB (price ตอน trigger, timestamp)

4. **เบื้องหลัง**
   - Cron job ทุก 1 นาที → เรียก edge function `check-price-alerts`
   - Edge function ดึงราคาปัจจุบันของทุก asset ที่มี active alert (รวม dedupe), เทียบเงื่อนไข, ถ้าเข้า → ส่ง push + insert trigger row
   - Repeat alert: เคารพ `cooldown_minutes` กัน spam

## หน้าจอ / UX

```text
/alerts
┌─────────────────────────────────────────────┐
│ Price Alerts           [+ New Alert]        │
├─────────────────────────────────────────────┤
│ Active (3)  |  Triggered  |  History        │
├─────────────────────────────────────────────┤
│ XAUUSD   crosses up  2,400.00   now 2,387 ●│
│ BTCUSD   <=          60,000     now 63,210 ●│
│ EURUSD   crosses     1.0850     now 1.0842 ●│
└─────────────────────────────────────────────┘
```

Dialog "New Alert":
- Asset (combobox, มี popular + พิมพ์เอง)
- Condition (select)
- Price (number)
- Note (optional)
- Repeat? + cooldown

## รายละเอียดทางเทคนิค

**Database (migration)**

```sql
-- price_alerts: ผู้ใช้สร้าง 1 alert ต่อแถว
id, user_id, asset, condition, target_price, note,
status ('active'|'paused'|'triggered'),
repeat boolean, cooldown_minutes int,
last_triggered_at, last_price, created_at, updated_at

-- price_alert_events: ประวัติ trigger
id, alert_id, user_id, asset, condition, target_price,
triggered_price, triggered_at, acknowledged boolean

-- push_subscriptions: เก็บ Web Push subscription
id, user_id, endpoint, p256dh, auth, user_agent, created_at
```
ทุก table เปิด RLS + GRANT + policy `auth.uid() = user_id`.

**Edge functions** (`verify_jwt = false` ผ่าน config.toml)

1. `check-price-alerts` — cron ทุก 1 นาที
   - SELECT alerts active ทั้งหมด, group by asset
   - ดึงราคาจาก provider เดียว (ดู "ราคามาจากไหน")
   - เทียบ condition กับ `last_price` (สำหรับ crosses ต้องมี prev price)
   - ถ้า trigger → insert event, set `status='triggered'` (ถ้า one-time) หรืออัพเดท `last_triggered_at`, ส่ง push
2. `send-web-push` — ใช้ VAPID keys (`VAPID_PUBLIC`, `VAPID_PRIVATE`) ส่ง push ไปทุก subscription ของ user
3. `register-push-subscription` — เก็บ subscription จาก client

**ราคามาจากไหน**
- Crypto: Binance public API `api.binance.com/api/v3/ticker/price` (ฟรี ไม่ต้อง key) → BTCUSDT, ETHUSDT
- Forex / Gold / Index: ใช้ `https://api.twelvedata.com` (ฟรี tier 800 req/day) — ต้องขอ API key จาก user หรือใช้ `exchangerate.host` สำหรับ FX
- ทำ adapter `getPrice(asset)` map symbol → provider

จะถามผู้ใช้เรื่อง API key ตอน implement (ถ้าจำเป็น) ส่วน crypto ใช้ฟรีได้เลย

**PWA / Web Push**
- เพิ่ม service worker `public/sw.js` (เฉพาะ push handler — ไม่ทำ offline cache ใหม่)
- สร้าง VAPID key pair, เก็บใน secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- ปุ่ม "Enable notifications" ในหน้า Alerts ขอ permission → subscribe → ส่งไป edge function

**Realtime in-app**
- Subscribe Supabase realtime ที่ `price_alert_events` filter by user_id → toast + badge update ทันที (ไม่ต้องพึ่ง push)

**Frontend ไฟล์ใหม่/แก้**
- `src/pages/Alerts.tsx` — list + tabs
- `src/components/AlertFormDialog.tsx`
- `src/components/AlertCard.tsx`
- `src/hooks/usePriceAlerts.ts`
- `src/hooks/useAlertEvents.ts`
- `src/lib/push.ts` — register/unregister web push
- `public/sw.js` — push event handler
- เพิ่ม route + nav entry ใน `AppLayout.tsx`

**Cron**
- เปิด `pg_cron` + `pg_net`, schedule `*/1 * * * *` → POST ไป `check-price-alerts`

## ลำดับการสร้าง

1. Migration: 3 tables + RLS + GRANT + enable pg_cron/pg_net
2. Edge functions: `check-price-alerts`, `register-push-subscription`, `send-web-push`
3. Generate VAPID keys → save เป็น secrets
4. Frontend: route, page, dialog, hooks
5. Service worker + push subscription flow
6. Cron schedule
7. ทดสอบ: สร้าง alert BTCUSD ใกล้ราคาปัจจุบัน → รอ trigger

## สิ่งที่จะถามก่อนเริ่มลงมือ

- ต้องการรองรับ asset กลุ่มไหนบ้าง? (Crypto only / + Forex/Gold / + Stocks)
- ถ้ารวม Forex/Gold/Index → มี API key ของ Twelve Data หรือให้ผมแนะนำ provider?
- เปิด Web Push เลย หรือเอาเฉพาะ in-app notification ก่อน?

อนุมัติแผนนี้แล้วผมจะเริ่มสร้าง migration เป็นขั้นแรก
