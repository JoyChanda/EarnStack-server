# 🪙 EarnStack – Micro Task & Earning Platform (Server)

EarnStack is a full-stack MERN-based micro-tasking and earning platform where users can complete small tasks, earn coins, and withdraw real money. The platform supports three roles — **Worker**, **Buyer**, and **Admin** — each with dedicated dashboards and functionalities.

---

## 🌐 Live Website
👉 [https://earn-stack-client.vercel.app/](https://earn-stack-client.vercel.app/)

---

## 🔐 Admin Credentials
- **Email:** admin@earnstack.com
- **Password:** Admin123!

⚠️ *Admin credentials are provided for assessment and testing purposes only.*

---

## 📂 GitHub Repositories
- **Client Side:** [https://github.com/JoyChanda/EarnStack-client](https://github.com/JoyChanda/EarnStack-client)
- **Server Side:** [https://github.com/JoyChanda/EarnStack-server](https://github.com/JoyChanda/EarnStack-server)

---

## 🚀 Key Features (Highlights)
- 🔑 **Role-based Authentication & Authorization** (Worker, Buyer, Admin)
- 🧾 **JWT-secured private routes** with reload-safe authentication
- 👷 **Workers can browse tasks, submit proofs, earn coins, and withdraw money**
- 🧑–🏻 **Buyers can create tasks, review submissions, approve/reject work**
- 💰 **Dynamic coin system**  
  - Buyer: 10 coins = 1 USD  
  - Worker: 20 coins = 1 USD
- 💳 **Coin purchase system** (Premium dummy payment integration)
- 📊 **Dashboard analytics** for all roles (earnings, tasks, submissions, payments)
- 🔔 **Real-time notification system** for approvals, rejections, submissions, and withdrawals
- 🧑–💻 **Admin panel** to manage users, roles, tasks, payments, and withdrawals
- 📄 **Pagination implemented** for worker submissions
- 📱 **Fully responsive UI** for mobile, tablet, and desktop devices
- 🖼 **Image upload support** (Task images & profile pictures with URL support)
- 🌱 **Environment variables used** to secure Firebase and MongoDB credentials
- ❌ **No Lorem Ipsum used** — all content is meaningful and realistic

---

## 🧠 Tech Stack

### Backend
- Node.js
- Express.js
- MongoDB (Aggregation & Atomic Updates)
- JWT Authentication
- Dummy Payment Logic
- role-specific middleware (verifyAdmin, verifyBuyer, verifyWorker)

---

## 🛡 Security & Best Practices
- JWT tokens stored securely and included in headers via Axios Secure
- Role-based route protection using server-side middleware
- Sensitive credentials hidden using `.env`
- Atomic coin updates using MongoDB's `$inc` operator to prevent race conditions

---

## 📌 Project Purpose
This project was built as part of a **Junior MERN Stack Developer job assessment** to demonstrate:
- Full-stack development skills
- Secure authentication & authorization
- Clean Git commit history
- Real-world business logic implementation

---

## 📞 Contact
- **GitHub:** [https://github.com/JoyChanda](https://github.com/JoyChanda)
- **LinkedIn:** [https://www.linkedin.com/in/joy-chanda/](https://www.linkedin.com/in/joy-chanda/)

---

⭐ If you like this project, feel free to star the repository!
