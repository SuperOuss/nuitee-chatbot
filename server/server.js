import * as dotenv from 'dotenv';
import express, { json } from 'express';
import cors from 'cors';
import { Configuration, OpenAIApi } from 'openai';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { get_hotel_list, get_booking_price, get_country_code, extract_tags, filter_by_tags } from './functions.js';

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
app.use(cors());

let userData;
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


// Middleware to allow cross-origin requests
const allowCrossOriginMiddleware = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
};

app.use(consoleLogMiddleware);
app.use(allowCrossOriginMiddleware);

// Route to get console logs
app.get('/console-logs', (req, res) => {
  res.json(consoleLogs);
});





//Session creation
app.use(cookieParser());
app.use(session({
  secret: '88K10g8flw1y7KcrN6KnXkxKflNekxjf',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, maxAge: 60000 }
}));
app.post('/clear-session', (req, res) => {
  userData = {
    city: null,
    country: null,
    checkin: null,
    checkout: null,
    hotelIds: null,
    hotelStars: null,
    hotelServices:null

  };
  console.log('userData reset');
  res.send();
});

// Create a route
app.get('/', async (req, res) => {
  res.status(200).send({
    message: 'Hello from Nuitee travel assistant !',
  });
});

let hotelData;
let cityName, checkin, checkout, hotelStars, countryCode, hotelServices, starsFilterApplied, pricingFetched, servicesFilterApplied, hotelDataFetched, numElements;

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
    console.log("request Sent");

    // Check  if function was called
    let messageContent = response.data.choices[0].message;
    console.log(messageContent);
    if (messageContent.hasOwnProperty('function_call')) {
      const function_name = messageContent.function_call.name;
      console.log(function_name);
      //check for data
      const args = JSON.parse(messageContent.function_call.arguments);
      console.log(args);
      if (args.cityName) cityName = args.cityName;
      if (args.hotelStars) hotelStars = args.hotelStars;
      if (args.checkin) checkin = args.checkin;
      if (args.checkout) checkout = args.checkout;
      if (args.hotelStars) hotelStars = args.hotelStars;
      if (args.hotelServices) hotelServices = args.hotelServices;
      if (cityName) userData.city = cityName;
      if (hotelStars) userData.hotelStars = hotelStars;
      if (hotelServices) userData.hotelServices = hotelServices;
      if (checkin) userData.checkin = checkin;
      if (checkout) userData.checkout = checkout;
      //Get country code if cityname is available
      console.log("parsing data and executing API requests")
      //Execute functions to gather data
      //Gather hotel data
      if (hotelData) numElements = hotelData.length;
      if (cityName && !hotelDataFetched) {
        console.log("get countryCode");
        const data = await get_country_code(cityName, apiKey);
        countryCode = data[0].country;
        userData.country = countryCode;
        const function_responsePromise = get_hotel_list(countryCode, cityName);
        const function_response = await function_responsePromise;
        hotelData = function_response.data.map(item => {
          const tags = extract_tags(item.hotelDescription);
          return {
            id: item.id,
            name: item.name,
            tags: tags,
            stars: item.stars
          }
        })
        userData.hotelIds = hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        hotelDataFetched = true;
        numElements = hotelData.length;
        console.log(`HotelData filled. Number of elements: ${numElements}`);
      };
      if (userData.hotelStars && hotelData && !starsFilterApplied) {
        console.log(hotelStars);
        hotelStars = Number(hotelStars);
        hotelData = hotelData.filter(hotel => hotel.stars === hotelStars);
        userData.hotelIds = hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        numElements = hotelData.length;
        starsFilterApplied = true;
        console.log(`HotelData filtered by stars. Number of elements: ${numElements}`);
      }
      if (userData.hotelServices && hotelData && !servicesFilterApplied) {
        hotelData = await filter_by_tags(hotelData, hotelServices);
        userData.hotelIds = hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        numElements = hotelData.length;
        servicesFilterApplied = true;
        console.log(`hotelData filtered by services. Number of elements: ${numElements}`);
      }
        if (userData.hotelIds && userData.checkin && userData.checkout && !pricingFetched && numElements < 50) {
        const function_response = await get_booking_price(userData.hotelIds, userData.checkin, userData.checkout);
        hotelData.priceData = function_response.data;
        pricingFetched = true;
        console.log("Pricing fetched")
      }
      if (numElements < 50) {
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo-0613',
          messages: [
            { 
                role: 'system', 
                content: `As a travel assistant, your role includes processing and displaying hotel data. The user's travel details can be found in ${JSON.stringify(userData)}, and the current hotel and pricing data is in ${JSON.stringify(hotelData)}. Present the hotel data in an organized table format.` 
            },
            { 
                role: 'user', 
                content: `As a travel assistant, assist me with my travel planning. Utilize the data in ${JSON.stringify(userData)} to manage my current travel details and naturally inquire about any missing information (excluding 'hotelIds' which is auto-populated). Always engage in a natural conversation to obtain any missing details. Refer to the following conversation history for context: ${historyString}.` 
            },
        ],
          temperature: 0.2,
          //max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      if (numElements > 50) {
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo-0613',
          messages: [
            {
              role: 'system',
              content: `As a travel assistant, your role is to provide detailed information on hotel preferences. Please inquire about the star rating and services required to tailor the hotel search accordingly.`
            },
            {
              role: 'user',
              content: `This is my current travel information: ${JSON.stringify(userData)}. Please ask me more about my hotel preferences, such as star rating and services, to better refine your search. Refer to the following conversation history for context: ${historyString}.`
            },
          ],
          temperature: 0.3,
          //max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      if (hotelData) console.log(Object.keys(hotelData).length);
      if (starsFilterApplied) console.log(`Stars filter applied: ${starsFilterApplied}`);
      if (servicesFilterApplied) console.log(`Services filter applied: ${servicesFilterApplied}`);
      if (pricingFetched) console.log(`Pricing fetched: ${pricingFetched}`);
      if (hotelDataFetched) console.log(`Hotel Data Fetched: ${hotelDataFetched}`);
    }
    console.log(userData);
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
  console.log(`Server running on port http://localhost:${process.env.PORT}`);
});