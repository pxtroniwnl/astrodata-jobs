# Contribuir a astro-data jobs

Gracias por tu interés en contribuir. Este proyecto es una herramienta personal/educativa para analizar el mercado de empleo data, pero abrimos las puertas a mejoras, correcciones y nuevas ideas.

## Cómo empezar

1. Haz **fork** del repositorio
2. Clona tu fork: `git clone git@github.com:TU_USUARIO/astrodata-jobs.git`
3. Crea una rama para tu cambio: `git checkout -b feature/nombre-del-cambio`
4. Instala dependencias: `uv sync`
5. Haz tus cambios y verifica que el backend arranca: `uv run uvicorn backend.main:app --port 8000`
6. Commitea con un mensaje claro: `git commit -m "feat: descripción corta"`
7. Push a tu fork: `git push origin feature/nombre-del-cambio`
8. Abre un **Pull Request** contra `main`

## Áreas de contribución

- **Backend (FastAPI)** — nuevos endpoints, optimización del CV tailoring, mejor parsing de CVs
- **Dashboard** — nuevas gráficas, filtros, mejoras de UX, animaciones
- **Roadmaps** — nuevos roles, recursos actualizados, mejor contenido
- **Scraping** — fuentes de datos adicionales, mejora del enriquecimiento
- **Docs** — correcciones, traducciones, tutoriales
- **Bug fixes** — siempre bienvenidos

## Reglas

- No secrets ni API keys en el código
- Mantener el estilo existente (dark theme, glass morphism, clean & minimal)
- El backend debe mantenerse sin persistencia de CVs (todo en memoria)
- Testear que el dashboard carga correctamente antes de abrir PR

## Stack

- **Backend**: Python 3.12+ / FastAPI / uvicorn
- **Frontend**: HTML + CSS vanilla + JavaScript vanilla (sin framework)
- **Data**: Python scripts / pandas
- **CV Tailoring**: Google Gemini free tier
- **Dependencias**: gestionadas con `uv`

## Preguntas?

Abre un issue con la etiqueta `question` o escríbenos directamente.
