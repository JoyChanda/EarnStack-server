# 🚀 EarnStack Server - সঠিক Commands

## ✅ সার্ভার চালানোর সঠিক উপায়

### অপশন ১: npm start (Recommended)
```bash
npm start
```

### অপশন ২: সরাসরি node
```bash
node index.js
```

### অপশন ৩: In-Memory Mode (MongoDB ছাড়া)
```bash
node server-no-db.js
```

---

## ❌ ভুল Command
```bash
npm run dev  # ❌ এই script নেই
```

## ✅ সঠিক Command
```bash
npm start    # ✅ এটা ব্যবহার করুন
```

---

## 📝 Quick Start Guide

### ধাপ ১: `.env` ফাইল চেক করুন
```env
PORT=5000
MONGO_URI=mongodb+srv://esadmin:YourPasswordHere@cluster1...
JWT_SECRET=super_secret_key_123
```

⚠️ **`YourPasswordHere` replace করুন আপনার actual password দিয়ে!**

### ধাপ ২: Server চালু করুন
```bash
cd EarnStack-server
npm start
```

### ধাপ ৩: Success Message দেখুন
```
✅ Connected to MongoDB!
Pinged your deployment. You successfully connected to MongoDB!
🎯 Server running on port 5000
📍 http://localhost:5000
```

---

## 🔧 Troubleshooting

### সমস্যা: MongoDB connection error
**সমাধান:** `.env` ফাইলে password ঠিক করুন

### সমস্যা: Port already in use
**সমাধান:**
```bash
# Windows PowerShell:
Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process -Force
```

### সমস্যা: Module not found
**সমাধান:**
```bash
npm install
```

---

## 🎯 এখন করুন:

1. ✅ `.env` ফাইলে password সেট করুন
2. ✅ Terminal এ যান: `cd EarnStack-server`
3. ✅ Run করুন: `npm start`
4. ✅ Browser এ test করুন: `http://localhost:5000`

---

**Ready? চলুন শুরু করি!** 🚀
