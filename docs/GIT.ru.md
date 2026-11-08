# Работа с git: шпаргалка

Ветки: `main` (выложено) · `develop` (текущая работа) · `feature/<имя>` · `release/<версия>` · `hotfix/<описание>`.

## Новая функция
```
git checkout develop && git pull
git checkout -b feature/puzzle-rush
# ... работа ...
git add -A && git commit -m "feat: puzzle rush"
git push -u origin feature/puzzle-rush
```
Дальше на GitHub: Pull Request `feature/puzzle-rush` → `develop`, дождаться зелёной проверки, Squash and merge, удалить ветку.

## Релиз
```
git checkout develop && git pull
git checkout -b release/0.9.0
# версия в package.json и в подвале сайта, CHANGELOG: [Unreleased] → [0.9.0]
git commit -am "chore: release 0.9.0" && git push -u origin release/0.9.0
```
Pull Request `release/0.9.0` → `main`, merge. Затем:
```
git checkout main && git pull
git tag -a v0.9.0 -m "Release 0.9.0" && git push origin v0.9.0
git checkout develop && git merge main && git push
```
На GitHub: Releases → Draft a new release → тег `v0.9.0`, текст из CHANGELOG.

## Срочное исправление
```
git checkout main && git pull && git checkout -b hotfix/описание
# правка, версия 0.9.1
```
Pull Request в `main`, тег `v0.9.1`, потом слить `main` в `develop`.

Сообщения коммитов: `feat:` новая функция · `fix:` исправление · `docs:` документация · `chore:` прочее.
