# 🐾 PawFinance — Финансовый трекер

## 🚀 Быстрый старт (10 минут)

---

### Шаг 1: Создайте Firebase проект

1. Зайдите на [firebase.google.com](https://firebase.google.com) → **Get Started**
2. Создайте новый проект (можно без Google Analytics)
3. **Authentication** → Sign-in method → **Email/Password** → Включить → Сохранить
4. **Firestore Database** → Create database → **Start in test mode** → выберите регион → Done
5. **Project Settings** (⚙️ иконка) → вкладка **Your apps** → нажмите `</>` (Web)
6. Дайте имя приложению → Register app → скопируйте `firebaseConfig`

---

### Шаг 2: Вставьте config в index.html

Откройте `index.html` и найдите строку:
```
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  ...
```

Замените на ваши данные из Firebase:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

### Шаг 3: Разместите на хостинге

#### Netlify (рекомендуется, 2 минуты):
1. Зайдите на [netlify.com](https://netlify.com) → Log in
2. Перетащите папку `pawfinance/` прямо на страницу
3. Получите ссылку вида `https://random-name.netlify.app`
4. **Важно**: Firebase Console → Authentication → Settings → **Authorized domains** → Add domain → вставьте ваш netlify домен

#### GitHub Pages:
1. Создайте репозиторий на GitHub
2. Загрузите все файлы из папки `pawfinance/`
3. Settings → Pages → Source: Deploy from branch → main → / (root)
4. Добавьте домен `username.github.io` в Firebase Authorized domains

#### Vercel:
1. [vercel.com](https://vercel.com) → Import Git Repository
2. Загрузите через GitHub
3. Deploy → ваш сайт готов

---

## ✅ Что умеет PawFinance

| Функция | ✅ |
|---|---|
| 🔐 Вход по email + PIN | ✅ |
| 🌐 Синхронизация между устройствами | ✅ Firebase |
| 🐾 Иконки-лапки | ✅ |
| ❤️ Health bar из сердечек + % | ✅ |
| 📊 % доходов и расходов | ✅ |
| 📋 История по дням/неделям/месяцам | ✅ |
| 🗂️ Категории с отдельной историей | ✅ |
| 📅 Дневной лимит (фиксируется на день) | ✅ |
| 🚨 Красная тревога при превышении лимита | ✅ |
| 🎯 Страница целей накопления | ✅ |
| 💱 Выбор валюты (₸, ₽, $, €) | ✅ |
| ➕ Добавление своих категорий | ✅ |
| 📊 Диаграмма расходов по категориям | ✅ |

---

## 💡 Как пользоваться

1. **Первый вход**: введите email и придумайте PIN (4-6 цифр) → аккаунт создастся автоматически
2. **Добавить транзакцию**: нажмите кнопку `+` внизу справа
3. **Дневной лимит**: кнопка 📅 в шапке — установите лимит (только раз в день)
4. **Категории**: вкладка 🗂️ — нажмите на категорию для просмотра истории
5. **Цели**: вкладка 🎯 — добавляйте цели и пополняйте их

---

## 🔒 Правила Firebase (Firestore Security Rules)

После тестирования замените правила на более безопасные:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Зайдите: Firestore → Rules → вставьте и нажмите Publish.
