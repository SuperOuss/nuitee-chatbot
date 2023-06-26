import * as dotenv from 'dotenv';
import express, { json } from 'express';
import cors from 'cors';
import { Configuration, OpenAIApi } from 'openai';
import api from 'api';

import { get_hotel_list, get_booking_price, get_country_code } from './functions.js';


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

//import nuitee API
//const sdk = api('@nuitee-lite-api/v1.0.5#oa30lhz0i0g3');

// Add middleware
app.use(express.json());
app.use(cors());

// Create a route
app.get('/', async (req, res) => {
  res.status(200).send({
    message: 'Hello from Nuitee travel assistant !',
  });
});

let userData = {
  city: null,
  country: null,
  checkin: null,
  checkout: null,
  hotelIds: null,
};
let hotelData;

const history = [];
app.post('/', async (req, res) => {
  try {
    const prompt = req.body.prompt;
    const conversation = { prompt, response: null };
    history.push(conversation);

    const historyString = history.map(item => `User: ${item.prompt}\nAssistant: ${item.response}\n`).join("\n");

    const message = `${prompt} ${historyString}`;

    //Build user data profile
    if (
      userData.city === null &&
      userData.country === null &&
      userData.checkin === null &&
      userData.checkout === null &&
      userData.hotelIds === null
    )
     {
      var response = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo-0613',
        messages: [
          { role: "system", content: `You must extract the country code if a city is mentionned in ${message}. Pass both the cityName and countryCode to the function get_hotel_list` },
          { role: "system", content: `You should act as a helpful travel agent. You must generate a country code matching the city provided by the user. Use function to get a list of hotels. Please include ${historyString} as a context` },
          { role: "user", content: `${message}` }

        ],
        functions: [
          {
            name: 'get_hotel_list',
            description: 'Fetches a list of hotels for a given city and a country code. The city comes from the user and the country code can be inferred from the city',
            parameters: {
              type: 'object',
              properties: {
                cityName: {
                  type: 'string',
                  description: 'The user will provide a city name. Please infer the country code from the city name'
                },
                countryCode: {
                  type: 'string',
                  description: 'The country the user wants to travel to, must be inferred from the city name'
                }
              },
              required: ['cityName', 'countryCode'],
            }
          },
        ],
        function_call: 'auto',
        temperature: 0.5,
        max_tokens: 3000,
        top_p: 1,
        frequency_penalty: 0.5,
        presence_penalty: 0,
      });

    //Get booking prices for the specific user profile

    }
    else {
      var response = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo-0613',
        messages: [
          { role: "system", content: `If there are any dates in ${message} You must convert them to the following format YYYY-MM-DD before passing them as checkin and checkout dates to the function get_booking_price` },
          { role: "system", content: `The assistant should act as a helpful travel agent. We already have a list of hotels stored in ${userData}. The assistant can use the hotelIds and get the checkin and checkout dates from the user. The format for the date to pass on to the function must be YYYY-MM-DD.` },
          { role: "user", content: `${message}` }
        ],
        functions: [
          {
            name: 'get_booking_price',
            description: 'Get the booking price for a specific checkin date, checkout date, and hotelids',
            parameters: {
              type: 'object',
              properties: {
                hotelIds: {
                  type: 'string',
                  description: 'The list of hotel ids for which we can get a booking. Can be extracted from the variable `{$userData.hotelIds}`'
                },
                checkin: {
                  type: 'string',
                  description: 'checkin date, provided by the user. The format should be : YYYY-MM-DD'
                },
                checkout: {
                  type: 'string',
                  description: 'checkout date, provided by the user. The format should be : YYYY-MM-DD'
                }
              },
              required: ['hotelIds', 'checkin', 'checkout'],
            }
          }
        ],
        function_call: 'auto',
        temperature: 0.5,
        max_tokens: 3000,
        top_p: 1,
        frequency_penalty: 0.5,
        presence_penalty: 0,
      });
    }

    history[history.length - 1].response = response.data.choices[0].message.content;  //Append conversation to chat history - Building context

    // Check if function was called
    let messageContent = response.data.choices[0].message;
    if (messageContent.hasOwnProperty('function_call')) {
      const function_name = messageContent.function_call.name;
      console.log(function_name);
      // Access the arguments
      const args = JSON.parse(messageContent.function_call.arguments);
      const cityName = args.cityName;
      let countryCode;
      const checkin = args.checkin;
      const checkout = args.checkout;

      async function getCountryCodeAndUpdate(args, apiKey, cityName) {
        if (args.countryCode) {
          countryCode = args.countryCode;
        } else {
          try {
            const data = await get_country_code(cityName, apiKey);
            countryCode = data[0].country;
          } catch (error) {
            console.error('Request failed:', error);
          }
        }
        return countryCode;
      }


      // Call the function
      countryCode = await getCountryCodeAndUpdate(args, apiKey, cityName);
      if (function_name === 'get_hotel_list') {
        const function_responsePromise = get_hotel_list(countryCode, cityName);
        const function_response = await function_responsePromise;
        console.log(function_response);
        hotelData = function_response.data.map(item => ({
          id: item.id,
          name: item.name,
          description: item.hotelDescription,
          stars: item.stars
        }),
        );
        if (cityName) userData.city = cityName;
        if (countryCode) userData.country = countryCode;

        // Add the hotelData to userData
        //userData.hotelData = hotelData;
        userData.hotelIds = hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        console.log(hotelData);

        // Call OpenAI API again to format the function result
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: `You are a helpful travel assistant. Here are the hotels available in the city specified by the user: ${JSON.stringify(hotelData)}. Please provide a summarized version to the user. Also, please ask follow up questions about checkin and checkout dates` },
            { role: 'user', content: `Provide me with a summary of the available hotels. Be concise if possible and ask me about my checkin and checkout dates` }
          ],
          temperature: 0.5,
          max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }


      if (function_name === 'get_booking_price') {
        const function_response = await get_booking_price(userData.hotelIds, checkin, checkout);
        if (checkin) userData.checkin = checkin;
        if (checkout) userData.checkout = checkout;

        // Add the priceData to userData
        hotelData.priceData = function_response.data;
        console.log(function_response.data);
        console.log(hotelData);
        // Call OpenAI API again to format the function result
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: `You are a helpful travel assistant. Here are the booking prices for the selected hotels and dates: ${JSON.stringify(function_response)}. Please provide a summarized version to the user and match the names of the hotels with the ids from se the hotel names from ${JSON.stringify(hotelData)}` },
            { role: 'user', content: `Provide me with a correctly formatted summary of the booking prices with the names of the hotels, and ask me follow up questions about which hotel I want to book` }
          ],
          temperature: 0.5,
          max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
    }

    res.status(200).send({
      message: response.data.choices[0].message.content
    });
  } catch (error) {
    res.status(500).send(error || 'Something went wrong');
    console.log(error);
  }
});
// Start the server
app.listen(process.env.PORT, () => {
  console.log(`Server running on port http://localhost:${process.env.PORT}`);
});