# MOTOLAND

Проект разделен на публичный сайт и закрытую админ-панель.

## Запуск

```bash
cd C:\Users\Vadim\Desktop\diplom\motoland-site
npm install
npm start
```

Публичный сайт: http://localhost:3000

Админка: http://localhost:3000/control

Логин по умолчанию: `admin`

Пароль по умолчанию: `admin123`

## PostgreSQL

Если указать `DATABASE_URL` в `.env`, сервер сам создаст таблицы `motos` и `leads`.
Если `DATABASE_URL` пустой, данные сохраняются в `data/store.json`, чтобы проект запускался без базы.
