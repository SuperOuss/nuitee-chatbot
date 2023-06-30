# Use an official Node runtime as the base image
FROM node:14

# Set the working directory in the container to /server
WORKDIR /server

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the application dependencies
RUN npm install

# Copy the rest of your server code to the working directory
COPY . .

# Make port 3000 available to the world outside this container
EXPOSE 8080

# Run the application when the container launches. 
# Here we use the custom npm script you mentioned
CMD [ "npm", "run", "server" ]
