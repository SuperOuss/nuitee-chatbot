# Use an official Node runtime as the base image
FROM node:20

# Set the working directory in the container to /server
WORKDIR /server

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the application dependencies
RUN npm install

# Install Redis
RUN apt-get update && apt-get install -y redis-server

# Copy the rest of your server code to the working directory
COPY . .

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Expose Redis port
EXPOSE 6379

# Start Redis and run the application when the container launches
CMD service redis-server start && npm run server
