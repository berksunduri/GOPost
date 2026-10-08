# Исправление отправки Query Parameters

## Проблема

При добавлении параметров запроса во вкладке **Params** в графическом интерфейсе GoPost, эти параметры не передавались на сервер при выполнении запроса. Запрос отправлялся только с «сырым» URL, без добавленных query-параметров.

### Причина

1. **Frontend**: Состояние `params` использовалось только для отображения `effectiveURL` в адресной строке, но никогда не включалось в payload при вызове `api.ExecuteRequestRaw` или при сохранении запроса через `api.UpdateRequest` / `api.CreateRequest`.
2. **Backend**: Модели `HTTPRequest` и `RequestFile` не имели поля для хранения параметров, а функция `executeHTTPRequest` не добавляла их к URL перед отправкой.

---

## Изменения

### 1. Модели данных (`app/pkg/models/models.go`)

```go
// Новый тип для query-параметра
type Param struct {
    Key     string `json:"key"`
    Value   string `json:"value"`
    Enabled bool   `json:"enabled"`
}

// Добавлено в HTTPRequest и RequestFile
Params []Param `json:"params,omitempty"`
```

### 2. Backend — параметры запросов (`app/app.go`)

- Расширены структуры параметров:
  - `CreateRequestParams` — добавлено поле `Params []models.Param`
  - `UpdateRequestParams` — добавлено поле `Params []models.Param`
  - `ExecuteRawParams` — добавлено поле `Params []models.Param`

- В `CreateRequest` и `UpdateRequest` параметры теперь сохраняются в хранилище.

- В `executeHTTPRequest` после подстановки переменных окружения (`envVars`) добавляются включённые параметры:

```go
if len(request.Params) > 0 {
    activeParams := make([]string, 0)
    for _, p := range request.Params {
        if p.Enabled && p.Key != "" {
            key := substituteVars(p.Key, envVars)
            value := substituteVars(p.Value, envVars)
            activeParams = append(activeParams,
                fmt.Sprintf("%s=%s", url.QueryEscape(key), url.QueryEscape(value)))
        }
    }
    if len(activeParams) > 0 {
        sep := "?"
        if strings.Contains(request.URL, "?") {
            sep = "&"
        }
        request.URL += sep + strings.Join(activeParams, "&")
    }
}
```

### 3. HTTP-роутер (`main.go`)

Обновлены обработчики:
- `POST /api/collections/{id}/requests` — создание запроса с `params`
- `PUT /api/requests/{id}` — обновление запроса с `params`

### 4. JavaScript API (`frontend/src/api.js`)

Методы теперь принимают и передают `params`:
- `CreateRequest(collectionId, name, method, url, headers, body, description, params)`
- `UpdateRequest(id, name, method, url, headers, body, description, params)`
- `UpdateRequestWithGraphQL(...params)`
- `ExecuteRequestRaw(payload)` — payload теперь может содержать `params`

### 5. Редактор запроса (`frontend/src/components/RequestEditor.jsx`)

- При отправке несохранённого запроса (`handleSend`) собираются `params` из состояния и включаются в payload.
- При сохранении/обновлении (`upsertRequest`) `params` передаются в соответствующие API-вызовы.
- Параметры фильтруются: отправляются только те, у которых заполнен `key`.

---

## Как это работает теперь

1. Пользователь открывает вкладку **Params**, добавляет пары `key=value`, отмечает галочку **Enabled**.
2. При нажатии **Send**:
   - Если запрос **не сохранён** — frontend отправляет `params` вместе с `ExecuteRequestRaw`.
   - Если запрос **сохранён** — frontend сначала сохраняет `params` через `UpdateRequest`, затем выполняет `ExecuteRequest(id, envVars)`.
3. Backend в `executeHTTPRequest`:
   - Подставляет переменные окружения в URL, body, headers.
   - **Добавляет к URL** все enabled-параметры (также с подстановкой переменных).
4. HTTP-клиент отправляет запрос уже с полным URL, включающим query-string.

---

## Совместимость

- Старые сохранённые запросы без поля `params` продолжают работать — поле `omitempty` делает его необязательным.
- Новые запросы сохраняют параметры в `.gopost.json` файлах.
- Переменные окружения (`{{var}}`) работают и в ключах, и в значениях параметров.

---

## Тестирование

### Ручная проверка

1. Создайте новый запрос: `GET https://httpbin.org/get`
2. Откройте вкладку **Params**, добавьте:
   - `foo = bar`
   - `baz = qux`
3. Нажмите **Send**.
4. В ответе httpbin.org будет показан полный URL с `?foo=bar&baz=qux`.

### Автоматические тесты

```bash
# Go unit-тесты
go test ./app/pkg/... -race -timeout 120s

# Frontend тесты
cd frontend && npm test
```

---

## Файлы, затронутые изменением

| Файл | Тип изменения |
|------|---------------|
| `app/pkg/models/models.go` | Новые типы и поля |
| `app/app.go` | Логика сохранения и исполнения |
| `main.go` | HTTP-обработчики |
| `frontend/src/api.js` | Клиентские методы API |
| `frontend/src/components/RequestEditor.jsx` | UI-логика отправки и сохранения |

---

## История

- **v1.11.1** — Исправлена отправка query parameters из вкладки Params