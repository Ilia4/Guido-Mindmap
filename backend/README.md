# MindMap Backend

Backend сервиса **MindMap** — визуальные доски (canvas) с проектами, карточками,
связями, чек-листами, дедлайнами, документами, шарингом доступов и уведомлениями.

REST API на **FastAPI** + собственная **MySQL**-база. Авторизация делегируется внешнему
auth-сервису (проверка Bearer-токена). В комплекте — Telegram-бот для синхронизации
задач и интеграции с LLM.

> Репозиторий содержит только backend. Фронтенд (React/Vite) — отдельный проект и
> обращается к этому API по HTTP.

---

## Состав репозитория

```
mindmap-backend/
├── mindmap-api/              # Основной REST API (FastAPI)
│   ├── app.py                # Приложение (~2900 строк)
│   └── .env.example          # Шаблон переменных окружения
└── telegram-mindmap-bot/     # Telegram-бот: синхронизация задач + LLM
    ├── bot.py                # Точка входа (aiogram)
    ├── config.py             # Загрузка конфигурации из .env
    ├── storage.py            # Локальное хранилище (SQLite)
    ├── sync_service.py       # Синхронизация с MindMap API и БД
    ├── guido_core_client.py  # Клиент внешнего auth-сервиса
    ├── llm_client.py         # Клиент LLM-моста
    ├── requirements.txt
    └── .env.example
```

---

## Технологический стек

| Компонент      | Технология                                    |
|----------------|-----------------------------------------------|
| API-фреймворк  | FastAPI + Uvicorn                             |
| Работа с БД    | SQLAlchemy 2.0 (Core, `text()`) + PyMySQL     |
| База данных    | MySQL                                         |
| Авторизация    | Внешний auth-сервис (эндпоинт `/auth/me`)     |
| HTTP-клиент    | httpx                                          |
| Бот            | aiogram 3 + APScheduler + SQLite              |
| Python         | 3.11+                                          |

---

## Архитектура

```
                 ┌──────────────┐
   Браузер  ───► │  Фронтенд    │  (отдельный проект)
                 └──────┬───────┘
                        │  Authorization: Bearer <token>
                        ▼
                 ┌──────────────────────┐        ┌───────────────────┐
                 │   MindMap API        │ ─────►  │  Auth-сервис      │
                 │   FastAPI / Uvicorn  │ /auth/me│  (внешний)        │
                 │   :8088              │ ◄─────  └───────────────────┘
                 └───┬──────────────┬───┘
                     │              │
             ┌───────▼──────┐  ┌────▼───────────────────────┐
             │  MySQL       │  │  Legacy MySQL (опционально) │
             │  (mindmap)   │  │  синхронизация со старой    │
             └──────────────┘  │  версией сервиса            │
                               └─────────────────────────────┘

   ┌────────────────────────┐
   │  Telegram-бот          │ ──► MindMap API + MySQL + LLM-мост
   │  aiogram + APScheduler │
   └────────────────────────┘
```

Компоненты общаются по HTTP; конкретные адреса задаются через переменные окружения.

### Аутентификация

Собственных паролей API не хранит. Клиент присылает `Authorization: Bearer <token>`,
API вызывает `GET {AUTH_SERVICE_URL}/auth/me`. Если сервис подтверждает токен —
по возвращённому user id находится/создаётся локальный пользователь
(`_ensure_local_user`). Любой совместимый auth-сервис, реализующий `/auth/me`
(возвращающий JSON с id/email пользователя), подойдёт.

---

## Модель данных (MySQL)

Таблицы создаются автоматически при старте (функции `_ensure_*` в `app.py`,
идемпотентный `CREATE TABLE IF NOT EXISTS` — миграции не нужны):

| Таблица              | Назначение                                         |
|----------------------|----------------------------------------------------|
| `users`              | Локальные пользователи (маппинг на внешний id)     |
| `projects`           | Проекты (майндмапы)                                |
| `project_folders`    | Папки для группировки проектов                     |
| `project_shares`     | Доступы к проекту (шаринг между пользователями)    |
| `cards`              | Карточки на доске                                  |
| `connections`        | Связи (рёбра) между карточками                     |
| `checklists`         | Чек-листы / подзадачи внутри карточек              |
| `deadlines`          | Дедлайны                                           |
| `documents`          | Прикреплённые файлы/документы к карточкам          |
| `user_notifications` | Уведомления (дедлайны, новые доступы)              |
| `legacy_sync_state`  | Состояние синхронизации со старой версией          |

Опционально подключается legacy-база для миграции/синхронизации данных из предыдущей
версии сервиса (переменные `LEGACY_*`, можно отключить `LEGACY_SYNC_ENABLED=0`).

---

## Основные эндпоинты

Базовый префикс — `/api`.

```
GET    /health
GET    /api/projects                      GET  /api/projects/me
POST   /api/projects                      PUT  /api/projects/{id}
DELETE /api/projects/{id}                 POST /api/projects/{id}/archive
GET    /api/project-folders/me            POST /api/project-folders
PUT    /api/project-folders/{id}          DELETE /api/project-folders/{id}
GET    /api/projects/{id}/shares          POST /api/projects/{id}/shares
DELETE /api/projects/{id}/shares/{userId}
GET    /api/projects/{id}/board
POST   /api/projects/{id}/cards           PUT  /api/projects/{id}/cards/{cardId}
DELETE /api/projects/{id}/cards/{cardId}
POST   /api/projects/{id}/cards/{cardId}/documents
DELETE /api/projects/{id}/cards/{cardId}/documents/{docId}
GET    /api/notifications                 POST /api/notifications/read
GET    /api/notifications/stream          (Server-Sent Events)
```

Уведомления умеют работать через SSE (`/api/notifications/stream`).

---

## Переменные окружения

### `mindmap-api/.env` (см. `.env.example`)

| Переменная                  | Описание                                            |
|-----------------------------|-----------------------------------------------------|
| `DB_HOST/PORT/NAME/USER/PASS` | Основная БД MySQL                                 |
| `GUIDO_CORE_URL`            | Базовый URL внешнего auth-сервиса (`/auth/me`)      |
| `CORS_ORIGINS`              | Разрешённые origin'ы (через запятую, или `*`)       |
| `LEGACY_DB_NAME/USER/PASS`  | Legacy-база для синхронизации (опционально)         |
| `LEGACY_SYNC_ENABLED`       | `0` чтобы отключить legacy-синхронизацию            |
| `LEGACY_SYNC_VERSION`       | Версия алгоритма синхронизации                      |
| `MINDMAP_LEGACY_UPLOAD_DIR` | Каталог загруженных файлов старой версии            |

### `telegram-mindmap-bot/.env` (см. `.env.example`)

`BOT_TOKEN`, `GUIDO_CORE_BASE`, `MINDMAP_API_BASE`, `MINDMAP_DB_*`,
`LLM_BRIDGE_URL/SECRET`, `LLM_PROVIDER/MODEL`, `SYNC_HOUR/MINUTE` (ежедневная
синхронизация через APScheduler).

---

## Локальный запуск

### API

```bash
cd mindmap-api
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install fastapi "uvicorn[standard]" SQLAlchemy PyMySQL httpx pydantic \
            python-dotenv python-multipart
cp .env.example .env              # заполни значения
uvicorn app:app --host 0.0.0.0 --port 8088 --reload
```

Нужны доступный MySQL и рабочий auth-сервис для проверки токенов. Таблицы БД
создадутся автоматически при первом запросе.

### Telegram-бот

```bash
cd telegram-mindmap-bot
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # заполни BOT_TOKEN и адреса
python bot.py
```

---

## Деплой (пример через systemd)

```ini
# /etc/systemd/system/mindmap-api.service
[Service]
WorkingDirectory=/opt/mindmap-api
EnvironmentFile=/opt/mindmap-api/.env
ExecStart=/opt/mindmap-api/.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8088
Restart=always
```

Перед сервисом обычно ставят reverse-proxy (nginx) с TLS, который также должен
проксировать `Upgrade`/`Connection` для SSE-стрима уведомлений.

---

## Безопасность

- `.env`, `*.sqlite3` и venv исключены через `.gitignore` — секреты в репозиторий
  не попадают. Реальные значения храни только в своём окружении.
- API доверяет внешнему auth-сервису; ограничивай `CORS_ORIGINS` в продакшене
  вместо `*`.
