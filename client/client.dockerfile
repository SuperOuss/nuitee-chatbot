# Use an official Node runtime as the base image
FROM node:14

# Set the working directory in the container to /client
WORKDIR /client

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the application dependencies
RUN npm install

# Copy the rest of your client code to the working directory
COPY . .

# Build the app for production
RUN npm run build

# Expose the port your app runs on
EXPOSE 5173

# Serve the app using Vite
CMD [ "npm", "run", "dev" ]
