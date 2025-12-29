# 🔌 Smart Load Controller Backend

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![MQTT](https://img.shields.io/badge/MQTT-660099?style=for-the-badge&logo=mqtt&logoColor=white)

**Backend API untuk sistem Smart Load Controller dengan manajemen terminal prioritas menggunakan algoritma Knapsack**

</div>

---

## 📋 Daftar Isi

- [Tentang Proyek](#-tentang-proyek)
- [Fitur Utama](#-fitur-utama)
- [Tech Stack](#-tech-stack)
- [Prasyarat](#-prasyarat)
- [Instalasi](#-instalasi)
- [Konfigurasi](#-konfigurasi)
- [Menjalankan Aplikasi](#-menjalankan-aplikasi)
- [API Endpoints](#-api-endpoints)
- [Database Schema](#-database-schema)
- [Struktur Folder](#-struktur-folder)

---

## 🎯 Tentang Proyek

**Smart Load Controller Backend** adalah REST API yang dibangun untuk mengelola sistem kontrol beban listrik pintar.  Sistem ini menggunakan **algoritma Knapsack** untuk mengoptimalkan penggunaan daya listrik berdasarkan prioritas terminal dan kapasitas maksimum yang tersedia.

### Keunggulan: 
- 🧠 **Optimasi Cerdas**:  Menggunakan algoritma Knapsack untuk mengelola beban listrik
- ⚡ **Real-time**: Integrasi MQTT untuk komunikasi real-time dengan perangkat STM32
- 📊 **Monitoring**: Tracking penggunaan daya, ampere, dan voltase per terminal
- ⏰ **Penjadwalan**: Sistem scheduling otomatis untuk on/off terminal
- 📈 **Statistik**:  Laporan dan analisis penggunaan daya

---

## ✨ Fitur Utama

- ✅ **Manajemen Terminal** - CRUD terminal dengan prioritas dan status
- ✅ **Algoritma Knapsack** - Optimasi beban listrik berdasarkan kapasitas dan prioritas
- ✅ **MQTT Integration** - Komunikasi real-time dengan STM32 microcontroller
- ✅ **Scheduling System** - Penjadwalan otomatis on/off terminal
- ✅ **Power Usage Monitoring** - Tracking real-time power, ampere, dan voltage
- ✅ **Statistics & Analytics** - Laporan dan statistik penggunaan daya
- ✅ **Mode Otomatis/Manual** - Fleksibilitas kontrol STM32

---

## 🛠️ Tech Stack

| Technology | Description |
|-----------|-------------|
| **TypeScript** | Strongly typed programming language |
| **Node.js** | JavaScript runtime |
| **Express.js** | Web framework |
| **Prisma ORM** | Database ORM |
| **PostgreSQL** | Relational database |
| **MQTT** | IoT messaging protocol |
| **Supabase** | Backend as a Service |

### Dependencies:
```json
{
  "@prisma/client":  "^6.16.2",
  "@supabase/supabase-js": "^2.76.1",
  "express": "^5.1.0",
  "mqtt": "^5.14.1",
  "cors": "^2.8.5",
  "helmet": "^8.1.0",
  "morgan": "^1.10.1",
  "date-fns": "^4.1.0"
}
```

---

## 📦 Prasyarat

Pastikan Anda telah menginstall: 

- **Node.js** >= 18.x
- **npm** atau **yarn**
- **PostgreSQL** database
- **Git**

---

## 🚀 Instalasi

### 1. Clone Repository

```bash
git clone https://github.com/farreladriann/slc-backend.git
cd slc-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment Variables

Buat file `.env` di root folder:

```bash
cp .env.example .env
```

---

## ⚙️ Konfigurasi

Edit file `.env` dengan konfigurasi Anda:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/slc_db"
DIRECT_URL="postgresql://user:password@localhost:5432/slc_db"

# Server
PORT=3000

# Supabase (optional)
SUPABASE_URL="your_supabase_url"
SUPABASE_KEY="your_supabase_key"

# MQTT
MQTT_BROKER="mqtt://broker.hivemq.com"
MQTT_PORT=1883
MQTT_USERNAME=""
MQTT_PASSWORD=""
```

### Setup Database

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio
npm run prisma:studio
```

---

## 🏃 Menjalankan Aplikasi

### Development Mode

```bash
npm run dev
```

Server akan berjalan di `http://localhost:3000`

### Production Mode

```bash
# Build
npm run build

# Start
npm start
```

---

## 📡 API Endpoints

### Base URL
- **Development**: `http://localhost:3000`

### Endpoints

#### **Users**
```http
POST /users
```
Create new user

#### **Terminals**
```http
GET    /api/terminals
POST   /api/terminals
GET    /api/terminals/:id
PUT    /api/terminals/:id
DELETE /api/terminals/:id
```

#### **Knapsack Algorithm**
```http
POST   /api/knapsack
```
Jalankan algoritma knapsack untuk optimasi beban

#### **Schedule**
```http
GET    /api/schedule
POST   /api/schedule
PUT    /api/schedule/:id
DELETE /api/schedule/:id
```

#### **Statistics**
```http
GET    /api/statistics
GET    /api/statistics/:terminalId
```

### Contoh Request

**Create Terminal:**
```bash
curl -X POST http://localhost:3000/api/terminals \
  -H "Content-Type: application/json" \
  -d '{
    "terminalId": "T001",
    "stm32Id": "STM32_001",
    "terminalPriority": 5,
    "terminalStatus": "off"
  }'
```

**Create User:**
```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "userGoogleId": "google123",
    "userEmail": "user@example.com",
    "userName": "John Doe",
    "stm32Id":  "STM32_001"
  }'
```

---

## 🗄️ Database Schema

### User
```prisma
model User {
  userGoogleId String  @id
  userEmail    String  @unique
  userName     String
  stm32Id      String? 
  stm32        Stm32? 
}
```

### Stm32
```prisma
model Stm32 {
  stm32Id        String     @id
  stm32Threshold Int?
  mode           Stm32Mode  // Otomatis | Manual
  terminals      Terminal[]
  users          User[]
}
```

### Terminal
```prisma
model Terminal {
  terminalId       String
  stm32Id          String
  terminalPriority Int
  terminalStatus   TerminalStatus  // on | off
  startOn          DateTime?
  finishOn         DateTime?
  powerUsages      PowerUsage[]
}
```

### PowerUsage
```prisma
model PowerUsage {
  powerUsageId Int
  terminalId   String
  power        Float
  ampere       Float
  volt         Float
  timestamp    DateTime
}
```

### Knapsack Logs
```prisma
model knapsack_logs {
  id             String   @id
  created_at     DateTime
  max_capacity   Int? 
  result_json    Json?
  total_power    Float? 
  total_priority Int?
}
```

---

## 📁 Struktur Folder

```
slc-backend/
├── prisma/
│   └── schema.prisma       # Database schema
├── src/
│   ├── lib/                # Library & utilities
│   │   └── prisma.ts       # Prisma client instance
│   ├── routes/             # API routes
│   │   ├── terminalRoute.ts
│   │   ├── knapsackRoute.ts
│   │   ├── scheduleRoute.ts
│   │   └── statisticsRoute.ts
│   ├── services/           # Business logic
│   │   ├── mqttService.ts  # MQTT client & handlers
│   │   └── scheduleManager.ts  # Schedule watcher
│   ├── logs/               # Log files
│   └── index.ts            # Main application
├── dist/                   # Compiled output
├── .env                    # Environment variables
├── package.json
├── tsconfig.json
├── nodemon.json           # Nodemon configuration
└── eslint.config.mjs      # ESLint configuration
```

---

<div align="center">

⭐ **Jika proyek ini membantu, berikan star! ** ⭐

</div>


