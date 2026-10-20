# Последний зачёт

Браузерная визуальная новелла на TypeScript и Vite.

## Разработка

Node.js 22+ и npm. CI использует Node 22; облачная среда проверена на Node 24.

```bash
npm ci
npm run dev
```

Редактируйте `src/`, `index.html` и `public/`. `public` — единственный исходный каталог статических ресурсов. `dist` создаётся автоматически при сборке и не хранится в Git, как и `node_modules`.

```bash
npm run build
npm run test:assets
npm run preview
```

Production-сборка использует базовый путь `/posledniy-zachet/`. GitHub Actions собирает проект из исходников, проверяет ссылки на ресурсы и публикует `dist` в GitHub Pages. В настройках Pages должен быть выбран источник **GitHub Actions**.

## Браузерные проверки

```bash
npx playwright install chromium
npm test
```

Тесты сами собирают игру и запускают preview на порту 4175. Если Chromium уже установлен, можно указать путь:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm test
```

## Ресурсы

Полноразмерные изображения используют WebP **без потерь**, миниатюры — `srcset`. Музыка и видео загружаются по мере использования. Новые аудиообъекты создавайте через `createAudio` из `src/media.ts`, чтобы не загружать поздние сцены при открытии меню.

Для обработки новых PNG установите Pillow с поддержкой WebP и запустите:

```bash
python3 scripts/optimize-images.py
python3 scripts/generate-thumbnails.py
npm run build
npm run test:assets
```

Конвертер проверяет совпадение пикселей перед удалением PNG и обновляет расширения в ссылках проекта, в том числе шаблонных. Перед его запуском сохраните исходники в Git. Генератор миниатюр не заменяет полноразмерные изображения.

Результаты и ограничения проверки: [PERFORMANCE.md](PERFORMANCE.md).
