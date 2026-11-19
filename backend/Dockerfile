# LendWise API: FastAPI + scikit-learn 1.9.1 (the models were saved with this exact version)
FROM python:3.13-slim AS base

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
    OMP_NUM_THREADS=1 \
    PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/v1/health', timeout=4)"

# The two models and the range guard are small (about 1 MB); one worker fits a 512 MB instance.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
