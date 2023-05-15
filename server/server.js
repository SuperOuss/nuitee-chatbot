import * as dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { Configuration, OpenAIApi } from 'openai';
import api from 'api';


dotenv.config();

// Create an instance of the OpenAI API
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Create an instance of express
const app = express();

//import nuitee API
const sdk = api('@nuitee-lite-api/v1.0.5#3uimz26tlgz0i8ks');

// Add middleware
app.use(express.json());
app.use(cors());

// Create a route
app.get('/', async (req, res) => {
  res.status(200).send({
    message: 'Hello from Nuitee travel assistant !',
  });
});

// Make a request to the OpenAI API that includes a history of the chat

const history = [];
let historyString = null;
let contentObject = {};

app.post('/', async (req, res) => {
  try {
    const prompt = req.body.prompt;
    const message = prompt + historyString;
    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {"role": "system", "content": "You should act as a helpful travel agent, helping users organize their holidays"},
        {"role": "user", "content": `${message}`}
    ],
      temperature: 0.5,
      max_tokens: 3000,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0,
    });
    const conversation = { prompt, response: response.data.choices[0].message.content};
    history.push(conversation);
    historyString = JSON.stringify(history);

    //Parse the city name and country code in an array
    const city = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {"role": "assistant", "content": `Extract information from the following structured text ${historyString}, if you detect a city name, answer only with two strings: the country code and the name of the city as key value pairs. 
        Else, answer only with "no city detected" . Your answer can only be "no city detected" or two strings as key value pairs, one for city and one for the country code, nothing else.`}
    ],
      temperature: 0.1,
      max_tokens: 3000,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0,
    });
    console.log(city.data.choices[0].message.content);
    contentObject = JSON.parse(city.data.choices[0].message.content);
    console.log(contentObject);
    console.log(typeof contentObject);
    const cityName = contentObject['city'];
    const countryCode = contentObject['country_code'];
    if (typeof contentObject === "object" && contentObject !== null) {
      const cityName = contentObject['city'];
      const countryCode = contentObject['country_code'];
      console.log(cityName);
      console.log(countryCode);
  } else {
    console.log("no data in the object");
  }

    if (typeof cityName !== 'undefined') {
      sdk.auth('sand_7f68e450-147f-430f-924e-976f9ef222ef');
      sdk.getDataHotels({countryCode: countryCode, cityName: cityName, limit:'2'})
        .then(({ data }) => console.log(data))
        .catch(err => console.error(err));;
    } else {
      console.log("No data to fetch for hotels");
    }
    console.log(contentObject); 
    res.status(200).send({
      message: response.data.choices[0].message.content,
      city: city.data.choices[0].message.content
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