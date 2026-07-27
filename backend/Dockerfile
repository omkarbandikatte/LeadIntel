# Build context is the repo root (see infra/docker-compose.yml) so this image
# can include infra/celerybeat_schedule.py and ml/ alongside backend/ —
# app/core/config.py resolves relative paths (ML artifacts, CRM sync dirs)
# against this same layout whether running locally or in this container.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements-heavy.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && pip install --no-cache-dir -r backend/requirements-heavy.txt \
    && python -m spacy download en_core_web_sm

COPY backend/ ./backend/
COPY infra/ ./infra/
COPY ml/ ./ml/

WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
