# TopGun Research

[![CI](https://github.com/GavrilovEgorOf/topgun-research/actions/workflows/ci.yml/badge.svg)](https://github.com/GavrilovEgorOf/topgun-research/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/demo-live-0ea5e9)](https://gavrilovegorof.github.io/topgun-research/demo.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **EN:** A procedural 3D combat arena where two neural agents **co-evolve via Evolution Strategies** (no backprop). Includes a deterministic simulator, Node.js training server with worker threads, Three.js research dashboard, WebSocket live feed, replay system, and a static demo on GitHub Pages.

> **RU:** Двухагентная 3D-арена с обучением нейросетей методом эволюционных стратегий — исследовательский стенд с live-визуализацией, реплеями и экспортом данных.

**Try it:** [Live demo](https://gavrilovegorof.github.io/topgun-research/demo.html) — no install required.

## Demo

| Страница | URL |
|----------|-----|
| **Online demo** (статика, без установки) | https://gavrilovegorof.github.io/topgun-research/demo.html |
| Лендинг | http://localhost:8080 |
| Исследовательский стенд (live) | http://localhost:8080/research.html |
| Теория (защита / отчёт) | http://localhost:8080/theory_for_uni/ |

![Landing hero](docs/screenshots/landing-hero.png)

| Реплей в 3D-арене | Панель исследования |
|-------------------|---------------------|
| ![Demo replay](docs/screenshots/demo-replay.png) | ![Training chart](docs/screenshots/demo-chart.png) |

## Быстрый старт

```bash
npm install
npm run dev      # UI + сервер обучения
npm test         # unit-тесты
npm run build    # production-сборка
```

Отдельные процессы:

```bash
npm run dev:ui   # только Vite (порт 8080)
npm run train    # только сервер обучения (порт 3001)
```

**Только static demo** (без Node-сервера обучения):

```bash
npm run build
npm run preview  # открыть /demo.html
```

Обновить demo-данные после локального обучения:

```bash
npm run export:demo   # пишет public/demo/ из data/
```

## Стек

| Слой | Технологии |
|------|------------|
| Симуляция | Чистый JS, фиксированный timestep 60 FPS |
| ML | MLP (28→40→32→5), ES: элита + кроссовер + гауссова мутация |
| Сервер | Node.js, worker_threads, WebSocket |
| UI | Vite, Three.js, Chart.js |

## Что умеет проект

- **Параллельная оценка** популяции в worker threads с автоподбором throughput
- **Live-трансляция** матча чемпионов и WebSocket-статус обучения
- **Визуализация «мозга»** — наблюдения, активации, веса (live и реплей)
- **Сравнение чекпоинтов** разных поколений на фиксированной карте
- **Экспорт CSV/JSON** для научного отчёта
- **Детерминированная симуляция** — одинаковый seed + веса → одинаковый исход
- **Static demo** — реплей, графики и сравнение чекпоинтов без backend

## Архитектура

```
shared/      ← ядро: физика, наблюдения, нейросеть, награды
server/      ← обучение, API, персистентность
src/         ← Three.js сцена и панель исследования
public/demo/ ← статический снимок для портфолио / GitHub Pages
tests/       ← unit-тесты (node:test)
```

Подробнее: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Методология обучения

| Аспект | Реализация |
|--------|------------|
| Карта | Случайный seed на каждый eval-матч; фиксированный `WORLD_SEED` для A/B чекпоинтов |
| Fitness | Убийство, урон, exploration, анти-пассивность; см. вкладку «Данные» |
| Статистика UI | Победы считаются только по матчам **чемпионов**, не по eval |
| Порядок хода | Чётные кадры — синий первым, нечётные — красный |

## API (сервер `:3001`, прокси через Vite)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/status` | Поколение, статистика, история |
| GET | `/api/brains` | Веса чемпионов |
| GET | `/api/replays` | Список лучших реплеев |
| POST | `/api/reset` | Сброс обучения |
| GET | `/api/export/history.csv` | CSV динамики по поколениям |
| WS | `/ws` | Live status + champion frames |

Мутирующие запросы (`POST`/`PUT`/`DELETE`) принимаются только с localhost при `TOPGUN_HOST=127.0.0.1`.

## Данные (`data/`)

Папка создаётся при первом запуске и **не коммитится**:

| Файл | Содержимое |
|------|------------|
| `state.json` | Популяции и чемпионы |
| `meta.json` | Статистика сессии, история графика |
| `replays.json` | Лучшие матчи с кадрами |
| `checkpoints/gen-*.json` | Снимки каждые 25 поколений |

Для отчёта — экспорт из вкладки «Данные» или `/api/export/*`. Для demo — `npm run export:demo`.

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `TOPGUN_HOST` | `127.0.0.1` | Адрес сервера |
| `TOPGUN_PORT` | `3001` | Порт сервера |
| `VITE_BASE` | `/` | Base path ассетов (для GitHub Pages: `/repo-name/`) |

## GitHub Pages

1. Запушьте репозиторий на GitHub.
2. **Settings → Pages → Source:** GitHub Actions.
3. Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) собирает и деплоит `demo.html`.
4. URL: `https://gavrilovegorof.github.io/topgun-research/demo.html`

CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — тесты и build на Node 20/22.

## Управление камерой

- **ЛКМ + перетаскивание** — панорама
- **Колёсико** — зум

## Структура репозитория

```
TopGun/
├── shared/           # Симуляция и ML
├── server/           # Training engine, REST, WebSocket
├── src/              # Frontend
├── public/demo/      # Static demo bundle (в git)
├── tests/            # Автотесты
├── docs/             # Архитектура + скриншоты
├── theory_for_uni/   # Теория для защиты
├── index.html        # Лендинг
├── demo.html         # Static demo
└── research.html     # Полный стенд
```

## License

[MIT](LICENSE)

---

**Author:** [Egor Gavrilov](https://github.com/GavrilovEgorOf) · Python Backend / ML / Platform Engineering · Open to remote EU/US
