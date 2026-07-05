<h1 align="center">🧠 MindMap</h1>

<p align="center">
  <b>Full-stack сервис визуальных досок</b> — проекты, карточки на бесконечном canvas,
  связи, чек-листы, дедлайны, приоритеты, документы, совместный доступ и уведомления в реальном времени.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.128-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white" />
  <img src="https://img.shields.io/badge/aiogram-3-2CA5E0?logo=telegram&logoColor=white" />
</p>

---

## ✨ О проекте

**MindMap** — инструмент для планирования в виде интерактивных досок: раскладываешь идеи
и задачи карточками на canvas, соединяешь их связями, ведёшь чек-листы, ставишь дедлайны
и приоритеты, делишься досками с командой. Дедлайны и новые доступы прилетают в реальном
времени.

Это один из сервисов внутренней платформы **Guido** (hub инструментов под единой
авторизацией). Здесь он выделен в самостоятельный проект: фронтенд, REST API, база данных
и Telegram-бот.

> 🛠️ **Что реализовано мной:** архитектура фронтенда и бэкенда, canvas-доска с drag&drop
> и связями, система приоритетов и прогресса, шаринг досок, real-time уведомления через
> Server-Sent Events, REST API на FastAPI с авто-созданием схемы БД и Telegram-бот для
> ежедневной синхронизации задач.

---

## 🚀 Возможности

- 🗂️ **Проекты и папки** — организация досок, закрепление, архивация, тёмная/светлая тема.
- 🎯 **Canvas-доска** — карточки с координатами и размерами, связи между ними, drag&drop, зум и панорамирование.
- ✅ **Задачи внутри карточек** — чек-листы, дедлайны, важность и срочность с расчётом приоритета.
- 📎 **Документы** — прикрепление файлов и изображений к карточкам.
- 👥 **Совместный доступ** — шаринг досок между пользователями с управлением правами.
- 🔔 **Real-time уведомления** — дедлайны и новые доступы через Server-Sent Events (с fallback на polling).
- 🤖 **Telegram-бот** — ежедневная синхронизация задач и интеграция с LLM.

---

## 🧩 Как это работает

<!-- Сюда вставить сгенерированную схему архитектуры, например:
<p align="center"><img src="docs/architecture.png" width="820" /></p>
-->

1. Пользователь залогинен в оболочке Guido — она кладёт JWT в `localStorage`.
2. Фронтенд MindMap читает токен и шлёт запросы с `Authorization: Bearer <token>`.
3. Запросы идут через nginx (`/mindmap/*`) на backend — **FastAPI** (порт 8088).
4. API валидирует токен во внешнем auth-сервисе (`GET /auth/me`) и работает с **MySQL**.
5. Уведомления приходят на фронт по **SSE**-стриму.
6. **Telegram-бот** раз в день синхронизирует задачи и обращается к LLM.

---

## 🛠️ Технологии

| Слой      | Стек                                                              |
|-----------|-------------------------------------------------------------------|
| Frontend  | React 19, Vite, Tailwind CSS, framer-motion, lucide-react         |
| Backend   | FastAPI, Uvicorn, SQLAlchemy 2.0 (Core), PyMySQL                  |
| База      | MySQL (схема создаётся автоматически при старте)                  |
| Бот       | aiogram 3, APScheduler, SQLite                                    |
| Auth      | Внешний сервис Guido (проверка Bearer-токена через `/auth/me`)    |

---

## 💡 Технические решения

- **Разделение «список ↔ доска».** Два тяжёлых экрана вынесены в контейнеры
  `MindmapPageContent` и `ProjectBoardContent`, которые держат состояние и сетевые вызовы,
  а дочерние компоненты остаются presentational. Тяжёлая доска грузится только когда открыта.
- **Чистая расчётная логика в `utils/`.** Приоритеты, прогресс, геометрия связей и
  форматирование вынесены из компонентов в чистые функции — их легко тестировать и переиспользовать.
- **Real-time через SSE.** Уведомления идут по Server-Sent Events с автоматическим
  переподключением и fallback на polling — проще и легче, чем поднимать WebSocket-инфраструктуру.
- **База без миграций.** API сам создаёт недостающие таблицы при старте
  (`CREATE TABLE IF NOT EXISTS`) — минимум операционной возни при деплое компактного сервиса.
- **Делегированная авторизация.** Сервис не хранит паролей — доверяет центральному
  auth-сервису, что позволяет единому логину покрывать все инструменты платформы.

---

## 📁 Структура

```
guido-mindmap/
├── frontend/mindmap/          — React-код сервиса (встраивается в общий UI Guido)
│   ├── MindmapPageContent.jsx     — витрина: проекты, папки, шаринг, уведомления
│   ├── ProjectBoardContent.jsx    — доска: карточки, связи, документы, drag&drop
│   ├── useMindmapHubNotifications.js — хук real-time уведомлений (SSE)
│   ├── utils/                     — чистые функции (приоритеты, прогресс, геометрия)
│   └── components/                — UI: common / projects / project-board / board-tree
└── backend/
    ├── mindmap-api/               — REST API (FastAPI + MySQL), весь код в app.py
    └── telegram-mindmap-bot/      — Telegram-бот синхронизации (aiogram)
```

<details>
<summary><b>📖 Подробное описание каждого файла</b></summary>

### Frontend — `frontend/mindmap/`

Код сервиса, как он живёт внутри общего UI Guido (не отдельное приложение — точки входа,
роутинг и логин приходят из оболочки). Внешние зависимости: `react`, `react-dom`,
`lucide-react`, `framer-motion`.

| Файл | Что делает |
|------|------------|
| `MindmapPage.jsx` | Тонкая точка входа — ре-экспорт `MindmapPageContent` (стабильное имя для оболочки). |
| `MindmapPageContent.jsx` | Витрина проектов: список, папки, закрепление, тема, CRUD, архивация, шаринг, уведомления + все `fetch` к API проектов. |
| `ProjectBoard.jsx` | Ре-экспорт `ProjectBoardContent` (фасад → реализация). |
| `ProjectBoardContent.jsx` | Доска: карточки, связи, drag&drop, зум, чек-листы, дедлайны, документы + `fetch` доски/карточек. |
| `useMindmapHubNotifications.js` | Хук уведомлений: считает дедлайны/доступы, слушает SSE, при обрыве — polling; прочитанные хранит в `localStorage`. |

**`utils/`** — чистые функции:
| Файл | Что делает |
|------|------------|
| `boardMetrics.js` | Метрики и подписи важности/срочности, расчёт приоритета, прогресс по дереву, сортировка. |
| `mindmapPageUtils.js` | Хелперы витрины: id, форматирование дат, сбор задач по проектам. |
| `projectBoardUtils.js` | Хелперы доски: id карточек, геометрия связей, нормализация размеров. |

**`components/`** — UI:
| Файл | Что делает |
|------|------------|
| `common/MindmapUi.jsx` | Базовые примитивы: `IconBtn`, `Button`, `Modal`, `Pill`, `ConfirmTopSheet` (темы + анимации). |
| `AddCardModal.jsx` | Модалка создания карточки. |
| `CardDetailsModal.jsx` | Детали карточки: приоритет, чек-лист, дедлайн, цвет, вложения, архивация. |
| `BoardCardShell.jsx` | Обёртка карточки: позиционирование, точки-«якоря» для связей. |
| `BoardCard.jsx` | Визуальная карточка: заголовок, приоритет, прогресс, иконки. |
| `BoardEdges.jsx` | Отрисовка связей (SVG-кривые). |
| `BoardTreePanel.jsx` / `BoardTreePanelContent.jsx` | Панель «дерево доски»: задачи списком, прогресс, сортировка. |
| `board-tree/` | Элементы дерева: `BoardCardTreeItem`, `BoardTreeTaskItem`, `BoardTreeProgressModal`. |
| `project-board/` | Части экрана доски: `ProjectBoardScene`, `BoardCanvas`, `BoardZoomControls`, `ProjectBoardHeader`, `ProjectBoardSidebar`, `ProjectBoardDialogs`. |
| `projects/` | Элементы витрины: `ProjectCard`, `ProjectFormModal`, `ProjectAccessModal`, `TasksOverviewModal`, `KpiCard`. |

### Backend — `backend/`

**`mindmap-api/`**
| Файл | Что делает |
|------|------------|
| `app.py` | Всё API (~2900 строк): подключение к MySQL, авто-создание таблиц, проверка токена (`/auth/me`), эндпоинты проектов/досок/карточек/документов/уведомлений (+ SSE), опц. синхронизация со старой версией. |
| `.env.example` | Шаблон переменных (MySQL, auth-сервис, CORS, legacy-БД). |

**`telegram-mindmap-bot/`**
| Файл | Что делает |
|------|------------|
| `bot.py` | Точка входа: команды (`/start`, `/sync`, `/unsync`, `/status`) + планировщик (APScheduler). |
| `config.py` | Загрузка конфигурации из `.env` в dataclass. |
| `storage.py` | Локальное хранилище подписок (SQLite). |
| `sync_service.py` | Ядро синхронизации: читает MySQL MindMap, формирует сводку. |
| `guido_core_client.py` | Клиент auth-сервиса (связка Telegram ↔ пользователь). |
| `llm_client.py` | Клиент LLM-моста. |
| `requirements.txt` | Зависимости бота. |

</details>

---

## 🗄️ Модель данных (MySQL)

Таблицы создаются автоматически при старте API:
`users`, `projects`, `project_folders`, `project_shares`, `cards`, `connections`,
`checklists`, `deadlines`, `documents`, `user_notifications`, `legacy_sync_state`.

---

## ▶️ Запуск

**Backend (API):**
```bash
cd backend/mindmap-api
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install fastapi "uvicorn[standard]" SQLAlchemy PyMySQL httpx pydantic python-dotenv python-multipart
cp .env.example .env        # заполнить доступ к MySQL и auth-сервису
uvicorn app:app --host 0.0.0.0 --port 8088 --reload
```

**Telegram-бот:**
```bash
cd backend/telegram-mindmap-bot
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python bot.py
```

**Frontend:** модуль встраивается в React/Vite-оболочку Guido. Нужны токен в `localStorage`
(`guido_access_token`) и переменные `VITE_API_MINDMAP_BASE`, `VITE_CORE_TOKEN_KEY`.

---

## 🔐 Безопасность

`.env`, `*.sqlite3` и виртуальные окружения исключены через `.gitignore` — реальные секреты
в репозиторий не попадают, значения берутся из `.env.example`.
