# MindMap

Full-stack сервис визуальных досок (mind maps): проекты, карточки на бесконечном
canvas, связи между ними, чек-листы, дедлайны, приоритеты, документы, шаринг досок
между пользователями и уведомления в реальном времени.

**Стек:** React 19 + Vite + Tailwind (фронтенд), FastAPI + SQLAlchemy + MySQL (бэкенд),
Telegram-бот на aiogram. Авторизация — через внешний сервис Guido.

> **Контекст.** MindMap — один из сервисов внутренней платформы **Guido** (hub, где под
> единой авторизацией собрано несколько инструментов). В этом репозитории выделен именно
> MindMap. Общая оболочка хаба (роутинг, экран логина, шапка) и центральный auth-сервис
> Guido сюда не входят — они описаны ниже как внешний контекст.

---

## Как это работает

<!-- Сюда вставить сгенерированную схему архитектуры, например:
![Архитектура MindMap](docs/architecture.png)
-->

Кратко поток данных:

1. Пользователь уже залогинен в оболочке Guido — она кладёт JWT-токен в `localStorage`.
2. Фронтенд MindMap читает этот токен и шлёт запросы к API с заголовком
   `Authorization: Bearer <token>`.
3. Запросы идут через nginx (`/mindmap/*`) на backend — **FastAPI** на порту 8088.
4. На каждый запрос API проверяет токен во внешнем auth-сервисе (`GET /auth/me`) и по id
   пользователя работает с данными в **MySQL** (проекты, карточки, связи, документы…).
5. Уведомления (дедлайны, новые доступы) прилетают на фронт по **SSE**-стриму.
6. Отдельно **Telegram-бот** раз в день синхронизирует задачи и умеет дергать LLM.

---

## Структура проекта

```
guido-mindmap/
├── frontend/mindmap/     — код сервиса (встраивается в общий React-UI Guido)
└── backend/
    ├── mindmap-api/          — REST API (FastAPI + MySQL)
    └── telegram-mindmap-bot/ — Telegram-бот синхронизации
```

---

## Frontend — `frontend/mindmap/`

Код именно сервиса MindMap, как он живёт внутри общего UI Guido. Это не отдельное
приложение: точки входа (`main.jsx`, роутинг, логин) и Tailwind-сборка приходят из
оболочки хаба. Внешние зависимости: `react`, `react-dom`, `lucide-react` (иконки),
`framer-motion` (анимации модалок).

### Точки входа и «умные» контейнеры

| Файл | Что делает | Почему так |
|------|------------|------------|
| `MindmapPage.jsx` | Ре-экспорт `MindmapPageContent`. | Тонкая «публичная» точка входа: оболочка импортирует стабильное имя `MindmapPage`, а внутренняя реализация может меняться. |
| `MindmapPageContent.jsx` | **Витрина проектов.** Список проектов и папок, закрепление, тема light/dark, CRUD проектов, архивация, управление доступами (шаринг), лента уведомлений. Здесь же все `fetch` к API проектов. | Главный контейнер уровня «список». Держит состояние и сетевые вызовы, чтобы дочерние компоненты оставались «глупыми» (presentational). |
| `ProjectBoard.jsx` | Ре-экспорт `ProjectBoardContent`. | Та же схема «фасад → реализация», что и у `MindmapPage`. |
| `ProjectBoardContent.jsx` | **Доска проекта.** Карточки на canvas (координаты + размеры), связи (рёбра), drag&drop, зум, чек-листы, дедлайны, прикрепление документов. Все `fetch` к API доски/карточек/документов. | Второй крупный контейнер уровня «доска». Разделение «список ↔ доска» держит каждый файл в разумных пределах и грузит тяжёлую доску только когда она открыта. |

### Хук уведомлений

| Файл | Что делает | Почему так |
|------|------------|------------|
| `useMindmapHubNotifications.js` | Считает дедлайны/доступы, слушает **SSE** (`/api/notifications/stream`), при обрыве — polling раз в 60 c. Хранит прочитанные в `localStorage`. | Вынесен в отдельный хук, потому что уведомления нужны и в колокольчике оболочки, и внутри сервиса — переиспользуемая логика без дублирования. |

### Утилиты — `utils/`

| Файл | Что делает | Почему так |
|------|------------|------------|
| `boardMetrics.js` | Метрики и подписи: важность/срочность (`IMPORTANCE_LABELS`, `URGENCY_LABELS`), расчёт приоритета задач, прогресс по дереву доски, сортировка. | Чистые функции без React — их удобно тестировать и переиспользовать в карточках, дереве и модалках. |
| `mindmapPageUtils.js` | Хелперы витрины: генерация локальных id, форматирование дат, сбор задач по проектам (`collectProjectTasks`). | Отделяет «расчётную» логику списка проектов от рендера. |
| `projectBoardUtils.js` | Хелперы доски: генерация id карточек, геометрия связей (`oppositeSide`), нормализация размеров карточек, `clamp`. | Геометрия и id-логика доски вынесены отдельно, чтобы не раздувать `ProjectBoardContent`. |

### Общие UI-компоненты — `components/`

| Файл | Что делает |
|------|------------|
| `common/MindmapUi.jsx` | Базовые UI-примитивы сервиса: `IconBtn`, `Button`, `Modal`, `Pill`, `ConfirmTopSheet` (с поддержкой темы light/dark и анимаций framer-motion). Единый «дизайн-язык» mindmap. |
| `AddCardModal.jsx` | Модалка создания карточки на доске. |
| `CardDetailsModal.jsx` | Модалка деталей карточки: важность/срочность, чек-лист, дедлайн, цвет, картинки, вложения, архивация. |
| `BoardCardShell.jsx` | Обёртка карточки на доске: позиционирование, определение стороны для связи, точки-«якоря» (+) для протягивания рёбер. |
| `BoardCard.jsx` | Визуальная карточка: заголовок, приоритет, прогресс чек-листа, иконки вложений/дедлайна. |
| `BoardEdges.jsx` | Отрисовка связей между карточками (SVG-кривые с учётом сторон/направлений). |
| `BoardTreePanel.jsx` → `BoardTreePanelContent.jsx` | Боковая панель «дерево доски»: карточки и задачи списком, прогресс, сортировка по приоритету (фасад + реализация). |

### Подпапки компонентов

**`components/board-tree/`** — элементы панели-дерева:
| Файл | Что делает |
|------|------------|
| `BoardCardTreeItem.jsx` | Строка карточки в дереве. |
| `BoardTreeTaskItem.jsx` | Строка отдельной задачи (чек-лист-пункта). |
| `BoardTreeProgressModal.jsx` | Модалка сводного прогресса по дереву. |

**`components/project-board/`** — части экрана доски (разбит на куски для читаемости):
| Файл | Что делает |
|------|------------|
| `ProjectBoardScene.jsx` | «Сцена» доски — собирает canvas, карточки и связи вместе. |
| `BoardCanvas.jsx` | Сам canvas: панорамирование, зум, сетка. |
| `BoardZoomControls.jsx` | Кнопки управления масштабом. |
| `ProjectBoardHeader.jsx` | Шапка доски (название проекта, действия). |
| `ProjectBoardSidebar.jsx` | Боковая панель доски. |
| `ProjectBoardDialogs.jsx` | Набор диалогов/модалок доски в одном месте. |

**`components/projects/`** — элементы витрины проектов:
| Файл | Что делает |
|------|------------|
| `ProjectCard.jsx` | Карточка проекта в списке. |
| `ProjectFormModal.jsx` | Создание/редактирование проекта. |
| `ProjectAccessModal.jsx` | Управление доступами (шаринг проекта). |
| `TasksOverviewModal.jsx` | Сводка задач по проекту. |
| `KpiCard.jsx` | Плитка с метрикой (KPI) на витрине. |

> **Почему так разбито.** Два тяжёлых экрана (список и доска) вынесены в контейнеры
> `*Content.jsx`, вся расчётная логика — в `utils/` (чистые функции), а UI разложен по
> папкам `common / projects / project-board / board-tree`. Это держит файлы небольшими,
> убирает дублирование и позволяет переиспользовать примитивы.

---

## Backend — `backend/`

### `mindmap-api/` — REST API

| Файл | Что делает | Почему так |
|------|------------|------------|
| `app.py` | **Всё API в одном модуле (~2900 строк):** подключение к MySQL (SQLAlchemy Core + PyMySQL), автосоздание таблиц при старте (`_ensure_*`, идемпотентный `CREATE TABLE IF NOT EXISTS`), проверка токена во внешнем auth-сервисе (`_core_me` → `GET /auth/me`), все эндпоинты проектов/досок/карточек/документов/уведомлений (в т.ч. SSE-стрим), опциональная синхронизация со старой версией сервиса. | Один файл — осознанный компромисс: сервис компактный, без ORM-моделей и миграций (схема создаётся сама), что упрощает деплой. Разнесение на модули — очевидный следующий шаг рефакторинга. |
| `.env.example` | Шаблон переменных окружения (доступ к MySQL, URL auth-сервиса, CORS, legacy-БД). | Реальный `.env` с паролями в репозиторий не коммитится. |
| `README.md` | Детали бэкенда: модель данных, эндпоинты, запуск. | — |

### `telegram-mindmap-bot/` — Telegram-бот

Отдельный процесс: раз в день синхронизирует задачи между досками MindMap и Telegram,
умеет обращаться к LLM. Стандартная библиотека для HTTP + `pymysql` + `httpx`.

| Файл | Что делает |
|------|------------|
| `bot.py` | Точка входа: команды бота (`/start`, `/sync`, `/unsync`, `/status`), планировщик ежедневной синхронизации (APScheduler). |
| `config.py` | Загрузка конфигурации из `.env` в типизированный dataclass (токен, адреса API/БД, расписание). |
| `storage.py` | Локальное хранилище подписок в SQLite (какая группа/тема подписана на sync). |
| `sync_service.py` | Ядро синхронизации: читает данные из MySQL MindMap, формирует сводку, обновляет состояние. |
| `guido_core_client.py` | Клиент внешнего auth-сервиса Guido (связка Telegram-аккаунта с пользователем). |
| `llm_client.py` | Клиент LLM-моста (отправка запросов к языковой модели). |
| `requirements.txt` | Зависимости бота (`aiogram`, `APScheduler`, `pymysql`, `httpx`, `python-dotenv`). |
| `.env.example` | Шаблон переменных (токен бота, адреса, секреты LLM). |
| `README.md` | Описание команд и запуска бота. |

---

## Модель данных (MySQL)

Таблицы создаются автоматически при старте API (функции `_ensure_*` в `app.py`) —
отдельные миграции не нужны:

| Таблица | Назначение |
|---------|------------|
| `users` | Локальные пользователи (маппинг на id из auth-сервиса). |
| `projects` | Проекты (майндмапы). |
| `project_folders` | Папки для группировки проектов. |
| `project_shares` | Доступы к проекту (шаринг между пользователями). |
| `cards` | Карточки на доске (координаты, размеры, приоритет). |
| `connections` | Связи (рёбра) между карточками. |
| `checklists` | Чек-листы / подзадачи внутри карточек. |
| `deadlines` | Дедлайны. |
| `documents` | Прикреплённые файлы/документы к карточкам. |
| `user_notifications` | Уведомления (дедлайны, новые доступы). |
| `legacy_sync_state` | Состояние синхронизации со старой версией сервиса. |

---

## Основные эндпоинты API (`/api`)

```
GET    /health
GET    /api/projects            GET /api/projects/me
POST   /api/projects            PUT /api/projects/{id}    DELETE /api/projects/{id}
POST   /api/projects/{id}/archive
GET    /api/project-folders/me  POST /api/project-folders
PUT    /api/project-folders/{id}  DELETE /api/project-folders/{id}
GET    /api/projects/{id}/shares  POST /api/projects/{id}/shares
DELETE /api/projects/{id}/shares/{userId}
GET    /api/projects/{id}/board
POST   /api/projects/{id}/cards  PUT /api/projects/{id}/cards/{cardId}
DELETE /api/projects/{id}/cards/{cardId}
POST   /api/projects/{id}/cards/{cardId}/documents
DELETE /api/projects/{id}/cards/{cardId}/documents/{docId}
GET    /api/notifications        POST /api/notifications/read
GET    /api/notifications/stream   (Server-Sent Events)
```

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

**Telegram-бот:**
```bash
cd backend/telegram-mindmap-bot
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python bot.py
```

**Frontend:** модуль встраивается в React/Vite-оболочку Guido. Для работы нужны токен в
`localStorage` (`guido_access_token`) и переменные окружения `VITE_API_MINDMAP_BASE`,
`VITE_CORE_TOKEN_KEY`.

---

## Безопасность

`.env`, `*.sqlite3` и виртуальные окружения исключены через `.gitignore` — реальные
секреты (пароли БД, токен бота) в репозиторий не попадают; значения берутся из
`.env.example`. В продакшене стоит ограничивать `CORS_ORIGINS` вместо `*`.
