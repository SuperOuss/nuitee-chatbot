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
    hotelStars: null,
    hotelServices: null,
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

    //const message = `${prompt} ${historyString}`;

    //Gather data

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
          },
          required: ['dataFound']
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
    console.log(messageContent);
    if (messageContent.hasOwnProperty('function_call')) {
      const function_name = messageContent.function_call.name;
      console.log(function_name);
      //check for data
      const args = JSON.parse(messageContent.function_call.arguments);
      let cityName, checkin, checkout, hotelStars, countryCode, hotelServices, starsFilterApplied, pricingFetched, servicesFilterApplied, hotelDataFetched, numElements;
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
      if (cityName && !hotelDataFetched) {
        console.log("get countryCode");
        const data = await get_country_code(cityName, apiKey);
        countryCode = data[0].country;
        userData.country = countryCode;
        const function_responsePromise = get_hotel_list(countryCode, cityName);
        const function_response = await function_responsePromise;
        console.log("hotelData fetched");
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
      if (hotelStars && hotelData && !starsFilterApplied) {
        console.log(hotelStars);
        hotelStars = Number(hotelStars);
        hotelData = hotelData.filter(hotel => hotel.stars === hotelStars);
        userData.hotelIds = hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        numElements = hotelData.length;
        starsFilterApplied = true;
        console.log(`HotelData filtered by stars. Number of elements: ${numElements}`);
      }
      if (hotelServices && hotelData && !servicesFilterApplied) {
        hotelData = await filter_by_tags(hotelData, hotelServices);
        userData.hotelIds = hotelData.map(hotel => encodeURIComponent(hotel.id)).join('%2C');
        numElements = Object.keys(hotelData).length;
        servicesFilterApplied = true;
        console.log(`hotelData filtered by services. Number of elements: ${numElements}`);
      }
      if (hotelData && userData.hotelIds && checkin && checkout && !pricingFetched && numElements <= 50) {
        const function_response = await get_booking_price(userData.hotelIds, checkin, checkout);
        hotelData.priceData = function_response.data;
        pricingFetched = true;
        console.log("Pricing fetched")
      }
      if (numElements <= 50) {
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: `You are a helpful travel assistant. Your goal is to help the user book a hotel. The information about the user stay are in  ${JSON.stringify(userData)} and the current hotel and pricing information is in ${JSON.stringify(hotelData)} Please display hotel data in a table in an ordered manner. ` },
            { role: 'user', content: `As a travel assistant, help me plan my future travels. Use ${historyString} for our conversation history and use ${JSON.stringify(userData)} to keep track of my current travel information and ask me for missing data in a natural manner (except for hotelIds as it's filled automatically. Always follow up with a question about missing data in natural manner` },
          ],
          temperature: 0.5,
          //max_tokens: 3000,
          top_p: 1,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        });
      }
      if (numElements >= 50) {
        response = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: `You are a helpful travel assistant. Your goal is to help the user book a hotel. The information about the user stay are in  ${JSON.stringify(userData)} and there's no filtered hotel data. Please ask the user to refine his hotel search by asking for number of stars and services. ` },
            { role: 'user', content: `As a travel assistant, help me plan my future travels. Use ${historyString} for our conversation history and ${JSON.stringify(userData)} and use ${JSON.stringify(userData)} to ask me for missing data in a natural manner (except for hotelIds as it's filled automatically. Always follow up with a question about missing data in natural manner` },
          ],
          temperature: 0.5,
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
    console.log(response.data.choices[0].message);
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