FROM python:3.11-slim

WORKDIR /app

# Install deps first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8000

# GEMINI_API_KEY is injected at runtime via Kubernetes Secret — never baked into image
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]