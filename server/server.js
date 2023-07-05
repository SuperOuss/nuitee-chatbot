import * as dotenv from 'dotenv';
import express, { json } from 'express';
import cors from 'cors';
import { Configuration, OpenAIApi } from 'openai';
import session from 'express-session';
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

let userState;
let userData;
const history = [];

//Session creation
if (!userData) {
  userData = {
    city: null,
    country: null,
    checkin: null,
    checkout: null,
    hotelIds: null,
  };
}




app.post('/clear-session', (req, res) => {
  userData = {
    city: null,
    country: null,
    checkin: null,
    checkout: null,
    hotelIds: null
  };
  userState = null;
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

app.post('/', async (req, res) => {
  try {
    const prompt = req.body.prompt;
    const conversation = { prompt, response: null };
    history.push(conversation);

    const historyString = history.map(item => `User: ${item.prompt}\nAssistant: ${item.response}\n`).join("\n");

    const message = `${prompt} ${historyString}`;

    //Assess user state

    var response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo-0613',
      messages: [
        { role: "system", content: `You must act as a helpful travel agent. Extract any useful data from ${message} and select a state from the function get_user_data. Data to look for : City name, hotels names, dates` },
        { role: "system", content: `Please check ${JSON.stringify(userData)} for previously collected data` },
        { role: "user", content: `${message}` }
      ],
      functions: [
        {
          name: 'get_user_data',
          description: 'Extract data from the user to help him book a hotel with the travel agent. Any date should be formatted in YYYY-MM-DD format.',
          parameters: {
            type: 'object',
            properties: {
              userState: {
                type: "string",
                enum: ["noData", "citySelected", "hotelStarsSelected", "hotelServicesSelected", "datesEntered"],
                description: "noData means that no data was in the user message, citySelected means that the user selected a city, hotelStarsSelected means the user selected how many stars he wants for the hotel, hotelServicesSelected means the user has specified some of the services he wants in the hotel, datesEntered means the user has provided a checkin and checkout date"
              },
              cityName: {
                type: 'string',
                description: 'The user will provide a city name. Please infer the country code from the city name'
              },
              hotelStars: {
                type: 'string',
                description: 'The number of stars the user would like the hotels to have'
              },
              hotelServices: {
                type: 'array',
                description: 'The services that the user wants the hotel to have',
                items: {
                  type: 'string' // Specify the type of items in the array (e.g., string, object, etc.)
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
            required: ['userState'],
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

    // Check if function was called
    let messageContent = response.data.choices[0].message;
    if (messageContent.hasOwnProperty('function_call')) {
      const function_name = messageContent.function_call.name;
      console.log(function_name);
      //check for data
      const args = JSON.parse(messageContent.function_call.arguments);
      userState = args.userState;
      let cityName, checkin, checkout, hotelStars, countryCode, hotelServices;
      //checking and assigning data
      if (args.cityName) cityName = args.cityName;
      if (args.hotelStars) hotelStars = args.hotelStars;
      if (args.checkin) checkin = args.checkin;
      if (args.checkout) checkout = args.checkout;
      if (args.hotelStars) hotelStars = args.hotelStars;
      if (args.hotelServices) hotelServices = args.hotelServices;
      console.log(hotelServices);
      //Get country code if cityname is available
      if (cityName && countryCode == null) {
        const data = await get_country_code(cityName, apiKey);
        countryCode = data[0].country;
      }
      if (userState === 'noData') {
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: `You are a helpful travel assistant. The user hasn't provided any city to travel to.` },
            { role: 'user', content: `Ask me which city I want to travel to` }
          ],
          temperature: 0.5,
          //max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      else if (userState === 'citySelected') {
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
        if (cityName) userData.city = cityName;
        if (countryCode) userData.country = countryCode;
        console.log(hotelData);
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: `You are a helpful travel assistant. Here's the data on all the hotels ${JSON.stringify(hotelData)}. Please help the user define criteria for the hotels he's looking for. Number of stars and specific tags from the hotel description apply` },
            { role: 'user', content: `Ask me questions until we shortlist 3 hotels` }
          ],
          temperature: 0.5,
          //max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      else if (userState === 'hotelStarsSelected') {
        console.log(hotelStars);
        hotelStars = Number(hotelStars);
        hotelData = hotelData.filter(hotel => hotel.stars === hotelStars);
        const numElements = Object.keys(hotelData).length;
        console.log(`Number of elements: ${numElements}`);
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: `You are a helpful travel assistant. Here's the filtered hotel Data by stars ${JSON.stringify(hotelData)}. Please help the user define criteria for the hotels he's looking for. Ask for specific tags from the hotel description apply` },
            { role: 'user', content: `Ask me if I have any specific services in mind for the hotel I wish to be in` }
          ],
          temperature: 0.5,
          //max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      else if (userState === 'hotelServicesSelected') {
        hotelData = await filter_by_tags(hotelData, hotelServices);
        userData.hotelIds = hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        const numElements = Object.keys(hotelData).length;
        console.log(`Number of elements: ${numElements}`);
        console.log(hotelData);
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: `You are a helpful travel assistant. Here's the filtered hotel Data by stars and services ${JSON.stringify(hotelData)}. Please the user complete his booking by asking for his checkin and checkout dates` },
            { role: 'user', content: `Tell me how many hotels are available in ${JSON.stringify(hotelData)} then Ask me for my checkin and checkout dates` }
          ],
          temperature: 0.5,
          //max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      else if (userState === 'datesEntered') {
        if (checkin) userData.checkin = checkin;
        if (checkout) userData.checkout = checkout;
        const function_response = await get_booking_price(userData.hotelIds, checkin, checkout);
        hotelData.priceData = function_response.data;
        console.log(hotelData);
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: `You are a helpful travel assistant. Here are the booking prices for the selected hotels and dates: ${JSON.stringify(function_response)}. Please provide a summarized version to the user and match the names of the hotels with the ids from se the hotel names from ${JSON.stringify(hotelData)}` },
            { role: 'user', content: `Provide me with a correctly formatted summary of the booking prices with the names of the hotels, and ask me follow up questions about which hotel I want to book` }
          ],
          temperature: 0.5,
          //max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
    }
    console.log(userData);
    console.log(userState);

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
app.listen(process.env.PORT, () => {
  console.log(`Server running on port http://localhost:${process.env.PORT}`);
});