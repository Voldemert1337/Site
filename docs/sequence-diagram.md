# Диаграмма последовательностей проекта MOTOLAND

## Назначение диаграммы

Диаграмма последовательностей показывает порядок взаимодействия между участниками системы MOTOLAND во времени.

В диаграмме рассматривается основной сценарий:

1. Покупатель открывает сайт и отправляет заявку.
2. Backend сохраняет заявку в PostgreSQL.
3. Администратор входит в закрытую панель.
4. Backend проверяет авторизацию.
5. Администратор просматривает заявки и меняет статус.
6. Backend обновляет данные в PostgreSQL.

## Участники

| Участник | Описание |
|---|---|
| `Покупатель` | Пользователь публичного сайта |
| `Публичный сайт` | Frontend-часть сайта MOTOLAND |
| `Backend API` | Серверная часть на Node.js / Express |
| `PostgreSQL` | База данных проекта |
| `Администратор` | Пользователь закрытой панели управления |
| `Админ-панель` | Интерфейс управления заявками и каталогом |

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber

    actor Buyer as Покупатель
    participant Public as Публичный сайт
    participant API as Backend API
    database DB as PostgreSQL
    actor Admin as Администратор
    participant Panel as Админ-панель

    Buyer->>Public: Открывает сайт
    Public->>API: GET /api/motos
    API->>DB: SELECT * FROM motos WHERE active = true
    DB-->>API: Список мотоциклов
    API-->>Public: JSON с каталогом
    Public-->>Buyer: Отображает каталог

    Buyer->>Public: Заполняет форму заявки
    Buyer->>Public: Нажимает "Отправить заявку"
    Public->>Public: Проверка обязательных полей

    alt Данные заполнены корректно
        Public->>API: POST /api/leads
        API->>API: Валидация данных заявки
        API->>DB: INSERT INTO leads
        DB-->>API: Заявка сохранена
        API-->>Public: 201 Created
        Public-->>Buyer: Сообщение об успешной отправке
    else Ошибка заполнения формы
        Public-->>Buyer: Сообщение об ошибке
    end

    Admin->>Panel: Открывает /control
    Panel-->>Admin: Форма авторизации
    Admin->>Panel: Вводит логин и пароль
    Panel->>API: POST /api/admin/login
    API->>API: Проверка логина и пароля

    alt Авторизация успешна
        API-->>Panel: Set-Cookie с JWT
        Panel-->>Admin: Переход в /control/panel
        Panel->>API: GET /api/admin/leads
        API->>API: Проверка JWT
        API->>DB: SELECT * FROM leads ORDER BY created_at DESC
        DB-->>API: Список заявок
        API-->>Panel: JSON со списком заявок
        Panel-->>Admin: Отображает заявки
    else Неверные данные
        API-->>Panel: 401 Unauthorized
        Panel-->>Admin: Ошибка авторизации
    end

    Admin->>Panel: Меняет статус заявки
    Panel->>API: PATCH /api/admin/leads/:id
    API->>API: Проверка JWT
    API->>DB: UPDATE leads SET status = ...
    DB-->>API: Статус обновлен
    API-->>Panel: OK
    Panel-->>Admin: Обновленный статус отображен
```

## Дополнительная диаграмма: добавление мотоцикла администратором

```mermaid
sequenceDiagram
    autonumber

    actor Admin as Администратор
    participant Panel as Админ-панель
    participant API as Backend API
    database DB as PostgreSQL
    participant Public as Публичный сайт

    Admin->>Panel: Открывает раздел "Новая модель"
    Admin->>Panel: Заполняет данные мотоцикла
    Admin->>Panel: Нажимает "Добавить модель"
    Panel->>API: POST /api/admin/motos
    API->>API: Проверка JWT
    API->>API: Валидация данных модели

    alt Данные корректны
        API->>DB: INSERT INTO motos
        DB-->>API: Модель сохранена
        API-->>Panel: 201 Created
        Panel-->>Admin: Сообщение "Модель добавлена"
        Public->>API: GET /api/motos
        API->>DB: SELECT * FROM motos WHERE active = true
        DB-->>API: Обновленный каталог
        API-->>Public: JSON с новой моделью
    else Данные заполнены неверно
        API-->>Panel: 400 Bad Request
        Panel-->>Admin: Сообщение об ошибке
    end
```

## Описание основного потока

| Шаг | Описание |
|---|---|
| 1 | Покупатель открывает публичный сайт |
| 2 | Frontend запрашивает каталог у Backend API |
| 3 | Backend получает данные из PostgreSQL |
| 4 | Покупатель отправляет заявку |
| 5 | Backend проверяет и сохраняет заявку |
| 6 | Администратор авторизуется в закрытой панели |
| 7 | Backend проверяет JWT-токен администратора |
| 8 | Администратор получает список заявок |
| 9 | Администратор меняет статус заявки |
| 10 | Backend обновляет статус заявки в PostgreSQL |

## Итог

Диаграмма последовательностей показывает, как публичная часть сайта, закрытая админ-панель, серверная часть и база данных PostgreSQL взаимодействуют между собой при отправке и обработке заявки.
