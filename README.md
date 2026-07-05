# MindMap

Сервис визуальных досок (mind maps): проекты, карточки на canvas, связи между ними,
чек-листы, дедлайны, документы, шаринг доступов между пользователями и уведомления
(в т.ч. real-time через SSE). Полноценный full-stack: **React-фронтенд + FastAPI-бэкенд +
MySQL + Telegram-бот**.

> **Контекст.** MindMap — один из сервисов внутренней платформы **Guido** (hub, где под
> единой авторизацией собрано несколько инструментов). В этом репозитории выделен именно
> сервис MindMap: фронтенд-часть — как она живёт внутри общего UI, бэкенд — как отдельный
> самостоятельный сервис. Общая оболочка хаба (роутинг, экран логина, шапка) и центральный
> auth-сервис Guido в репозиторий не входят — они описаны ниже как внешний контекст.

---

## Структура репозитория

```
guido-mindmap/
├── frontend/
│   └── mindmap/                 # Frontend-код сервиса (React, как в общем UI)
│       ├── MindmapPageContent.jsx   # Список проектов, папки, шаринг, уведомления
│       ├── ProjectBoardContent.jsx  # Доска: карточки, связи, документы, drag&drop
│       ├── components/              # UI-компоненты доски, дерева, модалок
│       ├── utils/                   # Метрики доски, хелперы
│       └── useMindmapHubNotifications.js  # Хук уведомлений (SSE)
│
└── backend/
    ├── mindmap-api/             # REST API (FastAPI + MySQL)
    │   ├── app.py               # Всё приложение (~2900 строк)
    │   └── .env.example
    └── telegram-mindmap-bot/    # Telegram-бот: синхронизация задач + LLM
        ├── bot.py, storage.py, sync_service.py, ...
        └── .env.example
```

---

## Стек

| Слой      | Технологии                                                        |
|-----------|-------------------------------------------------------------------|
| Frontend  | React 19, Vite, Tailwind CSS, framer-motion, lucide-react         |
| Backend   | FastAPI, Uvicorn, SQLAlchemy 2.0 (Core) + PyMySQL                 |
| БД        | MySQL                                                             |
| Бот       | aiogram 3, APScheduler, SQLite                                    |
| Auth      | Внешний auth-сервис Guido (проверка Bearer-токена через `/auth/me`)|

---

## Как это работает (кратко)

```
Пользователь (в оболочке Guido, уже залогинен)
        │  fetch, Authorization: Bearer <token из localStorage>
        ▼
Frontend mindmap  ──────────►  MindMap API (FastAPI, :8088)
                                    │        │
                             /auth/me│        ├─► MySQL (проекты, карточки, связи…)
                                    ▼        └─► Legacy MySQL (синхр. со старой версией, опц.)
                          Внешний auth-сервис Guido

Telegram-бот ──► MindMap API + MySQL + LLM-мост (ежедневная синхронизация задач)
```

### Frontend

- **`MindmapPageContent.jsx`** — витрина: список проектов, папки, закрепление, темизация
  (light/dark), создание/редактирование/архивация/удаление проектов, управление доступами
  (шаринг), лента уведомлений.
- **`ProjectBoardContent.jsx`** — сама доска: карточки на canvas с координатами и размерами,
  связи (рёбра) между ними, drag&drop, чек-листы, дедлайны, прикрепление документов к карточкам.
- **Авторизация:** фронтенд не логинит пользователя сам — берёт готовый JWT из
  `localStorage` (ключ `guido_access_token`, настраивается через `VITE_CORE_TOKEN_KEY`),
  который кладёт туда оболочка Guido после входа. Адрес API — `VITE_API_MINDMAP_BASE`.
- **Уведомления:** `useMindmapHubNotifications.js` слушает Server-Sent Events
  (`/api/notifications/stream`) — дедлайны и новые доступы прилетают в реальном времени.

### Backend

Подробности, модель данных, эндпоинты и запуск — в отдельных README:
- API: [`backend/mindmap-api`](backend/mindmap-api) — REST на FastAPI, таблицы MySQL
  создаются автоматически при старте.
- Бот: [`backend/telegram-mindmap-bot`](backend/telegram-mindmap-bot).

Ключевые эндпоинты API (префикс `/api`): `projects`, `project-folders`, `projects/{id}/shares`,
`projects/{id}/board`, `projects/{id}/cards`, `cards/{id}/documents`, `notifications`
(+ SSE `notifications/stream`).

---

## Схема архитектуры

Готовый промпт, чтобы нейросеть нарисовала полную диаграмму (frontend + backend + потоки
данных), лежит в [`ARCHITECTURE_PROMPT.md`](ARCHITECTURE_PROMPT.md).

---

## Запуск

**Backend (API):**
```bash
cd backend/mindmap-api
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install fastapi "uvicorn[standard]" SQLAlchemy PyMySQL httpx pydantic python-dotenv python-multipart
cp .env.example .env        # заполнить доступ к MySQL и auth-сервису
uvicorn app:app --host 0.0.0.0 --port 8088 --reload
```

**Frontend:** код mindmap встраивается в React/Vite-приложение (оболочку Guido).
Как standalone-страница ему нужны: провайдер токена в `localStorage` (`guido_access_token`)
и переменные `VITE_API_MINDMAP_BASE`, `VITE_CORE_TOKEN_KEY`. Зависимости: `react`,
`react-dom`, `lucide-react`, `framer-motion`, Tailwind CSS.

---

## Безопасность

`.env`, `*.sqlite3` и виртуальные окружения исключены через `.gitignore` — реальные
секреты (пароли БД, токен бота) в репозиторий не попадают, значения берутся из `.env.example`.
