import * as dotenv from 'dotenv';
import express, { json } from 'express';
import cors from 'cors';
import { Configuration, OpenAIApi } from 'openai';
import session from 'express-session';
import { get_hotel_list, get_booking_price, get_country_code, extract_tags, filter_by_tags, updateUserData, resetGlobalVariables } from './functions.js';
import { createClient } from 'redis';
import RedisStore from "connect-redis"

dotenv.config();

// Create an instance of the OpenAI API
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

//import geocoding key
const apiKey = process.env.API_NINJA_KEY;

// Create an instance of express
const app = express();

// Add middleware
app.use(express.json());
app.use(cors({
  origin: 'http://ec2-44-203-135-172.compute-1.amazonaws.com:5173', // specify the origin
  credentials: true // this allows the session cookie to be sent back and forth
}));
const history = [];


//console logs route
// Array to store console logs
const consoleLogs = [];

// Flag to keep track of whether console.log has been overridden
let consoleLogOverridden = false;

// Middleware to log console output
const consoleLogMiddleware = (req, res, next) => {
  // Only modify console.log if it has not been overridden before
  if (!consoleLogOverridden) {
    const originalConsoleLog = console.log;

    console.log = (...args) => {
      const log = args.map((arg) => JSON.stringify(arg)).join(' ');
      consoleLogs.push(log);
      originalConsoleLog.apply(console, args);
    };

    // Set the flag indicating that console.log has been overridden
    consoleLogOverridden = true;
  }

  next();
};

app.use(consoleLogMiddleware);
//app.use(allowCrossOriginMiddleware);

// Route to get console logs
app.get('/console-logs', (req, res) => {
  res.json(consoleLogs);
});

//Session creation
//connect to DB 
const client = createClient({
  host: '127.0.0.1',
  port: '6379'
});

client.connect();

client.on('ready', function () {
  console.log('Redis client ready');
  // Use the client here
});

client.on('connect', function () {
  console.log('Connected to Redis...');
});

client.on('error', function (err) {
  console.log('Redis error: ' + err);
});

app.use(
  session({
    store: new RedisStore({ client: client }),
    secret: '88K10g8flw1y7KcrN6KnXkxKflNekxjf',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 600000 },
  }),
);

app.use((req, res, next) => {
  if (!req.session.userData) {
    console.log(req.session.userData);
    req.session.userData = {
      city: null,
      country: null,
      checkin: null,
      checkout: null,
      hotelIds: null,
      hotelStars: null,
      hotelServices: null
    };
    console.log("userData created");
  }
  if (!req.session.hotelData) {
    req.session.hotelData = {
      id: null,
      name: null,
      tags: null,
      pricingData: null
    };
    console.log("hotelData created");
  }
  next();
});

//declare global variables
let globalVariables = {
  starsFilterApplied: false,
  pricingFetched: false,
  servicesFilterApplied: false,
  hotelDataFetched: false,
  numElements: 0
}

app.get('/regenerate-session', (req, res) => {
  req.session.regenerate((err) => {
    if (err) {
      console.log('Error regenerating session: ', err);
      res.status(500).send('Error regenerating session');
    } else {
      req.session.userData = {
        city: null,
        country: null,
        checkin: null,
        checkout: null,
        hotelIds: null,
        hotelStars: null,
        hotelServices: null
      }
      req.session.hotelData = {
        id: null,
        name: null,
        tags: null,
        pricingData: null
      }
      resetGlobalVariables(globalVariables);
      console.log('session regenerated');
      res.status(200).send('Session regenerated successfully');
    }
  });
});

// Create a route
app.get('/', async (req, res) => {
  res.status(200).send({
    message: 'Hello from Nuitee travel assistant !',
  });
});



app.post('/', async (req, res) => {
  try {
    const prompt = req.body.prompt;
    const conversation = { prompt, response: null };
    history.push(conversation);
    const historyString = history.map(item => `User: ${item.prompt}\nAssistant: ${item.response}\n`).join("\n");
    var response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo-0613',
      messages: [
        { role: "system", content: `You must act as a data parser. Extract any useful data from ${prompt} and assign to the correct parameter in the function get_user_data. Data to look for : City name, dates, hotel stars, hotel services. If no relevant data is found, Answer the user as a helpful travel assistant` },
        { role: "user", content: `${prompt}` }
      ],
      functions: [
        {
          name: 'get_user_data',
          description: 'Extract data from the user and parse it according to the properties. Any date should be formatted in YYYY-MM-DD format.',
          parameters: {
            type: 'object',
            properties: {
              cityName: {
                type: 'string',
                description: 'The user will provide a city name. Please correct it to the closest match if it has a spelling mistake'
              },
              hotelStars: {
                type: 'number',
                description: 'The number of stars the user would like the hotels to have. Usually between 3 and 5'
              },
              hotelServices: {
                type: 'array',
                description: 'The services that the user wants the hotel to have',
                items: {
                  type: 'string'
                }
              },
              checkin: {
                type: 'string',
                description: 'checkin date, provided by the user. The format should be : YYYY-MM-DD'
              },
              checkout: {
                type: 'string',
                description: 'checkout date, provided by the user. The format should be : YYYY-MM-DD'
              },
            },
          },
        }
      ],
      function_call: 'auto',
      temperature: 0.1,
      max_tokens: 3000,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0,
    });
    history[history.length - 1].response = response.data.choices[0].message.content;  //Append conversation to chat history - Building context

    // Check  if function was called
    let messageContent = response.data.choices[0].message;
    if (messageContent.hasOwnProperty('function_call')) {
      const function_name = messageContent.function_call.name;
      console.log(function_name);
      //check for data
      const args = JSON.parse(messageContent.function_call.arguments);
      console.log(args);
      updateUserData(req, args);
      console.log(req.session.userData);
      //Get country code if cityname is available
      console.log("parsing data and executing API requests")
      //Execute functions to gather data
      //Gather hotel data
      if (req.session.hotelData) globalVariables.numElements = req.session.hotelData.length;
      if (req.session.userData.city && !globalVariables.hotelDataFetched) {
        console.log("get countryCode");
        const data = await get_country_code(req.session.userData.city, apiKey);
        req.session.userData.country = data[0].country;
        const function_responsePromise = get_hotel_list(req.session.userData.country, req.session.userData.city);
        const function_response = await function_responsePromise;
        req.session.hotelData = function_response.data.map(item => {
          const tags = extract_tags(item.hotelDescription);
          return {
            id: item.id,
            name: item.name,
            tags: tags,
            stars: item.stars
          }
        })
        req.session.userData.hotelIds = req.session.hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        globalVariables.hotelDataFetched = true;
        globalVariables.numElements = req.session.hotelData.length;
        console.log(`Hotel data fetched. Number of elements: ${globalVariables.numElements}`);
      };
      if (req.session.userData.hotelStars && globalVariables.hotelDataFetched && !globalVariables.starsFilterApplied) {
        //console.log(hotelStars);
        req.session.userData.hotelStars = Number(req.session.userData.hotelStars);
        req.session.hotelData = req.session.hotelData.filter(hotel => hotel.stars === req.session.userData.hotelStars);
        req.session.userData.hotelIds = req.session.hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        globalVariables.numElements = req.session.hotelData.length;
        globalVariables.starsFilterApplied = true;
        console.log(`Hotel data filtered by stars. Number of elements: ${globalVariables.numElements}`);
      }
      if (req.session.userData.hotelServices && globalVariables.hotelDataFetched && !globalVariables.servicesFilterApplied) {
        req.session.hotelData = await filter_by_tags(req.session.hotelData, req.session.userData.hotelServices);
        req.session.userData.hotelIds = req.session.hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        globalVariables.numElements = req.session.hotelData.length;
        globalVariables.servicesFilterApplied = true;
        console.log(`Hotel Data filtered by services. Number of elements: ${globalVariables.numElements}`);
      }
      if (req.session.userData.hotelIds && req.session.userData.checkin && req.session.userData.checkout && !globalVariables.pricingFetched && globalVariables.numElements < 50) {
        try {
          const function_response = await get_booking_price(req.session.userData.hotelIds, req.session.userData.checkin, req.session.userData.checkout);
          req.session.hotelData.pricingData = function_response.data;
          globalVariables.pricingFetched = true;
          console.log("Pricing fetched")
        } catch (error) {
          if (error.message === "Suppliers not found") {
            console.log("Pricing not available");
          }
        }
      }

      if (globalVariables.numElements < 50 && !req.session.userData.checkin) {
        console.log("hotelData available, bot to ask for checkin and checkout dates");
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo-0613',
          messages: [
            {
              role: 'system',
              content: `As a travel assistant, your role includes processing and displaying hotel data. The user's travel details can be found in ${JSON.stringify(req.session.userData)}, and the current hotel data is in ${JSON.stringify(req.session.hotelData)}.`
            },
            {
              role: 'user',
              content: `Can you help me manage my current travel details? Here's the information I have: ${JSON.stringify(req.session.userData)}.`
            },
            {
              role: 'system',
              content: `Of course, I can help with that. Let's start by checking if we have all the necessary information.`
            },
            {
              role: 'user',
              content: `Please verify my check-in and check-out dates and inquire about any other missing details. Here's the conversation history for context: ${historyString}.`
            },
          ],
          temperature: 0.2,
          top_p: 0.9,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      if (globalVariables.numElements < 50 && globalVariables.pricingFetched) {
        console.log("Hotel Data and pricing available, bot to present current data to user");
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo-0613',
          messages: [
            {
              role: 'system',
              content: `As a travel assistant, your role includes processing and displaying hotel data. The user's travel details can be found in ${JSON.stringify(req.session.userData)}, and the current hotel and pricing data is in ${JSON.stringify(req.session.hotelData)}.`
            },
            {
              role: 'user',
              content: `Can you help me manage my current travel details? Here's the information I have: ${JSON.stringify(req.session.userData)}.`
            },
            {
              role: 'system',
              content: `Of course, I can help with that. Let's start by checking if we have all the necessary information.`
            },
            {
              role: 'user',
              content: `Please verify my check-in and check-out dates and inquire about any other missing details. Here's the conversation history for context: ${historyString}.`
            },
          ],
          temperature: 0.2,
          top_p: 0.9,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      if (globalVariables.numElements < 50 && !req.session.hotelData.pricingData && req.session.userData.checkin) {
        console.log("All data available besides pricing. Bot to apologize to user and present current data");
        let firstFiveHotels = req.session.hotelData.slice(0, 5);
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo-0613',
          messages: [
            {
              role: 'system',
              content: `As a travel assistant, I apologize for the unavailability of the pricing data. However, I can still provide information about the first few hotels. Here are details of the first few hotels: ${JSON.stringify(firstFiveHotels)}.`
            },
            {
              role: 'user',
              content: `Can you summarize the information about these five hotels and apologize about the lack of pricing data?`
            },
          ],
          temperature: 0.2,
          top_p: 0.9,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      if (!req.session.userData.city) {
        console.log("No destination provided, bot to ask for city in order to build dataset");
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo-0613',
          messages: [
            {
              role: 'system',
              content: `As a travel assistant, I can't assist you unless you provide the city name`
            },
            {
              role: 'user',
              content: `Can you ask me where I want to go`
            },
          ],
          temperature: 0.2,
          top_p: 0.9,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      if (globalVariables.numElements > 50) {
        console.log("hotel data set still large, filtering by stars and services");
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo-0613',
          messages: [
            {
              role: 'system',
              content: `As a travel assistant, your role is to provide detailed information on hotel preferences. Please inquire about the star rating and services required to tailor the hotel search accordingly.`
            },
            {
              role: 'user',
              content: `This is my current travel information: ${JSON.stringify(req.session.userData)}. Please ask me more about my hotel preferences, such as star rating and services, to better refine your search. Refer to the following conversation history for context: ${historyString}.`
            },
          ],
          temperature: 0.3,
          //max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      //if (req.session.hotelData) console.log(Object.keys(req.session.hotelData).length);
      if (globalVariables.starsFilterApplied) console.log(`Stars filter applied: ${globalVariables.starsFilterApplied}`);
      if (globalVariables.servicesFilterApplied) console.log(`Services filter applied: ${globalVariables.servicesFilterApplied}`);
      if (globalVariables.pricingFetched) console.log(`Pricing fetched: ${globalVariables.pricingFetched}`);
      if (globalVariables.hotelDataFetched) console.log(`Hotel Data Fetched: ${globalVariables.hotelDataFetched}`);
    }
    console.log(req.session.userData);
    res.status(200).send({
      message: response.data.choices[0].message.content
    });
  } catch (error) {
    res.status(500).send(error || 'Something went wrong');
    console.log(error);
    if (error.response) {
      console.error('Error status:', error.response.status);
      console.error('Error details:', error.response.data);
    } else if (error.request) {
      console.error('The request was made but no response was received');
      console.error('Request:', error.request);
    } else {
      console.error('Something happened in setting up the request and triggered an Error:', error.message);
    }
  }

});
// Start the server
app.listen(process.env.PORT, '0.0.0.0', () => {
  console.log(`Server running on port ec2-44-203-135-172.compute-1.amazonaws.com:${process.env.PORT}`);
});