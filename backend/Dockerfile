# LendWise API — FastAPI + scikit-learn 1.6.1 (the model was pickled with this exact version)
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

RUN useradd --create-home --uid 10001 lendwise && mkdir -p /data && chown lendwise /data

COPY --chown=lendwise app ./app
COPY --chown=lendwise scripts ./scripts
COPY --chown=lendwise tests ./tests

USER lendwise
ENV DATABASE_URL=sqlite:////data/lendwise.db \
    PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/v1/health', timeout=4)"

# One worker: the Random Forest takes ~0.5–1 GB RAM per process.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
