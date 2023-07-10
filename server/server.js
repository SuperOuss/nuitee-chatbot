import * as dotenv from 'dotenv';
import cors from 'cors';
import { Configuration, OpenAIApi } from 'openai';
import session from 'express-session';
import { get_hotel_list, get_booking_price, get_country_code, extract_tags, filter_by_tags, updateUserData } from './functions.js';
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
  origin: 'http://localhost:5173', // specify the origin
  credentials: true // this allows the session cookie to be sent back and forth
}));
const history = [];
const userData = {
  city: null,
  country: null,
  checkin: null,
  checkout: null,
  hotelIds: null,
  hotelStars: null,
  hotelServices: null
};

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

await client.connect();

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
      tags: null
    };
    console.log("hotelData created");
  }
  next();
});

app.get('/initialize-session', (req, res) => {
  req.session.regenerate((err) => {
    if (err) {
      console.log('Error saving session: ', err);
      res.status(500).send('Error initializing session');
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
        tags: null
      }
      console.log('session initialized');
      res.status(200).send('Session initialized successfully');
    }
  });
});

// Create a route
app.get('/', async (req, res) => {
  res.status(200).send({
    message: 'Hello from Nuitee travel assistant !',
  });
});

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

    // Check  if function was called
    let messageContent = response.data.choices[0].message;
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
      updateUserData(req, userData);
      //Get country code if cityname is available
      console.log("parsing data and executing API requests")
      //Execute functions to gather data
      //Gather hotel data
      if (req.session.hotelData) numElements = req.session.hotelData.length;
      if (cityName && !hotelDataFetched) {
        console.log("get countryCode");
        const data = await get_country_code(cityName, apiKey);
        countryCode = data[0].country;
        req.session.userData.country = countryCode;
        const function_responsePromise = get_hotel_list(countryCode, cityName);
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
        hotelDataFetched = true;
        numElements = req.session.hotelData.length;
        console.log(`Hotel data fetched. Number of elements: ${numElements}`);
      };
      if (req.session.userData.hotelStars && req.session.hotelData && !starsFilterApplied) {
        //console.log(hotelStars);
        hotelStars = Number(hotelStars);
        req.session.hotelData = req.session.hotelData.filter(hotel => hotel.stars === hotelStars);
        req.session.userData.hotelIds = req.session.hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        numElements = req.session.hotelData.length;
        starsFilterApplied = true;
        console.log(`Hotel data filtered by stars. Number of elements: ${numElements}`);
      }
      if (req.session.userData.hotelServices && req.session.hotelData && !servicesFilterApplied) {
        req.session.hotelData = await filter_by_tags(req.session.hotelData, hotelServices);
        req.session.userData.hotelIds = req.session.hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        numElements = req.session.hotelData.length;
        servicesFilterApplied = true;
        console.log(`Hotel Data filtered by services. Number of elements: ${numElements}`);
      }
      if (req.session.userData.hotelIds && req.session.userData.checkin && req.session.userData.checkout && !pricingFetched && numElements < 50) {
        const function_response = await get_booking_price(req.session.userData.hotelIds, req.session.userData.checkin, req.session.userData.checkout);
        req.session.hotelData.priceData = function_response.data;
        pricingFetched = true;
        console.log("Pricing fetched")
      }
      if (numElements < 50) {
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo-0613',
          messages: [
            {
              role: 'system',
              content: `As a travel assistant, your role includes processing and displaying hotel data. The user's travel details can be found in ${JSON.stringify(req.session.userData)}, and the current hotel and pricing data is in ${JSON.stringify(req.session.hotelData)}. When priceData is filled, you can Present the hotel data in an organized table format.`
            },
            {
              role: 'user',
              content: `As a travel assistant, assist me with my travel planning. Utilize the data in ${JSON.stringify(req.session.userData)} to manage my current travel details and naturally inquire about any missing information (excluding 'hotelIds' which is auto-populated). Always engage in a natural conversation to obtain any missing details like the checkin and chekout dates. Refer to the following conversation history for context: ${historyString}.`
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
      if (starsFilterApplied) console.log(`Stars filter applied: ${starsFilterApplied}`);
      if (servicesFilterApplied) console.log(`Services filter applied: ${servicesFilterApplied}`);
      if (pricingFetched) console.log(`Pricing fetched: ${pricingFetched}`);
      if (req.session.hotelDataFetched) console.log(`Hotel Data Fetched: ${req.session.hotelDataFetched}`);
    }
    console.log(req.session.userData);
    //console.log(req.session.hotelData);
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