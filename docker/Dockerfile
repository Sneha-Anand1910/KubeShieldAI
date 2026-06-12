# Step 1: Start with an official, lightweight Python base image
FROM python:3.11-slim

# Step 2: Create and switch to a directory named /app inside the container
WORKDIR /app

# Step 3: Copy your dependency file from your PC into the container
COPY requirements.txt .

# Step 4: Run the install command inside the container
RUN pip install --no-cache-dir -r requirements.txt

# Step 5: Copy the rest of your local application code into the container
COPY . .

# Step 6: Inform Docker that the container listens on port 5000 at runtime
EXPOSE 5000

# Step 7: Define the command to start your Python application
CMD ["python", "app.py"]