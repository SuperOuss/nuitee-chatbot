# Nuitee hotel booking chatbot

PoC bot to book hotel in a conversation with the user. This first version validates the technical feasability of the concept. 

It's powered by [Nuitee liteAPI](https://www.liteapi.travel/)

It includes the following features: 

- Getting a list of hotels from Nuitee liteapi 
- Getting rates from Nuitee liteapi

The chatbot parses the city and country code from the information the user inputs, then parses the checkin and checkout dates.

# How to run

Have NodeJS installed, install all project dependencies.

- Using a terminal, browse to the client folder and run `npm run dev` 
- Open a second terminal window, browse to the server folder and run `npm run server`
- Open `localhost:5173`
