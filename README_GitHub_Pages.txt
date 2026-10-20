Настройка GitHub Pages для репозитория posledniy-zachet

1. Скопируйте vite.config.ts в корень проекта — рядом с package.json.
2. В терминале проекта выполните:
   npm ci
   npm run build
3. Для публикации используйте содержимое папки dist, либо GitHub Actions workflow, который запускает npm ci и npm run build и публикует dist.

Конфиг сохраняет исходные игровые файлы и механики. Он задаёт base /posledniy-zachet/ и переписывает абсолютные ссылки на /assets/, /audio/, /video/ и /fonts/ в собранных файлах, чтобы они работали в подпапке GitHub Pages.
