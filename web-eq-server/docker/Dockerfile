# Use an official Python runtime as a parent image
FROM python:3.11-slim

RUN python -m pip install --upgrade pip

# Set the working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

# Expose port
EXPOSE 8008

# Command to run the application
# Use --reload for development (auto-reload on code changes)
# Remove --reload for production
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8008", "--reload"]

